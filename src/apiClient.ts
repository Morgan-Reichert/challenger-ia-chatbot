// ─── Wrapper fetch pour /api/* — injecte automatiquement l'ID token Firebase ──
// Si l'utilisateur est connecté, ajoute `Authorization: Bearer <idToken>`.
// Si non connecté ou Firebase non configuré, fetch nu (le serveur refusera si
// FIREBASE_ADMIN_* est configuré côté Vercel).

import { auth } from './firebase';

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
  return fetch(path, { ...init, headers });
}
