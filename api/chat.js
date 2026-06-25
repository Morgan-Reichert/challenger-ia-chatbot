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

function safeDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ─── Recherche Tavily + analyse des sources ───────────────────────────────────
// Renvoie { context, sources } :
//  - context : texte injecté dans le prompt (sources NUMÉROTÉES à citer en [n])
//  - sources : liste structurée renvoyée au client pour l'affichage cliquable
async function searchAndAnalyze(query, mode, tavilyKey) {
  const isFactcheck = mode === 'factcheck';
  const tavilyRes = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: isFactcheck ? 'advanced' : 'basic',
      max_results: isFactcheck ? 10 : 5,
      include_answer: isFactcheck ? 'advanced' : true,
      include_raw_content: false,
      exclude_domains: SOURCE_TIERS.low,
    }),
  });

  if (!tavilyRes.ok) return null;
  const data = await tavilyRes.json();

  const TIER_RANK = { high: 0, medium: 1, unknown: 2, low: 3 };

  // Analyser + trier par fiabilité (sources de premier rang en tête)
  const sources = (data.results ?? [])
    .map(r => {
      const tier = getSourceTier(r.url);
      return {
        title: r.title || safeDomain(r.url),
        snippet: (r.content ?? '').slice(0, 280),
        url: r.url,
        domain: safeDomain(r.url),
        date: r.published_date ?? null,
        tier,
        tierLabel: tierLabel(tier),
      };
    })
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])
    .slice(0, isFactcheck ? 8 : 5)
    .map((s, i) => ({ ...s, n: i + 1 })); // numérotation après tri

  if (sources.length === 0) return { context: '', sources: [] };

  const highCount = sources.filter(s => s.tier === 'high').length;
  const mediumCount = sources.filter(s => s.tier === 'medium').length;

  // ── Contexte injecté dans le prompt : sources numérotées ──
  let context = '';
  if (data.answer) context += `**Synthèse web automatique :** ${data.answer}\n\n`;

  context += `**Sources numérotées — cite-les dans ta réponse avec [n] (ex : [1], [2]) :**\n`;
  sources.forEach(s => {
    context += `[${s.n}] (${s.tierLabel}) ${s.title} — ${s.domain}${s.date ? `, ${s.date}` : ''}\n${s.snippet}\n${s.url}\n\n`;
  });

  if (isFactcheck) {
    context += `\n📊 Croisement : ${sources.length} sources (${highCount} de premier rang ✅, ${mediumCount} modérées ⚠️).`;
    if (highCount === 0) {
      context += ` Aucune source de premier rang — reste prudent et signale-le explicitement.`;
    }
  }

  return { context: context.trim(), sources };
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
  // FAIL-CLOSED : en PRODUCTION, on refuse si l'auth n'est pas configurée —
  // sinon l'endpoint serait ouvert et le budget Mistral pillable.
  if (process.env.VERCEL_ENV === 'production' && !isAuthEnforced()) {
    return res.status(503).json({ error: 'Service indisponible : authentification serveur non configurée (FIREBASE_ADMIN_*).' });
  }
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
  let webSources = []; // sources structurées renvoyées au client
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (tavilyKey) {
    // On choisit le MODE via la détection (vérification de faits vs actualité),
    // même quand searchQuery est fourni → l'expérience fact-check vaut pour
    // n'importe quel persona, pas seulement par auto-détection.
    const detected = detectSearchNeed(messages);
    const searchTarget = searchQuery
      ? { query: searchQuery, mode: detected?.mode === 'factcheck' ? 'factcheck' : 'news' }
      : detected;

    if (searchTarget) {
      try {
        const result = await searchAndAnalyze(searchTarget.query, searchTarget.mode, tavilyKey);

        if (result && result.context) {
          webSources = result.sources;
          const isFactcheck = searchTarget.mode === 'factcheck';
          const citationRule = `\n\n## Citation des sources (OBLIGATOIRE)
Chaque affirmation factuelle que tu tires des sources ci-dessus DOIT être suivie de sa référence entre crochets : [n] (le numéro de la source). Tu peux en cumuler plusieurs : [1][3]. N'invente JAMAIS de numéro qui n'existe pas dans la liste. Ne mets une affirmation sans [n] que si elle ne provient pas des sources.`;

          const factcheckInstruction = isFactcheck
            ? `\n\n## Instructions vérification des faits
1. Décompose l'affirmation à vérifier en faits distincts si nécessaire.
2. Pour chaque fait : CONFIRMÉ / INFIRMÉ / INDÉTERMINÉ selon les sources, avec la référence [n].
3. Privilégie les sources de premier rang (✅). Ne présente jamais une info comme vraie si seules des sources non vérifiées l'appuient — dis-le explicitement.
4. Signale toute divergence entre les sources (et entre quelles sources).
5. Termine par un verdict clair : ✅ CONFIRMÉ / ❌ RÉFUTÉ / ⚠️ NON VÉRIFIÉ / 🔄 PARTIEL.
6. Termine par un visuel de fiabilité reflétant FIDÈLEMENT les sources, sur sa propre ligne :
[CIA_VIZ:{"kind":"confidence","level":"solide|etaye|a_confirmer|non_verifie","claim":"l'affirmation vérifiée","note":"ex: 3 sources fiables concordantes"}]
Paliers : "solide" = plusieurs ✅ concordent ; "etaye" = une ✅ ; "a_confirmer" = seulement ⚠️ ; "non_verifie" = aucune fiable ou sources divergentes. N'invente aucun chiffre dans la note.`
            : '';

          finalMessages = finalMessages.map((m, i) =>
            i === 0 && m.role === 'system'
              ? {
                  ...m,
                  content: m.content
                    + `\n\n## Données web en temps réel (${new Date().toLocaleDateString('fr-FR')})\n`
                    + result.context
                    + citationRule
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

    // Événement méta : on transmet d'abord les sources structurées au client
    // (format distinct du delta Mistral — le client le reconnaît via `cia_meta`).
    if (webSources.length > 0) {
      res.write(`data: ${JSON.stringify({ cia_meta: { sources: webSources } })}\n\n`);
    }

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
