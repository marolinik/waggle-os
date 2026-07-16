import fs from 'node:fs';
import { BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { judgeQuestion } from '../src/beam-nugget-judge.js';
import type { QuestionJudgement } from '../src/beam-nugget-judge.js';

/**
 * SAME-JUDGE rejudge for E6 iter1(pilot)-vs-iter2 on the 6 CHANGED abilities.
 * Re-scores every changed-ability answer from BOTH runs through OpenRouter
 * gpt-5 (identical model/price to the OpenAI-direct judge used for the pilot),
 * so the iter1-vs-iter2 comparison controls for judge drift. The pilot's
 * original scores were OpenAI-direct; iter2's original scores are all FAIL
 * (judge quota died mid-run) — this replaces both with OR-gpt5.
 *
 * Rubric is recovered from each row's nugget_scores[].nugget (intact even in
 * the failed iter2 rows). Soft "Parse error" nuggets are retried once.
 *
 * WRITES:
 *   (a) beam-1m-e6-ledger-iter2-REJUDGED.jsonl — the 30 iter2 rows with real
 *       OR-gpt5 score/judgment/nugget_scores replacing the FAIL placeholders.
 *   (b) beam-1m-e6-ledger-rejudge-OR.json — per-ability iter1-OR / iter2-OR
 *       means, per-question scores, and a parse-error flag.
 */

const CHANGED = ['contradiction_resolution', 'event_ordering', 'instruction_following', 'knowledge_update', 'preference_following', 'temporal_reasoning'];
const RESULTS = 'D:/Projects/waggle-os/benchmarks/results/beam/';
const PILOT = 'beam-1m-e6-ledger-pilot-anthropic-claude-sonnet-4.6.jsonl';
const ITER2 = 'beam-1m-e6-ledger-iter2-anthropic-claude-sonnet-4.6.jsonl';
const OUT_REJUDGED = 'beam-1m-e6-ledger-iter2-REJUDGED.jsonl';
const OUT_JSON = 'beam-1m-e6-ledger-rejudge-OR.json';

type Row = { instance_id: string; memory_ability: string; question: string; answer: string; nugget_scores?: { nugget: string }[]; [k: string]: unknown };

const load = (f: string): Row[] => fs.readFileSync(RESULTS + f, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Row);

function hasParseErr(j: QuestionJudgement): boolean {
  return j.judgment === 'ERROR' || (j.nuggetScores || []).some(n => String(n.reason).startsWith('Parse error'));
}

async function judgeOne(judge: BeamOpenAiClient, r: Row): Promise<QuestionJudgement> {
  const rubric = (r.nugget_scores || []).map(n => n.nugget).filter(Boolean);
  let { judgement } = await judgeQuestion(judge, { question: r.question, rubric, memoryAbility: r.memory_ability, answer: r.answer }, { computeTau: false });
  if (hasParseErr(judgement)) {
    const retry = await judgeQuestion(judge, { question: r.question, rubric, memoryAbility: r.memory_ability, answer: r.answer }, { computeTau: false });
    judgement = retry.judgement; // keep retry result; flagged below if still bad
  }
  return judgement;
}

async function judgeSet(judge: BeamOpenAiClient, rows: Row[], label: string): Promise<Map<string, QuestionJudgement>> {
  const out = new Map<string, QuestionJudgement>();
  let i = 0;
  for (const r of rows) {
    const j = await judgeOne(judge, r);
    out.set(r.instance_id, j);
    i++;
    process.stdout.write(`  [${label}] ${String(i).padStart(2)}/${rows.length} ${r.instance_id.padEnd(42)} score=${j.score.toFixed(3)} ${hasParseErr(j) ? '(PARSE-ERR)' : ''}\n`);
  }
  return out;
}

function abilityMeans(rows: Row[], scoreMap: Map<string, QuestionJudgement>): Record<string, number> {
  const byAb: Record<string, number[]> = {};
  for (const r of rows) (byAb[r.memory_ability] ??= []).push(scoreMap.get(r.instance_id)!.score);
  const means: Record<string, number> = {};
  for (const a of Object.keys(byAb)) means[a] = byAb[a].reduce((x, y) => x + y, 0) / byAb[a].length;
  return means;
}

async function main(): Promise<void> {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY required');
  const judge = new BeamOpenAiClient({ model: 'openai/gpt-5', apiKey: key, baseUrl: 'https://openrouter.ai/api/v1', pricing: OPENAI_PRICING['gpt-5'], timeoutMs: 120_000, maxRetries: 3 });

  const iter1 = load(PILOT).filter(r => CHANGED.includes(r.memory_ability));
  const iter2 = load(ITER2).filter(r => CHANGED.includes(r.memory_ability));
  console.log(`iter1(pilot) changed-ability rows: ${iter1.length}; iter2 changed-ability rows: ${iter2.length}`);
  for (const r of [...iter1, ...iter2]) if (!(r.nugget_scores || []).length) throw new Error('no recoverable rubric for ' + r.instance_id);

  console.log('\n== Re-judging iter2 on OR-gpt5 ==');
  const j2 = await judgeSet(judge, iter2, 'iter2');
  console.log('\n== Re-judging iter1/pilot on OR-gpt5 ==');
  const j1 = await judgeSet(judge, iter1, 'iter1');

  // (a) REJUDGED iter2 jsonl — preserve every original field, swap judged fields.
  const rejudgedLines = iter2.map(r => {
    const j = j2.get(r.instance_id)!;
    return JSON.stringify({ ...r, score: j.score, judgment: j.judgment, nugget_scores: j.nuggetScores, judge_model: 'openai/gpt-5', rejudged_via: 'openrouter' });
  });
  fs.writeFileSync(RESULTS + OUT_REJUDGED, rejudgedLines.join('\n') + '\n');

  // (b) per-ability means + per-question scores.
  const m1 = abilityMeans(iter1, j1);
  const m2 = abilityMeans(iter2, j2);
  const perQuestion: Record<string, unknown> = {};
  for (const a of CHANGED) {
    perQuestion[a] = {
      iter1: iter1.filter(r => r.memory_ability === a).map(r => ({ id: r.instance_id, score: j1.get(r.instance_id)!.score })),
      iter2: iter2.filter(r => r.memory_ability === a).map(r => ({ id: r.instance_id, score: j2.get(r.instance_id)!.score })),
    };
  }
  const anyPE = [...j1.values(), ...j2.values()].some(hasParseErr);
  const changed6_i1 = CHANGED.reduce((s, a) => s + m1[a], 0) / CHANGED.length;
  const changed6_i2 = CHANGED.reduce((s, a) => s + m2[a], 0) / CHANGED.length;
  fs.writeFileSync(RESULTS + OUT_JSON, JSON.stringify({
    judge: 'openai/gpt-5 (OpenRouter)', changed_abilities: CHANGED,
    iter1_OR_ability_means: m1, iter2_OR_ability_means: m2,
    changed6_iter1_OR_mean: changed6_i1, changed6_iter2_OR_mean: changed6_i2,
    per_question: perQuestion, parseErrorsRemain: anyPE, generated_at: new Date().toISOString(),
  }, null, 2));

  console.log('\nability                    iter1-OR  iter2-OR     Δ');
  for (const a of CHANGED.slice().sort()) {
    const d = m2[a] - m1[a];
    console.log(`${a.padEnd(26)} ${m1[a].toFixed(3)}     ${m2[a].toFixed(3)}   ${(d >= 0 ? '+' : '')}${d.toFixed(3)}`);
  }
  console.log(`\nchanged-6 iter1-OR mean: ${changed6_i1.toFixed(4)}`);
  console.log(`changed-6 iter2-OR mean: ${changed6_i2.toFixed(4)}   Δ=${(changed6_i2 - changed6_i1 >= 0 ? '+' : '')}${(changed6_i2 - changed6_i1).toFixed(4)}`);
  console.log('parseErrorsRemain:', anyPE);
  console.log('wrote', RESULTS + OUT_REJUDGED);
  console.log('wrote', RESULTS + OUT_JSON);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
