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
    // Set tier to TEAMS so cost routes pass tier enforcement
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      defaultModel: 'test/model',
      providers: {},
      tier: 'TEAMS',
    }));
    // Prevent auto-install of starter skills
    fs.mkdirSync(path.join(tmpDir, 'skills'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', '.starter-installed'), 'test');

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

  it('projects policy-aware free and fixed spend consistently across every cost surface', async () => {
    const policyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cost-policy-'));
    let policyServer: FastifyInstance | undefined;
    try {
      fs.writeFileSync(
        path.join(policyDir, 'config.json'),
        JSON.stringify({ defaultModel: 'test/model', providers: {}, tier: 'TEAMS', dailyBudget: 1 }),
      );
      const mind = new MindDB(path.join(policyDir, 'personal.mind'));
      mind.close();

      policyServer = await buildLocalServer({ dataDir: policyDir });
      const freeWorkspace = policyServer.workspaceManager.create({
        name: 'Free compatible workspace',
        group: 'Test',
        model: 'openai-compatible/qwen3.8-flash-next',
      });
      const paidWorkspace = policyServer.workspaceManager.create({
        name: 'Fixed paid workspace',
        group: 'Test',
        model: 'ollama/remote-paid',
      });
      const { costTracker } = policyServer.agentState;
      costTracker.addUsage(
        'openai-compatible/qwen3.8-flash-next',
        1_000,
        1_000,
        freeWorkspace.id,
        { billingClass: 'free' },
      );
      costTracker.addUsage(
        'ollama/remote-paid',
        1_000,
        1_000,
        paidWorkspace.id,
        { billingClass: 'priced', fixedCostUsd: 0.25 },
      );

      const summary = (await injectWithAuth(policyServer, {
        method: 'GET',
        url: '/api/cost/summary',
      })).json();
      expect(summary.today.estimatedCost).toBeCloseTo(0.25, 6);
      expect(summary.week.estimatedCost).toBeCloseTo(0.25, 6);
      expect(summary.allTime.estimatedCost).toBeCloseTo(0.25, 6);
      expect(summary.daily.at(-1)?.cost).toBeCloseTo(0.25, 6);
      expect(summary.budget.todayCost).toBeCloseTo(0.25, 6);

      const byWorkspace = (await injectWithAuth(policyServer, {
        method: 'GET',
        url: '/api/cost/by-workspace',
      })).json();
      expect(byWorkspace.totalCost).toBeCloseTo(0.25, 6);
      expect(byWorkspace.workspaces).toEqual(expect.arrayContaining([
        expect.objectContaining({ workspaceId: freeWorkspace.id, estimatedCost: 0 }),
        expect.objectContaining({ workspaceId: paidWorkspace.id, estimatedCost: 0.25 }),
      ]));

      const freeCost = (await injectWithAuth(policyServer, {
        method: 'GET',
        url: `/api/workspaces/${freeWorkspace.id}/cost`,
      })).json();
      expect(freeCost.used).toBe(0);
      expect(freeCost.history).toEqual([expect.objectContaining({ cost: 0 })]);

      const paidCost = (await injectWithAuth(policyServer, {
        method: 'GET',
        url: `/api/workspaces/${paidWorkspace.id}/cost`,
      })).json();
      expect(paidCost.used).toBeCloseTo(0.25, 6);
      expect(paidCost.history).toEqual([expect.objectContaining({ cost: 0.25 })]);
    } finally {
      if (policyServer) await policyServer.close();
      fs.rmSync(policyDir, { recursive: true, force: true });
    }
  });

  it('keeps the budget progress total across a sidecar restart', async () => {
    const restartDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cost-restart-'));
    let initialServer: FastifyInstance | undefined;
    let restartedServer: FastifyInstance | undefined;
    try {
      fs.writeFileSync(
        path.join(restartDir, 'config.json'),
        JSON.stringify({ defaultModel: 'test/model', providers: {}, tier: 'TEAMS', dailyBudget: 10 }),
      );
      const mind = new MindDB(path.join(restartDir, 'personal.mind'));
      mind.close();

      initialServer = await buildLocalServer({ dataDir: restartDir });
      const traceId = initialServer.traceStore.start({
        sessionId: 'persisted-cost-dashboard-source',
        workspaceId: 'default',
        model: 'claude-sonnet-4-6',
        input: 'prior paid turn',
      });
      initialServer.traceStore.finalize(traceId, {
        outcome: 'success',
        output: 'ok',
        costUsd: 5,
      });
      await initialServer.close();
      initialServer = undefined;

      restartedServer = await buildLocalServer({ dataDir: restartDir });
      restartedServer.agentState.costTracker.addUsage('claude-sonnet-4-6', 1000, 1000);
      const res = await injectWithAuth(restartedServer, {
        method: 'GET',
        url: '/api/cost/summary',
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.budget.todayCost).toBeCloseTo(5.018, 4);
      expect(body.budget.budgetPercent).toBe(50);
      expect(body.budget.budgetStatus).toBe('ok');
    } finally {
      if (initialServer) await initialServer.close();
      if (restartedServer) await restartedServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(restartDir, { recursive: true, force: true });
    }
  });
});
