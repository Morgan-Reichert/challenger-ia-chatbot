/**
 * Vercel serverless function — Proxy Mistral AI avec streaming SSE
 * - MISTRAL_API_KEY : variable serveur uniquement dans Vercel (sans préfixe VITE_)
 * - TAVILY_API_KEY  : idem — recherche web côté serveur uniquement
 * - Paramètre `stream` : si true → SSE, sinon → JSON bloc (pour LibraryPage)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, model, temperature, searchQuery, stream = true } = req.body;

  if (!messages || !model) {
    return res.status(400).json({ error: 'messages et model sont requis' });
  }

  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) {
    return res.status(500).json({ error: 'MISTRAL_API_KEY non configurée sur le serveur' });
  }

  // ── Recherche web Tavily (optionnelle) ──────────────────────────────────────
  let finalMessages = messages;

  if (searchQuery) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const tavilyRes = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: searchQuery,
            search_depth: 'basic',
            max_results: 5,
            include_answer: true,
            include_raw_content: false,
          }),
        });
        if (tavilyRes.ok) {
          const tavilyData = await tavilyRes.json();
          let webContext = '';
          if (tavilyData.answer) webContext += `Synthèse web : ${tavilyData.answer}\n\n`;
          if (tavilyData.results?.length) {
            webContext += 'Sources récentes :\n';
            tavilyData.results.slice(0, 4).forEach((r) => {
              webContext += `• ${r.title}\n  ${(r.content ?? '').slice(0, 250)}\n  Source : ${r.url}\n\n`;
            });
          }
          if (webContext.trim()) {
            finalMessages = finalMessages.map((m, i) =>
              i === 0 && m.role === 'system'
                ? { ...m, content: m.content + `\n\n## Résultats web récents\n${webContext.trim()}` }
                : m
            );
          }
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
      // Mode bloc (LibraryPage)
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
