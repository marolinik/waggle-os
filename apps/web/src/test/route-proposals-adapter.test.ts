/**
 * Router arc P1-B (B2) — adapter.routeProposals.{propose,confirm,reject}
 * fetch-mock unit test. Verifies the wire contract against SPEC A4:
 * POST /api/route-proposals, /:id/confirm, /:id/reject, and that confirm's
 * 409 revalidation body survives on the thrown AdapterHttpError.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adapter, AdapterHttpError } from '@/lib/adapter';
import type { RouteProposalPayload } from '@/lib/route-proposals';

const payload: RouteProposalPayload = {
  routeDecisionId: 'rd-42',
  selected: { id: 'external:claude-code', displayName: 'Claude Code', reason: 'best coding fit' },
  alternatives: [{ id: 'persona:coder', displayName: 'Coder' }],
  rejected: [],
  scores: [],
  egress: {
    destination: 'Anthropic',
    items: [{ frameId: 'f1', date: '2026-07-10', source: 'user_stated', preview: 'p' }],
    briefChars: 1200,
  },
  costLine: 'uses your existing Claude Code allowance',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The (url, init) of the fetch call that hit a route-proposals path. */
function routeCall(): { url: string; init: RequestInit } {
  const call = vi.mocked(global.fetch).mock.calls.find(([u]) => String(u).includes('/api/route-proposals'));
  expect(call).toBeDefined();
  const [u, init] = call as [RequestInfo | URL, RequestInit];
  return { url: String(u), init };
}

beforeEach(() => {
  vi.spyOn(global, 'fetch');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('adapter.routeProposals (router arc B2)', () => {
  it('propose POSTs {workspaceId, prompt} to /api/route-proposals and returns the payload', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(payload));
    const result = await adapter.routeProposals.propose({ workspaceId: 'ws-1', prompt: 'fix the flaky test' });

    expect(result).toEqual(payload);
    const { url, init } = routeCall();
    expect(url.endsWith('/api/route-proposals')).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ workspaceId: 'ws-1', prompt: 'fix the flaky test' });
  });

  it('keeps a cold Windows executor-discovery proposal alive past the default 10s request deadline', async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    vi.mocked(global.fetch).mockImplementation((_url, init) => new Promise((resolve, reject) => {
      resolveFetch = resolve;
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    let state: 'pending' | 'resolved' | 'rejected' = 'pending';
    const proposal = adapter.routeProposals
      .propose({ workspaceId: 'ws-1', prompt: 'compare two beta launch plans' })
      .then((result) => {
        state = 'resolved';
        return { result, error: undefined };
      }, (error: unknown) => {
        state = 'rejected';
        return { result: undefined, error };
      });

    await vi.advanceTimersByTimeAsync(10_001);
    expect(state).toBe('pending');

    resolveFetch(jsonResponse(payload));
    await expect(proposal).resolves.toEqual({ result: payload, error: undefined });
  });

  it('keeps an internal-persona confirmation alive while its model turn completes', async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    vi.mocked(global.fetch).mockImplementation((_url, init) => new Promise((resolve, reject) => {
      resolveFetch = resolve;
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    let state: 'pending' | 'resolved' | 'rejected' = 'pending';
    const confirmation = adapter.routeProposals.confirm('rd-42').then((result) => {
      state = 'resolved';
      return { result, error: undefined };
    }, (error: unknown) => {
      state = 'rejected';
      return { result: undefined, error };
    });

    await vi.advanceTimersByTimeAsync(10_001);
    expect(state).toBe('pending');

    const result = { status: 'dispatched' as const, mode: 'internal' as const, resultText: 'Use the concierge beta.' };
    resolveFetch(jsonResponse(result));
    await expect(confirmation).resolves.toEqual({ result, error: undefined });
  });

  it('confirm POSTs executorId + removeFrameIds to /api/route-proposals/:id/confirm', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ status: 'dispatched', mode: 'external', roomId: 'room-1', runId: 'run-1' }),
    );
    const result = await adapter.routeProposals.confirm('rd-42', {
      executorId: 'persona:coder',
      removeFrameIds: ['f1'],
    });

    expect(result).toEqual({ status: 'dispatched', mode: 'external', roomId: 'room-1', runId: 'run-1' });
    const { url, init } = routeCall();
    expect(url.endsWith('/api/route-proposals/rd-42/confirm')).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ executorId: 'persona:coder', removeFrameIds: ['f1'] });
  });

  it('confirm surfaces the 409 revalidation_failed body on the thrown AdapterHttpError', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ error: 'revalidation_failed', reason: 'tool uninstalled' }, 409),
    );
    let thrown: unknown;
    try {
      await adapter.routeProposals.confirm('rd-42');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AdapterHttpError);
    const httpErr = thrown as AdapterHttpError;
    expect(httpErr.status).toBe(409);
    expect(httpErr.message).toBe('revalidation_failed');
    expect((httpErr.body as { reason?: string }).reason).toBe('tool uninstalled');
  });

  it('reject POSTs to /api/route-proposals/:id/reject', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ status: 'rejected' }));
    await adapter.routeProposals.reject('rd-42');

    const { url, init } = routeCall();
    expect(url.endsWith('/api/route-proposals/rd-42/reject')).toBe(true);
    expect(init.method).toBe('POST');
  });

  it('proposal ids are URI-encoded in the path', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ status: 'rejected' }));
    await adapter.routeProposals.reject('rd/odd id');

    const { url } = routeCall();
    expect(url.endsWith(`/api/route-proposals/${encodeURIComponent('rd/odd id')}/reject`)).toBe(true);
  });
});
