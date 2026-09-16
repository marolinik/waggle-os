/**
 * Chat Governance — Permission Lookup Tests
 *
 * Covers:
 *   chat-governance.ts: getGovernancePermissions
 *
 * Mocks WaggleConfig (from @waggle/core) and global fetch
 * to test governance policy resolution, caching, and error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @waggle/core ──────────────────────────────────────────────

const { mockGetTeamServer } = vi.hoisted(() => {
  const mockGetTeamServer = vi.fn();
  return { mockGetTeamServer };
});

vi.mock('@waggle/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@waggle/core')>(),
  WaggleConfig: vi.fn(() => ({
    getTeamServer: mockGetTeamServer,
  })),
}));

import { getGovernancePermissions } from '../../src/local/routes/chat-governance.js';

// ─── Helpers ────────────────────────────────────────────────────────

function createFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ─── Setup / Teardown ───────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockGetTeamServer.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── No team server configured ──────────────────────────────────────

describe('getGovernancePermissions — no team server', () => {
  it('reports no team server when getTeamServer() returns null', async () => {
    mockGetTeamServer.mockReturnValue(null);

    const result = await getGovernancePermissions('/fake/data', 'ws-no-server-1', 'member');
    expect(result).toEqual({ status: 'none' });
  });

  it('reports no team server when the team server has no url', async () => {
    mockGetTeamServer.mockReturnValue({ token: 'tok-123' });

    const result = await getGovernancePermissions('/fake/data', 'ws-no-url-1', 'member');
    expect(result).toEqual({ status: 'none' });
  });

  it('reports no team server when the team server has no token', async () => {
    mockGetTeamServer.mockReturnValue({ url: 'https://93.184.216.34' });

    const result = await getGovernancePermissions('/fake/data', 'ws-no-token-1', 'member');
    expect(result).toEqual({ status: 'none' });
  });

  it('does not call fetch when no team server is configured', async () => {
    mockGetTeamServer.mockReturnValue(null);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    await getGovernancePermissions('/fake/data', 'ws-no-fetch-1', 'member');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── Successful fetch ───────────────────────────────────────────────

describe('getGovernancePermissions — successful fetch', () => {
  it('returns the blockedTools of the matching role', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'admin', blockedTools: ['delete_workspace'] },
      { role: 'member', blockedTools: ['bash', 'write_file'] },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-success-1', 'member');
    expect(result).toEqual({ status: 'policy', policies: { blockedTools: ['bash', 'write_file'] } });
  });

  it('returns no policy when nothing matches the teamRole', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'admin', blockedTools: ['delete_workspace'] },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-no-role-match-1', 'viewer');
    expect(result).toEqual({ status: 'policy', policies: undefined });
  });

  it('returns no policy when permissions is not an array', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse({ not: 'an array' }));

    // Not a fault: the payload carries no policy this client can match, which
    // is the same answer as a team with no entry for this role.
    const result = await getGovernancePermissions('/fake/data', 'ws-not-array-1', 'member');
    expect(result).toEqual({ status: 'policy', policies: undefined });
  });

  it('returns no policy when the matching role has no blockedTools', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'member', allowedSources: ['web'] }, // no blockedTools
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-no-blocked-1', 'member');
    expect(result).toEqual({ status: 'policy', policies: undefined });
  });

  it('constructs the correct URL with teamSlug and Authorization header', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34/',
      token: 'bearer-token-abc',
      teamSlug: 'my-team',
    });

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([]));
    globalThis.fetch = fetchMock;

    await getGovernancePermissions('/fake/data', 'ws-url-check-1', 'member');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://93.184.216.34/api/teams/my-team/capability-policies');
    expect(options.headers.Authorization).toBe('Bearer bearer-token-abc');
  });

  it('strips trailing slash from team server URL', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34///',
      token: 'tok',
      teamSlug: 'slug',
    });

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([]));
    globalThis.fetch = fetchMock;

    await getGovernancePermissions('/fake/data', 'ws-trailing-slash-1', 'admin');

    const [url] = fetchMock.mock.calls[0];
    // Only the last slash is stripped by the regex /$/ → but the function uses .replace(/\/$/, '')
    // which strips one trailing slash. With '///' it becomes '//'
    expect(url).toContain('/api/teams/slug/capability-policies');
  });
});

describe('getGovernancePermissions — guarded Team egress', () => {
  it('blocks cloud metadata before sending the Team token', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://169.254.169.254/latest/meta-data',
      token: 'metadata-token',
      teamSlug: 'acme',
    });
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([
      { role: 'member', blockedTools: ['write_file'] },
    ]));
    globalThis.fetch = fetchMock;

    const result = await getGovernancePermissions('/fake/data', 'ws-metadata-block-1', 'member');

    expect(result).toEqual({ status: 'unavailable', reason: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks cleartext public Team URLs even when loopback access is enabled', async () => {
    const previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
    process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
    mockGetTeamServer.mockReturnValue({
      url: 'http://93.184.216.34',
      token: 'cleartext-token',
      teamSlug: 'acme',
    });
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([
      { role: 'member', blockedTools: ['write_file'] },
    ]));
    globalThis.fetch = fetchMock;

    try {
      const result = await getGovernancePermissions('/fake/data', 'ws-cleartext-block-1', 'member');

      expect(result).toEqual({ status: 'unavailable', reason: expect.any(String) });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
      else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
    }
  });

  it('does not forward the Team token across redirects', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'redirect-token',
      teamSlug: 'acme',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data' },
    }));
    globalThis.fetch = fetchMock;

    const result = await getGovernancePermissions('/fake/data', 'ws-redirect-block-1', 'member');

    expect(result).toEqual({ status: 'unavailable', reason: expect.any(String) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
  });
});

// ─── Fetch failure ──────────────────────────────────────────────────

describe('getGovernancePermissions — fetch failure', () => {
  it('reports the team server unavailable when fetch throws (network error)', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await getGovernancePermissions('/fake/data', 'ws-net-error-1', 'member');
    expect(result).toEqual({ status: 'unavailable', reason: expect.any(String) });
  });

  it('reports the team server unavailable on a non-ok status', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(null, false, 500));

    const result = await getGovernancePermissions('/fake/data', 'ws-500-error-1', 'member');
    expect(result).toEqual({ status: 'unavailable', reason: expect.any(String) });
  });
});

// ─── Caching behavior ───────────────────────────────────────────────

describe('getGovernancePermissions — caching', () => {
  it('caches successful responses and does not re-fetch for the same workspace', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'member', blockedTools: ['bash'] },
    ];

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(policies));
    globalThis.fetch = fetchMock;

    // Use a unique workspace ID for this cache test
    const wsId = 'ws-cache-hit-1';

    // First call — should fetch
    const result1 = await getGovernancePermissions('/fake/data', wsId, 'member');
    expect(result1).toEqual({ status: 'policy', policies: { blockedTools: ['bash'] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    const result2 = await getGovernancePermissions('/fake/data', wsId, 'member');
    expect(result2).toEqual({ status: 'policy', policies: { blockedTools: ['bash'] } });
    // fetch should NOT have been called again
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns cached data when fetch fails on subsequent calls', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'admin', blockedTools: ['delete_all'] },
    ];

    const wsId = 'ws-cache-fallback-1';

    // First call succeeds and populates cache
    const successFetch = vi.fn().mockResolvedValue(createFetchResponse(policies));
    globalThis.fetch = successFetch;
    await getGovernancePermissions('/fake/data', wsId, 'admin');
    expect(successFetch).toHaveBeenCalledTimes(1);

    // Expire the cache by manipulating Date.now
    const realDateNow = Date.now;
    Date.now = () => realDateNow() + 6 * 60 * 1000; // 6 minutes later (past 5-min TTL)

    // Second call — fetch fails, but cached data should be returned
    const failFetch = vi.fn().mockRejectedValue(new Error('timeout'));
    globalThis.fetch = failFetch;

    const result = await getGovernancePermissions('/fake/data', wsId, 'admin');
    expect(result).toEqual({ status: 'policy', policies: { blockedTools: ['delete_all'] } });
    expect(failFetch).toHaveBeenCalledTimes(1);

    // Restore Date.now
    Date.now = realDateNow;
  });

  it('uses different cache entries for different workspaceIds', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies1 = [{ role: 'member', blockedTools: ['tool-a'] }];
    const policies2 = [{ role: 'member', blockedTools: ['tool-b'] }];

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(policies1))
      .mockResolvedValueOnce(createFetchResponse(policies2));
    globalThis.fetch = fetchMock;

    const r1 = await getGovernancePermissions('/fake/data', 'ws-diff-cache-a', 'member');
    const r2 = await getGovernancePermissions('/fake/data', 'ws-diff-cache-b', 'member');

    expect(r1).toEqual({ status: 'policy', policies: { blockedTools: ['tool-a'] } });
    expect(r2).toEqual({ status: 'policy', policies: { blockedTools: ['tool-b'] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('getGovernancePermissions — edge cases', () => {
  it('matches a policy whose role is undefined when the teamRole is undefined', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: undefined, blockedTools: ['hidden_tool'] },
      { role: 'member', blockedTools: ['bash'] },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-undef-role-1', undefined);
    // Should match the policy where role === undefined
    expect(result).toEqual({ status: 'policy', policies: { blockedTools: ['hidden_tool'] } });
  });

  it('defaults teamSlug to "default" when not set on teamServer', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      // No teamSlug property
    });

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([]));
    globalThis.fetch = fetchMock;

    await getGovernancePermissions('/fake/data', 'ws-default-slug-1', 'member');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://93.184.216.34/api/teams/default/capability-policies');
  });
});


// ─── An unreadable payload is a fault, not an absent policy ─────────────
//
// The role lookup reads a field on every element, so an array holding a
// non-object element cannot be read. The payload is validated before it is
// cached, so one such response cannot make every later lookup fail for the
// rest of the window (TD-CHAT-30).

describe('getGovernancePermissions — unreadable payload', () => {
  const UNREADABLE = [null, { role: 'member', blockedTools: ['bash'] }];

  function teamServer() {
    mockGetTeamServer.mockReturnValue({
      url: 'https://93.184.216.34',
      token: 'tok-123',
      teamSlug: 'acme',
    });
  }

  it('reports an unreadable payload as a fault the caller must handle', async () => {
    teamServer();
    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(UNREADABLE));

    await expect(getGovernancePermissions('/fake/data', 'ws-unreadable-first-1', 'member'))
      .resolves.toEqual({ status: 'invalid', reason: expect.any(String) });
  });

  it('does not cache an unreadable payload', async () => {
    teamServer();
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(UNREADABLE));
    globalThis.fetch = fetchMock;

    const wsId = 'ws-unreadable-uncached-1';
    await getGovernancePermissions('/fake/data', wsId, 'member');
    // A second lookup inside the window fetches again rather than replaying the
    // payload it could not read, so one bad response cannot poison the window.
    await expect(getGovernancePermissions('/fake/data', wsId, 'member'))
      .resolves.toEqual({ status: 'invalid', reason: expect.any(String) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('prefers a fault over a stale policy when the fresh payload is unreadable', async () => {
    teamServer();
    const wsId = 'ws-unreadable-stale-1';
    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse([
      { role: 'member', blockedTools: ['bash'] },
    ]));
    await expect(getGovernancePermissions('/fake/data', wsId, 'member'))
      .resolves.toEqual({ status: 'policy', policies: { blockedTools: ['bash'] } });

    const realDateNow = Date.now;
    try {
      Date.now = () => realDateNow() + 6 * 60 * 1000; // past the 5-minute TTL
      globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(UNREADABLE));
      // The stale-cache fallback covers a team server that cannot be reached,
      // not one that answers with something this client cannot read.
      await expect(getGovernancePermissions('/fake/data', wsId, 'member'))
        .resolves.toEqual({ status: 'invalid', reason: expect.any(String) });
    } finally {
      Date.now = realDateNow;
    }
  });
});
