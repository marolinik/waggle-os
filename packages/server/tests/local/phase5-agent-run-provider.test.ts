// R1-010 — /api/agent/run must read the LiteLLM URL + key from LIVE server
// state at request time, not from a module-load snapshot.
//
// Bug: agent-run.ts snapshots DEFAULT_LITELLM_URL (env WAGGLE_LITELLM_URL ??
// http://localhost:4000) and LITELLM_KEY (env LITELLM_API_KEY ?? ... ??
// sk-waggle-dev) at MODULE LOAD. When LiteLLM is unavailable, service.ts falls
// back to the built-in Anthropic proxy and sets, at RUNTIME:
//     server.agentState.litellmApiKey = server.agentState.wsSessionToken
//     (server.localConfig as any).litellmUrl = `http://127.0.0.1:${port}/v1`
// The route ignored those, so the outbound LLM fetch hit the dead LiteLLM
// default (http://localhost:4000) with the wrong key — breaking /api/agent/run
// for the Anthropic-only default (the common no-LiteLLM case).
//
// This test exercises the request-time endpoint resolver to prove it picks up
// the runtime fallback values from server state.

import { describe, it, expect } from 'vitest';

/** Minimal duck-typed server shape the resolver reads from. */
function makeServerWithRuntimeFallback(opts: {
  litellmUrl: string;
  litellmApiKey: string;
}): unknown {
  return {
    agentState: {
      litellmApiKey: opts.litellmApiKey,
    },
    localConfig: {
      litellmUrl: opts.litellmUrl,
    },
  };
}

describe('agent-run resolveLlmEndpoint — request-time live server state', () => {
  it('exports a resolveLlmEndpoint helper', async () => {
    const mod = await import('../../src/local/routes/agent-run.js');
    expect((mod as Record<string, unknown>).resolveLlmEndpoint).toBeDefined();
    expect(typeof (mod as Record<string, unknown>).resolveLlmEndpoint).toBe('function');
  });

  it('reads the runtime Anthropic-proxy fallback URL + key from server state', async () => {
    const { resolveLlmEndpoint } = await import('../../src/local/routes/agent-run.js');

    // Simulate the LiteLLM-unavailable fallback that service.ts installs at
    // runtime: self-proxy URL + wsSessionToken as the key.
    const runtimeUrl = 'http://127.0.0.1:54321/v1';
    const runtimeKey = 'ws-session-token-abc123';
    const server = makeServerWithRuntimeFallback({
      litellmUrl: runtimeUrl,
      litellmApiKey: runtimeKey,
    });

    const endpoint = (resolveLlmEndpoint as (s: unknown) => { url: string; apiKey: string })(
      server,
    );

    expect(endpoint.url).toBe(runtimeUrl);
    expect(endpoint.apiKey).toBe(runtimeKey);
    // Must NOT fall back to the dead module-level LiteLLM default.
    expect(endpoint.url).not.toContain('localhost:4000');
    expect(endpoint.apiKey).not.toBe('sk-waggle-dev');
  });

  it('falls back gracefully to module defaults when server state is empty', async () => {
    const { resolveLlmEndpoint } = await import('../../src/local/routes/agent-run.js');

    // No agentState/localConfig values present — resolver must still return a
    // usable (non-throwing) endpoint rather than blowing up.
    const endpoint = (resolveLlmEndpoint as (s: unknown) => { url: string; apiKey: string })(
      { agentState: {}, localConfig: {} },
    );

    expect(typeof endpoint.url).toBe('string');
    expect(endpoint.url.length).toBeGreaterThan(0);
    expect(typeof endpoint.apiKey).toBe('string');
    expect(endpoint.apiKey.length).toBeGreaterThan(0);
  });
});
