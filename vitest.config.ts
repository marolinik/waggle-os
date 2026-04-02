import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Marketplace uses ESM .js extensions — alias to source for Vitest
      '@waggle/marketplace': path.resolve(__dirname, 'packages/marketplace/src/index.ts'),
      // App uses @/ alias for src directory
      '@/': path.resolve(__dirname, 'app/src') + '/',
      '@': path.resolve(__dirname, 'app/src'),
    },
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/tests/**/*.test.tsx',
      'tests/**/*.test.ts',
      'app/scripts/**/*.test.ts',
      'app/tests/**/*.test.ts',
    ],
    exclude: ['apps/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.d.ts'],
    },
  },
});
