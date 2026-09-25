/**
 * Which model a chat turn runs on, and whether that model path can serve it.
 *
 * Extract Method on the POST /api/chat handler (TD-CHAT-3 slice 15d), moved
 * verbatim. `selectTurnModel` reads the pilot config, applies budget routing
 * to simple turns, and resolves the selection before any conversation
 * mutation; `resolveModelAvailability` decides between the agent loop and
 * the setup-required reply.
 */
import type { FastifyInstance } from 'fastify';
import { routeMessage } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { canonicalizeModelReference, resolveUsableModel } from '../model-availability.js';
import { canUseBudgetModelWithoutCloudEgress } from './chat-helpers.js';
import type { ModelHealthProbe } from './chat-model-health.js';
import { TurnModelSelection } from './chat-turn-model-selection.js';

export interface TurnModelSelectionInput {
  server: FastifyInstance;
  /** The model the request named, if any. */
  model: string | undefined;
  executionWorkspaceConfig: { model?: string } | null | undefined;
  message: string;
  getTrackedDailySpend: (enabled: boolean) => number;
  throwIfTurnAborted: () => void;
}

export async function selectTurnModel(input: TurnModelSelectionInput) {
  const { server, model, executionWorkspaceConfig, message, getTrackedDailySpend, throwIfTurnAborted } = input;
  // ── Model Pilot: resolve model with fallback chain ──
  const pilotConfig = new WaggleConfig(server.localConfig.dataDir);
  const wsModelConfig = executionWorkspaceConfig?.model;
  const primaryModel = model ?? wsModelConfig ?? pilotConfig.getDefaultModel() ?? 'claude-sonnet-4-6';
  const fallbackModel = pilotConfig.getFallbackModel();
  const budgetModel = pilotConfig.getBudgetModel();
  const budgetThreshold = pilotConfig.getBudgetThreshold();

  // Resolve model selection before availability and fallback checks.
  const modelSelection = new TurnModelSelection({
    primaryModel,
    fallbackModel,
    canonicalize: canonicalizeModelReference,
  });
  const resolveModel = (candidate: string) => resolveUsableModel(server, candidate);
  const budgetRoutingAllowed = budgetModel
    ? canUseBudgetModelWithoutCloudEgress(primaryModel, budgetModel)
    : false;
  const dailyBudget = pilotConfig.getDailyBudget() ?? 0;
  const spent = getTrackedDailySpend(dailyBudget > 0);
  const budgetThresholdReached = dailyBudget > 0
    && spent / dailyBudget >= budgetThreshold;

  // Classify first: spend pressure must never downgrade consequential work.
  if (budgetModel && budgetRoutingAllowed && budgetThresholdReached) {
    const routing = routeMessage(message, primaryModel, budgetModel);
    if (routing.reason === 'simple_turn') {
      modelSelection.selectBudgetModel(
        routing.model,
        `Budget ${Math.round(budgetThreshold * 100)}% reached ($${spent.toFixed(2)}/$${dailyBudget.toFixed(2)})`,
      );
    }
  }

  // ── Model resolution: confirm the selected model is routable; on failure fall
  // back budget → primary → configured fallback, recording the switch reason ──
  await modelSelection.resolvePreflight(resolveModel);
  throwIfTurnAborted();

  const configuredFallbackModel = fallbackModel
    ? canonicalizeModelReference(fallbackModel)
    : null;
  const hasDistinctConfiguredFallback = Boolean(
    configuredFallbackModel
    && canonicalizeModelReference(modelSelection.model) !== configuredFallbackModel,
  );

  return { budgetModel, modelSelection, resolveModel, hasDistinctConfiguredFallback };
}

export interface ModelAvailabilityInput {
  server: FastifyInstance;
  modelSelection: TurnModelSelection;
  getLitellmUrl: () => string;
  probeModelHealth: ModelHealthProbe;
}

export async function resolveModelAvailability(input: ModelAvailabilityInput): Promise<boolean> {
  const { server, modelSelection, getLitellmUrl, probeModelHealth } = input;
  // Check whether the configured LLM path can serve a completion. Process
  // liveness is insufficient for the built-in proxy because it also runs
  // normally before a cloud credential or local model has been configured.
  // resolveUsableModel() only returns an ollama/* selection after the tag
  // is observed locally, so it remains authoritative even if startup's
  // cloud-provider status has not yet caught up with onboarding.
  const resolvedLocalOllama = modelSelection.model.toLowerCase().startsWith('ollama/');
  let modelAvailable = resolvedLocalOllama; // trust verified local models
  if (!resolvedLocalOllama) {
    const llmStatus = server.agentState.llmProvider;
    if ((llmStatus.provider === 'anthropic-proxy' || llmStatus.provider === 'ollama' || llmStatus.provider === 'litellm') && llmStatus.health === 'healthy') {
      // Healthy tracked provider — skip HTTP probe. For litellm the
      // per-request 3s probe raced concurrent completions (uvicorn busy
      // serving LLM calls), randomly dropping healthy turns into the setup-required reply;
      // the health monitor already tracks child liveness.
      modelAvailable = true;
    } else {
      const healthHeaders: Record<string, string> = {};
      const token = server.agentState.wsSessionToken;
      if (token) {
        healthHeaders['Authorization'] = `Bearer ${token}`;
      }
      const healthPath = llmStatus.provider === 'anthropic-proxy'
        ? '/health/readiness'
        : '/health/liveliness';
      modelAvailable = await probeModelHealth(llmStatus, `${getLitellmUrl()}${healthPath}`, healthHeaders);
    }
  }
  return modelAvailable;
}
