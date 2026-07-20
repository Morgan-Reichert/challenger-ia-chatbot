import { apiFetch } from './apiClient';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Enregistre le service worker (à appeler au démarrage). */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/sw.js'); } catch { /* ignore */ }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushResult = 'granted' | 'denied' | 'unsupported' | 'error';

/** Demande la permission, s'abonne au push et enregistre l'abonnement côté serveur. */
export async function enablePush(): Promise<PushResult> {
  if (!isPushSupported() || !VAPID_PUBLIC) return 'unsupported';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    await apiFetch('/api/push?action=subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
    return 'granted';
  } catch {
    return 'error';
  }
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Notification locale (app ouverte) — ex. "tâche terminée". */
export async function notifyLocal(title: string, body: string, url = '/'): Promise<void> {
  try {
    if (!isPushSupported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url } });
  } catch { /* ignore */ }
}
