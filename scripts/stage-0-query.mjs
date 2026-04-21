#!/usr/bin/env node
// Stage 0 Dogfood — single-query runner (full-stack cell equivalent).
//
// Brief: PM-Waggle-OS/briefs/2026-04-20-cc-stage-0-dogfood-tasks.md Task 3
// Spec:  strategy/2026-04-20-preflight-gate-spec.md §2 (Stage 0)
//
// Minimal-invasive path: reuses the hive-mind CLI for retrieval and calls
// LiteLLM directly for the Qwen inference layer. Emits a single JSON
// artifact per question that downstream Stage 0 report assembly consumes.
//
// Usage:
//   node scripts/stage-0-query.mjs \
//     --question "<verbatim>" \
//     --data-dir "D:/dogfood-exports/2026-04-20/kg-storage" \
//     --model qwen3.6-35b-a3b \
//     --out preflight-results/stage-0-query-1.json \
//     [--limit 15] [--litellm-url http://localhost:4000] [--dry-run]
//
// Environment: LITELLM_BASE_URL, LITELLM_MASTER_KEY — same keys Waggle core
// uses. Embedding provider is configured on the hive-mind side via
// HIVE_MIND_EMBEDDING_PROVIDER=inprocess (we pass it through).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ── Arg parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    question: undefined,
    dataDir: undefined,
    model: 'qwen3.6-35b-a3b',
    out: undefined,
    limit: 15,
    litellmUrl: process.env.LITELLM_BASE_URL ?? 'http://localhost:4000',
    litellmApiKey: process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev',
    // Stage 0 fell back from LiteLLM/DashScope to Ollama in the 2026-04-21
    // run because DASHSCOPE_API_KEY was not provisioned in the LiteLLM
    // container. The backend selector keeps both code paths live so
    // future runs (with a provisioned DashScope key) can flip back with
    // one flag.
    backend: 'litellm',
    ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--question':     out.question = next; i++; break;
      case '--data-dir':     out.dataDir = next; i++; break;
      case '--model':        out.model = next; i++; break;
      case '--out':          out.out = next; i++; break;
      case '--limit':        out.limit = Number(next); i++; break;
      case '--litellm-url':  out.litellmUrl = next; i++; break;
      case '--litellm-key':  out.litellmApiKey = next; i++; break;
      case '--backend':      out.backend = next; i++; break;
      case '--ollama-url':   out.ollamaUrl = next; i++; break;
      case '--dry-run':      out.dryRun = true; break;
    }
  }
  if (!out.question) throw new Error('--question is required');
  if (!out.dataDir) throw new Error('--data-dir is required');
  if (!out.out) throw new Error('--out is required');
  return out;
}

// ── Retrieval via hive-mind CLI ────────────────────────────────────────

function recallContext(question, dataDir, limit) {
  const cliPath = path.resolve(
    'D:/Projects/hive-mind/packages/cli/dist/index.js',
  );
  const env = {
    ...process.env,
    HIVE_MIND_DATA_DIR: dataDir,
    HIVE_MIND_EMBEDDING_PROVIDER:
      process.env.HIVE_MIND_EMBEDDING_PROVIDER ?? 'inprocess',
  };
  // Strip FTS5-problematic characters from the query before handing it to
  // hive-mind's recall-context. hive-mind's keywordSearch treats a query
  // containing `"` as "already quoted by caller" and passes it raw to
  // FTS5; embedded literal quotes in a natural-language question trip the
  // FTS5 parser and the fallback silently returns zero matches, which
  // then collapses the full-stack retrieval to 0 hits. Stripping quotes +
  // a couple of other FTS5 operators here keeps the Stage 0 run moving;
  // fixing the sanitizer upstream in hive-mind is out of scope per the
  // brief (no adapter/search repair in Stage 0 scope).
  const searchQuery = question
    .replace(/["']/g, ' ')
    .replace(/[:*()]/g, ' ')
    .replace(/\s+-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const res = spawnSync(
    'node',
    [cliPath, 'recall-context', searchQuery, '--limit', String(limit), '--json'],
    { env, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`hive-mind recall-context exited with ${res.status}: ${res.stderr}`);
  }
  // Logger writes probe lines as `[hive-mind:...]` to stdout — filter to JSON.
  const jsonOnly = res.stdout
    .split('\n')
    .filter(l => !l.startsWith('[hive-mind'))
    .join('\n');
  return JSON.parse(jsonOnly);
}

// ── Prompt assembly (mirrors full-stack cell) ──────────────────────────

// Same system prompt as benchmarks/harness/src/cells.ts SYSTEM_EVOLVED,
// adapted for Stage 0's longer-form Q&A (Marko's questions demand dates +
// session titles + multi-fact synthesis, not single-token answers).
const SYSTEM_EVOLVED_STAGE0 = [
  'You are answering a question about the user’s personal history using the',
  'memories provided below. Cite specific dates, session titles, and facts',
  'directly from the memories — do not generalize.',
  'If the memories do not contain the answer, say so explicitly; do NOT',
  'fabricate dates, session IDs, entity names, or excerpts that are not in',
  'the memories.',
].join(' ');

function buildUserPrompt(question, hits) {
  const memoryBlocks = hits.map((h, i) => {
    const src = h.from ?? 'personal';
    const created = h.created_at ?? '';
    const content = (h.content ?? '').replace(/\s+/g, ' ').slice(0, 1200);
    return `- [memory:${src}:${h.id}${created ? ` @ ${created}` : ''}] ${content}`;
  });
  return [
    '# Recalled Memories',
    memoryBlocks.join('\n'),
    '',
    `Question: ${question}`,
  ].join('\n');
}

// ── LiteLLM call ──────────────────────────────────────────────────────

async function callLitellm({ url, apiKey, model, systemPrompt, userPrompt }) {
  const started = Date.now();
  const res = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // Thinking-mode Qwen3.6 burns reasoning tokens against this cap; we
      // need enough room for the reasoning pass PLUS the visible answer.
      // 8000 observed to be the minimum that clears the reasoning pass on
      // the Stage-0 long-form Serbian questions without truncating the
      // final answer. Lower caps left message.content empty and only
      // message.reasoning_content populated.
      max_tokens: 8000,
      temperature: 0.0,
    }),
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LiteLLM ${res.status}: ${body.slice(0, 500)}`);
  }
  const body = await res.json();
  const choice = body.choices?.[0]?.message ?? {};
  // Some LiteLLM routes (notably qwen3.6-…-via-openrouter in thinking
  // mode) split the stream into `content` (final answer) and
  // `reasoning_content` (chain-of-thought). When max_tokens is reached
  // mid-reasoning, `content` comes back empty even though the provider
  // charged for the reasoning tokens. Fall back to reasoning_content so
  // the caller isn't left with an empty model answer in that degenerate
  // case, prefixed with a marker so downstream analysis can tell the
  // difference.
  const primary = typeof choice.content === 'string' ? choice.content : '';
  const reasoning = typeof choice.reasoning_content === 'string' ? choice.reasoning_content : '';
  let text = primary;
  if (!text && reasoning) {
    text = `[reasoning-only — content was empty; reasoning_content surfaced as fallback]\n\n${reasoning}`;
  }
  const usage = body.usage ?? {};
  return {
    text,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    latencyMs,
  };
}

// Ollama native `/api/chat` — used as the Stage-0 fallback when LiteLLM
// providers aren't provisioned with keys. Returns the same shape as
// callLitellm for interchangeable use downstream.
async function callOllama({ url, model, systemPrompt, userPrompt }) {
  const started = Date.now();
  const res = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: 0.0,
        num_predict: 1200,
      },
    }),
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 500)}`);
  }
  const body = await res.json();
  const text = body.message?.content ?? '';
  // Ollama reports `prompt_eval_count` / `eval_count` as token counts.
  return {
    text,
    promptTokens: body.prompt_eval_count ?? 0,
    completionTokens: body.eval_count ?? 0,
    latencyMs,
  };
}

// Pricing per 1M tokens by {backend, model} key. Qwen3.6-35B-A3B priced
// per benchmarks/harness/config/models.json. Local Ollama runs cost $0
// out-of-pocket (CAPEX amortization tracked separately — Stage 0 is too
// small to move the amortized-cost needle).
const PRICING = {
  'litellm:qwen3.6-35b-a3b': { input: 0.2, output: 0.8 },
  // qwen3.6-35b-a3b-via-openrouter route cost observed 2026-04-21
  // during Sprint 9 Task 0 rerun: ~$0.0003 per query at ~190 tokens
  // output, which back-solves to roughly the OpenRouter upstream
  // provider rate (AtlasCloud). Keeping same $/M-token coefficients as
  // the DashScope route — the difference is small enough to stay
  // inside the budget alarm either way.
  'litellm:qwen3.6-35b-a3b-via-openrouter': { input: 0.3, output: 1.8 },
  'ollama:gemma4:31b':       { input: 0.0, output: 0.0 },
};

function computeCost(backend, model, promptTokens, completionTokens) {
  const rate = PRICING[`${backend}:${model}`] ?? { input: 0, output: 0 };
  return (
    (promptTokens / 1_000_000) * rate.input +
    (completionTokens / 1_000_000) * rate.output
  );
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const t0 = Date.now();
  const retrievalResult = recallContext(args.question, args.dataDir, args.limit);
  const retrievalMs = Date.now() - t0;
  const hits = retrievalResult.hits ?? [];

  const userPrompt = buildUserPrompt(args.question, hits);

  let modelAnswer;
  let inferenceMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let costUsd = 0;

  if (args.dryRun) {
    modelAnswer = `DRY_RUN: echoing question — ${args.question}`;
    inferenceMs = 0;
  } else {
    const called = args.backend === 'ollama'
      ? await callOllama({
          url: args.ollamaUrl,
          model: args.model,
          systemPrompt: SYSTEM_EVOLVED_STAGE0,
          userPrompt,
        })
      : await callLitellm({
          url: args.litellmUrl,
          apiKey: args.litellmApiKey,
          model: args.model,
          systemPrompt: SYSTEM_EVOLVED_STAGE0,
          userPrompt,
        });
    modelAnswer = called.text;
    inferenceMs = called.latencyMs;
    promptTokens = called.promptTokens;
    completionTokens = called.completionTokens;
    costUsd = computeCost(args.backend, args.model, promptTokens, completionTokens);
  }

  const result = {
    stage: 'stage-0-dogfood',
    timestamp: new Date().toISOString(),
    question: args.question,
    model: args.model,
    backend: args.backend,
    dataDir: args.dataDir,
    retrieval: {
      limit: args.limit,
      hitCount: hits.length,
      durationMs: retrievalMs,
      hits: hits.map(h => ({
        id: h.id,
        source: h.source ?? 'personal',
        from: h.from ?? 'personal',
        importance: h.importance ?? null,
        created_at: h.created_at ?? null,
        score: h.score ?? null,
        // 500-char preview of each retrieved frame — intentionally NOT the
        // full frame content. Stage 0 report will render these (excerpts are
        // authorized per brief §Privacy guardrails where Marko's question
        // names the content) but the full frame stays on local disk.
        preview: (h.content ?? '').replace(/\s+/g, ' ').slice(0, 500),
      })),
    },
    prompt: {
      systemPromptLen: SYSTEM_EVOLVED_STAGE0.length,
      userPromptLen: userPrompt.length,
    },
    inference: {
      durationMs: inferenceMs,
      promptTokens,
      completionTokens,
      costUsd,
    },
    modelAnswer,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  // Compact stdout so pipelines can `grep '^[stage-0:summary]'`.
  console.log(
    `[stage-0:summary] hits=${hits.length} retrieval_ms=${retrievalMs} ` +
    `inference_ms=${inferenceMs} prompt_tokens=${promptTokens} ` +
    `completion_tokens=${completionTokens} cost_usd=${costUsd.toFixed(6)} ` +
    `out=${args.out}`,
  );
}

main().catch(err => {
  console.error('[stage-0:error]', err?.message ?? err);
  process.exit(1);
});
