#!/usr/bin/env tsx
/**
 * E1 — Re-judge Eywa's published BEAM answers with OUR canonical gpt-5 nugget judge.
 *
 * Loads Eywa's 700 Sonnet-4.6 answers (same 700 BEAM-1M questions/rubrics as ours)
 * and re-scores each with the IDENTICAL graded nugget judge behind our published
 * headline (0.6482): src/beam-nugget-judge.ts `judgeSingleNugget` over gpt-5.
 *
 * Per-question score = arithmetic mean of nugget scores (0/0.5/1) — exactly the
 * mem0 headline metric. No tau blend (auxiliary diagnostic only, not headline).
 *
 * Resumable: appends JSONL, skips ids already scored.
 *
 * Usage:
 *   tsx scripts/e1-judge-eywa.ts --limit 5      # smoke
 *   tsx scripts/e1-judge-eywa.ts                # full 700
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createBeamOpenAiClient } from '../src/beam-openai-client.js';
import { judgeSingleNugget } from '../src/beam-nugget-judge.js';

const EYWA_JSON =
  'D:/Projects/KorroResearch/benchmarks/eywa-artifacts/eywa-beam-sonnet46-answers.json';
const OUT_JSONL =
  'D:/Projects/KorroResearch/benchmarks/eywa-artifacts/e1-eywa-ourjudge.jsonl';

interface EywaRecord {
  id: string;
  di: number;
  cat: string;
  q: string;
  gold: string;
  rubric: string[];
  answer: string;
  eywaNugget: number[];
  eywaJudgeScore: number;
  eywaVerdict: string;
}

interface OutRecord {
  id: string;
  cat: string;
  our_raw_score: number;
  our_nugget_scores: number[];
  eywa_raw: number;
  our_nugget_reasons: string[];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : Infinity;

  const records = JSON.parse(fs.readFileSync(EYWA_JSON, 'utf-8')) as EywaRecord[];
  console.log(`[e1] loaded ${records.length} Eywa records`);

  const done = new Set<string>();
  if (fs.existsSync(OUT_JSONL)) {
    for (const line of fs.readFileSync(OUT_JSONL, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t) as { id?: string };
        if (r.id) done.add(r.id);
      } catch { /* skip */ }
    }
    console.log(`[e1] resume: ${done.size} already scored`);
  }

  const client = createBeamOpenAiClient({ model: 'gpt-5' });
  const out = fs.createWriteStream(OUT_JSONL, { flags: 'a' });

  const concIdx = args.indexOf('--conc');
  const CONCURRENCY = concIdx >= 0 ? Number(args[concIdx + 1]) : 10;
  const ceilIdx = args.indexOf('--ceiling');
  const BUDGET_CEILING = ceilIdx >= 0 ? Number(args[ceilIdx + 1]) : 15; // hard stop guard

  let costUsd = 0;
  let processed = 0;
  let stopped = false;
  const todo = records.filter(r => !done.has(r.id)).slice(0, limit === Infinity ? undefined : limit);
  console.log(`[e1] scoring ${todo.length} records with gpt-5 nugget judge (conc=${CONCURRENCY}, ceiling=$${BUDGET_CEILING})`);

  async function scoreRecord(rec: EywaRecord): Promise<void> {
    const nuggetScores: number[] = [];
    const nuggetReasons: string[] = [];
    for (const nugget of rec.rubric) {
      const ns = await judgeSingleNugget(client, rec.q, nugget, rec.answer);
      costUsd += ns.result.costUsd;
      nuggetScores.push(ns.score);
      nuggetReasons.push(ns.reason);
    }
    const ourRaw = mean(nuggetScores);
    const eywaRaw = mean(rec.eywaNugget);
    const outRec: OutRecord = {
      id: rec.id,
      cat: rec.cat,
      our_raw_score: Math.round(ourRaw * 1e4) / 1e4,
      our_nugget_scores: nuggetScores,
      eywa_raw: Math.round(eywaRaw * 1e4) / 1e4,
      our_nugget_reasons: nuggetReasons,
    };
    out.write(JSON.stringify(outRec) + '\n');
    processed++;
    if (processed <= 5 || processed % 25 === 0) {
      console.log(
        `[e1] ${processed}/${todo.length} ${rec.id} ${rec.cat} ` +
        `our=${ourRaw.toFixed(3)} eywa=${eywaRaw.toFixed(3)} $${costUsd.toFixed(3)}`,
      );
    }
  }

  // Simple concurrency pool over the todo queue.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < todo.length && !stopped) {
      if (costUsd >= BUDGET_CEILING) {
        stopped = true;
        console.error(`[e1] BUDGET CEILING $${BUDGET_CEILING} hit at $${costUsd.toFixed(3)} — stopping.`);
        break;
      }
      const idx = cursor++;
      await scoreRecord(todo[idx]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  out.end();
  console.log(`[e1] DONE processed=${processed}/${todo.length} cost=$${costUsd.toFixed(4)} stopped=${stopped}`);
}

main().catch(err => {
  console.error('[e1] FATAL', err);
  process.exit(1);
});
