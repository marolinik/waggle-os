/**
 * ANSWER-MERGE self-ensembling pilot (BEAM 1M).
 *
 * Hypothesis: BEAM per-question scores have high re-run variance and compound
 * rubric nuggets reward content UNION. Merging two INDEPENDENT answers to the
 * same question (same v2 config) into one, then re-judging, may beat the single
 * headline answer — for free at inference time when the two answers already
 * exist.
 *
 * PAIR SOURCES (all in benchmarks/results/beam/):
 *   - HEADLINE (canonical): beam-1m-FULL700-gpt5-retv2.jsonl, first row per
 *     instance_id → 700 canonical answers+scores+rubric.
 *   - ALT (independent 2nd answer under the same config):
 *       (a) beam-1m-FULL700-gpt5-retv2.backup.jsonl — for ids with 2+ rows whose
 *           answer TEXTS DIFFER, the LATER row is an independent re-answer.
 *       (b) beam-1m-cal-gpt5-retrieval-v2.jsonl — 50 questions answered again
 *           under the same config.
 *   A pair is kept iff both answers are non-empty, materially differ (normalized
 *   inequality), and are not BOTH the exact IDK sentence.
 *
 * MERGE (gpt-5) → JUDGE merged answer with the official nugget judge (gpt-5),
 * computeTau:false so we compare the merged plain nugget-mean against the
 * headline plain nugget-mean `score` (apples-to-apples; tau is a non-headline
 * diagnostic and adds many costly calls).
 *
 * Budget-guarded ($8 hard stop). Pair order is deterministically shuffled
 * (seed 42) so a partial run is still a fair sample. Resumable: already-written
 * instance_ids are skipped.
 *
 * Run:  npx tsx benchmarks/harness/scripts/_merge-pilot.ts [--budget 8]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createBeamOpenAiClient, OPENAI_PRICING } from '../src/beam-openai-client.js';
import { judgeQuestion } from '../src/beam-nugget-judge.js';

const RESULTS_DIR = path.resolve('benchmarks/results/beam');
const HEADLINE = path.join(RESULTS_DIR, 'beam-1m-FULL700-gpt5-retv2.jsonl');
const BACKUP = path.join(RESULTS_DIR, 'beam-1m-FULL700-gpt5-retv2.backup.jsonl');
const CAL = path.join(RESULTS_DIR, 'beam-1m-cal-gpt5-retrieval-v2.jsonl');
const OUT = path.join(RESULTS_DIR, 'beam-1m-merge-pilot.jsonl');

const MERGE_SYSTEM =
  'You are combining two draft answers to the same question, both produced from ' +
  'the same memory context. Produce ONE final answer that includes ALL specific, ' +
  'non-contradictory content from both drafts (names, dates, numbers, versions, ' +
  'events, causes, outcomes), organized clearly, with no meta-commentary about ' +
  'drafts. If the drafts disagree on a fact, state the contradiction explicitly ' +
  'and present both values. If BOTH drafts say there is not enough information, ' +
  "output exactly: I don't have enough information to answer this question. " +
  "If only one draft has substantive content, use that draft's content.";

interface BeamRow {
  instance_id: string;
  conv?: number;
  memory_ability: string;
  question: string;
  answer: string;
  score: number;
  nugget_scores: Array<{ nugget: string; score: number; reason: string }>;
}

function readJsonl(p: string): BeamRow[] {
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      try {
        return JSON.parse(l) as BeamRow;
      } catch {
        return null;
      }
    })
    .filter((r): r is BeamRow => r !== null);
}

const norm = (t: string): string =>
  (t ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const IDK = "i don't have enough information to answer this question";
const isExactIDK = (t: string): boolean => {
  const n = norm(t);
  return n === IDK || n === `${IDK}.`;
};
const looksIDK = (t: string): boolean => norm(t).startsWith(IDK);
const isEmpty = (t: string): boolean => !t || !t.trim();

/** Deterministic PRNG (mulberry32) + Fisher-Yates for a seed-42 shuffle. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Pair {
  instanceId: string;
  memoryAbility: string;
  question: string;
  headline: BeamRow;
  alt: BeamRow;
  altSource: 'backup' | 'cal';
}

function buildPairs(): Pair[] {
  const headline = readJsonl(HEADLINE);
  const headMap = new Map<string, BeamRow>();
  for (const r of headline) if (!headMap.has(r.instance_id)) headMap.set(r.instance_id, r);

  const usable = (head: BeamRow, alt: BeamRow): boolean => {
    if (isEmpty(alt.answer) || isEmpty(head.answer)) return false;
    if (norm(alt.answer) === norm(head.answer)) return false; // not materially different
    if (isExactIDK(alt.answer) && isExactIDK(head.answer)) return false;
    return true;
  };

  // (a) backup: later row among 2+ distinct-answer rows.
  const backup = readJsonl(BACKUP);
  const byId = new Map<string, BeamRow[]>();
  for (const r of backup) {
    if (!byId.has(r.instance_id)) byId.set(r.instance_id, []);
    byId.get(r.instance_id)!.push(r);
  }
  const pairs = new Map<string, Pair>();
  for (const [id, rows] of byId) {
    if (rows.length < 2) continue;
    if (new Set(rows.map(r => norm(r.answer))).size < 2) continue; // all identical
    const head = headMap.get(id);
    if (!head) continue;
    const alt = rows[rows.length - 1];
    if (!usable(head, alt)) continue;
    pairs.set(id, {
      instanceId: id,
      memoryAbility: head.memory_ability,
      question: head.question,
      headline: head,
      alt,
      altSource: 'backup',
    });
  }

  // (b) cal: independent re-answers; add ids not already covered by backup.
  const cal = readJsonl(CAL);
  const calMap = new Map<string, BeamRow>();
  for (const r of cal) if (!calMap.has(r.instance_id)) calMap.set(r.instance_id, r);
  for (const [id, alt] of calMap) {
    if (pairs.has(id)) continue;
    const head = headMap.get(id);
    if (!head) continue;
    if (!usable(head, alt)) continue;
    pairs.set(id, {
      instanceId: id,
      memoryAbility: head.memory_ability,
      question: head.question,
      headline: head,
      alt,
      altSource: 'cal',
    });
  }

  // Canonical sort (by instance_id) then deterministic seed-42 shuffle.
  const sorted = [...pairs.values()].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  return shuffle(sorted, 42);
}

function mergeUser(question: string, draftA: string, draftB: string): string {
  return `QUESTION:\n${question}\n\nDRAFT A:\n${draftA}\n\nDRAFT B:\n${draftB}`;
}

async function main(): Promise<void> {
  const budgetArg = process.argv.indexOf('--budget');
  const BUDGET = budgetArg >= 0 ? Number(process.argv[budgetArg + 1]) : 8;

  const client = createBeamOpenAiClient({ model: 'gpt-5', pricing: OPENAI_PRICING['gpt-5'] });

  const allPairs = buildPairs();

  // Resume: skip instance_ids already written.
  const done = new Set<string>();
  if (fs.existsSync(OUT)) {
    for (const line of fs.readFileSync(OUT, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        done.add((JSON.parse(line) as { instance_id: string }).instance_id);
      } catch {
        /* skip */
      }
    }
  }

  const abilityDist: Record<string, number> = {};
  for (const p of allPairs) abilityDist[p.memoryAbility] = (abilityDist[p.memoryAbility] ?? 0) + 1;
  console.log(`[merge-pilot] ${allPairs.length} pairs total | already done: ${done.size} | budget $${BUDGET}`);
  console.log(`[merge-pilot] ability dist: ${JSON.stringify(abilityDist)}`);

  const outStream = fs.createWriteStream(OUT, { flags: 'a' });
  let spend = 0;
  let processed = 0;
  let mergeFails = 0;

  for (const pair of allPairs) {
    if (spend >= BUDGET) {
      console.warn(`[merge-pilot] budget $${BUDGET} reached — stopping (spend=$${spend.toFixed(3)})`);
      break;
    }
    if (done.has(pair.instanceId)) continue;

    const rubric = pair.headline.nugget_scores.map(n => n.nugget);
    if (rubric.length === 0) continue;

    // ── MERGE (gpt-5) ──
    const mergeRes = await client.chat({
      system: MERGE_SYSTEM,
      user: mergeUser(pair.question, pair.headline.answer, pair.alt.answer),
      maxTokens: 2000,
    });
    spend += mergeRes.costUsd;
    if (mergeRes.failureMode || isEmpty(mergeRes.text)) {
      mergeFails++;
      console.warn(`  [${pair.instanceId}] merge failed (${mergeRes.failureMode ?? 'empty'}) — skipping`);
      continue;
    }
    const merged = mergeRes.text.trim();

    // ── JUDGE merged answer (gpt-5, plain nugget-mean) ──
    const { judgement, llmResults } = await judgeQuestion(
      client,
      { question: pair.question, rubric, memoryAbility: pair.memoryAbility, answer: merged },
      { computeTau: false },
    );
    const judgeCost = llmResults.reduce((s, r) => s + r.costUsd, 0);
    spend += judgeCost;

    const headlineNug = pair.headline.nugget_scores.map(n => n.score);
    const mergedNug = judgement.nuggetScores.map(n => n.score);

    const row = {
      instance_id: pair.instanceId,
      memory_ability: pair.memoryAbility,
      alt_source: pair.altSource,
      question: pair.question,
      score_headline: pair.headline.score,
      score_alt: pair.alt.score,
      score_merged: judgement.score,
      nuggets: rubric,
      headline_nugget_scores: headlineNug,
      merged_nugget_scores: mergedNug,
      headline_idk: looksIDK(pair.headline.answer),
      alt_idk: looksIDK(pair.alt.answer),
      merged_idk: looksIDK(merged),
      answer_merged: merged,
      merge_cost_usd: round4(mergeRes.costUsd),
      judge_cost_usd: round4(judgeCost),
    };
    outStream.write(`${JSON.stringify(row)}\n`);
    processed++;
    const delta = pair.headline.score === judgement.score ? 'TIE' : judgement.score > pair.headline.score ? 'WIN' : 'LOSS';
    process.stdout.write(
      `  [${pair.memoryAbility.padEnd(24)}] H=${pair.headline.score.toFixed(2)} A=${pair.alt.score.toFixed(2)} M=${judgement.score.toFixed(2)} ${delta}  $${spend.toFixed(3)}\n`,
    );
  }

  outStream.end();
  console.log(`\n[merge-pilot] DONE. processed=${processed} mergeFails=${mergeFails} spend=$${spend.toFixed(3)} → ${OUT}`);
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
