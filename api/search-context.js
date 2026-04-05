/**
 * Vercel serverless function — Web context for debate personas
 * Fetches recent info from DuckDuckGo Instant Answer API (no key needed)
 * to enrich debate system prompts with real-time context.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { query, lang = 'fr' } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    // DuckDuckGo Instant Answer API — free, no auth
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'ChallengerIA/1.0' },
    });

    let ddgText = '';
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText) ddgText = ddgData.AbstractText;
      else if (ddgData.RelatedTopics?.[0]?.Text) ddgText = ddgData.RelatedTopics[0].Text;
    }

    // Wikipedia REST API — rich summary, free, CORS-ok
    const wikiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const wikiRes = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'ChallengerIA/1.0' },
    });

    let wikiText = '';
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      wikiText = wikiData.extract ?? '';
    }

    const context = [wikiText, ddgText].filter(Boolean).join('\n\n');

    res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1h
    return res.status(200).json({ context: context.slice(0, 3000) });
  } catch (err) {
    console.error('search-context error:', err);
    return res.status(200).json({ context: '' }); // fail silently — debate still works
  }
}
