/**
 * Tâches planifiées — point d'entrée unique.
 *
 *   /api/cron?task=challenges   génération hebdomadaire des défis
 *   /api/cron?task=reengagement relance des utilisateurs inactifs
 *   /api/cron?task=purge        purge des données dont la conservation est échue
 *
 * Regroupées dans une seule fonction : Vercel plafonne le nombre de fonctions
 * par déploiement, et ces tâches partagent la même vérification de secret.
 * Chacune reste indépendante et conserve sa propre planification.
 */
import { createClient } from '@supabase/supabase-js';
import { getAdminFirestore, getAdminAuth } from './_lib/admin.js';

async function genererDefis(req, res) {
  // Auth cron : Vercel cron passe Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const header = req.headers.authorization || '';
  if (cronSecret && header !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) return res.status(500).json({ error: 'MISTRAL_API_KEY manquante' });

  const db = getAdminFirestore();
  if (!db) return res.status(500).json({ error: 'Firebase Admin non configuré' });

  // ── Génération via Mistral ──────────────────────────────────────────────────
  let challenges;
  try {
    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        temperature: 0.9,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Génère 7 défis pour la semaine commençant le ${isoDay(0)}. Varie radicalement les thèmes.` },
        ],
      }),
    });
    if (!mistralRes.ok) {
      const e = await mistralRes.text();
      return res.status(502).json({ error: `Mistral ${mistralRes.status}: ${e.slice(0, 200)}` });
    }
    const data = await mistralRes.json();
    const text = data.choices?.[0]?.message?.content ?? '[]';
    // Tolérance : si l'IA a wrappé dans ```json, on nettoie
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    challenges = JSON.parse(cleaned);
    if (!Array.isArray(challenges) || challenges.length === 0) throw new Error('format invalide');
  } catch (e) {
    return res.status(502).json({ error: `Génération invalide : ${e.message}` });
  }

  // ── Écriture Firestore (un doc par jour, 7 jours) ───────────────────────────
  const batch = db.batch();
  const writes = [];
  challenges.slice(0, 7).forEach((c, i) => {
    const day = isoDay(i);
    const ref = db.collection('daily_challenges').doc(day);
    const doc = {
      day,
      theme: String(c.theme ?? '').slice(0, 60),
      title: String(c.title ?? '').slice(0, 120),
      prompt: String(c.prompt ?? '').slice(0, 400),
      difficulty: ['facile', 'moyen', 'difficile'].includes(c.difficulty) ? c.difficulty : 'moyen',
      persona: ['architect', 'factchecker', 'opponent'].includes(c.persona) ? c.persona : 'architect',
      generatedAt: new Date().toISOString(),
    };
    batch.set(ref, doc);
    writes.push(doc);
  });
  await batch.commit();

  return res.status(200).json({ ok: true, count: writes.length, days: writes.map(w => w.day) });
}

async function relancerInactifs(req, res) {
  // Auth cron : Vercel passe Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const header = req.headers.authorization || '';
  if (cronSecret && header !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const adminAuth = getAdminAuth();
  const supa = getSupabase();
  if (!apiKey || !from || !adminAuth || !supa) return res.status(200).json({ skipped: true });

  const appUrl = normalizeUrl(process.env.APP_URL, 'https://stariax.tech');
  const logoUrl = `${appUrl.replace(/\/$/, '')}/logocompletblanc.png`;
  const unsubUrl = normalizeUrl(process.env.SUPPORT_URL, 'mailto:contact@stariax.tech');

  // 1. Contacts qui ont consenti
  const { data: contacts, error: cErr } = await supa
    .from('user_contacts')
    .select('user_id, email, last_reengaged_at')
    .eq('marketing_opt_in', true);
  if (cErr) return res.status(500).json({ error: cErr.message });
  if (!contacts?.length) return res.status(200).json({ sent: 0, reason: 'no_optin' });

  const byId = new Map(contacts.map((c) => [c.user_id, c]));

  const now = Date.now();
  const inactiveMs = INACTIVE_DAYS * 86400000;
  const cooldownMs = COOLDOWN_DAYS * 86400000;

  let sent = 0, checked = 0, pageToken;
  try {
    do {
      const list = await adminAuth.listUsers(1000, pageToken);
      for (const u of list.users) {
        const c = byId.get(u.uid);
        if (!c || !u.email) continue;
        checked++;
        const last = u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : 0;
        if (now - last < inactiveMs) continue;                     // encore actif
        const lastRe = c.last_reengaged_at ? new Date(c.last_reengaged_at).getTime() : 0;
        if (now - lastRe < cooldownMs) continue;                   // déjà relancé récemment

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: u.email,
            subject: 'On ne vous a pas vu depuis un moment 👀',
            html: emailHtml(appUrl, logoUrl, unsubUrl),
          }),
        });
        if (r.ok) {
          sent++;
          await supa.from('user_contacts').update({ last_reengaged_at: new Date().toISOString() }).eq('user_id', u.uid);
        } else {
          console.error('[reengagement] Resend error', r.status, await r.text().catch(() => ''));
        }
      }
      pageToken = list.pageToken;
    } while (pageToken);
  } catch (e) {
    console.error('[reengagement] exception:', e?.message);
    return res.status(500).json({ error: e?.message, sent });
  }

  return res.status(200).json({ sent, checked });
}

async function purger(req, res) {
  const attendu = process.env.CRON_SECRET;
  const recu = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!attendu || recu !== attendu) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const bilan = { supabase: null, comptesAnonymesSupprimes: 0, erreurs: [] };

  // ── Volet Supabase ────────────────────────────────────────────────────────
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      const supa = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await supa.rpc('purge_donnees_expirees');
      if (error) bilan.erreurs.push(`supabase: ${error.message}`);
      else bilan.supabase = data;
    } catch (e) {
      bilan.erreurs.push(`supabase: ${e?.message ?? e}`);
    }
  }

  // ── Volet comptes anonymes inactifs ───────────────────────────────────────
  const auth = getAdminAuth();
  const dbAdmin = getAdminFirestore();
  if (auth && dbAdmin) {
    try {
      const limite = Date.now() - JOURS_INACTIVITE_ANONYME * 86400000;
      let pageToken;
      let traites = 0;

      do {
        const page = await auth.listUsers(1000, pageToken);
        pageToken = page.pageToken;

        for (const u of page.users) {
          if (traites >= MAX_COMPTES_PAR_PASSAGE) break;
          // Un compte anonyme n'a ni fournisseur d'identité ni adresse.
          const estAnonyme = !u.email && (u.providerData?.length ?? 0) === 0;
          if (!estAnonyme) continue;

          const derniere = Date.parse(u.metadata?.lastSignInTime || u.metadata?.creationTime || '');
          if (!derniere || derniere > limite) continue;

          const base = dbAdmin.collection('users').doc(u.uid);
          for (const sous of ['conversations', 'projects', 'meta']) {
            const snap = await base.collection(sous).limit(300).get();
            if (!snap.empty) {
              const lot = dbAdmin.batch();
              snap.docs.forEach((dd) => lot.delete(dd.ref));
              await lot.commit();
            }
          }
          await base.delete().catch(() => {});

          const partages = await dbAdmin.collection('shared').where('ownerId', '==', u.uid).get();
          if (!partages.empty) {
            const lot = dbAdmin.batch();
            partages.docs.forEach((dd) => lot.delete(dd.ref));
            await lot.commit();
          }

          await auth.deleteUser(u.uid);
          bilan.comptesAnonymesSupprimes++;
          traites++;
        }
        if (traites >= MAX_COMPTES_PAR_PASSAGE) break;
      } while (pageToken);
    } catch (e) {
      bilan.erreurs.push(`comptes anonymes: ${e?.message ?? e}`);
    }
  }

  return res.status(bilan.erreurs.length ? 207 : 200).json(bilan);
}

const TACHES = {
  challenges: genererDefis,
  reengagement: relancerInactifs,
  purge: purger,
};

export default async function handler(req, res) {
  const tache = TACHES[String(req.query?.task ?? '').toLowerCase()];
  if (!tache) {
    return res.status(404).json({
      error: `Tâche inconnue. Disponibles : ${Object.keys(TACHES).join(', ')}.`,
    });
  }
  return tache(req, res);
}
