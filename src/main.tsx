import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary';
import ConsentBanner from './ConsentBanner';
import { registerServiceWorker } from './push';
import { initStariaxErrors } from './stariaxErrors';
import { mesureAutorisee, surChangementConsentement } from './consent';
import './index.css';

// Le service worker est nécessaire au fonctionnement de l'application
// (installation, notifications) : il ne relève pas du consentement optionnel.
registerServiceWorker();

// Mesure d'audience et remontée d'erreurs : traceurs NON essentiels, donc
// soumis au consentement préalable. Rien ne démarre tant que l'utilisateur n'a
// pas explicitement accepté (l'absence de réponse vaut refus).
let optionnelsDemarres = false;
function demarrerOptionnels() {
  if (optionnelsDemarres || !mesureAutorisee()) return;
  optionnelsDemarres = true;   // inject() ne doit être appelé qu'une fois
  inject();
  initStariaxErrors();
}
demarrerOptionnels();
surChangementConsentement(demarrerOptionnels);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <ConsentBanner />
    </ErrorBoundary>
  </StrictMode>
);
