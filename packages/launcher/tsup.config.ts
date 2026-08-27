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
  // Runtime packages that cannot be bundled safely.
  external: [
    '@huggingface/transformers',
    'onnxruntime-node',
    'adm-zip',
    'playwright-core',
    'chromium-bidi',
  ],
});
