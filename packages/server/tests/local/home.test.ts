/**
 * Home Cockpit route tests (P2 — verify + J08).
 *
 * Covers the P2 additions to GET /api/home/briefing:
 *  - personalizeGreeting(): user name spliced into the first greeting clause
 *    (B8 / PRD §12.1 "greeting with user name") — unit + via inject.
 *  - applyPriorityRanking(): recency + bounded pending-item boost
 *    (PRD §12.1 "ranked by recency and priority") — unit.
 *  - needsReviewCount (J08/D6): personal-mind frames with metadata status
 *    'unreviewed' are counted; the count matches what the Memory Center
 *    "Needs review" view lists.
 *
 * Scaffolding follows memory-center.test.ts: Fastify inject + MindDB(':memory:')
 * + plain-object decorators. localConfig is intentionally absent → the
 * buildWorkspaceState call inside the briefing loop throws and is absorbed by
 * the route's per-workspace try/catch (pendingCount degrades to 0), and
 * emitAuditEvent stays a safe no-op.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { MindDB, IdentityLayer } from '@waggle/core';
import {
  homeRoutes,
  personalizeGreeting,
  applyPriorityRanking,
  type RecentWorkspaceCard,
} from '../../src/local/routes/home.js';
import { memoryCenterRoutes } from '../../src/local/routes/memory-center.js';

interface TestWorkspace {
  id: string;
  name: string;
  group: string;
  created: string;
  status?: string;
  teamId?: string;
}

function createTestServer(db: MindDB, workspaces: TestWorkspace[] = []) {
  const server = Fastify({ logger: false });
  server.decorate('multiMind', {
    personal: db,
    getFrameStore: () => undefined,
    search: () => [],
    workspace: undefined,
    setWorkspace: () => {},
  });
  server.decorate('agentState', {
    getWorkspaceMindDb: () => undefined,
    activateWorkspaceMind: () => undefined,
    listWorkspaces: () => [],
  });
  server.decorate('workspaceManager', {
    list: () => workspaces,
    get: (id: string) => workspaces.find((w) => w.id === id),
  });
  server.decorate('cronStore', {
    list: () => [],
    getExecutionHistory: () => [],
  });
  // localConfig intentionally absent — see file header.
  server.register(homeRoutes);
  server.register(memoryCenterRoutes);
  return server;
}

const card = (id: string, pendingCount: number, rankTs: number): { card: RecentWorkspaceCard; rankTs: number } => ({
  rankTs,
  card: { id, name: id, group: 'Personal', lastActive: new Date(rankTs).toISOString(), pendingCount },
});

describe('personalizeGreeting (P2 — B8 name in greeting)', () => {
  it('splices the name before the first sentence break', () => {
    expect(personalizeGreeting("Good morning. Here's your day:", 'Marko'))
      .toBe("Good morning, Marko. Here's your day:");
  });

  it('handles the em-dash fresh-state greeting', () => {
    expect(personalizeGreeting('Welcome — anything you discuss here will be remembered.', 'Marko'))
      .toBe('Welcome, Marko — anything you discuss here will be remembered.');
  });

  it('passes through without a name', () => {
    expect(personalizeGreeting("Good morning. Here's your day:"))
      .toBe("Good morning. Here's your day:");
  });

  it('passes through greetings with no sentence break', () => {
    expect(personalizeGreeting('Hello there', 'Marko')).toBe('Hello there');
  });
});

describe('applyPriorityRanking (P2 — recency + pending boost)', () => {
  const HOUR = 3_600_000;
  const T0 = Date.parse('2026-06-11T12:00:00Z');

  it('pending items boost an older workspace past a fresher empty one within the cap window', () => {
    const fresh = card('fresh', 0, T0);
    const blocked = card('blocked', 3, T0 - 2 * HOUR); // 3 pending → +3h ≥ 2h gap
    const ranked = applyPriorityRanking([fresh, blocked]);
    expect(ranked.map((c) => c.id)).toEqual(['blocked', 'fresh']);
  });

  it('the boost is capped — a stale workspace cannot leapfrog on pending count alone', () => {
    const fresh = card('fresh', 0, T0);
    const stale = card('stale', 50, T0 - 24 * HOUR); // cap 5 → +5h < 24h gap
    const ranked = applyPriorityRanking([fresh, stale]);
    expect(ranked.map((c) => c.id)).toEqual(['fresh', 'stale']);
  });

  it('slices to the display cap of 6', () => {
    const cards = Array.from({ length: 8 }, (_, i) => card(`w${i}`, 0, T0 - i * HOUR));
    expect(applyPriorityRanking(cards)).toHaveLength(6);
  });
});

describe('GET /api/home/briefing (P2 — J08 needsReviewCount + greeting)', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await server.close();
    db.close();
  });

  function boot(workspaces: TestWorkspace[] = []) {
    db = new MindDB(':memory:');
    server = createTestServer(db, workspaces);
  }

  it('empty mind → needsReviewCount 0, isFirstRun true', async () => {
    boot();
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    expect(res.statusCode).toBe(200);
    const briefing = res.json();
    expect(briefing.isFirstRun).toBe(true);
    expect(briefing.needsReviewCount).toBe(0);
  });

  it('counts only personal-mind memories with status unreviewed', async () => {
    boot();
    // Seed via the same routes the product uses: create (status active) then
    // flip one to unreviewed — the C33 harvest lifecycle state.
    const m1 = await server.inject({
      method: 'POST', url: '/api/memory',
      payload: { content: 'Imported fact awaiting review.' },
    });
    expect(m1.statusCode).toBe(200);
    const m2 = await server.inject({
      method: 'POST', url: '/api/memory',
      payload: { content: 'Already-reviewed fact.' },
    });
    expect(m2.statusCode).toBe(200);

    const patch = await server.inject({
      method: 'PATCH', url: `/api/memory/${m1.json().id}`,
      payload: { status: 'unreviewed' },
    });
    expect(patch.statusCode).toBe(200);

    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    expect(res.statusCode).toBe(200);
    expect(res.json().needsReviewCount).toBe(1);

    // The count must agree with what the deep-linked "Needs review" view shows
    // — same query the Memory Center fires (status filter + limit=200).
    const list = await server.inject({ method: 'GET', url: '/api/memory?status=unreviewed&limit=200' });
    expect(list.json().count).toBe(1);
  });

  it('briefing slices recent workspaces to 6, newest first (route-level ranking wiring)', async () => {
    const T0 = Date.parse('2026-06-11T12:00:00Z');
    const workspaces = Array.from({ length: 8 }, (_, i) => ({
      id: `w${i}`,
      name: `Workspace ${i}`,
      group: 'Personal',
      // w0 oldest … w7 newest
      created: new Date(T0 + i * 3_600_000).toISOString(),
    }));
    boot(workspaces);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    expect(res.statusCode).toBe(200);
    const cards = res.json().recentWorkspaces;
    expect(cards).toHaveLength(6);
    expect(cards.map((c: { id: string }) => c.id)).toEqual(['w7', 'w6', 'w5', 'w4', 'w3', 'w2']);
  });

  it('greets by name when identity is seeded (B8)', async () => {
    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: new Date().toISOString() }]);
    new IdentityLayer(db).create({
      name: 'Marko', role: 'Founder', department: 'Egzakta',
      personality: '', capabilities: '', system_prompt: '',
    });
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    expect(res.statusCode).toBe(200);
    const briefing = res.json();
    expect(briefing.userName).toBe('Marko');
    expect(briefing.greeting).toContain(', Marko');
  });

  it('greeting stays name-free when no identity exists', async () => {
    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: new Date().toISOString() }]);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    expect(res.json().userName).toBeUndefined();
    expect(res.json().greeting).not.toContain(',');
  });
});
