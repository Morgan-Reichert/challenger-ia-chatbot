import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tech.stariax.challengeria',
  appName: 'Challenger IA',
  webDir: 'dist',
  // Fond natif = fond de l'app (évite les bandes blanches derrière la WebView)
  backgroundColor: '#F0F4FF',
  ios: {
    // 'never' : la WebView occupe tout l'écran (bords + notch + home indicator).
    // C'est le CSS env(safe-area-inset-*) de l'app qui gère les marges.
    contentInset: 'never',
  },
};

export default config;
