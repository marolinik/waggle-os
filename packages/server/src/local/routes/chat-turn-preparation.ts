/**
 * The chat turn's preparation phase (TD-CHAT-3 slice 14): everything between
 * the decision to run the agent loop and the first model attempt. It emits
 * the start signal and the budget warning, activates the workspace mind,
 * recalls memory, runs the prompt optimizer, assembles the system prompt,
 * registers the pre:tool approval hook, narrows and binds the turn's tools,
 * windows and compresses the conversation, reads team governance and picks
 * the run budget.
 *
 * Moved verbatim from the handler. It reads the handler's values through
 * `TurnPreparationInput` and returns what the attempt chain needs as
 * `TurnPreparation`. Two of those values are still written after this
 * returns, by the bound read tools while an attempt runs, so they are getters
 * rather than copies.
 */
import { performance } from 'node:perf_hooks';
import { CapabilityRouter, scanForInjection, compressConversation, createDefaultCompressionConfig, needsCompression, computeInputTokenBudget, getModelContextWindow, filterAvailableTools, selectAgentRunBudget, type ToolDefinition, type ToolExecutionOutcome } from '@waggle/agent';
import { type AgentLoopConfig, type Orchestrator, type AutonomyLevel, type HookRegistry } from '@waggle/agent';
import { type WorkspaceSession } from '../workspace-sessions.js';
import { emitWaggleSignal } from './waggle-signals.js';
import { getOptimizerService } from '../services/optimizer-service.js';
import { isEnabled, detectTaskShape, type AssembledPrompt } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { markUserFacingError } from '@waggle/shared';
import { allowsAutomaticRecall, allowsConversationHistory, buildTemplateWelcomePrompt, buildTurnMessageWindow, canUseBudgetModelWithoutCloudEgress, filterToolsByTurnMutationPolicy, isExclusiveSuppliedOnlyResponseRequest, isOfflineOllamaModelReference, isAmbiguousMessage, isWorkspaceCatchUpRequest, selectAdvisoryMaxOutputTokens, AMBIGUITY_PROMPT, type TurnContextScope, type TurnMutationPolicy } from './chat-helpers.js';
import { loadRecentWorkspaceSessionContext } from './chat-persistence.js';
import { applyContextWindow } from './chat-context.js';
import { selectChatPromptPackageMode, type ChatPromptPackageMode } from './chat-prompt-packaging.js';
import { getGovernancePermissions } from './chat-governance.js';
import { applyPersonaToolFilter, filterMcpToolsForPersona, selectToolsForTurn } from '../persona-tool-filter.js';
import { isExactConfiguredKeylessCompatibleModel, listOllamaChatModelIds, resolveExplicitRoutableModel } from '../model-availability.js';
import { bindModelSpendBudget } from '../model-spend-meter.js';
import { type WorkspaceTurnScope } from '../workspace-turn-coordinator.js';
import { bindChatCollaborationTools } from '../chat-collaboration.js';
import { DECISION_MATRIX_TOOL_SEQUENCE, EXPLICIT_READ_ONLY_TOOL_NAMES, conversationalToolPolicyPrompt, filterGatedToolsForConversationalTurn, isCurrentConversationOnlyReferenceRequest, isExplicitExternalResearchRequest, isExplicitGatedToolRequest, isExplicitMemorySaveRequest, requestedBuiltInArtifactToolNames, resolveExplicitReadOnlyToolChoice, shouldRequireCapabilityAcquisitionTools, shouldUsePersistedMemoryForTurn, type ApprovalTimeoutPolicy } from './chat-turn-policy.js';
import { createChatApprovalHook } from './chat-approval-hook.js';
import { TurnExecutionTrace } from './chat-turn-execution-trace.js';
import { TurnRecalledContext } from './chat-turn-recall-context.js';
import { TurnRetention } from './chat-turn-retention.js';
import { bindDirectReadFileTool, bindExactReadSkillTool, bindExactWorkspaceMemorySearchTool, type BoundedExactMemoryExecutionOutcome, type DirectReadFileDirective } from './chat-bounded-read-tools.js';
import { TurnModelSelection } from './chat-turn-model-selection.js';
import { TurnResources } from './chat-turn-resources.js';
import { isClosedDbError } from './chat-mind-handle.js';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '../logger.js';
import type { AgentPersona, AgentRunBudgetPolicy, ScanResult } from '@waggle/agent';
import type { AgentRunner } from './chat.js';

const log = createLogger('chat');

/** Injected runners still need request-scoped evidence boundaries. */
export function shouldPackageSystemPromptForTurn(
  hasCustomRunner: boolean,
  contextScope: TurnContextScope,
  closedWorldRewrite: boolean,
): boolean {
  return !hasCustomRunner || contextScope !== 'default' || closedWorldRewrite;
}

/** The handler's values the preparation phase reads; none is written back. */
export interface TurnPreparationInput {
  activeSessionStateWorkspaceId: string;
  activeWorkspaceId: string;
  agentMessage: string;
  agentRunner: AgentRunner;
  allTools: FastifyInstance['agentState']['allTools'];
  approvalTimeoutPolicy: ApprovalTimeoutPolicy;
  authorizedWorkspace: string | null | undefined;
  autoApprove: boolean;
  autonomyLevel: AutonomyLevel;
  boundedExactPersistedMemoryLookup: boolean;
  budgetModel: string | null;
  buildSystemPrompt: (orch: Orchestrator, workspacePath?: string, sessionId?: string, historyLength?: number, workspaceId?: string, personaOverride?: string, assembled?: AssembledPrompt | null, packageMode?: ChatPromptPackageMode, closedWorldRewrite?: boolean, contextScope?: TurnContextScope, selectedToolCount?: number, explicitReadOnlyToolChoice?: string, explicitReadOnlyToolSequence?: readonly string[], selectedModel?: string, cacheWorkspaceId?: string, toolFreeAdvisory?: boolean, includePersistedMemory?: boolean, includeConversationDerivedWorkspaceState?: boolean, availableTools?: readonly Pick<ToolDefinition, "name" | "description">[]) => string;
  buildTurnContextSuffix: (turnSessionId: string | undefined, turnCount: number) => string;
  channelMeta: { platform: string; chatId: string; } | undefined;
  closedWorldRewrite: boolean;
  compactionFrameIds: Map<string, number>;
  compressionSummaries: Map<string, string>;
  costTracker: FastifyInstance['agentState']['costTracker'];
  decisionMatrixToolSequenceRequested: boolean;
  directReadFileDirective: DirectReadFileDirective;
  effectiveWorkspace: string | undefined;
  executionScopeId: string;
  executionWorkspacePath: string | undefined;
  explicitReadOnlyToolCandidate: "read_file" | "read_skill" | "search_memory" | "list_skills" | undefined;
  getLitellmUrl: () => FastifyInstance['localConfig']['litellmUrl'];
  hasCustomRunner: boolean;
  history: NonNullable<ReturnType<FastifyInstance['agentState']['sessionHistories']['get']>>;
  injectionResult: ScanResult;
  isAutomatedTurn: boolean;
  modelSelection: TurnModelSelection;
  persistedMemoryReadAllowed: boolean;
  personaOverride: string | undefined;
  proposeHeldTurn: boolean | undefined;
  requestHookRegistry: HookRegistry | undefined;
  reroutedMessage: string | undefined;
  retainedTurnJson: (value: unknown) => string;
  retainedTurnText: (value: string) => string;
  retention: TurnRetention;
  selectedSkill: string | undefined;
  sendEvent: (event: string, data: unknown) => void;
  server: FastifyInstance;
  sessionId: string;
  sessionOrch: Orchestrator;
  sessionPersistenceDataDir: string;
  sessionStateKey: string;
  sessionToolSequences: Map<string, string[][]>;
  sessionTools: ToolDefinition[] | undefined;
  throwIfTurnAborted: () => void;
  turnId: string;
  turnMutationPolicy: TurnMutationPolicy;
  turnPersona: AgentPersona | null;
  turnPersonaId: string | null;
  turnRecall: TurnRecalledContext;
  turnResources: TurnResources;
  turnSignal: AbortSignal;
  turnTrace: TurnExecutionTrace;
  usesNamedWorkspace: boolean;
  workspaceTurnScope: WorkspaceTurnScope | undefined;
  wsSession: WorkspaceSession | undefined;
}

/** What the rest of the turn reads from the preparation phase. */
export interface TurnPreparation {
  readonly activePersonaId: string | null;
  readonly agentRunBudget: AgentRunBudgetPolicy;
  readonly boundedExactMemoryExecutionOutcome: BoundedExactMemoryExecutionOutcome | null;
  readonly capabilityRouter: CapabilityRouter | undefined;
  readonly directReadFileExecutionOutcome: ToolExecutionOutcome | null;
  readonly effectiveTools: ToolDefinition[];
  readonly explicitReadOnlyToolChoice: string | undefined;
  readonly externalToolNames: Set<string>;
  readonly governancePolicies: { blockedTools?: string[]; allowedSources?: string[]; } | undefined;
  readonly maxOutputTokens: number | undefined;
  readonly packageMode: ChatPromptPackageMode | "custom";
  readonly reasoningForModelAttempt: (logicalModel: string) => AgentLoopConfig["reasoning"];
  readonly rebuildSystemPromptForModel: ((logicalModel: string) => Promise<string>) | null;
  readonly requiredToolSequence: readonly string[] | undefined;
  readonly selectorLatencyMs: number;
  readonly systemPrompt: string;
  readonly toolCatalogCount: number;
  readonly toolEligibleCount: number;
  readonly toolOmittedCount: number;
  readonly toolSelectedCount: number;
  readonly transmittedToolSchemaChars: number;
  readonly windowedMessages: { role: string; content: string; }[];
}

export async function prepareAgentTurn(turn: TurnPreparationInput): Promise<TurnPreparation> {
  const {
    activeSessionStateWorkspaceId,
    activeWorkspaceId,
    agentMessage,
    agentRunner,
    allTools,
    approvalTimeoutPolicy,
    authorizedWorkspace,
    autoApprove,
    autonomyLevel,
    boundedExactPersistedMemoryLookup,
    budgetModel,
    buildSystemPrompt,
    buildTurnContextSuffix,
    channelMeta,
    closedWorldRewrite,
    compactionFrameIds,
    compressionSummaries,
    costTracker,
    decisionMatrixToolSequenceRequested,
    directReadFileDirective,
    effectiveWorkspace,
    executionScopeId,
    executionWorkspacePath,
    explicitReadOnlyToolCandidate,
    getLitellmUrl,
    hasCustomRunner,
    history,
    injectionResult,
    isAutomatedTurn,
    modelSelection,
    persistedMemoryReadAllowed,
    personaOverride,
    proposeHeldTurn,
    requestHookRegistry,
    reroutedMessage,
    retainedTurnJson,
    retainedTurnText,
    retention,
    selectedSkill,
    sendEvent,
    server,
    sessionId,
    sessionOrch,
    sessionPersistenceDataDir,
    sessionStateKey,
    sessionToolSequences,
    sessionTools,
    throwIfTurnAborted,
    turnId,
    turnMutationPolicy,
    turnPersona,
    turnPersonaId,
    turnRecall,
    turnResources,
    turnSignal,
    turnTrace,
    usesNamedWorkspace,
    workspaceTurnScope,
    wsSession,
  } = turn;
  // Waggle Dance: emit agent start signal
emitWaggleSignal({ type: 'agent:started', workspaceId: executionScopeId, content: retainedTurnText(agentMessage).slice(0, 200) });

// ── Budget check — warn if workspace is over budget ──
if (!hasCustomRunner && effectiveWorkspace) {
    const wsBudgetConfig = server.workspaceManager?.get(effectiveWorkspace);
    if (wsBudgetConfig?.budget != null && wsBudgetConfig.budget > 0) {
      const wsUsage = costTracker.getWorkspaceCost(effectiveWorkspace);
      if (wsUsage >= wsBudgetConfig.budget) {
        sendEvent('step', { content: `\u26a0\ufe0f Budget limit reached ($${wsUsage.toFixed(2)} / $${wsBudgetConfig.budget.toFixed(2)}). Responses may be limited.` });
      }
    }
  }

  // ── Workspace mind activation ────────────────────────────
  // The per-session orchestrator
  // created above already has the workspace mind mounted. This legacy
  // shared-orchestrator activation only fires as a fallback when
  // session creation failed (wsSession is undefined) — matches the
  // old behavior for default/personal-only chats and broken workspaces.
if (!hasCustomRunner && usesNamedWorkspace && !wsSession && effectiveWorkspace) {
    const activated = server.agentState.activateWorkspaceMind(effectiveWorkspace);
    if (!activated) {
      sendEvent('step', { content: `Warning: could not activate workspace memory for "${effectiveWorkspace}". Using personal memory only.` });
    }
  }

  // ── Automatic memory recall ─────────────────────────────
  if (!hasCustomRunner
    && !closedWorldRewrite
    && !retention.toolFreeAdvisory
    && !explicitReadOnlyToolCandidate
    && !isCurrentConversationOnlyReferenceRequest(agentMessage)
    && allowsAutomaticRecall(turnMutationPolicy)) {
    const recallStart = Date.now();
    try {
      sendEvent('step', { content: 'Recalling relevant memories...' });
      sendEvent('tool', { name: 'auto_recall', input: { query: agentMessage } });
      const recall = await sessionOrch.recallMemory(agentMessage);
      throwIfTurnAborted();
      const recallDuration = Date.now() - recallStart;
      if (recall.count > 0) {
        // Scan recalled memory for injection payloads before injecting into prompt
        const recallInjection = scanForInjection(recall.text, 'tool_output');
        if (!recallInjection.safe) {
          log.warn('[security] Injection detected in recalled memory — dropping context', recallInjection.flags);
          sendEvent('step', { content: 'Recalled memories dropped — suspicious content detected.' });
          sendEvent('tool_result', {
            name: 'auto_recall',
            result: 'Recalled memories were not used because they failed safety checks',
            duration: recallDuration,
            isError: false,
          });
        } else {
          turnRecall.adoptRecall(recall.text, recall.count);

          // Include content snippets so ToolCard can show what was recalled
          const snippets = (recall.recalled ?? []).slice(0, 3);
          const snippetText = snippets.map(s => `  - ${s}`).join('\n');
          const resultText = `${recall.count} memories recalled:\n${snippetText}`;
          // Distinct provenance sources of the recalled memories
          // (raw frame.source values; the FE owns the friendly label map).
          // Emit the breakdown ONLY when it covers EVERY recalled
          // frame — a partial breakdown next to "Recalled N memories" would
          // imply all N share these sources. Any 'unknown' (e.g. the rare
          // catch-up lane, which doesn't carry source) suppresses the pill
          // rather than undercount. Never a fabricated source.
          const recalledFrames = recall.recalledFrames ?? [];
          const hasUnknownSource = recalledFrames.some(f => !f.source || f.source === 'unknown');
          const provenanceSources = [...new Set(
            recalledFrames.map(f => f.source).filter((s): s is string => !!s && s !== 'unknown'),
          )];
          const emitProvenance = !hasUnknownSource && provenanceSources.length > 0;
          sendEvent('step', {
            content: `Recalled ${recall.count} relevant memor${recall.count === 1 ? 'y' : 'ies'}.`,
            ...(emitProvenance ? { provenance: { sources: provenanceSources } } : {}),
          });
          sendEvent('tool_result', { name: 'auto_recall', result: resultText, duration: recallDuration, isError: false });
        }
      } else {
        sendEvent('tool_result', { name: 'auto_recall', result: 'No relevant memories found', duration: recallDuration, isError: false });
      }
    } catch {
      throwIfTurnAborted();
      // Non-blocking and sanitized — complete the visible tool lifecycle
      // without leaking the lookup query, stored content, or exception.
      sendEvent('tool_result', {
        name: 'auto_recall',
        result: 'Memory recall was unavailable for this response',
        duration: Date.now() - recallStart,
        isError: true,
      });
    }
  }

  // Count prior user messages FIRST — needed by both GEPA and ambiguity guards.
  // Mid-conversation follow-ups like "yes", "run it", "LGTM" are valid
  // replies and should NOT be expanded or flagged as vague.
  const priorUserMessages = history.filter((m: { role: string }) => m.role === 'user').length;
  const isFirstUserMessage = priorUserMessages <= 1; // history already includes current message

  // ── GEPA Optimizer: classify + expand vague prompts ──────────
  // Uses @ax-llm/ax with cheapest model (Haiku) to optimize user input
  // before the main LLM call. Non-blocking — falls back gracefully.
  // CRITICAL: Only run on the FIRST user message in a session. Mid-conversation
  // replies ("yes", "the first three", "thats fine") must NOT be expanded —
  // GEPA has no conversation context and will misinterpret them as standalone
  // vague requests, generating phantom instructions the user never intended.
  let gepaExpanded: string | null = null;
  if (!hasCustomRunner
    && isFirstUserMessage
    && !closedWorldRewrite
    && !retention.toolFreeAdvisory
    && !explicitReadOnlyToolCandidate
    && retention.allowDerivedPersistence
    && turnMutationPolicy.contextScope === 'default') {
    try {
      const optimizer = await getOptimizerService(server);
      if (optimizer) {
        const result = await optimizer.expandWithChoices(agentMessage);
        throwIfTurnAborted();
        if (result.isVague && result.expanded) {
          gepaExpanded = result.expanded;
          sendEvent('step', { content: `GEPA: Expanded prompt for better results` });
          // Send expansion choices to frontend for ask-first mode
          if (result.clarifyingQuestions && result.clarifyingQuestions.length > 0) {
            sendEvent('gepa_choices', {
              original: agentMessage,
              expanded: result.expanded,
              clarifyingQuestions: result.clarifyingQuestions,
              intent: result.intent,
            });
          }
        }
      }
    } catch {
      throwIfTurnAborted();
      // Non-blocking — optimizer failure doesn't affect chat
    }
  }

  // Build system prompt (with workspace path awareness + recalled memories)
  // Prepend ambiguity guard when user message is too brief/vague
  const shouldCheckAmbiguity = isFirstUserMessage
    && !gepaExpanded
    && !closedWorldRewrite
    && !explicitReadOnlyToolCandidate
    && turnMutationPolicy.contextScope === 'default'; // Skip when expansion or an explicit evidence boundary already resolves intent
  const ambiguityPrefix = (!hasCustomRunner && shouldCheckAmbiguity && isAmbiguousMessage(agentMessage)) ? AMBIGUITY_PROMPT : '';

  // Track session start on first user message
if (isFirstUserMessage && server.telemetry) {
  server.telemetry.track('session_start', {
    workspaceId: executionScopeId,
    templateId: effectiveWorkspace
      ? server.workspaceManager?.get(effectiveWorkspace)?.templateId ?? null
      : null,
  });
  }

  // Template welcome context — inject on first message in a workspace with a template
  let templateContext = '';
  if (!hasCustomRunner
    && isFirstUserMessage
    && !closedWorldRewrite
    && !retention.toolFreeAdvisory
    && !explicitReadOnlyToolCandidate
    && turnMutationPolicy.contextScope === 'default') {
  const wsTemplateId = effectiveWorkspace
    ? server.workspaceManager?.get(effectiveWorkspace)?.templateId
    : undefined;
    if (wsTemplateId) {
      const { BUILT_IN_TEMPLATES } = await import('./workspace-templates.js');
      const tpl = BUILT_IN_TEMPLATES?.find?.((t) => t.id === wsTemplateId);
      if (tpl) {
        templateContext = buildTemplateWelcomePrompt(tpl);
      }
    }
  }

  // Pre-fetch a structured AssembledPrompt when PROMPT_ASSEMBLER is on.
  // The assembler runs sixth-layer prompt packaging (Identity + Persona +
  // memory sections + task-shape scaffold). Failures fall back gracefully
  // to the static system prompt — never block a chat turn on assembler errors.
  const turnTaskShape = detectTaskShape(agentMessage);
  let assembled: AssembledPrompt | null = null;
  const shouldAssemblePrompt = !hasCustomRunner
    && turnMutationPolicy.contextScope === 'default'
    && persistedMemoryReadAllowed
    && !retention.toolFreeAdvisory
    && !explicitReadOnlyToolCandidate
    && isEnabled('PROMPT_ASSEMBLER');

  // When the assembler ran, the recall block is already INSIDE the
  // assembled prompt, so `turnRecall.staticPromptTail(Boolean(assembledForModel))`
  // in `rebuildSystemPromptForModel` omits it; appending it again would
  // inject every recalled memory twice.
  let systemPrompt = hasCustomRunner ? 'You are a helpful AI assistant.' : '';
  const initialPromptModel = modelSelection.model;
  let rebuildSystemPromptForModel: ((logicalModel: string) => Promise<string>) | null = null;

  // Register a per-request pre:tool hook for confirmation gates
  // This fires during the agent loop and pauses until user approves/denies
  // Held by turnResources (not a local) so the outer finally can always
  // clean up regardless of which path we exit on.
  const unregisterToolHook = requestHookRegistry?.on('pre:tool', createChatApprovalHook({
    server,
    executionScopeId,
    sessionId,
    effectiveWorkspace,
    autonomyLevel,
    proposeHeldTurn,
    approvalTimeoutPolicy,
    autoApprove,
    retention,
    turnSignal,
    sendEvent,
    retainedTurnJson,
    retainedTurnText,
  }));
  if (unregisterToolHook) turnResources.holdToolHook(unregisterToolHook);

  // Use workspace-scoped tools if a workspacePath was specified
if (!hasCustomRunner && usesNamedWorkspace && !sessionTools) {
    throw new Error('Workspace chat runtime is unavailable.');
  }
  let effectiveTools = hasCustomRunner
    ? []
    : sessionTools
      ?? (executionWorkspacePath
        ? server.agentState.buildToolsForWorkspace(
            executionWorkspacePath,
            sessionOrch,
            authorizedWorkspace ?? effectiveWorkspace,
          )
        : allTools);
  const catalogToolNames = new Set(effectiveTools.map(tool => tool.name));
  let toolCatalogCount = catalogToolNames.size;
  let toolEligibleCount = 0;
  let toolSelectedCount = 0;
  let toolOmittedCount = 0;
  let transmittedToolSchemaChars = 0;
  let selectorLatencyMs = 0;
  let packageMode: ChatPromptPackageMode | 'custom' = 'custom';
  let spawnAvailableTools = effectiveTools;
  let explicitReadOnlyToolChoice: string | undefined;
  let requiredToolSequence: readonly string[] | undefined;
  let directReadFileExecutionOutcome: ToolExecutionOutcome | null = null;
  let boundedExactMemoryExecutionOutcome: BoundedExactMemoryExecutionOutcome | null = null;

  // Filter tools by persona — non-technical personas get a reduced
  // tool set. The always-available + read-only-write-strip policy lives in
  // persona-tool-filter.ts (extracted so the closed-learning-loop guarantee
  // — create_skill survives the allowlist — is unit-testable). This block
  // is !hasCustomRunner-gated: route tests reach it only without an
  // injected runner, as sse-resilience and persona-acceptance do.
  // Resolution order matches buildSystemPrompt: per-window
  // override > workspace config.
  const wsConfig = effectiveWorkspace ? server.workspaceManager?.get(effectiveWorkspace) : null;
  const activePersonaId = turnPersonaId;
  const activePersona = turnPersona;
  if (!hasCustomRunner && activePersona) {
    effectiveTools = applyPersonaToolFilter(
      effectiveTools,
      activePersona,
      requestedBuiltInArtifactToolNames(agentMessage),
    );
  }

  if (!hasCustomRunner
    && usesNamedWorkspace
    && persistedMemoryReadAllowed
    && allowsConversationHistory(turnMutationPolicy)
    && isWorkspaceCatchUpRequest(agentMessage)) {
    const recentSessions = loadRecentWorkspaceSessionContext(
      sessionPersistenceDataDir,
      activeWorkspaceId,
      sessionId,
    );
    if (recentSessions.text) {
      const sessionContextScan = scanForInjection(recentSessions.text, 'tool_output');
      if (sessionContextScan.safe) {
        turnRecall.adoptWorkspaceSessions(recentSessions.text);
        sendEvent('step', {
          content: `Reviewed ${recentSessions.sessionCount} recent workspace session${recentSessions.sessionCount === 1 ? '' : 's'}.`,
        });
      } else {
        log.warn('[security] Injection detected in prior workspace session context — dropping context', sessionContextScan.flags);
      }
    }
  }
  if (closedWorldRewrite || retention.toolFreeAdvisory) {
    effectiveTools = [];
    spawnAvailableTools = [];
  }

  // Schedule-originated turns must not schedule further work — an
  // ai_task turn re-invoking create_schedule could self-replicate, and
  // loop-guard cannot see across turns. list/delete stay available.
  if (sessionId.startsWith('schedule-')) {
    effectiveTools = effectiveTools.filter(
      t => t.name !== 'create_schedule' && t.name !== 'trigger_schedule',
    );
  }

  // Dynamic tool availability — run checkAvailability on each tool
  // SEC: capture the persona + availability filtered tool names BEFORE the
  // conversational-turn narrowing. This is the allowlist a spawned
  // sub-agent / workflow worker is intersected against: the persona and
  // availability restrictions must carry across spawn, but the per-turn
  // conversational narrowing (a UX heuristic) must not shrink a
  // sub-agent's legitimate toolset for its explicit task.
  let spawnAllowedToolNames: ReadonlySet<string> | null = null;
  const externalToolNames = new Set<string>();
  const retrievedToolNames = new Set<string>();
  if (!hasCustomRunner && !closedWorldRewrite && !retention.toolFreeAdvisory) {
    effectiveTools = filterAvailableTools(effectiveTools);
    spawnAvailableTools = effectiveTools;

    // Relevance-gate connected MCP tools into the pool. This is
    // the FIRST point MCP tools enter effectiveTools. Runs after
    // availability filtering (so counts are real) and before the
    // conversational narrowing + spawn-allowlist snapshot, so a spawned
    // sub-agent inherits the selected MCP tools. Below the threshold the
    // retriever injects them all; above it, the conversation's union-only
    // accumulated top-k. Persona denylist / read-only rails still apply.
    // Evidence-bounded turns use only built-in, workspace-rooted reads;
    // do not spend retrieval work or expose ambient external metadata.
    const runningMcpTools = persistedMemoryReadAllowed
      ? server.agentState.mcpRuntime.getToolsForWorkspace(executionScopeId)
      : [];
    for (const tool of runningMcpTools) catalogToolNames.add(tool.name);
    if (runningMcpTools.length > 0) {
      const retrievalCfg = new WaggleConfig(server.localConfig.dataDir).getMcpToolRetrieval();
      const retrieval = await server.agentState.mcpToolRetriever.selectToolsWithDetails(
        runningMcpTools, history, sessionStateKey, retrievalCfg,
      );
      throwIfTurnAborted();
      let selectedMcp = retrieval.tools;
      if (activePersona) selectedMcp = filterMcpToolsForPersona(selectedMcp, activePersona);
      selectedMcp = filterAvailableTools(selectedMcp);
      if (selectedMcp.length > 0) {
        const present = new Set(effectiveTools.map(t => t.name));
        const additions = selectedMcp.filter(t => !present.has(t.name));
        const retrievedThisTurn = new Set(retrieval.retrievedToolNames);
        for (const candidate of additions) {
          externalToolNames.add(candidate.name);
          if (retrievedThisTurn.has(candidate.name)) retrievedToolNames.add(candidate.name);
        }
        effectiveTools = [...effectiveTools, ...additions];
      }
    }

    // Plugins remain parent-only. Materialize exactly once, apply the
    // same unknown-external persona rails as MCP, and keep native names
    // first so a plugin cannot shadow a built-in implementation.
    spawnAvailableTools = effectiveTools;
    let materializedPlugins: ToolDefinition[] = persistedMemoryReadAllowed
      ? server.agentState.pluginRuntimeManager.getAllTools()
      : [];
    for (const tool of materializedPlugins) catalogToolNames.add(tool.name);
    if (activePersona) {
      materializedPlugins = filterMcpToolsForPersona(materializedPlugins, activePersona);
    }
    materializedPlugins = filterAvailableTools(materializedPlugins);
    if (materializedPlugins.length > 0) {
      const present = new Set(effectiveTools.map(t => t.name));
      const additions = materializedPlugins.filter(t => !present.has(t.name));
      for (const candidate of additions) externalToolNames.add(candidate.name);
      effectiveTools = [...effectiveTools, ...additions];
    }
  }

  // If this is a rerouted slash command, replace the last user message
  // with the enriched agent prompt so the LLM gets better instructions
  if (reroutedMessage && !turnMutationPolicy.denyConversationHistory) {
    // The original slash command is already persisted to disk by the
    // user-turn `persistMessage` call before command dispatch.
    // For the agent loop, swap in the rerouted message so the LLM sees the
    // enhanced prompt (e.g., "Draft the following. Search memory first...")
    let lastUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx >= 0) {
      history[lastUserIdx] = { role: 'user', content: reroutedMessage };
    }
  }

  // Apply intelligent context compression — replaces the old sliding window.
  // When conversation exceeds 50% of context window: prune tool results,
  // protect head/tail, LLM-summarize the middle using budget model ($0 cost).
  let windowedMessages: Array<{ role: string; content: string }>;
  let compressionModel = budgetModel
    && canUseBudgetModelWithoutCloudEgress(modelSelection.model, budgetModel)
    ? budgetModel
    : null;
  const liveModelBudget = costTracker.getBudget();
  const paidCompressionBlocked = liveModelBudget.mode === 'hard'
    && liveModelBudget.dailyBudgetUsd !== null;
  if (compressionModel
    && paidCompressionBlocked
    && !isOfflineOllamaModelReference(compressionModel)) {
    compressionModel = null;
  }
  const discoveredWindow = getModelContextWindow(modelSelection.model);
  const isLocalModel = isOfflineOllamaModelReference(modelSelection.model);
  const maxContextTokens = computeInputTokenBudget(0, discoveredWindow, false, {
    conservativeDefault: isLocalModel ? 8192 : 128_000,
  });
  if (!closedWorldRewrite
    && turnMutationPolicy.contextScope === 'default'
    && compressionModel
    && isLocalModel
    && needsCompression(history, { maxContextTokens, compressionThreshold: 0.5 })) {
    const verifiedCompressionModel = await resolveExplicitRoutableModel(server, compressionModel);
    throwIfTurnAborted();
    compressionModel = verifiedCompressionModel
      && isOfflineOllamaModelReference(verifiedCompressionModel)
      ? verifiedCompressionModel
      : null;
  }
  if (closedWorldRewrite || retention.toolFreeAdvisory || explicitReadOnlyToolCandidate) {
    windowedMessages = [{ role: 'user', content: agentMessage }];
  } else if (!allowsConversationHistory(turnMutationPolicy)) {
    windowedMessages = buildTurnMessageWindow(history, agentMessage, turnMutationPolicy);
  } else if (compressionModel) {
    // §B: size compaction to the actual model window so a local 4k/8k model
    // is not treated as a 128k model. Local (ollama/*) models with an unknown
    // window get a conservative 8k floor; non-local/unknown cloud ids we don't
    // map yet (deepseek/mistral/openrouter/…) keep the prior 128k baseline so
    // they aren't over-compacted.
    const compressionUsesOllama = compressionModel.trim().toLowerCase().startsWith('ollama/');
    const ollamaHost = process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434';
    const compressionConfig = createDefaultCompressionConfig({
      budgetModel: compressionUsesOllama
        ? compressionModel.slice('ollama/'.length)
        : compressionModel,
      litellmUrl: compressionUsesOllama ? ollamaHost : getLitellmUrl(),
      litellmApiKey: server.agentState.litellmApiKey,
      maxContextTokens,
    });
    const previousSummary = compressionSummaries.get(sessionStateKey) ?? null;
    const compressionResult = await compressConversation(history, compressionConfig, previousSummary);
    throwIfTurnAborted();
    windowedMessages = compressionResult.messages;

    if (compressionResult.compressed) {
      log.info(`[context-compression] Compressed ${compressionResult.originalTokens}→${compressionResult.compressedTokens} tokens (session=${sessionId})`);
      sendEvent('step', { content: `Context compressed: ${compressionResult.originalTokens}→${compressionResult.compressedTokens} tokens` });
      if (compressionResult.summary) {
        compressionSummaries.set(sessionStateKey, compressionResult.summary);

        // Dual-use — persist the summary the compressor already
        // paid for as a durable memory frame (skipped for automated
        // turns, and for injected-runner turns like every other
        // write-back seam in this route). The summary aggregates
        // tool/connector output, so scan it before it can enter durable
        // memory; fail-soft with the W4A closed-DB guard so persistence
        // never fails the turn.
        if (!hasCustomRunner && retention.allowMemoryPersistence) {
          const summaryScan = scanForInjection(compressionResult.summary, 'tool_output');
          if (summaryScan.score >= 0.7) {
            log.warn(`[context-compression] summary NOT persisted — injection score ${summaryScan.score} (session=${sessionId})`);
          } else {
            try {
              const frameId = await sessionOrch.persistCompactionSummary(
                compressionResult.summary, sessionId, compactionFrameIds.get(sessionStateKey) ?? null,
              );
              throwIfTurnAborted();
              if (frameId != null) {
                compactionFrameIds.set(sessionStateKey, frameId);
                sendEvent('step', { content: 'Session summary saved to memory' });
              }
            } catch (e) {
              throwIfTurnAborted();
              if (isClosedDbError(e)) {
                log.warn(`[context-compression] summary persist skipped — mind handle closed mid-turn (session=${sessionId})`);
              } else {
                log.warn(`[context-compression] summary persist failed: ${e instanceof Error ? e.message : e}`);
              }
            }
          }
        }
      }
    }
  } else {
    // Fallback to simple sliding window when no budget model is configured
    windowedMessages = applyContextWindow(history);
  }

  // GEPA: if the prompt was expanded, replace the last user message
  // so the LLM sees the optimized version (original stays in disk history)
  if (gepaExpanded) {
    windowedMessages = windowedMessages.map((m, i, arr) => {
      if (i === arr.length - 1 && m.role === 'user') {
        return { ...m, content: `${gepaExpanded}\n\n(Original: "${m.content}")` };
      }
      return m;
    });
  }

  // Governance policies for team workspaces — direct call (no HTTP loopback)
  let governancePolicies: { blockedTools?: string[]; allowedSources?: string[] } | undefined;
  if (wsConfig?.teamId && effectiveWorkspace) {
    const lookup = await getGovernancePermissions(
      server.localConfig.dataDir,
      effectiveWorkspace,
      wsConfig.teamRole,
    );
    throwIfTurnAborted();
    if (lookup.status === 'invalid' || lookup.status === 'unavailable') {
      // Neither outcome tells us what this team allows, so the turn is
      // refused rather than run with the team's restrictions dropped.
      //
      // `unavailable` reads as transient, and it used to proceed on that
      // reasoning. It is narrower than it sounds: `chat-governance.ts`
      // serves a cached policy first and falls back to a STALE one when
      // the call fails, so reaching here means no policy has ever been
      // fetched for this workspace in this process. There is nothing to
      // be transient about — proceeding hands back precisely the tools
      // the admin blocked, on the one path where we know the least.
      //
      // One value, three readers: the parent tool filter below, the
      // spawn list beside it, and `securityContext.blockedTools` for
      // child agents. Refusing here is what keeps all three honest.
      const unreadable = lookup.status === 'invalid';
      log.warn(
        unreadable
          ? '[chat] governance policies unreadable; refusing the turn'
          : '[chat] governance policies unavailable; refusing the turn',
        { workspaceId: effectiveWorkspace, sessionId, error: lookup.reason },
      );
      throw markUserFacingError(new Error(
        unreadable
          ? 'Team governance policies could not be verified for this workspace. Try again or contact your team admin.'
          : 'Team governance policies could not be reached for this workspace. Check your connection and try again.',
      ));
    }
    governancePolicies = lookup.status === 'policy' ? lookup.policies : undefined;
  }

  if (!hasCustomRunner) {
    // Remove governance-blocked definitions before serialization, while
    // retaining the executor's deny check as defense in depth.
    const blockedTools = new Set(governancePolicies?.blockedTools ?? []);
    if (blockedTools.size > 0) {
      effectiveTools = effectiveTools.filter(tool => !blockedTools.has(tool.name));
      spawnAvailableTools = spawnAvailableTools.filter(tool => !blockedTools.has(tool.name));
    }
    const policyInputTools = effectiveTools;
    effectiveTools = filterToolsByTurnMutationPolicy(
      effectiveTools,
      turnMutationPolicy,
      externalToolNames,
    );
    if ((decisionMatrixToolSequenceRequested || selectedSkill) && turnMutationPolicy.denyMemoryRead) {
      const builtInReadSkill = policyInputTools.find(tool => (
        tool.name === 'read_skill' && !externalToolNames.has(tool.name)
      ));
      if (builtInReadSkill && !effectiveTools.some(tool => tool.name === 'read_skill')) {
        // A saved-memory opt-out must not disable an explicitly bounded
        // installed-skill read. The sequence below binds this built-in
        // tool to decision-matrix before anything reaches the model.
        effectiveTools = [...effectiveTools, builtInReadSkill];
      }
    }
    spawnAvailableTools = filterToolsByTurnMutationPolicy(
      spawnAvailableTools,
      turnMutationPolicy,
      externalToolNames,
    );
    spawnAllowedToolNames = new Set(spawnAvailableTools.map(tool => tool.name));

    const beforeNarrowing = effectiveTools.length;
    if (decisionMatrixToolSequenceRequested
      && explicitReadOnlyToolCandidate === 'read_skill') {
      const sequenceTools = DECISION_MATRIX_TOOL_SEQUENCE.map(name => (
        effectiveTools.filter(tool => tool.name === name)
      ));
      const sequenceAvailable = injectionResult.safe
        && sequenceTools.every(matches => matches.length === 1);
      if (sequenceAvailable) {
        requiredToolSequence = DECISION_MATRIX_TOOL_SEQUENCE;
        effectiveTools = DECISION_MATRIX_TOOL_SEQUENCE.map((name, index) => sequenceTools[index][0]);
        effectiveTools = bindExactReadSkillTool(effectiveTools, 'decision-matrix');
      } else {
        effectiveTools = [];
      }
      explicitReadOnlyToolChoice = undefined;
    } else if (selectedSkill && explicitReadOnlyToolCandidate === 'read_skill') {
      explicitReadOnlyToolChoice = injectionResult.safe
        && effectiveTools.some(tool => tool.name === 'read_skill')
        ? 'read_skill'
        : undefined;
      if (explicitReadOnlyToolChoice) {
        effectiveTools = bindExactReadSkillTool(effectiveTools, selectedSkill);
      }
    } else if (explicitReadOnlyToolCandidate === 'read_file') {
      explicitReadOnlyToolChoice = injectionResult.safe
        && directReadFileDirective.kind === 'valid'
        && turnTaskShape.complexity === 'simple'
        && effectiveTools.some(tool => tool.name === 'read_file')
        ? 'read_file'
        : undefined;
    } else if (explicitReadOnlyToolCandidate === 'search_memory') {
      explicitReadOnlyToolChoice = injectionResult.safe
        && boundedExactPersistedMemoryLookup
        && effectiveTools.some(tool => tool.name === 'search_memory')
        ? 'search_memory'
        : undefined;
      if (explicitReadOnlyToolChoice) {
        effectiveTools = bindExactWorkspaceMemorySearchTool(
          effectiveTools,
          agentMessage,
          outcome => { boundedExactMemoryExecutionOutcome = outcome; },
        );
      }
    } else {
      explicitReadOnlyToolChoice = injectionResult.safe
        ? resolveExplicitReadOnlyToolChoice(agentMessage, effectiveTools)
        : undefined;
    }
    if (requiredToolSequence) {
      // Exact sequence is already narrowed, ordered, and bound above.
    } else if (explicitReadOnlyToolCandidate) {
      effectiveTools = explicitReadOnlyToolChoice
        ? effectiveTools.filter(tool => tool.name === explicitReadOnlyToolChoice)
        : [];
    } else {
      effectiveTools = explicitReadOnlyToolChoice
        ? effectiveTools.filter(tool => tool.name === explicitReadOnlyToolChoice)
        : filterGatedToolsForConversationalTurn(
          effectiveTools,
          agentMessage,
          autonomyLevel,
          turnMutationPolicy,
          externalToolNames,
        );
    }
    if (effectiveTools.length !== beforeNarrowing) {
      log.info(`[chat] conversational turn: withheld ${beforeNarrowing - effectiveTools.length} deferred tools until explicitly requested`);
    }

    if (explicitReadOnlyToolChoice === 'read_file'
      && directReadFileDirective.kind === 'valid'
      && executionWorkspacePath) {
      effectiveTools = bindDirectReadFileTool(
        effectiveTools,
        executionWorkspacePath,
        directReadFileDirective.expectedPath,
        outcome => { directReadFileExecutionOutcome = outcome; },
      );
    }
  }

  if (workspaceTurnScope) {
    effectiveTools = workspaceTurnScope.wrapTools(effectiveTools, externalToolNames);
    spawnAvailableTools = workspaceTurnScope.wrapTools(spawnAvailableTools, externalToolNames);
  }

  // Bind collaboration producers to THIS request's workspace, session,
  // security policy, and runner. Static startup tools are replaced only
  // when their names survived persona/availability/intent filtering.
  if (!hasCustomRunner) {
    const childAgentRunner = bindModelSpendBudget(
      agentRunner,
      costTracker,
      executionScopeId,
      listOllamaChatModelIds,
      () => turnTrace.id,
      (model) => isExactConfiguredKeylessCompatibleModel(server, model),
    );
    effectiveTools = bindChatCollaborationTools({
      server,
      visibleTools: effectiveTools,
      workerTools: spawnAvailableTools,
      workspaceId: executionScopeId,
      parentSessionId: sessionId,
      parentTask: agentMessage,
      model: modelSelection.model,
      runLoop: childAgentRunner,
      runWorkerTransaction: workspaceTurnScope
        ? (tools, operation) => workspaceTurnScope!.runChildTransaction(
            tools,
            operation,
            externalToolNames,
          )
        : undefined,
      allowDerivedPersistence: retention.allowDerivedPersistence,
      securityContext: {
        hooks: requestHookRegistry,
        blockedTools: governancePolicies?.blockedTools,
        allowedToolNames: spawnAllowedToolNames,
      },
      parentSignal: turnSignal,
      turnOrigin: {
        session: sessionId,
        workspace: effectiveWorkspace ?? null,
        ...(channelMeta?.platform && channelMeta?.chatId
          ? { channel: { platform: channelMeta.platform, chatId: channelMeta.chatId } }
          : {}),
      },
    });
  }

  // Iteration budget — prevents runaway agent loops
  if (!hasCustomRunner) {
    toolCatalogCount = catalogToolNames.size;
    toolEligibleCount = effectiveTools.length;
    const sequenceHistory = sessionToolSequences.get(sessionStateKey);
    const previousToolSequence = allowsConversationHistory(turnMutationPolicy)
      ? sequenceHistory?.[sequenceHistory.length - 1] ?? []
      : [];
    const recentMessages = allowsConversationHistory(turnMutationPolicy)
      ? history
        .slice(0, -1)
        .filter(entry => entry.role === 'user' || entry.role === 'assistant')
        .slice(-8)
        .map(entry => ({ role: entry.role, content: entry.content }))
      : [];
    const selectorStartedAt = performance.now();
    const selection = selectToolsForTurn(effectiveTools, {
      message: agentMessage,
      recentMessages,
      recentToolNames: previousToolSequence,
      preferredToolNames: activePersona?.tools ?? [],
      mandatoryToolNames: [
        ...(requiredToolSequence ?? []),
        ...(explicitReadOnlyToolChoice ? [explicitReadOnlyToolChoice] : []),
        ...(shouldUsePersistedMemoryForTurn(agentMessage) ? ['search_memory'] : []),
        ...(shouldRequireCapabilityAcquisitionTools(agentMessage, effectiveTools)
          && !turnMutationPolicy.denyAllMutations
          && !activePersona?.isReadOnly
          ? ['search_skills', 'create_skill']
          : []),
      ],
      externalToolNames: [...externalToolNames],
      retrievedToolNames: [...retrievedToolNames],
    });
    selectorLatencyMs = Math.max(0, Math.round(performance.now() - selectorStartedAt));
    effectiveTools = selection.tools;
    toolSelectedCount = effectiveTools.length;
    toolOmittedCount = selection.omittedCount;
    transmittedToolSchemaChars = toolSelectedCount > 0 ? selection.schemaChars : 0;
    log.info(`[chat] turn tools: selected ${effectiveTools.length}, omitted ${selection.omittedCount}, schema ${selection.schemaChars} chars`);
  }
  if (requiredToolSequence) {
    const selectedSequenceTools = requiredToolSequence.map(name => (
      effectiveTools.filter(tool => tool.name === name)
    ));
    const sequenceIntact = effectiveTools.length === requiredToolSequence.length
      && selectedSequenceTools.every(matches => matches.length === 1);
    if (sequenceIntact) {
      // Selection ranks by relevance. Restore the already-validated
      // execution order without broadening the selected capability set.
      effectiveTools = selectedSequenceTools.map(matches => matches[0]);
    } else {
      requiredToolSequence = undefined;
      effectiveTools = [];
      toolSelectedCount = 0;
      toolOmittedCount = toolEligibleCount;
      transmittedToolSchemaChars = 0;
    }
  }
  if (explicitReadOnlyToolChoice
    && !effectiveTools.some(tool => tool.name === explicitReadOnlyToolChoice)) {
    explicitReadOnlyToolChoice = undefined;
  }

  if (shouldAssemblePrompt) {
    try {
      assembled = await sessionOrch.buildAssembledPrompt(agentMessage, turnPersona, {
        taskShape: turnTaskShape,
        turnId,
        recalledText: turnRecall.assemblerText,
        model: modelSelection.model,
        availableTools: effectiveTools,
      });
      throwIfTurnAborted();
      log.info(
        `[prompt-assembler] applied turn=${turnId.slice(0, 8)} `
        + `shape=${turnTaskShape.type ?? 'none'} conf=${turnTaskShape.confidence.toFixed(2)} `
        + `tier=${assembled.debug.tier} sections=${assembled.debug.sectionsIncluded.length} `
        + `frames=${assembled.debug.framesUsed} chars=${assembled.debug.totalChars}`,
      );
    } catch (err) {
      throwIfTurnAborted();
      log.warn(`[prompt-assembler] failed, falling back to static prompt: ${(err as Error).message}`);
      assembled = null;
    }
  }

  if (workspaceTurnScope) {
    const workspaceAccess = workspaceTurnScope.classify(effectiveTools, externalToolNames);
    if (workspaceAccess !== 'none') {
      let queued = false;
      await workspaceTurnScope.acquire(workspaceAccess, (queuePosition) => {
        queued = true;
        sendEvent('step', {
          content: 'Waiting for another agent to finish editing this workspace\u2026',
          phase: 'workspace_queue',
          queuePosition,
        });
      });
      throwIfTurnAborted();
      if (queued) {
        sendEvent('step', {
          content: 'Workspace is ready; continuing this session.',
          phase: 'workspace_acquired',
        });
      }
    }
  }

  // Package the prompt only after the executable tool set is final. A
  // genuinely conversational turn can stay compact; every tool-bearing,
  // agentic, sensitive, or complex turn retains the full operating spec.
  if (shouldPackageSystemPromptForTurn(
    hasCustomRunner,
    turnMutationPolicy.contextScope,
    closedWorldRewrite,
  )) {
    const explicitCapabilityRequest = isExplicitGatedToolRequest(agentMessage)
      || shouldUsePersistedMemoryForTurn(agentMessage)
      || isExplicitMemorySaveRequest(agentMessage)
      || isExplicitExternalResearchRequest(agentMessage);
    const selectedPackageMode = selectChatPromptPackageMode({
      message: agentMessage,
      selectedToolCount: effectiveTools.length,
      autonomyLevel,
      isAutomatedTurn,
      explicitCapabilityRequest,
      taskComplexity: turnTaskShape.complexity,
      suspiciousInjection: !injectionResult.safe,
      selectedToolsReadOnly: effectiveTools.length > 0
        && effectiveTools.every(tool => EXPLICIT_READ_ONLY_TOOL_NAMES.has(tool.name)),
      explicitReadOnlyToolChoice: explicitReadOnlyToolChoice === explicitReadOnlyToolCandidate
        ? explicitReadOnlyToolChoice
        : undefined,
      explicitReadOnlyToolSequence: decisionMatrixToolSequenceRequested
        ? DECISION_MATRIX_TOOL_SEQUENCE
        : undefined,
      explicitToolFreeAdvisory: retention.toolFreeAdvisory,
      exclusiveSuppliedOnlyResponseContract: closedWorldRewrite
        || isExclusiveSuppliedOnlyResponseRequest(agentMessage),
    });
    packageMode = selectedPackageMode;
    rebuildSystemPromptForModel = async (logicalModel: string): Promise<string> => {
      let assembledForModel = assembled;
      if (assembled && logicalModel !== initialPromptModel) {
        try {
          assembledForModel = await sessionOrch.buildAssembledPrompt(agentMessage, turnPersona, {
            taskShape: turnTaskShape,
            turnId,
            recalledText: turnRecall.assemblerText,
            model: logicalModel,
            availableTools: effectiveTools,
          });
          throwIfTurnAborted();
          log.info(
            `[prompt-assembler] rebuilt turn=${turnId.slice(0, 8)} model=${logicalModel} `
            + `tier=${assembledForModel.debug.tier} chars=${assembledForModel.debug.totalChars}`,
          );
        } catch (err) {
          throwIfTurnAborted();
          log.warn(`[prompt-assembler] fallback rebuild failed, using static prompt: ${(err as Error).message}`);
          assembledForModel = null;
        }
      }

      const packagedSystemPrompt = buildSystemPrompt(
        sessionOrch,
    executionWorkspacePath,
        sessionId,
        history.length,
        effectiveWorkspace,
        personaOverride,
        assembledForModel,
        selectedPackageMode,
        closedWorldRewrite,
        turnMutationPolicy.contextScope,
        effectiveTools.length,
        decisionMatrixToolSequenceRequested
          ? undefined
          : explicitReadOnlyToolChoice ?? explicitReadOnlyToolCandidate,
        decisionMatrixToolSequenceRequested ? DECISION_MATRIX_TOOL_SEQUENCE : undefined,
        logicalModel,
        activeSessionStateWorkspaceId,
        retention.toolFreeAdvisory || Boolean(
          explicitReadOnlyToolCandidate
          && !explicitReadOnlyToolChoice
          && !requiredToolSequence,
        ),
        persistedMemoryReadAllowed,
        allowsConversationHistory(turnMutationPolicy),
        effectiveTools,
      );
      const hasSpecialEvidenceBoundary = turnMutationPolicy.contextScope !== 'default'
        || closedWorldRewrite
        || retention.toolFreeAdvisory
        || Boolean(explicitReadOnlyToolCandidate);
      const basePrompt = hasSpecialEvidenceBoundary
        ? packagedSystemPrompt
        : ambiguityPrefix
          + packagedSystemPrompt
          + templateContext
          + conversationalToolPolicyPrompt(agentMessage, autonomyLevel, effectiveTools.length)
          + turnRecall.staticPromptTail(Boolean(assembledForModel));
      return hasSpecialEvidenceBoundary
        ? basePrompt
        : basePrompt + buildTurnContextSuffix(
          sessionId,
          Math.max(0, windowedMessages.length - 1),
        );
    };
    systemPrompt = await rebuildSystemPromptForModel(modelSelection.model);
    throwIfTurnAborted();
    log.info(`[chat] prompt package: mode=${packageMode}, chars=${systemPrompt.length}, tools=${effectiveTools.length}`);
  }

  // Build routing suggestions from the exact executable/serialized set.
  const capabilityRouter = hasCustomRunner
    || retention.toolFreeAdvisory
    || Boolean(explicitReadOnlyToolCandidate)
    || !persistedMemoryReadAllowed
    || !allowsConversationHistory(turnMutationPolicy)
    ? undefined
    : new CapabilityRouter({
      toolNames: effectiveTools.map(t => t.name),
      skills: server.agentState.skills,
      plugins: server.agentState.pluginRuntimeManager.getActive().map(p => ({
        name: p.getManifest().name,
        description: p.getManifest().description ?? '',
        skills: p.getContributedSkills(),
      })),
      mcpServers: Object.keys(server.agentState.mcpRuntime.getServerStates()),
      subAgentRoles: ['researcher', 'writer', 'coder', 'analyst', 'reviewer', 'planner'],
      mcpRuntime: server.agentState.mcpRuntime,
    });

  let agentRunBudget = selectAgentRunBudget({
    taskShape: turnTaskShape.type,
    complexity: turnTaskShape.complexity,
    selectedToolNames: effectiveTools.map(tool => tool.name),
  });
  let maxOutputTokens: number | undefined;
  const reasoningForModelAttempt = (logicalModel: string): AgentLoopConfig['reasoning'] =>
    retention.toolFreeAdvisory
    && !requiredToolSequence
    && packageMode === 'compact'
    && logicalModel.trim().toLowerCase() === 'openrouter/anthropic/claude-sonnet-5'
      ? { enabled: true, effort: 'low' }
      : undefined;
  if (requiredToolSequence && packageMode === 'compact') {
    agentRunBudget = {
      ...agentRunBudget,
      maxTurns: 3,
      maxToolRounds: 2,
      maxTokenBudget: 18_000,
      synthesisReserveTokens: 2_500,
      toolContextBudget: {
        maxSingleResultChars: 3_000,
        recentResultCount: 2,
        historicalResultChars: 900,
      },
    };
    maxOutputTokens = 1_536;
  } else if (explicitReadOnlyToolChoice && packageMode === 'compact') {
    agentRunBudget = {
      ...agentRunBudget,
      maxTurns: 2,
      maxToolRounds: 1,
      maxTokenBudget: 12_000,
      synthesisReserveTokens: explicitReadOnlyToolChoice === 'read_file' ? 3_500 : 1_500,
    };
    maxOutputTokens = explicitReadOnlyToolChoice === 'read_file'
      ? 3_072
      : explicitReadOnlyToolChoice === 'read_skill'
        ? 1_536
        : 512;
  } else if (explicitReadOnlyToolCandidate && !explicitReadOnlyToolChoice) {
    agentRunBudget = {
      ...agentRunBudget,
      maxTurns: 1,
      maxToolRounds: 1,
      maxTokenBudget: 6_000,
      synthesisReserveTokens: 1_000,
    };
    maxOutputTokens = 512;
  } else if (
    closedWorldRewrite
    || retention.toolFreeAdvisory
    || (turnMutationPolicy.contextScope !== 'default' && effectiveTools.length === 0)
  ) {
    agentRunBudget = {
      ...agentRunBudget,
      maxTurns: 1,
      maxToolRounds: 1,
      maxTokenBudget: 18_000,
      synthesisReserveTokens: 3_000,
    };
    maxOutputTokens = selectAdvisoryMaxOutputTokens(agentMessage);
  } else if (turnMutationPolicy.contextScope === 'workspace-only') {
    agentRunBudget = {
      ...agentRunBudget,
      maxTurns: 3,
      maxToolRounds: 2,
      maxTokenBudget: 19_000,
      synthesisReserveTokens: 2_500,
    };
    maxOutputTokens = 2_500;
  }
  log.info(
    `[chat] agent budget: turns=${agentRunBudget.maxTurns} `
    + `toolRounds=${agentRunBudget.maxToolRounds} tokens=${agentRunBudget.maxTokenBudget}`,
  );

  // Persistence carries display-only model provenance. Strip it before
  // provider serialization so the LLM message schema remains role/content.
  windowedMessages = windowedMessages.map(({ role, content }) => ({ role, content }));

  return {
    activePersonaId,
    agentRunBudget,
    capabilityRouter,
    effectiveTools,
    explicitReadOnlyToolChoice,
    externalToolNames,
    governancePolicies,
    maxOutputTokens,
    packageMode,
    reasoningForModelAttempt,
    rebuildSystemPromptForModel,
    requiredToolSequence,
    selectorLatencyMs,
    systemPrompt,
    toolCatalogCount,
    toolEligibleCount,
    toolOmittedCount,
    toolSelectedCount,
    transmittedToolSchemaChars,
    windowedMessages,
    get directReadFileExecutionOutcome() { return directReadFileExecutionOutcome; },
    get boundedExactMemoryExecutionOutcome() { return boundedExactMemoryExecutionOutcome; },
  };
}
