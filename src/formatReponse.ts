/**
 * Format de réponse — deux axes distincts : longueur et profondeur.
 *
 * ── Pourquoi deux axes, pas un ────────────────────────────────────────────
 * « Court » et « superficiel » ne sont pas la même chose ; « long » et
 * « profond » non plus. On peut vouloir une réponse COURTE mais PROFONDE
 * (dense, au cœur, sans remplissage), ou LONGUE mais peu profonde
 * (pédagogique, déroulée, un seul angle). Un réglage unique qui mélange les
 * deux ne sait pas exprimer ces combinaisons — c'est le défaut qu'on corrige.
 *
 *   longueur  = VOLUME       (combien de mots)
 *   profondeur = PORTÉE      (jusqu'où l'analyse pousse : angles, objections,
 *                             implications de second ordre)
 *
 * ── « auto » est le défaut et n'injecte rien ──────────────────────────────
 * Le prompt système demande déjà d'« adapter la longueur à la complexité ».
 * Tant qu'un axe est sur « auto », on ne l'écrase pas : le modèle s'adapte.
 * Une directive n'est émise que lorsque l'utilisateur prend la main.
 *
 * Fonction pure et sans état : elle se teste hors de tout composant.
 */

export type Longueur = 'auto' | 'bref' | 'moyen' | 'detaille';
export type Profondeur = 'auto' | 'essentiel' | 'equilibre' | 'fouille';

export type FormatReponse = { longueur: Longueur; profondeur: Profondeur };

export const FORMAT_AUTO: FormatReponse = { longueur: 'auto', profondeur: 'auto' };

/** Vrai si aucun axe n'est réglé — rien à injecter, le modèle s'adapte. */
export function formatEstAuto(f: FormatReponse): boolean {
  return f.longueur === 'auto' && f.profondeur === 'auto';
}

const DIR_LONGUEUR: Record<Exclude<Longueur, 'auto'>, string> = {
  // La brièveté doit primer sur la structure en sections que certains personas
  // imposent par défaut, sinon le squelette de sections l'annule (constat
  // vérifié : l'Opposant en mode extrême rallongeait malgré la consigne).
  bref:     "Longueur : brève. Va droit à l'essentiel en deux à quatre phrases. Pas de préambule, pas de récapitulatif final. Cette brièveté PRIME sur toute structure en sections par défaut : n'utilise ni titres ni sections, fonds tout en un seul paragraphe court.",
  moyen:    "Longueur : mesurée. Quelques paragraphes, le nécessaire et rien de plus. N'impose pas de squelette de sections si le sujet ne le demande pas.",
  detaille: "Longueur : détaillée. Développe pleinement, sur plusieurs paragraphes structurés.",
};

const DIR_PROFONDEUR: Record<Exclude<Profondeur, 'auto'>, string> = {
  essentiel: "Profondeur : essentielle. Retiens le seul angle le plus décisif, ne multiplie pas les perspectives.",
  equilibre: "Profondeur : équilibrée. Traite les points saillants sans chercher à épuiser le sujet.",
  fouille:   "Profondeur : fouillée. Explore plusieurs angles, anticipe les objections, pousse jusqu'aux implications de second ordre et aux cas limites.",
};

/**
 * Note de réconciliation quand les deux axes tirent en sens opposés : elle
 * rappelle explicitement au modèle que longueur et profondeur sont
 * indépendantes, pour qu'il ne rabatte pas l'une sur l'autre.
 */
function reconciliation(f: FormatReponse): string {
  if (f.longueur === 'bref' && f.profondeur === 'fouille') {
    return '→ Concentre : densité maximale dans un seul paragraphe court, zéro remplissage. Chaque phrase porte une idée. Court ne veut pas dire superficiel — mais reste court.';
  }
  if (f.longueur === 'detaille' && f.profondeur === 'essentiel') {
    return '→ Déroule un seul angle avec patience pédagogique : prends le temps d\'expliquer, sans t\'éparpiller sur d\'autres perspectives.';
  }
  return '';
}

/**
 * Construit le bloc de directive de format, ou une chaîne vide si tout est
 * sur « auto ». Le bloc est autonome et destiné à être concaténé au prompt
 * système, APRÈS le profil (une contrainte de format ne se veut pas
 * « subtile », contrairement au profil).
 */
export function directiveFormat(f: FormatReponse): string {
  const lignes: string[] = [];
  if (f.longueur !== 'auto') lignes.push(DIR_LONGUEUR[f.longueur]);
  if (f.profondeur !== 'auto') lignes.push(DIR_PROFONDEUR[f.profondeur]);
  if (lignes.length === 0) return '';
  const note = reconciliation(f);
  if (note) lignes.push(note);
  return '## Format de réponse (demandé par l\'utilisateur)\n' + lignes.join('\n');
}

/* ─── Ponts avec le profil (réglage global par défaut) ─────────────────────── */
// Le calibrage stocke un défaut global sous un vocabulaire hérité
// (longueurReponse : concise/standard/approfondie). On le traduit vers les
// deux axes pour initialiser le contrôle par message.

export function longueurDepuisProfil(v: string): Longueur {
  return ({ concise: 'bref', standard: 'moyen', approfondie: 'detaille' } as Record<string, Longueur>)[v] ?? 'auto';
}

export function profondeurDepuisProfil(v: string): Profondeur {
  return ({ essentiel: 'essentiel', equilibre: 'equilibre', fouille: 'fouille' } as Record<string, Profondeur>)[v] ?? 'auto';
}
