#!/usr/bin/env node
// Sprint 10 Task 1.1 — Qwen3.6 thinking-mode stability matrix.
//
// Spec: waggle-os/docs/plans/STAGE-2-PREP-BACKLOG.md ·
//        briefs/2026-04-21-cc-sprint-10-tasks.md §1.1
//
// Executes a 2 × 4 × 5 = 40-cell matrix:
//   thinking toggle:  on / off   (provider extra_body.enable_thinking)
//   max_tokens:       8K / 16K / 32K / 64K
//   prompt shape:     direct-fact / multi-anchor-enumeration /
//                     chain-of-anchor / temporal-scope / null-result-tolerant
//
// Each cell produces a classification:
//   converged           content populated, token count ≤ 0.9 × ceiling
//   loop                reasoning_content repeats a phrase ≥3 times in
//                       final 1K chars; content empty
//   truncated           content populated but ends mid-sentence;
//                       completion_tokens = ceiling
//   empty-reasoning     content empty; reasoning_content populated
//
// Deliverables:
//   benchmarks/harness/data/qwen-stability-matrix-<ISO>.csv
//   docs/reports/qwen-thinking-stability-<ISO>.md
//
// Day-2 Sprint-10 scope: scaffolding + dry-run only. Real Qwen calls
// fire Day-3 after operator confirms this scaffold + dry-run output.
// Per brief §7 Task 1.1 budget is $5 — 40 cells × ~$0.025 avg ≈ $1.
//
// Usage:
//   # Dry-run (no LLM calls — uses synthetic responses to verify classifier + writers)
//   node scripts/qwen-stability-matrix.mjs --dry-run
//
//   # Limited-cell dev run (3 cells with real calls, useful for classifier tuning)
//   node scripts/qwen-stability-matrix.mjs --cells 3
//
//   # Full matrix
//   node scripts/qwen-stability-matrix.mjs
//
//   # Alternate routing (OpenRouter bridge vs DashScope-direct once provisioned)
//   node scripts/qwen-stability-matrix.mjs --model qwen3.6-35b-a3b-via-openrouter
//
// Exit codes:
//   0 — matrix completed with at least one `converged` cell
//   1 — matrix completed but all cells failed classification (Stage 2 blocker)
//   2 — runtime error before matrix could produce a report

import fs from 'node:fs';
import path from 'node:path';

// ── Prompt shapes ───────────────────────────────────────────────────────

/**
 * Five shape definitions per brief §1.1 + STAGE-2-PREP-BACKLOG.
 * Each prompt is minimal-by-design: the matrix tests inference stability,
 * NOT retrieval. Fixed prompts let us attribute outcome-category drift to
 * (thinking, max_tokens) only.
 */
const PROMPT_SHAPES = [
  {
    id: 'direct-fact',
    description: 'Single-fact lookup — one retrievable datum expected.',
    prompt:
      'When did humans first land on the Moon? Answer with year only, four digits.',
    expectedShape: /\b19(6[4-9]|7\d|8\d)\b/,
  },
  {
    id: 'multi-anchor-enumeration',
    description:
      'N enumerated components requested — the shape Stage 0 Q2 looped on.',
    prompt:
      'List three key characteristics of the Python programming language. '
      + 'For each, provide: (a) the characteristic name, (b) a one-sentence '
      + 'description, (c) one concrete code-relevant example. Format as a '
      + 'numbered list 1/2/3.',
    expectedShape: /1[.\)].+2[.\)].+3[.\)]/s,
  },
  {
    id: 'chain-of-anchor',
    description:
      'Cross-reference across two facts — connect via shared theme.',
    prompt:
      'The book "1984" by George Orwell and the film "Blade Runner" share '
      + 'a common thematic concern. State that theme in one sentence, then '
      + 'provide one textual anchor from each work that illustrates the '
      + 'theme.',
    expectedShape: /.{30,}/s,
  },
  {
    id: 'temporal-scope',
    description:
      'Date-bounded lookup — the shape Stage 0 Q1 tripped on.',
    prompt:
      'What major space-exploration event occurred in December 1972? Give '
      + 'the event name and the exact date.',
    expectedShape: /\bDecember\s+(7|1[0-9])[,\s]+1972\b/i,
  },
  {
    id: 'null-result-tolerant',
    description:
      'Question whose correct answer may be "no evidence" — allows negative.',
    prompt:
      'Is there historical evidence that Napoleon Bonaparte ever visited '
      + 'the continent of Australia? Answer yes, no, or unclear; follow '
      + 'with a one-sentence rationale.',
    expectedShape: /\b(no|unclear|never visited|did not visit)\b/i,
  },
];

const MAX_TOKENS_VALUES = [8000, 16000, 32000, 64000];
const THINKING_TOGGLES = [true, false];

// ── Arg parsing ─────────────────────────────────────────────────────────

const args = (() => {
  const out = {
    model: 'qwen3.6-35b-a3b',
    backend: 'litellm',
    litellmUrl: process.env.LITELLM_BASE_URL ?? 'http://localhost:4000',
    litellmKey: process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev',
    ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    dryRun: false,
    cells: Infinity,
    outDirData: 'benchmarks/harness/data',
    outDirReports: 'docs/reports',
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--model':        out.model = next; i++; break;
      case '--backend':      out.backend = next; i++; break;
      case '--litellm-url':  out.litellmUrl = next; i++; break;
      case '--litellm-key':  out.litellmKey = next; i++; break;
      case '--ollama-url':   out.ollamaUrl = next; i++; break;
      case '--dry-run':      out.dryRun = true; break;
      case '--cells':        out.cells = Number(next); i++; break;
      case '--out-data':     out.outDirData = next; i++; break;
      case '--out-reports':  out.outDirReports = next; i++; break;
    }
  }
  return out;
})();

// ── Inference layer ─────────────────────────────────────────────────────

/** Call the LiteLLM proxy with thinking toggle via `extra_body`. */
async function callLitellm({ url, apiKey, model, prompt, maxTokens, thinking }) {
  const started = Date.now();
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.0,
  };
  if (!thinking) {
    // DashScope + OpenRouter both accept `enable_thinking: false` in
    // extra_body. LiteLLM's `drop_params: true` might strip it — guard
    // with an env override if we hit that.
    body.extra_body = { enable_thinking: false };
  }
  let res;
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { error: `fetch_error: ${err instanceof Error ? err.message : String(err)}`, latencyMs: Date.now() - started };
  }
  const latencyMs = Date.now() - started;
  if (!res.ok) {
    const text = await res.text();
    return { error: `http_${res.status}: ${text.slice(0, 240)}`, latencyMs };
  }
  const json = await res.json();
  const message = json.choices?.[0]?.message ?? {};
  const usage = json.usage ?? {};
  return {
    content: typeof message.content === 'string' ? message.content : '',
    reasoningContent: typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    latencyMs,
  };
}

/** Synthesize a cell result for dry-run / classifier-regression mode. */
function syntheticCellResult(prompt, maxTokens, thinking, cellIdx) {
  // Rotate through the 4 outcome categories so classifier coverage is
  // exercised during dry-run. Cell 0 converges, 1 loops, 2 truncates,
  // 3 empty-reasoning, 4 onwards cycle.
  const outcomeClass = cellIdx % 4;
  const baseLatency = thinking ? 1800 : 600;
  if (outcomeClass === 0) {
    return {
      content: '1969',
      reasoningContent: thinking ? 'Apollo 11 landed in July 1969.' : '',
      promptTokens: 40,
      completionTokens: Math.floor(maxTokens * 0.15),
      latencyMs: baseLatency,
    };
  }
  if (outcomeClass === 1) {
    const loopPhrase = 'I need to think carefully about this... ';
    return {
      content: '',
      reasoningContent: loopPhrase.repeat(12) + 'cannot complete this thought.',
      promptTokens: 40,
      completionTokens: maxTokens,
      latencyMs: baseLatency * 4,
    };
  }
  if (outcomeClass === 2) {
    return {
      content: 'Python is a high-level language known for its readability. Another key trait is',
      reasoningContent: thinking ? 'Thinking about Python...' : '',
      promptTokens: 60,
      completionTokens: maxTokens,
      latencyMs: baseLatency * 2,
    };
  }
  return {
    content: '',
    reasoningContent: thinking ? 'I considered the question at length. The Moon landing was in 1969.' : '',
    promptTokens: 45,
    completionTokens: Math.floor(maxTokens * 0.8),
    latencyMs: baseLatency * 3,
  };
}

// ── Outcome classifier ─────────────────────────────────────────────────

/**
 * Pure function classifying a (content, reasoning, completion_tokens,
 * max_tokens_ceiling) tuple into one of four outcome buckets. Exported
 * as a named export from this module so the stage-2 prep test can unit-
 * test it in isolation (see tests/qwen-stability-classifier.test.ts
 * stub scheduled for Day-3).
 */
export function classifyOutcome({ content, reasoningContent, completionTokens, maxTokens }) {
  const ratio = maxTokens > 0 ? completionTokens / maxTokens : 0;
  const hasContent = typeof content === 'string' && content.trim().length > 0;
  const hasReasoning = typeof reasoningContent === 'string' && reasoningContent.trim().length > 0;

  // Loop: empty content + reasoning that contains a 3+ times-repeating
  // phrase in the last 1K characters. Using an 8-word window as the
  // "phrase" grain keeps small-scale repetition (common filler) from
  // false-positive-ing, while catching the kind of 20-40 word
  // perseveration Stage-0 Q2 produced.
  if (!hasContent && hasReasoning) {
    const tail = reasoningContent.slice(-1000);
    const words = tail.split(/\s+/).filter(Boolean);
    const windowSize = Math.min(8, Math.max(3, Math.floor(words.length / 10)));
    if (words.length >= windowSize * 3) {
      const windows = [];
      for (let i = 0; i + windowSize <= words.length; i++) {
        windows.push(words.slice(i, i + windowSize).join(' ').toLowerCase());
      }
      const counts = new Map();
      for (const w of windows) counts.set(w, (counts.get(w) ?? 0) + 1);
      const topCount = [...counts.values()].reduce((m, v) => Math.max(m, v), 0);
      if (topCount >= 3) return 'loop';
    }
    // Empty content, populated reasoning, no loop detected → empty-reasoning-only.
    return 'empty-reasoning';
  }

  // Truncated: content populated but completion_tokens ≥ ceiling (or very
  // close to it) AND the final visible content ends mid-sentence.
  if (hasContent && ratio >= 0.98) {
    const endsCleanly = /[.!?]\s*$/.test(content.trim());
    if (!endsCleanly) return 'truncated';
  }

  // Converged: content populated + under 90% token-ceiling usage.
  if (hasContent && ratio <= 0.9) return 'converged';

  // Edge: content populated and between 0.9 < ratio < 0.98 — call it
  // converged with a caveat flag (truncation-adjacent but ended cleanly).
  if (hasContent) return 'converged';

  // Truly empty response (no content + no reasoning) — should never
  // happen on a well-formed LiteLLM response, but covered for safety.
  return 'empty-reasoning';
}

// ── Matrix driver ──────────────────────────────────────────────────────

function buildCells() {
  const cells = [];
  for (const thinking of THINKING_TOGGLES) {
    for (const maxTokens of MAX_TOKENS_VALUES) {
      for (const shape of PROMPT_SHAPES) {
        cells.push({ thinking, maxTokens, shape });
      }
    }
  }
  return cells;
}

async function runCell(cell, cellIdx) {
  const inference = args.dryRun
    ? syntheticCellResult(cell.shape.prompt, cell.maxTokens, cell.thinking, cellIdx)
    : args.backend === 'ollama'
      ? { error: 'ollama-backend not wired for matrix driver; use --backend litellm', latencyMs: 0 }
      : await callLitellm({
          url: args.litellmUrl,
          apiKey: args.litellmKey,
          model: args.model,
          prompt: cell.shape.prompt,
          maxTokens: cell.maxTokens,
          thinking: cell.thinking,
        });

  if (inference.error) {
    return { ...cell, outcome: 'error', inference };
  }
  const outcome = classifyOutcome({
    content: inference.content,
    reasoningContent: inference.reasoningContent,
    completionTokens: inference.completionTokens,
    maxTokens: cell.maxTokens,
  });
  return { ...cell, outcome, inference };
}

// ── CSV writer ─────────────────────────────────────────────────────────

function toCsv(rows) {
  const header = [
    'thinking', 'max_tokens', 'prompt_shape', 'outcome',
    'completion_tokens', 'wall_clock_ms', 'cost_usd',
    'content_preview_first_500',
  ];
  const esc = (s) => {
    const v = String(s ?? '');
    if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    const preview = (r.inference.content ?? '').replace(/\s+/g, ' ').slice(0, 500);
    lines.push([
      r.thinking ? 'on' : 'off',
      r.maxTokens,
      r.shape.id,
      r.outcome,
      r.inference.completionTokens ?? 0,
      r.inference.latencyMs ?? 0,
      (r.costUsd ?? 0).toFixed(6),
      preview,
    ].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Markdown writer ────────────────────────────────────────────────────

function renderMarkdown(rows, meta) {
  const md = [];
  md.push('# Qwen3.6 Thinking-Mode Stability Matrix');
  md.push('');
  md.push(`**Generated:** ${new Date().toISOString()}`);
  md.push(`**Model:** \`${meta.model}\``);
  md.push(`**Backend:** ${meta.backend}${meta.dryRun ? ' (DRY-RUN — synthetic responses)' : ''}`);
  md.push(`**Cells executed:** ${rows.length} of ${THINKING_TOGGLES.length * MAX_TOKENS_VALUES.length * PROMPT_SHAPES.length}`);
  md.push(`**Total spend:** $${meta.totalCostUsd.toFixed(6)}`);
  md.push('');
  md.push('## Outcome distribution');
  md.push('');
  const counts = { converged: 0, loop: 0, truncated: 0, 'empty-reasoning': 0, error: 0 };
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  md.push('| Outcome | Count | % |');
  md.push('|---|---|---|');
  for (const [k, v] of Object.entries(counts)) {
    md.push(`| \`${k}\` | ${v} | ${rows.length > 0 ? ((v / rows.length) * 100).toFixed(1) : '0.0'}% |`);
  }
  md.push('');

  md.push('## Stage-2-unsafe cells');
  md.push('');
  md.push('Cells classified as `loop`, `truncated`, or `error` must be avoided for Stage 2 LoCoMo full-run or mitigated with a larger `max_tokens` ceiling. `empty-reasoning` cells warn but may recover at a higher ceiling.');
  md.push('');
  const unsafe = rows.filter(r => r.outcome === 'loop' || r.outcome === 'truncated' || r.outcome === 'error');
  if (unsafe.length === 0) {
    md.push('*No unsafe cells — matrix shows universal convergence at these settings.*');
  } else {
    md.push('| Thinking | max_tokens | Shape | Outcome | Rationale |');
    md.push('|---|---|---|---|---|');
    for (const r of unsafe) {
      const rationale = r.outcome === 'loop'
        ? 'reasoning_content repeats phrase ≥3 times in final 1K chars; content empty'
        : r.outcome === 'truncated'
          ? `completion_tokens (${r.inference.completionTokens}) ≥ 98% of ceiling ${r.maxTokens}; ended mid-sentence`
          : r.outcome === 'error'
            ? `inference error: ${r.inference.error?.slice(0, 120) ?? 'unknown'}`
            : '';
      md.push(`| ${r.thinking ? 'on' : 'off'} | ${r.maxTokens} | ${r.shape.id} | ${r.outcome} | ${rationale} |`);
    }
  }
  md.push('');

  md.push('## Recommended Stage 2 configuration');
  md.push('');
  // Find the cheapest converged (thinking, max_tokens) combo that converges on ALL 5 shapes.
  const safeConfigs = [];
  for (const thinking of THINKING_TOGGLES) {
    for (const maxTokens of MAX_TOKENS_VALUES) {
      const relevantRows = rows.filter(r => r.thinking === thinking && r.maxTokens === maxTokens);
      if (relevantRows.length === PROMPT_SHAPES.length
          && relevantRows.every(r => r.outcome === 'converged')) {
        safeConfigs.push({ thinking, maxTokens, avgLatencyMs: relevantRows.reduce((s, r) => s + (r.inference.latencyMs ?? 0), 0) / relevantRows.length });
      }
    }
  }
  if (safeConfigs.length === 0) {
    md.push('**No fully-safe (thinking × max_tokens) configuration found.** Stage 2 kickoff is blocked pending either matrix re-run at larger token budgets or a scope decision (single-model + avoided prompt shapes).');
  } else {
    // Prefer smaller max_tokens for cost; between equal token configs, thinking-off for latency.
    safeConfigs.sort((a, b) => (a.maxTokens - b.maxTokens) || (a.thinking === b.thinking ? 0 : (a.thinking ? 1 : -1)));
    const rec = safeConfigs[0];
    md.push(`**Recommended:** thinking=\`${rec.thinking ? 'on' : 'off'}\`, max_tokens=\`${rec.maxTokens}\` (avg latency ${Math.round(rec.avgLatencyMs)}ms across all 5 shapes).`);
    md.push('');
    md.push('All safe configurations (ordered by max_tokens ascending):');
    md.push('');
    md.push('| thinking | max_tokens | avg latency ms |');
    md.push('|---|---|---|');
    for (const c of safeConfigs) md.push(`| ${c.thinking ? 'on' : 'off'} | ${c.maxTokens} | ${Math.round(c.avgLatencyMs)} |`);
  }
  md.push('');
  md.push('## Full matrix (all 40 cells)');
  md.push('');
  md.push('| thinking | max_tokens | shape | outcome | compl_tok | latency ms |');
  md.push('|---|---|---|---|---|---|');
  for (const r of rows) {
    md.push(`| ${r.thinking ? 'on' : 'off'} | ${r.maxTokens} | ${r.shape.id} | ${r.outcome} | ${r.inference.completionTokens ?? 0} | ${r.inference.latencyMs ?? 0} |`);
  }
  md.push('');
  md.push('---');
  md.push('');
  md.push('*End of stability matrix report. CSV source at `' + meta.csvPath + '` for scripting.*');
  return md.join('\n') + '\n';
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const cells = buildCells();
  const executeCount = Math.min(cells.length, args.cells);
  console.log(
    `[qwen-matrix] ${args.dryRun ? 'DRY-RUN' : 'LIVE'} — model=${args.model} `
    + `cells=${executeCount}/${cells.length}`,
  );

  const rows = [];
  let totalCostUsd = 0;
  for (let i = 0; i < executeCount; i++) {
    const cell = cells[i];
    process.stdout.write(
      `  [${String(i + 1).padStart(2, ' ')}/${executeCount}] `
      + `${cell.thinking ? 'on ' : 'off'} ${String(cell.maxTokens).padStart(5, ' ')} `
      + `${cell.shape.id.padEnd(26, ' ')} ... `,
    );
    const r = await runCell(cell, i);
    // Rough costing — placeholder zero for dry-run. Real Qwen3.6-35B-A3B
    // via OpenRouter ~ $0.20 input / $0.80 output per MTok.
    if (!args.dryRun && r.inference && !r.inference.error) {
      const ct = r.inference.completionTokens ?? 0;
      const pt = r.inference.promptTokens ?? 0;
      r.costUsd = (pt / 1e6) * 0.2 + (ct / 1e6) * 0.8;
      totalCostUsd += r.costUsd;
    } else {
      r.costUsd = 0;
    }
    rows.push(r);
    console.log(`${r.outcome} (${r.inference.completionTokens ?? 0} tok, ${r.inference.latencyMs ?? 0}ms)`);
  }

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(args.outDirData, `qwen-stability-matrix-${iso}.csv`);
  const mdPath  = path.join(args.outDirReports, `qwen-thinking-stability-${iso}.md`);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(csvPath, toCsv(rows), 'utf-8');
  fs.writeFileSync(mdPath, renderMarkdown(rows, { model: args.model, backend: args.backend, dryRun: args.dryRun, totalCostUsd, csvPath }), 'utf-8');

  const convergedCount = rows.filter(r => r.outcome === 'converged').length;
  console.log('');
  console.log(
    `[qwen-matrix:summary] cells=${rows.length} converged=${convergedCount} `
    + `spend=$${totalCostUsd.toFixed(6)} csv=${csvPath} md=${mdPath}`,
  );
  process.exit(convergedCount > 0 ? 0 : 1);
}

main().catch(err => {
  console.error('[qwen-matrix:error]', err?.message ?? err);
  process.exit(2);
});
