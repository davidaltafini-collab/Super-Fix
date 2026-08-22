import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        watch: {
          // Folder de referință (fișiere aruncate de David, nu fac parte din app):
          // Vite a crăpat pe un fișier temporar-blocat de acolo, îl scoatem din watcher.
          ignored: ['**/docdumpbydavidforclaude/**'],
        },
        // Proxy DOAR pentru dev: cererile /api pleacă prin serverul de dev către backend-ul
        // real. Browserul le vede ca same-origin, deci CORS-ul backend-ului (care permite
        // doar super-fix.ro) nu mai blochează login-ul de pe localhost. Auth-ul rămâne cel
        // real — nu ocolim nimic din sistemul de securitate.
        // Ținta e configurabilă: VITE_DEV_API_TARGET (implicit backendul de producție).
        proxy: {
          '/api': {
            target: env.VITE_DEV_API_TARGET || 'https://api.super-fix.ro',
            changeOrigin: true,
            secure: true,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
