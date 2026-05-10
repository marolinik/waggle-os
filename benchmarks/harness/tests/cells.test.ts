/**
 * Sprint 12 Task 1 Blocker #2 — cell enum smoke tests.
 *
 * Acceptance criterion 6: cell parsing + dispatch tests pass with the A3
 * LOCK nomenclature (`raw | filtered | compressed | full-context`).
 *
 * These tests are narrower than smoke.test.ts — the goal is to pin the
 * cell enum surface at the type + value + dispatch layers so a future
 * silent rename (or a half-rename) fails CI immediately rather than
 * drifting downstream.
 */

import { describe, expect, it } from 'vitest';
import { cells, isCellName } from '../src/cells.js';
import type { CellName } from '../src/types.js';

// Sprint 12 Task 1 Blocker #2 shipped the first four names. Sprint 12 Task
// 2.5 Stage 1 (2026-04-23) added `retrieval` + `agentic` — backed by real
// HybridSearch + agent-loop respectively. Sprint 12 Task 2.5 Stage 2-Retry
// (2026-04-24) added `no-context` — the true zero-memory baseline used by
// the Stage 2-Retry memory-lift criterion. All new names are acceptable;
// legacy pre-Sprint-12 names must still be rejected.
const CANONICAL_NAMES: readonly CellName[] = [
  'raw',
  'filtered',
  'compressed',
  'full-context',
  'retrieval',
  'agentic',
  'no-context',
];
const LEGACY_NAMES = ['memory-only', 'evolve-only', 'full-stack'] as const;

describe('CellName enum (Sprint 12 Task 1 Blocker #2 rename + Task 2.5 Stage 1 + Stage 2-Retry extensions)', () => {
  it('exposes exactly the seven canonical cell names as object keys', () => {
    const keys = Object.keys(cells).sort();
    expect(keys).toEqual([...CANONICAL_NAMES].sort());
  });

  it('isCellName accepts every canonical name', () => {
    for (const name of CANONICAL_NAMES) {
      expect(isCellName(name)).toBe(true);
    }
  });

  it('isCellName rejects the pre-Sprint-12 legacy names', () => {
    for (const legacy of LEGACY_NAMES) {
      expect(isCellName(legacy)).toBe(false);
    }
  });

  it('isCellName rejects unrelated strings', () => {
    for (const bad of ['', 'RAW', 'full_context', 'full-stack-v2', 'naive-rag', '   raw  ']) {
      expect(isCellName(bad)).toBe(false);
    }
  });

  it('every cell key in the dispatch table is typed as a CellName', () => {
    // Compile-time check: if a new cell is added to the type union but not
    // to `cells`, TS fails the Record<CellName, CellFn> contract. If a cell
    // is added to `cells` but not to the union, TS fails the `as CellName`
    // narrowing below. Runtime shape check is redundant but documents the
    // guarantee.
    for (const key of Object.keys(cells)) {
      expect(isCellName(key)).toBe(true);
      const narrowed = key as CellName;
      expect(typeof cells[narrowed]).toBe('function');
    }
  });
});
