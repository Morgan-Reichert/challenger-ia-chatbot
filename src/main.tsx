import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary';
import { registerServiceWorker } from './push';
import { initStariaxErrors } from './stariaxErrors';
import './index.css';

inject();
registerServiceWorker();
initStariaxErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
