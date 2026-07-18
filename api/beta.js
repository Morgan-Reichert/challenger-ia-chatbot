/**
 * Résolution de la version beta de l'utilisateur, via STARIAX.
 *
 *  GET /api/beta → { enrolled, version, features }
 *
 * Pourquoi un proxy serveur plutôt qu'un appel direct depuis le navigateur :
 * l'endpoint de résolution prend un userId. Exposé côté client, n'importe qui
 * pourrait énumérer les UID pour lire le statut beta, le plan et l'activité
 * des autres utilisateurs. Ici l'uid provient du token Firebase VÉRIFIÉ, et le
 * secret produit ne quitte jamais le serveur.
 *
 * FAIL-OPEN : tant que STARIAX n'expose pas /api/beta/{id}/resolve (404), ou
 * si STARIAX_PRODUCT_SECRET est absent, on renvoie simplement « non inscrit ».
 * Aucune panne de STARIAX ne doit dégrader Challenger IA.
 */
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';
import { cors } from './_lib/cors.js';

const NOT_ENROLLED = { enrolled: false, version: null, features: [] };

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const { uid, skipped } = await verifyIdToken(req);
  if (isAuthEnforced() && !uid) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  if (skipped || !uid) return res.status(200).json(NOT_ENROLLED);

  const base = (process.env.STARIAX_BASE || '').replace(/\/+$/, '');
  const productId = process.env.STARIAX_PRODUCT_ID || '';
  const secret = process.env.STARIAX_PRODUCT_SECRET || '';
  if (!base || !productId || !secret) return res.status(200).json(NOT_ENROLLED);

  try {
    const r = await fetch(`${base}/api/beta/${productId}/resolve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
      // Attributs de ciblage poussés par le produit : STARIAX ne réplique pas
      // notre base utilisateurs. (Enrichir ici quand le ciblage l'exigera.)
      body: JSON.stringify({ userId: uid, attributes: {} }),
    });
    if (!r.ok) return res.status(200).json(NOT_ENROLLED);

    const data = await r.json();
    return res.status(200).json({
      enrolled: Boolean(data?.enrolled),
      version: data?.version ?? null,
      features: Array.isArray(data?.features) ? data.features : [],
    });
  } catch {
    return res.status(200).json(NOT_ENROLLED);
  }
}
