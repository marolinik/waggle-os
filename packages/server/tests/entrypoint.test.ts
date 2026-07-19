import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDirectModule } from '../src/index.js';

describe('team server entrypoint detection', () => {
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
