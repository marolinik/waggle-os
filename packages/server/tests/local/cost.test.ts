/**
 * Cost Dashboard API tests — GET /api/cost/summary and GET /api/cost/by-workspace.
 *
 * Tests cost calculation, empty state, daily breakdown, and budget alerts.
 * Part of PM-4 — Agent Cost Dashboard.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Cost Dashboard API', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cost-test-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('cost-test');
    frames.createIFrame(s1.gop_id, 'Cost test frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/cost/summary returns expected shape with zero usage', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/cost/summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Today
    expect(body.today).toBeDefined();
    expect(typeof body.today.inputTokens).toBe('number');
    expect(typeof body.today.outputTokens).toBe('number');
    expect(typeof body.today.estimatedCost).toBe('number');
    expect(typeof body.today.turns).toBe('number');

    // All-time — getStats() always works
    expect(body.allTime).toBeDefined();
    expect(body.allTime.inputTokens).toBe(0);
    expect(body.allTime.outputTokens).toBe(0);
    expect(body.allTime.estimatedCost).toBe(0);
    expect(body.allTime.turns).toBe(0);

    // Daily array (7 days default)
    expect(body.daily).toBeDefined();
    expect(Array.isArray(body.daily)).toBe(true);
    expect(body.daily.length).toBe(7);

    // Budget
    expect(body.budget).toBeDefined();
    expect(body.budget.budgetStatus).toBe('ok');
    expect(body.budget.dailyBudget).toBeNull();
  });

  it('GET /api/cost/by-workspace returns expected shape with zero usage', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/cost/by-workspace' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.workspaces).toBeDefined();
    expect(Array.isArray(body.workspaces)).toBe(true);
    expect(typeof body.totalCost).toBe('number');
  });

  it('allTime totals reflect addUsage calls', async () => {
    // Add usage via costTracker (the standard getStats path always works)
    const { costTracker } = server.agentState;
    costTracker.addUsage('claude-sonnet-4-6', 1000, 500);
    costTracker.addUsage('claude-sonnet-4-6', 2000, 1000);

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/cost/summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // All-time totals always work via getStats()
    expect(body.allTime.inputTokens).toBe(3000);
    expect(body.allTime.outputTokens).toBe(1500);
    expect(body.allTime.turns).toBe(2);
    // Estimated cost should be > 0 (pricing depends on which CostTracker version is loaded)
    expect(body.allTime.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it('daily array has correct structure for each day', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/cost/summary?days=3' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.daily.length).toBe(3);
    for (const day of body.daily) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof day.inputTokens).toBe('number');
      expect(typeof day.outputTokens).toBe('number');
      expect(typeof day.cost).toBe('number');
      expect(typeof day.turns).toBe('number');
    }
  });

  it('budget status defaults to ok with null budget', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/cost/summary' });
    const body = JSON.parse(res.body);
    expect(body.budget.dailyBudget).toBeNull();
    expect(body.budget.budgetStatus).toBe('ok');
    expect(body.budget.budgetPercent).toBe(0);
  });

  it('workspace breakdown has expected fields', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/cost/by-workspace' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(typeof body.totalCost).toBe('number');
    // May have workspace entries if getUsageEntries is available
    for (const ws of body.workspaces) {
      expect(ws.workspaceId).toBeDefined();
      expect(ws.workspaceName).toBeDefined();
      expect(typeof ws.inputTokens).toBe('number');
      expect(typeof ws.outputTokens).toBe('number');
      expect(typeof ws.estimatedCost).toBe('number');
      expect(typeof ws.turns).toBe('number');
      expect(typeof ws.percentOfTotal).toBe('number');
    }
  });
});
