#!/usr/bin/env node
/**
 * Resume the evolution hypothesis test from saved checkpoints.
 *
 * Reuses:
 *   - 01-evolved-prompt.json  (the GEPA winner; ~54 min of compute preserved)
 *   - 02a-arm-a-outputs.json  (10/10 clean)
 *   - 02b-arm-b-outputs.json  (partial — fills in [ERROR] + empty rows)
 *   - 02c-arm-c-outputs.json  (partial — fills in [ERROR] + empty rows)
 *
 * Adds:
 *   - Exponential backoff on 429 (rate limit) and 5xx
 *   - Only re-runs rows that actually failed
 *   - Runs the full 120-call blind judging phase with the same backoff
 *   - Writes final docs/evolution-hypothesis-report-{ts}.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ── Args ─────────────────────────────────────────────────────────

const WORK_DIR_REL = process.argv[2] ?? 'docs/.evolution-hypothesis-2026-04-14T08-04-57';
const workDir = path.resolve(repoRoot, WORK_DIR_REL);
if (!fs.existsSync(workDir)) {
  console.error(`Work dir not found: ${workDir}`);
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) { console.error('OPENROUTER_API_KEY not set.'); process.exit(1); }

// ── Models (same as main script) ────────────────────────────────

const ARM_A_MODEL = 'anthropic/claude-opus-4.6';
const ARM_B_MODEL = 'google/gemma-4-31b-it';
const JUDGE_MODELS = [
  'anthropic/claude-opus-4.6',
  'openai/gpt-5.4',
  'google/gemini-2.5-pro',
  'x-ai/grok-4.20',
];

// ── Eval dataset (must match main script) ───────────────────────

const EVAL_EXAMPLES = [
  { id: 'js-map-vs-foreach', input: 'What is the key difference between Array.prototype.map and Array.prototype.forEach in JavaScript?', expected: 'map returns a new array of transformed values; forEach returns undefined and is used for side effects. Use map when you need the transformed results, forEach when you only care about iteration.' },
  { id: 'py-list-tuple', input: 'In Python, when should I use a tuple instead of a list?', expected: 'Use a tuple when the collection is fixed/immutable — like coordinates, record fields, or dictionary keys. Use a list when the collection will be mutated (append, remove, reorder). Tuples are also slightly faster and hashable.' },
  { id: 'sql-inner-vs-left', input: 'Explain the difference between INNER JOIN and LEFT JOIN in SQL.', expected: 'INNER JOIN returns only rows with matches in both tables. LEFT JOIN returns all rows from the left table, with NULL for columns from the right table when no match exists. Use LEFT JOIN when you need to preserve all left-side rows.' },
  { id: 'ts-type-vs-interface', input: 'When should I use a TypeScript type alias vs an interface?', expected: 'Use interface for object shapes that may be extended or implemented; they support declaration merging and are more idiomatic for class contracts. Use type for unions, intersections, tuples, mapped types, or other non-object shapes.' },
  { id: 'regex-bug', input: "What is wrong with this regex used to validate lowercase letters only: /^[a-z]+$/ in JavaScript, when applied against non-ASCII lowercase letters like 'é'?", expected: 'The character class [a-z] only matches ASCII a through z. Non-ASCII lowercase letters like é, ü, ñ, or Cyrillic letters will fail to match. Use Unicode property escapes: /^\\p{Ll}+$/u, or explicitly include the expected characters.' },
  { id: 'async-race', input: 'In JavaScript, what happens if I await two promises sequentially vs with Promise.all?', expected: 'Sequential awaits run the promises one after another: total time = sum of durations. Promise.all runs them concurrently: total time = max of durations. Use Promise.all when the awaits are independent, sequential when one depends on the previous result.' },
  { id: 'go-slice-append', input: 'Why might appending to a Go slice sometimes unexpectedly modify other slices sharing the same underlying array?', expected: 'Slices share an underlying array. If a slice has capacity beyond its length, append writes into that shared memory without reallocating. Other slices viewing the same region see the change. When capacity is exceeded, a new array is allocated and the sharing breaks. To always get a fresh array, use make+copy or append to a slice of length and capacity equal.' },
  { id: 'rust-lifetime', input: 'In Rust, why does the compiler complain about a function that returns a reference with no explicit lifetime?', expected: 'When a function returns a reference, the compiler needs to know which input that reference is borrowed from (its lifetime). If there is ambiguity — multiple reference inputs, or a reference unrelated to inputs — you must annotate lifetimes explicitly. The compiler cannot infer which input the returned reference is tied to.' },
  { id: 'python-gil', input: 'Does the Python GIL prevent all concurrency?', expected: 'No. The GIL only prevents multiple threads from executing Python bytecode simultaneously within one process. I/O-bound work releases the GIL (so threading still helps for I/O-bound code). CPU-bound work does not parallelize across threads but can use multiprocessing to bypass the GIL entirely.' },
  { id: 'react-key', input: 'Why does React require a unique key prop when rendering a list?', expected: 'React uses keys to identify elements across renders so it can match old and new children efficiently, preserving component state and avoiding unnecessary unmount/remount cycles. Without stable keys, React falls back to index-based matching which reorders or remounts components incorrectly when the list changes.' },
];

const BASELINE_PROMPT = `You are a coding assistant. Answer the user's coding question clearly.`;

// ── OpenRouter client with retry+backoff ────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
let _calls = 0;
let _tokens = { in: 0, out: 0 };

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function openrouter(model, systemPrompt, userInput, opts = {}) {
  const messages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userInput }]
    : [{ role: 'user', content: userInput }];
  const body = {
    model, messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1024,
  };

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    _calls++;
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://waggle-os.ai',
        'X-Title': 'Waggle Evolution Hypothesis',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const j = await res.json();
      _tokens.in += j.usage?.prompt_tokens ?? 0;
      _tokens.out += j.usage?.completion_tokens ?? 0;
      return j.choices?.[0]?.message?.content ?? '';
    }

    const isRate = res.status === 429 || res.status === 503 || res.status === 502;
    const text = await res.text().catch(() => '');
    if (!isRate || attempt === maxAttempts) {
      throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${text.slice(0, 160)}`);
    }
    // Exponential backoff with jitter: 5s, 15s, 45s, 90s, 150s, ...
    const base = Math.min(150_000, 5_000 * Math.pow(3, attempt - 1));
    const jitter = Math.floor(Math.random() * 3_000);
    const waitMs = base + jitter;
    process.stdout.write(`[retry ${attempt}/${maxAttempts - 1} in ${Math.round(waitMs / 1000)}s]`);
    await sleep(waitMs);
  }
  throw new Error('unreachable');
}

// ── Phase 2 resume ──────────────────────────────────────────────

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(workDir, name), 'utf-8'));
}
function saveJSON(name, data) {
  fs.writeFileSync(path.join(workDir, name), JSON.stringify(data, null, 2), 'utf-8');
}

function needsRerun(row) {
  return !row || !row.output || row.output.startsWith('[ERROR') || row.output.length < 40;
}

async function fillArm(arm, model, systemPrompt, outputsFile) {
  console.log(`\n🏁 Arm ${arm} resume (${model})...`);
  const existing = loadJSON(outputsFile);
  const byId = new Map(existing.map(r => [r.id, r]));
  let rerun = 0;
  for (const ex of EVAL_EXAMPLES) {
    const row = byId.get(ex.id);
    if (!needsRerun(row)) {
      process.stdout.write('·');
      continue;
    }
    rerun++;
    try {
      const out = await openrouter(model, systemPrompt, ex.input, { maxTokens: 600 });
      byId.set(ex.id, { id: ex.id, output: out });
      process.stdout.write('✓');
    } catch (err) {
      byId.set(ex.id, { id: ex.id, output: `[ERROR: ${err.message.slice(0, 120)}]` });
      process.stdout.write('✖');
    }
  }
  console.log(` [${rerun} re-runs, ${EVAL_EXAMPLES.length - rerun} kept]`);
  const finalArray = EVAL_EXAMPLES.map(ex => byId.get(ex.id));
  saveJSON(outputsFile, finalArray);
  return finalArray;
}

// ── Phase 3: blind judging with retry ───────────────────────────

const RUBRIC = `You are a strict, fair evaluator scoring an AI assistant's response to a coding question.

You will be given:
- The user's INSTRUCTION (a coding question)
- The EXPECTED output (the reference answer — the ground truth)
- The ACTUAL output from the AI assistant

Score the ACTUAL response on three dimensions, each on a 0-10 integer scale:
1. CORRECTNESS (0-10): Does it match the expected answer semantically? Correct facts / steps?
2. PROCEDURE_FOLLOWING (0-10): Did it answer the question asked, in an appropriate format?
3. CONCISENESS (0-10): Tight and on-point, or padded / verbose?

Then write a short, ACTIONABLE FEEDBACK (max 2 sentences) explaining the biggest issue (if any).

Return ONLY a JSON object on a single line, no markdown:
{"correctness": <0-10>, "procedure": <0-10>, "conciseness": <0-10>, "feedback": "<string>"}`;

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
        const cand = cleaned.slice(start, i + 1);
        try {
          const obj = JSON.parse(cand);
          if (typeof obj.correctness === 'number' && typeof obj.procedure === 'number' && typeof obj.conciseness === 'number') {
            return {
              correctness: obj.correctness, procedure: obj.procedure,
              conciseness: obj.conciseness,
              feedback: String(obj.feedback ?? ''),
            };
          }
        } catch {/**/}
        start = -1;
      }
    }
  }
  return null;
}
function overall(p) {
  if (!p) return 0;
  return (p.correctness * 0.5 + p.procedure * 0.3 + p.conciseness * 0.2) / 10;
}

async function judgeOnce(judgeModel, ex, actual) {
  const prompt = `${RUBRIC}\n\nINSTRUCTION:\n${ex.input}\n\nEXPECTED:\n${ex.expected}\n\nACTUAL:\n${actual}\n\nReturn the JSON now.`;
  const raw = await openrouter(judgeModel, null, prompt, { temperature: 0.0, maxTokens: 300 });
  return parseJudgeJSON(raw);
}

async function judgeAll(outputs) {
  console.log('\n⚖️  Phase 3 — Blind judging (with retry+backoff)...');
  const scores = {};
  for (const j of JUDGE_MODELS) scores[j] = { A: {}, B: {}, C: {} };

  for (const judge of JUDGE_MODELS) {
    console.log(`\n   Judge: ${judge}`);
    for (const { arm, rows } of [
      { arm: 'A', rows: outputs.A }, { arm: 'B', rows: outputs.B }, { arm: 'C', rows: outputs.C },
    ]) {
      for (const ex of EVAL_EXAMPLES) {
        const actualRow = rows.find(r => r.id === ex.id);
        const actual = actualRow?.output ?? '';
        try {
          const parsed = await judgeOnce(judge, ex, actual);
          scores[judge][arm][ex.id] = { parsed, overall: overall(parsed) };
          process.stdout.write('.');
        } catch (err) {
          scores[judge][arm][ex.id] = { parsed: null, overall: 0 };
          process.stdout.write('✖');
          console.error(`\n     ${judge}/${arm}/${ex.id}: ${err.message}`);
        }
      }
      process.stdout.write(` [${arm}]`);
    }
  }
  saveJSON('03-judge-scores.json', scores);
  return scores;
}

// ── Report (same as main script) ────────────────────────────────

function mean(vals) {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function aggregate(scores) {
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
  const overall = {
    A: mean(JUDGE_MODELS.map(j => perJudge[j].A)),
    B: mean(JUDGE_MODELS.map(j => perJudge[j].B)),
    C: mean(JUDGE_MODELS.map(j => perJudge[j].C)),
    ratioCA: mean(JUDGE_MODELS.map(j => perJudge[j].ratioCA)),
    ratioBA: mean(JUDGE_MODELS.map(j => perJudge[j].ratioBA)),
  };
  return { perJudge, overall };
}

function writeReport({ evolvedPrompt, delta, winnerId, outputs, scores, agg }) {
  const { perJudge, overall } = agg;
  const verdict = overall.ratioCA >= 0.95
    ? '✅ **HYPOTHESIS CONFIRMED** — Arm C reached ≥ 95% of Opus 4.6 quality.'
    : overall.ratioCA >= 0.85
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
  L.push(`- Arm C / Arm A mean ratio: **${(overall.ratioCA * 100).toFixed(1)}%**`);
  L.push(`- Arm B / Arm A mean ratio: ${(overall.ratioBA * 100).toFixed(1)}% (weak-model floor)`);
  L.push(`- Gap closed by evolution: ${((overall.ratioCA - overall.ratioBA) * 100).toFixed(1)}pp`);
  L.push('');
  L.push('## Setup');
  L.push('');
  L.push(`- **Eval size:** ${EVAL_EXAMPLES.length} coder questions (curated, with reference answers)`);
  L.push(`- **Evolution:** IterativeGEPA population=3, generations=2, winner: \`${winnerId}\`, delta vs baseline: +${(delta * 100).toFixed(1)}pp`);
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
  L.push(`| **Mean** | **${overall.A.toFixed(3)}** | **${overall.B.toFixed(3)}** | **${overall.C.toFixed(3)}** | **${(overall.ratioCA * 100).toFixed(1)}%** | **${(overall.ratioBA * 100).toFixed(1)}%** |`);
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
  L.push(evolvedPrompt);
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
  L.push('- **Per-judge ratios**: we compute Arm C / Arm A *per judge* then average, so a lenient/strict judge cannot bias the comparison.');
  L.push('- **Rate limits**: Gemma 4 (OpenRouter shared pool) hit 429 during the first run. The resume script re-ran failed calls with exponential backoff (5s → 15s → 45s → 90s → 150s).');
  L.push('- **Self-bias caveat**: one judge (Opus 4.6) is the same model as Arm A. The per-judge ratio aggregation mitigates this but does not eliminate it.');
  L.push('');
  L.push(`- OpenRouter calls (resume only): ${_calls}, tokens in: ${_tokens.in.toLocaleString()}, out: ${_tokens.out.toLocaleString()}`);
  L.push('');
  L.push('---');
  L.push('');
  L.push(`Generated by \`scripts/evolution-hypothesis-resume.mjs\` at ${new Date().toISOString()}.`);

  const out = path.join(repoRoot, 'docs', `evolution-hypothesis-report-${ts}.md`);
  fs.writeFileSync(out, L.join('\n'), 'utf-8');
  return out;
}

// ── Main ────────────────────────────────────────────────────────

(async () => {
  try {
    console.log(`Resuming from: ${workDir}`);
    const evolved = loadJSON('01-evolved-prompt.json');
    console.log(`Evolved prompt: winner ${evolved.winnerId}, delta +${(evolved.delta * 100).toFixed(1)}pp`);

    // Phase 2: fill in failed arm rows
    const armA = await fillArm('A', ARM_A_MODEL, BASELINE_PROMPT, '02a-arm-a-outputs.json');
    const armB = await fillArm('B', ARM_B_MODEL, BASELINE_PROMPT, '02b-arm-b-outputs.json');
    const armC = await fillArm('C', ARM_B_MODEL, evolved.evolved, '02c-arm-c-outputs.json');

    // Phase 3: blind judging
    const scores = await judgeAll({ A: armA, B: armB, C: armC });
    const agg = aggregate(scores);

    console.log('\n\n📊 Final Results:');
    console.log(`   Arm A (Opus 4.6): ${agg.overall.A.toFixed(3)}`);
    console.log(`   Arm B (Gemma 4 raw): ${agg.overall.B.toFixed(3)}`);
    console.log(`   Arm C (Gemma 4 evolved): ${agg.overall.C.toFixed(3)}`);
    console.log(`   C/A ratio: ${(agg.overall.ratioCA * 100).toFixed(1)}%`);

    const reportPath = writeReport({
      evolvedPrompt: evolved.evolved,
      delta: evolved.delta,
      winnerId: evolved.winnerId,
      outputs: { A: armA, B: armB, C: armC },
      scores,
      agg,
    });
    console.log(`\n📄 Report: ${path.relative(repoRoot, reportPath)}`);
  } catch (err) {
    console.error('\n💥 Resume failed:', err?.stack ?? err);
    process.exit(2);
  }
})();
