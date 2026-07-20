import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary';
import ConsentBanner from './ConsentBanner';
import { registerServiceWorker } from './push';
import { initStariaxErrors } from './stariaxErrors';
import { mesureAutorisee, surChangementConsentement } from './consent';
import { chargerA11y, appliquerA11y } from './accessibilite';
import './index.css';

// Le script en tête de index.html a déjà posé les préférences avant le premier
// rendu ; on les réapplique ici pour que le code TypeScript reste la référence
// unique et que les deux implémentations ne puissent pas diverger en silence.
appliquerA11y(chargerA11y());

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
