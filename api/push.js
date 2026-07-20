/**
 * Notifications poussées — abonnement et diffusion.
 *
 *   POST /api/push?action=subscribe   → enregistre l'abonnement d'un appareil
 *   POST /api/push?action=broadcast   → diffuse à tous les abonnés (CRON_SECRET)
 *
 * Les deux opérations sont regroupées dans une seule fonction : Vercel plafonne
 * le nombre de fonctions par déploiement, et elles partagent le même client de
 * base de données.
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';
import { cors } from './_lib/cors.js';
import webpush from 'web-push';

async function abonner(req, res) {
  if (cors(req, res)) return;
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

async function diffuser(req, res) {
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

export default async function handler(req, res) {
  const action = String(req.query?.action ?? 'subscribe').toLowerCase();
  if (action === 'broadcast') return diffuser(req, res);
  if (action === 'subscribe') return abonner(req, res);
  return res.status(404).json({ error: 'Action inconnue (subscribe ou broadcast).' });
}
