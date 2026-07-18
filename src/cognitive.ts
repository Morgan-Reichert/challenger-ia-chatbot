// Profil cognitif évolutif — détecte les faiblesses de raisonnement récurrentes
// de l'utilisateur (via un marqueur caché émis par l'IA) et suit la progression.
import { db, doc, getDoc, setDoc } from './firebase';

export const BIAS_TAGS: Record<string, { label: string; short: string }> = {
  generalisation_abusive: { label: 'Généralisation abusive', short: 'Généralisation' },
  correlation_causalite:  { label: 'Confusion corrélation / causalité', short: 'Corrélation ≠ causalité' },
  appel_autorite:         { label: "Appel à l'autorité", short: "Appel à l'autorité" },
  biais_confirmation:     { label: 'Biais de confirmation', short: 'Confirmation' },
  homme_de_paille:        { label: 'Homme de paille', short: 'Homme de paille' },
  faux_dilemme:           { label: 'Faux dilemme (ou/ou)', short: 'Faux dilemme' },
  pente_glissante:        { label: 'Pente glissante', short: 'Pente glissante' },
  ad_hominem:             { label: 'Ad hominem', short: 'Ad hominem' },
  appel_emotion:          { label: "Appel à l'émotion", short: 'Émotion' },
  cherry_picking:         { label: 'Sélection biaisée (cherry-picking)', short: 'Cherry-picking' },
  anecdote:               { label: 'Preuve anecdotique', short: 'Anecdote' },
  petition_principe:      { label: 'Raisonnement circulaire', short: 'Circulaire' },
};

// Forces de raisonnement — les bons réflexes qu'on VEUT renforcer.
// Volontairement exigeant : on ne valorise que ce qui est intellectuellement
// substantiel (jamais la politesse ou l'effort seul), fidèle aux valeurs de Challenger.
export const STRENGTH_TAGS: Record<string, { label: string; short: string }> = {
  nuance:               { label: 'Nuance (refus du simplisme)',           short: 'Nuance' },
  demande_preuve:       { label: 'Exige des preuves',                     short: 'Exige des preuves' },
  contre_exemple:       { label: 'Anticipe les contre-exemples',          short: 'Contre-exemples' },
  distinction:          { label: 'Distinction conceptuelle fine',         short: 'Distinctions' },
  incertitude_assumee:  { label: "Assume l'incertitude",                  short: 'Incertitude assumée' },
  steelman:             { label: "Reformule l'objection au plus fort",    short: 'Steelman' },
  hypothese_alternative:{ label: 'Explore des hypothèses alternatives',   short: 'Hypothèses alt.' },
  causalite_prudente:   { label: 'Prudence corrélation / causalité',      short: 'Causalité prudente' },
  definition_claire:    { label: 'Définit clairement ses termes',         short: 'Termes définis' },
  revision:             { label: 'Révise sa position face à un argument', short: 'Révision honnête' },
};

const RE = /\[CIA_BIAS:\s*(\{[\s\S]*?\})\s*\]/;

/** Extrait jusqu'à 3 tags de biais valides du marqueur caché. */
export function parseCiaBias(text: string): string[] {
  const m = text.match(RE);
  if (!m) return [];
  try {
    const o = JSON.parse(m[1]);
    const tags: unknown[] = Array.isArray(o.tags) ? o.tags : [];
    return tags.filter((t): t is string => typeof t === 'string' && t in BIAS_TAGS).slice(0, 3);
  } catch { return []; }
}

/** Extrait jusqu'à 3 forces de raisonnement valides du marqueur caché. */
export function parseCiaStrengths(text: string): string[] {
  const m = text.match(RE);
  if (!m) return [];
  try {
    const o = JSON.parse(m[1]);
    const forces: unknown[] = Array.isArray(o.forces) ? o.forces : [];
    return forces.filter((t): t is string => typeof t === 'string' && t in STRENGTH_TAGS).slice(0, 3);
  } catch { return []; }
}

/** Retire le marqueur [CIA_BIAS:{...}] du texte affiché. */
export function stripCiaBias(text: string): string {
  return text.replace(/\[CIA_BIAS:\s*\{[\s\S]*?\}\s*\]/g, '').trimEnd();
}

export type Cognitive = {
  counts: Record<string, number>;
  strengths?: Record<string, number>;
  totalMessages: number;
  weeks: Record<string, { flags: number; messages: number; wins?: number }>;
  updatedAt?: string;
};

function weekKey(d: Date): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Enregistre biais ET forces détectés dans une réponse (compteurs + suivi hebdo). */
export async function recordCognitive(userId: string, tags: string[], forces: string[] = []): Promise<void> {
  if (!db) return;
  try {
    const ref = doc(db, 'users', userId, 'meta', 'cognitive');
    const snap = await getDoc(ref);
    const cur: Cognitive = (snap.exists() ? (snap.data() as Cognitive) : null) ?? { counts: {}, strengths: {}, totalMessages: 0, weeks: {} };
    cur.counts = cur.counts || {};
    cur.strengths = cur.strengths || {};
    cur.weeks = cur.weeks || {};
    cur.totalMessages = (cur.totalMessages || 0) + 1;
    for (const t of tags) cur.counts[t] = (cur.counts[t] || 0) + 1;
    for (const f of forces) cur.strengths[f] = (cur.strengths[f] || 0) + 1;
    const wk = weekKey(new Date());
    const w = cur.weeks[wk] || { flags: 0, messages: 0, wins: 0 };
    w.messages += 1;
    w.flags += tags.length;
    w.wins = (w.wins || 0) + forces.length;
    cur.weeks[wk] = w;
    cur.updatedAt = new Date().toISOString();
    await setDoc(ref, cur);
  } catch { /* silencieux */ }
}

export async function loadCognitive(userId: string): Promise<Cognitive | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'meta', 'cognitive'));
    return snap.exists() ? (snap.data() as Cognitive) : null;
  } catch { return null; }
}

/**
 * Fragment de system prompt décrivant les angles morts récurrents de
 * l'utilisateur — l'IA cesse ainsi de repartir de zéro à chaque conversation.
 *
 * Deux garde-fous, sans quoi la mémoire devient une arme contre l'utilisateur :
 *  - l'IA ne cite JAMAIS le profil à voix haute (« tu fais toujours… ») ;
 *  - elle s'en sert pour AFFÛTER son attention, pas pour accuser d'avance.
 * Renvoie '' tant qu'il n'y a pas assez de matière (profil non significatif).
 */
export function cognitiveContext(c: Cognitive | null): string {
  if (!c || (c.totalMessages ?? 0) < 5) return '';

  const top = Object.entries(c.counts || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => BIAS_TAGS[tag]?.label ?? tag);

  const forces = Object.entries(c.strengths || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tag]) => STRENGTH_TAGS[tag]?.label ?? tag);

  if (!top.length && !forces.length) return '';

  const lignes = [
    '## Historique cognitif de cet utilisateur (CONFIDENTIEL — ne jamais citer)',
    "Tu as déjà débattu avec lui. Voici ce que ses échanges passés ont révélé :",
  ];
  if (top.length) lignes.push(`- Angles morts récurrents : ${top.join(', ')}.`);
  if (forces.length) lignes.push(`- Réflexes solides déjà acquis : ${forces.join(', ')}.`);
  lignes.push(
    '',
    "USAGE STRICT :",
    "- Ne mentionne JAMAIS ce profil explicitement — pas de « tu fais toujours… », pas de « comme d'habitude ». Il t'aide à mieux voir, il ne se récite pas.",
    "- Sers-t'en pour ANTICIPER : surveille ces angles morts en priorité, et signale-les seulement s'ils sont RÉELLEMENT présents dans le message courant. Un angle mort passé n'est jamais une preuve pour le message présent.",
    "- Ne redemande pas ce qui est déjà acquis : sur ses réflexes solides, monte d'un cran plutôt que de réexpliquer les bases.",
    "- S'il n'y a rien à redire aujourd'hui, ne fabrique pas un reproche pour coller à l'historique.",
  );
  return lignes.join('\n');
}

/** Progression mesurée : taux de failles par message, du début à aujourd'hui. */
export function progression(c: Cognitive | null): {
  debut: number; actuel: number; variationPct: number; semaines: number;
} | null {
  if (!c?.weeks) return null;
  const cles = Object.keys(c.weeks).sort();
  if (cles.length < 3) return null;

  const taux = (ks: string[]) => {
    let f = 0, m = 0;
    for (const k of ks) { f += c.weeks[k].flags; m += c.weeks[k].messages; }
    return m ? f / m : 0;
  };
  const debut = taux(cles.slice(0, 2));
  const actuel = taux(cles.slice(-2));
  if (debut === 0) return null;

  return {
    debut, actuel,
    variationPct: Math.round(((actuel - debut) / debut) * 100),
    semaines: cles.length,
  };
}

// ─── Rangs / titres (fierté + appartenance) ─────────────────────────────────────
export const RANKS: { min: number; title: string; emoji: string }[] = [
  { min: 0,   title: 'Apprenti du doute',    emoji: '🌱' },
  { min: 10,  title: 'Esprit curieux',       emoji: '🔍' },
  { min: 30,  title: 'Sceptique aguerri',    emoji: '⚖️' },
  { min: 75,  title: 'Esprit affûté',        emoji: '🗡️' },
  { min: 150, title: 'Maître de la nuance',  emoji: '🧠' },
  { min: 300, title: "Challenger d'élite",   emoji: '👑' },
];

/** Rang courant + progression vers le suivant, selon le nombre de messages analysés. */
export function rank(total: number) {
  let cur = RANKS[0];
  let next: typeof RANKS[number] | null = RANKS[1] ?? null;
  for (let i = 0; i < RANKS.length; i++) {
    if (total >= RANKS[i].min) { cur = RANKS[i]; next = RANKS[i + 1] ?? null; }
  }
  const progress = next ? Math.min(1, (total - cur.min) / (next.min - cur.min)) : 1;
  return { cur, next, progress, total };
}

/** Agrégats prêts pour l'affichage : top faiblesses + tendance (amélioration ?). */
export function summarize(c: Cognitive | null) {
  if (!c || !c.totalMessages) return null;
  const top = Object.entries(c.counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, n]) => ({ tag, label: BIAS_TAGS[tag]?.label ?? tag, count: n }));

  const strengths = Object.entries(c.strengths || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag, n]) => ({ tag, label: STRENGTH_TAGS[tag]?.label ?? tag, count: n }));
  const strengthTotal = Object.values(c.strengths || {}).reduce((s, n) => s + n, 0);

  // Tendance : flags/message des 2 dernières semaines vs les 2 précédentes
  const weeks = Object.keys(c.weeks || {}).sort();
  const rate = (ks: string[]) => {
    let f = 0, m = 0;
    for (const k of ks) { f += c.weeks[k].flags; m += c.weeks[k].messages; }
    return m ? f / m : 0;
  };
  const recent = rate(weeks.slice(-2));
  const before = rate(weeks.slice(-4, -2));
  let trend: 'up' | 'down' | 'flat' | null = null;
  if (weeks.length >= 3 && before > 0) {
    if (recent < before * 0.85) trend = 'down';   // moins de biais = progrès
    else if (recent > before * 1.15) trend = 'up';
    else trend = 'flat';
  }
  return { top, strengths, strengthTotal, totalMessages: c.totalMessages, recentRate: recent, trend };
}
