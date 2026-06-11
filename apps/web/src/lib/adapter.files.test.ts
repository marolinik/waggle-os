/**
 * P2 regression lock — getWorkspaceFiles envelope unwrap.
 *
 * The /api/workspaces/:id/files route returns `{ files: [...] }` (workspaces.ts
 * F2), but the adapter used to return the envelope object itself; the
 * defensive Array.isArray guard in WorkspaceDesktopApp's normalizeArtifacts()
 * then silently rendered the Artifacts widget/tab permanently empty. This file
 * pins the unwrap at the fetch layer — component tests mock the adapter and
 * are structurally blind to it (same class as the authgate fetch-layer pins).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

const BASE = 'http://test-server:4242';

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('getWorkspaceFiles envelope unwrap (P2)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    localStorage.clear();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('unwraps the { files: [...] } envelope', async () => {
    const a = new LocalAdapter(BASE);
    fetchSpy.mockResolvedValue(jsonRes({ files: [{ name: 'plan.md' }, { name: 'deck.pptx' }] }));
    const files = await a.getWorkspaceFiles('w1');
    expect(files).toEqual([{ name: 'plan.md' }, { name: 'deck.pptx' }]);
  });

  it('passes a raw array through unchanged (forward compat)', async () => {
    const a = new LocalAdapter(BASE);
    fetchSpy.mockResolvedValue(jsonRes([{ name: 'plan.md' }]));
    expect(await a.getWorkspaceFiles('w1')).toEqual([{ name: 'plan.md' }]);
  });

  it('degrades to [] on a body without a files array', async () => {
    const a = new LocalAdapter(BASE);
    fetchSpy.mockResolvedValue(jsonRes({ unexpected: true }));
    expect(await a.getWorkspaceFiles('w1')).toEqual([]);
  });
});
