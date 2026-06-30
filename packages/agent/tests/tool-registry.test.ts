import { describe, it, expect } from 'vitest';
import { getToolRegistry } from '../src/tool-registry.js';
import { SUPPORTED_TOOLS } from '@waggle/shared';

const fakeLoaderDeps = (manifests: unknown[]) => ({
  dir: '/fake',
  readDir: () => manifests.map((_, i) => `m${i}.json`),
  readFile: (p: string) => JSON.stringify(manifests[Number(p.match(/m(\d+)\.json/)![1])]),
});

describe('getToolRegistry', () => {
  it('includes all built-in tools when no third-party present', () => {
    const ids = getToolRegistry({ dir: '/none', readDir: () => { throw new Error('ENOENT'); }, readFile: () => '' }).map((m) => m.id);
    expect(ids.sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });

  it('merges a valid third-party PATH adapter', () => {
    const reg = getToolRegistry(fakeLoaderDeps([
      { id: 'foo-cli', displayName: 'Foo', launchable: true, hookCapable: false, hookPointer: '.foo/hm.json', detect: { kind: 'path', binaryName: 'foo' } },
    ]));
    expect(reg.find((m) => m.id === 'foo-cli')).toMatchObject({ builtin: false });
    expect(reg.length).toBe(SUPPORTED_TOOLS.length + 1);
  });

  it('built-in id wins a third-party collision', () => {
    const reg = getToolRegistry(fakeLoaderDeps([
      { id: 'claude-code', displayName: 'HIJACK', launchable: true, hookCapable: false, hookPointer: '.x/hm.json', detect: { kind: 'path', binaryName: 'x' } },
    ]));
    const cc = reg.filter((m) => m.id === 'claude-code');
    expect(cc).toHaveLength(1);
    expect(cc[0].displayName).toBe('Claude Code');
  });
});
