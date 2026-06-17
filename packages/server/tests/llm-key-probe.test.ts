/**
 * PR5 / D3 — the shared, provider-agnostic live API-key probe.
 *
 * `verified` is the honesty bit: true ONLY when a real provider call confirmed the key.
 * Format-only acceptance (no cheap probe / network blip) must report verified:false.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  probeProviderKey,
  validateKeyFormat,
  _clearKeyProbeCache,
} from '../src/local/llm-key-probe.js';

type Call = { url: string; init?: RequestInit };

/** A fake fetch that records calls and returns a fixed status + body — never hits the network. */
function fakeFetch(status: number, calls?: Call[], body = ''): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls?.push({ url: String(url), init });
    return { status, text: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const goodGoogle = 'AIza' + 'x'.repeat(30);
const GOOGLE_INVALID_BODY = JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', reason: 'API_KEY_INVALID' } });

const goodAnthropic = 'sk-ant-' + 'x'.repeat(30);
const goodOpenai = 'sk-' + 'x'.repeat(40);

beforeEach(() => _clearKeyProbeCache());

describe('validateKeyFormat', () => {
  it('rejects an anthropic key missing the sk-ant- prefix', () => {
    expect(validateKeyFormat('anthropic', 'nope-too-long-but-wrong-prefix').valid).toBe(false);
  });
  it('accepts a well-formed openai key', () => {
    expect(validateKeyFormat('openai', goodOpenai)).toEqual({ valid: true });
  });
  it('rejects a too-short unknown-provider key', () => {
    expect(validateKeyFormat('minimax', 'short').valid).toBe(false);
  });
});

describe('probeProviderKey', () => {
  it('format-invalid → valid:false, verified:false, and makes NO network call', async () => {
    const calls: Call[] = [];
    const r = await probeProviderKey('anthropic', 'bad', { fetchImpl: fakeFetch(200, calls) });
    expect(r).toMatchObject({ valid: false, verified: false });
    expect(r.error).toBeTruthy();
    expect(calls.length).toBe(0);
  });

  it('a live 200 → valid:true, verified:true (hits the provider endpoint)', async () => {
    const calls: Call[] = [];
    const r = await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(200, calls) });
    expect(r).toEqual({ valid: true, verified: true });
    expect(calls[0].url).toContain('api.anthropic.com');
  });

  it('a live 401 → valid:false, verified:true (key actually rejected)', async () => {
    const r = await probeProviderKey('openai', goodOpenai, { fetchImpl: fakeFetch(401) });
    expect(r).toMatchObject({ valid: false, verified: true });
  });

  it('a 400 (bad request, but key authenticates) → valid:true, verified:true', async () => {
    const r = await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(400) });
    expect(r).toMatchObject({ valid: true, verified: true });
  });

  it('a Google 400 API_KEY_INVALID → valid:false, verified:true (never a false "verified")', async () => {
    // Google signals a bad key with 400 + API_KEY_INVALID, not 401/403 (review HIGH).
    const r = await probeProviderKey('google', goodGoogle, { fetchImpl: fakeFetch(400, undefined, GOOGLE_INVALID_BODY) });
    expect(r).toMatchObject({ valid: false, verified: true });
  });

  it('a Google 200 (valid key) → valid:true, verified:true', async () => {
    const r = await probeProviderKey('google', goodGoogle, { fetchImpl: fakeFetch(200) });
    expect(r).toEqual({ valid: true, verified: true });
  });

  it('a Google 400 for an unrelated reason (key still authenticates) → valid:true, verified:true', async () => {
    const r = await probeProviderKey('google', goodGoogle, { fetchImpl: fakeFetch(400, undefined, JSON.stringify({ error: { message: 'bad request shape' } })) });
    expect(r).toMatchObject({ valid: true, verified: true });
  });

  it('a non-Google 400 is NOT treated as a rejection (no body read) — anthropic 400 = key works', async () => {
    const calls: Call[] = [];
    const r = await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(400, calls) });
    expect(r).toMatchObject({ valid: true, verified: true });
  });

  it('a provider with no live probe → format-only valid, verified:false, no network call', async () => {
    const calls: Call[] = [];
    const r = await probeProviderKey('minimax', 'x'.repeat(20), { fetchImpl: fakeFetch(200, calls) });
    expect(r).toEqual({ valid: true, verified: false });
    expect(calls.length).toBe(0);
  });

  it('a network error → degrades to format-only (valid:true, verified:false)', async () => {
    const throwingFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const r = await probeProviderKey('openai', goodOpenai, { fetchImpl: throwingFetch });
    expect(r).toEqual({ valid: true, verified: false });
  });

  it('caches a live result within TTL — the second call makes no network request', async () => {
    const calls: Call[] = [];
    await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(200, calls), now: () => 1000 });
    await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(200, calls), now: () => 1500 });
    expect(calls.length).toBe(1);
  });

  it('re-probes after the TTL expires', async () => {
    const calls: Call[] = [];
    await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(200, calls), now: () => 1000 });
    await probeProviderKey('anthropic', goodAnthropic, { fetchImpl: fakeFetch(200, calls), now: () => 1000 + 61_000 });
    expect(calls.length).toBe(2);
  });

  it('the same key string under two providers does not share a cache entry', async () => {
    // openai-shaped string is format-valid for both 'openai' and the unknown-provider
    // default; only 'openai' has a live probe, so a cache collision would be visible.
    const calls: Call[] = [];
    await probeProviderKey('openai', goodOpenai, { fetchImpl: fakeFetch(401, calls) });
    const second = await probeProviderKey('xai', goodOpenai, { fetchImpl: fakeFetch(200, calls) });
    expect(second).toEqual({ valid: true, verified: true }); // not the cached openai 401
    expect(calls.length).toBe(2);
  });
});
