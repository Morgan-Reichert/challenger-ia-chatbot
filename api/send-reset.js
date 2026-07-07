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

function emailHtml(link) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,24,60,.08);">
        <tr><td style="background:#0e0e0e;padding:24px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Challenger IA" height="40" style="height:40px;width:auto;display:inline-block;">
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#141414;">Réinitialisation de votre mot de passe</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3f4c;">Bonjour,</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a3f4c;">Vous avez demandé à réinitialiser le mot de passe de votre compte <strong>Challenger IA</strong>. Cliquez sur le bouton ci-dessous pour en choisir un nouveau :</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;"><tr><td style="border-radius:12px;background:${BRAND};">
            <a href="${link}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Réinitialiser mon mot de passe</a>
          </td></tr></table>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8a8f9c;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:${BRAND};">${link}</a></p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a8f9c;">Ce lien est valable un temps limité. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe restera inchangé.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #eceef3;text-align:center;">
          <p style="margin:0;font-size:12px;color:#a0a4b0;">Challenger IA — l'IA qui muscle votre esprit critique</p>
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
        subject: 'Réinitialisation de votre mot de passe Challenger IA',
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
