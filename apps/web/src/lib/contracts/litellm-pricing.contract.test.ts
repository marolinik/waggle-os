/**
 * Contract test — GET /api/litellm/pricing
 *
 * Incident: FR #14 (commit 55671b6) — SpawnAgentDialog crashed on `.toFixed`
 * of undefined because the server emits { inputPer1k, outputPer1k } but the
 * frontend ModelPricing type declares { inputCostPer1k, outputCostPer1k }.
 *
 * Fix: adapter.getModelPricing() normalises both field-name variants so callers
 * always receive the declared ModelPricing shape regardless of which variant the
 * server happened to emit.
 *
 * These tests pin that normalisation contract so a future server-side rename
 * surfaces here before it reaches production.
 *
 * Server emit shape verified from:
 *   packages/server/src/local/routes/litellm.ts  GET /api/litellm/pricing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from '../adapter';
import type { ModelPricing } from '../types';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Exact shape the server currently emits (litellm.ts line 63-72). */
const SERVER_PRICING_EMIT = [
  { model: 'claude-sonnet-4-6', inputPer1k: 0.003,    outputPer1k: 0.015,   provider: 'anthropic' },
  { model: 'claude-haiku-4-6',  inputPer1k: 0.0008,   outputPer1k: 0.004,   provider: 'anthropic' },
  { model: 'gpt-5.4',           inputPer1k: 0.005,    outputPer1k: 0.015,   provider: 'openai'    },
];

/** Pre-normalised shape — server could converge to this later. */
const SERVER_PRICING_ALREADY_NORMALISED = [
  { model: 'claude-sonnet-4-6', inputCostPer1k: 0.003, outputCostPer1k: 0.015, provider: 'anthropic' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/litellm/pricing — adapter contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => fetchSpy.mockRestore());

  it('normalises server inputPer1k / outputPer1k to the declared ModelPricing shape', async () => {
    fetchSpy = mockFetch(SERVER_PRICING_EMIT);
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModelPricing();

    expect(result).toHaveLength(SERVER_PRICING_EMIT.length);

    const sonnet = result.find(p => p.model === 'claude-sonnet-4-6');
    expect(sonnet).toBeDefined();

    // Client contract fields must be present and numeric
    expect(typeof sonnet!.inputCostPer1k).toBe('number');
    expect(typeof sonnet!.outputCostPer1k).toBe('number');
    expect(sonnet!.inputCostPer1k).toBe(0.003);
    expect(sonnet!.outputCostPer1k).toBe(0.015);

    // .toFixed() must not throw (the crash from FR #14)
    expect(() => sonnet!.inputCostPer1k.toFixed(4)).not.toThrow();
    expect(() => sonnet!.outputCostPer1k.toFixed(4)).not.toThrow();
  });

  it('also accepts the already-normalised shape (server-side convergence path)', async () => {
    fetchSpy = mockFetch(SERVER_PRICING_ALREADY_NORMALISED);
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModelPricing();

    const sonnet = result.find(p => p.model === 'claude-sonnet-4-6');
    expect(sonnet!.inputCostPer1k).toBe(0.003);
    expect(sonnet!.outputCostPer1k).toBe(0.015);
  });

  it('result satisfies the ModelPricing TypeScript contract for every entry', async () => {
    fetchSpy = mockFetch(SERVER_PRICING_EMIT);
    const adapter = new LocalAdapter('http://test:9999');
    const result: ModelPricing[] = await adapter.getModelPricing();

    for (const entry of result) {
      expect(typeof entry.model).toBe('string');
      expect(typeof entry.inputCostPer1k).toBe('number');
      expect(typeof entry.outputCostPer1k).toBe('number');
      // optional fields are either undefined or the correct shape
      if (entry.estimatedTokens !== undefined) {
        expect(typeof entry.estimatedTokens.min).toBe('number');
        expect(typeof entry.estimatedTokens.max).toBe('number');
      }
    }
  });

  it('handles an empty array response without throwing', async () => {
    fetchSpy = mockFetch([]);
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModelPricing();
    expect(result).toEqual([]);
  });

  it('handles the wrapped { pricing: [...] } legacy shape without throwing', async () => {
    fetchSpy = mockFetch({ pricing: SERVER_PRICING_EMIT });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModelPricing();
    expect(result).toHaveLength(SERVER_PRICING_EMIT.length);
    expect(result[0].inputCostPer1k).toBe(0.003);
  });

  it('missing inputPer1k fields fall back to 0, not undefined (crash-safe)', async () => {
    fetchSpy = mockFetch([{ model: 'mystery-model' }]);
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModelPricing();
    expect(result[0].inputCostPer1k).toBe(0);
    expect(result[0].outputCostPer1k).toBe(0);
    expect(() => result[0].inputCostPer1k.toFixed(4)).not.toThrow();
  });
});
