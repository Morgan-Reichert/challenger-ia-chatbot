/**
 * Déduction du niveau de friction à partir de ce que l'utilisateur écrit.
 *
 * La friction règle la dureté du ton, jamais l'exigence sur le fond. On la
 * déduit de la POSTURE du message : quelqu'un qui affirme avec aplomb réclame
 * qu'on le bouscule ; quelqu'un qui doute ou se confie a besoin qu'on
 * l'accompagne. En l'absence de signal, on reste au niveau intermédiaire.
 *
 * Comme la déduction de contradicteur, ce n'est pas une analyse fine : c'est un
 * aiguillage par signaux de surface, toujours révocable d'un geste. La fonction
 * est pure et se teste hors de tout composant.
 */

export type FrictionLevel = 'doux' | 'moyen' | 'extreme';

export type DeductionFriction = {
  level: FrictionLevel;
  motif: string;
  parDefaut: boolean;
};

type Regle = { level: FrictionLevel; motif: string; motifs: RegExp; poids: number };

const REGLES: Regle[] = [
  // ── Extrême — aplomb, provocation, demande explicite d'être bousculé ─────
  {
    level: 'extreme',
    motif: 'tu affirmes avec aplomb',
    poids: 3,
    motifs: /\b(c'est (évident|clair|certain|indéniable)|évidemment|à l'évidence|de toute évidence|il est clair que|personne ne peut nier|indéniablement|c'est un fait|forcément|de toute façon|à coup sûr)\b/i,
  },
  {
    level: 'extreme',
    motif: 'tu demandes qu’on te bouscule',
    poids: 4,
    motifs: /\b(sans concession|sans ménagement|vas.y fort|démolis|détruis|attaque|challenge.moi|défie.moi|prouve.moi le contraire|ne me ménage pas|sois (dur|brutal|impitoyable)|frappe fort)\b/i,
  },
  // ── Doux — doute, vulnérabilité, apprentissage ───────────────────────────
  {
    level: 'doux',
    motif: 'tu explores sans certitude',
    poids: 3,
    motifs: /\b(je ne suis pas (sûr|certain)|je (doute|me demande|hésite)|peut-être que|je crois que|il me semble|je n'y connais (rien|pas grand-chose)|je débute|je découvre|aide-moi à comprendre|explique-moi (simplement|doucement)|je suis perdu|je m'y perds)\b/i,
  },
  {
    level: 'doux',
    motif: 'ta question touche à quelque chose de personnel',
    poids: 2,
    motifs: /\b(je me sens|j'ai peur|ça m'angoisse|c'est difficile pour moi|je traverse|je vis (un|une)|mon (deuil|divorce|licenciement)|je culpabilise|je n'ose pas)\b/i,
  },
];

const DEFAUT: FrictionLevel = 'moyen';
const MOTIF_DEFAUT = 'ton franc et mesuré';

export function deduceFriction(texte: string): DeductionFriction {
  const t = (texte ?? '').slice(0, 2000);
  const scores = new Map<FrictionLevel, { score: number; motif: string }>();

  for (const r of REGLES) {
    const occurrences = (t.match(new RegExp(r.motifs, 'gi')) ?? []).length;
    if (occurrences === 0) continue;
    const apport = r.poids * (1 + Math.min(occurrences - 1, 2) * 0.25);
    const actuel = scores.get(r.level);
    if (!actuel) scores.set(r.level, { score: apport, motif: r.motif });
    else if (apport > actuel.score) { actuel.score += apport; actuel.motif = r.motif; }
    else actuel.score += apport;
  }

  if (scores.size === 0) return { level: DEFAUT, motif: MOTIF_DEFAUT, parDefaut: true };

  let meilleur: FrictionLevel = DEFAUT;
  let meilleurScore = -1;
  let meilleurMotif = MOTIF_DEFAUT;
  for (const [level, { score, motif }] of scores) {
    if (score > meilleurScore) { meilleur = level; meilleurScore = score; meilleurMotif = motif; }
  }
  return { level: meilleur, motif: meilleurMotif, parDefaut: false };
}
