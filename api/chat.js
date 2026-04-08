/**
 * Vercel serverless function — Proxy Mistral AI
 * Lit MISTRAL_API_KEY (sans préfixe VITE_) — variable serveur uniquement dans Vercel.
 * La clé ne sera jamais exposée dans le bundle client.
 * TAVILY_API_KEY aussi — la recherche web se fait ici, côté serveur.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, model, temperature, searchQuery } = req.body;

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
            // Injecte les résultats web dans le system prompt (premier message)
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
      body: JSON.stringify({ model, temperature, messages: finalMessages }),
    });

    const data = await mistralRes.json();
    return res.status(mistralRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message ?? 'Erreur serveur' });
  }
}
