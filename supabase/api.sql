-- ═══════════════════════════════════════════════════════════════════════════
-- API publique Challenger IA — clés développeur, quotas et consommation.
--
-- À exécuter dans l'éditeur SQL Supabase.
--
-- Principe : une clé d'API est rattachée à un utilisateur et débite LE MÊME
-- solde de crédits que l'application. Un seul portefeuille, deux usages.
--
-- La clé en clair n'est JAMAIS stockée : seule son empreinte SHA-256 l'est.
-- Une base compromise ne permet donc pas d'usurper les clés. Le préfixe est
-- conservé en clair uniquement pour permettre à l'utilisateur de reconnaître
-- ses clés dans l'interface.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Clés d'API ────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  name          text not null default 'Clé sans nom',
  key_hash      text not null unique,   -- SHA-256 de la clé en clair
  key_prefix    text not null,          -- ex. « cia_live_a1b2c3d4 », pour l'affichage
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  -- Fenêtre de limitation de débit, propre à chaque clé
  minute_window timestamptz not null default now(),
  minute_count  int not null default 0,
  total_calls   bigint not null default 0
);

create index if not exists api_keys_user_idx on public.api_keys (user_id);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash);


-- ─── Journal de consommation ───────────────────────────────────────────────
-- Sert à la facturation, au diagnostic et à la restitution d'un historique
-- d'usage au développeur.
create table if not exists public.api_usage (
  id          bigint generated always as identity primary key,
  key_id      uuid references public.api_keys(id) on delete cascade,
  user_id     text not null,
  endpoint    text not null,
  credits     int  not null default 0,
  status      int  not null,
  created_at  timestamptz not null default now()
);

create index if not exists api_usage_user_idx on public.api_usage (user_id, created_at desc);


-- ─── Sécurité ──────────────────────────────────────────────────────────────
-- Aucun accès direct depuis le navigateur : tout passe par le serveur, qui
-- seul détient le rôle de service. Sans cela, n'importe qui pourrait lire les
-- empreintes de clés ou l'historique d'appels d'autrui.
alter table public.api_keys  enable row level security;
alter table public.api_usage enable row level security;
-- Aucune policy : refus total pour anon et authenticated.


-- ─── Consommation d'un appel d'API ─────────────────────────────────────────
-- Opération atomique : vérification de la clé, limitation de débit, débit du
-- crédit et journalisation en une seule transaction. Sans atomicité, deux
-- appels simultanés pourraient consommer le même crédit.
create or replace function public.consume_api_credits(
  p_key_hash     text,
  p_endpoint     text,
  p_cost         int,
  p_rate_per_min int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key     public.api_keys%rowtype;
  v_credits int;
begin
  select * into v_key
    from public.api_keys
   where key_hash = p_key_hash
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_key');
  end if;

  if v_key.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked_key');
  end if;

  -- Limitation de débit, par clé et par minute glissante
  if v_key.minute_window < now() - interval '1 minute' then
    update public.api_keys
       set minute_window = now(), minute_count = 1
     where id = v_key.id;
  else
    if v_key.minute_count >= p_rate_per_min then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited',
                                'retry_after', 60);
    end if;
    update public.api_keys
       set minute_count = minute_count + 1
     where id = v_key.id;
  end if;

  -- Débit du solde partagé avec l'application
  select credits into v_credits
    from public.user_credits
   where user_id = v_key.user_id
   for update;

  if v_credits is null or v_credits < p_cost then
    insert into public.api_usage (key_id, user_id, endpoint, credits, status)
    values (v_key.id, v_key.user_id, p_endpoint, 0, 402);
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits',
                              'credits', coalesce(v_credits, 0));
  end if;

  update public.user_credits
     set credits = credits - p_cost, updated_at = now()
   where user_id = v_key.user_id;

  update public.api_keys
     set last_used_at = now(), total_calls = total_calls + 1
   where id = v_key.id;

  insert into public.api_usage (key_id, user_id, endpoint, credits, status)
  values (v_key.id, v_key.user_id, p_endpoint, p_cost, 200);

  return jsonb_build_object(
    'ok', true,
    'user_id', v_key.user_id,
    'key_id', v_key.id,
    'credits_remaining', v_credits - p_cost
  );
end;
$$;

revoke execute on function public.consume_api_credits(text, text, int, int)
  from public, anon, authenticated;
grant  execute on function public.consume_api_credits(text, text, int, int)
  to service_role;
