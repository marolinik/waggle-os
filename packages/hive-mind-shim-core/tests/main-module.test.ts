import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDirectExecution } from '../src/main-module.js';

describe('isDirectExecution', () => {
  it('matches an argv filesystem path to its canonical file URL', () => {
    const scriptPath = resolve('fixtures', 'hook #1.js');
    expect(isDirectExecution(pathToFileURL(scriptPath).href, scriptPath)).toBe(true);
  });

  it('rejects a different entrypoint or missing argv path', () => {
    const modulePath = resolve('fixtures', 'hook.js');
    expect(isDirectExecution(pathToFileURL(modulePath).href, resolve('fixtures', 'other.js'))).toBe(false);
    expect(isDirectExecution(pathToFileURL(modulePath).href, '')).toBe(false);
  });
});
