#!/usr/bin/env node
// Sprint 10 Task 2.1 — Vendor availability probe.
//
// Three-vendor ensemble LOCKED per brief §2:
//   1. Anthropic Opus 4.7 (already production — Sprint 9 baseline)
//   2. OpenAI GPT-5.4 (config wired for v5 eval — provisioning TBD)
//   3. Google Gemini 3.1 Pro (config wired for v5 eval — provisioning TBD)
//
// This probe sends a minimal "respond with OK" prompt to each vendor
// through LiteLLM and reports per-vendor status. If any vendor is not
// provisionable (404 model_not_found, 401 auth, 402 billing, 429 rate
// limit, or hard timeout), it surfaces as a Day-1 blocker so Marko can
// resolve before Task 2.2 Fleiss' kappa baseline depends on the full
// ensemble path.
//
// Budget: ~3 × 20-token completions ≈ $0.001 total. Well under $5 Task
// 2.1 ceiling.
//
// Usage:
//   node scripts/vendor-availability-probe.mjs
//     [--litellm-url http://localhost:4000]
//     [--out preflight-results/vendor-availability-<ISO>.json]
//
// Exits:
//   0 — all three vendors returned HTTP 200 with non-empty completions
//   1 — at least one vendor failed; details in stdout + JSON artifact

import fs from 'node:fs';
import path from 'node:path';

const VENDORS = [
  { id: 'anthropic', model: 'claude-opus-4-7', label: 'Anthropic Opus 4.7' },
  { id: 'openai',    model: 'gpt-5.4',        label: 'OpenAI GPT-5.4' },
  { id: 'google',    model: 'gemini-3.1-pro', label: 'Google Gemini 3.1 Pro' },
];

const args = (() => {
  const out = {
    litellmUrl: process.env.LITELLM_BASE_URL ?? 'http://localhost:4000',
    litellmKey: process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev',
    out: undefined,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--litellm-url') { out.litellmUrl = next; i++; }
    else if (flag === '--litellm-key') { out.litellmKey = next; i++; }
    else if (flag === '--out') { out.out = next; i++; }
  }
  if (!out.out) {
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    out.out = `preflight-results/vendor-availability-${iso}.json`;
  }
  return out;
})();

async function probeVendor(vendor) {
  const url = `${args.litellmUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const started = Date.now();
  // Opus 4.7 / GPT-5 / o3 / o4 families reject `temperature` with HTTP
  // 400. Match the heuristic the judge-client already uses so this
  // probe doesn't flag them falsely.
  const rejectsTemperature = /opus-4-7|gpt-5|o3|o4/i.test(vendor.model);
  const reqBody = {
    model: vendor.model,
    messages: [{ role: 'user', content: 'Respond with the single word OK.' }],
    max_tokens: 16,
  };
  if (!rejectsTemperature) reqBody.temperature = 0.0;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.litellmKey}`,
      },
      body: JSON.stringify(reqBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...vendor,
      status: 'fetch_error',
      http: null,
      latencyMs: Date.now() - started,
      error: msg,
      completionText: null,
      promptTokens: 0,
      completionTokens: 0,
    };
  }
  const latencyMs = Date.now() - started;
  const bodyText = await res.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { body = null; }

  if (!res.ok) {
    const lc = bodyText.toLowerCase();
    let statusTag;
    if (res.status === 401 || /unauthori[sz]ed/.test(lc)) statusTag = 'auth_error';
    else if (res.status === 402 || /billing|payment|quota/.test(lc)) statusTag = 'billing_error';
    else if (res.status === 404 || /model[_ -]?not[_ -]?found|unknown model/.test(lc)) statusTag = 'model_not_found';
    else if (res.status === 429) statusTag = 'rate_limited';
    else statusTag = 'http_error';
    return {
      ...vendor,
      status: statusTag,
      http: res.status,
      latencyMs,
      error: bodyText.slice(0, 400),
      completionText: null,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    return {
      ...vendor,
      status: 'empty_completion',
      http: res.status,
      latencyMs,
      error: `empty content — body_head=${bodyText.slice(0, 200)}`,
      completionText: null,
      promptTokens: body?.usage?.prompt_tokens ?? 0,
      completionTokens: body?.usage?.completion_tokens ?? 0,
    };
  }

  return {
    ...vendor,
    status: 'ok',
    http: res.status,
    latencyMs,
    error: null,
    completionText: content.trim().slice(0, 120),
    promptTokens: body?.usage?.prompt_tokens ?? 0,
    completionTokens: body?.usage?.completion_tokens ?? 0,
  };
}

async function main() {
  console.log(`[vendor-probe] starting — litellm=${args.litellmUrl} vendors=${VENDORS.length}`);
  const results = [];
  for (const vendor of VENDORS) {
    process.stdout.write(`  ${vendor.id.padEnd(10, ' ')} ${vendor.model.padEnd(22, ' ')} ... `);
    const r = await probeVendor(vendor);
    results.push(r);
    if (r.status === 'ok') {
      console.log(`PASS (http=${r.http} latency=${r.latencyMs}ms completion=${JSON.stringify(r.completionText)})`);
    } else {
      console.log(`FAIL (${r.status}${r.http ? ` http=${r.http}` : ''} latency=${r.latencyMs}ms)`);
      if (r.error) console.log(`    error: ${r.error.slice(0, 280)}`);
    }
  }

  const allOk = results.every(r => r.status === 'ok');
  const payload = {
    generatedAt: new Date().toISOString(),
    litellmUrl: args.litellmUrl,
    allAvailable: allOk,
    vendors: results,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(payload, null, 2) + '\n', 'utf-8');

  console.log('');
  console.log(
    `[vendor-probe:summary] all_available=${allOk} ` +
    `passes=${results.filter(r => r.status === 'ok').length}/${results.length} ` +
    `out=${args.out}`,
  );
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error('[vendor-probe:error]', err?.message ?? err);
  process.exit(2);
});
