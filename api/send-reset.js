/**
 * Envoi d'un email de réinitialisation de mot de passe PERSONNALISÉ (logo + design)
 * via Resend, en générant le lien avec le Firebase Admin SDK.
 *
 * Repli : si RESEND_API_KEY ou l'Admin SDK ne sont pas configurés, on renvoie
 * { fallback: true } et le client repasse sur la méthode Firebase par défaut.
 *
 * Env attendues :
 *  - RESEND_API_KEY        (clé Resend)
 *  - RESEND_FROM           (ex: "Challenger IA <noreply@challengeria.com>") — domaine vérifié
 *  - FIREBASE_ADMIN_*      (déjà configurées)
 *  - RESET_CONTINUE_URL    (optionnel : URL de retour vers l'app après reset)
 */
import { getAdminAuth } from './_lib/admin.js';

const LOGO_URL = 'https://i.postimg.cc/L4WsWhk9/Design-sans-titre-(12).png';
const BRAND = '#5D7BFF';
const SUPPORT_URL = process.env.SUPPORT_URL || 'mailto:support@stariax.tech';
const SITE_URL = process.env.APP_URL || 'https://stariax.tech';

function emailHtml(link) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef1fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Réinitialisez votre mot de passe Challenger IA en un clic.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(20,24,60,.10);">

        <tr><td style="background:#0e0e0e;padding:26px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Challenger IA" height="42" style="height:42px;width:auto;display:inline-block;">
        </td></tr>
        <tr><td style="height:4px;background:${BRAND};line-height:4px;font-size:0;">&nbsp;</td></tr>

        <tr><td style="padding:36px 40px 8px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND};">Sécurité du compte</p>
          <h1 style="margin:0 0 18px;font-size:23px;font-weight:800;color:#12141c;line-height:1.25;">Réinitialisez votre mot de passe</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3a3f4c;">Bonjour,</p>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#3a3f4c;">Vous avez demandé à réinitialiser le mot de passe de votre compte <strong style="color:#12141c;">Challenger IA</strong>. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. C'est rapide et sécurisé.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr><td style="border-radius:12px;background:${BRAND};box-shadow:0 6px 18px rgba(93,123,255,.35);">
            <a href="${link}" style="display:inline-block;padding:15px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Réinitialiser mon mot de passe</a>
          </td></tr></table>
          <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#9298a6;">Le bouton ne marche pas ? Copiez ce lien :</p>
          <p style="margin:0 0 4px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:${BRAND};">${link}</a></p>
        </td></tr>

        <tr><td style="padding:12px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fe;border:1px solid #e6ebfb;border-radius:12px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7180;"><strong style="color:#12141c;">🔒 Vous n'êtes pas à l'origine de cette demande ?</strong><br>Ignorez cet email en toute sécurité — votre mot de passe restera inchangé. Le lien expire automatiquement.</p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:26px 40px 0;">
          <div style="border-top:1px solid #eef0f5;padding-top:22px;">
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#12141c;">Besoin d'aide ?</p>
            <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#6b7180;">Une question, un souci de connexion ? Notre équipe est là pour vous.</p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;border:1.5px solid ${BRAND};">
              <a href="${SUPPORT_URL}" style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:700;color:${BRAND};text-decoration:none;border-radius:10px;">Contacter l'assistance</a>
            </td></tr></table>
          </div>
        </td></tr>

        <tr><td style="padding:28px 40px 32px;">
          <div style="border-top:1px solid #eef0f5;padding-top:20px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#12141c;">Challenger IA</p>
            <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#9298a6;">L'IA qui muscle votre esprit critique.</p>
            <p style="margin:0 0 14px;font-size:12px;color:#9298a6;">
              <a href="${SITE_URL}" style="color:${BRAND};text-decoration:none;">Site web</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="${SUPPORT_URL}" style="color:${BRAND};text-decoration:none;">Assistance</a>
            </p>
            <p style="margin:0;font-size:11px;color:#b6bbc7;">Cet email vous a été envoyé suite à une demande de réinitialisation. Une app STARIAX.</p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const email = (req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email_requis' });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const adminAuth = getAdminAuth();

  // Non configuré → le client repasse sur la méthode Firebase par défaut
  if (!apiKey || !from || !adminAuth) {
    return res.status(200).json({ fallback: true });
  }

  try {
    let link;
    try {
      const settings = process.env.RESET_CONTINUE_URL ? { url: process.env.RESET_CONTINUE_URL } : undefined;
      link = await adminAuth.generatePasswordResetLink(email, settings);
    } catch (e) {
      // Compte inexistant → on ne le révèle PAS (anti-énumération) : succès neutre
      if (e?.code === 'auth/user-not-found' || e?.code === 'auth/email-not-found') {
        return res.status(200).json({ ok: true });
      }
      throw e;
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Votre lien de réinitialisation — Challenger IA',
        html: emailHtml(link),
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[send-reset] Resend error:', r.status, detail);
      // On laisse le client retomber sur Firebase pour ne pas bloquer l'utilisateur
      return res.status(200).json({ fallback: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-reset] exception:', e?.message);
    return res.status(200).json({ fallback: true });
  }
}
