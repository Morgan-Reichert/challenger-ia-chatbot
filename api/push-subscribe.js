/**
 * Enregistre (ou met à jour) l'abonnement push de l'utilisateur.
 *  POST /api/push-subscribe  { subscription }  → { ok }
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';

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

  const sub = req.body?.subscription;
  if (!sub?.endpoint) return res.status(400).json({ error: 'subscription_invalide' });

  const supa = getSupabase();
  if (!supa) return res.status(200).json({ ok: true, skipped: true });

  const { error } = await supa.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    user_id: uid ?? null,
    subscription: sub,
  });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
