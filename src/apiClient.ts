// ─── Wrapper fetch pour /api/* — injecte automatiquement l'ID token Firebase ──
// Si l'utilisateur est connecté, ajoute `Authorization: Bearer <idToken>`.
// Si non connecté ou Firebase non configuré, fetch nu (le serveur refusera si
// FIREBASE_ADMIN_* est configuré côté Vercel).

import { auth } from './firebase';

// Base d'API : vide sur le web (chemins relatifs), URL absolue du backend Vercel
// pour l'app native Capacitor (servie depuis capacitor://localhost).
// → définir VITE_API_BASE (ex. https://ton-app.vercel.app) pour les builds natifs.
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

/** Préfixe un chemin /api/... par la base (absolue en natif, relatif sur le web). */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return API_BASE + path;
}

async function getIdToken(): Promise<string | null> {
  try {
    const user = auth?.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  const headers = new Headers(init.headers ?? {});
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(apiUrl(path), { ...init, headers });
}
