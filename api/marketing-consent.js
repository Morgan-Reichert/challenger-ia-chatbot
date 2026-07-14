/**
 * Enregistre le consentement marketing de l'utilisateur (recevoir l'actualité
 * Challenger IA / Stariax). Appelé à l'inscription et depuis les Réglages.
 *
 *  POST /api/marketing-consent  { optIn: boolean }  → { ok }
 *
 * Sert aussi de mécanisme de désabonnement (optIn:false).
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced, getAdminAuth } from './_lib/admin.js';

let _c = null;
function getSupabase() {
  if (_c) return _c;
  const u = process.env.VITE_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) return null;
  _c = createClient(u, k, { auth: { persistSession: false } });
  return _c;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const { uid, skipped } = await verifyIdToken(req);
  if (isAuthEnforced() && !uid) return res.status(401).json({ error: 'Authentification requise' });
  if (skipped || !uid) return res.status(200).json({ ok: true, skipped: true });

  const supa = getSupabase();
  if (!supa) return res.status(200).json({ ok: true, skipped: true });

  const optIn = req.body?.optIn === true;

  // Email récupéré côté serveur (source de vérité), jamais depuis le client.
  let email = null;
  try { const u = await getAdminAuth()?.getUser(uid); email = u?.email ?? null; } catch { /* ignore */ }

  const { error } = await supa.from('user_contacts').upsert({
    user_id: uid,
    email,
    marketing_opt_in: optIn,
    opt_in_at: optIn ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, optIn });
}
