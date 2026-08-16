/**
 * Vercel serverless function — Synthèse vocale (ElevenLabs).
 *
 * La clé ELEVENLABS_API_KEY reste STRICTEMENT côté serveur : l'exposer au client
 * (préfixe VITE_) la publierait dans le bundle d'un dépôt public — fuite
 * immédiate d'un service payant. Le client envoie le texte, reçoit l'audio.
 *
 * Protégé comme /api/chat : en production, un token Firebase est exigé, sinon
 * l'endpoint serait un robinet ouvert sur un service facturé.
 */
import { verifyIdToken, isAuthEnforced } from './_lib/admin.js';
import { cors } from './_lib/cors.js';

// Voix multilingue par défaut (Rachel). Surchargée par ELEVENLABS_VOICE_ID.
const VOIX_DEFAUT = '21m00Tcm4TlvDq8ikWAM';
const MAX_CARACTERES = 5000;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const cle = process.env.ELEVENLABS_API_KEY;
  if (!cle) {
    return res.status(503).json({ error: 'Synthèse vocale non configurée sur le serveur.' });
  }

  // FAIL-CLOSED en production : pas d'auth configurée = service fermé.
  if (process.env.VERCEL_ENV === 'production' && !isAuthEnforced()) {
    return res.status(503).json({ error: 'Service indisponible : authentification serveur non configurée.' });
  }
  const { uid } = await verifyIdToken(req);
  if (isAuthEnforced() && !uid) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  const { text, voiceId } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text requis' });
  }
  const texte = text.slice(0, MAX_CARACTERES);
  const voix = (typeof voiceId === 'string' && voiceId.trim()) || process.env.ELEVENLABS_VOICE_ID || VOIX_DEFAUT;

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voix)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': cle, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        // eleven_multilingual_v2 : lit le français avec la bonne prosodie.
        body: JSON.stringify({ text: texte, model_id: 'eleven_multilingual_v2' }),
      },
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[tts] elevenlabs', r.status, detail.slice(0, 200));
      // On n'expose jamais le détail amont (il peut révéler la clé/le quota).
      return res.status(r.status === 401 ? 502 : r.status).json({ error: 'Synthèse vocale indisponible.' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[tts]', e?.message ?? e);
    return res.status(500).json({ error: 'Erreur synthèse vocale' });
  }
}
