/**
 * Firewall audit-emitter tests — append one JSONL line per assertion (03 C8).
 * Per-test tmpdir; round-trips the written lines back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emitFirewallAssertion,
  type FirewallAssertionRow,
} from '../../src/firewall/emit.js';

let tmpDir: string;
let eventsPath: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fw-emit-'));
  eventsPath = path.join(tmpDir, 'events.jsonl');
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function readLines(p: string): unknown[] {
  return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

const baseRow: FirewallAssertionRow = {
  row_id: 'B-07#trial0',
  mind_hash: 'a'.repeat(64),
  assertion: 'gold_substring',
  passed: true,
  detail: { hits: 0, n_artifacts: 120, n_golds: 300 },
};

describe('emitFirewallAssertion', () => {
  it('creates the file and writes one parseable JSONL line', () => {
    emitFirewallAssertion(eventsPath, baseRow);
    const lines = readLines(eventsPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'firewall.assertion',
      row_id: 'B-07#trial0',
      assertion: 'gold_substring',
      passed: true,
      mind_hash: 'a'.repeat(64),
    });
  });

  it('stamps an ISO-8601 timestamp', () => {
    emitFirewallAssertion(eventsPath, baseRow);
    const [line] = readLines(eventsPath) as Array<{ ts: string }>;
    expect(() => new Date(line.ts).toISOString()).not.toThrow();
    expect(new Date(line.ts).toISOString()).toBe(line.ts);
  });

  it('appends (does not truncate) across multiple calls, preserving order', () => {
    emitFirewallAssertion(eventsPath, { ...baseRow, assertion: 'gold_substring' });
    emitFirewallAssertion(eventsPath, { ...baseRow, assertion: 'embedding_similarity', passed: false });
    emitFirewallAssertion(eventsPath, { ...baseRow, assertion: 'mind_hash' });
    const lines = readLines(eventsPath) as Array<{ assertion: string; passed: boolean }>;
    expect(lines.map(l => l.assertion)).toEqual(['gold_substring', 'embedding_similarity', 'mind_hash']);
    expect(lines[1].passed).toBe(false);
  });

  it('writes exactly one newline-terminated line per call (no JSON spanning lines)', () => {
    emitFirewallAssertion(eventsPath, baseRow);
    const raw = fs.readFileSync(eventsPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.trimEnd().includes('\n')).toBe(false);
  });

  it('rejects an unknown assertion name', () => {
    const bad = { ...baseRow, assertion: 'totally_made_up' } as unknown as FirewallAssertionRow;
    expect(() => emitFirewallAssertion(eventsPath, bad)).toThrow(/assertion must be one of/);
  });

  it('rejects a non-boolean passed', () => {
    const bad = { ...baseRow, passed: 'yes' } as unknown as FirewallAssertionRow;
    expect(() => emitFirewallAssertion(eventsPath, bad)).toThrow(/passed must be a boolean/);
  });

  it('rejects an empty events path', () => {
    expect(() => emitFirewallAssertion('', baseRow)).toThrow(/eventsJsonlPath/);
  });
});
