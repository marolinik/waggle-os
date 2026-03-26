import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ConnectionManager } from '../../src/ws/connection-manager.js';
import { setWsTokenVerifier } from '../../src/ws/gateway.js';

/**
 * Create a structurally valid JWT with a given payload.
 * Header: {"alg":"HS256","typ":"JWT"}, signature: fake.
 * This is NOT cryptographically signed — it's for testing JWT structure validation.
 */
function makeTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from('test-signature').toString('base64url');
  return `${header}.${body}.${signature}`;
}

// ─── ConnectionManager unit tests ───────────────────────────────────────────

describe('ConnectionManager', () => {
  it('tracks connections by team and user', () => {
    const cm = new ConnectionManager();
    const mockWs = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', mockWs);
    expect(cm.getConnectedUsers('team1')).toEqual(['user1']);

    cm.remove('team1', 'user1');
    expect(cm.getConnectedUsers('team1')).toEqual([]);
  });

  it('returns empty array for unknown team', () => {
    const cm = new ConnectionManager();
    expect(cm.getConnectedUsers('nonexistent')).toEqual([]);
  });

  it('removes team entry when last user disconnects', () => {
    const cm = new ConnectionManager();
    const mockWs = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', mockWs);
    expect(cm.getTeamCount()).toBe(1);

    cm.remove('team1', 'user1');
    expect(cm.getTeamCount()).toBe(0);
  });

  it('tracks multiple users in same team', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', ws1);
    cm.add('team1', 'user2', ws2);
    expect(cm.getConnectedUsers('team1')).toEqual(['user1', 'user2']);
  });

  it('tracks users across multiple teams', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', ws1);
    cm.add('team2', 'user2', ws2);
    expect(cm.getConnectedUsers('team1')).toEqual(['user1']);
    expect(cm.getConnectedUsers('team2')).toEqual(['user2']);
    expect(cm.getTeamCount()).toBe(2);
  });

  it('broadcasts to all team members', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', ws1);
    cm.add('team1', 'user2', ws2);

    cm.broadcast('team1', { type: 'task_update', task: {} as any });
    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();

    const sentData = JSON.parse(ws1.send.mock.calls[0][0]);
    expect(sentData.type).toBe('task_update');
  });

  it('excludes user from broadcast', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', ws1);
    cm.add('team1', 'user2', ws2);

    cm.broadcast('team1', { type: 'task_update', task: {} as any }, 'user1');
    expect(ws1.send).not.toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalledOnce();
  });

  it('skips sockets that are not OPEN', () => {
    const cm = new ConnectionManager();
    const wsOpen = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const wsClosed = { readyState: 3, OPEN: 1, send: vi.fn() } as any; // readyState 3 = CLOSED

    cm.add('team1', 'user1', wsOpen);
    cm.add('team1', 'user2', wsClosed);

    cm.broadcast('team1', { type: 'task_update', task: {} as any });
    expect(wsOpen.send).toHaveBeenCalledOnce();
    expect(wsClosed.send).not.toHaveBeenCalled();
  });

  it('sends to specific user', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', ws1);
    cm.add('team1', 'user2', ws2);

    cm.sendTo('team1', 'user1', { type: 'suggestion', suggestion: {} as any });
    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).not.toHaveBeenCalled();

    const sentData = JSON.parse(ws1.send.mock.calls[0][0]);
    expect(sentData.type).toBe('suggestion');
  });

  it('sendTo does nothing for nonexistent user', () => {
    const cm = new ConnectionManager();
    // Should not throw
    cm.sendTo('team1', 'nobody', { type: 'task_update', task: {} as any });
  });

  it('sendTo does nothing for closed socket', () => {
    const cm = new ConnectionManager();
    const wsClosed = { readyState: 3, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', wsClosed);
    cm.sendTo('team1', 'user1', { type: 'task_update', task: {} as any });
    expect(wsClosed.send).not.toHaveBeenCalled();
  });

  it('broadcast does nothing for nonexistent team', () => {
    const cm = new ConnectionManager();
    // Should not throw
    cm.broadcast('nonexistent', { type: 'task_update', task: {} as any });
  });

  it('replaces connection when same user re-adds', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    cm.add('team1', 'user1', ws1);
    cm.add('team1', 'user1', ws2); // replace

    cm.broadcast('team1', { type: 'task_update', task: {} as any });
    expect(ws1.send).not.toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalledOnce();
    expect(cm.getConnectedUsers('team1')).toEqual(['user1']);
  });

  // ── 11F-6: WebSocket lifecycle tests ──────────────────────────────────

  it('multiple clients with one disconnect: broadcast still reaches remaining 2', () => {
    const cm = new ConnectionManager();
    const ws1 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws2 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const ws3 = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    // Register 3 clients in a team
    cm.add('team1', 'user1', ws1);
    cm.add('team1', 'user2', ws2);
    cm.add('team1', 'user3', ws3);
    expect(cm.getConnectedUsers('team1')).toEqual(['user1', 'user2', 'user3']);

    // Disconnect user2
    cm.remove('team1', 'user2');
    expect(cm.getConnectedUsers('team1')).toEqual(['user1', 'user3']);

    // Broadcast — should reach user1 and user3 only
    cm.broadcast('team1', { type: 'task_update', task: {} as any });
    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).not.toHaveBeenCalled();
    expect(ws3.send).toHaveBeenCalledOnce();

    // Team is still tracked (not removed since 2 users remain)
    expect(cm.getTeamCount()).toBe(1);
  });

  it('reconnection with same userId: no duplicate entries, clean replacement', () => {
    const cm = new ConnectionManager();
    const wsOriginal = { readyState: 1, OPEN: 1, send: vi.fn() } as any;
    const wsReconnect = { readyState: 1, OPEN: 1, send: vi.fn() } as any;

    // Initial connection
    cm.add('team1', 'user1', wsOriginal);
    expect(cm.getConnectedUsers('team1')).toEqual(['user1']);

    // Simulate disconnect
    cm.remove('team1', 'user1');
    expect(cm.getConnectedUsers('team1')).toEqual([]);
    // Team entry should be cleaned up since last user left
    expect(cm.getTeamCount()).toBe(0);

    // Reconnect with same userId
    cm.add('team1', 'user1', wsReconnect);
    expect(cm.getConnectedUsers('team1')).toEqual(['user1']);
    expect(cm.getTeamCount()).toBe(1);

    // Broadcast should only reach the reconnected socket
    cm.broadcast('team1', { type: 'task_update', task: {} as any });
    expect(wsOriginal.send).not.toHaveBeenCalled();
    expect(wsReconnect.send).toHaveBeenCalledOnce();

    // No duplicate user entries
    expect(cm.getConnectedUsers('team1')).toHaveLength(1);
  });
});

// ─── WebSocket Gateway integration tests ────────────────────────────────────
// These require PostgreSQL + Redis running (ports 5434 / 6381)

describe('WebSocket Gateway (integration)', () => {
  let server: Awaited<ReturnType<typeof import('../../src/index.js').buildServer>>;
  let address: string;
  let userId: string;
  let clerkId: string;
  let teamSlug: string;
  /** A structurally valid JWT whose sub matches our test user's clerkId */
  let validJwt: string;

  beforeAll(async () => {
    const { buildServer } = await import('../../src/index.js');
    const { sql: drizzleSql } = await import('drizzle-orm');
    server = await buildServer();

    // Override auth to bypass Clerk for REST routes
    (server as any)._authHandler.fn = async (req: any, reply: any) => {
      const testUserId = req.headers['x-test-user-id'] as string;
      if (!testUserId) return reply.code(401).send({ error: 'Missing test user' });
      req.userId = testUserId;
      req.clerkId = 'test';
    };

    // Clean up leftover data from previous runs
    const { users, teams, teamMembers } = await import('../../src/db/schema.js');
    await server.db.execute(drizzleSql`DELETE FROM team_members WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'wstest_%')`);
    await server.db.execute(drizzleSql`DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE clerk_id LIKE 'wstest_%')`);
    await server.db.execute(drizzleSql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'ws-test-team-%')`);
    await server.db.execute(drizzleSql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'ws-test-team-%')`);
    await server.db.execute(drizzleSql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'ws-test-team-%')`);
    await server.db.execute(drizzleSql`DELETE FROM teams WHERE slug LIKE 'ws-test-team-%'`);
    await server.db.execute(drizzleSql`DELETE FROM users WHERE clerk_id LIKE 'wstest_%'`);

    // Create test user and team with unique IDs
    const suffix = Date.now();
    clerkId = `wstest_user_${suffix}`;
    const [user] = await server.db
      .insert(users)
      .values({
        clerkId,
        displayName: 'WS User',
        email: `wsuser_${suffix}@test.com`,
      })
      .returning();
    userId = user.id;

    // Build a valid test JWT with the user's clerkId as `sub`
    validJwt = makeTestJwt({ sub: clerkId, iat: Math.floor(Date.now() / 1000) });

    // Override the WS token verifier so tests don't need a real Clerk secret key.
    // The verifier accepts any structurally valid JWT and returns its decoded `sub`.
    setWsTokenVerifier(async (token: string) => {
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (typeof payload.sub !== 'string') throw new Error('Missing sub');
      return { sub: payload.sub };
    });

    teamSlug = `ws-test-team-${suffix}`;
    const [team] = await server.db
      .insert(teams)
      .values({ name: 'WS Team', slug: teamSlug, ownerId: userId })
      .returning();

    await server.db
      .insert(teamMembers)
      .values({ teamId: team.id, userId, role: 'owner' });

    // Start listening on a random port
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    address = typeof addr === 'string' ? addr : `127.0.0.1:${addr?.port}`;
  });

  afterAll(async () => {
    // Clear the WS token verifier override
    setWsTokenVerifier(null);

    if (!server) return;
    const { sql } = await import('drizzle-orm');
    await server.db.execute(
      sql`DELETE FROM team_members WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'wstest_%')`,
    );
    await server.db.execute(
      sql`DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE clerk_id LIKE 'wstest_%')`,
    );
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'ws-test-team-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'ws-test-team-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'ws-test-team-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'ws-test-team-%'`);
    await server.db.execute(
      sql`DELETE FROM users WHERE clerk_id LIKE 'wstest_%'`,
    );
    await server.close();
  });

  function connectWs(): Promise<{ ws: import('ws').WebSocket; messages: any[] }> {
    return new Promise((resolve, reject) => {
      // Dynamic import to avoid issues if ws isn't available at parse time
      import('ws').then(({ default: WS }) => {
        const ws = new WS(`ws://${address}/ws`);
        const msgs: any[] = [];
        ws.on('message', (data: Buffer) => msgs.push(JSON.parse(data.toString())));
        ws.on('open', () => resolve({ ws, messages: msgs }));
        ws.on('error', reject);
      });
    });
  }

  function wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Wait until messages array has at least `count` entries, or timeout. */
  async function waitForMessages(messages: any[], count: number, timeoutMs = 3000) {
    const start = Date.now();
    while (messages.length < count && Date.now() - start < timeoutMs) {
      await wait(50);
    }
  }

  it('connects and authenticates via WebSocket', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'authenticate', token: validJwt }));
    await waitForMessages(messages, 1);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'authenticated', userId });

    ws.close();
  });

  it('rejects join_team before authentication', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'join_team', teamSlug }));
    await waitForMessages(messages, 1);

    expect(messages[0]).toEqual({ type: 'error', message: 'Not authenticated' });

    ws.close();
  });

  it('joins team room after authentication', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'authenticate', token: validJwt }));
    await waitForMessages(messages, 1);

    ws.send(JSON.stringify({ type: 'join_team', teamSlug }));
    await waitForMessages(messages, 2);

    expect(messages[1]).toEqual({ type: 'joined_team', teamSlug });

    ws.close();
  });

  it('returns error for nonexistent team', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'authenticate', token: validJwt }));
    await waitForMessages(messages, 1);

    ws.send(JSON.stringify({ type: 'join_team', teamSlug: 'does-not-exist' }));
    await waitForMessages(messages, 2);

    expect(messages[1]).toEqual({ type: 'error', message: 'Team not found' });

    ws.close();
  });

  it('rejects send_message before joining team', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'authenticate', token: validJwt }));
    await waitForMessages(messages, 1);

    ws.send(
      JSON.stringify({
        type: 'send_message',
        teamSlug,
        messageType: 'broadcast',
        subtype: 'discovery',
        content: { text: 'hello' },
      }),
    );
    await waitForMessages(messages, 2);

    expect(messages[1]).toEqual({ type: 'error', message: 'Not in a team' });

    ws.close();
  });

  it('handles invalid JSON gracefully', async () => {
    const { ws, messages } = await connectWs();

    ws.send('this is not json');
    await wait(200);

    expect(messages[0]).toEqual({ type: 'error', message: 'Invalid message' });

    ws.close();
  });

  // ─── JWT auth security tests ──────────────────────────────────────────────

  it('rejects plain userId string as token (not a JWT)', async () => {
    const { ws, messages } = await connectWs();

    // Sending a raw userId (UUID) should be rejected — it's not a JWT
    ws.send(JSON.stringify({ type: 'authenticate', token: userId }));
    await waitForMessages(messages, 1);

    expect(messages[0]).toEqual({
      type: 'error',
      message: 'Invalid token: must be a valid JWT',
    });

    ws.close();
  });

  it('rejects random non-JWT string as token', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'authenticate', token: 'not-a-jwt-token' }));
    await waitForMessages(messages, 1);

    expect(messages[0]).toEqual({
      type: 'error',
      message: 'Invalid token: must be a valid JWT',
    });

    ws.close();
  });

  it('rejects JWT with nonexistent user (unknown clerkId)', async () => {
    const { ws, messages } = await connectWs();

    const fakeJwt = makeTestJwt({ sub: 'clerk_user_does_not_exist', iat: Math.floor(Date.now() / 1000) });
    ws.send(JSON.stringify({ type: 'authenticate', token: fakeJwt }));
    await waitForMessages(messages, 1);

    expect(messages[0]).toEqual({
      type: 'error',
      message: 'User not found',
    });

    ws.close();
  });

  it('authenticates with valid JWT and maps clerkId to internal userId', async () => {
    const { ws, messages } = await connectWs();

    ws.send(JSON.stringify({ type: 'authenticate', token: validJwt }));
    await waitForMessages(messages, 1);

    expect(messages[0]).toEqual({ type: 'authenticated', userId });

    ws.close();
  });
});
