/**
 * Conflict detection tests — post-Milestone-B trust slice.
 *
 * Tests the detectConflict heuristic and its integration with
 * CombinedRetrieval and formatCombinedResult.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectConflict,
  CombinedRetrieval,
  type CombinedResult,
  type MemorySearchLike,
  type MemorySearchResultLike,
} from '../src/combined-retrieval.js';
import { formatCombinedResult } from '../src/tools.js';
import type { KvarkClientLike, KvarkSearchResponseLike } from '../src/kvark-tools.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeResult(source: 'workspace' | 'kvark', content: string, score: number): CombinedResult {
  return {
    content,
    source,
    attribution: source === 'workspace' ? '[workspace memory]' : '[KVARK: doc]',
    score,
    metadata: {},
  };
}

function makeMemoryResult(id: number, content: string, score: number): MemorySearchResultLike {
  return { frame: { id, content, frame_type: 'fact', importance: 'normal' }, finalScore: score };
}

function makeSearch(results: MemorySearchResultLike[]): MemorySearchLike {
  return { search: vi.fn().mockResolvedValue(results) };
}

function makeKvarkClient(results: Array<{ title: string; snippet: string; score: number }>): KvarkClientLike {
  const response: KvarkSearchResponseLike = {
    query: 'test',
    total: results.length,
    results: results.map((r, i) => ({
      document_id: i + 1,
      title: r.title,
      snippet: r.snippet,
      score: r.score,
      document_type: null,
    })),
  };
  return {
    search: vi.fn().mockResolvedValue(response),
    askDocument: vi.fn().mockResolvedValue({ answer: '', sources: [] }),
  };
}

// ── detectConflict unit tests ────────────────────────────────────────────

describe('detectConflict', () => {
  it('returns null when only workspace results are present', () => {
    const ws = [makeResult('workspace', 'project approved by board', 0.9)];
    expect(detectConflict(ws, [])).toBeNull();
  });

  it('returns null when only KVARK results are present', () => {
    const kvark = [makeResult('kvark', 'project cancelled per policy', 0.8)];
    expect(detectConflict([], kvark)).toBeNull();
  });

  it('returns null when both sources agree (both positive)', () => {
    const ws = [makeResult('workspace', 'The migration was approved last week', 0.85)];
    const kvark = [makeResult('kvark', 'Migration approved and confirmed by CTO', 0.9)];
    expect(detectConflict(ws, kvark)).toBeNull();
  });

  it('returns null when both sources agree (both negative)', () => {
    const ws = [makeResult('workspace', 'Feature was rejected in review', 0.8)];
    const kvark = [makeResult('kvark', 'Feature rejected — not aligned with roadmap', 0.85)];
    expect(detectConflict(ws, kvark)).toBeNull();
  });

  it('returns null when neither source has status language', () => {
    const ws = [makeResult('workspace', 'The project uses PostgreSQL for data storage', 0.9)];
    const kvark = [makeResult('kvark', 'Database architecture uses Oracle Enterprise', 0.85)];
    expect(detectConflict(ws, kvark)).toBeNull();
  });

  it('flags conflict when workspace is positive and KVARK is negative', () => {
    const ws = [makeResult('workspace', 'We decided to use the new API and approved the integration', 0.9)];
    const kvark = [makeResult('kvark', 'API integration has been cancelled due to security review', 0.85)];
    const result = detectConflict(ws, kvark);

    expect(result).not.toBeNull();
    expect(result).toContain('affirmative language');
    expect(result).toContain('contradictory language');
    expect(result).toContain('out of sync');
  });

  it('flags conflict when workspace is negative and KVARK is positive', () => {
    const ws = [makeResult('workspace', 'The proposal was rejected by the committee', 0.8)];
    const kvark = [makeResult('kvark', 'Proposal approved and budget confirmed for Q2', 0.9)];
    const result = detectConflict(ws, kvark);

    expect(result).not.toBeNull();
    expect(result).toContain('enterprise source may be more current');
  });

  it('returns null when results are below score threshold', () => {
    const ws = [makeResult('workspace', 'project approved', 0.4)];
    const kvark = [makeResult('kvark', 'project cancelled', 0.5)];
    expect(detectConflict(ws, kvark)).toBeNull();
  });

  it('handles mixed polarity within same source (neutral)', () => {
    const ws = [makeResult('workspace', 'Some features approved, others rejected during review', 0.8)];
    const kvark = [makeResult('kvark', 'Project cancelled after initial approval', 0.85)];
    // workspace has both positive AND negative => neutral => no conflict
    expect(detectConflict(ws, kvark)).toBeNull();
  });
});

// ── Integration: CombinedRetrieval with conflict detection ──────────────

describe('CombinedRetrieval conflict integration', () => {
  it('sets hasConflict=false when KVARK is not called', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearch([makeMemoryResult(1, 'approved by team', 0.9)]),
      personalSearch: makeSearch([]),
      kvarkClient: null,
    });
    const result = await cr.search('test');
    expect(result.hasConflict).toBe(false);
    expect(result.conflictNote).toBeUndefined();
  });

  it('sets hasConflict=true when workspace and KVARK results conflict', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearch([makeMemoryResult(1, 'The vendor was selected and approved', 0.85)]),
      personalSearch: makeSearch([]),
      kvarkClient: makeKvarkClient([
        { title: 'Vendor Policy', snippet: 'Vendor agreement has been cancelled effective immediately', score: 0.9 },
      ]),
    });
    const result = await cr.search('vendor status');
    expect(result.hasConflict).toBe(true);
    expect(result.conflictNote).toBeDefined();
    expect(result.conflictNote).toContain('out of sync');
  });

  it('sets hasConflict=false when sources do not conflict', async () => {
    const cr = new CombinedRetrieval({
      workspaceSearch: makeSearch([makeMemoryResult(1, 'project status is active and healthy', 0.8)]),
      personalSearch: makeSearch([]),
      kvarkClient: makeKvarkClient([
        { title: 'Status', snippet: 'Project confirmed active with full funding', score: 0.85 },
      ]),
    });
    const result = await cr.search('project status');
    expect(result.hasConflict).toBe(false);
  });
});

// ── formatCombinedResult with conflict ──────────────────────────────────

describe('formatCombinedResult conflict rendering', () => {
  it('includes Source Conflict section when hasConflict is true', () => {
    const output = formatCombinedResult({
      query: 'test',
      workspaceResults: [makeResult('workspace', 'approved', 0.9)],
      personalResults: [],
      kvarkResults: [makeResult('kvark', 'cancelled', 0.85)],
      kvarkAvailable: true,
      kvarkSkipped: false,
      hasConflict: true,
      conflictNote: 'Sources may disagree.',
    }, true);

    expect(output).toContain('## Source Conflict');
    expect(output).toContain('Sources may disagree.');
    expect(output).toContain('Review both sources carefully');
  });

  it('omits Source Conflict section when hasConflict is false', () => {
    const output = formatCombinedResult({
      query: 'test',
      workspaceResults: [makeResult('workspace', 'some fact', 0.9)],
      personalResults: [],
      kvarkResults: [makeResult('kvark', 'some other fact', 0.85)],
      kvarkAvailable: true,
      kvarkSkipped: false,
      hasConflict: false,
    }, true);

    expect(output).not.toContain('## Source Conflict');
  });
});
