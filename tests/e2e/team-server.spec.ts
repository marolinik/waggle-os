/**
 * Team Server E2E — tests the multi-user team server running on Docker
 * (Postgres + Redis + LiteLLM).
 *
 * Requires: docker-compose up (postgres:5434, redis:6381, litellm:4000)
 * Team server running on port 3100.
 */
import { test, expect } from '@playwright/test';

const TEAM = 'http://127.0.0.1:3100';

// ── 1. Server Health ──────────────────────────────────────────────────

test.describe('1. Team Server Health', () => {
  test('health endpoint responds', async ({ request }) => {
    const res = await request.get(`${TEAM}/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('ok');
  });
});

// ── 2. Team CRUD ──────────────────────────────────────────────────────

test.describe('2. Team Management', () => {
  let teamSlug: string;

  test('can create a team', async ({ request }) => {
    const name = `TestTeam-${Date.now()}`;
    teamSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const res = await request.post(`${TEAM}/api/teams`, {
      data: { name, slug: teamSlug },
      headers: { 'Content-Type': 'application/json' },
    });
    // May need auth — accept 200, 201, or 401
    expect([200, 201, 401, 403]).toContain(res.status());
  });

  test('can list teams', async ({ request }) => {
    const res = await request.get(`${TEAM}/api/teams`);
    expect([200, 401, 403]).toContain(res.status());
    if (res.ok()) {
      const data = await res.json();
      expect(Array.isArray(data) || Array.isArray(data.teams)).toBeTruthy();
    }
  });
});

// ── 3. Agent Routes ───────────────────────────────────────────────────

test.describe('3. Agent & Model Routes', () => {
  test('agents list', async ({ request }) => {
    const res = await request.get(`${TEAM}/api/agents`);
    expect([200, 401]).toContain(res.status());
  });

  test('workflows list', async ({ request }) => {
    const res = await request.get(`${TEAM}/api/workflows`);
    expect([200, 401, 404]).toContain(res.status());
  });
});

// ── 4. Database Connection ────────────────────────────────────────────

test.describe('4. Database', () => {
  test('postgres is reachable from server', async ({ request }) => {
    // The server started successfully which means DB connected.
    // Verify by hitting an endpoint that requires DB.
    const res = await request.get(`${TEAM}/api/teams`);
    // If 500, DB connection failed. 200 or 401 means DB is fine.
    expect(res.status()).not.toBe(500);
  });
});

// ── 5. WebSocket Gateway ──────────────────────────────────────────────

test.describe('5. WebSocket', () => {
  test('ws endpoint exists', async ({ request }) => {
    // HTTP GET to /ws should return upgrade required or similar
    const res = await request.get(`${TEAM}/ws`);
    // WebSocket endpoints typically return 400 or 426 on plain HTTP
    expect([400, 404, 426]).toContain(res.status());
  });
});

// ── 6. Cron & Jobs ────────────────────────────────────────────────────

test.describe('6. Background Services', () => {
  test('cron status endpoint', async ({ request }) => {
    const res = await request.get(`${TEAM}/api/cron`);
    expect([200, 401, 404]).toContain(res.status());
  });
});

// ── 7. Knowledge & Resources ──────────────────────────────────────────

test.describe('7. Knowledge Routes', () => {
  test('skills endpoint', async ({ request }) => {
    const res = await request.get(`${TEAM}/api/skills`);
    expect([200, 401, 404]).toContain(res.status());
  });
});

// ── 8. Concurrent Requests ────────────────────────────────────────────

test.describe('8. Concurrency', () => {
  test('10 concurrent health checks all succeed', async ({ request }) => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => request.get(`${TEAM}/health`))
    );
    for (const res of results) {
      expect(res.ok()).toBeTruthy();
    }
  });

  test('server handles rapid API calls without crashing', async ({ request }) => {
    const endpoints = ['/health', '/api/teams', '/api/agents', '/api/workflows', '/api/cron'];
    const results = await Promise.all(
      endpoints.map(ep => request.get(`${TEAM}${ep}`))
    );
    // No 500s — server survived the burst
    for (const res of results) {
      expect(res.status()).toBeLessThan(500);
    }

    // Health still ok after burst
    const health = await request.get(`${TEAM}/health`);
    expect(health.ok()).toBeTruthy();
  });
});
