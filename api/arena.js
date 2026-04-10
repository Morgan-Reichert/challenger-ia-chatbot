/**
 * Vercel serverless function — L'Arène AI Arbiter
 * Actions: sophism | synthesis | factcheck
 * Returns JSON (non-streaming)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, ...params } = req.body;
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) return res.status(500).json({ error: 'MISTRAL_API_KEY manquante' });

  let messages;

  if (action === 'sophism') {
    const { content, context } = params;
    messages = [
      {
        role: 'system',
        content: `Tu es un expert en logique et rhétorique. Analyse le commentaire fourni pour détecter des sophismes ou arguments de mauvaise foi.

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks) avec cette structure exacte :
{
  "detected": true | false,
  "type": "nom du sophisme ou vide si aucun",
  "explanation": "explication pédagogique en 1-2 phrases, ou vide si aucun",
  "severity": "low" | "medium" | "high"
}

Sophismes courants : ad hominem, homme de paille, faux dilemme, généralisation abusive, appel à l'autorité, pente glissante, appel à l'émotion, argument circulaire.
Si aucun sophisme détecté, renvoie detected: false avec severity: "low".`,
      },
      {
        role: 'user',
        content: `Contexte du débat : "${context}"\n\nCommentaire à analyser : "${content}"`,
      },
    ];
  } else if (action === 'synthesis') {
    const { title, preamble, comments } = params;
    const commentLines = comments
      .slice(0, 50)
      .map((c, i) => `${i + 1}. [${c.stance.toUpperCase()}] ${c.content}`)
      .join('\n');
    messages = [
      {
        role: 'system',
        content: `Tu es un analyste de débats intellectuels. Synthétise les arguments des commentaires fournis de façon structurée et neutre. Réponds en Markdown avec ces sections :
## Arguments pour (D'accord)
## Arguments contre (Pas d'accord)
## Nuances et positions complexes
## Verdict de l'Arène
Sois concis (max 300 mots au total). Cite les arguments les plus solides de chaque camp. Ne prends pas position.`,
      },
      {
        role: 'user',
        content: `Titre du débat : "${title}"\nContexte : "${preamble}"\n\nCommentaires (${comments.length}) :\n${commentLines}`,
      },
    ];
  } else if (action === 'factcheck') {
    const { claim, context } = params;
    messages = [
      {
        role: 'system',
        content: `Tu es un fact-checker rigoureux. Vérifie la véracité de l'affirmation fournie. Réponds en Markdown avec ces sections :
## Verdict
(VRAI / FAUX / PARTIELLEMENT VRAI / NON VÉRIFIABLE)
## Analyse
(2-3 phrases d'explication)
## Sources & références
(cite des sources connues ou indique l'absence de données fiables)`,
      },
      {
        role: 'user',
        content: `Contexte du débat : "${context}"\n\nAffirmation à vérifier : "${claim}"`,
      },
    ];
  } else {
    return res.status(400).json({ error: 'Action inconnue' });
  }

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages,
        temperature: 0.2,
        max_tokens: 600,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Mistral error: ${err}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';

    if (action === 'sophism') {
      try {
        const parsed = JSON.parse(text);
        return res.json(parsed);
      } catch {
        return res.json({ detected: false, type: '', explanation: '', severity: 'low' });
      }
    }

    return res.json({ result: text });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
