-- ─────────────────────────────────────────────────────────────────────────────
-- Challenger IA — Consentement marketing + relances (À EXÉCUTER dans le SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────
-- Stocke qui a accepté de recevoir l'actualité, et quand on l'a relancé.
-- Accès UNIQUEMENT côté serveur (service_role bypass RLS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_contacts (
  user_id           text PRIMARY KEY,
  email             text,
  marketing_opt_in  boolean NOT NULL DEFAULT false,
  opt_in_at         timestamptz,
  last_reengaged_at timestamptz,   -- dernière relance envoyée (anti-spam)
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
-- (aucune policy → deny-all pour anon/authenticated ; le serveur passe en service_role)
