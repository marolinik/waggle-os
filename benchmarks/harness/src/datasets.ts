/**
 * Dataset loader + synthetic fallback.
 *
 * Real LoCoMo + LongMemEval data lives under `benchmarks/data/<dataset>/`
 * (gitignored — downloaded by the upstream harness scripts). If the data is
 * absent, we fall back to the built-in `synthetic` dataset so
 * scaffold / smoke tests don't need external downloads.
 *
 * Week 1 work will add the real dataset adapters.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DatasetInstance, DatasetSpec } from './types.js';

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

  // External (LoCoMo / LongMemEval). If the JSONL isn't there yet, we fall
  // back to synthetic and print a heads-up so the operator knows the numbers
  // aren't against the real benchmark.
  const resolved = path.resolve(dataRoot, spec.dataPath);
  if (!fs.existsSync(resolved)) {
    console.warn(
      `[harness] ${spec.id} data not found at ${resolved} — falling back to synthetic ` +
      `(Week 1 will add the real loader; for now this is scaffold-only).`,
    );
    return SYNTHETIC_INSTANCES;
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const out: DatasetInstance[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<DatasetInstance>;
      if (parsed.instance_id && parsed.question && parsed.expected) {
        out.push({
          instance_id: parsed.instance_id,
          question: parsed.question,
          context: parsed.context ?? '',
          expected: Array.isArray(parsed.expected) ? parsed.expected : [String(parsed.expected)],
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
