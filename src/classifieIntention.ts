/**
 * Intention d'un message : Challenger n'a pas à contredire une politesse.
 *
 * ── Le problème ────────────────────────────────────────────────────────────
 * L'outil traite chaque message comme une thèse à mettre à l'épreuve. Sur
 * « bonjour » ou « que sais-tu faire ? », déployer un contradicteur, des
 * sections et une friction est absurde : l'utilisateur veut juste une réponse
 * normale. On distingue donc trois intentions, et seule « substantiel »
 * déclenche la machinerie de contradiction.
 *
 *   social      → salutation, « ça va », remerciement, au revoir
 *   meta        → question SUR l'outil (qui es-tu, que sais-tu faire, aide)
 *   substantiel → une vraie thèse, opinion, question de fond ou requête
 *
 * ── Prudence ───────────────────────────────────────────────────────────────
 * Le cœur du produit est la contradiction : en cas de doute on retombe sur
 * « substantiel ». Une salutation SUIVIE d'une vraie question (« bonjour,
 * penses-tu que… ») reste substantielle — c'est la question qui compte.
 *
 * Fonction pure et sans état : elle se teste hors de tout composant.
 */

export type Intention = 'social' | 'meta' | 'substantiel';

export type ClassificationIntention = {
  intention: Intention;
  /** Phrase courte expliquant le classement (utile au débogage / aux tests). */
  motif: string;
};

// Question portant sur l'outil lui-même (et non sur un sujet de fond).
// Pas de « \b » autour : il échoue sur les mots accentués (« à », « ça »),
// dont « à » n'est pas un caractère de mot ASCII — le même piège que dans la
// déduction de persona. Les tournures sont assez spécifiques pour s'en passer.
const META = /(que\s+(sais|peux)[- ]?tu\s+faire|qu['’]est[- ]ce\s+que\s+tu\s+(sais|peux)\s+faire|à\s+quoi\s+(tu\s+sers|sers[- ]tu)|tu\s+sers\s+à\s+quoi|qui\s+es[- ]tu|t['’]es\s+qui|c['’]est\s+quoi\s+(challenger|ce\s+(site|truc|chat|machin))|comment\s+(ça\s+|tu\s+)?march|comment\s+t['’]utiliser|comment\s+ça\s+fonctionne|tes\s+(fonctionnalités|capacités)|quelles\s+(sont\s+tes\s+)?(fonctionnalités|capacités)|tu\s+fais\s+quoi|à\s+quoi\s+ça\s+sert)/i;

// Salutations et amorces de contact, en tête de message.
const SALUTATION = /^[\s]*((coucou|bonjour|bonsoir|salut|hello|hey|hi|yo|wesh|hola|re|bonne\s+(journée|soirée))[\s!,.…-]*)+/i;

// Formules « comment ça va » et équivalents. « va\b » (frontière FINALE, sur
// une lettre ASCII) empêche de mordre sur « ça vaut ». Pas de « \b » initial
// (« ça » commence par un accent).
const CA_VA = /(ça\s+va\b|ca\s+va\b|comment\s+(vas|allez)[- ]?(tu|vous)|comment\s+tu\s+vas\b|quoi\s+de\s+neuf|tu\s+vas\s+bien|vous\s+allez\s+bien|comment\s+ça\s+se\s+passe|comment\s+tu\s+te\s+sens)/i;

// Message ENTIÈREMENT de politesse (remerciement, adieu, acquiescement court).
// Répétable : « ok parfait », « merci, au revoir » sont couverts.
const POLITESSE_SEULE = /^[\s]*((merci(\s+beaucoup)?|thanks|thank\s+you|super|génial|parfait|nickel|cool|ok(ay)?|d['’]accord|au\s+revoir|à\s+(bientôt|plus|la\s+prochaine)|bonne\s+(journée|soirée|nuit)|bye|ciao)[\s!.,…]*)+$/i;

/**
 * Classe l'intention d'un message.
 *
 * @param texte le message de l'utilisateur
 */
export function classifieIntention(texte: string): ClassificationIntention {
  const t = (texte ?? '').trim();
  if (!t) return { intention: 'social', motif: 'message vide' };

  // 1) Question sur l'outil — prioritaire, même un peu longue.
  if (META.test(t)) return { intention: 'meta', motif: 'question sur les capacités de l’outil' };

  // 2) Politesse pure (le message entier n'est que ça).
  if (POLITESSE_SEULE.test(t)) return { intention: 'social', motif: 'politesse' };

  // 3) Salutation / « ça va » : n'est SOCIAL que si rien de substantiel ne suit.
  //    On retire la salutation en tête et on regarde ce qui reste.
  const reste = t.replace(SALUTATION, '').trim();
  const resteTrivial = reste.length <= 24 && !/\?/.test(reste);
  const contientCaVa = CA_VA.test(t);
  const commenceParSalutation = SALUTATION.test(t);

  // « bonjour », « salut ça va », « coucou 🙂 » → social.
  if (commenceParSalutation && resteTrivial) {
    return { intention: 'social', motif: 'salutation' };
  }
  // « comment ça va ? » seul (sans sujet de fond accroché) → social.
  if (contientCaVa && t.length < 60 && !/\b(pense|penses|crois|avis|selon|pourquoi|parce|vrai|faux|thèse|argument)\b/i.test(t)) {
    return { intention: 'social', motif: 'prise de contact' };
  }

  // 4) Par défaut : une vraie thèse ou requête.
  return { intention: 'substantiel', motif: 'thèse ou requête à traiter' };
}
