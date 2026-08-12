import { CostTracker } from '@waggle/agent';
import type { AgentRunner } from './routes/chat.js';

export type ModelSpendBudget = NonNullable<Parameters<AgentRunner>[0]['modelSpendBudget']>;
type ModelSpendReservationRequest = Parameters<ModelSpendBudget['reserveModelSpend']>[0];

export interface ModelSpendMeter extends ModelSpendBudget {
  totalCostUsd(): number;
}

export function createModelSpendMeter(
  shared: ModelSpendBudget,
  onCostSettled?: (costUsd: number) => void,
): ModelSpendMeter {
  const reservations = new Map<string, ModelSpendReservationRequest>();
  let total = 0;
  const record = (costUsd: number): void => {
    if (costUsd <= 0) return;
    total += costUsd;
    onCostSettled?.(costUsd);
  };
  return {
    reserveModelSpend(request) {
      const reservation = shared.reserveModelSpend(request);
      reservations.set(reservation.id, request);
      return reservation;
    },
    reconcileModelSpend(reservation, usage) {
      const request = reservations.get(reservation.id);
      const reconciled = shared.reconcileModelSpend(reservation, usage);
      if (reconciled && request) {
        record(request.billingClass === 'free'
          ? 0
          : serverCost(request.model, usage.inputTokens, usage.outputTokens));
      }
      reservations.delete(reservation.id);
      return reconciled;
    },
    commitReservedModelSpend(reservation) {
      const request = reservations.get(reservation.id);
      const committed = shared.commitReservedModelSpend(reservation);
      if (committed && request && request.billingClass !== 'free') {
        record(serverCost(request.model, request.inputTokens, request.maxOutputTokens));
      }
      reservations.delete(reservation.id);
      return committed;
    },
    releaseReservedModelSpend(reservation) {
      reservations.delete(reservation.id);
      return shared.releaseReservedModelSpend(reservation);
    },
    totalCostUsd: () => total,
  };
}

export function bindModelSpendBudget(
  underlyingRunner: AgentRunner,
  meter: ModelSpendMeter,
  workspaceId: string,
  listVerifiedLocalModels: () => Promise<string[]>,
): AgentRunner {
  let verifiedLocalModels: Promise<Set<string>> | undefined;
  return async (config) => {
    const billingModel = config.billingModel ?? config.model;
    let billingClass: 'priced' | 'free' = 'priced';
    if (billingModel.toLowerCase().startsWith('ollama/')) {
      verifiedLocalModels ??= listVerifiedLocalModels().then((models) => new Set(models));
      billingClass = (await verifiedLocalModels).has(billingModel) ? 'free' : 'priced';
    }
    return underlyingRunner({
      ...config,
      billingModel,
      modelSpendBudget: meter,
      modelSpendBillingClass: billingClass,
      spendWorkspaceId: workspaceId,
    });
  };
}

function serverCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricedModel = model.toLowerCase().startsWith('ollama/')
    ? model.slice('ollama/'.length)
    : model;
  const exact = new CostTracker().calculateCost(inputTokens, outputTokens, pricedModel);
  return Math.ceil((Math.max(0, exact) * 1_000_000) - 1e-9) / 1_000_000;
}
