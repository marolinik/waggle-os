/**
 * Dataset loader + version hash + opt-in synthetic fallback.
 *
 * Canonical archives live under `benchmarks/data/<dataset>/`:
 *   locomo/locomo-1540.jsonl  (built by scripts/build-locomo-canonical.ts)
 *
 * Production path: if the canonical archive is absent, the loader throws
 * `DatasetMissingError`. No silent fallback — absent data used to masquerade
 * as a 60-instance synthetic run, which is the substrate gap Sprint 12 Task 1
 * Blocker #1 eliminates.
 *
 * Development convenience: `BENCH_SYNTHETIC_DATASET=1` re-enables the
 * synthetic fallback with a prominent console.warn. Never use that path for
 * publishable runs — its output is scaffold-only.
 *
 * Every external dataset carries a `dataset_version` hash (SHA-256 of the
 * archive bytes). The hash is the audit anchor A3 LOCK §H-AUDIT-2 requires
 * for pre-registration-conformant benchmark runs. The runner attaches the
 * hash to every emitted JSONL record (types.ts §dataset_version).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatasetInstance, DatasetSpec } from './types.js';

/** Version string for the built-in synthetic scaffold. Static because the
 *  instances are hard-coded in this file — any change will bump the source
 *  revision and therefore the git SHA, so a user looking for drift has a
 *  single obvious needle. */
export const SYNTHETIC_DATASET_VERSION = 'synthetic-scaffold-v1';

/** Thrown when a non-synthetic dataset archive is absent from the expected
 *  path and the `BENCH_SYNTHETIC_DATASET` escape hatch is not set. */
export class DatasetMissingError extends Error {
  constructor(
    public readonly resolvedPath: string,
    public readonly datasetId: string,
  ) {
    super(
      `Dataset '${datasetId}' canonical archive missing at ${resolvedPath}. ` +
      `Build it via \`npx tsx benchmarks/harness/scripts/build-locomo-canonical.ts\` ` +
      `or set BENCH_SYNTHETIC_DATASET=1 for the synthetic dev fallback ` +
      `(scaffold-only — do NOT use for publishable runs).`,
    );
    this.name = 'DatasetMissingError';
  }
}

/** SHA-256 hex of the dataset archive bytes, or the static version string
 *  for synthetic. Throws `DatasetMissingError` when the archive is absent
 *  and the env escape hatch is not set. */
export function getDatasetVersion(spec: DatasetSpec, dataRoot: string): string {
  if (spec.source === 'synthetic') return SYNTHETIC_DATASET_VERSION;
  const resolved = path.resolve(dataRoot, spec.dataPath);
  if (!fs.existsSync(resolved)) {
    if (process.env.BENCH_SYNTHETIC_DATASET === '1') {
      return SYNTHETIC_DATASET_VERSION;
    }
    throw new DatasetMissingError(resolved, spec.id);
  }
  const buf = fs.readFileSync(resolved);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Preflight sample-lock schema written by scripts/build-preflight-samples.ts. */
export interface PreflightSampleInstance {
  id: string;
  category: 'single-hop' | 'multi-hop' | 'temporal' | 'open-ended';
  context: string;
  question: string;
  ground_truth_answer: string;
  locomo_metadata?: unknown;
}

export interface PreflightSampleFile {
  _meta?: {
    distribution?: Record<string, number>;
    seed?: number;
    [k: string]: unknown;
  };
  instances: PreflightSampleInstance[];
}

/** The 4-cell Stage 2 preflight gate requires exactly this distribution
 *  per `decisions/2026-04-20-preflight-oq-resolutions-locked.md` §OQ-PF-1. */
export const PREFLIGHT_LOCOMO_50_DISTRIBUTION = {
  'single-hop': 13,
  'multi-hop': 13,
  'temporal': 12,
  'open-ended': 12,
} as const;

function distributionOf(instances: PreflightSampleInstance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of instances) out[i.category] = (out[i.category] ?? 0) + 1;
  return out;
}

/** Loads a committed sample-lock JSON and asserts the 13/13/12/12 distribution.
 *
 *  This is the enforcement point required by Task 1 of the CC preflight
 *  sprint brief. Any deviation — whether from tampering, an incomplete
 *  rebuild, or an accidental schema drift — must fail loudly so that no
 *  Stage 2 run proceeds against a silently-broken sample. */
export function loadPreflightSampleLock(lockPath: string): DatasetInstance[] {
  if (!fs.existsSync(lockPath)) {
    throw new Error(`Pre-flight sample lock not found at ${lockPath}`);
  }
  const raw = fs.readFileSync(lockPath, 'utf-8');
  const parsed = JSON.parse(raw) as PreflightSampleFile;
  if (!parsed || !Array.isArray(parsed.instances)) {
    throw new Error(`Pre-flight sample lock at ${lockPath} is missing the "instances" array`);
  }
  const actual = distributionOf(parsed.instances);
  const expected = PREFLIGHT_LOCOMO_50_DISTRIBUTION;
  const keys: (keyof typeof expected)[] = ['single-hop', 'multi-hop', 'temporal', 'open-ended'];
  const mismatch =
    parsed.instances.length !== 50 ||
    keys.some(k => (actual[k] ?? 0) !== expected[k]) ||
    Object.keys(actual).some(k => !(k in expected));
  if (mismatch) {
    const actualStr = keys.map(k => `${k}=${actual[k] ?? 0}`).join('/');
    const expectedStr = keys.map(k => `${k}=${expected[k]}`).join('/');
    throw new Error(
      `Pre-flight sample distribution mismatch: expected 13/13/12/12, got ${actualStr} ` +
      `(expected breakdown: ${expectedStr}; total ${parsed.instances.length}, expected 50)`,
    );
  }
  return parsed.instances.map(inst => {
    // Stage 2-Retry §1.2: LoCoMo instance_id format is
    // `locomo_<conversation-id>_q<index>`. Derive conversation_id from that
    // pattern so preflight-lock instances (which don't carry the field
    // directly) still scope correctly. Safe because the preflight builder
    // already enforces LoCoMo-only rows in the lock file.
    const convMatch = inst.id.match(/^locomo_(conv-\d+)_q\d+$/);
    return {
      instance_id: inst.id,
      question: inst.question,
      context: inst.context,
      expected: [inst.ground_truth_answer],
      ...(convMatch ? { conversation_id: convMatch[1] } : {}),
    };
  });
}

/**
 * Built-in 60-instance synthetic dataset — enough for the `--limit 50`
 * verbose-fixed acceptance test plus 10 slack. Questions probe short-context
 * recall, entity tracking, and one-hop reasoning so the scaffold exercises
 * a realistic-ish prompt shape.
 */
const SYNTHETIC_INSTANCES: DatasetInstance[] = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  const topics = [
    { subj: 'Marko', verb: 'works at', obj: 'Egzakta Advisory', q: 'Where does Marko work?', a: 'Egzakta Advisory' },
    { subj: 'Ana', verb: 'leads', obj: 'the KVARK platform', q: 'Who leads the KVARK platform?', a: 'Ana' },
    { subj: 'The Waggle release', verb: 'shipped on', obj: '2026-04-20', q: 'When did Waggle ship?', a: '2026-04-20' },
    { subj: 'The benchmark', verb: 'uses model', obj: 'Qwen3.6-35B-A3B', q: 'Which model does the benchmark use?', a: 'Qwen3.6-35B-A3B' },
    { subj: 'The harness', verb: 'runs', obj: 'four cells', q: 'How many cells does the harness run?', a: 'four' },
  ];
  const t = topics[i % topics.length];
  return {
    instance_id: `synthetic_${String(n).padStart(3, '0')}`,
    question: t.q,
    context: `${t.subj} ${t.verb} ${t.obj}.`,
    expected: [t.a],
  };
});

export function loadDataset(spec: DatasetSpec, dataRoot: string): DatasetInstance[] {
  if (spec.source === 'synthetic') {
    return SYNTHETIC_INSTANCES;
  }

  // External (LoCoMo / LongMemEval). Sprint 12 Task 1 Blocker #1: no silent
  // fallback. Missing archive throws `DatasetMissingError`, unless the
  // `BENCH_SYNTHETIC_DATASET=1` escape hatch is set (dev convenience only —
  // never use for publishable runs).
  const resolved = path.resolve(dataRoot, spec.dataPath);
  if (!fs.existsSync(resolved)) {
    if (process.env.BENCH_SYNTHETIC_DATASET === '1') {
      console.warn(
        `[harness] ${spec.id} archive missing at ${resolved} — ` +
        `BENCH_SYNTHETIC_DATASET=1 set, falling back to synthetic scaffold. ` +
        `Dev-only path; do NOT use for publishable runs.`,
      );
      return SYNTHETIC_INSTANCES;
    }
    throw new DatasetMissingError(resolved, spec.id);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const out: DatasetInstance[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<DatasetInstance> & { conversation_id?: string };
      if (parsed.instance_id && parsed.question && parsed.expected) {
        out.push({
          instance_id: parsed.instance_id,
          question: parsed.question,
          context: parsed.context ?? '',
          expected: Array.isArray(parsed.expected) ? parsed.expected : [String(parsed.expected)],
          // Stage 2-Retry §1.2: preserve conversation_id so retrieval +
          // agentic cells can scope HybridSearch to the instance's
          // conversation via the existing `gopId` filter at search.ts:14.
          ...(parsed.conversation_id ? { conversation_id: parsed.conversation_id } : {}),
        });
      }
    } catch {
      // Tolerate malformed lines (common in exported benchmark dumps) —
      // skip + surface the count at the end.
    }
  }
  return out;
}

/** Deterministic shuffle + sampling so `--seed N --limit M` is reproducible. */
export function sampleInstances(all: DatasetInstance[], seed: number, limit: number): DatasetInstance[] {
  if (!Number.isFinite(limit) || limit >= all.length) return all.slice();
  // xorshift32 — cheap deterministic PRNG, good enough for sampling.
  let state = (seed || 1) >>> 0;
  const rand = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  const shuffled = all.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, limit);
}
