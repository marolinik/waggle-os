/**
 * Mind content-hash — the Plan 06 `hashMind` contract, pinned + guarded.
 *
 * Contract (02 §5.4): a deterministic hash of a frozen MindDB such that
 *   - logically-identical minds hash equal, and
 *   - any content difference changes the hash.
 * This is what an auditor needs to assert "byte-identical mind across Mode-1
 * arms" and "nothing wrote to the mind during Phase B."
 *
 * ── DEVIATION FROM PLAN (real platform bug — Task-3 STOP note triggered) ──
 * The plan's first choice was `crypto.sha256(db.getDatabase().serialize())`.
 * That FAILS the "same content ⇒ same hash" property on this platform: the
 * MindDB bootstrap writes a wall-clock `meta.first_run_at` row, so two
 * logically-identical `:memory:` minds serialize to DIFFERENT bytes (verified
 * 2026-06-16 — the only differing ordinary table between two fresh handles is
 * `meta`). The plan's Task-3 STOP note instructs exactly this fallback:
 * "switch the fallback to a logical-row hash." We implement a logical-content
 * digest over every ORDINARY (non-virtual) table EXCEPT the non-content
 * bootstrap `meta` table, rows in stable rowid order, tables in sorted name
 * order. Virtual tables (FTS5 / vec0) are skipped — they are derived byte
 * representations of `memory_frames` content, already captured by hashing the
 * base table, and their shadow storage carries layout jitter.
 *
 * ── DEVIATION FROM PLAN (dependency path/signature) ──
 * The plan resolved `../firewall.js` expecting `hashMind(mind: MindDB)`. The
 * firewall module ACTUALLY landed at `./firewall/index.js` and its `hashMind`
 * signature is `(dbPathOrBytes: string | Uint8Array): string` — it SHA-256s
 * raw bytes (for on-disk file tamper-detection of a quiescent DB, per its own
 * caveat), NOT a MindDB, and NOT deterministically across two fresh handles
 * (same `meta` jitter). It therefore cannot satisfy the cross-handle logical
 * equality contract this module needs, so we DO NOT delegate to it; the local
 * logical digest IS the contract. `resolveHashMind` still probes for the
 * module so a future signature-compatible export can be adopted, but defaults
 * to the deterministic local implementation.
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { MindDB } from '@waggle/core';

/** Tables excluded from the logical digest: bootstrap/runtime metadata that is
 *  NOT mind content (carries a wall-clock `first_run_at`, etc.). */
const NON_CONTENT_TABLES: ReadonlySet<string> = new Set(['meta']);

/**
 * Per-row columns excluded from the digest: wall-clock + access-bookkeeping
 * fields that vary with WHEN the mind was built / read, not with its content.
 * The Mode-1 "byte-identical mind across arms" claim is about CONTENT identity
 * (frame text, importance, source, gop, knowledge, identity, awareness), so two
 * builds of the same artifact stream a millisecond apart MUST hash equal, and a
 * Phase-B recall that bumps `access_count` MUST NOT change the frozen-mind hash.
 * (Discovered 2026-06-16: `memory_frames.{created_at,last_accessed,access_count}`
 * + `sessions.started_at` made the digest time-dependent under suite ordering.)
 */
const VOLATILE_COLUMNS: ReadonlySet<string> = new Set([
  'created_at',
  'last_accessed',
  'started_at',
  'ended_at',
  'updated_at',
  'first_run_at',
  'access_count',
]);

/** Strip volatile columns from a row before it enters the digest. */
function contentRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    if (!VOLATILE_COLUMNS.has(key)) out[key] = row[key];
  }
  return out;
}

/**
 * Local contract implementation: a deterministic logical-content digest of the
 * mind. Hashes every ordinary (non-virtual) table's rows, excluding the
 * non-content `meta` table and per-row wall-clock / access-bookkeeping columns,
 * in a stable order.
 */
export function hashMindBytes(mind: MindDB): string {
  const raw = mind.getDatabase();
  const tableRows = raw
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string; sql: string | null }[];
  const ordinary = tableRows
    .filter(r => !/CREATE VIRTUAL TABLE/i.test(r.sql ?? ''))
    .map(r => r.name)
    .filter(n => !NON_CONTENT_TABLES.has(n));

  const hash = crypto.createHash('sha256');
  for (const t of ordinary) {
    hash.update(` TABLE:${t} `);
    const rows = raw.prepare(`SELECT * FROM "${t}"`).all() as Record<string, unknown>[];
    hash.update(JSON.stringify(rows.map(contentRow)));
  }
  return hash.digest('hex');
}

export type HashMindFn = (mind: MindDB) => string;

/** Plan 06's byte/path hasher (firewall/hash-mind.ts) — present-check only. */
type FirewallHashMind = (dbPathOrBytes: string | Uint8Array) => string;

/**
 * Resolve the hashMind implementation. Returns the deterministic local logical
 * digest. We probe for Plan 06's firewall export so a future MindDB-compatible
 * deterministic export could be adopted, but Plan 06's current `hashMind`
 * (raw-byte, non-deterministic across fresh handles — see header) cannot honor
 * the cross-handle equality contract, so the local digest is authoritative.
 */
export function resolveHashMind(): HashMindFn {
  try {
    const req = createRequire(import.meta.url);
    const mod = req('./firewall/index.js') as { hashMind?: FirewallHashMind };
    // Present-check only: Plan 06's byte-hasher is layout-sensitive and cannot
    // satisfy the logical-equality contract, so we do not delegate to it.
    void mod.hashMind;
  } catch {
    // Plan 06 not present — local digest is the only path anyway.
  }
  return hashMindBytes;
}
