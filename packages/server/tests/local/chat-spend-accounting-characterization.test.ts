/**
 * Characterization test for how a chat turn's model spend is accounted
 * (TD-CHAT-8).
 *
 * In production the route hands the agent loop `modelSpendBudget: costTracker`
 * and the loop reserves and reconciles every model call itself. The route's
 * own `costTracker.addUsage` runs only for an injected `agentRunner`, which
 * bypasses the loop and its meter. Every other chat accounting test injects a
 * runner, so until this pin the production path was the one path no chat
 * test reached. This pin replaces `runAgentLoop` through a module mock and
 * meters through the config the route built, exactly as the loop does.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

const PAID_MODEL = 'openrouter/anthropic/claude-sonnet-5';

describe('POST /api/chat model spend accounting (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-spend-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('meters a production turn once, through the budget the route hands the loop', async () => {
    const configs: AgentLoopConfig[] = [];
    loop.runAgentLoop.mockImplementation(async (config: AgentLoopConfig) => {
      configs.push(config);
      const budget = config.modelSpendBudget!;
      const reservation = budget.reserveModelSpend({
        model: config.billingModel ?? config.model,
        inputTokens: 1_000,
        maxOutputTokens: 1_000,
        workspaceId: config.spendWorkspaceId,
        billingClass: config.modelSpendBillingClass,
      });
      budget.reconcileModelSpend(reservation, { inputTokens: 1_000, outputTokens: 1_000 });
      return { content: 'metered answer', toolsUsed: [], usage: { inputTokens: 1_000, outputTokens: 1_000 } };
    });
    const before = server.agentState.costTracker.getDailyTotal();

    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Summarise the plan for the quarterly review.', session: 'spend-production', model: PAID_MODEL },
    });
    expect(res.statusCode).toBe(200);

    expect(configs).toHaveLength(1);
    expect(configs[0].modelSpendBudget).toBe(server.agentState.costTracker);
    const done = JSON.parse(parseSSE(res.body).find(e => e.event === 'done')!.data) as { cost: number };
    expect(done.cost).toBeGreaterThan(0);
    // Once: the loop's reconcile is the only charge. The route's own addUsage
    // is skipped because no runner was injected.
    expect(server.agentState.costTracker.getDailyTotal() - before).toBeCloseTo(done.cost, 6);
  });
});
