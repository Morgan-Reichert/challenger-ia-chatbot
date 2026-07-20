import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

// Identifiant du build, exposé dans « À propos ». Sans lui, un utilisateur qui
// signale une anomalie ne peut pas dire quelle version il exécute, et le
// support ne peut pas distinguer un bogue corrigé d'un cache périmé.
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(commit),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
