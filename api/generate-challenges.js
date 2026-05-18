/**
 * Vercel serverless cron — Génère 7 défis quotidiens frais avec Mistral
 * et les écrit dans Firestore sous /daily_challenges/{YYYY-MM-DD}.
 *
 * Déclenchement :
 *  - Cron Vercel hebdo (cf. vercel.json) — chaque dimanche 03:00 UTC
 *  - Vercel passe `Authorization: Bearer <CRON_SECRET>` automatiquement.
 *
 * Variables d'env requises :
 *  - MISTRAL_API_KEY
 *  - CRON_SECRET                  (auth du cron)
 *  - FIREBASE_ADMIN_PROJECT_ID    (cf. api/_lib/admin.js)
 *  - FIREBASE_ADMIN_CLIENT_EMAIL
 *  - FIREBASE_ADMIN_PRIVATE_KEY
 */
import { getAdminFirestore } from './_lib/admin.js';

const SYSTEM_PROMPT = `Tu génères des défis intellectuels quotidiens pour une app de pensée critique.
Chaque défi doit être :
- Une affirmation forte, polémique, mais argumentable des deux côtés
- En français, percutante, sans tournure scolaire
- Sur un sujet contemporain ou intemporel — varie les thèmes (philo, tech, politique, écologie, économie, éducation, science, société, bioéthique, justice, médias, finance, robotique, art, langage, histoire, mondialisation, vie privée, santé, cognition…)

Réponds STRICTEMENT avec un tableau JSON valide (sans markdown, sans backticks). Format exact :
[
  {
    "theme": "🧠 Philosophie",
    "title": "Titre court (max 60 caractères, question ou affirmation)",
    "prompt": "L'affirmation complète à débattre (1 phrase claire, max 200 caractères).",
    "difficulty": "facile" | "moyen" | "difficile",
    "persona": "architect" | "factchecker" | "opponent"
  },
  ...
]

Génère EXACTEMENT 7 défis variés en thèmes, difficultés et personas. Pas de doublons.`;

function isoDay(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  // Auth cron : Vercel cron passe Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const header = req.headers.authorization || '';
  if (cronSecret && header !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) return res.status(500).json({ error: 'MISTRAL_API_KEY manquante' });

  const db = getAdminFirestore();
  if (!db) return res.status(500).json({ error: 'Firebase Admin non configuré' });

  // ── Génération via Mistral ──────────────────────────────────────────────────
  let challenges;
  try {
    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        temperature: 0.9,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Génère 7 défis pour la semaine commençant le ${isoDay(0)}. Varie radicalement les thèmes.` },
        ],
      }),
    });
    if (!mistralRes.ok) {
      const e = await mistralRes.text();
      return res.status(502).json({ error: `Mistral ${mistralRes.status}: ${e.slice(0, 200)}` });
    }
    const data = await mistralRes.json();
    const text = data.choices?.[0]?.message?.content ?? '[]';
    // Tolérance : si l'IA a wrappé dans ```json, on nettoie
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    challenges = JSON.parse(cleaned);
    if (!Array.isArray(challenges) || challenges.length === 0) throw new Error('format invalide');
  } catch (e) {
    return res.status(502).json({ error: `Génération invalide : ${e.message}` });
  }

  // ── Écriture Firestore (un doc par jour, 7 jours) ───────────────────────────
  const batch = db.batch();
  const writes = [];
  challenges.slice(0, 7).forEach((c, i) => {
    const day = isoDay(i);
    const ref = db.collection('daily_challenges').doc(day);
    const doc = {
      day,
      theme: String(c.theme ?? '').slice(0, 60),
      title: String(c.title ?? '').slice(0, 120),
      prompt: String(c.prompt ?? '').slice(0, 400),
      difficulty: ['facile', 'moyen', 'difficile'].includes(c.difficulty) ? c.difficulty : 'moyen',
      persona: ['architect', 'factchecker', 'opponent'].includes(c.persona) ? c.persona : 'architect',
      generatedAt: new Date().toISOString(),
    };
    batch.set(ref, doc);
    writes.push(doc);
  });
  await batch.commit();

  return res.status(200).json({ ok: true, count: writes.length, days: writes.map(w => w.day) });
}
