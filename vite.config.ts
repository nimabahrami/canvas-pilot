import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  // Vite's TSX transform uses tsconfig's react-jsx mode. Omitting the refresh
  // plugin keeps development compatible with the same strict CSP as production.
  plugins: [tailwindcss(), {
    name: 'development-connect-policy',
    apply: 'serve',
    transformIndexHtml: html => html.replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:5173"),
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'es2022', chunkSizeWarningLimit: 650,
    rolldownOptions: {
      onwarn(warning, warn) {
        // Every component runs in the client; upstream RSC markers are harmless here.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
    },
  },
});
