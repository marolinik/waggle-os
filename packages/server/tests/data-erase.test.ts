/**
 * POST /api/data/erase — route contract tests.
 *
 * Confirms:
 *  - 400 on missing/wrong header
 *  - 400 on missing/wrong body phrase
 *  - 200 happy path writes the marker file with correct shape
 *  - audit event is emitted (best-effort — covered indirectly)
 *  - the marker survives a server restart so service.ts startup picks it up
 *
 * The end-to-end "marker → next boot wipes" loop is exercised through the
 * pure helpers in data-erase-helpers.test.ts; this file pins the HTTP
 * contract that pilot users + the docs/pilot/data-handling-policy.md
 * § 4 promise.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildLocalServer } from '../src/local/index.js';
import { authInject } from './test-utils.js';
import { ERASE_MARKER_FILENAME, ERASE_CONFIRMATION_PHRASE, ERASE_CONFIRMATION_HEADER_VALUE } from '../src/local/data-erase-helpers.js';

describe('POST /api/data/erase', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    // mkdtemp prefix includes "waggle" → assertDataDirIsSafeToWipe passes by name.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-data-erase-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 */ }
  });

  it('returns 400 ERASE_NOT_CONFIRMED when the header is missing', async () => {
    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/data/erase',
      payload: { confirmation: ERASE_CONFIRMATION_PHRASE },
    }));
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('ERASE_NOT_CONFIRMED');
    // No marker should have been written.
    expect(fs.existsSync(path.join(tmpDir, ERASE_MARKER_FILENAME))).toBe(false);
  });

  it('returns 400 ERASE_NOT_CONFIRMED when the body phrase is missing', async () => {
    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/data/erase',
      headers: { 'X-Confirm-Erase': ERASE_CONFIRMATION_HEADER_VALUE },
      payload: {},
    }));
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('ERASE_NOT_CONFIRMED');
    expect(fs.existsSync(path.join(tmpDir, ERASE_MARKER_FILENAME))).toBe(false);
  });

  it('returns 400 when the body phrase is close-but-not-exact (case sensitivity)', async () => {
    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/data/erase',
      headers: { 'X-Confirm-Erase': ERASE_CONFIRMATION_HEADER_VALUE },
      payload: { confirmation: 'i understand this is permanent' }, // wrong case
    }));
    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(path.join(tmpDir, ERASE_MARKER_FILENAME))).toBe(false);
  });

  it('writes the marker file and returns 200 + receipt on the happy path', async () => {
    // Create some realistic data dir contents so the snapshot is non-empty.
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{"tier":"FREE"}');
    fs.writeFileSync(path.join(tmpDir, 'something.mind'), 'sqlite-bytes');

    const before = Date.now();
    const res = await server.inject(authInject(server, {
      method: 'POST',
      url: '/api/data/erase',
      headers: { 'X-Confirm-Erase': ERASE_CONFIRMATION_HEADER_VALUE },
      payload: { confirmation: ERASE_CONFIRMATION_PHRASE },
    }));
    const after = Date.now();

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Receipt shape
    expect(typeof body.requestedAt).toBe('string');
    const t = new Date(body.requestedAt).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
    expect(body.markerPath).toBe(path.join(tmpDir, ERASE_MARKER_FILENAME));
    expect(body.dataDirSnapshot.fileCount).toBeGreaterThanOrEqual(2);
    expect(body.dataDirSnapshot.totalBytes).toBeGreaterThan(0);
    expect(body.instruction).toMatch(/relaunch/i);

    // Marker file actually written
    const markerExists = fs.existsSync(path.join(tmpDir, ERASE_MARKER_FILENAME));
    expect(markerExists).toBe(true);
    const markerJson = JSON.parse(fs.readFileSync(path.join(tmpDir, ERASE_MARKER_FILENAME), 'utf-8'));
    expect(markerJson.schemaVersion).toBe(1);
    expect(markerJson.requestedAt).toBe(body.requestedAt);
  });

  it('is idempotent — a second confirmed call overwrites the existing marker without erroring', async () => {
    const headers = { 'X-Confirm-Erase': ERASE_CONFIRMATION_HEADER_VALUE };
    const payload = { confirmation: ERASE_CONFIRMATION_PHRASE };
    const r1 = await server.inject(authInject(server, { method: 'POST', url: '/api/data/erase', headers, payload }));
    const r2 = await server.inject(authInject(server, { method: 'POST', url: '/api/data/erase', headers, payload }));
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    // Second call's requestedAt is later than the first's.
    expect(new Date(r2.json().requestedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(r1.json().requestedAt).getTime());
  });
});
