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
  // ── Fact-Checker — vérifier une affirmation, un fait, un chiffre ────────
  {
    persona: 'factchecker',
    motif: 'tu cherches à vérifier un fait',
    poids: 3.2,
    // Sans « \b » final : il casse sur les radicaux tronqués (« vérif » dans
    // « vérifier », « statistiqu » dans « statistique »).
    motifs: /\b(est.ce (que c['’]est |)vrai|c['’]est vrai (que|,|\s|\?)|vrai ou faux|est.ce (un |)faux|est.ce exact|mythe ou (réalité|realite)|est.ce un mythe|vérif|verif|fact.?check|prouve|preuve|démontre|demontre|réellement|reellement|vraiment (vrai|le cas|bon|mauvais|dangereux|efficace|utile|nocif|sain|risqué|risque)|(bon|mauvais|dangereux|nocif|bénéfique|benefique|efficace) pour (la|le|les|ta|ma|votre|notre|leur)|dans les faits|des (chiffres|données|donnees|statistiques)|statistiqu|pourcentage|proportion|étude (montre|dit|prouve|a montré)|selon (une |les |des |l['’]|leur )(étude|etude|donnée|donnee|chiffre|statistique|source|rapport|sondage)|d['’]après (une|les|des|le|la)|on (dit|prétend|pretend|raconte|entend) que|j['’]ai (lu|entendu|vu) (que|dire)|il (paraît|parait) que|rumeur|intox|désinformation|desinformation|fake.?news|canular)/i,
  },
  // ── Stratège — transformer une idée en plan, passer à l'action ─────────
  // Pas de « \b » final : il échoue sur les préfixes tronqués comme « planifi ».
  {
    persona: 'strategist',
    motif: 'tu veux un plan d’action',
    poids: 3,
    motifs: /\b(plan\b|planifi|étape|etape|comment (faire|m['’]y prendre|procéder|proceder|s['’]y prendre|lancer|démarrer|demarrer|commencer|organiser|réussir|reussir|atteindre|obtenir|convaincre|gérer|gerer|mettre)|par où (commencer|démarrer)|feuille de route|road.?map|stratégie|strategie|tactique|méthode pour|methode pour|démarche|demarche|marche à suivre|objectif|priorité|priorite|mettre en (place|œuvre|oeuvre)|exécut|execut|déploie|deploie|monter (une|un|ma|mon)|créer (une|un) (entreprise|startup|boîte|boite|projet|business)|aide.moi à (faire|créer|creer|construire|monter|lancer|organiser|planifier|préparer|preparer))/i,
  },
  // ── Arbitre — trancher entre des options, conclure ─────────────────────
  {
    persona: 'arbiter',
    motif: 'tu veux qu’on tranche',
    poids: 3,
    motifs: /\b(tranch|aide.moi à (choisir|décider|decider|trancher)|que (dois|devrais).je (faire|choisir|prendre|décider|decider)|quel(le|s|les)? (est|serait|sont) (la |le |les )?(meilleur|pire|mieux|bon choix)|lequel (choisir|est (le )?mieux|vaut mieux)|pour ou contre|le pour et le contre|avantages et (inconvénients|inconvenients)|vaut.il mieux|vaut.il (vraiment )?la peine|faut.il (vraiment |plutôt |plutot )|plutôt .+ ou |verdict|conclusion|au final|en (définitive|definitive|conclusion)|décide (pour moi|à ma place)|decide (pour moi|à ma place)|ton avis (sur|entre)|donne.moi ton avis)/i,
  },
  // ── Opposant — mettre une position, une opinion, une valeur à l'épreuve ─
  {
    persona: 'opponent',
    motif: 'tu défends une position à mettre à l’épreuve',
    poids: 2.6,
    motifs: /\b(je (pense|crois|estime|considère|considere|trouve|dirais|suis (convaincu|sûr|sur|persuadé|persuade|d['’]accord)) (que|qu['’])|mon (avis|sens)\b|selon moi|pour moi|d['’]après moi|mon opinion|convain(c|cs).moi|challenge|conteste|contredis|réfute|refute|défends le contraire|defends le contraire|joue (à )?l['’]avocat du diable|prends le contre.?pied|mets? (ça |ca |cela |mon idée )?à l['’]épreuve|attaque (mon|cet|cette|mes)|mon (argument|point de vue|opinion)|ma (position|thèse|these|conviction|vision)|mes (arguments|convictions)|il faut\b|il faudra|on (devrait|doit|ne devrait|ne doit))/i,
  },
  // ── Architecte — analyser la structure d'un raisonnement ───────────────
  {
    persona: 'architect',
    motif: 'tu soumets un raisonnement à analyser',
    poids: 1.6,
    motifs: /\b(donc\b|par conséquent|par consequent|ce qui prouve|si .+ alors|logiqu|raisonnement|cohéren|coheren|argument(ation|)\b|prémisse|premisse|syllogisme|déduction|deduction|il s['’]ensuit|d['’]où\b|puisque|parce que|car\b|est.ce (logique|cohérent|coherent|valide)|où est la faille|quelle est la faille|analyse (mon|ce|le) raisonnement|mon raisonnement (tient|est.il))/i,
  },
];

const DEFAUT: Persona = 'architect';
const MOTIF_DEFAUT = 'analyse de la structure de ton raisonnement';

/**
 * Repli quand aucun signal lexical ne se détache : on aiguille sur la FORME de
 * la phrase (type de question, superlatif, choix binaire). C'est ce qui évite
 * de tout renvoyer à l'Architecte par défaut.
 */
function deduireParForme(t: string): { persona: Persona; motif: string } | null {
  const s = t.trim();
  const question = /\?/.test(s);
  // Affirmation forte (superlatif / absolu) → une position à contester.
  if (/\b(le|la|les|un|une) (meilleur|pire|plus (grand|beau|important|efficace|dangereux)|seul|seule|unique)\b|\b(toujours|jamais|tous|toutes|aucun|aucune|personne|tout le monde|rien ne|n['’]existe|c['’]est (le|la) (meilleur|pire))\b/i.test(s)) {
    return { persona: 'opponent', motif: 'affirmation forte à mettre à l’épreuve' };
  }
  // Comment → plan ; Pourquoi → analyse.
  if (/\bcomment\b/i.test(s)) return { persona: 'strategist', motif: 'tu veux savoir comment faire' };
  if (/\bpourquoi\b/i.test(s)) return { persona: 'architect', motif: 'tu cherches le pourquoi d’un raisonnement' };
  // Choix binaire « X ou Y ? ».
  if (question && /\b(ou|plutôt|plutot)\b/i.test(s)) return { persona: 'arbiter', motif: 'tu hésites entre des options' };
  // Question factuelle ouverte (combien / quel / qui / où / quand) → vérifier.
  if (question && /\b(combien|quel(le|s|les)?|qui|où|ou|quand|est.ce que)\b/i.test(s)) {
    return { persona: 'factchecker', motif: 'question factuelle à vérifier' };
  }
  return null;
}

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
    const forme = deduireParForme(t);
    if (forme) return { persona: forme.persona, score: 0.5, motif: forme.motif, parDefaut: false };
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

/**
 * Deux contradicteurs complémentaires pour le « double regard ».
 *
 * L'intérêt d'une double réponse est le CONTRASTE : deux angles qui ne se
 * recouvrent pas. Le premier est celui qu'on aurait choisi seul ; le second
 * est son complément naturel — l'angle qu'il ne couvre pas.
 */
const COMPLEMENT: Record<Persona, Persona> = {
  architect: 'factchecker',   // la logique, puis les faits
  factchecker: 'architect',   // les faits, puis la logique
  opponent: 'arbiter',        // l'attaque, puis la synthèse qui tranche
  arbiter: 'opponent',        // la synthèse, puis l'attaque frontale
  strategist: 'opponent',     // le plan, puis ses risques
};

export function deduceDuo(texte: string): [Persona, Persona] {
  const premier = deducePersona(texte).persona;
  return [premier, COMPLEMENT[premier]];
}

/**
 * Ordre de plusieurs contradicteurs pour une réponse multi-personas.
 *
 * On part de celui qu'on aurait choisi seul, puis on ajoute les autres dans un
 * ordre de DIVERSITÉ des angles (logique → attaque → faits → action → synthèse),
 * sans doublon. C'est cet ordre que suivra le mode investigation : chaque
 * persona relit le précédent, l'Arbitre finissant volontiers par trancher.
 */
const ORDRE_DIVERSITE: Persona[] = ['architect', 'opponent', 'factchecker', 'strategist', 'arbiter'];

export function ordrePersonas(texte: string, n: number): Persona[] {
  const borne = Math.max(2, Math.min(Math.floor(n) || 2, ORDRE_DIVERSITE.length));
  const premier = deducePersona(texte).persona;
  const suite = ORDRE_DIVERSITE.filter((p) => p !== premier);
  return [premier, ...suite].slice(0, borne);
}
