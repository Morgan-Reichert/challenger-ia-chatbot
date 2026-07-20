-- ─────────────────────────────────────────────────────────────────────────────
-- Challenger IA — Actualités du site vitrine
-- À EXÉCUTER dans le SQL Editor de Supabase, après supabase/schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────
-- Deux rubriques : « maj » (ce qui est livré) et « wip » (ce qui est en cours).
--
-- Le résumé est public ; le contenu intégral est réservé aux titulaires d'un
-- compte. Ce cloisonnement est assuré par le SCHÉMA, pas par l'interface : une
-- vue expose les champs publics, et la table complète reste inaccessible à la
-- clé anonyme — laquelle circule dans le bundle du site.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS articles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('maj', 'wip')),
  titre         text NOT NULL,
  resume        text NOT NULL,          -- envoyé par courriel, donc court
  contenu       text NOT NULL,          -- réservé aux comptes
  statut        text NOT NULL DEFAULT 'brouillon'
                CHECK (statut IN ('brouillon', 'publie')),
  temps_lecture integer NOT NULL DEFAULT 3,
  -- Avancement d'un chantier, en pourcentage. Réservé à la rubrique « wip » :
  -- une mise à jour livrée est achevée par définition. Nul ailleurs plutôt que
  -- zéro, pour distinguer « non applicable » de « pas commencé ».
  avancement    integer CHECK (avancement IS NULL OR (avancement BETWEEN 0 AND 100)),
  image_url     text,           -- facultatif ; un visuel est engendré à défaut
  publie_le     timestamptz,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  maj_le        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_publies
  ON articles (statut, type, publie_le DESC);

-- ── Vue publique ─────────────────────────────────────────────────────────────
-- Le contenu intégral en est ABSENT : il ne peut donc pas fuiter par une
-- requête directe, quelle que soit la façon dont l'interface est contournée.
CREATE OR REPLACE VIEW articles_publics AS
  SELECT id, type, titre, resume, temps_lecture, avancement, image_url, publie_le
  FROM articles
  WHERE statut = 'publie'
  ORDER BY publie_le DESC;

-- ── Journal des envois ───────────────────────────────────────────────────────
-- Un article ne doit être annoncé qu'UNE fois. Sans ce registre, une seconde
-- publication — corriger une coquille, par exemple — renverrait le courriel à
-- tous les inscrits. La contrainte d'unicité rend l'erreur impossible plutôt
-- qu'improbable.
CREATE TABLE IF NOT EXISTS article_envois (
  article_id  uuid PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  envoye_le   timestamptz NOT NULL DEFAULT now(),
  destinataires integer NOT NULL DEFAULT 0,
  echecs      integer NOT NULL DEFAULT 0
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE articles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_envois ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON articles       FROM anon, authenticated;
REVOKE ALL ON article_envois FROM anon, authenticated;

-- La vue est en revanche lisible publiquement : elle ne contient que ce qui
-- est destiné à être vu sans compte.
GRANT SELECT ON articles_publics TO anon, authenticated;

-- Aucune policy sur `articles` : RLS active sans policy vaut refus.
-- service_role contourne RLS, ce qui réserve l'accès complet à /api/articles.
