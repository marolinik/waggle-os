/**
 * P4 (UX-Refactor) — server-authoritative onboarding status.
 *
 * THE clean-install pin: a freshly-booted server (ensureDefault already seeded
 * the default workspace, personal mind empty, no flag) must report
 * completed:false — the workspace-count heuristic this replaces reported the
 * seeded stub as a "returning user" and silently skipped the wizard for every
 * brand-new production install (S4 founder flag, confirmed in P4).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { onboardingRoutes } from '../../src/local/routes/onboarding.js';

function createTestServer(dataDir: string, db: MindDB, workspaces: Array<{ id: string }>) {
  const server = Fastify({ logger: false });
  server.decorate('localConfig', { dataDir });
  server.decorate('multiMind', { personal: db });
  server.decorate('workspaceManager', { list: () => workspaces });
  server.register(onboardingRoutes);
  return server;
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
    await server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('CLEAN INSTALL: seeded default workspace + empty mind + no flag → completed:false', async () => {
    server = createTestServer(tmp, db, seededOnly);
    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ completed: false, source: 'none' });
  });

  it('completion flag → completed:true (the POST stamp round-trip)', async () => {
    server = createTestServer(tmp, db, seededOnly);
    const post = await server.inject({ method: 'POST', url: '/api/onboarding/complete' });
    expect(post.statusCode).toBe(200);
    expect(fs.existsSync(path.join(tmp, 'first-launch.flag'))).toBe(true);

    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(res.json()).toEqual({ completed: true, source: 'flag' });
  });

  it('legacy evidence: any frame in the personal mind → completed:true', async () => {
    const sessions = new SessionStore(db);
    const gop = sessions.create().gop_id;
    new FrameStore(db).createIFrame(gop, 'Real prior usage.', 'normal');
    server = createTestServer(tmp, db, seededOnly);

    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(res.json()).toEqual({ completed: true, source: 'legacy-evidence' });
  });

  it('legacy evidence: user-created workspaces beyond the seeded default → completed:true', async () => {
    server = createTestServer(tmp, db, [...seededOnly, { id: 'my-real-project' }]);
    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(res.json()).toEqual({ completed: true, source: 'legacy-evidence' });
  });

  it('POST is idempotent', async () => {
    server = createTestServer(tmp, db, seededOnly);
    await server.inject({ method: 'POST', url: '/api/onboarding/complete' });
    const second = await server.inject({ method: 'POST', url: '/api/onboarding/complete' });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ completed: true });
  });

  it('PENDING LATCH: wizard-origin writes after the first status call never flip it (review chain)', async () => {
    server = createTestServer(tmp, db, seededOnly);
    // First status call on the clean install stamps the pending latch.
    const first = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(first.json()).toEqual({ completed: false, source: 'none' });
    expect(fs.existsSync(path.join(tmp, 'onboarding-pending.flag'))).toBe(true);

    // The wizard's step-1 profile write (PUT /api/profile → 'User identity:'
    // frame) — the exact pre-completion evidence the review verified. With
    // the latch, it must NOT turn the user into a "returning user".
    const sessions = new SessionStore(db);
    const gop = sessions.create().gop_id;
    new FrameStore(db).createIFrame(gop, 'User identity: Name: New User', 'important');

    const after = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(after.json()).toEqual({ completed: false, source: 'pending' });

    // Completion clears the latch and stamps the flag.
    await server.inject({ method: 'POST', url: '/api/onboarding/complete' });
    expect(fs.existsSync(path.join(tmp, 'onboarding-pending.flag'))).toBe(false);
    const done = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(done.json()).toEqual({ completed: true, source: 'flag' });
  });

  it('the latch never fires for a REAL returning user (evidence wins on first contact)', async () => {
    const sessions = new SessionStore(db);
    const gop = sessions.create().gop_id;
    new FrameStore(db).createIFrame(gop, 'Genuine prior usage.', 'normal');
    server = createTestServer(tmp, db, seededOnly);

    const res = await server.inject({ method: 'GET', url: '/api/onboarding/status' });
    expect(res.json()).toEqual({ completed: true, source: 'legacy-evidence' });
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
