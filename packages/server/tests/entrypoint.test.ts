import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDirectModule } from '../src/index.js';

describe('team server entrypoint detection', () => {
  it('builds and exports WaggleDance as compiled runtime code before the server', () => {
    const rootPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const dancePackage = JSON.parse(
      readFileSync(resolve('packages/waggle-dance/package.json'), 'utf8'),
    ) as {
      main?: string;
      types?: string;
      scripts?: Record<string, string>;
      exports?: Record<string, { import?: string; types?: string }>;
    };
    const build = rootPackage.scripts['build:packages'];

    expect(build.indexOf('../waggle-dance')).toBeGreaterThan(build.indexOf('packages/shared'));
    expect(build.indexOf('../waggle-dance')).toBeLessThan(build.indexOf('../server'));
    expect(build).toContain('cd ../waggle-dance && npx tsc --build --force');
    expect(dancePackage.scripts?.build).toBe('tsc --build --force');
    expect(dancePackage.main).toBe('dist/index.js');
    expect(dancePackage.types).toBe('dist/index.d.ts');
    expect(dancePackage.exports?.['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
    });
  });

  it('recognizes the compiled dist entrypoint by URL identity', () => {
    const distPath = resolve('packages/server/dist/index.js');

    expect(isDirectModule(distPath, pathToFileURL(distPath).href)).toBe(true);
  });

  it('does not start when imported by another process entrypoint', () => {
    const distPath = resolve('packages/server/dist/index.js');
    const importerUrl = pathToFileURL(resolve('packages/server/dist/consumer.js')).href;

    expect(isDirectModule(distPath, importerUrl)).toBe(false);
    expect(isDirectModule(undefined, importerUrl)).toBe(false);
  });
});
