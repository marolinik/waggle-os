/**
 * POST /api/tier/start-trial — atomic trial start.
 *
 * Pins the contract used by Desktop's UpgradeModal `onStartTrial` and the
 * onboarding-complete handler. The previous path silently failed for two
 * reasons (missing `adapter.updateSettings`, server `PATCH /api/tier`
 * ignoring `trialStartedAt`); this route + these tests guard against either
 * regression.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildLocalServer } from '../src/local/index.js';
import { authInject } from './test-utils.js';

function readConfig(dataDir: string): Record<string, unknown> {
  const p = path.join(dataDir, 'config.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
}

function writeConfig(dataDir: string, value: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(value), 'utf-8');
}

describe('POST /api/tier/start-trial', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-start-trial-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 */ }
  });

  it('starts a fresh trial — writes tier=TRIAL + trialStartedAt and returns 200', async () => {
    const before = Date.now();
    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/tier/start-trial',
    }));
    const after = Date.now();

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      tier: string; rawTier: string; trialStartedAt: string;
      trialDaysRemaining: number; trialExpired: boolean;
      capabilities: Record<string, unknown>;
    };
    expect(body.tier).toBe('TRIAL');
    expect(body.rawTier).toBe('TRIAL');
    expect(body.trialExpired).toBe(false);
    // Fresh trial is 15 days; Math.ceil floor is 15.
    expect(body.trialDaysRemaining).toBe(15);

    // trialStartedAt must be a valid ISO timestamp within the request window.
    const t = new Date(body.trialStartedAt).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);

    // Server-side persistence — guards against the original PATCH /api/tier
    // bug where `trialStartedAt` was never written.
    const persisted = readConfig(tmpDir);
    expect(persisted.tier).toBe('TRIAL');
    expect(persisted.trialStartedAt).toBe(body.trialStartedAt);
    expect(server.localConfig.tier).toBe('TRIAL');
    expect(server.sessionManager.getMaxSessions()).toBe(100);
  });

  it('returns 409 TRIAL_ALREADY_STARTED if a trial timestamp is already on disk', async () => {
    const earlier = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    writeConfig(tmpDir, { tier: 'TRIAL', trialStartedAt: earlier });

    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/tier/start-trial',
    }));

    expect(res.statusCode).toBe(409);
    const body = res.json() as {
      error: string; tier: string; trialStartedAt: string; trialDaysRemaining: number;
    };
    expect(body.error).toBe('TRIAL_ALREADY_STARTED');
    expect(body.trialStartedAt).toBe(earlier);
    // 5 days in → ~10 days remaining.
    expect(body.trialDaysRemaining).toBe(10);

    // Crucially: the timestamp on disk must NOT have been overwritten.
    const persisted = readConfig(tmpDir);
    expect(persisted.trialStartedAt).toBe(earlier);
  });

  it('returns 409 for an expired trial (no silent restart) and reports trialExpired=true', async () => {
    // 16 days ago — past the 15-day trial window.
    const long_ago = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    writeConfig(tmpDir, { tier: 'TRIAL', trialStartedAt: long_ago });

    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/tier/start-trial',
    }));

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string; tier: string; trialExpired: boolean };
    expect(body.error).toBe('TRIAL_ALREADY_STARTED');
    // Effective tier downgraded to FREE; rawTier still TRIAL; trialExpired flag set.
    expect(body.tier).toBe('FREE');
    expect(body.trialExpired).toBe(true);

    // Disk untouched.
    const persisted = readConfig(tmpDir);
    expect(persisted.trialStartedAt).toBe(long_ago);
    expect(persisted.tier).toBe('TRIAL');
  });

  it('does not overwrite an existing paid tier — 409 still fires when trialStartedAt is set on a TEAMS tier', async () => {
    // Edge case: a TEAMS user who happens to have an old trial timestamp from
    // before they upgraded. We must not downgrade them by re-applying TRIAL.
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    writeConfig(tmpDir, { tier: 'TEAMS', trialStartedAt: old });

    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/tier/start-trial',
    }));

    expect(res.statusCode).toBe(409);
    // Disk must keep TEAMS.
    const persisted = readConfig(tmpDir);
    expect(persisted.tier).toBe('TEAMS');
  });

  it('applies a persisted paid tier to the runtime session cap on startup', async () => {
    await server.close();
    writeConfig(tmpDir, { tier: 'TEAMS' });
    server = await buildLocalServer({ dataDir: tmpDir });

    expect(server.localConfig.tier).toBe('TEAMS');
    expect(server.sessionManager.getMaxSessions()).toBe(25);
  });
});

// ── AV-3 — PATCH /api/tier is a dev-only override, disabled in production ──
// Under the loopback-trust model this route was an unauthenticated free-upgrade
// path. It now fails closed unless WAGGLE_ALLOW_TIER_OVERRIDE=1.
describe('PATCH /api/tier override gate (AV-3)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tier-gate-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });
  afterEach(async () => {
    delete process.env.WAGGLE_ALLOW_TIER_OVERRIDE;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 */ }
  });

  it('rejects PATCH /api/tier by default (override disabled) — no free upgrade', async () => {
    delete process.env.WAGGLE_ALLOW_TIER_OVERRIDE;
    const res = await server.inject(authInject(server, {
      method: 'PATCH', url: '/api/tier', payload: { tier: 'TEAMS' },
    }));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('TIER_OVERRIDE_DISABLED');
    expect(readConfig(tmpDir).tier).not.toBe('TEAMS');
  });

  it('allows PATCH /api/tier when WAGGLE_ALLOW_TIER_OVERRIDE=1 (dev/test)', async () => {
    process.env.WAGGLE_ALLOW_TIER_OVERRIDE = '1';
    const res = await server.inject(authInject(server, {
      method: 'PATCH', url: '/api/tier', payload: { tier: 'TEAMS' },
    }));
    expect(res.statusCode).toBe(200);
    expect(readConfig(tmpDir).tier).toBe('TEAMS');
    expect(server.localConfig.tier).toBe('TEAMS');
    expect(server.sessionManager.getMaxSessions()).toBe(25);
  });
});

// ── D1 — loopback now requires a token; the webview bootstraps it ──────────
describe('D1 loopback auth + session-token bootstrap', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const originalHost = process.env.WAGGLE_HOST;
  const originalInstanceId = process.env.WAGGLE_INSTANCE_ID;
  const originalDesktopBootstrap = process.env.WAGGLE_DESKTOP_BOOTSTRAP_TOKEN;
  const desktopBootstrap = 'desktop-bootstrap-test-1234567890';

  beforeEach(async () => {
    // Exercise the SECURE D1 default (the suite setup defaults trust ON).
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    process.env.WAGGLE_INSTANCE_ID = 'desktop-instance-test';
    process.env.WAGGLE_DESKTOP_BOOTSTRAP_TOKEN = desktopBootstrap;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-d1-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });
  afterEach(async () => {
    await server.close();
    process.env.WAGGLE_TRUST_LOCALHOST = '1';
    if (originalHost === undefined) delete process.env.WAGGLE_HOST;
    else process.env.WAGGLE_HOST = originalHost;
    if (originalInstanceId === undefined) delete process.env.WAGGLE_INSTANCE_ID;
    else process.env.WAGGLE_INSTANCE_ID = originalInstanceId;
    if (originalDesktopBootstrap === undefined) delete process.env.WAGGLE_DESKTOP_BOOTSTRAP_TOKEN;
    else process.env.WAGGLE_DESKTOP_BOOTSTRAP_TOKEN = originalDesktopBootstrap;
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 */ }
  });

  it('serves the session token only with the per-launch desktop bootstrap credential', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/session-token',
      headers: { 'x-waggle-desktop-bootstrap': desktopBootstrap },
    });
    expect(res.statusCode).toBe(200);
    const token = res.json().token as string;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('scrubs the launch credential before child processes can inherit it', () => {
    expect(process.env.WAGGLE_DESKTOP_BOOTSTRAP_TOKEN).toBeUndefined();
  });

  it('rejects a browser-reachable Tauri origin without the IPC-only bootstrap credential', async () => {
    const missing = await server.inject({
      method: 'GET',
      url: '/api/auth/session-token',
      headers: { origin: 'http://tauri.localhost' },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().code).toBe('DESKTOP_BOOTSTRAP_REQUIRED');

    const wrong = await server.inject({
      method: 'GET',
      url: '/api/auth/session-token',
      headers: {
        origin: 'http://tauri.localhost',
        'x-waggle-desktop-bootstrap': 'wrong-bootstrap-token-1234567890',
      },
    });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().code).toBe('DESKTOP_BOOTSTRAP_REQUIRED');
  });

  it('binds browser-mode bootstrap to the exact request authority', async () => {
    await server.close();
    delete process.env.WAGGLE_INSTANCE_ID;
    delete process.env.WAGGLE_DESKTOP_BOOTSTRAP_TOKEN;
    server = await buildLocalServer({ dataDir: tmpDir });

    const crossLoopback = await server.inject({
      method: 'GET',
      url: '/api/auth/session-token',
      headers: {
        host: '127.0.0.1:3333',
        origin: 'http://127.0.0.1:5174',
      },
    });
    expect(crossLoopback.statusCode).toBe(403);

    const sameOrigin = await server.inject({
      method: 'GET',
      url: '/api/auth/session-token',
      headers: {
        host: '127.0.0.1:3333',
        origin: 'http://127.0.0.1:3333',
      },
    });
    expect(sameOrigin.statusCode).toBe(200);
  });

  it('does not expose the process bearer when the sidecar is non-loopback-bound', async () => {
    await server.close();
    process.env.WAGGLE_HOST = '0.0.0.0';
    server = await buildLocalServer({ dataDir: tmpDir });

    const res = await server.inject({ method: 'GET', url: '/api/auth/session-token' });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SESSION_BOOTSTRAP_LOOPBACK_ONLY');
  });

  it('requires a bearer token on a normal route (loopback no longer trusted)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tier' });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a normal route when the bootstrapped token is presented', async () => {
    const token = (await server.inject({
      method: 'GET',
      url: '/api/auth/session-token',
      headers: { 'x-waggle-desktop-bootstrap': desktopBootstrap },
    })).json().token as string;
    const res = await server.inject({
      method: 'GET', url: '/api/tier',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
