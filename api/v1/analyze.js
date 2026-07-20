/**
 * POST /api/v1/analyze — analyse du raisonnement contenu dans un texte.
 *
 * Corps :  { texte: string }
 * Réponse : { biais: [...], forces: [...], synthese, credits_restants }
 *
 * Coût : 1 crédit.
 *
 * Les catégories sont des ÉNUMÉRATIONS FERMÉES : le modèle ne peut pas
 * inventer un biais, ce qui rend la sortie exploitable programmatiquement.
 */
import { cors } from '../_lib/cors.js';
import { autoriser, entetesApi } from '../_lib/apikey.js';
import { appelerModele } from '../_lib/mistral.js';

const BIAIS = {
  generalisation_abusive: 'Généralisation abusive',
  correlation_causalite: 'Confusion corrélation / causalité',
  appel_autorite: "Appel à l'autorité",
  biais_confirmation: 'Biais de confirmation',
  homme_de_paille: 'Homme de paille',
  faux_dilemme: 'Faux dilemme',
  pente_glissante: 'Pente glissante',
  ad_hominem: 'Attaque personnelle',
  appel_emotion: "Appel à l'émotion",
  cherry_picking: 'Sélection biaisée',
  anecdote: 'Preuve anecdotique',
  petition_principe: 'Raisonnement circulaire',
};

const FORCES = {
  nuance: 'Nuance, refus du simplisme',
  demande_preuve: 'Exigence de preuves',
  contre_exemple: 'Anticipation des contre-exemples',
  distinction: 'Distinction conceptuelle fine',
  incertitude_assumee: "Incertitude assumée",
  steelman: "Reformulation de l'objection au plus fort",
  hypothese_alternative: 'Exploration d’hypothèses alternatives',
  causalite_prudente: 'Prudence sur la causalité',
  definition_claire: 'Termes clairement définis',
  revision: 'Révision honnête de sa position',
};

const SYSTEME = `Tu analyses la QUALITÉ DE RAISONNEMENT d'un texte.

Tu relèves uniquement ce qui est RÉELLEMENT présent. Ne force jamais une détection :
un texte peut ne contenir aucun biais, comme aucune force particulière. Un relevé
complaisant ou un reproche fabriqué rendrait l'analyse inutilisable.

Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour, à ce format :
{
  "biais": [ { "code": "<clé>", "extrait": "citation courte du texte", "explication": "pourquoi" } ],
  "forces": [ { "code": "<clé>", "extrait": "citation courte", "explication": "pourquoi" } ],
  "synthese": "deux à trois phrases sur la solidité générale du raisonnement"
}

Clés de biais autorisées : ${Object.keys(BIAIS).join(', ')}.
Clés de forces autorisées : ${Object.keys(FORCES).join(', ')}.
N'utilise AUCUNE autre clé. Maximum 5 entrées par liste. Réponds en français.`;

function extraireJson(texte) {
  try { return JSON.parse(texte); } catch { /* tentative d'extraction */ }
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Filtre les entrées dont le code n'appartient pas à la taxonomie. */
function nettoyer(liste, reference) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((e) => e && typeof e.code === 'string' && e.code in reference)
    .slice(0, 5)
    .map((e) => ({
      code: e.code,
      libelle: reference[e.code],
      extrait: typeof e.extrait === 'string' ? e.extrait.slice(0, 300) : '',
      explication: typeof e.explication === 'string' ? e.explication.slice(0, 500) : '',
    }));
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'methode_non_autorisee', message: 'Utilisez POST.' });
  }

  const { texte } = req.body || {};
  if (typeof texte !== 'string' || texte.trim().length < 20) {
    return res.status(400).json({
      erreur: 'parametre_invalide',
      message: 'Le champ « texte » est requis (20 caractères minimum).',
    });
  }
  if (texte.length > 8000) {
    return res.status(400).json({ erreur: 'parametre_invalide', message: '« texte » dépasse 8000 caractères.' });
  }

  const auth = await autoriser(req, 'analyze');
  if (!auth.ok) {
    entetesApi(res);
    return res.status(auth.statut).json({ erreur: auth.erreur, message: auth.message, credits: auth.credits });
  }

  const r = await appelerModele({
    systeme: SYSTEME,
    utilisateur: `Texte à analyser :\n\n${texte}`,
    modele: 'mistral-large-latest',
    temperature: 0.3,
  });
  entetesApi(res, auth.creditsRestants);

  if (!r.ok) {
    return res.status(r.statut).json({ erreur: 'modele_indisponible', message: r.message });
  }

  const brut = extraireJson(r.texte);
  if (!brut) {
    return res.status(502).json({
      erreur: 'reponse_illisible',
      message: "Le modèle n'a pas produit une analyse exploitable.",
    });
  }

  return res.status(200).json({
    biais: nettoyer(brut.biais, BIAIS),
    forces: nettoyer(brut.forces, FORCES),
    synthese: typeof brut.synthese === 'string' ? brut.synthese : '',
    credits_consommes: auth.cout,
    credits_restants: auth.creditsRestants,
    usage: r.usage,
  });
}
