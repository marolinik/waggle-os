import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installShutdownHandlers, isDirectModule } from '../src/index.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('cloud worker production entrypoint', () => {
  it('builds a standalone compiled worker after its server dependency', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const workerPackage = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'packages/worker/package.json'), 'utf8'),
    ) as {
      main?: string;
      types?: string;
      exports?: Record<string, { import?: string; types?: string }>;
      scripts?: Record<string, string>;
    };
    const build = rootPackage.scripts['build:packages'];

    expect(build.indexOf('../worker')).toBeGreaterThan(build.indexOf('../server'));
    expect(build).toContain('cd ../worker && npm run build');
    expect(workerPackage.scripts?.build).toContain('tsc --build --force');
    expect(workerPackage.scripts?.build).toContain('--bundle');
    expect(workerPackage.main).toBe('dist/index.js');
    expect(workerPackage.types).toBe('dist/src/index.d.ts');
    expect(workerPackage.exports?.['.']).toEqual({
      types: './dist/src/index.d.ts',
      import: './dist/index.js',
    });
  });

  it('runs the compiled worker as a production Compose service', () => {
    const compose = readFileSync(resolve(REPO_ROOT, 'docker-compose.production.yml'), 'utf8');

    expect(compose).toMatch(/\n {2}worker:\r?\n/);
    expect(compose).toContain("command: ['node', 'packages/worker/dist/index.js']");
    expect(compose).toContain('DATABASE_URL=postgres://waggle:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@postgres:5432/waggle');
    expect(compose).toContain('REDIS_URL=redis://redis:6379');
  });

  it('recognizes the compiled entrypoint by URL identity', () => {
    const distPath = resolve(REPO_ROOT, 'packages/worker/dist/index.js');

    expect(isDirectModule(distPath, pathToFileURL(distPath).href)).toBe(true);
    expect(isDirectModule(distPath, pathToFileURL(resolve(REPO_ROOT, 'consumer.js')).href)).toBe(false);
    expect(isDirectModule(undefined, pathToFileURL(distPath).href)).toBe(false);
  });

  it('drains the worker once across repeated shutdown signals', async () => {
    const listeners = new Map<string, () => void>();
    let releaseClose!: () => void;
    const close = vi.fn(() => new Promise<void>(resolve => { releaseClose = resolve; }));
    const shutdown = installShutdownHandlers(
      { close },
      { once: (signal, listener) => { listeners.set(signal, listener); } },
    );

    expect([...listeners.keys()]).toEqual(['SIGTERM', 'SIGINT']);
    listeners.get('SIGTERM')!();
    listeners.get('SIGINT')!();
    const draining = shutdown();

    expect(shutdown()).toBe(draining);
    expect(close).toHaveBeenCalledTimes(1);
    releaseClose();
    await draining;
  });
});
