/**
 * POST /api/v1/factcheck — vérification factuelle multidimensionnelle.
 *
 * Corps :  { affirmation: string, recherche_web?: boolean }
 * Réponse : { verdict: {...}, analyse: string, sources: [...], credits_restants }
 *
 * Coût : 2 crédits (la recherche web et l'analyse de sources sont plus lourdes).
 *
 * Le verdict sépare volontairement quatre dimensions habituellement confondues.
 * Toutes sont des ÉNUMÉRATIONS FERMÉES, jamais des scores décimaux : un indice
 * de confiance « 0,87 » serait une précision fabriquée, sans méthode derrière.
 */
import { cors } from '../_lib/cors.js';
import { autoriser, entetesApi } from '../_lib/apikey.js';
import { appelerModele } from '../_lib/mistral.js';

const SYSTEME = `Tu es un MOTEUR DE FACT-CHECKING systémique et probabiliste.

RÈGLES FONDAMENTALES (impératives) :
- Ne confonds JAMAIS « absence de preuve » et « preuve d'absence ». Si les données manquent, dis-le explicitement.
- Sépare trois évaluations distinctes : FACTUELLE, RISQUE, CONSENSUS. Le consensus n'est jamais assimilé à la vérité.
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

const VALEURS = {
  fact: ['vrai', 'probable_vrai', 'inconnu', 'non_verifie', 'inconcluant', 'probable_faux', 'faux'],
  risk: ['safe', 'faible', 'modere', 'dangereux', 'critique'],
  consensus: ['fort', 'modere', 'debattu', 'controverse', 'marginal'],
  confidence: ['speculatif', 'faible', 'plausible', 'eleve', 'quasi_certain'],
};

/** Recherche web optionnelle. Échoue en silence : l'analyse reste possible sans. */
async function chercher(requete) {
  const cle = process.env.TAVILY_API_KEY;
  if (!cle) return { contexte: '', sources: [] };
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: cle, query: requete, search_depth: 'advanced',
        max_results: 6, include_answer: 'advanced',
      }),
    });
    if (!r.ok) return { contexte: '', sources: [] };
    const d = await r.json();
    const sources = (d.results || []).slice(0, 6).map((s, i) => ({
      n: i + 1, titre: s.title, url: s.url,
    }));
    const contexte = [
      d.answer ? `Synthèse : ${d.answer}` : '',
      ...sources.map((s, i) => `[${s.n}] ${s.titre} — ${s.url}\n${(d.results[i]?.content || '').slice(0, 500)}`),
    ].filter(Boolean).join('\n\n');
    return { contexte, sources };
  } catch {
    return { contexte: '', sources: [] };
  }
}

/** Extraction tolérante : le modèle encadre parfois son JSON de texte. */
function extraireJson(texte) {
  try { return JSON.parse(texte); } catch { /* on tente une extraction */ }
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'methode_non_autorisee', message: 'Utilisez POST.' });
  }

  const { affirmation, recherche_web = true } = req.body || {};
  if (typeof affirmation !== 'string' || affirmation.trim().length < 3) {
    return res.status(400).json({
      erreur: 'parametre_invalide',
      message: 'Le champ « affirmation » est requis (3 caractères minimum).',
    });
  }
  if (affirmation.length > 2000) {
    return res.status(400).json({ erreur: 'parametre_invalide', message: '« affirmation » dépasse 2000 caractères.' });
  }

  const auth = await autoriser(req, 'factcheck');
  if (!auth.ok) {
    entetesApi(res);
    return res.status(auth.statut).json({ erreur: auth.erreur, message: auth.message, credits: auth.credits });
  }

  const { contexte, sources } = recherche_web ? await chercher(affirmation) : { contexte: '', sources: [] };

  const utilisateur = contexte
    ? `Affirmation à vérifier : ${affirmation}\n\nSources disponibles :\n${contexte}`
    : `Affirmation à vérifier : ${affirmation}\n\n(Aucune source web fournie : fonde ton évaluation sur tes connaissances et signale-le dans les limites.)`;

  const r = await appelerModele({ systeme: SYSTEME, utilisateur, modele: 'mistral-large-latest', temperature: 0.3 });
  entetesApi(res, auth.creditsRestants);

  if (!r.ok) {
    return res.status(r.statut).json({ erreur: 'modele_indisponible', message: r.message });
  }

  const brut = extraireJson(r.texte);
  if (!brut) {
    return res.status(502).json({
      erreur: 'reponse_illisible',
      message: "Le modèle n'a pas produit un verdict exploitable.",
    });
  }

  // Les valeurs hors énumération sont ramenées à l'état le plus prudent :
  // mieux vaut « inconnu » qu'une catégorie inventée.
  const norm = (champ, defaut) =>
    VALEURS[champ].includes(brut[champ]) ? brut[champ] : defaut;

  return res.status(200).json({
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
    sources,
    credits_consommes: auth.cout,
    credits_restants: auth.creditsRestants,
    usage: r.usage,
  });
}
