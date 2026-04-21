#!/usr/bin/env node
// Sprint 10 Task 1.2 — Sonnet route repair smoke test.
//
// One-shot HTTP probe that verifies the `claude-sonnet-4-6` LiteLLM
// route returns 200 (not 404 / model_not_found) on the repaired target.
// This is the minimal acceptance check per brief §1.2 — the full
// functional regression is Task 1.3 (judge calibration re-run).
//
// Exits:
//   0 — route returns HTTP 200 with a valid chat completion
//   1 — route returned a non-2xx status OR no completion content
//   2 — fetch failed (network / DNS / LiteLLM proxy down)
//
// Usage:
//   node scripts/smoke-sonnet-route.mjs [--model claude-sonnet-4-6]
//                                       [--litellm-url http://localhost:4000]
//
// Environment:
//   LITELLM_BASE_URL, LITELLM_MASTER_KEY — same as all Waggle inference paths.
//   ANTHROPIC_API_KEY must be provisioned in the LiteLLM container env for
//   the probe to actually reach Anthropic.

const args = (() => {
  const out = {
    model: 'claude-sonnet-4-6',
    litellmUrl: process.env.LITELLM_BASE_URL ?? 'http://localhost:4000',
    litellmKey: process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev',
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--model') { out.model = next; i++; }
    else if (flag === '--litellm-url') { out.litellmUrl = next; i++; }
    else if (flag === '--litellm-key') { out.litellmKey = next; i++; }
  }
  return out;
})();

async function main() {
  const url = `${args.litellmUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.litellmKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: 'user', content: 'Respond with the single word OK.' },
        ],
        max_tokens: 16,
        temperature: 0.0,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[smoke-sonnet:FAIL] fetch error → ${msg}`);
    process.exit(2);
  }
  const latencyMs = Date.now() - started;
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = null;
  }

  if (!res.ok) {
    const looksLikeModelNotFound =
      res.status === 404
      || /model[_ -]?not[_ -]?found/i.test(bodyText)
      || /unknown model/i.test(bodyText);
    const tag = looksLikeModelNotFound ? 'MODEL_NOT_FOUND' : 'HTTP_ERROR';
    console.error(
      `[smoke-sonnet:FAIL] ${tag} — http=${res.status} model=${args.model} `
      + `latency_ms=${latencyMs} body_head=${bodyText.slice(0, 240)}`,
    );
    process.exit(1);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    console.error(
      `[smoke-sonnet:FAIL] empty_completion — http=${res.status} model=${args.model} `
      + `latency_ms=${latencyMs} body_head=${bodyText.slice(0, 240)}`,
    );
    process.exit(1);
  }

  const usage = body?.usage ?? {};
  console.log(
    `[smoke-sonnet:PASS] http=${res.status} model=${args.model} `
    + `latency_ms=${latencyMs} prompt_tokens=${usage.prompt_tokens ?? 0} `
    + `completion_tokens=${usage.completion_tokens ?? 0} content=${JSON.stringify(content.slice(0, 80))}`,
  );
  process.exit(0);
}

main();
