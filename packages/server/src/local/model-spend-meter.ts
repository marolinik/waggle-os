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
  const handoffReservations = new Map<string, {
    reservationId: string;
    durableEligible: boolean;
  }>();
  const durablyAccountedReservations = new Set<string>();
  let total = 0;
  const record = (costUsd: number): void => {
    if (costUsd <= 0) return;
    total += costUsd;
    try {
      onCostSettled?.(costUsd);
    } catch (error) {
      shared.markModelSpendPersistenceUnavailable?.(error);
      throw error;
    }
  };
  return {
    reserveModelSpend(request) {
      const reservation = shared.reserveModelSpend(request);
      reservations.set(reservation.id, request);
      return reservation;
    },
    reconcileModelSpend(reservation, usage) {
      const request = reservations.get(reservation.id);
      const durablyAccounted = durablyAccountedReservations.delete(reservation.id);
      const reconciled = shared.reconcileModelSpend(reservation, usage);
      if (reconciled && request && !durablyAccounted) {
        record(request.billingClass === 'free'
          ? 0
          : serverCost(request.model, usage.inputTokens, usage.outputTokens));
      }
      reservations.delete(reservation.id);
      return reconciled;
    },
    commitReservedModelSpend(reservation) {
      const request = reservations.get(reservation.id);
      const durablyAccounted = durablyAccountedReservations.delete(reservation.id);
      const committed = shared.commitReservedModelSpend(reservation);
      if (committed && request && request.billingClass !== 'free' && !durablyAccounted) {
        record(serverCost(request.model, request.inputTokens, request.maxOutputTokens));
      }
      reservations.delete(reservation.id);
      return committed;
    },
    releaseReservedModelSpend(reservation) {
      reservations.delete(reservation.id);
      durablyAccountedReservations.delete(reservation.id);
      return shared.releaseReservedModelSpend(reservation);
    },
    issueModelSpendReservationHandoff: shared.issueModelSpendReservationHandoff
      ? (reservation, requestBinding, targetUrl, durableTraceId) => {
          const handoff = shared.issueModelSpendReservationHandoff!(
            reservation,
            requestBinding,
            targetUrl,
            durableTraceId,
          );
          if (handoff) {
            handoffReservations.set(handoff.token, {
              reservationId: reservation.id,
              durableEligible: durableTraceId !== undefined,
            });
          }
          return handoff;
        }
      : undefined,
    claimModelSpendReservationHandoff: shared.claimModelSpendReservationHandoff
      ? (token, requestBinding) => shared.claimModelSpendReservationHandoff!(token, requestBinding)
      : undefined,
    discardModelSpendReservationHandoff: shared.discardModelSpendReservationHandoff
      ? (token) => {
          shared.discardModelSpendReservationHandoff!(token);
          handoffReservations.delete(token);
        }
      : undefined,
    setModelSpendReservationHandoffDisposition: shared.setModelSpendReservationHandoffDisposition
      ? (token, disposition) => shared.setModelSpendReservationHandoffDisposition!(token, disposition)
      : undefined,
    takeModelSpendReservationHandoffDisposition: shared.takeModelSpendReservationHandoffDisposition
      ? (token) => {
          const disposition = shared.takeModelSpendReservationHandoffDisposition!(token);
          const handoff = handoffReservations.get(token);
          if (handoff?.durableEligible && disposition === 'commit') {
            durablyAccountedReservations.add(handoff.reservationId);
          } else if (handoff && disposition === 'release') {
            durablyAccountedReservations.delete(handoff.reservationId);
          }
          return disposition;
        }
      : undefined,
    registerModelSpendReservationTarget: shared.registerModelSpendReservationTarget
      ? (targetUrl) => shared.registerModelSpendReservationTarget!(targetUrl)
      : undefined,
    unregisterModelSpendReservationTarget: shared.unregisterModelSpendReservationTarget
      ? (targetUrl) => shared.unregisterModelSpendReservationTarget!(targetUrl)
      : undefined,
    markModelSpendPersistenceUnavailable: shared.markModelSpendPersistenceUnavailable
      ? (cause) => shared.markModelSpendPersistenceUnavailable!(cause)
      : undefined,
    totalCostUsd: () => total,
  };
}

export function bindModelSpendBudget(
  underlyingRunner: AgentRunner,
  budget: ModelSpendBudget,
  workspaceId: string,
  listVerifiedLocalModels: () => Promise<string[]>,
  getDurableTraceId?: () => number | undefined,
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
      modelSpendBudget: budget,
      modelSpendBillingClass: billingClass,
      spendWorkspaceId: workspaceId,
      modelSpendTraceId: getDurableTraceId
        ? getDurableTraceId()
        : config.modelSpendTraceId,
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
