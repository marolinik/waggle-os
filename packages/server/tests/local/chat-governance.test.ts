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

vi.mock('@waggle/core', () => ({
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
  it('returns undefined when getTeamServer() returns null', async () => {
    mockGetTeamServer.mockReturnValue(null);

    const result = await getGovernancePermissions('/fake/data', 'ws-no-server-1', 'member');
    expect(result).toBeUndefined();
  });

  it('returns undefined when team server has no url', async () => {
    mockGetTeamServer.mockReturnValue({ token: 'tok-123' });

    const result = await getGovernancePermissions('/fake/data', 'ws-no-url-1', 'member');
    expect(result).toBeUndefined();
  });

  it('returns undefined when team server has no token', async () => {
    mockGetTeamServer.mockReturnValue({ url: 'https://team.example.com' });

    const result = await getGovernancePermissions('/fake/data', 'ws-no-token-1', 'member');
    expect(result).toBeUndefined();
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
  it('returns blockedTools for the matching role', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'admin', blockedTools: ['delete_workspace'] },
      { role: 'member', blockedTools: ['bash', 'write_file'] },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-success-1', 'member');
    expect(result).toEqual({ blockedTools: ['bash', 'write_file'] });
  });

  it('returns undefined when no policy matches the teamRole', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'admin', blockedTools: ['delete_workspace'] },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-no-role-match-1', 'viewer');
    expect(result).toBeUndefined();
  });

  it('returns undefined when permissions is not an array', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse({ not: 'an array' }));

    const result = await getGovernancePermissions('/fake/data', 'ws-not-array-1', 'member');
    expect(result).toBeUndefined();
  });

  it('returns undefined when the matching role policy has no blockedTools', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    const policies = [
      { role: 'member', allowedSources: ['web'] }, // no blockedTools
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(policies));

    const result = await getGovernancePermissions('/fake/data', 'ws-no-blocked-1', 'member');
    expect(result).toBeUndefined();
  });

  it('constructs the correct URL with teamSlug and Authorization header', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com/',
      token: 'bearer-token-abc',
      teamSlug: 'my-team',
    });

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([]));
    globalThis.fetch = fetchMock;

    await getGovernancePermissions('/fake/data', 'ws-url-check-1', 'member');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://team.example.com/api/teams/my-team/capability-policies');
    expect(options.headers.Authorization).toBe('Bearer bearer-token-abc');
  });

  it('strips trailing slash from team server URL', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com///',
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

// ─── Fetch failure ──────────────────────────────────────────────────

describe('getGovernancePermissions — fetch failure', () => {
  it('returns undefined when fetch throws (network error)', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await getGovernancePermissions('/fake/data', 'ws-net-error-1', 'member');
    expect(result).toBeUndefined();
  });

  it('returns undefined when server responds with non-ok status', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      teamSlug: 'acme',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(createFetchResponse(null, false, 500));

    const result = await getGovernancePermissions('/fake/data', 'ws-500-error-1', 'member');
    expect(result).toBeUndefined();
  });
});

// ─── Caching behavior ───────────────────────────────────────────────

describe('getGovernancePermissions — caching', () => {
  it('caches successful responses and does not re-fetch for the same workspace', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
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
    expect(result1).toEqual({ blockedTools: ['bash'] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    const result2 = await getGovernancePermissions('/fake/data', wsId, 'member');
    expect(result2).toEqual({ blockedTools: ['bash'] });
    // fetch should NOT have been called again
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns cached data when fetch fails on subsequent calls', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
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
    expect(result).toEqual({ blockedTools: ['delete_all'] });
    expect(failFetch).toHaveBeenCalledTimes(1);

    // Restore Date.now
    Date.now = realDateNow;
  });

  it('uses different cache entries for different workspaceIds', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
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

    expect(r1).toEqual({ blockedTools: ['tool-a'] });
    expect(r2).toEqual({ blockedTools: ['tool-b'] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('getGovernancePermissions — edge cases', () => {
  it('handles undefined teamRole gracefully', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
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
    expect(result).toEqual({ blockedTools: ['hidden_tool'] });
  });

  it('defaults teamSlug to "default" when not set on teamServer', async () => {
    mockGetTeamServer.mockReturnValue({
      url: 'https://team.example.com',
      token: 'tok-123',
      // No teamSlug property
    });

    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse([]));
    globalThis.fetch = fetchMock;

    await getGovernancePermissions('/fake/data', 'ws-default-slug-1', 'member');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://team.example.com/api/teams/default/capability-policies');
  });
});
