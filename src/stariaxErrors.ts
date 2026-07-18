/**
 * Capture des erreurs runtime non gérées → remontée vers STARIAX.
 * Volontairement minimal : aucune dépendance, aucun effet de bord visible.
 */
import { reportError } from './stariax';

let started = false;

export function initStariaxErrors(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('error', (ev) => {
    reportError({
      message: ev.message || 'Erreur inconnue',
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
      url: location.href,
      level: 'error',
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const r: unknown = ev.reason;
    const msg = r instanceof Error ? r.message : String(r);
    reportError({
      message: `Promesse rejetée : ${msg}`,
      stack: r instanceof Error ? r.stack : undefined,
      url: location.href,
      level: 'error',
    });
  });
}
