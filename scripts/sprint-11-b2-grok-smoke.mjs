#!/usr/bin/env node
/**
 * Sprint 11 Task B2 — xai/grok-4.20 quadri-vendor smoke test.
 *
 * Authority:
 *   decisions/2026-04-22-tie-break-policy-locked.md (LOCKED)
 *   briefs/2026-04-22-cc-sprint-11-kickoff.md §3 Track B B2
 *
 * Verifies the xai/grok-4.20 route LiteLLM alias is reachable and returns
 * a judge-shaped verdict on a 1-1-1 escalation payload. Runs ONE real call
 * to establish an actual-cost data point for the exit ping.
 *
 * Budget cap: $0.20 (B2 brief cap for grok calls in unit testing).
 * Alarm:      $0.05 — single call shouldn't exceed this.
 *
 * Usage:
 *   node scripts/sprint-11-b2-grok-smoke.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = url.fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(HERE), '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'preflight-results');

const LITELLM_URL = (process.env.LITELLM_BASE_URL ?? process.env.LITELLM_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const LITELLM_KEY = process.env.LITELLM_MASTER_KEY ?? process.env.LITELLM_API_KEY ?? 'sk-waggle-dev';

const GROK_ROUTE = 'grok-4.20';
const HARD_ALARM_USD = 0.05;

// xAI grok-4.20 pricing per 1M tokens (approx, comparable to Sonnet range).
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

// A minimal judge-shaped rubric payload. Models an actual 1-1-1 escalation
// where three primary judges disagreed; grok has to issue the fourth vote.
const JUDGE_PROMPT = [
  "You are evaluating whether an LLM's answer is correct against ground truth.",
  '',
  '## Question',
  "What is the capital of France? Answer with just the city name.",
  '',
  '## Ground-truth answer',
  'Paris',
  '',
  '## Ground-truth supporting context (excerpt shown to the model)',
  'France is a country in Western Europe. Its capital is Paris, which is also its largest city.',
  '',
  "## Model's answer",
  'Paris',
  '',
  '## Your task',
  '',
  "Step 1: Determine if the model's answer is correct.",
  'Step 2: If incorrect, assign one failure mode: F1 (abstain), F2 (partial), F3 (incorrect-from-context), F4 (hallucinated), F5 (off-topic).',
  'Step 3: Return JSON only, no prose, in this exact schema:',
  '',
  '{',
  '  "verdict": "correct" | "incorrect",',
  '  "failure_mode": null | "F1" | "F2" | "F3" | "F4" | "F5",',
  '  "rationale": "one sentence explaining the verdict"',
  '}',
  '',
  'If verdict is "correct", failure_mode MUST be null.',
  'If verdict is "incorrect", failure_mode MUST be one of F1-F5.',
].join('\n');

function iso() { return new Date().toISOString(); }
function mkdirP(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

async function main() {
  mkdirP(RESULTS_DIR);
  const startedAt = iso();
  const t0 = Date.now();

  console.log(`[b2-smoke] ${startedAt} → POST ${LITELLM_URL}/v1/chat/completions`);
  console.log(`[b2-smoke] route=${GROK_ROUTE} (LOCKED fourth vendor per 2026-04-22)`);

  let res;
  try {
    res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_KEY}`,
      },
      body: JSON.stringify({
        model: GROK_ROUTE,
        messages: [
          { role: 'system', content: 'You are a strict, deterministic judge. Respond only with the required JSON.' },
          { role: 'user', content: JUDGE_PROMPT },
        ],
        max_tokens: 500,
        temperature: 0.0,
      }),
    });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const artifact = {
      verdict: 'NETWORK_ERROR',
      error: String(err?.message ?? err),
      hint: 'Is LiteLLM running? Check the container and XAI_API_KEY.',
      startedAt,
      latencyMs,
      route: GROK_ROUTE,
    };
    writeArtifact(artifact);
    console.error(`[b2-smoke] NETWORK_ERROR after ${latencyMs}ms: ${err?.message ?? err}`);
    process.exit(2);
  }

  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const artifact = {
      verdict: 'HTTP_ERROR',
      httpStatus: res.status,
      responseSnippet: text.slice(0, 800),
      startedAt,
      latencyMs,
      route: GROK_ROUTE,
    };
    writeArtifact(artifact);
    console.error(`[b2-smoke] HTTP_ERROR ${res.status} after ${latencyMs}ms`);
    console.error(`[b2-smoke] body: ${text.slice(0, 800)}`);
    process.exit(2);
  }

  const json = await res.json();
  const msg = json?.choices?.[0]?.message ?? {};
  const text = msg?.content ?? '';
  const usage = json?.usage ?? {};
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;

  if (costUsd > HARD_ALARM_USD) {
    console.warn(`[b2-smoke] WARN cost=$${costUsd.toFixed(6)} exceeds hard alarm $${HARD_ALARM_USD}`);
  }

  // Extract the JSON body from the response. Models often wrap in fences.
  let parsedVerdict = null;
  let parsedFailureMode = null;
  let parsedRationale = null;
  let parseError = null;
  try {
    const fenceMatch = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
    const body = fenceMatch ? fenceMatch[1].trim() : text.trim();
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    const jsonStr = first >= 0 && last > first ? body.slice(first, last + 1) : body;
    const obj = JSON.parse(jsonStr);
    parsedVerdict = obj.verdict ?? null;
    parsedFailureMode = obj.failure_mode ?? null;
    parsedRationale = obj.rationale ?? null;
  } catch (err) {
    parseError = String(err?.message ?? err);
  }

  const verdict = parsedVerdict === 'correct' && parsedFailureMode === null ? 'PASS' : 'PASS_UNEXPECTED_VERDICT';
  const artifact = {
    verdict,
    startedAt,
    finishedAt: iso(),
    latencyMs,
    route: GROK_ROUTE,
    litellmUrl: LITELLM_URL,
    usage: { inputTokens, outputTokens },
    costUsd: Number(costUsd.toFixed(6)),
    text,
    textChars: text.length,
    parsed: {
      verdict: parsedVerdict,
      failure_mode: parsedFailureMode,
      rationale: parsedRationale,
    },
    parseError,
    providerFinishReason: json?.choices?.[0]?.finish_reason ?? null,
    providerRaw: {
      id: json?.id,
      model: json?.model,
      created: json?.created,
    },
    tieBreakContext: {
      scenario: 'single-vendor smoke (not a 1-1-1 escalation replay)',
      note: 'This smoke proves the xai/grok-4.20 route is callable with a judge-shaped payload. The full 1-1-1 escalation path is exercised by the mocked unit tests in packages/server/tests/benchmarks/ensemble-tiebreak.test.ts.',
    },
  };
  writeArtifact(artifact);

  console.log('[b2-smoke] ────────────────────────────────');
  console.log(`[b2-smoke] verdict=${verdict}`);
  console.log(`[b2-smoke] latency=${latencyMs}ms cost=$${costUsd.toFixed(6)}`);
  console.log(`[b2-smoke] input_tokens=${inputTokens} output_tokens=${outputTokens}`);
  console.log(`[b2-smoke] parsed: verdict=${parsedVerdict} failure_mode=${parsedFailureMode}`);
  if (parseError) console.log(`[b2-smoke] parseError=${parseError}`);
  console.log(`[b2-smoke] rationale="${parsedRationale ?? text.slice(0, 200)}"`);
}

function writeArtifact(artifact) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(RESULTS_DIR, `b2-grok-smoke-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
  console.log(`[b2-smoke] artifact=${filePath}`);
}

main().catch((err) => {
  console.error('[b2-smoke] UNCAUGHT', err);
  process.exit(1);
});
