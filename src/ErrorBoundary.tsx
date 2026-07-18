import React from 'react';
import { reportError } from './stariax';

/**
 * Capture les erreurs de rendu pour éviter la page blanche : affiche un écran
 * de secours sobre avec une action de rechargement (et log pour le monitoring).
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
    // Remontée vers STARIAX : les erreurs de rendu React ne déclenchent pas
    // window.onerror, il faut donc les signaler explicitement ici.
    reportError({
      message: error instanceof Error ? error.message : `Erreur de rendu : ${String(error)}`,
      stack: error instanceof Error ? error.stack : undefined,
      level: 'error',
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0c14', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center',
      }}>
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#5D7BFF' }}>
            Challenger IA
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0' }}>Une erreur est survenue</h1>
          <p style={{ fontSize: 14, opacity: 0.6, lineHeight: 1.6, marginBottom: 20 }}>
            Quelque chose s'est mal passé à l'affichage. Recharge la page — ta conversation est sauvegardée.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#5D7BFF', color: '#fff', border: 'none', padding: '10px 20px',
              fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
            }}
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
