/**
 * API publique v1 — point d'entrée unique.
 *
 *   POST /api/v1/challenge  → contradiction argumentée      (1 crédit)
 *   POST /api/v1/factcheck  → vérification factuelle        (2 crédits)
 *   POST /api/v1/analyze    → analyse de raisonnement       (1 crédit)
 *
 * Les trois opérations sont regroupées dans une seule fonction serverless.
 * Vercel plafonne le nombre de fonctions par déploiement : trois fichiers
 * séparés consommaient trois emplacements pour un code très proche. Le routage
 * par segment dynamique préserve les URL publiques — la documentation reste
 * valable — tout en n'occupant qu'un seul emplacement.
 */
import { cors } from '../_lib/cors.js';
import { autoriser, entetesApi } from '../_lib/apikey.js';
import { appelerModele } from '../_lib/mistral.js';
import { traiterChallenge } from '../_lib/op-challenge.js';
import { traiterFactcheck } from '../_lib/op-factcheck.js';
import { traiterAnalyze } from '../_lib/op-analyze.js';

const OPERATIONS = {
  challenge: traiterChallenge,
  factcheck: traiterFactcheck,
  analyze: traiterAnalyze,
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const action = String(req.query?.action ?? '').toLowerCase();
  const operation = OPERATIONS[action];

  if (!operation) {
    return res.status(404).json({
      erreur: 'point_entree_inconnu',
      message: `Points d'entrée disponibles : ${Object.keys(OPERATIONS).join(', ')}.`,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'methode_non_autorisee', message: 'Utilisez POST.' });
  }

  // La validation des paramètres précède l'authentification : une requête
  // malformée ne doit pas consommer de crédit.
  const validation = operation.valider(req.body || {});
  if (!validation.ok) {
    return res.status(400).json({ erreur: 'parametre_invalide', message: validation.message });
  }

  const auth = await autoriser(req, action);
  if (!auth.ok) {
    entetesApi(res);
    return res.status(auth.statut).json({ erreur: auth.erreur, message: auth.message, credits: auth.credits });
  }

  try {
    const resultat = await operation.executer(validation.valeurs, { appelerModele });
    entetesApi(res, auth.creditsRestants);

    if (!resultat.ok) {
      return res.status(resultat.statut).json({ erreur: resultat.erreur, message: resultat.message });
    }

    return res.status(200).json({
      ...resultat.corps,
      credits_consommes: auth.cout,
      credits_restants: auth.creditsRestants,
    });
  } catch (e) {
    console.error(`[api/v1/${action}]`, e?.message ?? e);
    entetesApi(res, auth.creditsRestants);
    return res.status(500).json({ erreur: 'erreur_interne', message: 'Traitement impossible.' });
  }
}
