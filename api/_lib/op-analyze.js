/**
 * Opération « analyze » — analyse du raisonnement d'un texte.
 * Logique pure, appelée par api/v1/[action].js.
 */
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

export const traiterAnalyze = {
  valider(corps) {
    const { texte } = corps;
    if (typeof texte !== 'string' || texte.trim().length < 20) {
      return { ok: false, message: 'Le champ « texte » est requis (20 caractères minimum).' };
    }
    if (texte.length > 8000) {
      return { ok: false, message: '« texte » dépasse 8000 caractères.' };
    }
    return { ok: true, valeurs: { texte } };
  },

  async executer({ texte }, { appelerModele }) {
    const r = await appelerModele({
      systeme: SYSTEME,
      utilisateur: `Texte à analyser :\n\n${texte}`,
      modele: 'mistral-large-latest',
      temperature: 0.3,
    });
    if (!r.ok) return { ok: false, statut: r.statut, erreur: 'modele_indisponible', message: r.message };

    const brut = extraireJson(r.texte);
    if (!brut) {
      return { ok: false, statut: 502, erreur: 'reponse_illisible',
               message: "Le modèle n'a pas produit une analyse exploitable." };
    }

    return { ok: true, corps: {
      biais: nettoyer(brut.biais, BIAIS),
      forces: nettoyer(brut.forces, FORCES),
      synthese: typeof brut.synthese === 'string' ? brut.synthese : '',
      usage: r.usage,
    } };
  },
};
