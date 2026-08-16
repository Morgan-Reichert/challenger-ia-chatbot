// ─── Synthèse vocale (lecture à haute voix des réponses de l'IA) ──────────────
//
// Passe par /api/tts (proxy ElevenLabs) : la clé reste côté serveur. Un seul
// audio joue à la fois — lancer une lecture coupe la précédente.

import { apiFetch } from './apiClient';

let audioCourant: HTMLAudioElement | null = null;
let urlCourante: string | null = null;

/** Coupe la lecture en cours, s'il y en a une. */
export function arreterLecture(): void {
  if (audioCourant) {
    audioCourant.pause();
    audioCourant.src = '';
    audioCourant = null;
  }
  if (urlCourante) {
    URL.revokeObjectURL(urlCourante);
    urlCourante = null;
  }
}

/**
 * Lit `texte` à haute voix. Résout quand la lecture DÉMARRE ; `onEnd` est appelé
 * à la fin (ou à l'interruption). Lève en cas d'échec réseau/serveur.
 */
export async function lireTexte(texte: string, onEnd?: () => void): Promise<void> {
  arreterLecture();

  const res = await apiFetch('/api/tts', {
    method: 'POST',
    body: JSON.stringify({ text: texte }),
  });
  if (!res.ok) {
    let msg = `tts_${res.status}`;
    try { msg = (await res.json())?.error ?? msg; } catch { /* corps non-JSON */ }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioCourant = audio;
  urlCourante = url;

  const finir = () => {
    if (urlCourante === url) { URL.revokeObjectURL(url); urlCourante = null; }
    if (audioCourant === audio) audioCourant = null;
    onEnd?.();
  };
  audio.addEventListener('ended', finir);
  audio.addEventListener('error', finir);

  await audio.play();
}
