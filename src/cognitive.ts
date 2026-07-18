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

/** Retire le marqueur [CIA_BIAS:{...}] du texte affiché. */
export function stripCiaBias(text: string): string {
  return text.replace(/\[CIA_BIAS:\s*\{[\s\S]*?\}\s*\]/g, '').trimEnd();
}

export type Cognitive = {
  counts: Record<string, number>;
  totalMessages: number;
  weeks: Record<string, { flags: number; messages: number }>;
  updatedAt?: string;
};

function weekKey(d: Date): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Enregistre les biais détectés dans une réponse (incrémente compteurs + suivi hebdo). */
export async function recordCognitive(userId: string, tags: string[]): Promise<void> {
  if (!db) return;
  try {
    const ref = doc(db, 'users', userId, 'meta', 'cognitive');
    const snap = await getDoc(ref);
    const cur: Cognitive = (snap.exists() ? (snap.data() as Cognitive) : null) ?? { counts: {}, totalMessages: 0, weeks: {} };
    cur.counts = cur.counts || {};
    cur.weeks = cur.weeks || {};
    cur.totalMessages = (cur.totalMessages || 0) + 1;
    for (const t of tags) cur.counts[t] = (cur.counts[t] || 0) + 1;
    const wk = weekKey(new Date());
    const w = cur.weeks[wk] || { flags: 0, messages: 0 };
    w.messages += 1;
    w.flags += tags.length;
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
  return { top, totalMessages: c.totalMessages, recentRate: recent, trend };
}
