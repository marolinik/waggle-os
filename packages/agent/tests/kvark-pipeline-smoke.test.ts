/**
 * KVARK Pipeline Smoke - assembled path validation (Milestone E1).
 * Exercises real B1-B4 + conflict + C pipeline code.
 * Only KVARK HTTP boundary is mocked via KvarkClientLike.
 */
import { describe, it, expect, vi } from 'vitest';
import { CombinedRetrieval, detectConflict, type MemorySearchLike, type MemorySearchResultLike } from '../src/combined-retrieval.js';
import { formatCombinedResult } from '../src/tools.js';
import { createKvarkTools, type KvarkClientLike, type KvarkSearchResponseLike } from '../src/kvark-tools.js';

function memStub(r: Array<{ id: number; content: string; score: number; type?: string }>): MemorySearchLike {
  const m: MemorySearchResultLike[] = r.map(x => ({ frame: { id: x.id, content: x.content, frame_type: x.type ?? 'fact', importance: 'normal' }, finalScore: x.score }));
  return { search: vi.fn().mockResolvedValue(m) };
}

function kStub(r: Array<{ id: number; title: string; snippet: string; score: number; type?: string }>): KvarkClientLike {
  const resp: KvarkSearchResponseLike = { query: 'q', total: r.length, results: r.map(x => ({ document_id: x.id, title: x.title, snippet: x.snippet, score: x.score, document_type: x.type ?? null })) };
  return { search: vi.fn().mockResolvedValue(resp), askDocument: vi.fn().mockResolvedValue({ answer: '', sources: [] }), feedback: vi.fn().mockResolvedValue({ ok: true }) };
}

describe('Pipeline: happy path', () => {
  it('all sources produce formatted output with attribution', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: memStub([{ id: 1, content: 'We use PostgreSQL', score: 0.75, type: 'decision' }]),
      personalSearch: memStub([{ id: 2, content: 'User prefers concise', score: 0.5 }]),
      kvarkClient: kStub([{ id: 42, title: 'ADR', snippet: 'PostgreSQL selected', score: 0.88, type: 'pdf' }]),
    });
    const r = await cr.search('db');
    const o = formatCombinedResult(r, true);
    expect(o).toContain('## Workspace Memory');
    expect(o).toContain('## Personal Memory');
    expect(o).toContain('## Enterprise Knowledge (KVARK)');
    expect(o).toContain('[workspace memory]');
    expect(o).toContain('[personal memory]');
    expect(o).toContain('[KVARK: pdf: ADR]');
    expect(o).not.toContain('## Source Conflict');
    expect(r.hasConflict).toBe(false);
  });
});

describe('Pipeline: conflict detection', () => {
  it('approved vs cancelled triggers conflict', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: memStub([{ id: 1, content: 'Vendor approved and confirmed', score: 0.85 }]),
      personalSearch: memStub([]),
      kvarkClient: kStub([{ id: 99, title: 'Policy', snippet: 'Vendor cancelled due to compliance', score: 0.9 }]),
    });
    const r = await cr.search('vendor');
    expect(r.hasConflict).toBe(true);
    const o = formatCombinedResult(r, true);
    expect(o).toContain('## Source Conflict');
    expect(o).toContain('## Workspace Memory');
    expect(o).toContain('## Enterprise Knowledge');
  });

  it('detectConflict consistent with CombinedRetrieval', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: memStub([{ id: 1, content: 'Project rejected', score: 0.8 }]),
      personalSearch: memStub([]),
      kvarkClient: kStub([{ id: 50, title: 'Minutes', snippet: 'Project approved', score: 0.85 }]),
    });
    const r = await cr.search('status');
    const d = detectConflict(r.workspaceResults, r.kvarkResults);
    expect(r.hasConflict).toBe(d !== null);
  });
});

describe('Pipeline: KVARK skip', () => {
  it('strong local results skip KVARK', async () => {
    const k = kStub([{ id: 1, title: 'D', snippet: 't', score: 0.9 }]);
    const cr = new CombinedRetrieval({
      workspaceSearch: memStub([{ id: 1, content: 'A', score: 0.9 }, { id: 2, content: 'B', score: 0.85 }, { id: 3, content: 'C', score: 0.75 }]),
      personalSearch: memStub([]), kvarkClient: k,
    });
    const r = await cr.search('test');
    expect(r.kvarkSkipped).toBe(true);
    expect(k.search).not.toHaveBeenCalled();
    expect(formatCombinedResult(r, true)).not.toContain('Enterprise');
  });
});

describe('Pipeline: KVARK failure', () => {
  it('local results preserved on error', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: memStub([{ id: 1, content: 'Local fact', score: 0.6 }]),
      personalSearch: memStub([{ id: 2, content: 'Note', score: 0.4 }]),
      kvarkClient: { search: vi.fn().mockRejectedValue(new Error('down')), askDocument: vi.fn() },
    });
    const r = await cr.search('x');
    const o = formatCombinedResult(r, true);
    expect(r.kvarkError).toBe('down');
    expect(r.hasConflict).toBe(false);
    expect(o).toContain('Local fact');
    expect(o).toContain('error');
  });
});

describe('Pipeline: feedback round-trip', () => {
  it('search doc IDs valid for feedback', async () => {
    const fb = vi.fn().mockResolvedValue({ ok: true });
    const k = kStub([{ id: 42, title: 'Q3', snippet: 'Rev up', score: 0.9, type: 'pdf' }]);
    k.feedback = fb;
    const cr = new CombinedRetrieval({ workspaceSearch: memStub([]), personalSearch: memStub([]), kvarkClient: k });
    const s = await cr.search('rev');
    const did = s.kvarkResults[0].metadata.documentId;
    expect(did).toBe(42);
    const t = createKvarkTools({ client: k }).find(x => x.name === 'kvark_feedback')!;
    const o = await t.execute({ document_id: did, query: 'rev', useful: true });
    expect(fb).toHaveBeenCalledWith(42, 'rev', true, undefined);
    expect(o).toContain('Feedback');
  });
});

describe('Pipeline: scope filtering', () => {
  it('personal skips workspace and KVARK', async () => {
    const w = memStub([{ id: 1, content: 'ws', score: 0.8 }]);
    const p = memStub([{ id: 2, content: 'pers', score: 0.7 }]);
    const k = kStub([{ id: 42, title: 'D', snippet: 'e', score: 0.9 }]);
    const cr = new CombinedRetrieval({ workspaceSearch: w, personalSearch: p, kvarkClient: k });
    const r = await cr.search('t', { scope: 'personal' });
    expect(r.workspaceResults).toHaveLength(0);
    expect(r.kvarkResults).toHaveLength(0);
    expect(w.search).not.toHaveBeenCalled();
    expect(k.search).not.toHaveBeenCalled();
  });

  it('workspace skips personal and KVARK', async () => {
    const w = memStub([{ id: 1, content: 'ws', score: 0.8 }]);
    const p = memStub([{ id: 2, content: 'pers', score: 0.7 }]);
    const k = kStub([{ id: 42, title: 'D', snippet: 'e', score: 0.9 }]);
    const cr = new CombinedRetrieval({ workspaceSearch: w, personalSearch: p, kvarkClient: k });
    const r = await cr.search('t', { scope: 'workspace' });
    expect(r.personalResults).toHaveLength(0);
    expect(r.kvarkResults).toHaveLength(0);
    expect(p.search).not.toHaveBeenCalled();
    expect(k.search).not.toHaveBeenCalled();
  });
});
