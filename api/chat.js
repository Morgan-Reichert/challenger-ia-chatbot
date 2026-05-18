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
  return { high: '✅ Source fiable', medium: '⚠️ Source modérée', low: '🚨 Source peu fiable', unknown: '❓ Source inconnue' }[tier];
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

// ─── Recherche Tavily + analyse des sources ───────────────────────────────────
async function searchAndAnalyze(query, mode, tavilyKey) {
  const tavilyRes = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: mode === 'factcheck' ? 'advanced' : 'basic',
      max_results: mode === 'factcheck' ? 8 : 5,
      include_answer: true,
      include_raw_content: false,
      include_domains: [],
      exclude_domains: SOURCE_TIERS.low,
    }),
  });

  if (!tavilyRes.ok) return null;
  const data = await tavilyRes.json();

  // Analyser chaque source
  const analyzedResults = (data.results ?? []).map(r => ({
    title: r.title,
    content: (r.content ?? '').slice(0, 300),
    url: r.url,
    publishedDate: r.published_date ?? null,
    tier: getSourceTier(r.url),
    tierLabel: tierLabel(getSourceTier(r.url)),
  }));

  // Grouper par fiabilité
  const highSources = analyzedResults.filter(r => r.tier === 'high');
  const mediumSources = analyzedResults.filter(r => r.tier === 'medium');
  const unknownSources = analyzedResults.filter(r => r.tier === 'unknown' || r.tier === 'low');

  // Détecter les divergences (fact-check seulement)
  let divergenceNote = '';
  if (mode === 'factcheck' && analyzedResults.length >= 3) {
    const sourceDomains = analyzedResults.map(r => new URL(r.url).hostname.replace(/^www\./, '')).join(', ');
    divergenceNote = `\n\n📊 Croisement de ${analyzedResults.length} sources (${sourceDomains}).`;
    if (highSources.length === 0) {
      divergenceNote += ' ⚠️ Aucune source de premier rang trouvée — information à vérifier avec prudence.';
    }
  }

  // Construire le contexte enrichi
  let context = '';

  if (data.answer) {
    context += `**Synthèse web :** ${data.answer}\n\n`;
  }

  if (highSources.length > 0) {
    context += `**Sources fiables :**\n`;
    highSources.slice(0, 3).forEach(r => {
      context += `• [${tierLabel(r.tier)}] ${r.title}\n  ${r.content}\n  🔗 ${r.url}${r.publishedDate ? ` (${r.publishedDate})` : ''}\n\n`;
    });
  }

  if (mediumSources.length > 0) {
    context += `**Sources secondaires :**\n`;
    mediumSources.slice(0, 2).forEach(r => {
      context += `• [${tierLabel(r.tier)}] ${r.title}\n  ${r.content}\n  🔗 ${r.url}\n\n`;
    });
  }

  if (unknownSources.length > 0 && mode === 'factcheck') {
    context += `**Sources non vérifiées (à traiter avec prudence) :**\n`;
    unknownSources.slice(0, 2).forEach(r => {
      context += `• [${tierLabel(r.tier)}] ${r.title}\n  🔗 ${r.url}\n\n`;
    });
  }

  context += divergenceNote;

  return context.trim();
}

// ─── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, model, temperature, searchQuery, stream = true, attachmentCount = 0 } = req.body;

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
  const { uid, error: authErr, skipped: authSkipped } = await verifyIdToken(req);
  if (isAuthEnforced() && !uid) {
    return res.status(401).json({ error: authErr === 'invalid_token' ? 'Token invalide' : 'Authentification requise' });
  }

  // Cap les pièces jointes (3 max — cf. README) pour éviter les coûts abusifs.
  const safeAttachCount = Math.max(0, Math.min(3, Number(attachmentCount) || 0));
  const cost = 1 + safeAttachCount * 3;

  if (!authSkipped) {
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
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (tavilyKey) {
    // Détection automatique si pas de searchQuery explicite
    const autoSearch = searchQuery ? null : detectSearchNeed(messages);
    const searchTarget = searchQuery
      ? { query: searchQuery, mode: 'news' }
      : autoSearch;

    if (searchTarget) {
      try {
        const webContext = await searchAndAnalyze(searchTarget.query, searchTarget.mode, tavilyKey);

        if (webContext) {
          const factcheckInstruction = searchTarget.mode === 'factcheck'
            ? `\n\n## Instructions vérification des faits
IMPORTANT : Tu dois impérativement :
1. Indiquer explicitement si l'information est CONFIRMÉE, INFIRMÉE ou INDÉTERMINÉE selon les sources.
2. Citer les sources fiables trouvées (avec leur niveau de fiabilité).
3. Signaler toute divergence entre les sources.
4. Ne jamais présenter une information comme vraie si les sources de premier rang (✅) sont absentes.
5. Terminer par un verdict clair : ✅ CONFIRMÉ / ❌ RÉFUTÉ / ⚠️ NON VÉRIFIÉ / 🔄 PARTIEL`
            : '';

          finalMessages = finalMessages.map((m, i) =>
            i === 0 && m.role === 'system'
              ? {
                  ...m,
                  content: m.content
                    + `\n\n## Données web en temps réel (${new Date().toLocaleDateString('fr-FR')})\n`
                    + webContext
                    + factcheckInstruction,
                }
              : m
          );
        }
      } catch {
        // Fail silencieux — le chat fonctionne sans recherche web
      }
    }
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
      return res.status(200).json(data);
    }

    // Mode streaming SSE — pipe la réponse Mistral vers le client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = mistralRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
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
