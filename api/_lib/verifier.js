/**
 * Vérification de la réponse produite.
 *
 * ── Pourquoi vérifier après coup ──────────────────────────────────────────
 * Une consigne n'est pas une garantie. L'interdiction d'inventer des chiffres
 * figurait déjà en majuscules dans les instructions système, et un tiers des
 * réponses la violaient ; trois reformulations successives n'ont pas déplacé
 * ce taux au-delà du bruit de mesure.
 *
 * Ce module ne demande rien au modèle : il constate. Ce qu'il détecte est
 * remonté à l'appelant, qui décide — signaler, annoter, ou refuser la réponse.
 * C'est la seule couche du dispositif dont le comportement soit déterministe.
 *
 * ── Les quatre atteintes recherchées ──────────────────────────────────────
 * 1. Chiffre non rattaché à une source.
 * 2. Renvoi vers une source qui n'existe pas dans la liste fournie — la forme
 *    d'hallucination la plus trompeuse, puisqu'elle mime la rigueur.
 * 3. Éloge non justifié : reconnaissance décernée alors que rien n'a été
 *    identifié comme tenant.
 * 4. Sévérité non justifiée : réfutation asssénée sans qu'aucune faille ne
 *    soit nommée. Le symétrique du précédent, et tout aussi malhonnête.
 */

/* ─── 0. Normalisation ────────────────────────────────────────────────────── */

/**
 * Retire les diacritiques avant toute recherche de motif.
 *
 * Les modèles omettent parfois les accents, et une détection qui les exige
 * laisserait passer « ta these est juste » là où elle retient « ta thèse est
 * juste ». Les motifs ci-dessous sont donc écrits sans accent et appliqués au
 * texte normalisé ; les extraits rendus restent, eux, dans leur forme d'origine.
 */
function sansAccents(t) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ─── 1. Chiffres et rattachement ─────────────────────────────────────────── */

// Motifs statistiques. Les millésimes, les durées et les énumérations sont
// exclus : « en 2030 », « 4 jours », « 3 étapes » ne sont pas des mesures.
const MOTIF_CHIFFRE = new RegExp([
  '\\d{1,3}(?:[.,]\\d+)?\\s*%',
  '\\d{1,3}(?:[.,]\\d+)?\\s*(?:fois plus|fois moins)',
  '\\d[\\d\\s.,]*\\s*(?:millions?|milliards?|milliers?)',
  '(?:environ|près de|quelque|de l\'ordre de)\\s+\\d[\\d\\s.,]*',
].join('|'), 'gi');

const ANNEE = /^(?:19|20)\d{2}$/;

/** Renvoi de citation : [3] ou [3, 5] ou [3][5]. */
const CITATION = /\[(\d{1,2})(?:\s*[,;]\s*\d{1,2})*\]/g;

/** Réserve explicite : le modèle assume de ne pas pouvoir sourcer. */
const RESERVE = /(je ne dispose pas|sans source|a verifier|inverifiable|de memoire|de l'ordre de|ordre de grandeur|aucune source ne|non source)/i;

function citationsDe(phrase) {
  const n = [];
  for (const m of phrase.matchAll(CITATION)) {
    for (const x of m[0].slice(1, -1).split(/[,;]/)) {
      const v = Number(x.trim());
      if (Number.isInteger(v)) n.push(v);
    }
  }
  return n;
}

/**
 * Contrôle du rattachement des chiffres.
 *
 * @param {string} texte      réponse produite
 * @param {number} nbSources  nombre de sources réellement transmises
 */
export function verifierChiffres(texte, nbSources = 0) {
  const phrases = texte.split(/(?<=[.!?])\s+|\n+/);
  const nonCites = [];
  const fantomes = [];

  for (const p of phrases) {
    const cites = citationsDe(p);

    // Renvoi vers une source hors liste : hallucination de sourçage.
    for (const n of cites) {
      if (n < 1 || n > nbSources) {
        fantomes.push({ phrase: p.trim().slice(0, 200), renvoi: n, sourcesDisponibles: nbSources });
      }
    }

    const trouves = (p.match(MOTIF_CHIFFRE) ?? [])
      .filter((c) => !ANNEE.test(c.replace(/\s/g, '')));
    if (trouves.length === 0) continue;
    if (RESERVE.test(sansAccents(p))) continue;

    // Un chiffre est rattaché s'il cohabite avec un renvoi valide.
    const valide = cites.some((n) => n >= 1 && n <= nbSources);
    if (!valide) {
      nonCites.push({ phrase: p.trim().slice(0, 200), chiffres: [...new Set(trouves)] });
    }
  }

  return {
    conforme: nonCites.length === 0 && fantomes.length === 0,
    nonCites, fantomes,
    nb: nonCites.length + fantomes.length,
  };
}

/* ─── 2. Reconnaissance et sévérité ───────────────────────────────────────── */

// Éloge adressé à l'interlocuteur. Un adjectif isolé — « solide », « pertinent »
// — ne compte pas : la mesure précédente, qui les comptait, s'est révélée
// entièrement composée de faux positifs (« aucune preuve solide » démolit la
// thèse, « l'objection la plus solide » est un titre de section).
const ELOGE = new RegExp([
  "excellente?s?\\s+(?:question|these|point|intuition|remarque|analyse|objection)",
  "(?:tu as|vous avez)\\s+(?:raison|bien vu|vu juste|mis le doigt)",
  "bien vu",
  "(?:ta|votre)\\s+(?:these|position|analyse|intuition)\\s+(?:est|tient|juste|a le merite)",
  "(?:ton|votre)\\s+raisonnement\\s+(?:est|tient|a le merite)",
  "à (?:ton|votre) crédit",
  "le merite de (?:ta|votre)",
].join('|'), 'gi');

// Marque d'une faille NOMMÉE, et non simplement annoncée.
const FAILLE_NOMMEE = new RegExp([
  'confusion entre', 'ne suit pas de', 'ne decoule pas', 'correlation',
  'generalisation', 'faux dilemme', 'homme de paille', 'petition de principe',
  'biais de', 'appel à', 'pente glissante', 'contre-exemple',
  'premisse', 'non-sequitur', 'echantillon', 'causalite',
].join('|'), 'i');

// Marque d'une réfutation, indépendamment de sa justification.
const REFUTATION = /(maillon faible|angle mort|faille|cela ne tient pas|c'est faux|erreur de raisonnement|le probleme)/i;

/**
 * Contrôle de l'équilibre du jugement.
 *
 * Deux dérives symétriques, aussi malhonnêtes l'une que l'autre : féliciter
 * sans avoir rien trouvé de juste, et condamner sans nommer ce qui cloche.
 * La seconde est la plus fréquente dans ce produit, et la moins surveillée.
 */
export function verifierJugement(texte, { theseFaible = null } = {}) {
  const t = sansAccents(texte);
  const eloges = t.match(ELOGE) ?? [];
  const failleNommee = FAILLE_NOMMEE.test(t);
  const refute = REFUTATION.test(t);

  // Éloge injustifié : reconnaissance décernée à une thèse dont une faille est
  // par ailleurs identifiée, sans que rien de valide ne soit distingué.
  const elogeInjustifie = eloges.length > 0 && theseFaible === true && !failleNommee;

  // Sévérité injustifiée : le texte réfute sans nommer la nature du défaut.
  // « C'est faux » sans dire pourquoi n'apprend rien et ne se conteste pas.
  const severiteInjustifiee = refute && !failleNommee;

  return {
    nbEloges: eloges.length,
    failleNommee, refute,
    elogeInjustifie, severiteInjustifiee,
    conforme: !elogeInjustifie && !severiteInjustifiee,
  };
}

/* ─── 3. Agrégat ──────────────────────────────────────────────────────────── */

/**
 * Vérification complète d'une réponse.
 * `sources` est la liste réellement transmise au modèle, après vérification
 * d'atteignabilité : c'est elle qui définit ce qui pouvait légitimement être cité.
 */
export function verifierReponse(texte, { sources = [], theseFaible = null } = {}) {
  const chiffres = verifierChiffres(texte, sources.length);
  const jugement = verifierJugement(texte, { theseFaible });
  return {
    chiffres, jugement,
    conforme: chiffres.conforme && jugement.conforme,
    atteintes: [
      ...(chiffres.nonCites.length ? ['chiffre_non_source'] : []),
      ...(chiffres.fantomes.length ? ['citation_fantome'] : []),
      ...(jugement.elogeInjustifie ? ['eloge_injustifie'] : []),
      ...(jugement.severiteInjustifiee ? ['severite_injustifiee'] : []),
    ],
  };
}
