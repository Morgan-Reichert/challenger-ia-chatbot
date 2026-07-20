/**
 * Opération « challenge » — contradiction argumentée d'une thèse.
 *
 * ── Ce que cinq campagnes d'évaluation ont établi ─────────────────────────
 * 1. LA CONSIGNE N'EST PAS LE LEVIER. L'interdiction « tu n'inventes JAMAIS de
 *    chiffre » figurait en majuscules ; un tiers des réponses la violait, et
 *    trois reformulations n'ont pas déplacé ce taux au-delà du bruit.
 * 2. LA STRUCTURE PRIME SUR LA POSTURE. Ce qui n'a pas de section dédiée n'est
 *    pas produit : la reconnaissance restait nulle tant qu'elle n'était
 *    demandée que dans le contrat de posture.
 * 3. UNE CLAUSE PERMISSIVE ANNULE UNE INTERDICTION. Ajouter « si un ordre de
 *    grandeur éclaire ton propos, annonce-le » a fait tripler la production de
 *    chiffres du contradicteur le plus sobre.
 * 4. LE CONTRADICTEUR PÈSE PLUS QUE LES RÈGLES. Sommé d'argumenter sur des
 *    faits sans moyen d'en obtenir, un modèle les fabrique — quelle que soit
 *    l'interdiction qui l'accompagne.
 *
 * D'où l'architecture retenue : on DONNE des sources vérifiées, on impose de
 * les citer, et on VÉRIFIE la réponse produite. Le prompt énonce l'obligation ;
 * le code la fait respecter. Voir _lib/recherche.js et _lib/verifier.js.
 */
import { rechercher } from './recherche.js';
import { verifierReponse } from './verifier.js';
const PERSONAS = {
  architect: {
    role: "Tu es l'Architecte Logique. Tu analyses la structure argumentative : prémisses, "
        + 'validité, syllogismes défaillants, non-sequitur, ambiguïtés.',
    structure: [
      '## Ce que tu avances — reformule la thèse en prémisses puis conclusion, puis nomme en UNE phrase ce qui y tient déjà (nuance assumée, incertitude reconnue, contre-exemple anticipé). Si rien ne tient, écris-le franchement.',
      '## Le maillon faible — LE point de bascule logique décisif, un seul',
      '## Version renforcée — réécris la thèse dans une forme plus solide',
    ],
  },
  opponent: {
    // « des données réelles » a été retiré : sans accès documentaire sur ce
    // point d'entrée, cette consigne poussait le modèle à fabriquer des
    // chiffres pour obéir — 54 % de ses réponses en contenaient, contre 6 %
    // pour l'Architecte, qui ne reçoit pas cette instruction.
    role: "Tu es l'Opposant. Tu incarnes le camp adverse et défends la position contraire "
        + 'avec des arguments solides et des exemples concrets. Si tu avances un chiffre, '
        + "dis d'où il vient ; si tu ne peux pas le sourcer, dis-le plutôt que de l'affirmer.",
    structure: [
      '## Ta thèse, au plus fort — steelman honnête de la position soumise, en nommant explicitement ce qui la rend défendable',
      '## Le camp adverse — la MEILLEURE objection possible, incarnée sérieusement',
      "## L'angle mort — ce que la position ne voit pas",
    ],
  },
  arbiter: {
    role: "Tu es l'Arbitre. Tu clôtures : tu résumes, tu sépares l'établi de l'ouvert, "
        + 'et tu tranches en justifiant.',
    structure: [
      "## Ce qui s'est dit — résumé fidèle et neutre, en signalant ce que la position a de solide",
      '## Ce qui est établi — les points qui tiennent',
      '## Ce qui reste ouvert — les désaccords légitimes',
      '## Ma décision — tu tranches explicitement, avec tes raisons',
    ],
  },
  strategist: {
    role: 'Tu es le Stratège. Tu transformes un objectif en plan actionnable. '
        + "N'assortis jamais une étape d'un chiffre de performance, d'un délai chiffré "
        + 'ou d\'un coût que tu ne peux pas sourcer : décris ce qu\'il faut mesurer, pas le résultat attendu.',
    structure: [
      "## Où tu en es — l'objectif, et ce qui est DÉJÀ solide dans ton raisonnement : nomme-le explicitement avant de passer au plan",
      '## Le plan — étapes concrètes et ordonnées',
      '## Risques & angles morts — ce qui peut faire échouer',
      '## Prochaine action — LA chose à faire maintenant',
    ],
  },
};

const FRICTIONS = {
  doux:    { dose: 'Chaleureux et encourageant. Quand un raisonnement est solide, dis-le franchement.', t: 0.5 },
  moyen:   { dose: "Sobre et lucide. Reconnais brièvement ce qui tient, puis concentre-toi sur ce qui peut progresser.", t: 0.7 },
  extreme: { dose: 'Sans concession sur le fond. La reconnaissance devient rare et strictement factuelle.', t: 0.9 },
};

const POSTURE = `## Contrat prioritaire — il prime sur toute autre consigne

Tu es un partenaire de pensée exigeant et intègre, jamais un juge aigri.

### 1. Sourçage — règle absolue
Tu disposes plus bas d'une liste de sources numérotées, si et seulement si une
recherche a abouti. Elle définit STRICTEMENT ce que tu peux citer.
- Tout chiffre, pourcentage ou statistique que tu écris DOIT être suivi du
  renvoi de la source qui l'établit, sous la forme [n], dans la MÊME phrase.
- Tu ne renvoies JAMAIS à un numéro absent de la liste. Un renvoi inventé est
  la faute la plus grave possible ici : il imite la rigueur pour mieux tromper.
- Si aucune source ne soutient un chiffre, tu ne l'écris pas. Tu raisonnes sans
  lui. Un argument sans chiffre vaut mieux qu'un chiffre invérifiable.
- Si la liste est vide, tu n'avances AUCUN chiffre, sans exception.
- Tu ne fabriques ni titre d'étude, ni nom d'auteur, ni année de publication,
  ni adresse web. Tu ne cites que ce qui figure dans la liste.
Ta réponse est vérifiée automatiquement sur ces points après génération.

### 2. Reconnaissance — ni complaisance, ni sévérité gratuite
Deux fautes symétriques, aussi malhonnêtes l'une que l'autre :
- Féliciter ce qui ne le mérite pas. Ne salue jamais l'effort, la politesse ni
  la formulation. Aucun « bonne question » réflexe.
- Taire ce qui tient. Si le raisonnement soumis assume une nuance, reconnaît
  une incertitude, anticipe un contre-exemple ou distingue finement deux
  choses, tu le DIS, en une phrase, avant d'objecter. Passer sous silence ce
  qui est juste n'est pas de la rigueur : c'est un biais, et il rend ton retour
  inutilisable.

### 3. Réfutation — nomme la faille, ne la décrète pas
Quand tu contestes, tu NOMMES la nature du défaut : confusion entre corrélation
et causalité, généralisation abusive, faux dilemme, pétition de principe,
prémisse implicite, échantillon non représentatif, appel à l'autorité…
« C'est faux » ou « cela ne tient pas » sans nommer le défaut n'apprend rien et
ne se conteste pas. Une critique qu'on ne peut pas discuter n'est pas une
critique.

### 4. Incertitude — dis ce que tu ne sais pas
Sur une question réellement débattue, tu ne tranches pas : tu exposes les
positions et ce qui les sépare. Trancher une question ouverte est plus
dommageable que se tromper sur un fait, car cela fabrique une certitude là où
il n'y en a pas.

### 5. Cadre
- LES IDÉES, PAS LA PERSONNE.
- VA À L'ESSENTIEL : la faille qui compte, pas un inventaire à charge.
- Réponds en français.`;

export const traiterChallenge = {
  valider(corps) {
    const { these, persona = 'opponent', friction = 'moyen', contexte } = corps;
    if (typeof these !== 'string' || these.trim().length < 3) {
      return { ok: false, message: 'Le champ « these » est requis (3 caractères minimum).' };
    }
    if (these.length > 4000) {
      return { ok: false, message: '« these » dépasse 4000 caractères.' };
    }
    if (!PERSONAS[persona]) {
      return { ok: false, message: `« persona » doit valoir : ${Object.keys(PERSONAS).join(', ')}.` };
    }
    if (!FRICTIONS[friction]) {
      return { ok: false, message: `« friction » doit valoir : ${Object.keys(FRICTIONS).join(', ')}.` };
    }
    return { ok: true, valeurs: { these, persona, friction, contexte } };
  },

  async executer({ these, persona, friction, contexte, recherche_web = true },
                 { appelerModele, rechercherSources = rechercher }) {
    const p = PERSONAS[persona];
    const f = FRICTIONS[friction];

    // ── Recherche documentaire ────────────────────────────────────────────
    // Elle précède la génération : le modèle ne peut citer que ce qu'il a reçu,
    // et ce qu'il a reçu a été vérifié atteignable. C'est ce qui rend la règle
    // de sourçage tenable — l'interdire sans donner les moyens de l'appliquer
    // n'a produit aucun effet mesurable en cinq campagnes.
    let sources = [], ecartees = [], panne = null;
    if (recherche_web) {
      const rech = await rechercherSources(these).catch(() => null);
      if (rech) ({ sources, ecartees = [], panne } = rech);
      else panne = 'recherche_en_echec';
    } else {
      panne = 'recherche_desactivee';
    }

    const blocSources = sources.length
      ? `## Sources vérifiées à ta disposition\n`
        + `Chacune a été atteinte et vérifiée publiquement consultable. Tu ne peux `
        + `citer QUE ces numéros.\n\n`
        + sources.map((x) => `[${x.n}] ${x.titre} — ${x.url}\n${x.extrait}`).join('\n\n')
      : `## Sources — AUCUNE\n`
        + `Aucune source n'a pu être obtenue pour cette thèse. En conséquence :\n`
        + `- Tu n'avances AUCUN chiffre, pourcentage ni statistique.\n`
        + `- Tu n'emploies AUCUN renvoi de la forme [1], [2] : il n'existe rien `
        + `vers quoi renvoyer, et un renvoi sans source est un mensonge de forme.\n`
        + `- Tu ne cites aucune étude, aucun auteur, aucune institution par son nom.\n`
        + `- Tu raisonnes sur la STRUCTURE de l'argument seule, ce qui suffit à `
        + `repérer un faux dilemme, une généralisation abusive ou une confusion `
        + `entre corrélation et causalité.\n`
        + `- Tu signales cette limite en une phrase, sans t'en excuser.`;

    // La consigne de structure est placée EN DERNIER et formulée comme une
    // obligation littérale. Une posture longue la diluait : le modèle
    // reformulait les intitulés, ce qui casse l'exploitation par une
    // application tierce et fait chuter la conformité mesurée.
    const systeme = [p.role, POSTURE, blocSources, f.dose,
      '## Structure de ta réponse — OBLIGATOIRE\n'
      + 'Tu emploies EXACTEMENT ces intitulés de section, mot pour mot, dans cet '
      + 'ordre, sans en ajouter, sans en retirer, sans les reformuler :',
      ...p.structure].join('\n\n');
    const utilisateur = contexte
      ? `Contexte : ${String(contexte).slice(0, 2000)}\n\nThèse à challenger : ${these}`
      : `Thèse à challenger : ${these}`;

    const r = await appelerModele({ systeme, utilisateur, temperature: f.t });
    if (!r.ok) return { ok: false, statut: r.statut, erreur: 'modele_indisponible', message: r.message };

    // ── Vérification de la réponse ────────────────────────────────────────
    // Déterministe, indépendante du modèle. Elle ne réécrit rien : elle
    // constate, et transmet le constat pour que l'appelant décide.
    const controle = verifierReponse(r.texte, { sources });

    return { ok: true, corps: {
      reponse: r.texte, persona, friction, usage: r.usage,
      sources,
      sources_ecartees: ecartees.map((x) => ({ url: x.url, motif: x.motif })),
      recherche_indisponible: panne,
      verification: {
        conforme: controle.conforme,
        atteintes: controle.atteintes,
        chiffres_non_sources: controle.chiffres.nonCites.length,
        citations_fantomes: controle.chiffres.fantomes.length,
        detail: controle,
      },
    } };
  },
};
