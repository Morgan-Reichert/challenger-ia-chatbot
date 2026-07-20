/**
 * Adaptateurs de modèle pour le banc d'essai.
 *
 * Chaque adaptateur expose la même signature que `appelerModele` de
 * api/_lib/mistral.js. Il est donc injectable dans `traiterChallenge.executer`,
 * ce qui fait que le banc exerce LE CODE DE PRODUCTION — même construction de
 * prompt système, mêmes structures par persona, mêmes températures.
 *
 * C'est ce qui distingue une mesure du produit d'une mesure d'un modèle : une
 * réimplémentation du prompt donnerait des résultats invérifiables.
 *
 * L'adaptateur enregistre au passage le prompt exact transmis, ce qui permet au
 * rapport de citer ce qui a réellement été envoyé plutôt que ce qu'on croit
 * avoir envoyé.
 */

const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Dernier échange capté — relu par l'exécuteur après chaque appel. */
export const dernierEchange = { systeme: null, utilisateur: null, temperature: null };

function capter({ systeme, utilisateur, temperature }) {
  dernierEchange.systeme = systeme;
  dernierEchange.utilisateur = utilisateur;
  dernierEchange.temperature = temperature;
}

/* ─── Mistral ─────────────────────────────────────────────────────────────── */

export function adaptateurMistral(cle, modele = 'mistral-small-latest') {
  return async function appelerModele({ systeme, utilisateur, temperature }) {
    capter({ systeme, utilisateur, temperature });
    const t0 = Date.now();
    try {
      const r = await fetch(MISTRAL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modele,
          messages: [
            { role: 'system', content: systeme },
            { role: 'user', content: utilisateur },
          ],
          temperature: temperature ?? 0.7,
        }),
      });
      const ms = Date.now() - t0;
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return { ok: false, statut: r.status, message: detail.slice(0, 200), ms };
      }
      const d = await r.json();
      return {
        ok: true,
        texte: d.choices?.[0]?.message?.content ?? '',
        usage: d.usage,
        ms,
        modele,
      };
    } catch (e) {
      return { ok: false, statut: 0, message: String(e?.message ?? e), ms: Date.now() - t0 };
    }
  };
}

/* ─── Gemini ──────────────────────────────────────────────────────────────── */

export function adaptateurGemini(cle, modele = 'gemini-2.0-flash') {
  return async function appelerModele({ systeme, utilisateur, temperature }) {
    capter({ systeme, utilisateur, temperature });
    const t0 = Date.now();
    try {
      // Gemini n'a pas de rôle « system » dans cette version de l'API :
      // la consigne passe par `systemInstruction`, champ dédié qui joue le
      // même rôle. Concaténer système et utilisateur fausserait la comparaison
      // en donnant au modèle un contexte de nature différente.
      const r = await fetch(`${GEMINI}/${modele}:generateContent?key=${cle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systeme }] },
          contents: [{ role: 'user', parts: [{ text: utilisateur }] }],
          generationConfig: { temperature: temperature ?? 0.7 },
        }),
      });
      const ms = Date.now() - t0;
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return { ok: false, statut: r.status, message: detail.slice(0, 200), ms };
      }
      const d = await r.json();
      const texte = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
      return {
        ok: true,
        texte,
        usage: {
          prompt_tokens: d.usageMetadata?.promptTokenCount,
          completion_tokens: d.usageMetadata?.candidatesTokenCount,
          total_tokens: d.usageMetadata?.totalTokenCount,
        },
        ms,
        modele,
      };
    } catch (e) {
      return { ok: false, statut: 0, message: String(e?.message ?? e), ms: Date.now() - t0 };
    }
  };
}
