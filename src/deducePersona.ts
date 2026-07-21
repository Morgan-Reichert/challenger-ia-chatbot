/**
 * Déduction du contradicteur à partir de ce que l'utilisateur écrit.
 *
 * ── Pourquoi une déduction ────────────────────────────────────────────────
 * Imposer un choix parmi cinq personas AVANT le premier message demande à
 * l'utilisateur une décision qu'il ne peut pas prendre : pour savoir quel
 * contradicteur lui convient, il faudrait qu'il les ait déjà tous essayés.
 * L'outil choisit donc, annonce son choix, et le laisse révocable d'un clic.
 *
 * ── Ce que la déduction n'est pas ─────────────────────────────────────────
 * Ce n'est pas une classification savante : c'est un aiguillage par signaux de
 * surface. Une intention explicite de l'utilisateur — un persona épinglé —
 * prime toujours sur elle. En cas de doute, on retombe sur l'Architecte, qui
 * analyse la structure d'un raisonnement et convient au plus grand nombre de
 * demandes.
 *
 * La fonction est pure et sans état : elle se teste hors de tout composant, ce
 * qui est le seul moyen de mesurer si elle se trompe.
 */

export type Persona = 'architect' | 'factchecker' | 'opponent' | 'strategist' | 'arbiter';

/** Un signal détecté, conservé pour pouvoir EXPLIQUER le choix à l'utilisateur. */
export type Deduction = {
  persona: Persona;
  /** Score du persona retenu, pour juger la confiance. */
  score: number;
  /** Phrase courte destinée à la puce : « parce que … ». */
  motif: string;
  /** Vrai quand aucun signal ne se détache : on a pris le défaut. */
  parDefaut: boolean;
};

type Regle = {
  persona: Persona;
  motif: string;
  motifs: RegExp;
  poids: number;
};

/**
 * Règles d'aiguillage, du signal le plus spécifique au plus général.
 *
 * Les expressions sont volontairement larges : mieux vaut un aiguillage
 * approximatif mais annoncé — que l'utilisateur corrige d'un clic — qu'une
 * absence de proposition qui le renvoie au choix manuel qu'on cherche à
 * éviter.
 */
const REGLES: Regle[] = [
  // ── Fact-Checker — vérifier une affirmation ────────────────────────────
  {
    persona: 'factchecker',
    motif: 'tu cherches à vérifier une affirmation',
    poids: 3,
    motifs: /\b(est-ce (que c'est |)vrai|est-ce (un |)faux|vérifi|fact.?check|source|prouve|preuve|réellement|vraiment vrai|rumeur|intox|désinformation|on dit que|j'ai (lu|entendu) que|il paraît que|selon (une étude|le|la))/i,
  },
  // ── Stratège — passer à l'action ───────────────────────────────────────
  // Pas de « \b » final : il échoue sur les préfixes tronqués comme « planifi »,
  // où la lettre suivante (« er ») n'est pas une frontière de mot. La frontière
  // initiale suffit à éviter les correspondances au milieu d'un autre mot.
  {
    persona: 'strategist',
    motif: 'tu veux transformer une idée en plan',
    poids: 3,
    motifs: /\b(plan|planifi|étape|comment (faire|m['’]y prendre|procéder|lancer|démarrer|organiser)|par où commencer|feuille de route|stratégie|objectif|priorité|roadmap|projet|mettre en (place|œuvre)|exécut)/i,
  },
  // ── Arbitre — trancher, conclure ───────────────────────────────────────
  {
    persona: 'arbiter',
    motif: 'tu veux qu’on tranche',
    poids: 3,
    motifs: /\b(tranch|aide.moi à (choisir|décider|trancher)|que (dois|devrais).je (faire|choisir)|quelle (est la|serait la) meilleure|pour ou contre|le pour et le contre|conclusion|verdict|au final|résume)/i,
  },
  // ── Opposant — mettre une position à l'épreuve ─────────────────────────
  {
    persona: 'opponent',
    motif: 'tu veux mettre ta position à l’épreuve',
    poids: 2,
    motifs: /\b(je (pense|crois|estime|considère) que|à mon avis|selon moi|convaincs.moi|challenge|conteste|contredis|défends le contraire|joue l'avocat du diable|prends le contre.?pied|mon argument|ma position|ma thèse)/i,
  },
  // ── Architecte — analyser un raisonnement ──────────────────────────────
  {
    persona: 'architect',
    motif: 'tu soumets un raisonnement à analyser',
    poids: 1,
    motifs: /\b(donc|par conséquent|ce qui prouve|si .+ alors|logique|raisonnement|cohéren|argument|prémisse|il s'ensuit|d'où|puisque)/i,
  },
];

const DEFAUT: Persona = 'architect';
const MOTIF_DEFAUT = 'analyse de la structure de ton raisonnement';

/**
 * Déduit le contradicteur le plus adapté à un message.
 *
 * @param texte   le message de l'utilisateur
 * @param options `personaEpingle` court-circuite la déduction : une intention
 *                explicite prime sur tout signal.
 */
export function deducePersona(
  texte: string,
  options: { personaEpingle?: Persona | null } = {},
): Deduction {
  if (options.personaEpingle) {
    return { persona: options.personaEpingle, score: Infinity, motif: 'tu l’as épinglé', parDefaut: false };
  }

  const t = (texte ?? '').slice(0, 2000);
  const scores = new Map<Persona, { score: number; motif: string }>();

  for (const r of REGLES) {
    const occurrences = (t.match(new RegExp(r.motifs, 'gi')) ?? []).length;
    if (occurrences === 0) continue;
    // Un signal répété pèse davantage, mais le rendement est décroissant : une
    // seule mention suffit à trahir l'intention, dix ne la décuplent pas.
    const apport = r.poids * (1 + Math.min(occurrences - 1, 3) * 0.25);
    const actuel = scores.get(r.persona);
    if (!actuel || apport > actuel.score) {
      scores.set(r.persona, { score: (actuel?.score ?? 0) + apport, motif: r.motif });
    } else {
      actuel.score += apport;
    }
  }

  if (scores.size === 0) {
    return { persona: DEFAUT, score: 0, motif: MOTIF_DEFAUT, parDefaut: true };
  }

  let meilleur: Persona = DEFAUT;
  let meilleurScore = -1;
  let meilleurMotif = MOTIF_DEFAUT;
  for (const [persona, { score, motif }] of scores) {
    if (score > meilleurScore) { meilleur = persona; meilleurScore = score; meilleurMotif = motif; }
  }

  return { persona: meilleur, score: meilleurScore, motif: meilleurMotif, parDefaut: false };
}
