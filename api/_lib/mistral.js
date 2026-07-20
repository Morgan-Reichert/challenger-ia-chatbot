/**
 * Appel au modèle, mutualisé par les points d'entrée de l'API publique.
 *
 * La clé Mistral reste strictement côté serveur : elle n'est jamais exposée
 * aux consommateurs de l'API, qui s'authentifient avec leur propre clé.
 */
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';

export async function appelerModele({ systeme, utilisateur, modele, temperature }) {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) {
    return { ok: false, statut: 503, message: 'Modèle non configuré côté serveur.' };
  }

  try {
    const r = await fetch(MISTRAL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cle}`,
      },
      body: JSON.stringify({
        model: modele || 'mistral-small-latest',
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        messages: [
          { role: 'system', content: systeme },
          { role: 'user', content: utilisateur },
        ],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return { ok: false, statut: 502, message: 'Le modèle a renvoyé une erreur.', detail: detail.slice(0, 300) };
    }

    const data = await r.json();
    const texte = data?.choices?.[0]?.message?.content ?? '';
    return {
      ok: true,
      texte,
      usage: {
        jetons_entree: data?.usage?.prompt_tokens ?? null,
        jetons_sortie: data?.usage?.completion_tokens ?? null,
      },
    };
  } catch (e) {
    return { ok: false, statut: 502, message: 'Le modèle est injoignable.', detail: String(e?.message ?? e) };
  }
}
