/**
 * TEMPORAIRE — diagnostic config Resend/reset. À SUPPRIMER une fois le reset OK.
 * Ouvre https://<ton-app>/api/reset-debug dans le navigateur.
 * Ne renvoie AUCUN secret (juste des booléens + statut Resend).
 */
import { getAdminAuth } from './_lib/admin.js';

export default async function handler(req, res) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || null;
  const out = {
    hasApiKey: !!apiKey,
    from,                       // l'adresse d'envoi (pas un secret)
    hasAdminAuth: !!getAdminAuth(),
    resend: null,
  };
  if (apiKey) {
    try {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await r.json().catch(() => null);
      out.resend = {
        status: r.status, // 200 = clé OK ; 401 = clé invalide
        domains: Array.isArray(body?.data)
          ? body.data.map((d) => ({ name: d.name, status: d.status }))
          : body,
      };
    } catch (e) {
      out.resend = { error: e?.message };
    }
  }
  res.status(200).json(out);
}
