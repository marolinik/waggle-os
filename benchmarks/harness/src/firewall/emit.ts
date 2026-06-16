/**
 * Firewall audit emitter (03 C8).
 *
 * Appends ONE JSONL line per firewall assertion to the run's events.jsonl so the
 * offline audit proves every gate actually ran on the priced run. Each line is a
 * self-contained, newline-terminated JSON object tagged `event: "firewall.assertion"`
 * and carrying the per-row mind hash (02 §5.4/§5.7) — so the audit can confirm the
 * SAME frozen mind was scanned that the model read.
 *
 * Append-only + flush-per-line: a crash mid-run still leaves a valid prefix of
 * complete lines (matches the harness's per-row JSONL discipline).
 */

import fs from 'node:fs';

export const FIREWALL_ASSERTIONS = [
  'gold_substring',
  'embedding_similarity',
  'mind_hash',
  'scope_binding',
] as const;

export type FirewallAssertionName = (typeof FIREWALL_ASSERTIONS)[number];

export interface FirewallAssertionRow {
  /** The run row this assertion applies to (e.g. "<task_id>#trial<k>"). */
  row_id: string;
  /** SHA-256 of the frozen mind scanned (from hashMind). */
  mind_hash: string;
  /** Which firewall gate this line reports. */
  assertion: FirewallAssertionName;
  /** Gate verdict for this row. */
  passed: boolean;
  /** Gate-specific structured detail (hit counts, thresholds, etc.). */
  detail: Readonly<Record<string, unknown>>;
}

const ASSERTION_SET: ReadonlySet<string> = new Set<string>(FIREWALL_ASSERTIONS);

export function emitFirewallAssertion(eventsJsonlPath: string, row: FirewallAssertionRow): void {
  if (typeof eventsJsonlPath !== 'string' || eventsJsonlPath.length === 0) {
    throw new Error('emitFirewallAssertion requires a non-empty eventsJsonlPath');
  }
  if (!row || typeof row.row_id !== 'string' || row.row_id.length === 0) {
    throw new Error('firewall row requires a non-empty row_id');
  }
  if (typeof row.mind_hash !== 'string') {
    throw new Error('firewall row requires a string mind_hash');
  }
  if (!ASSERTION_SET.has(row.assertion)) {
    throw new Error(`assertion must be one of ${FIREWALL_ASSERTIONS.join(', ')}; got ${row.assertion}`);
  }
  if (typeof row.passed !== 'boolean') {
    throw new Error('firewall row passed must be a boolean');
  }

  const line = JSON.stringify({
    event: 'firewall.assertion',
    ts: new Date().toISOString(),
    row_id: row.row_id,
    mind_hash: row.mind_hash,
    assertion: row.assertion,
    passed: row.passed,
    detail: row.detail ?? {},
  });
  fs.appendFileSync(eventsJsonlPath, `${line}\n`, 'utf-8');
}
