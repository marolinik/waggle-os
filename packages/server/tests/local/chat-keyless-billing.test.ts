/**
 * Pins for pricing a turn on a configured keyless OpenAI-compatible model.
 * Each test builds its own server over its own data directory, because the
 * provider configuration is the subject (moved out of chat-api.test.ts,
 * TD-TEST-7).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaggleConfig } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, parseSSE } from '../test-utils.js';

describe('keyless model billing', () => {
  it('marks only an exact configured keyless OpenAI-compatible model as free', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-keyless-billing-'));
    const configuredModel = 'openai-compatible/qwen3.8-flash-next';
    const config = new WaggleConfig(dataDir);
    config.setDefaultModel(configuredModel);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['qwen3.8-flash-next'],
      baseUrl: 'http://127.0.0.1:1/v1',
    });
    config.save();
    const localServer = await buildLocalServer({ dataDir });
    const workspace = localServer.workspaceManager.create({
      name: 'Keyless billing workspace',
      group: 'Test',
      model: configuredModel,
    });
    const paidWorkspace = localServer.workspaceManager.create({
      name: 'Explicit paid billing workspace',
      group: 'Test',
      model: 'ollama/remote-paid',
    });
    const capturedConfigs: AgentLoopConfig[] = [];
    localServer.agentRunner = async (runnerConfig): Promise<AgentResponse> => {
      capturedConfigs.push(runnerConfig);
      runnerConfig.onToken?.('billing-class-ok');
      return {
        content: 'billing-class-ok',
        toolsUsed: [],
        usage: { inputTokens: 11, outputTokens: 3 },
      };
    };

    try {
      const configured = await injectWithAuth(localServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Use the configured local model.',
          model: configuredModel,
          session: 'configured-keyless-billing',
          workspace: workspace.id,
        },
      });
      expect(configured.statusCode).toBe(200);
      const done = parseSSE(configured.body).find(event => event.event === 'done');
      expect(done).toBeDefined();
      expect(JSON.parse(done!.data)).toMatchObject({ cost: 0, billingClass: 'free' });
      const [trace] = localServer.traceStore.query({
        sessionId: 'configured-keyless-billing',
        limit: 1,
      });
      expect(trace).toBeDefined();
      expect(trace.cost_usd).toBe(0);
      expect(localServer.traceStore.getTotalCostSince('2000-01-01T00:00:00.000Z')).toBe(0);
      expect(localServer.agentState.costTracker.getStats().estimatedCost).toBe(0);
      expect(localServer.agentState.costTracker.getWorkspaceCost(workspace.id)).toBe(0);

      const paidReservation = localServer.agentState.costTracker.reserveModelSpend({
        model: 'ollama/remote-paid',
        inputTokens: 1_000,
        maxOutputTokens: 1_000,
        workspaceId: paidWorkspace.id,
        billingClass: 'priced',
      });
      expect(localServer.agentState.costTracker.commitReservedModelSpend(paidReservation)).toBe(true);
      expect(localServer.agentState.costTracker.getStats().estimatedCost).toBeCloseTo(0.018, 6);
      expect(localServer.agentState.costTracker.getWorkspaceCost(paidWorkspace.id)).toBeCloseTo(0.018, 6);

      const unlisted = await injectWithAuth(localServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Do not inherit free billing.',
          model: 'openai-compatible/wrapped/paid-model',
          session: 'unlisted-compatible-billing',
          workspace: workspace.id,
        },
      });
      expect(unlisted.statusCode).toBe(200);
      expect(capturedConfigs[1]).toMatchObject({
        billingModel: 'openai-compatible/wrapped/paid-model',
        modelSpendBillingClass: 'priced',
      });
      const unlistedDone = parseSSE(unlisted.body).find(event => event.event === 'done');
      expect(unlistedDone).toBeDefined();
      expect(JSON.parse(unlistedDone!.data)).toMatchObject({ billingClass: 'priced' });
      expect(JSON.parse(unlistedDone!.data).cost).toBeCloseTo(0.000078, 9);
      const [unlistedTrace] = localServer.traceStore.query({
        sessionId: 'unlisted-compatible-billing',
        limit: 1,
      });
      expect(unlistedTrace.cost_usd).toBeCloseTo(0.000078, 9);
      expect(JSON.parse(unlistedDone!.data).cost).toBeCloseTo(unlistedTrace.cost_usd, 9);
      expect(localServer.agentState.costTracker.getWorkspaceCost(workspace.id))
        .toBeCloseTo(0.000078, 9);

      localServer.vault.set('openai-compatible', 'sk-compatible-test', {
        models: ['qwen3.8-flash-next'],
        baseUrl: 'http://127.0.0.1:1/v1',
      });
      const keyed = await injectWithAuth(localServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'A configured credential must remain metered.',
          model: configuredModel,
          session: 'configured-keyed-billing',
          workspace: workspace.id,
        },
      });

      expect(configured.statusCode).toBe(200);
      expect(unlisted.statusCode).toBe(200);
      expect(keyed.statusCode).toBe(200);
      expect(capturedConfigs).toHaveLength(3);
      expect(capturedConfigs[0].modelSpendBillingClass).toBe('free');
      expect(capturedConfigs[1].modelSpendBillingClass).toBe('priced');
      expect(capturedConfigs[2].modelSpendBillingClass).toBe('priced');
    } finally {
      await localServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps an exact configured keyless fallback model free', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-keyless-fallback-billing-'));
    const primaryModel = 'openai-compatible/acme/primary-local';
    const fallbackModel = 'openai-compatible/acme/fallback-local';
    const config = new WaggleConfig(dataDir);
    config.setDefaultModel(primaryModel);
    config.setFallbackModel(fallbackModel);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['acme/primary-local', 'acme/fallback-local'],
      baseUrl: 'http://127.0.0.1:1/v1',
    });
    config.save();
    const localServer = await buildLocalServer({ dataDir });
    const capturedConfigs: AgentLoopConfig[] = [];
    localServer.agentRunner = async (runnerConfig): Promise<AgentResponse> => {
      capturedConfigs.push(runnerConfig);
      if (capturedConfigs.length === 1) {
        throw new Error('Could not reach model endpoint after 3 attempts (fetch failed).');
      }
      runnerConfig.onToken?.('fallback-billing-ok');
      return {
        content: 'fallback-billing-ok',
        toolsUsed: [],
        usage: { inputTokens: 11, outputTokens: 3 },
      };
    };

    try {
      const response = await injectWithAuth(localServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Use the configured fallback after the primary fails.',
          model: primaryModel,
          session: 'configured-keyless-fallback-billing',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedConfigs).toHaveLength(2);
      expect(capturedConfigs.map(attempt => attempt.billingModel))
        .toEqual([primaryModel, fallbackModel]);
      expect(capturedConfigs.map(attempt => attempt.modelSpendBillingClass))
        .toEqual(['free', 'free']);
      const done = parseSSE(response.body).find(event => event.event === 'done');
      expect(done).toBeDefined();
      expect(JSON.parse(done!.data)).toMatchObject({ cost: 0, billingClass: 'free' });
      const [trace] = localServer.traceStore.query({
        sessionId: 'configured-keyless-fallback-billing',
        limit: 1,
      });
      expect(trace).toMatchObject({ model: fallbackModel, cost_usd: 0 });
    } finally {
      await localServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it.each([
    ['the paid attempt reports billable usage', 'empty-with-usage', true],
    ['the paid attempt fails without usage metadata', 'throw-without-usage', false],
  ] as const)('keeps the whole turn priced when %s before a free fallback', async (
    _case,
    firstAttempt,
    expectsPositiveCost,
  ) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mixed-fallback-billing-'));
    const primaryModel = 'openai-compatible/acme/unlisted-paid-primary';
    const fallbackModel = 'openai-compatible/acme/configured-free-fallback';
    const config = new WaggleConfig(dataDir);
    config.setDefaultModel(primaryModel);
    config.setFallbackModel(fallbackModel);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['acme/configured-free-fallback'],
      baseUrl: 'http://127.0.0.1:1/v1',
    });
    config.save();
    const localServer = await buildLocalServer({ dataDir });
    const capturedConfigs: AgentLoopConfig[] = [];
    localServer.agentRunner = async (runnerConfig): Promise<AgentResponse> => {
      capturedConfigs.push(runnerConfig);
      if (capturedConfigs.length === 1) {
        if (firstAttempt === 'throw-without-usage') {
          throw new Error('Could not reach model endpoint after 3 attempts (fetch failed).');
        }
        return {
          content: '',
          toolsUsed: [],
          usage: { inputTokens: 11, outputTokens: 3 },
        };
      }
      runnerConfig.onToken?.('mixed-fallback-ok');
      return {
        content: 'mixed-fallback-ok',
        toolsUsed: [],
        usage: { inputTokens: 7, outputTokens: 2 },
      };
    };

    try {
      const response = await injectWithAuth(localServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Fallback without erasing paid attempt provenance.',
          model: primaryModel,
          session: 'mixed-fallback-billing',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedConfigs.map(attempt => attempt.modelSpendBillingClass))
        .toEqual(['priced', 'free']);
      const done = parseSSE(response.body).find(event => event.event === 'done');
      expect(done).toBeDefined();
      const doneData = JSON.parse(done!.data) as { billingClass: string; cost: number };
      expect(doneData).toMatchObject({ billingClass: 'priced' });
      const expectedCost = expectsPositiveCost ? 0.000078 : 0;
      if (expectsPositiveCost) {
        expect(doneData.cost).toBeCloseTo(expectedCost, 9);
      } else {
        expect(doneData.cost).toBe(expectedCost);
      }
      const [trace] = localServer.traceStore.query({
        sessionId: 'mixed-fallback-billing',
        limit: 1,
      });
      expect(trace.cost_usd).toBeCloseTo(expectedCost, 9);
    } finally {
      await localServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
