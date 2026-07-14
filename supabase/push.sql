-- ─────────────────────────────────────────────────────────────────────────────
-- Challenger IA — Abonnements aux notifications push (À EXÉCUTER dans le SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     text PRIMARY KEY,          -- identifiant unique de l'abonnement
  user_id      text,
  subscription jsonb NOT NULL,            -- objet PushSubscription complet
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- (accès serveur uniquement via service_role)
