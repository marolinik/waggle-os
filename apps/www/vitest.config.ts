import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Next.js pulls Node's deprecated built-in `punycode` module through a
// dependency chain during Vitest worker startup. This is an upstream warning,
// not a www failure; propagate the narrow suppression to child workers so the
// release signal remains readable.
if (!process.env.NODE_OPTIONS?.includes('--disable-warning=DEP0040')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --disable-warning=DEP0040`.trim();
}

/**
 * Vitest config — independent of the Next.js bundler. Vitest uses Vite under
 * the hood for transformation, so `@vitejs/plugin-react` stays in devDeps
 * even though the app build is now driven by Next.js.
 *
 * `esbuild.jsx: 'automatic'` is required because tsconfig.json sets
 * `"jsx": "preserve"` (Next.js's required value — it transforms JSX itself
 * with SWC). Without an explicit JSX runtime here, vitest's underlying
 * esbuild transformer falls back to legacy `React.createElement()` output
 * and tests fail with `ReferenceError: React is not defined`.
 *
 * The `@/*` alias mirrors the `tsconfig.json` `paths` entry so test imports
 * resolve identically to runtime imports (e.g.
 * `@/src/components/BrandPersonasCard`).
 */
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});
