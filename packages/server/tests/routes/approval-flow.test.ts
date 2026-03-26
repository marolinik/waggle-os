import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

/**
 * Tests the server-side approval flow:
 * pending approval → POST approve → promise resolves
 *
 * This proves the HTTP POST path that the UI's approveAction() calls.
 */
describe('Approval Flow — Server Side', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-approval-test-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/approval/:id resolves a pending approval promise', async () => {
    const requestId = 'test-approval-123';
    let resolved = false;
    let approvedValue: boolean | undefined;

    // Simulate what the chat route does: create a pending approval
    const approvalPromise = new Promise<boolean>((resolve) => {
      server.agentState.pendingApprovals.set(requestId, {
        resolve,
        toolName: 'install_capability',
        input: { name: 'risk-assessment', source: 'starter-pack' },
        timestamp: Date.now(),
      });
    });

    approvalPromise.then((v) => { resolved = true; approvedValue = v; });

    // Verify it's pending
    expect(server.agentState.pendingApprovals.has(requestId)).toBe(true);

    // Simulate what the UI does: POST approval
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/approval/${requestId}`,
      payload: { approved: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.approved).toBe(true);

    // Wait for the promise to resolve
    const result = await approvalPromise;
    expect(result).toBe(true);
    expect(resolved).toBe(true);
    expect(approvedValue).toBe(true);

    // Pending approval should be cleaned up
    expect(server.agentState.pendingApprovals.has(requestId)).toBe(false);
  });

  it('POST /api/approval/:id with approved=false denies', async () => {
    const requestId = 'test-deny-456';

    const approvalPromise = new Promise<boolean>((resolve) => {
      server.agentState.pendingApprovals.set(requestId, {
        resolve,
        toolName: 'install_capability',
        input: { name: 'risk-assessment', source: 'starter-pack' },
        timestamp: Date.now(),
      });
    });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/approval/${requestId}`,
      payload: { approved: false },
    });

    expect(res.statusCode).toBe(200);
    const result = await approvalPromise;
    expect(result).toBe(false);
  });

  it('POST /api/approval/:id returns 404 for unknown requestId', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/approval/nonexistent-id',
      payload: { approved: true },
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /api/approval/pending lists pending approvals', async () => {
    const requestId = 'test-pending-789';

    server.agentState.pendingApprovals.set(requestId, {
      resolve: () => {},
      toolName: 'install_capability',
      input: { name: 'daily-plan', source: 'starter-pack' },
      timestamp: Date.now(),
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/approval/pending',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.count).toBeGreaterThanOrEqual(1);
    const found = body.pending.find((p: any) => p.requestId === requestId);
    expect(found).toBeDefined();
    expect(found.toolName).toBe('install_capability');

    // Cleanup
    server.agentState.pendingApprovals.delete(requestId);
  });
});
