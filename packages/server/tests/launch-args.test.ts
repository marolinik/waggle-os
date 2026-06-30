/**
 * AI-OS #5 fast-follow — promptArgTemplate application: a third-party adapter's
 * declarative template turns a raw prompt into CLI args at launch. Focused unit
 * on the exported resolver (the route just looks the manifest up + calls it).
 */
import { describe, it, expect } from 'vitest';
import { resolveLaunchArgs } from '../src/local/routes/tools.js';
import type { ToolManifest } from '@waggle/shared';

const manifest = (promptArgTemplate?: string[]): ToolManifest => ({
  id: 'foo',
  displayName: 'Foo',
  launchable: true,
  hookCapable: false,
  hookPointer: '.foo/hm.json',
  detect: { kind: 'path', binaryName: 'foo' },
  ...(promptArgTemplate ? { promptArgTemplate } : {}),
  builtin: false,
});

describe('resolveLaunchArgs (#5 fast-follow)', () => {
  it('passes through explicit args (built-in path) unchanged', () => {
    expect(resolveLaunchArgs(manifest(['--print', '{prompt}']), { args: ['--print', 'hi'], prompt: 'ignored' }))
      .toEqual(['--print', 'hi']);
  });
  it('applies a third-party promptArgTemplate when a prompt is given and no args', () => {
    expect(resolveLaunchArgs(manifest(['--print', '{prompt}']), { prompt: 'hello' }))
      .toEqual(['--print', 'hello']);
  });
  it('returns undefined with no args and no template', () => {
    expect(resolveLaunchArgs(manifest(), { prompt: 'hello' })).toBeUndefined();
  });
  it('returns undefined with a template but no prompt', () => {
    expect(resolveLaunchArgs(manifest(['--print', '{prompt}']), {})).toBeUndefined();
  });
  it('returns undefined when the manifest is missing', () => {
    expect(resolveLaunchArgs(undefined, { prompt: 'hello' })).toBeUndefined();
  });
});
