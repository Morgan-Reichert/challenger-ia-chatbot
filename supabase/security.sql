-- ─────────────────────────────────────────────────────────────────────────────
-- Challenger IA — Durcissement sécurité Supabase (À EXÉCUTER dans le SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────
-- À lancer APRÈS supabase/schema.sql.
--
-- Objectif : fermer la faille où la clé anon (publique, dans le bundle client)
-- pouvait appeler add_credits / lire toutes les tables crédits & abonnements.
-- Désormais, TOUTE opération crédits/abonnement passe par le serveur
-- (service_role), via /api/credits + /api/stripe-webhook + /api/chat.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Récompense défi quotidien — atomique, 1 par jour, côté serveur ──────────
CREATE TABLE IF NOT EXISTS daily_rewards (
  user_id text NOT NULL,
  day     date NOT NULL DEFAULT current_date,
  PRIMARY KEY (user_id, day)
);

CREATE OR REPLACE FUNCTION claim_daily_reward(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO daily_rewards (user_id) VALUES (p_user_id);  -- échoue si déjà réclamé aujourd'hui
  PERFORM add_credits(p_user_id, 1);
  RETURN jsonb_build_object('credited', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('credited', false, 'reason', 'already_claimed');
END;
$$;

-- ── 2. RLS : on bloque tout accès direct par anon/authenticated ────────────────
-- (le service_role utilisé par le serveur BYPASSE la RLS, donc le serveur garde
--  un accès complet ; le client, lui, n'a plus aucun accès direct.)
ALTER TABLE user_credits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_usage    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_rewards ENABLE ROW LEVEL SECURITY;
-- (aucune POLICY créée volontairement → deny-all pour anon/authenticated)

-- Newsletter : on autorise uniquement l'insertion d'un email par le public.
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscribers_insert ON subscribers;
CREATE POLICY subscribers_insert ON subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ── 3. REVOKE : le client ne peut plus appeler les RPC sensibles ───────────────
-- On retire le droit hérité de PUBLIC (sinon anon/authenticated le gardent), puis
-- on le redonne EXPLICITEMENT au service_role (utilisé uniquement côté serveur).
REVOKE EXECUTE ON FUNCTION add_credits(text, int)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION deduct_one_credit(text)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_daily_reward(text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_chat_quota(text, int, int, int, int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION add_credits(text, int)        TO service_role;
GRANT EXECUTE ON FUNCTION deduct_one_credit(text)       TO service_role;
GRANT EXECUTE ON FUNCTION claim_daily_reward(text)      TO service_role;
GRANT EXECUTE ON FUNCTION check_chat_quota(text, int, int, int, int) TO service_role;
-- ─────────────────────────────────────────────────────────────────────────────
