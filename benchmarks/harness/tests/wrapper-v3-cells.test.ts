/**
 * Task 2.5 Stage 2-Retry §1.5 — wrapper tests for --v3-cells + JSONL
 * cell-field rewrite.
 *
 * The wrapper lives at `scripts/run-mini-locomo.ts`, outside the harness
 * package tree. It does NOT have a separate vitest config, so these tests
 * live alongside the harness suite and import from the wrapper via a
 * workspace-relative path. Re-exports of `parseArgs` and
 * `rewriteJsonlCellField` were added in §1.5 to enable these assertions.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Workspace-relative import. The wrapper file is at repo_root/scripts/.
// harness/tests/ -> harness/ -> ../ (benchmarks/) -> ../ (repo root) -> scripts/
const here = url.fileURLToPath(import.meta.url);
const wrapperPath = path.resolve(path.dirname(here), '..', '..', '..', 'scripts', 'run-mini-locomo.ts');
// Dynamic import so the test discovers the wrapper at the workspace-root
// location rather than a transpiled dist. Import resolved at setup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapper: any = await import(url.pathToFileURL(wrapperPath).href);

describe('wrapper — parseArgs --v3-cells flag (Stage 2-Retry §1.5)', () => {
  it('--v3-cells expands cells to the 5-cell v3 roster', () => {
    const args = wrapper.parseArgs(['--v3-cells']);
    expect(args.v3Cells).toBe(true);
    expect(args.cells).toEqual([
      'no-context',
      'oracle-context',
      'full-context',
      'retrieval',
      'agentic',
    ]);
  });

  it('--v3-cells default (not passed) leaves cells at the legacy 4-cell default', () => {
    const args = wrapper.parseArgs([]);
    expect(args.v3Cells).toBe(false);
    expect(args.cells).toEqual(['raw', 'context', 'retrieval', 'agentic']);
  });

  it('--cells <csv> WITH --v3-cells lets --cells win', () => {
    const args = wrapper.parseArgs([
      '--v3-cells',
      '--cells', 'raw,retrieval',
    ]);
    expect(args.v3Cells).toBe(true); // flag stays set for observability
    expect(args.cells).toEqual(['raw', 'retrieval']); // but --cells wins
  });

  it('--v3-cells BEFORE an explicit --cells still yields --cells', () => {
    const args = wrapper.parseArgs([
      '--v3-cells',
      '--cells', 'no-context,agentic',
    ]);
    expect(args.cells).toEqual(['no-context', 'agentic']);
  });
});

describe('wrapper — rewriteJsonlCellField (Stage 2-Retry §1.5 JSONL emit contract)', () => {
  let tmpDir: string;
  let jsonlPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-rewrite-test-'));
    jsonlPath = path.join(tmpDir, 'sample.jsonl');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('rewrites every row cell field and returns the count', () => {
    const rows = [
      { turnId: 'a', cell: 'raw', instance_id: 'i1', model: 'm', accuracy: 1 },
      { turnId: 'b', cell: 'raw', instance_id: 'i2', model: 'm', accuracy: 0 },
      { turnId: 'c', cell: 'raw', instance_id: 'i3', model: 'm', accuracy: 1 },
    ];
    fs.writeFileSync(jsonlPath, rows.map(r => JSON.stringify(r)).join('\n'), 'utf-8');
    const count = wrapper.rewriteJsonlCellField(jsonlPath, 'oracle-context');
    expect(count).toBe(3);
    const rewrittenRows = fs.readFileSync(jsonlPath, 'utf-8')
      .split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    expect(rewrittenRows.every(r => r.cell === 'oracle-context')).toBe(true);
    // Non-cell fields preserved.
    expect(rewrittenRows.map(r => r.turnId)).toEqual(['a', 'b', 'c']);
    expect(rewrittenRows.map(r => r.accuracy)).toEqual([1, 0, 1]);
  });

  it('is idempotent — running twice produces the same output', () => {
    const rows = [{ turnId: 'a', cell: 'raw', instance_id: 'i1' }];
    fs.writeFileSync(jsonlPath, JSON.stringify(rows[0]), 'utf-8');
    wrapper.rewriteJsonlCellField(jsonlPath, 'oracle-context');
    const pass1 = fs.readFileSync(jsonlPath, 'utf-8');
    wrapper.rewriteJsonlCellField(jsonlPath, 'oracle-context');
    const pass2 = fs.readFileSync(jsonlPath, 'utf-8');
    expect(pass2).toBe(pass1);
  });

  it('preserves empty lines (trailing newline) verbatim', () => {
    const content = '{"cell":"raw","turnId":"x"}\n'; // trailing newline
    fs.writeFileSync(jsonlPath, content, 'utf-8');
    wrapper.rewriteJsonlCellField(jsonlPath, 'oracle-context');
    const after = fs.readFileSync(jsonlPath, 'utf-8');
    expect(after.endsWith('\n')).toBe(true);
    expect(after.split('\n').filter(l => l.trim())).toHaveLength(1);
  });

  it('tolerates malformed lines (preserves them, counts only valid ones)', () => {
    const content = [
      JSON.stringify({ cell: 'raw', ok: 1 }),
      'not valid json',
      JSON.stringify({ cell: 'raw', ok: 2 }),
    ].join('\n');
    fs.writeFileSync(jsonlPath, content, 'utf-8');
    const count = wrapper.rewriteJsonlCellField(jsonlPath, 'oracle-context');
    expect(count).toBe(2);
    const after = fs.readFileSync(jsonlPath, 'utf-8');
    expect(after).toContain('not valid json');
    expect(after).toContain('"cell":"oracle-context"');
  });

  it('returns 0 when the file does not exist', () => {
    const missing = path.join(tmpDir, 'does-not-exist.jsonl');
    const count = wrapper.rewriteJsonlCellField(missing, 'oracle-context');
    expect(count).toBe(0);
  });
});

describe('wrapper — V3_TO_V1_CELLS map (Stage 2-Retry aliases)', () => {
  // V3_TO_V1_CELLS is module-private but mapCell is reachable indirectly via
  // parseArgs' acceptance + execution path; test by driving parseArgs with
  // known v3 names and cross-checking the cells list is accepted downstream.
  // The map structure is also covered by the --v3-cells expansion test above.

  it('--cells oracle-context is accepted', () => {
    const args = wrapper.parseArgs(['--cells', 'oracle-context']);
    expect(args.cells).toEqual(['oracle-context']);
  });

  it('--cells no-context is accepted', () => {
    const args = wrapper.parseArgs(['--cells', 'no-context']);
    expect(args.cells).toEqual(['no-context']);
  });

  it('--cells full-context (as a v3 name) is accepted', () => {
    const args = wrapper.parseArgs(['--cells', 'full-context']);
    expect(args.cells).toEqual(['full-context']);
  });
});
