import { describe, expect, it, vi } from 'vitest';
import { CostTracker } from '@waggle/agent';
import {
  bindModelSpendBudget,
  createModelSpendMeter,
} from '../../src/local/model-spend-meter.js';

const TARGET = 'http://127.0.0.1:3333/v1';

describe('ModelSpendMeter durable handoff ownership', () => {
  it('forces one root spend scope onto child calls and verifies local billing', async () => {
    const shared = new CostTracker();
    const calls: Array<Record<string, unknown>> = [];
    const runner = bindModelSpendBudget(
      async (config) => {
        calls.push(config as unknown as Record<string, unknown>);
        return { content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
      },
      shared,
      'workspace-a',
      async () => ['ollama/qwen2.5:0.5b'],
      () => 77,
      (model) => model === 'openai-compatible/qwen3.8-flash-next',
    );
    const baseConfig = {
      litellmUrl: 'http://llm.test',
      litellmApiKey: 'test-key',
      systemPrompt: 'test',
      tools: [],
      messages: [{ role: 'user' as const, content: 'test' }],
    };

    await runner({
      ...baseConfig,
      model: 'openai/gpt-5.3-codex',
      modelSpendTraceId: 999,
    });
    await runner({ ...baseConfig, model: 'ollama/qwen2.5:0.5b' });
    await runner({ ...baseConfig, model: 'ollama/unverified:latest' });
    await runner({ ...baseConfig, model: 'openai-compatible/qwen3.8-flash-next' });
    await runner({ ...baseConfig, model: 'openai-compatible/wrapped/paid-model' });

    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.modelSpendBudget).toBe(shared);
      expect(call.modelSpendTraceId).toBe(77);
      expect(call.spendWorkspaceId).toBe('workspace-a');
    }
    expect(calls.map((call) => call.modelSpendBillingClass)).toEqual([
      'priced',
      'free',
      'priced',
      'free',
      'priced',
    ]);
  });

  it('fails closed without Ollama discovery when the additional classifier throws', async () => {
    const shared = new CostTracker();
    const listVerifiedLocalModels = vi.fn(async () => ['ollama/qwen2.5:0.5b']);
    const underlyingRunner = vi.fn(async (config) => ({
      content: String(config.modelSpendBillingClass),
      toolsUsed: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const runner = bindModelSpendBudget(
      underlyingRunner,
      shared,
      'workspace-a',
      listVerifiedLocalModels,
      undefined,
      () => {
        throw new Error('classifier unavailable');
      },
    );

    await expect(runner({
      litellmUrl: 'http://llm.test',
      litellmApiKey: 'test-key',
      model: 'openai-compatible/qwen3.8-flash-next',
      systemPrompt: 'test',
      tools: [],
      messages: [{ role: 'user', content: 'test' }],
    })).resolves.toMatchObject({ content: 'priced' });

    expect(underlyingRunner).toHaveBeenCalledOnce();
    expect(underlyingRunner.mock.calls[0][0].modelSpendBillingClass).toBe('priced');
    expect(listVerifiedLocalModels).not.toHaveBeenCalled();
  });

  it('updates live usage without writing a second durable charge', () => {
    const shared = new CostTracker();
    const onCostSettled = vi.fn();
    const meter = createModelSpendMeter(shared, onCostSettled);
    shared.registerModelSpendReservationTarget(TARGET);
    const reservation = meter.reserveModelSpend({
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      maxOutputTokens: 100,
      billingClass: 'priced',
    });
    const binding = JSON.stringify({ model: 'claude-sonnet-4-6', messages: [] });
    const handoff = meter.issueModelSpendReservationHandoff!(reservation, binding, TARGET, 17);

    expect(handoff).toBeDefined();
    expect(shared.claimModelSpendReservationHandoff(handoff!.token, binding)).toMatchObject({
      reservation,
      durableTraceId: 17,
      estimatedCostUsd: expect.any(Number),
    });
    shared.setModelSpendReservationHandoffDisposition(handoff!.token, 'commit');
    expect(meter.takeModelSpendReservationHandoffDisposition!(handoff!.token)).toBe('commit');
    meter.discardModelSpendReservationHandoff!(handoff!.token);

    expect(meter.reconcileModelSpend(reservation, { inputTokens: 50, outputTokens: 25 })).toBe(true);
    expect(shared.getDailyTotal()).toBeGreaterThan(0);
    expect(meter.totalCostUsd()).toBe(0);
    expect(onCostSettled).not.toHaveBeenCalled();
  });

  it('keeps legacy persistence for a request without a claimed durable handoff', () => {
    const shared = new CostTracker();
    const onCostSettled = vi.fn();
    const meter = createModelSpendMeter(shared, onCostSettled);
    const reservation = meter.reserveModelSpend({
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      maxOutputTokens: 100,
      billingClass: 'priced',
    });

    expect(meter.reconcileModelSpend(reservation, { inputTokens: 50, outputTokens: 25 })).toBe(true);
    expect(meter.totalCostUsd()).toBeGreaterThan(0);
    expect(onCostSettled).toHaveBeenCalledOnce();
  });

  it('keeps legacy persistence when a commit disposition has no durable trace proof', () => {
    const shared = new CostTracker();
    const onCostSettled = vi.fn();
    const meter = createModelSpendMeter(shared, onCostSettled);
    shared.registerModelSpendReservationTarget(TARGET);
    const reservation = meter.reserveModelSpend({
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      maxOutputTokens: 100,
      billingClass: 'priced',
    });
    const binding = JSON.stringify({ model: 'claude-sonnet-4-6', messages: [] });
    const handoff = meter.issueModelSpendReservationHandoff!(reservation, binding, TARGET);
    shared.claimModelSpendReservationHandoff(handoff!.token, binding);
    shared.setModelSpendReservationHandoffDisposition(handoff!.token, 'commit');

    expect(meter.takeModelSpendReservationHandoffDisposition!(handoff!.token)).toBe('commit');
    meter.discardModelSpendReservationHandoff!(handoff!.token);
    expect(meter.reconcileModelSpend(reservation, { inputTokens: 50, outputTokens: 25 })).toBe(true);
    expect(meter.totalCostUsd()).toBeGreaterThan(0);
    expect(onCostSettled).toHaveBeenCalledOnce();
  });

  it('releases both live ownership and meter state after a definite rejection', () => {
    const shared = new CostTracker();
    const onCostSettled = vi.fn();
    const meter = createModelSpendMeter(shared, onCostSettled);
    shared.registerModelSpendReservationTarget(TARGET);
    const reservation = meter.reserveModelSpend({
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      maxOutputTokens: 100,
      billingClass: 'priced',
    });
    const binding = JSON.stringify({ model: 'claude-sonnet-4-6', messages: [] });
    const handoff = meter.issueModelSpendReservationHandoff!(reservation, binding, TARGET, 19);
    shared.claimModelSpendReservationHandoff(handoff!.token, binding);
    shared.setModelSpendReservationHandoffDisposition(handoff!.token, 'release');

    expect(meter.takeModelSpendReservationHandoffDisposition!(handoff!.token)).toBe('release');
    meter.discardModelSpendReservationHandoff!(handoff!.token);
    expect(meter.releaseReservedModelSpend(reservation)).toBe(true);
    expect(shared.getDailyTotal()).toBe(0);
    expect(shared.getReservedDailyTotal()).toBe(0);
    expect(meter.totalCostUsd()).toBe(0);
    expect(onCostSettled).not.toHaveBeenCalled();
  });
});
