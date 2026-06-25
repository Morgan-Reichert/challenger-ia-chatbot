/**
 * Crédits & abonnement — TOUT passe par le serveur (service role), jamais par
 * le client. L'utilisateur est identifié par son token Firebase, JAMAIS par un
 * user_id fourni dans la requête → impossible de lire/modifier le compte d'un autre.
 *
 *  GET  /api/credits                 → { credits, lifetime, plan }
 *  POST /api/credits {action:'claim'}→ { credited, credits }   (récompense défi, 1/jour)
 *  POST /api/credits {action:'spend'}→ { ok, credits }         (déduit 1 crédit)
 *
 * Nécessite : VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY côté serveur,
 * et supabase/security.sql exécuté (RLS + REVOKE + claim_daily_reward).
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';

let _client = null;
function getSupabase() {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export default async function handler(req, res) {
  // ── Authentification : on n'accepte que l'uid issu du token vérifié ──
  const { uid, skipped } = await verifyIdToken(req);
  if (isAuthEnforced() && !uid) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  // Mode local sans Admin SDK → pas de compte, valeurs par défaut
  if (skipped || !uid) {
    if (req.method === 'GET') return res.status(200).json({ credits: 0, lifetime: 0, plan: 'free' });
    return res.status(200).json({ credited: false, ok: false, credits: 0 });
  }

  const supa = getSupabase();
  if (!supa) {
    if (req.method === 'GET') return res.status(200).json({ credits: 0, lifetime: 0, plan: 'free' });
    return res.status(200).json({ credited: false, ok: false, credits: 0 });
  }

  // ── Lecture solde + plan ──
  async function readState() {
    const [{ data: c }, { data: s }] = await Promise.all([
      supa.from('user_credits').select('credits, lifetime_credits').eq('user_id', uid).single(),
      supa.from('subscriptions').select('plan, status, current_period_end').eq('user_id', uid).single(),
    ]);
    let plan = 'free';
    if (s?.plan === 'pro') {
      if (s.status === 'active' || s.status === 'trialing') plan = 'pro';
      else if (s.current_period_end && new Date(s.current_period_end) > new Date()) plan = 'pro';
    }
    return { credits: c?.credits ?? 0, lifetime: c?.lifetime_credits ?? 0, plan };
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await readState());
    }

    if (req.method === 'POST') {
      const action = req.body?.action;

      if (action === 'claim') {
        const { data, error } = await supa.rpc('claim_daily_reward', { p_user_id: uid });
        if (error) return res.status(500).json({ credited: false, error: error.message });
        const st = await readState();
        return res.status(200).json({ credited: !!data?.credited, credits: st.credits });
      }

      if (action === 'spend') {
        const { error } = await supa.rpc('deduct_one_credit', { p_user_id: uid });
        if (error) return res.status(500).json({ ok: false, error: error.message });
        const st = await readState();
        return res.status(200).json({ ok: true, credits: st.credits });
      }

      return res.status(400).json({ error: 'action invalide' });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e?.message ?? 'Erreur serveur' });
  }
}
