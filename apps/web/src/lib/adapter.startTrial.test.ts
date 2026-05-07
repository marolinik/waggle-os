/**
 * LocalAdapter.startTrial — atomic 15-day trial start wiring.
 *
 * Pins the contract between Desktop's UpgradeModal `onStartTrial` callback
 * + the onboarding-complete handler, and the server's POST
 * /api/tier/start-trial route. Guards against the original silent-failure
 * pattern where the call site used a non-existent `adapter.updateSettings`
 * method behind an `as any` cast (see commit db069a7 for the bug
 * post-mortem).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

describe('LocalAdapter.startTrial', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs to /api/tier/start-trial and returns the parsed body on 200', async () => {
    const serverBody = {
      tier: 'TRIAL',
      rawTier: 'TRIAL',
      trialStartedAt: '2026-05-07T18:00:00.000Z',
      trialDaysRemaining: 15,
      trialExpired: false,
      capabilities: { workspaceLimit: -1, spawnAgents: true },
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(serverBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new LocalAdapter('http://test-server:9999');
    const result = await adapter.startTrial();

    // Wiring: correct URL + method.
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe('http://test-server:9999/api/tier/start-trial');
    expect(init.method).toBe('POST');

    // Returns the server body verbatim — Desktop's refreshTier path depends
    // on `tier` + `trialDaysRemaining` being present.
    expect(result).toEqual(serverBody);
  });

  it('throws on 409 TRIAL_ALREADY_STARTED so call sites can decide whether to surface', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({
        error: 'TRIAL_ALREADY_STARTED',
        message: 'A trial has already been started for this installation.',
        tier: 'TRIAL',
        trialStartedAt: '2026-05-01T00:00:00.000Z',
        trialDaysRemaining: 9,
        trialExpired: false,
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new LocalAdapter('http://test-server:9999');
    await expect(adapter.startTrial()).rejects.toThrow(/Start trial failed.*409/);
    // The thrown message must surface the server's `message` field so a
    // future toast/inline-error UI can show something useful instead of
    // the bare HTTP status text.
    await expect(adapter.startTrial()).rejects.toThrow(/A trial has already been started/);
  });

  it('throws on 500 with the server status text when the body is not JSON', async () => {
    fetchSpy.mockResolvedValue(
      new Response('upstream timeout', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const adapter = new LocalAdapter('http://test-server:9999');
    await expect(adapter.startTrial()).rejects.toThrow(/Start trial failed.*500/);
  });
});
