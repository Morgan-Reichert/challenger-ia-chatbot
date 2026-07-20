/**
 * Appel au modèle, mutualisé par les points d'entrée de l'API publique.
 *
 * La clé Mistral reste strictement côté serveur : elle n'est jamais exposée
 * aux consommateurs de l'API, qui s'authentifient avec leur propre clé.
 */
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';

const ATTENTES_MS = [600, 1800, 4000];   // trois reprises, attente croissante

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Un dépassement de débit (429) est temporaire par nature : le renvoyer tel
 * quel à l'utilisateur transforme une seconde d'attente en échec visible. Une
 * campagne d'évaluation a mesuré 86 refus sur 90 appels au modèle le plus
 * large, faute de reprise — le point d'entrée de vérification factuelle était
 * donc pratiquement inutilisable dès que plusieurs requêtes se croisaient.
 *
 * On ne reprend QUE sur 429 et sur les erreurs serveur transitoires. Une erreur
 * de requête (400, 401, 422) se reproduirait à l'identique : la réessayer ne
 * ferait que retarder le diagnostic.
 */
function reprisePossible(statut) {
  return statut === 429 || statut === 500 || statut === 502 || statut === 503 || statut === 504;
}

export async function appelerModele({ systeme, utilisateur, modele, temperature, json }) {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) {
    return { ok: false, statut: 503, message: 'Modèle non configuré côté serveur.' };
  }

  let dernier = null;
  for (let essai = 0; essai <= ATTENTES_MS.length; essai++) {
    if (essai > 0) await pause(ATTENTES_MS[essai - 1]);
    dernier = await unAppel({ cle, systeme, utilisateur, modele, temperature, json });
    if (dernier.ok || !reprisePossible(dernier.statutAmont)) return dernier;
  }
  return dernier;
}

async function unAppel({ cle, systeme, utilisateur, modele, temperature, json }) {
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
        // Mode JSON natif : le fournisseur garantit alors une sortie
        // syntaxiquement valide. Sans lui, le modèle insérait de vrais retours
        // à la ligne dans les chaînes — ce que JSON interdit — et une réponse
        // sur deux devenait illisible.
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: systeme },
          { role: 'user', content: utilisateur },
        ],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      // `statutAmont` conserve le code du fournisseur pour décider d'une
      // reprise ; `statut` reste celui exposé à l'appelant.
      return {
        ok: false, statut: r.status === 429 ? 429 : 502, statutAmont: r.status,
        message: r.status === 429
          ? 'Le modèle est momentanément saturé. Réessayez dans un instant.'
          : 'Le modèle a renvoyé une erreur.',
        detail: detail.slice(0, 300),
      };
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
    return { ok: false, statut: 502, statutAmont: 503,
             message: 'Le modèle est injoignable.', detail: String(e?.message ?? e) };
  }
}
