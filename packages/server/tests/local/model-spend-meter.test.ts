import { describe, expect, it, vi } from 'vitest';
import { CostTracker } from '@waggle/agent';
import { createModelSpendMeter } from '../../src/local/model-spend-meter.js';

const TARGET = 'http://127.0.0.1:3333/v1';

describe('ModelSpendMeter durable handoff ownership', () => {
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
