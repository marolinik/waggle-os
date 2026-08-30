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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FrameStore, MindDB, IdentityLayer, SessionStore } from '@waggle/core';
import {
  homeRoutes,
  personalizeGreeting,
  applyPriorityRanking,
  type RecentWorkspaceCard,
} from '../../src/local/routes/home.js';
import { memoryCenterRoutes } from '../../src/local/routes/memory-center.js';
import {
  buildUpcomingSchedules,
  type CronScheduleLike,
} from '../../src/local/routes/workspace-context.js';

interface TestWorkspace {
  id: string;
  name: string;
  group: string;
  created: string;
  status?: string;
  teamId?: string;
}

function createTestServer(
  db: MindDB,
  workspaces: TestWorkspace[] = [],
  cronSchedules: CronScheduleLike[] = [],
  dataDir?: string,
) {
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
    getMindPath: (id: string) => path.join(dataDir ?? '', 'workspaces', id, 'mind.db'),
  });
  server.decorate('cronStore', {
    list: () => cronSchedules,
    getExecutionHistory: () => [],
  });
  if (dataDir) server.decorate('localConfig', { dataDir });
  // localConfig is otherwise intentionally absent — see file header.
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
    expect(personalizeGreeting("Good morning. Here's your day", 'Marko'))
      .toBe("Good morning, Marko. Here's your day");
  });

  it('handles the em-dash fresh-state greeting', () => {
    expect(personalizeGreeting('Welcome — anything you discuss here will be remembered.', 'Marko'))
      .toBe('Welcome, Marko — anything you discuss here will be remembered.');
  });

  it('passes through without a name', () => {
    expect(personalizeGreeting("Good morning. Here's your day"))
      .toBe("Good morning. Here's your day");
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
  let tempDir: string | null = null;

  afterEach(async () => {
    await server.close();
    db.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function boot(workspaces: TestWorkspace[] = [], dataDir?: string) {
    db = new MindDB(':memory:');
    server = createTestServer(db, workspaces, [], dataDir);
  }

  it('returns the latest non-empty conversation as the workspace continue target', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-home-continue-'));
    const sessionsDir = path.join(tempDir, 'workspaces', 'w1', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const writeSession = (id: string, messages: Array<{ role: string; content: string }>, mtime: Date) => {
      const lines = [
        JSON.stringify({ type: 'meta', created: mtime.toISOString() }),
        ...messages.map(message => JSON.stringify({ ...message, timestamp: mtime.toISOString() })),
      ];
      const file = path.join(sessionsDir, `${id}.jsonl`);
      fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
      fs.utimesSync(file, mtime, mtime);
      return file;
    };
    writeSession('session-older', [
      { role: 'user', content: 'Older question' },
      { role: 'assistant', content: 'Older answer' },
    ], new Date('2026-08-29T08:00:00.000Z'));
    const latestFile = writeSession('session-latest', [
      { role: 'user', content: 'Latest decision' },
      { role: 'assistant', content: 'Latest answer' },
    ], new Date('2026-08-29T09:00:00.000Z'));
    fs.appendFileSync(latestFile, `${'x'.repeat(2 * 1024 * 1024)}\n`, 'utf8');
    fs.utimesSync(
      latestFile,
      new Date('2026-08-29T09:00:00.000Z'),
      new Date('2026-08-29T09:00:00.000Z'),
    );
    const emptyFiles: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      emptyFiles.push(writeSession(
        `session-empty-${i}`,
        [],
        new Date(Date.parse('2026-08-29T10:00:00.000Z') + i * 1_000),
      ));
    }
    const latestMtime = fs.statSync(latestFile).mtimeMs;
    expect(emptyFiles.every(file => fs.statSync(file).mtimeMs > latestMtime)).toBe(true);

    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: '2026-08-29T07:00:00.000Z' }], tempDir);
    const fullReadSpy = vi.spyOn(fs, 'readFileSync');
    try {
      const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });

      expect(res.statusCode).toBe(200);
      expect(res.json().recentWorkspaces[0]).toMatchObject({
        id: 'w1',
        continueSessionId: 'session-latest',
      });
      expect(fullReadSpy.mock.calls.some(([candidate]) => candidate === latestFile)).toBe(false);
    } finally {
      fullReadSpy.mockRestore();
    }
  });

  it('omits the continue target when a workspace has only empty sessions', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-home-empty-sessions-'));
    const sessionsDir = path.join(tempDir, 'workspaces', 'w1', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'session-empty.jsonl'),
      `${JSON.stringify({ type: 'meta', created: new Date().toISOString() })}\n`,
      'utf8',
    );

    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: new Date().toISOString() }], tempDir);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });

    expect(res.statusCode).toBe(200);
    expect(res.json().recentWorkspaces[0]).not.toHaveProperty('continueSessionId');
  });

  it('rejects a sessions directory symlink or junction outside the workspace', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-home-session-junction-'));
    const workspaceDir = path.join(tempDir, 'workspaces', 'w1');
    const outsideSessionsDir = path.join(tempDir, 'outside-sessions');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(outsideSessionsDir, { recursive: true });
    fs.writeFileSync(path.join(outsideSessionsDir, 'session-foreign.jsonl'), [
      JSON.stringify({ type: 'meta', created: new Date().toISOString() }),
      JSON.stringify({ role: 'user', content: 'Foreign workspace question' }),
      JSON.stringify({ role: 'assistant', content: 'Foreign workspace answer' }),
      '',
    ].join('\n'), 'utf8');
    fs.symlinkSync(
      outsideSessionsDir,
      path.join(workspaceDir, 'sessions'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: new Date().toISOString() }], tempDir);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });

    expect(res.statusCode).toBe(200);
    expect(res.json().recentWorkspaces[0]).not.toHaveProperty('continueSessionId');
  });

  it('fails closed when the sessions directory exceeds the total entry cap', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-home-session-entry-cap-'));
    const sessionsDir = path.join(tempDir, 'workspaces', 'w1', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'session-real.jsonl'), [
      JSON.stringify({ type: 'meta', created: new Date().toISOString() }),
      JSON.stringify({ role: 'user', content: 'Real question' }),
      JSON.stringify({ role: 'assistant', content: 'Real answer' }),
      '',
    ].join('\n'), 'utf8');
    for (let i = 0; i < 257; i += 1) {
      fs.writeFileSync(path.join(sessionsDir, `junk-${i}.tmp`), '', 'utf8');
    }

    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: new Date().toISOString() }], tempDir);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });

    expect(res.statusCode).toBe(200);
    expect(res.json().recentWorkspaces[0]).not.toHaveProperty('continueSessionId');
  });

  it('does not attach an unrelated newest session to memory-derived suggested actions', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-home-action-session-'));
    const workspaceDir = path.join(tempDir, 'workspaces', 'w1');
    const sessionsDir = path.join(workspaceDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const now = new Date();
    fs.writeFileSync(path.join(sessionsDir, 'session-newest.jsonl'), [
      JSON.stringify({ type: 'meta', created: now.toISOString() }),
      JSON.stringify({ role: 'user', content: 'Unrelated newer conversation' }),
      JSON.stringify({ role: 'assistant', content: 'Unrelated newer answer' }),
      '',
    ].join('\n'), 'utf8');

    const workspaceMind = new MindDB(path.join(workspaceDir, 'mind.db'));
    try {
      const session = new SessionStore(workspaceMind).create('home-action');
      new FrameStore(workspaceMind).createIFrame(
        session.gop_id,
        'Decision: prepare the customer launch checklist.',
        'important',
      );
    } finally {
      workspaceMind.close();
    }

    boot([{ id: 'w1', name: 'Alpha', group: 'Personal', created: now.toISOString() }], tempDir);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });

    expect(res.statusCode).toBe(200);
    expect(res.json().suggestedActions.length).toBeGreaterThan(0);
    expect(res.json().suggestedActions.every((action: { sessionId?: string }) => action.sessionId === undefined))
      .toBe(true);
  });

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

describe('upNext schedule aggregation (global jobs dedup + future-only)', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await server.close();
    db.close();
  });

  const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const globalSchedule = (id: number, name: string, nextRunAt: string): CronScheduleLike => ({
    id,
    name,
    cron_expr: '30 3 * * *',
    enabled: 1,
    workspace_id: null,
    next_run_at: nextRunAt,
  } as CronScheduleLike);

  const threeWorkspaces: TestWorkspace[] = ['a', 'b', 'c'].map((id, i) => ({
    id,
    name: `Workspace ${id}`,
    group: 'Personal',
    created: new Date(Date.parse('2026-06-11T12:00:00Z') + i * 3_600_000).toISOString(),
  }));

  it('a global schedule surfaces once across multiple workspaces, not once per workspace', async () => {
    db = new MindDB(':memory:');
    server = createTestServer(db, threeWorkspaces, [
      globalSchedule(1, 'Memory compaction', FUTURE),
    ]);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    expect(res.statusCode).toBe(200);
    const labels = (res.json().upNext as Array<{ label: string }>).map((u) => u.label);
    const compactions = labels.filter((l) => l.startsWith('Memory compaction'));
    expect(compactions).toHaveLength(1);
  });

  it('past-due schedules never display as upcoming', async () => {
    db = new MindDB(':memory:');
    server = createTestServer(db, threeWorkspaces, [
      globalSchedule(1, 'Memory compaction', PAST),
      globalSchedule(2, 'Harvest sync', FUTURE),
    ]);
    const res = await server.inject({ method: 'GET', url: '/api/home/briefing' });
    const labels = (res.json().upNext as Array<{ label: string }>).map((u) => u.label);
    expect(labels.some((l) => l.startsWith('Memory compaction'))).toBe(false);
    expect(labels.filter((l) => l.startsWith('Harvest sync'))).toHaveLength(1);
  });

  it('buildUpcomingSchedules unit: filters past, keeps future, scopes by workspace', () => {
    const out = buildUpcomingSchedules(
      [
        globalSchedule(1, 'Past job', PAST),
        globalSchedule(2, 'Future job', FUTURE),
        { ...globalSchedule(3, 'Other ws job', FUTURE), workspace_id: 'other' } as CronScheduleLike,
      ],
      'mine',
    );
    expect(out.some((l) => l.startsWith('Past job'))).toBe(false);
    expect(out.some((l) => l.startsWith('Future job'))).toBe(true);
    expect(out.some((l) => l.startsWith('Other ws job'))).toBe(false);
  });
});
