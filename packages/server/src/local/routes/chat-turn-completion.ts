/**
 * The chat turn's completion phase (TD-CHAT-3 slice 13): everything between
 * the model's final answer and the end of the handler.
 *
 * `completeTurnResponse` resolves pending capability proposals, accounts
 * the turn's cost and tokens, runs the derived write-backs (skill
 * distillation, knowledge-graph extraction, correction and capability-gap
 * signals, workflow capture), decorates the answer (regulated disclaimer,
 * schedule suggestion, grounding note), commits it to history and the trace,
 * and sends the final tokens and the `done` event. The handler marks the
 * response committed once it returns; `runPostCommitEnrichment` then emits
 * the completion signal, the automated-turn notification and the auto-save,
 * none of which may reach the client.
 *
 * Moved verbatim from the handler, with two edits: every handler value
 * arrives in `TurnCompletionTurn`, and the first-token time is read through
 * `getFirstTokenAt` just before `done`, because the handler's `sendEvent`
 * can still set it while this phase streams the final tokens.
 */
import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import {
  analyzeAndRecordCorrection,
  checkGrounding,
  extractEntities,
  planSkillDistillation,
  recordCapabilityGap,
  shouldSuggestCapture,
  type AgentResponse,
  type CostTracker,
  type Orchestrator,
} from '@waggle/agent';
import { createLogger } from '../logger.js';
import { emitNotification } from './notifications.js';
import { emitWaggleSignal } from './waggle-signals.js';
import { issueCapabilityProposalFromToolResult, resolveMarketplaceApprovalIdentity } from './capability-proposals.js';
import { SCHEDULE_SUGGESTION, shouldSuggestSchedule, type TurnMutationPolicy } from './chat-helpers.js';
import {
  createPersistedCapabilityReceipt,
  isChatSessionStateKeyForWorkspace,
  persistMessage,
  type ChatHistoryMessage,
} from './chat-persistence.js';
import type { ChatPromptPackageMode } from './chat-prompt-packaging.js';
import { regulatedDisclaimerSuffix } from './chat-turn-policy.js';
import { isClosedDbError } from './chat-mind-handle.js';
import type { TurnAttemptState } from './chat-turn-attempt-state.js';
import type { TurnExecutionTrace } from './chat-turn-execution-trace.js';
import type { TurnModelSelection } from './chat-turn-model-selection.js';
import type { TurnRecalledContext } from './chat-turn-recall-context.js';
import type { TurnResources } from './chat-turn-resources.js';
import type { TurnRetention } from './chat-turn-retention.js';
import type { TurnUsageLedger } from './chat-turn-usage-ledger.js';

const log = createLogger('chat');

/** The handler values the completion phase reads, fixed when it starts. */
export interface TurnCompletionTurn {
  server: FastifyInstance;
  sendEvent: (event: string, data: unknown) => void;
  throwIfTurnAborted: () => void;
  attemptState: TurnAttemptState;
  usageLedger: TurnUsageLedger;
  modelSelection: TurnModelSelection;
  turnResources: TurnResources;
  turnRecall: TurnRecalledContext;
  turnTrace: TurnExecutionTrace;
  retention: TurnRetention;
  turnMutationPolicy: TurnMutationPolicy;
  costTracker: CostTracker;
  sessionOrch: Orchestrator;
  hasCustomRunner: boolean;
  isAutomatedTurn: boolean;
  message: string;
  history: ChatHistoryMessage[];
  sessionId: string;
  sessionStateKey: string;
  sessionToolSequences: Map<string, string[][]>;
  sessionPersistenceDataDir: string;
  activeWorkspaceId: string;
  activeSessionStateWorkspaceId: string;
  effectiveWorkspace: string | undefined;
  executionScopeId: string;
  activePersonaId: string | null;
  personaOverride: string | undefined;
  resolvePersona: (id: string) => { name: string } | null;
  accountWorkspaceSessionTokens: (delta: number) => void;
  retainedTurnText: (value: string) => string;
  toolCatalogCount: number;
  toolEligibleCount: number;
  toolSelectedCount: number;
  toolOmittedCount: number;
  transmittedToolSchemaChars: number;
  systemPrompt: string;
  packageMode: ChatPromptPackageMode | 'custom';
  selectorLatencyMs: number;
  agentLatencyMs: number;
  totalServerStartedAt: number;
  /** Reads the handler's first-token time at call time. */
  getFirstTokenAt: () => number | null;
}

/** What the post-commit enrichment needs from the committed response. */
export interface CompletedTurnResponse {
  result: AgentResponse;
  turnUsage: TurnUsageLedger['total'];
  messageCost: number | undefined;
}

/**
 * Finishes the turn from the model's answer up to and including the `done`
 * event. Throws when the turn is aborted before the response is committed.
 */
export async function completeTurnResponse(
  turn: TurnCompletionTurn,
  answered: AgentResponse,
): Promise<CompletedTurnResponse> {
  const {
    server, sendEvent, throwIfTurnAborted, attemptState, usageLedger, modelSelection,
    turnResources, turnRecall, turnTrace, retention, turnMutationPolicy, costTracker, sessionOrch,
    hasCustomRunner, message, history, sessionId, sessionStateKey, sessionToolSequences,
    sessionPersistenceDataDir, activeWorkspaceId, activeSessionStateWorkspaceId, effectiveWorkspace,
    executionScopeId, activePersonaId, accountWorkspaceSessionTokens, retainedTurnText,
    toolCatalogCount, toolEligibleCount, toolSelectedCount, toolOmittedCount,
    transmittedToolSchemaChars, systemPrompt, packageMode, selectorLatencyMs, agentLatencyMs,
    totalServerStartedAt, getFirstTokenAt,
  } = turn;
  let result = answered;
  // The model response is complete, but proposal resolution below can
  // still be interrupted. Preserve usage before any further awaited work.
  result = {
    ...result,
    toolsUsed: attemptState.toolsUsedWith(result.toolsUsed),
  };
  usageLedger.completeAttempt(result.usage, modelSelection.model);

  for (const capabilityToolResult of attemptState.takePendingCapabilities()) {
    const issued = await issueCapabilityProposalFromToolResult({
      store: server.capabilityProposalStore,
      workspaceId: activeWorkspaceId,
      sessionId,
      output: capabilityToolResult.output,
      resolveIdentity: (packageId) => resolveMarketplaceApprovalIdentity(server, packageId),
    });
    // Marketplace output is proposal-bound; bundled starter-pack output
    // remains a trusted completed receipt without marketplace lifecycle.
    attemptState.offerCapabilityReceipt(createPersistedCapabilityReceipt(
      capabilityToolResult.input,
      issued.output,
    ));
    sendEvent('tool_result', {
      name: 'acquire_capability',
      result: issued.output,
      duration: capabilityToolResult.duration,
      isError: false,
    });
    throwIfTurnAborted();
  }

  // Unregister the per-request approval hook, so the outer finally's
  // defensive cleanup is a no-op on the happy path.
  turnResources.unhookTools();

  // Track every dispatched attempt against the model that actually ran it.
  const successfulAttemptReceipts = usageLedger.receipts;
  const messageBillingClass = usageLedger.messageBillingClass;
  const turnUsage = usageLedger.total;
  let resultCost = successfulAttemptReceipts.reduce((total, receipt) => (
    total + costTracker.calculateUsageCost({
      model: receipt.model,
      input: receipt.usage.inputTokens,
      output: receipt.usage.outputTokens,
      billingClass: receipt.billingClass,
    })
  ), 0);
  // Production spend is charged inside the agent loop, through the
  // modelSpendBudget the route hands it. An injected runner bypasses the
  // loop and its meter, so only then does the route charge here; doing
  // it for a production turn would count every call twice (TD-CHAT-8,
  // pinned in chat-spend-accounting-characterization.test.ts).
  if (hasCustomRunner) {
    for (const receipt of successfulAttemptReceipts) {
      costTracker.addUsage(
        receipt.model,
        receipt.usage.inputTokens,
        receipt.usage.outputTokens,
        executionScopeId,
        { billingClass: receipt.billingClass },
      );
    }
  }

  // Per-session token accumulation for /api/fleet visibility.
  // costTracker is per-workspace cost; sessionManager holds per-session
  // token totals that persist for the life of the active session.
  accountWorkspaceSessionTokens(
    usageLedger.total.inputTokens + usageLedger.total.outputTokens,
  );
  usageLedger.markAccounted();

  // Commit deferred signal markings now that model call succeeded
  if (!hasCustomRunner && retention.allowDerivedPersistence) sessionOrch.commitSurfacedSignals();

  // ── Closed learning loop: deterministic skill distillation ──
  // The runtime — not just the behavioral-spec prose — detects a successful ≥5-tool turn and
  // surfaces the distillation directive, so the agent reliably authors
  // a reusable skill via its own create_skill tool. Gated end to
  // end on the outcome: a refusal / self-incapacity turn yields no plan. The signal
  // is recorded idempotently (skill_promotion) so recurring workflows
  // bubble up through the existing actionable-signal substrate.
  // Skipped whenever learned/derived persistence is disabled.
  if (!hasCustomRunner && retention.allowDerivedPersistence) {
    const distillPlan = planSkillDistillation(result.toolsUsed ?? [], result.content ?? '');
    if (distillPlan) {
      sendEvent('step', { content: distillPlan.directive });
      try {
        sessionOrch.getImprovementSignals().record(
          'skill_promotion',
          distillPlan.patternKey,
          distillPlan.directive,
          { sessionId, toolCalls: (result.toolsUsed ?? []).length },
        );
      } catch {
        // Signal recording is best-effort — never fail the response.
      }
    }
  }

  // ── KG auto-extraction (Item 4) ────────────────────────────
  // Extract named entities from the agent response and add them to the
  // knowledge graph of the active workspace mind.
  // Non-blocking — KG enrichment never fails the response.
  // Skipped whenever learned/derived persistence is disabled; review and
  // evidence-bounded output must not inflate the knowledge graph.
  if (!hasCustomRunner && retention.allowDerivedPersistence && result.content && result.content.length > 100) {
    try {
      const knowledge = sessionOrch.getKnowledge();
      const entities = extractEntities(result.content);
      if (entities.length > 0) {
        const now = new Date().toISOString();
        // Cap at 10 entities per turn to avoid KG bloat
        for (const entity of entities.slice(0, 10)) {
          try {
            knowledge.createEntity(entity.type, entity.name, { confidence: entity.confidence, source: `session:${sessionId}` }, { valid_from: now });
          } catch (entityError) {
            // A closed handle is the W4A seam the handler below names;
            // swallowing it here hid it (TD-CHAT-24). A duplicate or a
            // schema error for one entity is still skipped.
            if (isClosedDbError(entityError)) throw entityError;
          }
        }
      }
    } catch (e) {
      if (isClosedDbError(e)) {
        log.warn('[waggle][W4A] workspace mind handle closed mid-turn during KG extraction', {
          workspaceId: effectiveWorkspace,
          sessionId,
          seam: 'knowledge.createEntity',
          error: e instanceof Error ? e.message : String(e),
        });
      } else {
        log.info('[waggle] KG extraction error:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  // ── Correction detection ──────────────────────────────────
  // Analyze user message for corrections and record improvement signals.
  // Non-blocking — detection failure shouldn't affect the response.
  // Skipped whenever learned/derived persistence is disabled; a review
  // instruction can quote old corrections that must not re-fire.
  if (!hasCustomRunner && retention.allowDerivedPersistence) {
    try {
      const signalStore = sessionOrch.getImprovementSignals();
      analyzeAndRecordCorrection(signalStore, message);

      // Record capability gaps from tool-not-found events
      const toolNotFoundPattern = /Tool "(.+?)" not found/;
      if (result.content) {
        const match = result.content.match(toolNotFoundPattern);
        if (match) {
          recordCapabilityGap(signalStore, match[1]);
        }
      }
    } catch {
      // Non-blocking
    }
  }

  // ── Auto skill capture — detect repeatable workflow patterns ──
  if (!hasCustomRunner
    && retention.allowDerivedPersistence
    && result.toolsUsed
    && result.toolsUsed.length > 0) {
    try {
      // Track this session's tool sequence
      if (!sessionToolSequences.has(sessionStateKey)) {
        sessionToolSequences.set(sessionStateKey, []);
      }
      sessionToolSequences.get(sessionStateKey)!.push(result.toolsUsed);

      // Build history from other sessions in this workspace only.
      const otherSessions = [...sessionToolSequences.entries()]
        .filter(([id]) => id !== sessionStateKey
          && isChatSessionStateKeyForWorkspace(id, activeSessionStateWorkspaceId))
        .map(([, seqs]) => ({ toolSequence: seqs.flat() }));

      if (otherSessions.length >= 2) {
        const captureResult = shouldSuggestCapture({
          messages: history.map((m, _i) => ({
            role: m.role,
            content: m.content,
            toolsUsed: result.toolsUsed,
          })),
          sessionHistory: otherSessions,
        });

        if (captureResult.suggest && captureResult.pattern) {
          const patternKey = captureResult.pattern.name;
          sendEvent('notification', {
            type: 'workflow_captured',
            title: captureResult.notification?.title ?? 'Pattern detected',
            message: captureResult.notification?.message ?? captureResult.reason,
            pattern: captureResult.pattern,
          });
          log.info(`[auto-skill] Suggested capture: ${patternKey}`);
        }
      }
    } catch {
      // Non-blocking — capture detection failure never affects the response
    }
  }

  // Post-processing: append professional disclaimer for regulated personas ONLY when content is substantive
  let finalContent = result.content;
  if (retention.allowResponseDecoration && finalContent) {
    finalContent += regulatedDisclaimerSuffix(finalContent, activePersonaId);
  }

  // Contextual cron suggestion — nudge user about /schedule when response discusses recurring work
  if (!hasCustomRunner
    && retention.allowResponseDecoration
    && finalContent
    && shouldSuggestSchedule(finalContent, result.toolsUsed ?? [], message)) {
    finalContent += SCHEDULE_SUGGESTION;
  }

  // Grounding guard (verification layer): flag quantitative specifics the
  // reply asserts that are NOT in the recalled memory / user message. Prompt
  // instructions don't reliably suppress this confabulation (verified live),
  // so surface high-signal cases honestly rather than let invented numbers
  // read as recalled facts. Deterministic + cheap. count/money trigger an
  // honest hedge note; durations/percents only inform the log signal
  // (noisier — advice timelines like "2 weeks" would false-positive). The
  // nuanced cases (proper nouns, "4 months runway") need the LLM verifier.
  if (!hasCustomRunner && retention.allowResponseDecoration && finalContent && turnRecall.hasGroundingEvidence) {
    const grounding = checkGrounding(finalContent, turnRecall.groundingEvidence(message));
    if (grounding.ungrounded.length > 0) {
      log.info('[grounding] reply asserts specifics absent from recalled memory', {
        score: grounding.score,
        ungrounded: grounding.ungrounded.map((s) => s.text),
      });
    }
    const hedgeWorthy = grounding.ungrounded.filter((s) => s.kind === 'count' || s.kind === 'money');
    if (hedgeWorthy.length > 0 && process.env.WAGGLE_GROUNDING_HEDGE !== '0') {
      const items = hedgeWorthy.map((s) => `"${s.text}"`).join(', ');
      const one = hedgeWorthy.length === 1;
      finalContent += `\n\n---\n*Note: ${items} ${one ? 'is' : 'are'} not in your saved memory — please treat ${one ? 'it' : 'them'} as an assumption, not a recalled fact.*`;
    }
  }

  // Commit the authoritative response before any awaited post-response
  // enrichment. This keeps a late cancellation from leaving auto-saved
  // memory or a success trace hidden behind a missing assistant turn.
  throwIfTurnAborted();
  const assistantMessage = {
    role: 'assistant',
    content: finalContent,
    model: modelSelection.model,
    ...(attemptState.capabilityReceipt ? { tools: [attemptState.capabilityReceipt] } : {}),
  };
  if (!turnMutationPolicy.denyConversationHistory) {
    history.push(assistantMessage);
    persistMessage(sessionPersistenceDataDir, activeWorkspaceId, sessionId, assistantMessage);
  }

  // Default trace outcome is success; correction-detector may downgrade
  // it to corrected on the next turn. The assistant history above is the
  // durable response commit that this trace describes.
  const finalizedTrace = turnTrace.finalizeOnce(() => ({
    outcome: 'success',
    output: retainedTurnText(finalContent ?? ''),
    model: usageLedger.attemptModel ?? modelSelection.model,
    tokens: {
      input: turnUsage.inputTokens,
      output: turnUsage.outputTokens,
    },
    costUsd: resultCost,
  }));
  resultCost = finalizedTrace?.cost_usd ?? resultCost;

  // The agent loop streams every model turn, including provisional prose
  // before tools, retries, and completion-gate corrections. Reconcile at
  // the HTTP boundary so token events contain only the exact content in
  // the authoritative done event. Preserve the original chunking when it
  // already matches the fully post-processed response.
  for (const token of attemptState.takeFinalTokenChunks(finalContent)) {
    sendEvent('token', { content: token });
  }

  const firstTokenAt = getFirstTokenAt();
  // Send the done event with full response + model info + per-message cost
  const messageCost = result.usage ? resultCost : undefined;
  const doneAt = performance.now();
  sendEvent('done', {
    content: finalContent,
    usage: turnUsage,
    usageEstimated: usageLedger.isEstimated,
    toolsUsed: result.toolsUsed,
    model: modelSelection.model,
    billingClass: messageBillingClass,
    memoryContext: turnRecall.receipt,
    contextMetrics: {
      toolCatalogCount,
      toolEligibleCount,
      toolSelectedCount,
      toolOmittedCount,
      transmittedToolSchemaChars,
      estimatedToolSchemaTokens: Math.ceil(transmittedToolSchemaChars / 4),
      finalSystemPromptChars: systemPrompt.length,
      estimatedSystemPromptTokens: Math.ceil(systemPrompt.length / 4),
      packageMode,
      selectorLatencyMs,
      timeToFirstTokenMs: firstTokenAt === null
        ? null
        : Math.max(0, Math.round(firstTokenAt - totalServerStartedAt)),
      agentLatencyMs,
      totalServerLatencyMs: Math.max(0, Math.round(doneAt - totalServerStartedAt)),
      providerInputTokens: turnUsage.inputTokens,
      providerOutputTokens: turnUsage.outputTokens,
    },
    ...(messageCost !== undefined && {
      cost: Math.round(messageCost * 1_000_000) / 1_000_000,
      tokens: { input: turnUsage.inputTokens, output: turnUsage.outputTokens },
    }),
  });

  return { result, turnUsage, messageCost };
}

/**
 * The post-commit enrichment: the completion signal, the automated-turn
 * notification and the memory auto-save. The response is already delivered;
 * the handler's outer catch logs anything thrown here without reaching the
 * client.
 */
export async function runPostCommitEnrichment(
  turn: TurnCompletionTurn,
  completed: CompletedTurnResponse,
): Promise<void> {
  const {
    server, modelSelection, turnTrace, retention, sessionOrch, hasCustomRunner, isAutomatedTurn,
    message, sessionId, effectiveWorkspace, executionScopeId, personaOverride, resolvePersona,
  } = turn;
  const { result, turnUsage, messageCost } = completed;
// Waggle Dance: emit agent completion signal
try {
  emitWaggleSignal({
    type: 'agent:completed',
    workspaceId: executionScopeId,
      content: `Completed: ${(result.toolsUsed ?? []).length} tools used, ${turnUsage.outputTokens} tokens`,
      metadata: { model: modelSelection.model, toolsUsed: result.toolsUsed, cost: messageCost },
    });
} catch { /* best-effort activity projection */ }

  // Enriched so the notification identifies which agent/workspace/task and
  // deep-links to the output (was a generic "Your agent has completed the task").
const wsName =
  server.agentState.listWorkspaces?.().find((w) => w.id === effectiveWorkspace)?.name ??
  'Personal';
  const agentName = personaOverride ? (resolvePersona(personaOverride)?.name ?? 'Agent') : 'Agent';
  const toolCount = (result.toolsUsed ?? []).length;
  // Only a turn nobody is watching notifies: automation, channel and
  // headless review turns. An interactive turn's answer is already on
  // screen, and an inbox entry for every reply is noise (TD-CHAT-12,
  // founder 2026-09-23).
  if (isAutomatedTurn) {
    try {
      emitNotification(server, {
        title: `${agentName} finished in ${wsName}`,
        body: toolCount > 0
          ? `${modelSelection.model} · ${toolCount} tool${toolCount === 1 ? '' : 's'} used`
          : `${modelSelection.model} · response ready`,
        category: 'agent',
      actionUrl: effectiveWorkspace
        ? `/workspaces/${effectiveWorkspace}/chat`
        : '/',
      });
    } catch { /* best-effort notification projection */ }
  }

  // Auto-save is post-commit enrichment: the assistant history, success
  // trace, token stream, and done event above already describe one
  // coherent outcome. Keep this awaited so the workspace mind cannot be
  // released mid-write, but never turn a late disconnect into a hidden
  // memory write or contradict the response that was already committed.
  if (!hasCustomRunner && retention.allowMemoryPersistence) {
    const agentAlreadySaved = (result.toolsUsed ?? []).includes('save_memory');
    if (!agentAlreadySaved) {
      try {
        const saved = await sessionOrch.autoSaveFromExchange(message, result.content, {
          // Frame↔trace backlink — link auto-saved frames to the
          // turn's execution trace so Memory-Trust can answer why this
          // memory exists. Undefined when tracing is unavailable.
          traceId: turnTrace.id?.toString(),
        });
        if (saved.length > 0) {
          log.info(`[chat] auto-saved ${saved.length} memor${saved.length === 1 ? 'y' : 'ies'} after response commit`);
        }
      } catch (e) {
        // Post-commit enrichment is fail-soft. A closed handle indicates
        // unexpected cache eviction and remains observable for diagnosis.
        if (isClosedDbError(e)) {
          log.warn('[waggle][W4A] workspace mind handle closed during post-commit auto-save', {
            workspaceId: effectiveWorkspace,
            sessionId,
            seam: 'autoSaveFromExchange',
            error: e instanceof Error ? e.message : String(e),
          });
        } else {
          // Any other failure (embedding, constraint, a TypeError) drops
          // a memory write too, and used to do it with no record at all
          // (TD-REL-3). The turn is already committed; only log.
          log.warn('[chat] post-commit auto-save failed; the memory write was dropped', {
            workspaceId: effectiveWorkspace,
            sessionId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }
}
