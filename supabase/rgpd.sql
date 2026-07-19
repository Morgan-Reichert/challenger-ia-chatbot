-- ═══════════════════════════════════════════════════════════════════════════
-- Mise en conformité RGPD — à exécuter dans l'éditeur SQL Supabase.
--
--  1. Déclaration et sécurisation de la table enterprise_requests
--  2. Purge automatique des données dont la durée de conservation est échue
--
-- Écarts traités : n° 4 (durées de conservation) et n° 11 (table non déclarée).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. enterprise_requests ────────────────────────────────────────────────
-- Cette table était alimentée depuis le navigateur avec la clé anonyme, sans
-- avoir jamais été déclarée dans le schéma : elle n'avait donc aucune politique
-- de sécurité au niveau des lignes. En pratique, n'importe qui pouvait lire
-- l'ensemble des demandes commerciales reçues, adresses électroniques incluses.

create table if not exists public.enterprise_requests (
  id              bigint generated always as identity primary key,
  name            text,
  email           text,
  org             text,
  country         text,
  sector          text,
  team_size       text,
  tools           text,
  message         text,
  estimated_price text,
  created_at      timestamptz not null default now()
);

alter table public.enterprise_requests enable row level security;

-- On ne conserve QUE l'insertion publique : le formulaire doit fonctionner sans
-- compte, mais personne ne doit pouvoir relire les demandes depuis le client.
drop policy if exists enterprise_requests_insert on public.enterprise_requests;
create policy enterprise_requests_insert
  on public.enterprise_requests
  for insert
  to anon, authenticated
  with check (true);

-- Aucune politique de SELECT, UPDATE ni DELETE : la lecture est réservée au
-- rôle de service, utilisé exclusivement côté serveur.
revoke select, update, delete on public.enterprise_requests from anon, authenticated;


-- ─── 2. Purge automatique ──────────────────────────────────────────────────
-- Le règlement impose de ne pas conserver les données au-delà de ce qui est
-- nécessaire (art. 5.1.e). Aucune purge n'existait auparavant.

create or replace function public.purge_donnees_expirees()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotas   int;
  v_recomp   int;
  v_demandes int;
  v_push     int;
begin
  -- Compteurs de quota : 13 mois glissants, durée usuelle pour des traces
  -- techniques de prévention de l'abus.
  delete from public.chat_usage
   where updated_at < now() - interval '13 months';
  get diagnostics v_quotas = row_count;

  -- Récompenses quotidiennes : la trace n'a plus d'utilité au-delà d'un an.
  delete from public.daily_rewards
   where day < (current_date - interval '12 months');
  get diagnostics v_recomp = row_count;

  -- Demandes commerciales : 3 ans après le contact, durée usuelle en
  -- prospection professionnelle.
  delete from public.enterprise_requests
   where created_at < now() - interval '3 years';
  get diagnostics v_demandes = row_count;

  -- Abonnements aux notifications jamais renouvelés depuis 12 mois : le point
  -- de terminaison est très probablement caduc.
  delete from public.push_subscriptions
   where created_at < now() - interval '12 months';
  get diagnostics v_push = row_count;

  return jsonb_build_object(
    'chat_usage',          v_quotas,
    'daily_rewards',       v_recomp,
    'enterprise_requests', v_demandes,
    'push_subscriptions',  v_push,
    'executed_at',         now()
  );
end;
$$;

-- Exécution réservée au serveur.
revoke execute on function public.purge_donnees_expirees() from public, anon, authenticated;
grant  execute on function public.purge_donnees_expirees() to service_role;

-- NOTE : les données de facturation (subscriptions) ne sont volontairement PAS
-- purgées ici. Elles relèvent d'une obligation légale de conservation
-- comptable de dix ans, qui prime sur le principe de minimisation.
