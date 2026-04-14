#!/usr/bin/env node
/**
 * Re-run ONLY the Gemini 2.5 Pro judge passes with max_tokens=2000 so its
 * reasoning budget doesn't truncate the JSON output, then re-aggregate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const WORK = path.join(repoRoot, 'docs', '.evolution-hypothesis-2026-04-14T08-04-57');
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) { console.error('no key'); process.exit(1); }

const JUDGE = 'google/gemini-2.5-pro';
const JUDGE_MODELS = [
  'anthropic/claude-opus-4.6', 'openai/gpt-5.4', 'google/gemini-2.5-pro', 'x-ai/grok-4.20',
];
const ARM_A_MODEL = 'anthropic/claude-opus-4.6';
const ARM_B_MODEL = 'google/gemma-4-31b-it';
const BASELINE_PROMPT = `You are a coding assistant. Answer the user's coding question clearly.`;

const EVAL_EXAMPLES = [
  { id: 'js-map-vs-foreach', input: 'What is the key difference between Array.prototype.map and Array.prototype.forEach in JavaScript?', expected: 'map returns a new array of transformed values; forEach returns undefined and is used for side effects. Use map when you need the transformed results, forEach when you only care about iteration.' },
  { id: 'py-list-tuple', input: 'In Python, when should I use a tuple instead of a list?', expected: 'Use a tuple when the collection is fixed/immutable — like coordinates, record fields, or dictionary keys. Use a list when the collection will be mutated. Tuples are hashable.' },
  { id: 'sql-inner-vs-left', input: 'Explain the difference between INNER JOIN and LEFT JOIN in SQL.', expected: 'INNER JOIN returns only rows matching in both tables. LEFT JOIN returns all rows from the left, with NULL for right-side columns when no match.' },
  { id: 'ts-type-vs-interface', input: 'When should I use a TypeScript type alias vs an interface?', expected: 'Use interface for object shapes that may be extended or implemented; they support declaration merging. Use type for unions, intersections, tuples, mapped types.' },
  { id: 'regex-bug', input: "What is wrong with this regex used to validate lowercase letters only: /^[a-z]+$/ in JavaScript, when applied against non-ASCII lowercase letters like 'é'?", expected: '[a-z] only matches ASCII a-z. Non-ASCII lowercase like é, ü, ñ will fail. Use Unicode property escapes /^\\p{Ll}+$/u.' },
  { id: 'async-race', input: 'In JavaScript, what happens if I await two promises sequentially vs with Promise.all?', expected: 'Sequential awaits run one after another (time = sum of durations). Promise.all runs concurrently (time = max of durations). Use Promise.all when awaits are independent.' },
  { id: 'go-slice-append', input: 'Why might appending to a Go slice sometimes unexpectedly modify other slices sharing the same underlying array?', expected: 'Slices share an underlying array. If capacity exceeds length, append writes into shared memory without reallocating. When capacity is exceeded, new array is allocated and sharing breaks.' },
  { id: 'rust-lifetime', input: 'In Rust, why does the compiler complain about a function that returns a reference with no explicit lifetime?', expected: 'The compiler needs to know which input the returned reference is borrowed from. With ambiguity — multiple reference inputs — you must annotate lifetimes.' },
  { id: 'python-gil', input: 'Does the Python GIL prevent all concurrency?', expected: 'No. GIL only prevents multiple threads from executing Python bytecode simultaneously in one process. I/O-bound work releases the GIL. CPU-bound work can use multiprocessing.' },
  { id: 'react-key', input: 'Why does React require a unique key prop when rendering a list?', expected: 'React uses keys to identify elements across renders to match old and new children efficiently, preserving state and avoiding unnecessary remounts.' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function openrouter(model, prompt, maxTokens = 2000) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.0,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? '';
    }
    if (res.status === 429 || res.status === 503) {
      const wait = 5_000 * Math.pow(2, attempt - 1);
      process.stdout.write(`[429 wait ${wait / 1000}s]`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  throw new Error('max retries');
}

const RUBRIC = `You are a strict, fair evaluator scoring an AI assistant's response to a coding question.

Score on:
1. CORRECTNESS (0-10)
2. PROCEDURE_FOLLOWING (0-10)
3. CONCISENESS (0-10)

Return ONLY a JSON object on a single line:
{"correctness": <0-10>, "procedure": <0-10>, "conciseness": <0-10>, "feedback": "<brief>"}`;

function parseJudgeJSON(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const o = JSON.parse(cleaned.slice(start, i + 1));
          if (typeof o.correctness === 'number' && typeof o.procedure === 'number' && typeof o.conciseness === 'number') {
            return { correctness: o.correctness, procedure: o.procedure, conciseness: o.conciseness, feedback: String(o.feedback ?? '') };
          }
        } catch {/**/}
        start = -1;
      }
    }
  }
  return null;
}
function overall(p) { if (!p) return 0; return (p.correctness * 0.5 + p.procedure * 0.3 + p.conciseness * 0.2) / 10; }
const mean = (vs) => vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;

(async () => {
  const scores = JSON.parse(fs.readFileSync(path.join(WORK, '03-judge-scores.json'), 'utf-8'));
  const armAOutputs = JSON.parse(fs.readFileSync(path.join(WORK, '02a-arm-a-outputs.json'), 'utf-8'));
  const armBOutputs = JSON.parse(fs.readFileSync(path.join(WORK, '02b-arm-b-outputs.json'), 'utf-8'));
  const armCOutputs = JSON.parse(fs.readFileSync(path.join(WORK, '02c-arm-c-outputs.json'), 'utf-8'));
  const evolvedWinner = JSON.parse(fs.readFileSync(path.join(WORK, '01-evolved-prompt.json'), 'utf-8'));

  console.log(`\n⚖️  Re-judging with Gemini 2.5 Pro (max_tokens=2000)...`);
  for (const { arm, rows } of [
    { arm: 'A', rows: armAOutputs }, { arm: 'B', rows: armBOutputs }, { arm: 'C', rows: armCOutputs },
  ]) {
    console.log(`\n   Arm ${arm}:`);
    for (const ex of EVAL_EXAMPLES) {
      const actual = rows.find(r => r.id === ex.id)?.output ?? '';
      const prompt = `${RUBRIC}\n\nINSTRUCTION:\n${ex.input}\n\nEXPECTED:\n${ex.expected}\n\nACTUAL:\n${actual}\n\nReturn the JSON now.`;
      try {
        const raw = await openrouter(JUDGE, prompt, 2000);
        const parsed = parseJudgeJSON(raw);
        scores[JUDGE][arm][ex.id] = { parsed, overall: overall(parsed) };
        process.stdout.write(parsed ? '✓' : '?');
      } catch (err) {
        scores[JUDGE][arm][ex.id] = { parsed: null, overall: 0 };
        process.stdout.write('✖');
      }
    }
  }
  fs.writeFileSync(path.join(WORK, '03-judge-scores.json'), JSON.stringify(scores, null, 2));

  // ── Re-aggregate + re-write report ──

  const perJudge = {};
  for (const judge of JUDGE_MODELS) {
    const armMeans = {};
    for (const arm of ['A', 'B', 'C']) {
      armMeans[arm] = mean(EVAL_EXAMPLES.map(e => scores[judge][arm][e.id]?.overall ?? 0));
    }
    perJudge[judge] = {
      ...armMeans,
      ratioCA: armMeans.A > 0 ? armMeans.C / armMeans.A : 0,
      ratioBA: armMeans.A > 0 ? armMeans.B / armMeans.A : 0,
    };
  }
  const ov = {
    A: mean(JUDGE_MODELS.map(j => perJudge[j].A)),
    B: mean(JUDGE_MODELS.map(j => perJudge[j].B)),
    C: mean(JUDGE_MODELS.map(j => perJudge[j].C)),
    ratioCA: mean(JUDGE_MODELS.map(j => perJudge[j].ratioCA)),
    ratioBA: mean(JUDGE_MODELS.map(j => perJudge[j].ratioBA)),
  };

  const verdict = ov.ratioCA >= 0.95
    ? (ov.ratioCA >= 1.0
      ? '🚀 **HYPOTHESIS EXCEEDED** — Arm C *beat* Opus 4.6 on the curated coder eval.'
      : '✅ **HYPOTHESIS CONFIRMED** — Arm C reached ≥ 95% of Opus 4.6 quality.')
    : ov.ratioCA >= 0.85
      ? '⚠️  **PARTIAL** — Arm C closed the gap substantially (85–95%) but not to 95%.'
      : '❌ **NOT CONFIRMED** — Arm C is still noticeably below Opus quality.';

  const L = [];
  L.push(`# Evolution Hypothesis Report — ${ts}`);
  L.push('');
  L.push('> **Hypothesis:** Waggle\u0027s self-evolution loop can close the quality gap');
  L.push('> between a weak model (Gemma 4) and a strong model (Opus 4.6).');
  L.push('');
  L.push('## Verdict');
  L.push('');
  L.push(verdict);
  L.push('');
  L.push(`- Arm C / Arm A mean ratio (per-judge): **${(ov.ratioCA * 100).toFixed(1)}%**`);
  L.push(`- Arm B / Arm A mean ratio (per-judge): ${(ov.ratioBA * 100).toFixed(1)}% (weak-model floor)`);
  L.push(`- Gap closed by evolution: ${((ov.ratioCA - ov.ratioBA) * 100).toFixed(1)}pp`);
  L.push(`- Absolute mean scores — A: ${ov.A.toFixed(3)}, B: ${ov.B.toFixed(3)}, C: ${ov.C.toFixed(3)}`);
  L.push('');
  L.push('## Setup');
  L.push('');
  L.push(`- **Eval size:** ${EVAL_EXAMPLES.length} curated coder questions with reference answers`);
  L.push(`- **Evolution:** IterativeGEPA population=3, generations=2, winner: \`${evolvedWinner.winnerId}\`, delta vs baseline: +${(evolvedWinner.delta * 100).toFixed(1)}pp`);
  L.push('');
  L.push('| Arm | Description | Model |');
  L.push('|---|---|---|');
  L.push(`| A | Strong-model upper bound | ${ARM_A_MODEL} |`);
  L.push(`| B | Weak-model lower bound | ${ARM_B_MODEL} + baseline prompt |`);
  L.push(`| C | Weak + Waggle evolution | ${ARM_B_MODEL} + evolved prompt |`);
  L.push('');
  L.push('### Judges (blind, independent scoring)');
  for (const j of JUDGE_MODELS) L.push(`- ${j}`);
  L.push('');
  L.push('## Results by Judge');
  L.push('');
  L.push('| Judge | Arm A | Arm B | Arm C | C / A | B / A |');
  L.push('|---|---|---|---|---|---|');
  for (const judge of JUDGE_MODELS) {
    const p = perJudge[judge];
    L.push(`| ${judge} | ${p.A.toFixed(3)} | ${p.B.toFixed(3)} | ${p.C.toFixed(3)} | ${(p.ratioCA * 100).toFixed(1)}% | ${(p.ratioBA * 100).toFixed(1)}% |`);
  }
  L.push(`| **Mean** | **${ov.A.toFixed(3)}** | **${ov.B.toFixed(3)}** | **${ov.C.toFixed(3)}** | **${(ov.ratioCA * 100).toFixed(1)}%** | **${(ov.ratioBA * 100).toFixed(1)}%** |`);
  L.push('');
  L.push('## Evolved Prompt (Arm C)');
  L.push('');
  L.push('### Baseline');
  L.push('```');
  L.push(BASELINE_PROMPT);
  L.push('```');
  L.push('');
  L.push('### Evolved');
  L.push('```');
  L.push(evolvedWinner.evolved);
  L.push('```');
  L.push('');
  L.push('## Per-Example Mean Scores (averaged across judges)');
  L.push('');
  L.push('| Example | Arm A | Arm B | Arm C |');
  L.push('|---|---|---|---|');
  for (const ex of EVAL_EXAMPLES) {
    const av = (arm) => mean(JUDGE_MODELS.map(j => scores[j][arm][ex.id]?.overall ?? 0));
    L.push(`| ${ex.id} | ${av('A').toFixed(2)} | ${av('B').toFixed(2)} | ${av('C').toFixed(2)} |`);
  }
  L.push('');
  L.push('## Methodology Notes');
  L.push('');
  L.push('- **Blind scoring**: each judge scored each arm output independently, not knowing which arm produced it.');
  L.push('- **Per-judge ratios**: Arm C / Arm A computed *per judge* then averaged, so a lenient/strict judge cannot bias the comparison.');
  L.push('- **Rate limits**: Gemma 4 hit OpenRouter 429s on the initial run. Resume script retried with exponential backoff (5s → 15s → 45s → 90s → 150s).');
  L.push('- **Gemini reasoning-token budget**: the first judging pass gave Gemini `max_tokens=300`, which it consumed entirely on internal "reasoning" tokens before emitting content — all 30 scores truncated. A follow-up pass with `max_tokens=2000` fixed this.');
  L.push('- **Self-bias caveat**: Opus 4.6 appears as both Arm A and one of the judges. The per-judge ratio aggregation mitigates but does not eliminate self-bias. Notably the Opus judge gave Arm C a higher score than Arm A, which if anything is the opposite of a self-bias artifact.');
  L.push('');
  L.push('---');
  L.push('');
  L.push(`Generated by \`scripts/evolution-hypothesis-rejudge-gemini.mjs\` at ${new Date().toISOString()}.`);

  const out = path.join(repoRoot, 'docs', `evolution-hypothesis-report-${ts}.md`);
  fs.writeFileSync(out, L.join('\n'), 'utf-8');

  console.log(`\n\n📊 Final Results:`);
  console.log(`   Arm A (Opus 4.6):        ${ov.A.toFixed(3)}`);
  console.log(`   Arm B (Gemma 4 raw):     ${ov.B.toFixed(3)}`);
  console.log(`   Arm C (Gemma 4 evolved): ${ov.C.toFixed(3)}`);
  console.log(`   C/A ratio:               ${(ov.ratioCA * 100).toFixed(1)}%`);
  console.log(`\n📄 Report: ${path.relative(repoRoot, out)}`);
})();
