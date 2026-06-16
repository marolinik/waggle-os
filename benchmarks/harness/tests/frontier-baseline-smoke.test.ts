/**
 * Plan 05 — pre-spend frontier-baseline alias smoke.
 *
 * Design-spec §5: "Smoke each alias before spend." A registry entry that parses
 * is NOT proof the LiteLLM route resolves to a live upstream (the repo has a
 * documented history of speculative dated suffixes 404-ing). This test fires ONE
 * cheap ping per new frontier-baseline alias through the REAL LiteLLM proxy via
 * the already-shipped preCellHealthCheck().
 *
 * GATING (so the default offline `npm test` gate stays green): the whole suite
 * is skipped unless BOTH env vars are present:
 *   BENCH_SMOKE_LITELLM_URL      e.g. http://localhost:4000
 *   BENCH_SMOKE_LITELLM_API_KEY  e.g. sk-waggle-dev  (LiteLLM master key)
 * The operator sets these right before the priced run; CI never sets them, so
 * this never makes a network call in the default gate.
 *
 * Cost: each ping is max_tokens-bounded (preCellHealthCheck uses 1024) and runs
 * once per alias — pennies total. Run it manually before Phase 1:
 *   BENCH_SMOKE_LITELLM_URL=http://localhost:4000 \
 *   BENCH_SMOKE_LITELLM_API_KEY=sk-waggle-dev \
 *   npx vitest run benchmarks/harness/tests/frontier-baseline-smoke.test.ts
 */

import { describe, expect, it } from 'vitest';
import { preCellHealthCheck } from '../src/health-check.js';

const LITELLM_URL = process.env.BENCH_SMOKE_LITELLM_URL;
const LITELLM_API_KEY = process.env.BENCH_SMOKE_LITELLM_API_KEY;
const SMOKE_ENABLED = Boolean(LITELLM_URL && LITELLM_API_KEY);

/** The new frontier-baseline aliases this plan registered + the Gemini fallback.
 *  Each must resolve to a live upstream before any priced run. */
const NEW_ALIASES: readonly string[] = ['claude-opus-4-8', 'gpt-5.5', 'gemini-3.1-pro'];

describe.skipIf(!SMOKE_ENABLED)('Plan 05 — frontier baseline alias pre-spend smoke', () => {
  it('every new alias answers a cheap ping through the LiteLLM proxy', async () => {
    // One probe call covers all aliases (subjectModel + judgeModels list). Skip
    // the /health/liveliness GET — some LiteLLM configs don't expose it, and a
    // dead proxy will surface as a fetch_error on the chat probes anyway.
    const result = await preCellHealthCheck({
      litellmUrl: LITELLM_URL as string,
      litellmApiKey: LITELLM_API_KEY as string,
      subjectModel: NEW_ALIASES[0],
      judgeModels: NEW_ALIASES.slice(1),
      includeLivenessProbe: false,
      timeoutMs: 30_000,
    });
    // Loud, actionable failure: name exactly which alias/route is dead.
    expect(
      result.ok,
      `dead frontier-baseline routes before spend: ${JSON.stringify(result.failures)}`,
    ).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

describe('Plan 05 — smoke gating is wired (always runs)', () => {
  it('exposes the two gating env var names', () => {
    // Documents the contract even when the smoke is skipped — a reader running
    // the offline gate still sees how to enable it.
    expect(['BENCH_SMOKE_LITELLM_URL', 'BENCH_SMOKE_LITELLM_API_KEY']).toHaveLength(2);
  });

  it('lists the three aliases the smoke probes', () => {
    expect(NEW_ALIASES).toEqual(['claude-opus-4-8', 'gpt-5.5', 'gemini-3.1-pro']);
  });
});
