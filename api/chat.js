/**
 * Vercel serverless function — Proxy Mistral AI avec streaming SSE
 * - MISTRAL_API_KEY : variable serveur uniquement dans Vercel (sans préfixe VITE_)
 * - TAVILY_API_KEY  : idem — recherche web côté serveur uniquement
 * - Paramètre `stream` : si true → SSE, sinon → JSON bloc (pour LibraryPage)
 *
 * Garde-fous (cf. api/_lib/admin.js + api/_lib/quota.js) :
 *  - Authentification ID token Firebase si Admin SDK configuré
 *  - Rate limit (req/min/user) + quota journalier + déduction crédits
 *    atomiques côté Supabase
 *
 * Recherche web automatique :
 * - Détecte les questions nécessitant des infos récentes/actuelles
 * - Analyse de crédibilité des sources
 * - Détection de fake news par cross-référencement
 */
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';
import { checkAndConsumeQuota } from './_lib/quota.js';
import { estEmailIllimite } from './_lib/illimite.js';
import { cors } from './_lib/cors.js';
import { rechercher } from './_lib/recherche.js';
import { verifierReponse } from './_lib/verifier.js';

// ─── Sources connues et leur niveau de fiabilité ─────────────────────────────
const SOURCE_TIERS = {
  high: [
    'lemonde.fr', 'lefigaro.fr', 'liberation.fr', 'mediapart.fr', 'lesechos.fr',
    'francetvinfo.fr', 'franceinfo.fr', 'bbc.com', 'bbc.co.uk', 'reuters.com',
    'apnews.com', 'afp.com', 'theguardian.com', 'nytimes.com', 'washingtonpost.com',
    'lemonde.fr', 'liberation.fr', 'humanite.fr', 'nouvelobs.com', 'lexpress.fr',
    'lepoint.fr', 'challenges.fr', 'capital.fr', 'rfi.fr', 'tv5monde.com',
    'rtbf.be', 'rts.ch', 'radio-canada.ca', 'swissinfo.ch', 'euronews.com',
    'nature.com', 'science.org', 'pubmed.ncbi.nlm.nih.gov', 'who.int',
    'gouvernement.fr', 'elysee.fr', 'assemblee-nationale.fr', 'senat.fr',
    'europa.eu', 'un.org', 'wikileaks.org',
  ],
  medium: [
    'huffingtonpost.fr', 'bfmtv.com', 'cnews.fr', 'lci.fr', 'rtl.fr',
    'europe1.fr', 'slate.fr', 'atlantico.fr', 'marianne.net', 'l-express.fr',
    '20minutes.fr', 'leparisien.fr', 'ouest-france.fr', 'sudouest.fr',
    'latribune.fr', 'usinenouvelle.com', 'numerama.com', 'clubic.com',
    'politico.eu', 'thelocal.fr',
  ],
  low: [
    'wikistrike.com', 'egaliteetreconciliation.fr', 'fdesouche.com',
    'les-crises.fr', 'ripostelaique.com', 'ojim.fr',
  ],
};

function getSourceTier(url) {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    if (SOURCE_TIERS.high.some(d => domain.endsWith(d))) return 'high';
    if (SOURCE_TIERS.medium.some(d => domain.endsWith(d))) return 'medium';
    if (SOURCE_TIERS.low.some(d => domain.endsWith(d))) return 'low';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function tierLabel(tier) {
  return { high: 'Source fiable', medium: 'Source modérée', low: 'Source peu fiable', unknown: 'Source inconnue' }[tier];
}

// ─── Détection automatique du besoin de recherche web ────────────────────────
function detectSearchNeed(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return null;

  const text = (typeof lastUser.content === 'string' ? lastUser.content : '').toLowerCase();

  const temporalKw = [
    'aujourd\'hui', 'hier', 'cette semaine', 'ce mois', 'cette année',
    'récent', 'récente', 'dernière', 'dernier', 'actualité', 'actu', 'news',
    '2025', '2024', 'en ce moment', 'maintenant', 'vient de', 'viennent de',
    'annonce', 'annoncé', 'événement', 'élection', 'crise', 'guerre', 'conflit',
    'bilan', 'résultat', 'sondage', 'statistique', 'chiffre', 'rapport',
  ];

  const verifKw = [
    'vrai', 'faux', 'fake', 'vérifi', 'source', 'prouve', 'vraiment',
    'rumeur', 'intox', 'désinformation', 'misinformation', 'canular', 'hoax',
    'mensonge', 'manipul', 'propagande', 'complot', 'conspiracy',
    'est-ce que c\'est vrai', 'j\'ai lu que', 'j\'ai entendu que', 'on dit que',
    'il paraît', 'selon', 'd\'après',
  ];

  const hasTemporalKw = temporalKw.some(kw => text.includes(kw));
  const hasVerifKw = verifKw.some(kw => text.includes(kw));

  if (hasTemporalKw || hasVerifKw) {
    return { query: lastUser.content, mode: hasVerifKw ? 'factcheck' : 'news' };
  }

  return null;
}

function safeDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, model, temperature, searchQuery, stream = true, attachmentCount = 0, factcheck = false } = req.body;

  if (!messages || !model) {
    return res.status(400).json({ error: 'messages et model sont requis' });
  }

  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) {
    return res.status(500).json({ error: 'MISTRAL_API_KEY non configurée sur le serveur' });
  }

  // ── Authentification + quota / rate limit ────────────────────────────────
  // Si FIREBASE_ADMIN_* est configuré, le token est obligatoire.
  // Sinon (dev local), on laisse passer en mode "skipped".
  // FAIL-CLOSED : en PRODUCTION, on refuse si l'auth n'est pas configurée —
  // sinon l'endpoint serait ouvert et le budget Mistral pillable.
  if (process.env.VERCEL_ENV === 'production' && !isAuthEnforced()) {
    return res.status(503).json({ error: 'Service indisponible : authentification serveur non configurée (FIREBASE_ADMIN_*).' });
  }
  const { uid, email, error: authErr, skipped: authSkipped } = await verifyIdToken(req);
  if (isAuthEnforced() && !uid) {
    return res.status(401).json({ error: authErr === 'invalid_token' ? 'Token invalide' : 'Authentification requise' });
  }

  // Cap les pièces jointes (3 max — cf. README) pour éviter les coûts abusifs.
  const safeAttachCount = Math.max(0, Math.min(3, Number(attachmentCount) || 0));
  const cost = 1 + safeAttachCount * 3;

  // Comptes à crédits illimités : ni quota, ni décompte (vérifié avant la RPC).
  const illimite = estEmailIllimite(email);

  if (!authSkipped && !illimite) {
    const quota = await checkAndConsumeQuota(uid, cost);
    if (!quota.allowed) {
      const status = quota.reason === 'rate_limited' ? 429 :
                     quota.reason === 'no_credits'   ? 402 :
                     500;
      return res.status(status).json({
        error: quota.reason === 'rate_limited' ? 'Trop de requêtes — réessaie dans une minute'
             : quota.reason === 'no_credits'   ? 'Quota épuisé et solde de crédits insuffisant'
             : 'Erreur quota',
        reason: quota.reason,
      });
    }
  }

  // ── Recherche web (auto-détection + manuelle) ─────────────────────────────
  let finalMessages = messages;
  let webSources = []; // sources structurées renvoyées au client
  // ── Recherche documentaire ────────────────────────────────────────────────
  //
  // Auparavant conditionnée à la présence d'une clé Tavily : celle-ci étant
  // expirée, l'application ne disposait d'AUCUNE source, et l'échec était
  // silencieux. Le module unifié bascule sur une encyclopédie publique à
  // défaut de clé, et écarte les URL inatteignables avant de les proposer.
  const detected = detectSearchNeed(messages);
  // `factcheck:true` (persona Fact-Checker) force une recherche en mode
  // vérification : le Fact-Checker doit TOUJOURS pouvoir citer des sources, quelle
  // que soit la longueur demandée. Faute de query explicite, on prend le dernier
  // message utilisateur.
  const requeteFactcheck = factcheck
    ? (searchQuery || [...messages].reverse().find((m) => m.role === 'user')?.content?.slice(0, 300) || '')
    : searchQuery;
  const cible = requeteFactcheck
    ? { query: requeteFactcheck, mode: (factcheck || detected?.mode === 'factcheck') ? 'factcheck' : 'news' }
    : detected;

  let panneRecherche = cible ? null : 'non_declenchee';

  if (cible) {
    try {
      const rech = await rechercher(cible.query);
      panneRecherche = rech.panne;
      webSources = rech.sources.map((x) => ({
        n: x.n, title: x.titre, url: x.url, snippet: x.extrait,
        domain: safeDomain(x.url), tier: getSourceTier(x.url),
        tierLabel: tierLabel(getSourceTier(x.url)),
      }));

      if (rech.contexte) {
        const regleCitation = `\n\n## Citation des sources (OBLIGATOIRE)
Chaque affirmation factuelle tirée des sources ci-dessus DOIT porter sa référence entre crochets — [n] — dans la MÊME phrase. Plusieurs numéros peuvent se cumuler : [1][3].
Tu ne renvoies JAMAIS à un numéro absent de la liste : un renvoi inventé imite la rigueur pour mieux tromper, et c'est la faute la plus grave possible ici.
Tout chiffre, pourcentage ou statistique doit porter un renvoi. Si aucune source ne l'établit, tu ne l'écris pas.
Ta réponse est vérifiée automatiquement sur ces points.`;

        const consigneFactcheck = cible.mode === 'factcheck'
          ? `\n\n## Vérification des faits
1. Décompose l'affirmation en faits distincts si nécessaire.
2. Pour chacun : CONFIRMÉ / INFIRMÉ / INDÉTERMINÉ, avec sa référence [n].
3. Ne présente jamais une information comme établie si aucune source ne l'appuie — dis-le.
4. Signale les divergences entre sources, en nommant lesquelles.
5. Sur une question réellement débattue, NE TRANCHE PAS : expose les positions et ce qui les sépare. Fabriquer une certitude est plus dommageable que se tromper sur un fait.`
          : '';

        finalMessages = finalMessages.map((m, i) =>
          i === 0 && m.role === 'system'
            ? { ...m, content: m.content
                + `\n\n## Sources vérifiées (${new Date().toLocaleDateString('fr-FR')})\n`
                + `Chacune a été atteinte et vérifiée publiquement consultable.\n\n`
                + rech.contexte + regleCitation + consigneFactcheck }
            : m);
      }
    } catch (e) {
      console.error('[chat] recherche en echec —', e?.message ?? e);
      panneRecherche = 'exception';
    }
  }

  // Aucune source disponible : on l'indique EXPLICITEMENT au modèle. Sans cette
  // consigne, il produisait des renvois [1] pointant vers une liste vide —
  // 80 citations fantômes relevées sur 148 réponses lors d'une campagne de
  // mesure, ramenées à zéro par cette seule clause.
  if (webSources.length === 0) {
    finalMessages = finalMessages.map((m, i) =>
      i === 0 && m.role === 'system'
        ? { ...m, content: m.content + `\n\n## Sources — AUCUNE
Aucune source n'a pu être obtenue. En conséquence :
- Tu n'avances AUCUN chiffre, pourcentage ni statistique.
- Tu n'emploies AUCUN renvoi de la forme [1] : il n'existe rien vers quoi renvoyer, et un renvoi sans source est un mensonge de forme.
- Tu ne cites aucune étude, aucun auteur, aucune institution par son nom.
- Tu raisonnes sur la STRUCTURE de l'argument, ce qui suffit à repérer un faux dilemme, une généralisation abusive ou une confusion entre corrélation et causalité.
- Tu signales cette limite en une phrase, sans t'en excuser.` }
        : m);
  }

  // ── Appel Mistral ────────────────────────────────────────────────────────────
  try {
    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({ model, temperature, messages: finalMessages, stream }),
    });

    if (!mistralRes.ok) {
      const errData = await mistralRes.json().catch(() => ({}));
      return res.status(mistralRes.status).json({ error: errData?.message ?? `Erreur Mistral ${mistralRes.status}` });
    }

    if (!stream) {
      const data = await mistralRes.json();
      // On joint les sources web (même format que l'événement SSE `cia_meta`)
      // pour que les appels non-streamés (multi-personas) puissent afficher la
      // même section « Sources ».
      return res.status(200).json({ ...data, cia_meta: { sources: webSources } });
    }

    // Mode streaming SSE — pipe la réponse Mistral vers le client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    // Événement méta : on transmet d'abord les sources structurées au client
    // (format distinct du delta Mistral — le client le reconnaît via `cia_meta`).
    if (webSources.length > 0) {
      res.write(`data: ${JSON.stringify({ cia_meta: { sources: webSources } })}\n\n`);
    }

    const reader = mistralRes.body.getReader();
    const decoder = new TextDecoder();

    // Le texte est accumulé au fil de la diffusion pour être vérifié à la fin.
    // La vérification ne peut pas précéder l'envoi — le flux est justement là
    // pour que l'utilisateur lise pendant la génération — mais elle peut le
    // suivre, et le client affiche alors un avertissement si besoin.
    let accumule = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const morceau = decoder.decode(value, { stream: true });
      accumule += morceau;
      res.write(morceau);
    }

    try {
      // Reconstitue le texte utile depuis les deltas SSE de Mistral.
      const texte = accumule.split('\n')
        .filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
        .map((l) => { try { return JSON.parse(l.slice(6))?.choices?.[0]?.delta?.content ?? ''; } catch { return ''; } })
        .join('');

      if (texte) {
        const controle = verifierReponse(texte, { sources: webSources });
        if (!controle.conforme || panneRecherche) {
          res.write(`data: ${JSON.stringify({ cia_verif: {
            conforme: controle.conforme,
            atteintes: controle.atteintes,
            chiffres_non_sources: controle.chiffres.nonCites.length,
            citations_fantomes: controle.chiffres.fantomes.length,
            recherche: panneRecherche,
          } })}\n\n`);
        }
      }
    } catch (e) {
      console.error('[chat] verification en echec —', e?.message ?? e);
    }

    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message ?? 'Erreur serveur' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
}
