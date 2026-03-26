import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Inline all @waggle/* workspace packages into the bundle.
  // Third-party npm packages stay external (installed as dependencies).
  noExternal: [/^@waggle\//],
  // Native/optional packages that cannot be bundled.
  external: [
    'playwright-core',
    'chromium-bidi',
  ],
});
