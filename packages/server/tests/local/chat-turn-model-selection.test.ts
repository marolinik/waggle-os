import { describe, expect, it } from 'vitest';
import { TurnModelSelection } from '../../src/local/routes/chat-turn-model-selection.js';

const PRIMARY = 'ollama/primary';
const BUDGET = 'ollama/budget';
const FALLBACK = 'ollama/fallback';

const identity = (model: string) => model;

/** Resolves every model except the unavailable ones, which throw. */
const resolverWithout = (...unavailable: string[]) => async (model: string) => {
  if (unavailable.includes(model)) throw new Error(`${model} unavailable`);
  return model;
};

const selection = (fallbackModel: string | null = FALLBACK) =>
  new TurnModelSelection({ primaryModel: PRIMARY, fallbackModel, canonicalize: identity });

describe('TurnModelSelection', () => {
  it('starts on the primary with no switch', () => {
    const models = selection();
    expect(models.model).toBe(PRIMARY);
    expect(models.switchReason).toBeNull();
    expect(models.budgetModelSelected).toBe(false);
    expect(models.takeSwitchAnnouncement(PRIMARY)).toBeNull();
  });

  it('records a budget switch only when the budget model differs from the primary', () => {
    const models = selection();
    models.selectBudgetModel(PRIMARY, 'Budget reached');
    expect(models.budgetModelSelected).toBe(false);
    expect(models.switchReason).toBeNull();
    models.selectBudgetModel(BUDGET, 'Budget reached');
    expect(models.model).toBe(BUDGET);
    expect(models.budgetModelSelected).toBe(true);
    expect(models.switchReason).toBe('Budget reached');
  });

  it('reports a preflight substitution, but not a normalization', async () => {
    const normalized = new TurnModelSelection({
      primaryModel: ' ollama/primary ',
      fallbackModel: null,
      canonicalize: (model) => model.trim(),
    });
    await normalized.resolvePreflight(async (model) => model.trim());
    expect(normalized.model).toBe(PRIMARY);
    expect(normalized.switchReason).toBeNull();

    const substituted = selection();
    await substituted.resolvePreflight(async () => 'ollama/other');
    expect(substituted.model).toBe('ollama/other');
    expect(substituted.switchReason).toBe('ollama/primary unavailable; ollama/other selected');
  });

  it('walks budget -> primary -> fallback at preflight', async () => {
    const toPrimary = selection();
    toPrimary.selectBudgetModel(BUDGET, 'Budget reached');
    await toPrimary.resolvePreflight(resolverWithout(BUDGET));
    expect([toPrimary.model, toPrimary.switchReason, toPrimary.budgetModelSelected])
      .toEqual([PRIMARY, 'ollama/budget unavailable; primary selected', false]);

    const toFallback = selection();
    toFallback.selectBudgetModel(BUDGET, 'Budget reached');
    await toFallback.resolvePreflight(resolverWithout(BUDGET, PRIMARY));
    expect([toFallback.model, toFallback.switchReason]).toEqual([
      FALLBACK,
      'ollama/budget and ollama/primary unavailable; configured fallback selected',
    ]);
  });

  it('rethrows at preflight when no usable fallback is left', async () => {
    await expect(selection(null).resolvePreflight(resolverWithout(PRIMARY)))
      .rejects.toThrow('ollama/primary unavailable');
    await expect(selection(PRIMARY).resolvePreflight(resolverWithout(PRIMARY)))
      .rejects.toThrow('ollama/primary unavailable');
  });

  it('returns a failed budget run to the primary, or to the fallback when the primary cannot be resolved', async () => {
    const toPrimary = selection();
    toPrimary.selectBudgetModel(BUDGET, 'Budget reached');
    expect(toPrimary.failedBudgetModel()).toBe(BUDGET);
    await expect(toPrimary.returnFromFailedBudgetModel(BUDGET, resolverWithout())).resolves.toBe('primary');
    expect([toPrimary.model, toPrimary.switchReason]).toEqual([PRIMARY, 'ollama/budget failed; primary selected']);
    expect(toPrimary.failedBudgetModel()).toBeNull();

    const toFallback = selection();
    toFallback.selectBudgetModel(BUDGET, 'Budget reached');
    await expect(toFallback.returnFromFailedBudgetModel(BUDGET, resolverWithout(PRIMARY))).resolves.toBe('fallback');
    expect(toFallback.switchReason)
      .toBe('ollama/budget failed and ollama/primary unavailable; configured fallback selected');

    const stranded = selection(BUDGET);
    stranded.selectBudgetModel(BUDGET, 'Budget reached');
    await expect(stranded.returnFromFailedBudgetModel(BUDGET, resolverWithout(PRIMARY)))
      .rejects.toThrow('ollama/primary unavailable');
    expect(stranded.budgetModelSelected).toBe(false);
  });

  it('switches to the fallback once, and never onto a model that already failed as the budget model', async () => {
    const models = selection();
    expect(models.canSwitchToFallback(null)).toBe(true);
    expect(models.canSwitchToFallback(FALLBACK)).toBe(false);
    await models.switchToFallbackAfter({ status: 503 }, resolverWithout());
    expect([models.model, models.switchReason])
      .toEqual([FALLBACK, 'ollama/primary failed (503); configured fallback selected']);
    expect(models.canSwitchToFallback(null)).toBe(false);
    expect(selection(null).canSwitchToFallback(null)).toBe(false);

    const timedOut = selection();
    await timedOut.switchToFallbackAfter(new Error('timeout'), resolverWithout());
    expect(timedOut.switchReason).toBe('ollama/primary failed (timeout); configured fallback selected');
  });

  it('announces each model and reason once', () => {
    const models = selection();
    models.selectBudgetModel(BUDGET, 'Budget reached');
    expect(models.takeSwitchAnnouncement(BUDGET))
      .toEqual({ model: BUDGET, reason: 'Budget reached', primary: PRIMARY });
    expect(models.takeSwitchAnnouncement(BUDGET)).toBeNull();
    expect(models.takeSwitchAnnouncement(FALLBACK))
      .toEqual({ model: FALLBACK, reason: 'Budget reached', primary: PRIMARY });
  });
});
