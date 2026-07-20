/**
 * Opération « factcheck » — vérification factuelle multidimensionnelle.
 * Logique pure, appelée par api/v1/[action].js.
 */
const SYSTEME = `Tu es un MOTEUR DE FACT-CHECKING systémique et probabiliste.

RÈGLES FONDAMENTALES (impératives) :
- Ne confonds JAMAIS « absence de preuve » et « preuve d'absence ». Si les données manquent, dis-le explicitement.
- Sépare trois évaluations distinctes : FACTUELLE, RISQUE, CONSENSUS. Le consensus n'est jamais assimilé à la vérité.
- DEUX FAUTES SYMÉTRIQUES, aussi graves l'une que l'autre :
  (a) TRANCHER UNE QUESTION OUVERTE. Si les données soutiennent des conclusions opposées selon la méthode, le contexte ou la période, « fact » vaut « inconcluant ». Porter la nuance dans « consensus » tout en tranchant dans « fact » fabrique une certitude que les preuves ne soutiennent pas.
  (b) REFUSER DE TRANCHER CE QUI EST TRANCHÉ. Une affirmation contredite par un corpus de preuves solide et convergent est FAUSSE : réponds « faux » ou « probable_faux ». Répondre « inconcluant » sur une contre-vérité documentée — une croyance populaire démentie, une théorie invalidée, une causalité réfutée — n'est pas de la prudence, c'est une erreur de même nature que la précédente, en sens inverse. Elle laisse croire qu'un débat existe là où il n'y en a plus.
  TEST À APPLIQUER, dans cet ordre :
  1. Existe-t-il un corpus de preuves convergent qui contredit l'affirmation ? Alors « faux » ou « probable_faux ».
  2. Existe-t-il un corpus convergent qui la soutient ? Alors « vrai » ou « probable_vrai ».
  3. Les preuves disponibles pointent-elles dans des directions opposées selon la méthode ou le contexte ? Alors « inconcluant ».
  N'emploie « inconcluant » qu'au terme de ce test, jamais par défaut ni par précaution.
- COHÉRENCE : si « consensus » vaut « debattu » ou « controverse », alors « fact » ne peut pas valoir « vrai » ni « faux », et « confidence » ne peut pas dépasser « plausible ».
- La confiance mesure la ROBUSTESSE DES PREUVES, pas une vérité absolue.
- Évalue les sources de façon critique : indépendance, conflits d'intérêts, biais.
- Tu n'inventes JAMAIS de chiffre non sourçable.

Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans bloc de code, à ce format EXACT :
{
  "fact": "vrai|probable_vrai|inconnu|non_verifie|inconcluant|probable_faux|faux",
  "risk": "safe|faible|modere|dangereux|critique",
  "consensus": "fort|modere|debattu|controverse|marginal",
  "confidence": "speculatif|faible|plausible|eleve|quasi_certain",
  "resume": "synthèse en une à deux phrases",
  "analyse": "justification détaillée",
  "limites": "ce qui manque pour conclure",
  "contre_hypotheses": "hypothèses alternatives et biais possibles"
}
Réponds en français.`;

import { rechercher } from './recherche.js';

const VALEURS = {
  fact: ['vrai', 'probable_vrai', 'inconnu', 'non_verifie', 'inconcluant', 'probable_faux', 'faux'],
  risk: ['safe', 'faible', 'modere', 'dangereux', 'critique'],
  consensus: ['fort', 'modere', 'debattu', 'controverse', 'marginal'],
  confidence: ['speculatif', 'faible', 'plausible', 'eleve', 'quasi_certain'],
};


/** Extraction tolérante : le modèle encadre parfois son JSON de texte. */
/**
 * Extraction du verdict.
 *
 * Le mode JSON natif rend normalement ce filet inutile. Il est conservé parce
 * qu'un modèle reste capable de s'en écarter, et parce que les deux défauts
 * traités ici ont été observés en conditions réelles :
 *   — la réponse entourée d'une clôture Markdown ```json ;
 *   — de vrais retours à la ligne à l'intérieur des chaînes, que JSON
 *     interdit et qui rendaient une réponse sur deux inexploitable.
 */
function extraireJson(texte) {
  const essais = [];
  essais.push(texte);

  // Clôture Markdown éventuelle.
  const sansCloture = texte.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  if (sansCloture !== texte) essais.push(sansCloture);

  // Premier objet accolade à accolade.
  const m = sansCloture.match(/\{[\s\S]*\}/);
  if (m) essais.push(m[0]);

  for (const candidat of essais) {
    try { return JSON.parse(candidat); } catch { /* candidat suivant */ }
  }

  // Dernier recours : échapper les caractères de contrôle présents dans les
  // chaînes. On suit l'état « dans une chaîne » plutôt que d'appliquer un
  // remplacement global, qui abîmerait la structure du document.
  const source = m ? m[0] : sansCloture;
  let repare = '', dansChaine = false, echappe = false;
  for (const c of source) {
    if (echappe) { repare += c; echappe = false; continue; }
    if (c === '\\') { repare += c; echappe = true; continue; }
    if (c === '"') { dansChaine = !dansChaine; repare += c; continue; }
    if (dansChaine && c === '\n') { repare += '\\n'; continue; }
    if (dansChaine && c === '\r') { repare += '\\r'; continue; }
    if (dansChaine && c === '\t') { repare += '\\t'; continue; }
    repare += c;
  }
  try { return JSON.parse(repare); } catch { return null; }
}

export const traiterFactcheck = {
  valider(corps) {
    const { affirmation, recherche_web = true } = corps;
    if (typeof affirmation !== 'string' || affirmation.trim().length < 3) {
      return { ok: false, message: 'Le champ « affirmation » est requis (3 caractères minimum).' };
    }
    if (affirmation.length > 2000) {
      return { ok: false, message: '« affirmation » dépasse 2000 caractères.' };
    }
    return { ok: true, valeurs: { affirmation, recherche_web } };
  },

  async executer({ affirmation, recherche_web }, { appelerModele }) {
    // Même recherche vérifiée que la contradiction : sources atteignables,
    // murs payants écartés, repli encyclopédique si la clé payante manque.
    const { contexte, sources, ecartees = [], panne } = recherche_web
      ? await rechercher(affirmation)
      : { contexte: '', sources: [], panne: null };

    const utilisateur = contexte
      ? `Affirmation à vérifier : ${affirmation}\n\nSources disponibles :\n${contexte}`
      : `Affirmation à vérifier : ${affirmation}\n\n(Aucune source web fournie : fonde ton évaluation sur tes connaissances et signale-le dans les limites.)`;

    const r = await appelerModele({ systeme: SYSTEME, utilisateur, modele: 'mistral-large-latest', temperature: 0.3, json: true });
    if (!r.ok) return { ok: false, statut: r.statut, erreur: 'modele_indisponible', message: r.message };

    const brut = extraireJson(r.texte);
    if (!brut) {
      return { ok: false, statut: 502, erreur: 'reponse_illisible',
               message: "Le modèle n'a pas produit un verdict exploitable." };
    }

    // Toute valeur hors énumération est ramenée à l'état le plus prudent :
    // mieux vaut « inconnu » qu'une catégorie inventée.
    const norm = (champ, defaut) => (VALEURS[champ].includes(brut[champ]) ? brut[champ] : defaut);

    return { ok: true, corps: {
      affirmation,
      verdict: {
        fact: norm('fact', 'inconnu'),
        risk: norm('risk', 'faible'),
        consensus: norm('consensus', 'debattu'),
        confidence: norm('confidence', 'faible'),
      },
      resume: brut.resume ?? '',
      analyse: brut.analyse ?? '',
      limites: brut.limites ?? '',
      contre_hypotheses: brut.contre_hypotheses ?? '',
      base: sources.length ? 'sources' : 'qualitatif',
      // Distingue « aucune source trouvée » de « recherche en panne ». Sans
      // cette distinction, un verdict rendu à l'aveugle est indiscernable d'un
      // verdict rendu sur un sujet sans couverture web.
      recherche_indisponible: panne ?? null,
      sources_ecartees: ecartees.map((x) => ({ url: x.url, motif: x.motif })),
      sources,
      usage: r.usage,
    } };
  },
};
