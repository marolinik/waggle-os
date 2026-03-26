/**
 * Combined Retrieval — B1 tests.
 *
 * Tests the merge engine in isolation. All dependencies are mocked:
 * - MemorySearchLike (workspace + personal HybridSearch)
 * - KvarkClientLike (KVARK HTTP client)
 *
 * No server, no vault, no DB, no wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CombinedRetrieval,
  mapMemoryResult,
  mapKvarkResult,
  hasSufficientLocalCoverage,
  shouldQueryKvark,
  type MemorySearchLike,
  type MemorySearchResultLike,
  type CombinedResult,
} from '../src/combined-retrieval.js';
import type { KvarkClientLike, KvarkSearchResponseLike } from '../src/kvark-tools.js';

// ── Factories ─────────────────────────────────────────────────────────────

function makeMemoryResult(
  overrides: { id?: number; content?: string; score?: number; frameType?: string; importance?: string } = {},
): MemorySearchResultLike {
  return {
    frame: {
      id: overrides.id ?? 1,
      content: overrides.content ?? 'Some memory content',
      frame_type: overrides.frameType ?? 'P',
      importance: overrides.importance ?? 'normal',
    },
    finalScore: overrides.score ?? 0.5,
  };
}

function makeSearchMock(results: MemorySearchResultLike[] = []): MemorySearchLike {
  return { search: vi.fn(async () => results) };
}

const KVARK_RESPONSE: KvarkSearchResponseLike = {
  results: [
    { document_id: 42, title: 'Project Status Update', snippet: 'API review postponed.', score: 0.92, document_type: 'pdf' },
    { document_id: 108, title: 'Q1 Budget', snippet: 'Engineering budget increased.', score: 0.87, document_type: 'spreadsheet' },
  ],
  total: 8,
  query: 'project',
};

function makeKvarkClient(overrides?: Partial<KvarkClientLike>): KvarkClientLike {
  return {
    search: overrides?.search ?? vi.fn(async () => KVARK_RESPONSE),
    askDocument: overrides?.askDocument ?? vi.fn(async () => ({ answer: '', sources: [] })),
  };
}

// ── Helper unit tests ─────────────────────────────────────────────────────

describe('mapMemoryResult', () => {
  it('maps workspace memory result with correct attribution', () => {
    const input = makeMemoryResult({ id: 7, content: 'decision made', score: 0.85, frameType: 'I', importance: 'important' });
    const result = mapMemoryResult(input, 'workspace');

    expect(result.source).toBe('workspace');
    expect(result.attribution).toBe('[workspace memory]');
    expect(result.content).toBe('decision made');
    expect(result.score).toBe(0.85);
    expect(result.metadata.frameId).toBe(7);
    expect(result.metadata.frameType).toBe('I');
    expect(result.metadata.importance).toBe('important');
  });

  it('maps personal memory result with correct attribution', () => {
    const input = makeMemoryResult({ id: 3, content: 'user prefers bullets' });
    const result = mapMemoryResult(input, 'personal');

    expect(result.source).toBe('personal');
    expect(result.attribution).toBe('[personal memory]');
    expect(result.content).toBe('user prefers bullets');
  });
});

describe('mapKvarkResult', () => {
  it('preserves attribution from parseSearchResults', () => {
    const structured = {
      content: 'API review postponed.',
      documentId: 42,
      title: 'Project Status Update',
      score: 0.92,
      documentType: 'pdf' as string | null,
      attribution: '[KVARK: pdf: Project Status Update]',
    };

    const result = mapKvarkResult(structured);

    expect(result.source).toBe('kvark');
    expect(result.attribution).toBe('[KVARK: pdf: Project Status Update]');
    expect(result.score).toBe(0.92);
    expect(result.metadata.documentId).toBe(42);
    expect(result.metadata.documentType).toBe('pdf');
  });
});

describe('hasSufficientLocalCoverage', () => {
  it('returns true when 3+ results score >= 0.7', () => {
    const results: CombinedResult[] = [
      { content: '', source: 'workspace', attribution: '', score: 0.9, metadata: {} },
      { content: '', source: 'workspace', attribution: '', score: 0.8, metadata: {} },
      { content: '', source: 'personal', attribution: '', score: 0.7, metadata: {} },
    ];
    expect(hasSufficientLocalCoverage(results)).toBe(true);
  });

  it('returns false when fewer than 3 results score >= 0.7', () => {
    const results: CombinedResult[] = [
      { content: '', source: 'workspace', attribution: '', score: 0.9, metadata: {} },
      { content: '', source: 'workspace', attribution: '', score: 0.8, metadata: {} },
      { content: '', source: 'personal', attribution: '', score: 0.5, metadata: {} },
    ];
    expect(hasSufficientLocalCoverage(results)).toBe(false);
  });

  it('returns false for empty results', () => {
    expect(hasSufficientLocalCoverage([])).toBe(false);
  });
});

describe('shouldQueryKvark', () => {
  const weakLocal: CombinedResult[] = [
    { content: '', source: 'workspace', attribution: '', score: 0.3, metadata: {} },
  ];

  it('returns false when kvarkClient is null', () => {
    expect(shouldQueryKvark(null, 'all', weakLocal)).toBe(false);
  });

  it('returns false when scope is personal', () => {
    expect(shouldQueryKvark(makeKvarkClient(), 'personal', weakLocal)).toBe(false);
  });

  it('returns false when scope is workspace', () => {
    expect(shouldQueryKvark(makeKvarkClient(), 'workspace', weakLocal)).toBe(false);
  });

  it('returns false when local coverage is sufficient', () => {
    const strong: CombinedResult[] = [
      { content: '', source: 'workspace', attribution: '', score: 0.9, metadata: {} },
      { content: '', source: 'workspace', attribution: '', score: 0.8, metadata: {} },
      { content: '', source: 'personal', attribution: '', score: 0.75, metadata: {} },
    ];
    expect(shouldQueryKvark(makeKvarkClient(), 'all', strong)).toBe(false);
  });

  it('returns true when client exists, scope=all, and local coverage insufficient', () => {
    expect(shouldQueryKvark(makeKvarkClient(), 'all', weakLocal)).toBe(true);
  });
});

// ── CombinedRetrieval class tests ─────────────────────────────────────────

describe('CombinedRetrieval', () => {
  it('returns workspace + personal results when kvarkClient is null', async () => {
    const wsResults = [makeMemoryResult({ id: 1, content: 'ws fact', score: 0.9 })];
    const pResults = [makeMemoryResult({ id: 2, content: 'personal fact', score: 0.8 })];

    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock(wsResults),
      personalSearch: makeSearchMock(pResults),
      kvarkClient: null,
    });

    const result = await cr.search('test');

    expect(result.workspaceResults).toHaveLength(1);
    expect(result.personalResults).toHaveLength(1);
    expect(result.kvarkResults).toHaveLength(0);
    expect(result.kvarkAvailable).toBe(false);
    expect(result.kvarkSkipped).toBe(false); // not available, so not "skipped"
    expect(result.kvarkError).toBeUndefined();
  });

  it('searches only personal memory when scope=personal', async () => {
    const wsMock = makeSearchMock([makeMemoryResult({ id: 1 })]);
    const pMock = makeSearchMock([makeMemoryResult({ id: 2, content: 'personal only' })]);

    const cr = new CombinedRetrieval({
      workspaceSearch: wsMock,
      personalSearch: pMock,
      kvarkClient: makeKvarkClient(),
    });

    const result = await cr.search('test', { scope: 'personal' });

    expect(result.workspaceResults).toHaveLength(0);
    expect(result.personalResults).toHaveLength(1);
    expect(result.kvarkResults).toHaveLength(0);
    expect(result.kvarkSkipped).toBe(true);
    expect(wsMock.search).not.toHaveBeenCalled();
  });

  it('searches only workspace memory when scope=workspace', async () => {
    const wsMock = makeSearchMock([makeMemoryResult({ id: 1, content: 'ws only' })]);
    const pMock = makeSearchMock([makeMemoryResult({ id: 2 })]);

    const cr = new CombinedRetrieval({
      workspaceSearch: wsMock,
      personalSearch: pMock,
      kvarkClient: makeKvarkClient(),
    });

    const result = await cr.search('test', { scope: 'workspace' });

    expect(result.workspaceResults).toHaveLength(1);
    expect(result.personalResults).toHaveLength(0);
    expect(result.kvarkResults).toHaveLength(0);
    expect(result.kvarkSkipped).toBe(true);
    expect(pMock.search).not.toHaveBeenCalled();
  });

  it('calls KVARK when local results are insufficient', async () => {
    const searchFn = vi.fn(async () => KVARK_RESPONSE);
    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock([makeMemoryResult({ score: 0.3 })]),
      personalSearch: makeSearchMock([]),
      kvarkClient: makeKvarkClient({ search: searchFn }),
    });

    const result = await cr.search('project');

    expect(searchFn).toHaveBeenCalledWith('project', { limit: 10 });
    expect(result.kvarkResults).toHaveLength(2);
    expect(result.kvarkResults[0].source).toBe('kvark');
    expect(result.kvarkResults[0].attribution).toBe('[KVARK: pdf: Project Status Update]');
    expect(result.kvarkResults[1].attribution).toBe('[KVARK: spreadsheet: Q1 Budget]');
    expect(result.kvarkAvailable).toBe(true);
    expect(result.kvarkSkipped).toBe(false);
  });

  it('skips KVARK when local results are sufficient', async () => {
    const searchFn = vi.fn(async () => KVARK_RESPONSE);
    const strongResults = [
      makeMemoryResult({ id: 1, score: 0.9 }),
      makeMemoryResult({ id: 2, score: 0.85 }),
      makeMemoryResult({ id: 3, score: 0.75 }),
    ];

    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock(strongResults),
      personalSearch: makeSearchMock([]),
      kvarkClient: makeKvarkClient({ search: searchFn }),
    });

    const result = await cr.search('test');

    expect(searchFn).not.toHaveBeenCalled();
    expect(result.kvarkResults).toHaveLength(0);
    expect(result.kvarkAvailable).toBe(true);
    expect(result.kvarkSkipped).toBe(true);
  });

  it('degrades gracefully when KVARK throws an Error', async () => {
    const searchFn = vi.fn(async () => { throw new Error('KVARK is down'); });

    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock([makeMemoryResult({ id: 1, score: 0.4 })]),
      personalSearch: makeSearchMock([makeMemoryResult({ id: 2, score: 0.3 })]),
      kvarkClient: makeKvarkClient({ search: searchFn }),
    });

    const result = await cr.search('test');

    expect(result.workspaceResults).toHaveLength(1);
    expect(result.personalResults).toHaveLength(1);
    expect(result.kvarkResults).toHaveLength(0);
    expect(result.kvarkError).toBe('KVARK is down');
    expect(result.kvarkAvailable).toBe(true);
    expect(result.kvarkSkipped).toBe(false);
  });

  it('captures non-Error throws from KVARK as generic message', async () => {
    const searchFn = vi.fn(async () => { throw 'string error'; });

    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock([]),
      personalSearch: makeSearchMock([]),
      kvarkClient: makeKvarkClient({ search: searchFn }),
    });

    const result = await cr.search('test');

    expect(result.kvarkError).toBe('Unknown KVARK error');
    expect(result.kvarkResults).toHaveLength(0);
  });

  it('works correctly when no workspace search is available', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: null,
      personalSearch: makeSearchMock([makeMemoryResult({ id: 1, content: 'personal fact', score: 0.6 })]),
      kvarkClient: makeKvarkClient(),
    });

    const result = await cr.search('test');

    expect(result.workspaceResults).toHaveLength(0);
    expect(result.personalResults).toHaveLength(1);
    expect(result.kvarkResults).toHaveLength(2);
    expect(result.kvarkAvailable).toBe(true);
    expect(result.kvarkSkipped).toBe(false);
  });

  it('passes limit and profile through to memory search', async () => {
    const wsMock = makeSearchMock([]);
    const pMock = makeSearchMock([]);

    const cr = new CombinedRetrieval({
      workspaceSearch: wsMock,
      personalSearch: pMock,
      kvarkClient: null,
    });

    await cr.search('test', { limit: 5, profile: 'recent' });

    expect(wsMock.search).toHaveBeenCalledWith('test', { limit: 5, profile: 'recent' });
    expect(pMock.search).toHaveBeenCalledWith('test', { limit: 5, profile: 'recent' });
  });

  it('passes limit to KVARK client search', async () => {
    const searchFn = vi.fn(async () => KVARK_RESPONSE);

    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock([]),
      personalSearch: makeSearchMock([]),
      kvarkClient: makeKvarkClient({ search: searchFn }),
    });

    await cr.search('query', { limit: 7 });

    expect(searchFn).toHaveBeenCalledWith('query', { limit: 7 });
  });

  it('uses sensible defaults (limit=10, profile=balanced, scope=all)', async () => {
    const wsMock = makeSearchMock([]);
    const pMock = makeSearchMock([]);

    const cr = new CombinedRetrieval({
      workspaceSearch: wsMock,
      personalSearch: pMock,
      kvarkClient: null,
    });

    await cr.search('test');

    expect(wsMock.search).toHaveBeenCalledWith('test', { limit: 10, profile: 'balanced' });
    expect(pMock.search).toHaveBeenCalledWith('test', { limit: 10, profile: 'balanced' });
  });

  it('handles KVARK returning zero results without error', async () => {
    const emptyResponse: KvarkSearchResponseLike = { results: [], total: 0, query: 'nothing' };
    const searchFn = vi.fn(async () => emptyResponse);

    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearchMock([]),
      personalSearch: makeSearchMock([]),
      kvarkClient: makeKvarkClient({ search: searchFn }),
    });

    const result = await cr.search('nothing');

    expect(result.kvarkResults).toHaveLength(0);
    expect(result.kvarkAvailable).toBe(true);
    expect(result.kvarkSkipped).toBe(false);
    expect(result.kvarkError).toBeUndefined();
  });
});
