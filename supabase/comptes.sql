-- ─────────────────────────────────────────────────────────────────────────────
-- Challenger IA — Sessions et préférences de compte
-- À EXÉCUTER dans le SQL Editor de Supabase, après supabase/schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────
-- Couvre :
--   1. user_sessions      — appareils connectés, pour la page Sécurité
--   2. user_preferences   — notifications par catégorie, réutilisation des
--                           conversations à des fins d'amélioration
--
-- Comme le reste du schéma, RLS refuse tout accès direct : la clé anon est
-- publique (elle est dans le bundle client), et ces tables décrivent qui se
-- connecte d'où. Seul le serveur (service_role, via /api/account) y touche.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Sessions / appareils connectés ────────────────────────────────────────
--
-- AUCUNE adresse IP n'est stockée. Elle constituerait une donnée personnelle
-- supplémentaire (RGPD, minimisation — art. 5.1.c) pour un gain nul : le
-- libellé d'appareil suffit à ce que l'utilisateur reconnaisse ses sessions.
--
-- Firebase n'expose pas la liste des sessions d'un compte : ce registre est
-- tenu par l'application. La révocation, elle, passe par l'API Admin
-- (revokeRefreshTokens), qui invalide TOUS les jetons du compte — il n'existe
-- pas de révocation par appareil côté Firebase.
CREATE TABLE IF NOT EXISTS user_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  jeton       text NOT NULL,           -- identifiant local, permet de marquer « cet appareil-ci »
  appareil    text,                    -- ex. « Chrome sur macOS »
  cree_le     timestamptz NOT NULL DEFAULT now(),
  vu_le       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, jeton)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id, vu_le DESC);

-- ── 2. Préférences de compte ─────────────────────────────────────────────────
--
-- `notifications` : une clé par catégorie. Un interrupteur unique force à tout
-- accepter ou tout refuser, si bien qu'un utilisateur qui ne veut que le défi
-- du jour finit par tout couper — et l'on perd le canal entier.
--
-- `reutilisation_conversations` : opt-out explicite. Par défaut à FAUX, donc
-- rien n'est réutilisé tant que l'utilisateur ne l'a pas accepté — l'inverse
-- (opt-out) supposerait un consentement qui n'a jamais été donné.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                     text PRIMARY KEY,
  notifications               jsonb NOT NULL DEFAULT
    '{"defi_du_jour": true, "relances": true, "nouveautes": true}'::jsonb,
  reutilisation_conversations boolean NOT NULL DEFAULT false,
  maj_le                      timestamptz NOT NULL DEFAULT now()
);

-- ── 3. RLS : aucun accès direct par anon / authenticated ─────────────────────
ALTER TABLE user_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON user_sessions    FROM anon, authenticated;
REVOKE ALL ON user_preferences FROM anon, authenticated;

-- Aucune policy n'est créée : RLS activée sans policy = refus par défaut.
-- service_role contourne RLS, ce qui laisse passer /api/account uniquement.

-- ── 4. Purge des sessions dormantes ──────────────────────────────────────────
-- Une session qu'on n'a pas revue depuis 90 jours n'apprend plus rien à
-- l'utilisateur et prolonge une conservation sans finalité.
CREATE OR REPLACE FUNCTION purger_sessions_dormantes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE supprimees integer;
BEGIN
  DELETE FROM user_sessions WHERE vu_le < now() - interval '90 days';
  GET DIAGNOSTICS supprimees = ROW_COUNT;
  RETURN supprimees;
END;
$$;

REVOKE EXECUTE ON FUNCTION purger_sessions_dormantes() FROM anon, authenticated;
