/**
 * P4 (UX-Refactor) — server-authoritative onboarding status.
 *
 * THE clean-install pin: a freshly-booted server (ensureDefault already seeded
 * the default workspace, personal mind empty, no flag) must report
 * completed:false — the workspace-count heuristic this replaces reported the
 * seeded stub as a "returning user" and silently skipped the wizard for every
 * brand-new production install (S4 founder flag, confirmed in P4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import {
  onboardingRoutes,
  readOrCreateProfileId,
} from '../../src/local/routes/onboarding.js';

function createTestServer(dataDir: string, db: MindDB, workspaces: Array<{ id: string }>) {
  const server = Fastify({ logger: false });
  // Deliberate partial doubles: only the members the onboarding routes read.
  server.decorate('localConfig', { dataDir } as unknown as FastifyInstance['localConfig']);
  server.decorate('multiMind', { personal: db } as unknown as FastifyInstance['multiMind']);
  server.decorate('workspaceManager', {
    list: () => workspaces,
  } as unknown as FastifyInstance['workspaceManager']);
  server.register(onboardingRoutes);
  return server;
}

const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_ID_KEY = 'onboarding_profile_id';
const PROFILE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function expectBoundStatus(
  response: { json: () => unknown },
  expected: { completed: boolean; source: string },
): { completed: boolean; source: string; profileId: string } {
  const body = response.json() as { completed: boolean; source: string; profileId: string };
  expect(body).toMatchObject(expected);
  expect(body.profileId).toMatch(PROFILE_ID_PATTERN);
  return body;
}

describe('GET/POST /api/onboarding (P4 clean-install fix)', () => {
  let tmp: string;
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;
  // The boot-seeded default workspace is ALWAYS present (ensureDefault).
  const seededOnly = [{ id: 'default-workspace' }];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-onb-test-'));
    db = new MindDB(':memory:');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('CLEAN INSTALL: seeded default workspace + empty mind + no flag → completed:false', async () => {
    server = createTestServer(tmp, db, seededOnly);
    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(res.statusCode).toBe(200);
    expectBoundStatus(res, { completed: false, source: 'none' });
  });

  it('PROFILE BINDING: stores one opaque stable id in the logical personal profile', async () => {
    db.close();
    const dbPath = path.join(tmp, 'personal.mind');
    db = new MindDB(dbPath);
    server = createTestServer(tmp, db, seededOnly);
    const first = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    const firstBody = first.json() as { profileId?: string };

    expect(firstBody.profileId).toMatch(PROFILE_ID_PATTERN);
    expect(firstBody.profileId).not.toContain(tmp);
    expect(
      db.getDatabase()
        .prepare('SELECT value FROM meta WHERE key = ?')
        .get(PROFILE_ID_KEY),
    ).toEqual({ value: firstBody.profileId });

    await server.close();
    db.close();
    db = new MindDB(dbPath);
    server = createTestServer(tmp, db, seededOnly);
    const second = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect((second.json() as { profileId?: string }).profileId).toBe(firstBody.profileId);

    const otherTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-onb-other-'));
    const otherDb = new MindDB(path.join(otherTmp, 'personal.mind'));
    const otherServer = createTestServer(otherTmp, otherDb, seededOnly);
    try {
      const other = await otherServer.inject({ method: 'GET', url: '/api/onboarding/status' });
      expect((other.json() as { profileId?: string }).profileId).not.toBe(firstBody.profileId);
    } finally {
      await otherServer.close();
      otherDb.close();
      fs.rmSync(otherTmp, { recursive: true, force: true });
    }
  });

  it.each([
    { corruption: 'same-length non-UUID text', value: 'x'.repeat(36) },
    {
      corruption: 'valid UUID prefix with a hidden suffix',
      value: '11111111-1111-4111-8111-111111111111\0suffix',
    },
    { corruption: 'oversized text', value: 'x'.repeat(1024 * 1024) },
    { corruption: 'BLOB storage', value: Buffer.alloc(1024 * 1024, 0x78) },
  ])('PROFILE BINDING: atomically repairs $corruption metadata', async ({ value }) => {
    db.getDatabase()
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
      .run(PROFILE_ID_KEY, value);
    server = createTestServer(tmp, db, seededOnly);

    const response = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    const body = expectBoundStatus(response, { completed: false, source: 'none' });
    expect(
      db.getDatabase()
        .prepare('SELECT value FROM meta WHERE key = ?')
        .get(PROFILE_ID_KEY),
    ).toEqual({ value: body.profileId });
    const repeated = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(expectBoundStatus(repeated, { completed: false, source: 'pending' }).profileId).toBe(body.profileId);
  });

  it('PROFILE BINDING: preserves an existing valid profile id', async () => {
    const profileId = '33333333-3333-4333-8333-333333333333';
    db.getDatabase()
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
      .run(PROFILE_ID_KEY, profileId);
    const generate = vi.fn(() => '44444444-4444-4444-8444-444444444444');
    expect(readOrCreateProfileId(db, generate)).toBe(profileId);
    expect(generate).not.toHaveBeenCalled();
    server = createTestServer(tmp, db, seededOnly);

    const response = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    const body = expectBoundStatus(response, { completed: false, source: 'none' });
    expect(body.profileId).toBe(profileId);
    expect(
      db.getDatabase()
        .prepare('SELECT value FROM meta WHERE key = ?')
        .get(PROFILE_ID_KEY),
    ).toEqual({ value: profileId });
  });

  it.each([
    { state: 'missing metadata', seed: false },
    { state: 'malformed metadata', seed: true },
  ])('PROFILE BINDING: two connections deterministically converge from $state', async ({ seed }) => {
    db.close();
    const dbPath = path.join(tmp, 'personal.mind');
    db = new MindDB(dbPath);
    const secondDb = new MindDB(dbPath);
    server = createTestServer(tmp, db, seededOnly);
    try {
      if (seed) {
        db.getDatabase()
          .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
          .run(PROFILE_ID_KEY, 'partial');
      }
      const winner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const loser = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      let secondResult: string | undefined;
      const generate = vi.fn(() => {
        secondResult = readOrCreateProfileId(secondDb, () => winner);
        return loser;
      });

      const firstResult = readOrCreateProfileId(db, generate);

      expect(generate).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(winner);
      expect(secondResult).toBe(winner);
      expect(readOrCreateProfileId(db)).toBe(winner);
      expect(readOrCreateProfileId(secondDb)).toBe(winner);
    } finally {
      secondDb.close();
    }
  });

  it('PROFILE BINDING: metadata failure keeps status usable and omits the binding', async () => {
    fs.writeFileSync(path.join(tmp, 'onboarding-pending.flag'), 'pending');
    vi.spyOn(db, 'getDatabase').mockImplementationOnce(() => {
      throw new Error('database unavailable');
    });
    server = createTestServer(tmp, db, seededOnly);

    const response = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ completed: false, source: 'pending' });
  });

  it('completion flag → completed:true (the POST stamp round-trip)', async () => {
    server = createTestServer(tmp, db, seededOnly);
    const profileId = readOrCreateProfileId(db);
    const post = await server.inject({
      method: 'POST',
      url: '/api/onboarding/complete',
      payload: { expectedProfileId: profileId },
    });
    expect(post.statusCode).toBe(200);
    expect(fs.existsSync(path.join(tmp, 'first-launch.flag'))).toBe(true);

    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(res, { completed: true, source: 'flag' });
  });

  it('PROFILE-BOUND COMPLETION: rejects a stale profile without stamping the active data dir', async () => {
    db.getDatabase()
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
      .run(PROFILE_ID_KEY, PROFILE_B);
    fs.writeFileSync(path.join(tmp, 'onboarding-pending.flag'), 'pending');
    server = createTestServer(tmp, db, seededOnly);

    const post = await server.inject({
      method: 'POST',
      url: '/api/onboarding/complete',
      payload: { expectedProfileId: PROFILE_A },
    });

    expect(post.statusCode).toBe(409);
    expect(post.json()).toEqual({
      error: 'ONBOARDING_PROFILE_CHANGED',
      message: 'The active onboarding profile changed. Retry onboarding status.',
    });
    expect(fs.existsSync(path.join(tmp, 'first-launch.flag'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'onboarding-pending.flag'), 'utf8')).toBe('pending');
    const profile = db.getDatabase()
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(PROFILE_ID_KEY) as { value: string };
    expect(profile.value).toBe(PROFILE_B);
    const status = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(status, { completed: false, source: 'pending' });
  });

  it('PROFILE-BOUND COMPLETION: rejects a missing precondition', async () => {
    fs.writeFileSync(path.join(tmp, 'onboarding-pending.flag'), 'pending');
    server = createTestServer(tmp, db, seededOnly);

    const post = await server.inject({ method: 'POST', url: '/api/onboarding/complete' });

    expect(post.statusCode).toBe(400);
    expect(post.json()).toEqual({
      error: 'ONBOARDING_PROFILE_REQUIRED',
      message: 'A valid onboarding profile is required.',
    });
    expect(fs.existsSync(path.join(tmp, 'first-launch.flag'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'onboarding-pending.flag'), 'utf8')).toBe('pending');
    expect(db.getDatabase().prepare('SELECT value FROM meta WHERE key = ?').get(PROFILE_ID_KEY))
      .toBeUndefined();
  });

  it('PROFILE-BOUND COMPLETION: rejects a malformed precondition', async () => {
    fs.writeFileSync(path.join(tmp, 'onboarding-pending.flag'), 'pending');
    server = createTestServer(tmp, db, seededOnly);

    const post = await server.inject({
      method: 'POST',
      url: '/api/onboarding/complete',
      payload: { expectedProfileId: `${PROFILE_A}-suffix` },
    });

    expect(post.statusCode).toBe(400);
    expect(post.json()).toEqual({
      error: 'ONBOARDING_PROFILE_REQUIRED',
      message: 'A valid onboarding profile is required.',
    });
    expect(fs.existsSync(path.join(tmp, 'first-launch.flag'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'onboarding-pending.flag'), 'utf8')).toBe('pending');
    expect(db.getDatabase().prepare('SELECT value FROM meta WHERE key = ?').get(PROFILE_ID_KEY))
      .toBeUndefined();
  });

  it('PROFILE-BOUND COMPLETION: fails closed when the active profile is unavailable', async () => {
    fs.writeFileSync(path.join(tmp, 'onboarding-pending.flag'), 'pending');
    vi.spyOn(db, 'getDatabase').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    server = createTestServer(tmp, db, seededOnly);

    const post = await server.inject({
      method: 'POST',
      url: '/api/onboarding/complete',
      payload: { expectedProfileId: PROFILE_A },
    });

    expect(post.statusCode).toBe(503);
    expect(post.json()).toEqual({
      error: 'ONBOARDING_PROFILE_UNAVAILABLE',
      message: 'The active onboarding profile is unavailable.',
    });
    expect(fs.existsSync(path.join(tmp, 'first-launch.flag'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'onboarding-pending.flag'), 'utf8')).toBe('pending');
  });

  it('legacy evidence: any frame in the personal mind → completed:true', async () => {
    const sessions = new SessionStore(db);
    const gop = sessions.create().gop_id;
    new FrameStore(db).createIFrame(gop, 'Real prior usage.', 'normal');
    server = createTestServer(tmp, db, seededOnly);

    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(res, { completed: true, source: 'legacy-evidence' });
  });

  it('legacy evidence: user-created workspaces beyond the seeded default → completed:true', async () => {
    server = createTestServer(tmp, db, [...seededOnly, { id: 'my-real-project' }]);
    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(res, { completed: true, source: 'legacy-evidence' });
  });

  it('POST is idempotent', async () => {
    server = createTestServer(tmp, db, seededOnly);
    const profileId = readOrCreateProfileId(db);
    const request = {
      method: 'POST' as const,
      url: '/api/onboarding/complete',
      payload: { expectedProfileId: profileId },
    };
    const first = await server.inject(request);
    const second = await server.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ completed: true });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ completed: true });
    expect(readOrCreateProfileId(db)).toBe(profileId);
  });

  it('PENDING LATCH: wizard-origin writes after the first status call never flip it (review chain)', async () => {
    server = createTestServer(tmp, db, seededOnly);
    // First status call on the clean install stamps the pending latch.
    const first = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    const firstStatus = expectBoundStatus(first, { completed: false, source: 'none' });
    expect(fs.existsSync(path.join(tmp, 'onboarding-pending.flag'))).toBe(true);

    // The wizard's step-1 profile write (PUT /api/profile → 'User identity:'
    // frame) — the exact pre-completion evidence the review verified. With
    // the latch, it must NOT turn the user into a "returning user".
    const sessions = new SessionStore(db);
    const gop = sessions.create().gop_id;
    new FrameStore(db).createIFrame(gop, 'User identity: Name: New User', 'important');

    const after = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(after, { completed: false, source: 'pending' });

    // Completion clears the latch and stamps the flag.
    const completed = await server.inject({
      method: 'POST',
      url: '/api/onboarding/complete',
      payload: { expectedProfileId: firstStatus.profileId },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({ completed: true });
    expect(fs.existsSync(path.join(tmp, 'onboarding-pending.flag'))).toBe(false);
    const done = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(done, { completed: true, source: 'flag' });
  });

  it('the latch never fires for a REAL returning user (evidence wins on first contact)', async () => {
    const sessions = new SessionStore(db);
    const gop = sessions.create().gop_id;
    new FrameStore(db).createIFrame(gop, 'Genuine prior usage.', 'normal');
    server = createTestServer(tmp, db, seededOnly);

    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expectBoundStatus(res, { completed: true, source: 'legacy-evidence' });
    expect(fs.existsSync(path.join(tmp, 'onboarding-pending.flag'))).toBe(false);
  });

  it('registration pin: the real server wires onboardingRoutes (drop = red)', () => {
    const indexSrc = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', '..', 'src', 'local', 'index.ts'),
      'utf-8',
    );
    expect(indexSrc).toContain("import { onboardingRoutes } from './routes/onboarding.js'");
    expect(indexSrc).toContain('server.register(onboardingRoutes)');
  });
});
