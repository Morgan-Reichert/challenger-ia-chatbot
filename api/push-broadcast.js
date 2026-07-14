/**
 * Diffuse une notification push à tous les abonnés.
 * Protégé par CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 * Sert à annoncer une nouveauté / inviter à revenir.
 *
 *  POST /api/push-broadcast  { title, body, url }
 *
 * Env : VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto),
 *       VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
 */
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

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

  const secret = process.env.CRON_SECRET;
  const header = req.headers.authorization || '';
  if (secret && header !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });

  const pub = process.env.VITE_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@stariax.tech';
  const supa = getSupabase();
  if (!pub || !priv || !supa) return res.status(200).json({ skipped: true, reason: 'non_configuré' });

  webpush.setVapidDetails(subject, pub, priv);

  const { title, body, url } = req.body || {};
  if (!title && !body) return res.status(400).json({ error: 'title_ou_body_requis' });
  const payload = JSON.stringify({ title: title || 'Challenger IA', body: body || '', url: url || '/' });

  const { data: subs, error } = await supa.from('push_subscriptions').select('endpoint, subscription');
  if (error) return res.status(500).json({ error: error.message });
  if (!subs?.length) return res.status(200).json({ sent: 0 });

  let sent = 0, removed = 0;
  await Promise.all(subs.map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (e) {
      // Abonnement expiré/invalide → on le supprime
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supa.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
        removed++;
      }
    }
  }));

  return res.status(200).json({ sent, removed });
}
