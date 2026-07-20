/**
 * Actualités — résumés publics, contenu réservé aux comptes.
 *
 *   GET  /api/articles              liste des résumés publiés (public)
 *   GET  /api/articles?id=<uuid>    article intégral (compte requis)
 *   POST /api/articles              création puis publication (secret d'édition)
 *
 * ── Pourquoi cette fonction vit ici ───────────────────────────────────────
 * Le site vitrine ne dispose ni de `firebase-admin` ni de la clé de service
 * Supabase, et n'a pas vocation à les recevoir : ce serait dupliquer des
 * secrets sur un second projet. L'application les détient déjà, avec la
 * vérification de jeton et l'envoi de courriel. Le site interroge donc ce
 * point d'entrée plutôt que d'en héberger un second exemplaire.
 *
 * ── Sur l'envoi aux inscrits ──────────────────────────────────────────────
 * Publier écrit à tous les inscrits. L'opération est donc explicite — jamais
 * déclenchée par une sauvegarde — et enregistrée dans `article_envois`, dont
 * la clé primaire garantit qu'un même article ne peut pas être annoncé deux
 * fois. Corriger une coquille après publication ne renvoie rien.
 */
import { createClient } from '@supabase/supabase-js';
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';
import { cors } from './_lib/cors.js';

const TYPES = ['maj', 'wip'];

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ─── Courriel d'annonce ──────────────────────────────────────────────────── */

function gabarit({ titre, resume, type, url, urlDesinscription, logo }) {
  const rubrique = type === 'maj' ? 'Mise à jour' : 'En cours de développement';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F0F4FF;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:2px solid #141414">
  <tr><td style="padding:24px 28px;border-bottom:2px solid #141414">
    <img src="${logo}" alt="Challenger IA" width="150" style="display:block">
  </td></tr>
  <tr><td style="padding:28px">
    <p style="margin:0 0 6px;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#5D7BFF">${rubrique}</p>
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#141414">${titre}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#141414;opacity:.75">${resume}</p>
    <a href="${url}" style="display:inline-block;background:#141414;color:#fff;text-decoration:none;padding:13px 26px;font-size:12px;font-weight:900;letter-spacing:2px;text-transform:uppercase">Lire l'article</a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#141414;opacity:.45">
      L'article complet est réservé aux titulaires d'un compte Challenger IA. La création est gratuite.
    </p>
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid rgba(20,20,20,.1)">
    <p style="margin:0;font-size:11px;color:#141414;opacity:.4">
      Vous recevez ce message parce que vous êtes inscrit aux actualités de Challenger IA.
      <a href="${urlDesinscription}" style="color:#5D7BFF">Se désinscrire</a>.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function annoncer(supa, article) {
  const cle = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!cle || !from) return { envoyes: 0, echecs: 0, motif: 'courriel_non_configure' };

  const { data: inscrits } = await supa.from('subscribers').select('email');
  const destinataires = [...new Set((inscrits ?? []).map((x) => x.email).filter(Boolean))];
  if (destinataires.length === 0) return { envoyes: 0, echecs: 0, motif: 'aucun_inscrit' };

  const site = process.env.SITE_URL ?? 'https://challenger-ia-nine.vercel.app';
  const app = process.env.VITE_APP_URL ?? 'https://challenger-ia-chatbot.vercel.app';
  const html = gabarit({
    titre: article.titre, resume: article.resume, type: article.type,
    url: `${site}/actualites/${article.id}`,
    urlDesinscription: `${site}/confidentialite`,
    logo: `${app}/logocompletbleu.png`,
  });

  let envoyes = 0, echecs = 0;
  // Envoi séquentiel : le fournisseur limite le débit, et un article annoncé à
  // la moitié des inscrits serait pire qu'un envoi lent.
  for (const email of destinataires) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: email,
          subject: `${article.type === 'maj' ? 'Mise à jour' : 'En cours'} — ${article.titre}`,
          html,
        }),
      });
      if (r.ok) envoyes++;
      else { echecs++; console.error('[articles] envoi refusé', r.status); }
    } catch (e) {
      echecs++; console.error('[articles] envoi en échec —', e?.message ?? e);
    }
  }
  return { envoyes, echecs, motif: null };
}

/* ─── Point d'entrée ──────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const supa = getSupabase();
  if (!supa) return res.status(503).json({ erreur: 'service_indisponible' });

  /* ── Publication ───────────────────────────────────────────────────────── */
  if (req.method === 'POST') {
    const secret = process.env.ARTICLES_ADMIN_SECRET;
    if (!secret) return res.status(503).json({ erreur: 'edition_non_configuree' });
    if (req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ erreur: 'non_autorise' });
    }

    const { type, titre, resume, contenu, temps_lecture, publier = false } = req.body ?? {};
    if (!TYPES.includes(type)) return res.status(400).json({ erreur: 'type_invalide', message: 'type doit valoir « maj » ou « wip ».' });
    for (const [champ, valeur] of [['titre', titre], ['resume', resume], ['contenu', contenu]]) {
      if (typeof valeur !== 'string' || valeur.trim().length < 3) {
        return res.status(400).json({ erreur: 'parametre_invalide', message: `« ${champ} » est requis.` });
      }
    }
    if (String(resume).length > 400) {
      return res.status(400).json({ erreur: 'resume_trop_long', message: 'Le résumé est envoyé par courriel : 400 caractères maximum.' });
    }

    const { data: article, error } = await supa.from('articles').insert({
      type, titre: titre.trim(), resume: resume.trim(), contenu,
      temps_lecture: Number(temps_lecture) || 3,
      statut: publier ? 'publie' : 'brouillon',
      publie_le: publier ? new Date().toISOString() : null,
    }).select('*').single();
    if (error) return res.status(500).json({ erreur: 'erreur_interne', message: error.message });

    if (!publier) return res.status(201).json({ article, annonce: null });

    // Verrou d'annonce posé AVANT l'envoi : si l'insertion échoue, c'est qu'un
    // envoi a déjà eu lieu, et l'on s'arrête.
    const { error: dejaEnvoye } = await supa.from('article_envois')
      .insert({ article_id: article.id, destinataires: 0, echecs: 0 });
    if (dejaEnvoye) return res.status(200).json({ article, annonce: { motif: 'deja_annonce' } });

    const bilan = await annoncer(supa, article);
    await supa.from('article_envois')
      .update({ destinataires: bilan.envoyes, echecs: bilan.echecs })
      .eq('article_id', article.id);

    return res.status(201).json({ article, annonce: bilan });
  }

  if (req.method !== 'GET') return res.status(405).json({ erreur: 'methode_non_autorisee' });

  /* ── Article intégral — compte requis ──────────────────────────────────── */
  const id = req.query?.id;
  if (id) {
    const { uid, fournisseur } = await verifyIdToken(req);
    if (!isAuthEnforced()) return res.status(503).json({ erreur: 'service_indisponible' });
    if (!uid) {
      return res.status(401).json({
        erreur: 'compte_requis',
        message: "L'article complet est réservé aux titulaires d'un compte Challenger IA.",
      });
    }
    // Un compte anonyme n'est pas un compte créé : il ne franchit pas la porte.
    if (fournisseur === 'anonymous') {
      return res.status(403).json({
        erreur: 'compte_anonyme',
        message: 'Créez un compte avec une adresse e-mail pour lire les articles en entier.',
      });
    }

    const { data, error } = await supa.from('articles')
      .select('id, type, titre, resume, contenu, temps_lecture, publie_le')
      .eq('id', id).eq('statut', 'publie').maybeSingle();
    if (error) return res.status(500).json({ erreur: 'erreur_interne' });
    if (!data) return res.status(404).json({ erreur: 'introuvable' });

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ article: data });
  }

  /* ── Liste des résumés — public ────────────────────────────────────────── */
  const { data, error } = await supa.from('articles_publics')
    .select('id, type, titre, resume, temps_lecture, publie_le');
  if (error) return res.status(500).json({ erreur: 'erreur_interne' });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    maj: (data ?? []).filter((a) => a.type === 'maj'),
    wip: (data ?? []).filter((a) => a.type === 'wip'),
  });
}
