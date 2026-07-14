/**
 * Relance des utilisateurs inactifs qui ont accepté l'actualité.
 * Lancé par le cron Vercel. Pour chaque user :
 *   - opt-in marketing = true (Supabase user_contacts)
 *   - dernière connexion Firebase > INACTIVE_DAYS
 *   - pas déjà relancé depuis COOLDOWN_DAYS (anti-spam)
 * → envoie un email de relance via Resend et note last_reengaged_at.
 *
 * Env : CRON_SECRET, RESEND_API_KEY, RESEND_FROM, FIREBASE_ADMIN_*,
 *       VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL (URL de l'app).
 */
import { createClient } from '@supabase/supabase-js';
import { getAdminAuth } from './_lib/admin.js';

const INACTIVE_DAYS = 14;   // inactif depuis au moins 14 j
const COOLDOWN_DAYS = 30;   // 1 relance max / 30 j
const BRAND = '#5D7BFF';

let _c = null;
function getSupabase() {
  if (_c) return _c;
  const u = process.env.VITE_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) return null;
  _c = createClient(u, k, { auth: { persistSession: false } });
  return _c;
}

function normalizeUrl(v, fallback) {
  if (!v || !v.trim()) return fallback;
  const s = v.trim().replace(/^[[<]+|[\]>]+$/g, '');
  if (/^(https?:|mailto:)/i.test(s)) return s;
  if (s.includes('@')) return 'mailto:' + s;
  return 'https://' + s;
}

function emailHtml(appUrl, logoUrl, unsubUrl) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1fb;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(20,24,60,.10);">
      <tr><td style="background:#0e0e0e;padding:26px 32px;text-align:center;"><img src="${logoUrl}" alt="Challenger IA" height="42" style="height:42px;width:auto;display:inline-block;"></td></tr>
      <tr><td style="height:4px;background:${BRAND};line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 40px 8px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND};">On vous a manqué</p>
        <h1 style="margin:0 0 18px;font-size:23px;font-weight:800;color:#12141c;line-height:1.25;">Prêt à re-challenger vos idées ?</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3f4c;">Ça fait un moment qu'on ne vous a pas vu. Votre esprit critique, lui, ne demande qu'à s'aiguiser 🧠</p>
        <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#3a3f4c;">Lancez un nouveau débat, testez une thèse, confrontez-vous à l'Architecte, au Fact-Checker ou à l'Opposant. 5 minutes suffisent pour repartir avec un raisonnement plus solide.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr><td style="border-radius:12px;background:${BRAND};box-shadow:0 6px 18px rgba(93,123,255,.35);">
          <a href="${appUrl}" style="display:inline-block;padding:15px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Reprendre l'entraînement</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:22px 40px 32px;"><div style="border-top:1px solid #eef0f5;padding-top:20px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#12141c;">Challenger IA</p>
        <p style="margin:0 0 12px;font-size:12px;color:#9298a6;">L'IA qui muscle votre esprit critique. Une app STARIAX.</p>
        <p style="margin:0;font-size:11px;color:#b6bbc7;">Vous recevez cet email car vous avez accepté l'actualité Challenger IA. <a href="${unsubUrl}" style="color:#9298a6;text-decoration:underline;">Se désabonner</a></p>
      </div></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export default async function handler(req, res) {
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
