import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/waggle/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        // Primary landing entry (mirrors default Vite behaviour when
        // `index.html` is the single input).
        main: path.resolve(__dirname, 'index.html'),
        // Internal design preview — served at /waggle/design-personas.html.
        // Not linked from the main landing; excluded from robots.
        'design-personas': path.resolve(__dirname, 'design-personas.html'),
      },
    },
  },
});
