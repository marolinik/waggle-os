#!/usr/bin/env node
/**
 * Sprint 11 Task B1 — Stage 2 config apply smoke test.
 *
 * Authority:
 *   decisions/2026-04-22-stage-2-primary-config-locked.md (LOCKED)
 *   briefs/2026-04-22-cc-sprint-11-kickoff.md §3 Track B B1
 *
 * Verifies the LOCKED Stage 2 config is wired end-to-end:
 *   - Route:       qwen3.6-35b-a3b-via-openrouter
 *   - thinking:    on  (reasoning: { enabled: true })
 *   - max_tokens:  64000
 *
 * Makes ONE real LiteLLM call via the local proxy. Logs cost, latency, and
 * reasoning_content size. Writes a JSON artifact for the B1 exit ping.
 *
 * Usage:
 *   node scripts/sprint-11-b1-smoke.mjs
 *
 * Env requirements:
 *   LITELLM_BASE_URL   (default http://localhost:4000)
 *   LITELLM_MASTER_KEY (default sk-waggle-dev)
 *
 * Budget: one call at Stage 2 pricing (~$0.015-0.025 per call). Hard alarm
 * configured at $0.10 — the brief caps B1 at $0.05 total.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = url.fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(HERE), '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'preflight-results');

const LITELLM_URL = (process.env.LITELLM_BASE_URL ?? process.env.LITELLM_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const LITELLM_KEY = process.env.LITELLM_MASTER_KEY ?? process.env.LITELLM_API_KEY ?? 'sk-waggle-dev';

const STAGE_2_ROUTE = 'qwen3.6-35b-a3b-via-openrouter';
const STAGE_2_MAX_TOKENS = 64000;
const HARD_ALARM_USD = 0.10;

// Pricing (per 1M tokens) — matches harness models.json `qwen3.6-35b-a3b`.
const PRICE_INPUT_PER_M = 0.20;
const PRICE_OUTPUT_PER_M = 0.80;

// Simple, predictable prompt. Short so we're not wasting cost on a probe.
const SYSTEM_PROMPT = 'You are a helpful assistant. Answer concisely.';
const USER_PROMPT = 'What is 2 + 2? Answer with just the number.';

function iso() {
  return new Date().toISOString();
}

function mkdirP(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  mkdirP(RESULTS_DIR);
  const startedAt = iso();
  const t0 = Date.now();

  const body = {
    model: STAGE_2_ROUTE,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
    ],
    max_tokens: STAGE_2_MAX_TOKENS,
    temperature: 0.0,
    reasoning: { enabled: true }, // OpenRouter unified reasoning API.
  };

  console.log(`[b1-smoke] ${startedAt} → POST ${LITELLM_URL}/v1/chat/completions`);
  console.log(`[b1-smoke] route=${STAGE_2_ROUTE} thinking=on max_tokens=${STAGE_2_MAX_TOKENS}`);

  let res;
  try {
    res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const artifact = {
      verdict: 'NETWORK_ERROR',
      error: String(err?.message ?? err),
      hint: 'Is LiteLLM running? Check `docker ps` for the LiteLLM container or start it.',
      startedAt,
      latencyMs,
      route: STAGE_2_ROUTE,
      litellmUrl: LITELLM_URL,
    };
    writeArtifact(artifact);
    console.error(`[b1-smoke] NETWORK_ERROR after ${latencyMs}ms: ${err?.message ?? err}`);
    process.exit(2);
  }

  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const artifact = {
      verdict: 'HTTP_ERROR',
      httpStatus: res.status,
      responseSnippet: text.slice(0, 500),
      startedAt,
      latencyMs,
      route: STAGE_2_ROUTE,
      litellmUrl: LITELLM_URL,
    };
    writeArtifact(artifact);
    console.error(`[b1-smoke] HTTP_ERROR ${res.status} after ${latencyMs}ms`);
    console.error(`[b1-smoke] body: ${text.slice(0, 500)}`);
    process.exit(2);
  }

  const json = await res.json();
  const msg = json?.choices?.[0]?.message ?? {};
  const text = msg?.content ?? '';
  const reasoning = msg?.reasoning ?? msg?.reasoning_content;
  const usage = json?.usage ?? {};
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;

  const reasoningChars = reasoning ? reasoning.length : 0;
  const reasoningPresent = reasoningChars > 0;

  if (costUsd > HARD_ALARM_USD) {
    console.warn(`[b1-smoke] WARN cost=$${costUsd.toFixed(6)} exceeds hard alarm $${HARD_ALARM_USD}`);
  }

  const verdict = reasoningPresent ? 'PASS' : 'PASS_NO_REASONING';
  const artifact = {
    verdict,
    startedAt,
    finishedAt: iso(),
    latencyMs,
    route: STAGE_2_ROUTE,
    litellmUrl: LITELLM_URL,
    requestConfig: {
      thinking: true,
      max_tokens: STAGE_2_MAX_TOKENS,
      temperature: 0.0,
      reasoning: { enabled: true },
    },
    usage: { inputTokens, outputTokens },
    costUsd: Number(costUsd.toFixed(6)),
    text,
    textChars: text.length,
    reasoningPresent,
    reasoningChars,
    reasoningPreview: reasoning ? reasoning.slice(0, 300) : null,
    providerFinishReason: json?.choices?.[0]?.finish_reason ?? null,
    providerRaw: {
      id: json?.id,
      model: json?.model,
      created: json?.created,
    },
  };
  writeArtifact(artifact);

  console.log('[b1-smoke] ────────────────────────────────');
  console.log(`[b1-smoke] verdict=${verdict}`);
  console.log(`[b1-smoke] latency=${latencyMs}ms cost=$${costUsd.toFixed(6)}`);
  console.log(`[b1-smoke] text_chars=${text.length} reasoning_present=${reasoningPresent} reasoning_chars=${reasoningChars}`);
  console.log(`[b1-smoke] input_tokens=${inputTokens} output_tokens=${outputTokens}`);
  console.log(`[b1-smoke] text="${text.trim().slice(0, 100)}"`);
  if (reasoning) {
    console.log(`[b1-smoke] reasoning_preview="${reasoning.slice(0, 150).replace(/\n/g, ' ')}..."`);
  } else {
    console.log('[b1-smoke] (no reasoning_content in response — check provider reasoning-API support on this route)');
  }
}

function writeArtifact(artifact) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(RESULTS_DIR, `b1-smoke-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
  console.log(`[b1-smoke] artifact=${filePath}`);
}

main().catch((err) => {
  console.error('[b1-smoke] UNCAUGHT', err);
  process.exit(1);
});
