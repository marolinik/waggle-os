import { describe, it, expect } from 'vitest';
import { loadThirdPartyManifests } from '../src/tool-manifest-loader.js';

function deps(files: Record<string, unknown>) {
  return {
    dir: '/fake',
    readDir: () => Object.keys(files),
    readFile: (p: string) => JSON.stringify(files[p.split(/[/\\]/).pop()!]),
  };
}

describe('loadThirdPartyManifests', () => {
  it('loads a valid PATH manifest, stamped builtin:false', () => {
    const out = loadThirdPartyManifests(deps({
      'foo.json': { id: 'foo-cli', displayName: 'Foo', launchable: true, hookCapable: false, hookPointer: '.foo/hm.json', detect: { kind: 'path', binaryName: 'foo' } },
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'foo-cli', builtin: false, detect: { kind: 'path', binaryName: 'foo' } });
  });

  it('rejects detect.kind:candidates (code-only strategy)', () => {
    const out = loadThirdPartyManifests(deps({
      'bad.json': { id: 'bad', displayName: 'B', launchable: true, hookCapable: false, hookPointer: '.b/hm.json', detect: { kind: 'candidates' } },
    }));
    expect(out).toEqual([]);
  });

  it('rejects shell-metachar / traversal in fields', () => {
    const out = loadThirdPartyManifests(deps({
      'evil.json': { id: 'evil', displayName: 'E', launchable: true, hookCapable: false, hookPointer: '../../etc/passwd', detect: { kind: 'path', binaryName: 'foo; rm -rf /' } },
    }));
    expect(out).toEqual([]);
  });

  it('returns [] when the dir is missing (readDir throws)', () => {
    expect(loadThirdPartyManifests({ dir: '/none', readDir: () => { throw new Error('ENOENT'); }, readFile: () => '' })).toEqual([]);
  });

  it('skips a malformed JSON file but keeps the valid ones', () => {
    const out = loadThirdPartyManifests({
      dir: '/fake',
      readDir: () => ['broken.json', 'ok.json'],
      readFile: (p: string) => (p.includes('broken') ? '{not json' : JSON.stringify({ id: 'ok-cli', displayName: 'OK', launchable: true, hookCapable: false, hookPointer: '.ok/hm.json', detect: { kind: 'path', binaryName: 'ok' } })),
    });
    expect(out.map((m) => m.id)).toEqual(['ok-cli']);
  });
});
