import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '../logger.js';
const log = createLogger('chat');
import { COMMAND_CONTEXT_SENTINEL, MEMORY_RECALL_UNAVAILABLE_TEXT, runAgentLoop, CapabilityRouter, analyzeAndRecordCorrection, recordCapabilityGap, lintMemoryWrite, formatTrustSummary, scanForInjection, AGENT_LOOP_REROUTE_PREFIX, extractEntities, IterationBudget, routeMessage, compressConversation, createDefaultCompressionConfig, needsCompression, computeInputTokenBudget, getModelContextWindow, CredentialPool, loadCredentialPool, extractStatusCode, filterAvailableTools, isBoundedSingleFileRoundTrip, shouldSuggestCapture, planSkillDistillation, selectAgentRunBudget, capToolResultForModel, generateTurnId, logTurnEvent, checkGrounding, READONLY_TOOLS, executeToolWithStatus, type ToolDefinition, type ToolExecutionOutcome } from '@waggle/agent';
import type { AgentLoopConfig, AgentResponse, Orchestrator, AutonomyLevel, HookRegistry } from '@waggle/agent';
import type {
  WorkspaceSession,
  WorkspaceSessionActivityLease,
} from '../workspace-sessions.js';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt } from './workspace-context.js';
import { formatWorkspaceStatePrompt } from '../workspace-state.js';
import { emitNotification } from './notifications.js';
import { emitWaggleSignal } from './waggle-signals.js';
import { emitAuditEvent } from './events.js';
import {
  issueCapabilityProposalFromToolResult,
  resolveMarketplaceApprovalIdentity,
  stripCapabilityRequestMarker,
} from './capability-proposals.js';
import { getOptimizerService } from '../services/optimizer-service.js';
import { validateOrigin } from '../cors-config.js';
import { listPersonas, BEHAVIORAL_SPEC, isEnabled, detectTaskShape, isClosedWorldRewriteRequest, type AssembledPrompt } from '@waggle/agent';

function parseRetryTailExpectation(value: unknown): RetryTailExpectation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const expectedMessageCount = candidate.expectedMessageCount;
  if (!Number.isSafeInteger(expectedMessageCount) || (expectedMessageCount as number) < 1) {
    return null;
  }
  if (candidate.kind === 'lone-user') {
    if (Object.keys(candidate).sort().join(',') !== 'expectedMessageCount,kind') return null;
    return {
      kind: 'lone-user',
      expectedMessageCount: expectedMessageCount as number,
    };
  }
  if (candidate.kind === 'assistant-pair') {
    if (
      Object.keys(candidate).sort().join(',')
      !== 'expectedAssistantContent,expectedMessageCount,kind'
      || typeof candidate.expectedAssistantContent !== 'string'
    ) return null;
    return {
      kind: 'assistant-pair',
      expectedMessageCount: expectedMessageCount as number,
      expectedAssistantContent: candidate.expectedAssistantContent,
    };
  }
  return null;
}

/** Non-workspace scope for personal audit/collaboration streams (`:` is not a valid workspace id char). */
const PERSONAL_CHAT_SCOPE_ID = 'personal::default';
// Workspace label that slash-command handlers interpolate into user-facing
// prompts when the turn runs in the personal scope. Deliberately not
// PERSONAL_CHAT_SCOPE_ID: that sentinel names the audit/collaboration stream
// and must never reach a prompt as if it were a workspace.
const PERSONAL_CHAT_COMMAND_CONTEXT = 'Personal';

type ChatRequestRejection = {
  status: 400 | 403 | 404 | 409;
  body: { error: string; code?: string };
};

/**
 * The one way a request-resolution helper refuses a chat turn (TD-CHAT-18).
 * Every such helper returns `{ rejection } | { rejection?: undefined; ...fields }`,
 * and builds the rejection here rather than assembling the shape again, so
 * "what a refusal looks like" is knowledge this module holds once.
 *
 * It deliberately adds no body of its own: the caller still supplies the exact
 * status, message and code its own pins assert.
 */
function rejectChatRequest(
  status: ChatRequestRejection['status'],
  body: ChatRequestRejection['body'],
): { rejection: ChatRequestRejection } {
  return { rejection: { status, body } };
}

type ChatRequestFieldInput = {
  message: unknown;
  workspace: unknown;
  workspaceId: unknown;
  session: unknown;
  sessionId: unknown;
  selectedSkill: unknown;
  retry: unknown;
  retryTarget: unknown;
};

type ValidatedChatRequestFields = {
  rejection?: undefined;
  selectedSkill: string | undefined;
  retryTarget: RetryTailExpectation | null;
};

const MAX_CHAT_SEGMENT_LENGTH = 200;

/**
 * Validates the shape of a POST /api/chat body, and the one resource whose
 * existence is cheap to check here: an installed skill.
 *
 * Fields are checked in source order, and the first failure is returned, so the
 * order is part of the contract: `message` (present, a string, within the length
 * cap), then `selectedSkill` (a string, matching the id grammar, then a 409 when
 * it is not installed), then `retry`, then `retryTarget` (well-formed, then
 * coupled to `retry: true`), then the `workspace` / `workspaceId` / `session` /
 * `sessionId` segments. An uninstalled skill therefore outranks a later
 * malformed `retry`.
 *
 * Returns the trimmed, lower-cased `selectedSkill` and the parsed `retryTarget`
 * (`null` when absent). Workspace existence is left to
 * `resolveChatWorkspaceTarget`, which answers 404 `WORKSPACE_NOT_FOUND`;
 * a `session` that disagrees with `sessionId` is rejected by the caller.
 *
 * Unsafe path segments throw via `assertSafeSegment` (R6-001): `workspace`
 * and the session alias come straight from the request body and are joined into
 * dataDir/workspaces/<workspace>/sessions/<session>.jsonl by chat-persistence
 * (persistMessage / loadSessionMessages), so a crafted "../evil" segment would
 * escape the sessions dir on both write and read.
 */
export function validateChatRequestFields(
  input: ChatRequestFieldInput,
  isSkillInstalled: (name: string) => boolean,
): { rejection: ChatRequestRejection } | ValidatedChatRequestFields {
  const {
    message,
    selectedSkill: selectedSkillRaw,
    retry: retryTurn,
    retryTarget: retryTargetRaw,
  } = input;
  const reject = rejectChatRequest;
  if (message === undefined || message === '') {
    return reject(400, { error: 'message is required' });
  }
  if (typeof message !== 'string') {
    return reject(400, { error: 'message must be a string', code: 'INVALID_FIELD_TYPE' });
  }
  const MAX_MESSAGE_LENGTH = resolveMaxMessageLength(process.env.WAGGLE_MAX_MESSAGE_LENGTH);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return reject(400, { error: `Message too long (${message.length} chars, max ${MAX_MESSAGE_LENGTH})`, code: 'MESSAGE_TOO_LONG' });
  }
  let selectedSkill: string | undefined;
  if (selectedSkillRaw !== undefined) {
    if (typeof selectedSkillRaw !== 'string') {
      return reject(400, { error: 'selectedSkill must be a string', code: 'INVALID_FIELD_TYPE' });
    }
    selectedSkill = selectedSkillRaw.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(selectedSkill)) {
      return reject(400, { error: 'selectedSkill is invalid', code: 'INVALID_SELECTED_SKILL' });
    }
    if (!isSkillInstalled(selectedSkill)) {
      return reject(409, { error: 'The selected skill is not available', code: 'SKILL_NOT_AVAILABLE' });
    }
  }
  if (retryTurn !== undefined && typeof retryTurn !== 'boolean') {
    return reject(400, { error: 'retry must be a boolean', code: 'INVALID_FIELD_TYPE' });
  }
  const retryTarget = retryTargetRaw === undefined
    ? null
    : parseRetryTailExpectation(retryTargetRaw);
  if (retryTargetRaw !== undefined && retryTarget === null) {
    return reject(400, { error: 'retryTarget is invalid', code: 'INVALID_RETRY_TARGET' });
  }
  if (retryTarget && retryTurn !== true) {
    return reject(400, { error: 'retryTarget requires retry: true', code: 'INVALID_RETRY_TARGET' });
  }
  for (const [field, value] of [
    ['workspace', input.workspace],
    ['workspaceId', input.workspaceId],
    ['session', input.session],
    ['sessionId', input.sessionId],
  ] as const) {
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      return reject(400, { error: `${field} must be a string`, code: 'INVALID_FIELD_TYPE' });
    }
    if (value.length > MAX_CHAT_SEGMENT_LENGTH) {
      return reject(400, { error: `${field} is too long (max ${MAX_CHAT_SEGMENT_LENGTH} chars)`, code: 'INVALID_FIELD_LENGTH' });
    }
    assertSafeSegment(value, field);
  }
  return { selectedSkill, retryTarget };
}

const DEFAULT_MAX_MESSAGE_LENGTH = 50_000;

/**
 * The configured message limit, or the default when the value is not a
 * positive integer. `parseInt` alone turned a typo into NaN, every length
 * comparison was false, and the limit silently disappeared (TD-CHAT-5).
 */
function resolveMaxMessageLength(configured: string | undefined): number {
  const parsed = configured === undefined ? Number.NaN : Number.parseInt(configured, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_MESSAGE_LENGTH;
}

/**
 * Resolves the effective autonomy level for a request. Expired grants fall
 * back to 'normal' — the client may not have auto-reverted yet on its side,
 * so the server owns the final say.
 */
function resolveAutonomyLevel(
  autonomy: { level: AutonomyLevel; expiresAt?: number } | undefined,
): AutonomyLevel {
  if (!autonomy || (autonomy.level !== 'trusted' && autonomy.level !== 'yolo')) return 'normal';
  const { expiresAt } = autonomy;
  return !expiresAt || expiresAt > Date.now() ? autonomy.level : 'normal';
}

type ChatServer = Parameters<FastifyPluginAsync>[0];

/**
 * Resolves which workspace a chat turn reads history from and executes in.
 * `authorizedWorkspace` (from the security middleware) overrides the
 * body-supplied `workspace`; `null` pins execution to the personal scope.
 *
 * Two workspaces are in play and the returned fields describe different ones.
 * `workspaceConfig` is the config of the **body-supplied** workspace, while the
 * 404 is decided against the **history** workspace's config — so a request can
 * be answered with a config it never names. `historyTarget` and
 * `historyWorkspaceId` describe where history is read and written;
 * `executionWorkspaceId`, `executionScopeId` and `executionWorkspaceConfig`
 * describe where the turn runs, which is the authorized workspace when the
 * middleware named one. `usesNamedWorkspace` is true only for a managed
 * workspace, not for the legacy default layout.
 *
 * Two cases are exempt from the 404: no history workspace at all, which is the
 * personal scope, and the literal `'default'`, which is the legacy default
 * history rather than a managed workspace. The recovery gate fires whenever the
 * resolved history id is `'default'` — an explicit default and every
 * personal-scope turn alike — and answers 409.
 *
 * `WorkspaceManager.get` re-reads `workspace.json` on every call, so each
 * returned config is a value-equal snapshot taken at a different moment, never
 * a shared reference.
 */
function resolveChatWorkspaceTarget(
  server: ChatServer,
  workspace: string | undefined,
  authorizedWorkspace: ReturnType<typeof getResolvedChatWorkspaceId>,
  getChatHistoryLayout: () => ReturnType<typeof isolateLegacyDefaultChatSessions>,
) {
  const workspaceConfig = workspace
    ? server.workspaceManager?.get(workspace)
    : undefined;
  const historyWorkspace = authorizedWorkspace === undefined
    ? workspace
    : authorizedWorkspace ?? undefined;
  const historyWorkspaceConfig = historyWorkspace
    ? server.workspaceManager?.get(historyWorkspace)
    : undefined;
  if (
    historyWorkspace
    && historyWorkspace !== 'default'
    && !historyWorkspaceConfig
  ) {
    return rejectChatRequest(404, { error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' });
  }
  const historyTarget = resolveChatHistoryTarget(
    server.localConfig.dataDir,
    historyWorkspace,
    !!historyWorkspaceConfig,
  );
  const usesNamedWorkspace = historyTarget.isManagedWorkspace;
  const historyWorkspaceId = historyTarget.workspaceId;
  const executionWorkspaceId = authorizedWorkspace === null
    ? undefined
    : authorizedWorkspace ?? historyWorkspaceId;
  const executionScopeId = executionWorkspaceId ?? PERSONAL_CHAT_SCOPE_ID;
  const executionWorkspaceConfig = executionWorkspaceId
    ? server.workspaceManager?.get(executionWorkspaceId)
    : undefined;
  if (historyWorkspaceId === 'default') {
    const currentChatHistoryLayout = getChatHistoryLayout();
    if (currentChatHistoryLayout.status === 'recovery-required') {
      return rejectChatRequest(409, {
        error: 'Default chat history needs recovery before it can be used.',
        code: currentChatHistoryLayout.code,
      });
    }
  }
  return {
    rejection: undefined,
    workspaceConfig,
    historyTarget,
    usesNamedWorkspace,
    historyWorkspaceId,
    executionWorkspaceId,
    executionScopeId,
    executionWorkspaceConfig,
  };
}

/**
 * Resolves the filesystem roots a chat turn may read and execute in: the
 * explicit path, the trusted workspace config, or managed virtual storage —
 * never the user's home directory. When the security middleware authorized a
 * different workspace than the body supplied, execution moves to that
 * workspace's root (409 if it is not loaded, 403 for team viewers).
 */
function resolveChatWorkspacePaths(
  server: ChatServer,
  input: {
    workspace: string | undefined;
    workspaceConfig: ReturnType<NonNullable<ChatServer['workspaceManager']>['get']> | undefined;
    explicitWorkspacePath: string | undefined;
    usesNamedWorkspace: boolean;
    authorizedWorkspace: ReturnType<typeof getResolvedChatWorkspaceId>;
  },
) {
  const { workspace, workspaceConfig, explicitWorkspacePath, usesNamedWorkspace, authorizedWorkspace } = input;
  let workspacePath = workspace ? undefined : explicitWorkspacePath;
  let workspacePathFromTrustedConfig = false;
  if (workspace) {
    const configuredPath = workspaceConfig?.directory || workspaceConfig?.storagePath;
    if (workspaceConfig && configuredPath) {
      try {
        workspacePath = resolveWorkspaceExecutionRoot(
          server.localConfig.dataDir,
          workspaceConfig,
        );
        workspacePathFromTrustedConfig = true;
      } catch (error) {
        log.warn(`[chat] Configured workspace root is unavailable for ${workspace}: ${(error as Error).message}`);
        return rejectChatRequest(409, { error: 'Configured workspace directory is unavailable', code: 'WORKSPACE_ROOT_UNAVAILABLE' });
      }
    } else if (usesNamedWorkspace) {
      // Virtual workspace storage — managed files directory
      workspacePath = path.join(server.localConfig.dataDir, 'workspaces', workspace, 'files');
    } else {
      // Legacy default-workspace callers may still supply an anchored managed path.
      workspacePath = explicitWorkspacePath;
    }
  }
  let executionWorkspacePath = workspacePath;
  if (authorizedWorkspace && authorizedWorkspace !== workspace) {
    const authorizedConfig = server.workspaceManager?.get(authorizedWorkspace);
    if (!authorizedConfig || !server.agentState.getWorkspaceMindDb(authorizedWorkspace)) {
      return rejectChatRequest(409, { error: 'Active workspace is unavailable', code: 'WORKSPACE_NOT_READY' });
    }
    if (authorizedConfig.teamId && authorizedConfig.teamRole === 'viewer') {
      return rejectChatRequest(403, {
        error: 'Viewers cannot send messages in team workspaces. Ask a team admin to upgrade your role.',
        code: 'VIEWER_READ_ONLY',
      });
    }

    const configuredPath = authorizedConfig.directory || authorizedConfig.storagePath;
    try {
      executionWorkspacePath = configuredPath
        ? resolveWorkspaceExecutionRoot(server.localConfig.dataDir, authorizedConfig)
        : path.join(
            server.localConfig.dataDir,
            'workspaces',
            authorizedWorkspace,
            'files',
          );
    } catch (error) {
      log.warn(`[chat] Active workspace root unavailable for ${authorizedWorkspace}: ${(error as Error).message}`);
      return rejectChatRequest(409, { error: 'Active workspace directory unavailable', code: 'WORKSPACE_ROOT_UNAVAILABLE' });
    }
  }
  return { rejection: undefined, workspacePath, workspacePathFromTrustedConfig, executionWorkspacePath };
}

/**
 * Builds the slash-command context for a chat turn (same shape as the
 * `routes/commands.ts` route) with the turn's memory-deny directives applied:
 * recall, workspace state and skill listing degrade to sentinel strings that
 * the command handlers render verbatim.
 *
 * `executionWorkspaceId` is the workspace the turn runs in, or undefined for a
 * personal turn, in which case commands see `PERSONAL_CHAT_COMMAND_CONTEXT`.
 */
export function buildChatCommandContext(input: {
  server: ChatServer;
  orchestrator: Orchestrator;
  executionWorkspaceId: string | undefined;
  sessionId: string;
  turnMutationPolicy: TurnMutationPolicy;
}) {
  const {
    server, orchestrator, executionWorkspaceId, sessionId, turnMutationPolicy,
  } = input;
  // Derived, not supplied: the caller passed the policy and a flag computed
  // from it, so the two could disagree.
  const persistedMemoryReadAllowed = allowsPersistedMemoryRead(turnMutationPolicy);
  return {
    // Command handlers interpolate this value into user-facing agent
    // instructions. Keep the non-workspace observability sentinel out of
    // those prompts so personal commands cannot target a fake workspace.
    workspaceId: executionWorkspaceId ?? PERSONAL_CHAT_COMMAND_CONTEXT,
    sessionId,
    searchMemory: async (query: string): Promise<string> => {
      if (!persistedMemoryReadAllowed) return COMMAND_CONTEXT_SENTINEL.memoryAccessDisabled;
      try {
        const recall = await orchestrator.recallMemory(query);
        if (recall.count === 0) {
          // recallMemory reports its own failure as an empty result (TD-CHAT-29).
          return recall.text === MEMORY_RECALL_UNAVAILABLE_TEXT
            ? COMMAND_CONTEXT_SENTINEL.memorySearchUnavailable
            : COMMAND_CONTEXT_SENTINEL.noMemories;
        }
        const items = (recall.recalled ?? []).slice(0, 5);
        return items.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n');
      } catch {
        return COMMAND_CONTEXT_SENTINEL.memorySearchUnavailable;
      }
    },
    getWorkspaceState: async (): Promise<string> => {
      if (!persistedMemoryReadAllowed) return COMMAND_CONTEXT_SENTINEL.workspaceStateDisabled;
      if (!allowsConversationHistory(turnMutationPolicy)) {
        return COMMAND_CONTEXT_SENTINEL.conversationStateDisabled;
      }
      if (!executionWorkspaceId) return COMMAND_CONTEXT_SENTINEL.noWorkspaceState;
      const block = buildWorkspaceNowBlock({
        dataDir: server.localConfig.dataDir,
        workspaceId: executionWorkspaceId,
        wsManager: server.workspaceManager,
        activateWorkspaceMind: server.agentState.activateWorkspaceMind,
        cronSchedules: server.cronStore.list(),
      });
      if (!block) return COMMAND_CONTEXT_SENTINEL.noWorkspaceState;
      return formatWorkspaceNowPrompt(block);
    },
    listSkills: (): string[] => {
      return persistedMemoryReadAllowed
        ? server.agentState.skills.map(s => s.name)
        : [];
    },
  };
}

/**
 * Persona resolver that includes built-ins AND on-disk custom personas
 * (Faza 1 evolved variants like `claude::gen1-v1`, `qwen-thinking::gen1-v1`,
 * plus user-saved customs in `~/.waggle/personas/`).
 *
 * Previously `getPersona(id)` was used here, which only consulted the static
 * built-in PERSONAS array — `listPersonas()` adds the custom ones from disk
 * via `loadCustomPersonas()`. The deploy comment in evolution-deploy.ts
 * explicitly says "loader picks it up on next listPersonas() call", but
 * the chat consumer was reading the wrong function. See FR #3 in
 * docs/GEPA-SCOPE-AUDIT-2026-04-30.md.
 */
function resolvePersona(id: string) {
  return listPersonas().find(p => p.id === id) ?? null;
}
import { FrameStore, SessionStore, WaggleConfig } from '@waggle/core';

// ── Extracted modules ──────────────────────────────────────────────────
import { actionableMemoryDirectiveText, allowsAutomaticRecall, allowsConversationHistory, allowsPersistedMemoryRead, allowsPostResponseDecoration, buildTemplateWelcomePrompt, buildTurnMessageWindow, canUseBudgetModelWithoutCloudEgress, classifyExplicitTurnMutationPolicy, filterToolsByTurnMutationPolicy, isExclusiveSuppliedOnlyResponseRequest, isExplicitToolFreeAdvisoryRequest, isOfflineOllamaModelReference, isRetryableError, isAmbiguousMessage, isWorkspaceCatchUpRequest, primeMemoryDirectiveClassifier, resolveExplicitPersistedMemoryReadDirective, resolveTurnPersistencePermissions, selectAdvisoryMaxOutputTokens, shouldSuggestSchedule, SCHEDULE_SUGGESTION, AMBIGUITY_PROMPT, describeToolUseSafe, type TurnContextScope, type TurnMutationPolicy } from './chat-helpers.js';
import {
  chatSessionStateKey,
  createPersistedCapabilityReceipt,
  isChatSessionStateKeyForWorkspace,
  isolateLegacyDefaultChatSessions,
  loadRecentWorkspaceSessionContext,
  registerChatHistoryRestoreParticipant,
  resolveChatHistoryTarget,
  persistMessage,
  loadSessionMessages,
  replaceRetryTailWithUser,
  retryTailMatches,
  stripTrailingFailedPair,
  type RetryTailExpectation,
} from './chat-persistence.js';
import { MAX_CONTEXT_MESSAGES, applyContextWindow, buildSkillPromptSection } from './chat-context.js';
import {
  behavioralRulesForPromptPackage,
  composeClosedWorldChatPrompt,
  composeEvidenceBoundedChatPrompt,
  composeStrictReadOnlyToolChatPrompt,
  composeStrictReadOnlyToolSequenceChatPrompt,
  composeToolFreeAdvisoryChatPrompt,
  composeChatPromptTail,
  selectChatPromptPackageMode,
  type ChatPromptPackageMode,
} from './chat-prompt-packaging.js';
import { getGovernancePermissions } from './chat-governance.js';
import { applyPersonaToolFilter, filterMcpToolsForPersona, selectToolsForTurn } from '../persona-tool-filter.js';
import { assertSafeSegment } from './validate.js';
import {
  canonicalizeModelReference,
  isExactConfiguredKeylessCompatibleModel,
  listOllamaChatModelIds,
  resolveExplicitRoutableModel,
  resolveUsableModel,
} from '../model-availability.js';
import { bindModelSpendBudget } from '../model-spend-meter.js';
import { resolveWorkspaceExecutionRoot } from '../workspace-execution-root.js';
import type { WorkspaceTurnScope } from '../workspace-turn-coordinator.js';
import { bindChatCollaborationTools } from '../chat-collaboration.js';
import { getResolvedChatWorkspaceId } from '../security-middleware.js';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import {
  DECISION_MATRIX_TOOL_SEQUENCE,
  EXPLICIT_READ_ONLY_TOOL_NAMES,
  conversationalToolPolicyPrompt,
  filterGatedToolsForConversationalTurn,
  isBoundedExactPersistedMemoryLookup,
  isCurrentConversationOnlyReferenceRequest,
  isDecisionMatrixSkillRequest,
  isExplicitExternalResearchRequest,
  isExplicitGatedToolRequest,
  isExplicitMemorySaveRequest,
  parseBoundedExactMemoryRequest,
  requestedBuiltInArtifactToolNames,
  resolveExplicitReadOnlyToolChoice,
  shouldRequireCapabilityAcquisitionTools,
  shouldUsePersistedMemoryForTurn,
  regulatedDisclaimerSuffix,
  resolveApprovalTimeoutPolicy,
  resolveChatAncestry,
  type ApprovalTimeoutPolicy,
  type BoundedExactMemoryRequest,
} from './chat-turn-policy.js';

// ── Re-exports for backwards compatibility ─────────────────────────────
// These were originally exported from chat.ts and are consumed by tests and other packages.
export { isAmbiguousMessage, shouldSuggestSchedule } from './chat-helpers.js';
export { MAX_CONTEXT_MESSAGES, applyContextWindow, buildSkillPromptSection } from './chat-context.js';
export {
  conversationalToolPolicyPrompt,
  filterGatedToolsForConversationalTurn,
  filterPluginToolsForConversationalTurn,
  isBoundedExactPersistedMemoryLookup,
  isCurrentConversationOnlyReferenceRequest,
  isDecisionMatrixSkillRequest,
  isExplicitDecisionMatrixSkillDirective,
  isExplicitExternalResearchRequest,
  isExplicitGatedToolRequest,
  isExplicitMemoryRecallRequest,
  isExplicitMemorySaveRequest,
  resolveExplicitReadOnlyToolChoice,
  hasRegulatedDisclaimer,
  resolveApprovalTimeoutPolicy,
  resolveChatAncestry,
  shouldNarrowToolsForConversationalTurn,
  shouldRequireCapabilityAcquisitionTools,
} from './chat-turn-policy.js';
export type { ApprovalTimeoutPolicy } from './chat-turn-policy.js';
export { waitForApprovalDecision } from './chat-approval-hook.js';
import { createChatApprovalHook } from './chat-approval-hook.js';
import { applyToolResultSideEffects } from './chat-tool-result-effects.js';
import { getBillableUsage, TurnUsageLedger } from './chat-turn-usage-ledger.js';
import { TurnExecutionTrace } from './chat-turn-execution-trace.js';
import { TurnRecalledContext } from './chat-turn-recall-context.js';
import { NON_RETAINED_TURN_CONTENT, TurnRetention } from './chat-turn-retention.js';
import { TurnToolActivity } from './chat-turn-tool-activity.js';
import { TurnResources } from './chat-turn-resources.js';

export type AgentRunner = (config: AgentLoopConfig) => Promise<AgentResponse>;

/**
 * W4A diagnostics — the "MindDB flake". A long chat turn holds a workspace
 * MindDB handle obtained from the process-wide MultiMindCache (LRU, maxOpen:20).
 * If ≥20 OTHER workspaces are touched mid-turn (home-briefing fan-out, weaver
 * timers, cross-workspace tools), the cache evicts + `.close()`s THIS turn's
 * handle, and the post-response DB write-backs below throw better-sqlite3's
 * native "The database connection is not open". Those catches are non-blocking
 * and swallow it silently, which is exactly why the flake is invisible. This
 * predicate lets us surface a structured warn at the failure seam WITHOUT
 * changing behavior (the write still fails soft) so the root cause can be
 * confirmed live. The real fix (pin-aware eviction) lives in the OSS substrate
 * (packages/hive-mind-core/src/multi-mind-cache.ts) and is out of scope here.
 */
function isClosedDbError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /database (connection|handle) is not open|database is closed/i.test(msg);
}

function isIncompleteCompletionError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'INCOMPLETE_COMPLETION';
}

function isRetryableStreamInterruption(error: unknown): boolean {
  return isIncompleteCompletionError(error)
    && /\(stream ended before data:\s*\[DONE\]\); partial content was not accepted\.?$/i.test(
      (error as { message?: unknown }).message as string,
    );
}

type EmptyModelResponseError = Error & {
  code: 'EMPTY_MODEL_RESPONSE';
  status: 502;
  usage: AgentResponse['usage'];
  toolsUsed: string[];
};

function isEmptyModelResponseError(error: unknown): error is EmptyModelResponseError {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'EMPTY_MODEL_RESPONSE';
}

function emptyModelResponseError(response: AgentResponse): EmptyModelResponseError {
  const error = new Error('Model returned an empty response.') as EmptyModelResponseError;
  error.name = 'EmptyModelResponseError';
  error.code = 'EMPTY_MODEL_RESPONSE';
  error.status = 502;
  error.usage = response.usage;
  error.toolsUsed = [...response.toolsUsed];
  return error;
}

function isTerminalEmptyModelResponse(error: unknown): boolean {
  return isEmptyModelResponseError(error) && error.toolsUsed.length > 0;
}

function getFailedCompletionUsage(
  error: unknown,
): { inputTokens: number; outputTokens: number } | null {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (
    !isIncompleteCompletionError(error)
    && !isEmptyModelResponseError(error)
    && code !== 'MODEL_OPERATION_TIMEOUT'
    && code !== 'INITIAL_MODEL_ACTIVITY_TIMEOUT'
    && code !== 'AGENT_LOOP_ABORTED'
  ) return null;
  return getBillableUsage((error as { usage?: unknown }).usage);
}

/** Injected runners still need request-scoped evidence boundaries. */
export function shouldPackageSystemPromptForTurn(
  hasCustomRunner: boolean,
  contextScope: TurnContextScope,
  closedWorldRewrite: boolean,
): boolean {
  return !hasCustomRunner || contextScope !== 'default' || closedWorldRewrite;
}


function isTerminalModelBudgetError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'DAILY_MODEL_BUDGET_EXCEEDED'
    || code === 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE';
}


function isReportedToolFailure(result: string): boolean {
  const trimmed = result.trim();
  if (/^(?:error|failed|denied|blocked)(?::|\s|$)/i.test(trimmed)) return true;
  // The same concept in the marker form the tool executor actually emits. A
  // blocked tool did not run, so every consumer that reads `!isError` as "the
  // effect happened" — the `file_created` disclosure, the artifact index — was
  // being told a denied write had succeeded.
  if (trimmed.startsWith('[BLOCKED]')) return true;
  // The executor's answer to a tool the turn never transmitted. It carries
  // `succeeded: false`, but `onToolResult` only receives the text, and without
  // this a file tool the model called anyway was announced as a created file
  // (TD-CHAT-50).
  if (/^Tool "[^"]+" not found./.test(trimmed)) return true;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; ok?: unknown; success?: unknown };
    return parsed.ok === false
      || parsed.success === false
      || (typeof parsed.error === 'string' && parsed.error.trim().length > 0);
  } catch {
    return false;
  }
}


export type DirectReadFileDirective =
  | { kind: 'unrelated' }
  | { kind: 'invalid' }
  | {
      kind: 'valid';
      expectedPath: string;
      startMarker?: string;
      endMarker?: string;
    };

const DIRECT_READ_FILE_PATH_TOKEN = '(?<path>"[^"\\r\\n]+"|\'[^\'\\r\\n]+\'|[^,\\s]+?)';
const DIRECT_READ_FILE_RESPONSE_CLAUSE =
  '(?:,\\s*then\\s+(?:report|return|show)(?:\\s+me)?\\s+(?:the\\s+)?(?:exact\\s+)?(?:file\\s+)?contents?(?:\\s+between\\s+(?<startMarker>[A-Za-z0-9_-]+)\\s+and\\s+(?<endMarker>[A-Za-z0-9_-]+))?)?';
const EXPLICIT_DIRECT_READ_FILE_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:use|call|invoke)\\s+(?:the\\s+)?(?:read_file(?:\\s+tool)?|tool\\s+read_file)\\s+to\\s+(?:read|open|inspect)\\s+${DIRECT_READ_FILE_PATH_TOKEN}${DIRECT_READ_FILE_RESPONSE_CLAUSE}[.!]?\\s*$`,
  'i',
);
const NATURAL_DIRECT_READ_FILE_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:read|open|inspect)\\s+${DIRECT_READ_FILE_PATH_TOKEN}\\s+in\\s+(?:this|the)\\s+workspace${DIRECT_READ_FILE_RESPONSE_CLAUSE}[.!]?\\s*$`,
  'i',
);
const EXTENSIONLESS_DIRECT_READ_FILE_NAME = '(?:Makefile|Dockerfile|LICENSE|NOTICE|README|CHANGELOG|AUTHORS|CONTRIBUTORS|Gemfile|Rakefile|Procfile)';
const WINDOWS_RESERVED_DIRECT_READ_FILE_TOKEN = '(?:(?:con|prn|aux|nul|(?:com|lpt)(?:[1-9]|[¹²³]))(?:[. ]+)?|conin\\$|conout\\$)';
const NATURAL_DIRECT_READ_FILE_INTENT_PATH_TOKEN = `(?:"[^"\\r\\n]+"|'[^'\\r\\n]+'|[^,\\s]*(?:[\\\\/]|\\.[A-Za-z0-9_-]+)[^,\\s]*|${EXTENSIONLESS_DIRECT_READ_FILE_NAME}(?=\\s)|${WINDOWS_RESERVED_DIRECT_READ_FILE_TOKEN}(?=\\s))`;
const NATURAL_DIRECT_READ_FILE_INTENT_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:read|open|inspect)\\s+${NATURAL_DIRECT_READ_FILE_INTENT_PATH_TOKEN}[\\s\\S]*\\bin\\s+(?:this|the)\\s+workspace\\b`,
  'i',
);
const WARNING_TIER_DIRECT_READ_FILE_INTENT_RE = /\b(?:read|open|inspect)\b[\s\S]*\bin\s+(?:this|the)\s+workspace\b/i;
const DIRECT_READ_FILE_MAX_EXACT_BYTES = 2_048;
const WINDOWS_RESERVED_DEVICE_SEGMENT = /^(?:(?:con|prn|aux|nul|(?:com|lpt)(?:[1-9]|[¹²³]))(?:\..*)?|conin\$|conout\$)$/i;

function normalizeDirectReadFilePath(candidate: string): string | undefined {
  const unquoted = ((candidate.startsWith('"') && candidate.endsWith('"'))
    || (candidate.startsWith("'") && candidate.endsWith("'")))
    ? candidate.slice(1, -1)
    : candidate;
  if (!unquoted
    || unquoted.length > 240
    || Array.from(unquoted).some(character => character.charCodeAt(0) < 32)) {
    return undefined;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(unquoted)
    || /^[\\/]/.test(unquoted)
    || /[:*?<>|%$~{}]/.test(unquoted)
    || unquoted.includes('[')
    || unquoted.includes(']')) {
    return undefined;
  }

  const segments = unquoted.replace(/\\/g, '/').split('/');
  if (segments.some(segment => !segment
    || segment === '..'
    || /[. ]$/.test(segment)
    || WINDOWS_RESERVED_DEVICE_SEGMENT.test(segment))) {
    return undefined;
  }
  const normalized = segments.filter(segment => segment !== '.').join('/');
  return normalized || undefined;
}

/**
 * Recognize only a complete, single-file workspace read. `invalid` is
 * intentionally distinct from `unrelated`: a malformed direct-read request
 * must fail closed instead of falling through to broad tool selection.
 */
export function parseDirectReadFileDirective(message: string): DirectReadFileDirective {
  const directReadIntent = /\bread_file\b/i.test(message)
    || NATURAL_DIRECT_READ_FILE_INTENT_RE.test(message);
  if (!directReadIntent) return { kind: 'unrelated' };
  if (!message.trim() || message.length > 240 || /[\r\n]/.test(message)) return { kind: 'invalid' };

  const match = EXPLICIT_DIRECT_READ_FILE_RE.exec(message)
    ?? NATURAL_DIRECT_READ_FILE_RE.exec(message);
  const rawPath = match?.groups?.path;
  if (!rawPath) return { kind: 'invalid' };
  const expectedPath = normalizeDirectReadFilePath(rawPath);
  return expectedPath
    ? {
        kind: 'valid',
        expectedPath,
        ...(match?.groups?.startMarker && match.groups.endMarker
          ? {
              startMarker: match.groups.startMarker,
              endMarker: match.groups.endMarker,
            }
          : {}),
      }
    : { kind: 'invalid' };
}

export function formatDirectReadFileResponse(
  directive: Extract<DirectReadFileDirective, { kind: 'valid' }>,
  result: string,
): string {
  if (!directive.startMarker || !directive.endMarker) {
    if (!result) return '(The file is empty.)';
    return result.trim() ? result : '(The file contains only whitespace.)';
  }
  return `${directive.startMarker}\n${result}${result.endsWith('\n') ? '' : '\n'}${directive.endMarker}`;
}

function canonicalBoundReadPath(workspaceRoot: string, candidate: string): string | undefined {
  const normalized = normalizeDirectReadFilePath(candidate);
  if (!normalized) return undefined;
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

export async function boundDirectReadFilePathsMatch(
  workspaceRoot: string,
  expectedPath: string,
  suppliedPath: string,
  resolveRealPath: (candidate: string) => Promise<string> = candidate => fs.promises.realpath(candidate),
): Promise<boolean> {
  const expected = canonicalBoundReadPath(workspaceRoot, expectedPath);
  const supplied = canonicalBoundReadPath(workspaceRoot, suppliedPath);
  if (!expected || !supplied) return false;
  if (expected === supplied) return true;
  if (expected.toLowerCase() !== supplied.toLowerCase()) return false;
  try {
    const [expectedRealPath, suppliedRealPath] = await Promise.all([
      resolveRealPath(expected),
      resolveRealPath(supplied),
    ]);
    return expectedRealPath === suppliedRealPath;
  } catch {
    return false;
  }
}

function bindDirectReadFileTool(
  tools: ToolDefinition[],
  workspaceRoot: string,
  expectedPath: string,
  reportOutcome: (outcome: ToolExecutionOutcome) => void,
): ToolDefinition[] {
  if (!canonicalBoundReadPath(workspaceRoot, expectedPath)) {
    return tools.filter(tool => tool.name !== 'read_file');
  }
  return tools.map((tool) => {
    if (tool.name !== 'read_file') return tool;
    return {
      ...tool,
      execute: async (args) => {
        const suppliedPath = typeof args.path === 'string' ? args.path : '';
        const unsupportedArgument = Object.keys(args).some(key => (
          key !== 'path' && key !== 'offset' && key !== 'line_numbers'
        ));
        const partialRead = (args.offset !== undefined
          && (typeof args.offset !== 'number' || args.offset !== 1))
          || (args.line_numbers !== undefined && args.line_numbers !== false);
        const pathMatches = await boundDirectReadFilePathsMatch(
          workspaceRoot,
          expectedPath,
          suppliedPath,
        );
        if (!pathMatches || partialRead || unsupportedArgument) {
          const outcome = {
            content: `Error: read_file must read the complete explicitly requested workspace file: ${expectedPath}`,
            isError: true,
          };
          reportOutcome(outcome);
          return outcome.content;
        }
        const outcome = await executeToolWithStatus(tool, args);
        if (Buffer.byteLength(outcome.content, 'utf8') > DIRECT_READ_FILE_MAX_EXACT_BYTES) {
          const oversizedOutcome = {
            content: `Error: exact read_file response exceeds the ${DIRECT_READ_FILE_MAX_EXACT_BYTES}-byte direct-read limit; use a scoped or partial read request instead.`,
            isError: true,
          };
          reportOutcome(oversizedOutcome);
          return oversizedOutcome.content;
        }
        reportOutcome(outcome);
        return outcome.content;
      },
    };
  });
}

function bindExactReadSkillTool(
  tools: ToolDefinition[],
  expectedSkillName: string,
): ToolDefinition[] {
  return tools.map((tool) => {
    if (tool.name !== 'read_skill') return tool;
    return {
      ...tool,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: [expectedSkillName],
            description: `Exact installed skill name: ${expectedSkillName}`,
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      execute: async (args) => {
        if (Object.keys(args).length !== 1 || args.name !== expectedSkillName) {
          return `Error: read_skill must use the exact requested skill name: ${expectedSkillName}`;
        }
        return tool.execute(args);
      },
    };
  });
}

const BOUNDED_EXACT_MEMORY_SEARCH_LIMIT = 3;
const BOUNDED_EXACT_MEMORY_SENSITIVE_PATTERN = /\b(?:password|passcode|one[- ]time\s+(?:password|code)|otp|access[_ -]?token|api[_ -]?key|credential|private\s+key|client[_ -]?secret)\b/i;

type BoundedExactMemoryExecutionOutcome =
  | { status: 'found' }
  | { status: 'no-match' }
  | { status: 'failure' };


function extractWorkspaceMemorySection(result: string): string | null {
  const marker = /^## Workspace Memory\s*$/m.exec(result);
  if (!marker || marker.index === undefined) return null;
  const start = marker.index + marker[0].length;
  const remainder = result.slice(start);
  const nextSection = /\n## [^\r\n]+/m.exec(remainder);
  return remainder.slice(0, nextSection?.index ?? remainder.length).trim();
}

function extractBoundedExactWorkspaceMemoryValue(
  result: string,
  request: BoundedExactMemoryRequest,
): string | null {
  const workspaceSection = extractWorkspaceMemorySection(result);
  if (!workspaceSection) return null;
  const contents = workspaceSection
    .split(/\n(?=\[\d+\]\s+\()/)
    .map(entry => entry.replace(/^\[\d+\]\s+\([^\r\n]*\)\s*/i, '').trim())
    .filter(Boolean);
  const candidates: Array<{ value: string; relevance: number }> = [];
  const field = request.fieldPattern;
  const scalar = request.strictCodenameToken
    ? String.raw`[A-Za-z0-9][A-Za-z0-9._-]{0,79}`
    : String.raw`[A-Za-z0-9][A-Za-z0-9._ -]{0,79}?`;
  const scalarBoundary = String.raw`(?:["'”])?(?=\s*(?:$|[—–](?=\s|$)|[.,;](?=\s|$)))`;
  const strictScalarTerminator = String.raw`(?:["'”])?\s*(?:\.?\s*$|[—–]\s*\d+\s+messages?\s*$)`;
  const beforeField = new RegExp(
    String.raw`\b(?:choose|chose|selected|pick|picked|use|using|go\s+with|went\s+with)\s+(?:the\s+)?(${scalar})\s+(?:as|for)\s+(?:the\s+|our\s+)?[^.\r\n]{0,100}\b${field}\b`,
    'i',
  );
  const decidedField = new RegExp(
    String.raw`^User asked:\s*(?:We|I)\s+decided\s+that\s+["'“”]?(?!(?:if|maybe|perhaps|possibly|could|might|would|should)\b)(${scalar})["'“”]?\s+(?:is|was)\s+(?:the|our)\s+[^.\r\n]{0,100}\b${field}\b`,
    'i',
  );
  const nonAuthoritativeDecision = /\b(?:not|never|rejected|discarded)\b/i;
  const afterField = new RegExp(
    String.raw`\b${field}\b[^.\r\n]{0,40}?\b(?:is|was|equals?|set\s+to)\b\s*["'“]?(${scalar})${scalarBoundary}`,
    'i',
  );
  const labelledField = new RegExp(
    String.raw`\b${field}\b(?:\s+(?:decision|choice|selected|chosen))?\s*[:=]\s*["'“]?(${scalar})${scalarBoundary}`,
    'i',
  );
  const rememberedExactField = field === 'codename'
    ? new RegExp(
      String.raw`\b(?:remember(?:ed)?(?:\s+this)?\s+exact\s+)?(?:project\s+)?codename(?:\s*\([^\r\n)]{1,60}\))?\s*[:=]\s*["'“]?(${scalar})${scalarBoundary}`,
      'i',
    )
    : null;
  const strictRememberedExactField = request.strictCodenameToken
    ? new RegExp(
      String.raw`^(?:Session\s*\(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?\)\s*:\s*)?Remember(?:ed)?\s+this\s+exact\s+(?:project\s+)?codename\s*[:=]\s*["'“]?(${scalar})${strictScalarTerminator}`,
      'i',
    )
    : null;
  const strictUserStatedField = request.strictCodenameToken
    ? new RegExp(
      String.raw`^(?:Project\s+)?codename\s*\(\s*user-stated\s*,\s*exact\s*\)\s*[:=]\s*["'“]?(${scalar})${strictScalarTerminator}`,
      'i',
    )
    : null;
  const strictDeclarativeField = request.strictCodenameToken
    ? new RegExp(
      String.raw`^(?:The\s+)?(?:project\s+)?codename\s+(?:is|was|equals?|set\s+to)\s*["'“]?(${scalar})${strictScalarTerminator}`,
      'i',
    )
    : null;

  for (const content of contents) {
    for (const line of content.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      if (BOUNDED_EXACT_MEMORY_SENSITIVE_PATTERN.test(line)
        || nonAuthoritativeDecision.test(line)) continue;
      const normalized = line.toLowerCase();
      const relevance = request.topicTerms.filter(term => normalized.includes(term)).length;
      if (relevance === 0) continue;
      const match = request.strictCodenameToken
        ? strictRememberedExactField?.exec(line)
          ?? strictUserStatedField?.exec(line)
          ?? strictDeclarativeField?.exec(line)
        : beforeField.exec(line)
          ?? decidedField.exec(line)
          ?? rememberedExactField?.exec(line)
          ?? labelledField.exec(line)
          ?? afterField.exec(line);
      const value = match?.[1]
        ?.trim()
        .replace(/^["'“”]+|["'“”,;:.]+$/g, '');
      if (!value || value.length > 80 || BOUNDED_EXACT_MEMORY_SENSITIVE_PATTERN.test(value)) continue;
      try {
        if (!scanForInjection(value, 'tool_output').safe) continue;
      } catch {
        continue;
      }
      candidates.push({ value, relevance });
    }
  }
  candidates.sort((left, right) => right.relevance - left.relevance);
  const topRelevance = candidates[0]?.relevance;
  if (topRelevance === undefined) return null;
  const topValues = new Set(
    candidates.filter(candidate => candidate.relevance === topRelevance).map(candidate => candidate.value),
  );
  return topValues.size === 1 ? candidates[0]!.value : null;
}

export function bindExactWorkspaceMemorySearchTool(
  tools: ToolDefinition[],
  message: string,
  onOutcome?: (outcome: BoundedExactMemoryExecutionOutcome) => void,
): ToolDefinition[] {
  const request = parseBoundedExactMemoryRequest(message);
  return tools.map((tool) => {
    if (tool.name !== 'search_memory') return tool;
    return {
      ...tool,
      description: 'Return the one exact non-credential value requested from the current workspace memory.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async (_args) => {
        if (!request) {
          onOutcome?.({ status: 'failure' });
          return 'Error: exact workspace memory lookup could not bind the current request.';
        }
        let rawResult: string;
        try {
          rawResult = await tool.execute({
            query: request.query,
            scope: 'workspace',
            limit: BOUNDED_EXACT_MEMORY_SEARCH_LIMIT,
            profile: 'balanced',
          });
        } catch (error) {
          onOutcome?.({ status: 'failure' });
          throw error;
        }
        if (isReportedToolFailure(rawResult)) {
          onOutcome?.({ status: 'failure' });
          return rawResult;
        }
        const value = extractBoundedExactWorkspaceMemoryValue(rawResult, request);
        if (value !== null) {
          onOutcome?.({ status: 'found' });
          return value;
        }
        if (request.fallback) {
          onOutcome?.({ status: 'no-match' });
          return request.fallback;
        }
        onOutcome?.({ status: 'failure' });
        return 'Error: the requested exact workspace memory value could not be isolated safely.';
      },
    };
  });
}

export const chatRoutes: FastifyPluginAsync = async (server) => {
  primeMemoryDirectiveClassifier();
  // ── Use shared agent state from server ──────────────────────────────
  const {
    orchestrator,
    allTools,
    hookRegistry,
    costTracker,
    skills,
    userSystemPrompt,
    sessionHistories,
  } = server.agentState;
  let chatHistoryLayout = isolateLegacyDefaultChatSessions(
    server.localConfig.dataDir,
  );
  const getChatHistoryLayout = () => {
    if (chatHistoryLayout.status === 'recovery-required') {
      chatHistoryLayout = isolateLegacyDefaultChatSessions(
        server.localConfig.dataDir,
      );
    }
    return chatHistoryLayout;
  };
  if (chatHistoryLayout.status === 'recovery-required') {
    log.warn(`[chat] ${chatHistoryLayout.reason}`);
  }
  const approvalTimeoutPolicy = resolveApprovalTimeoutPolicy();
  // Read with the timeout policy, once per registration, not at module import
  // (TD-CHAT-11). Test mode only.
  const autoApprove = process.env.WAGGLE_AUTO_APPROVE === '1' || process.env.WAGGLE_AUTO_APPROVE === 'true';
  let persistedTraceBoundaryId = 0;
  try {
    persistedTraceBoundaryId = server.traceStore?.getLatestId() ?? 0;
  } catch (costBoundaryError) {
    log.warn(
      '[chat] persisted cost boundary unavailable; starting daily carryover at zero:',
      costBoundaryError instanceof Error ? costBoundaryError.message : String(costBoundaryError),
    );
  }

  const getTrackedDailySpend = (enabled: boolean): number => {
    const day = new Date().toISOString().slice(0, 10);
    const dayStart = `${day}T00:00:00.000Z`;

    if (!costTracker.hasDailyCarryover(day)) {
      try {
        const persisted = server.traceStore?.getTotalCostSince(
          dayStart,
          persistedTraceBoundaryId,
        ) ?? 0;
        costTracker.initializeDailyCarryover(day, persisted);
      } catch (costReadError) {
        log.warn(
          '[chat] persisted daily cost read failed; using in-process total:',
          costReadError instanceof Error ? costReadError.message : String(costReadError),
        );
      }
    }

    if (!enabled) return 0;
    return costTracker.getDailyTotal();
  };
  // Read dynamically — may be updated to built-in proxy at runtime
  const getLitellmUrl = () => server.localConfig.litellmUrl;

  // W2.2: Register pre:memory-write validation hook — flags dramatic claims
  const DRAMATIC_PATTERNS = [
    /\b(shut\s*down|shutting\s*down|closing|dissolv|bankrupt|terminat|fired|laid\s*off|resign)\b/i,
    /\b(cancel|cancelled|abandon|scrap|kill)\s+(the\s+)?(company|project|deal|contract|engagement)\b/i,
    /\b(emergency|urgent|critical|crisis)\b.*\b(immediate|right\s*now|today)\b/i,
  ];
  hookRegistry.on('pre:memory-write', (ctx) => {
    const content = ctx.memoryContent ?? '';

    // Fix the source, not the symptom: block memories that merely record a
    // capability failure ("the Slack connector failed to authenticate"). The
    // agent should fix or flag the capability instead of durably remembering
    // that it is broken — a symptom memory rots the moment the tool is repaired.
    const lint = lintMemoryWrite(content, ctx.memoryType);
    if (lint.verdict === 'capability_symptom') {
      // Route the observation to the improvement-signal path so a recurring gap
      // still surfaces (via acquire_capability), rather than into durable memory.
      // The pre:memory-write ctx carries no workspaceId, so we record on the base
      // orchestrator's (personal) signal store — the least-invasive reachable
      // ImprovementSignalStore. Recording is non-blocking.
      try {
        recordCapabilityGap(orchestrator.getImprovementSignals(), lint.capability ?? 'capability', lint.reason);
      } catch {
        // Non-blocking — a signal-store failure must not swallow the cancel.
      }
      log.info('[memory-validation] Capability-failure symptom blocked from memory:', content.slice(0, 100));
      return {
        cancel: true,
        reason:
          `This looks like a capability failure symptom ("${lint.capability ?? 'a capability'}"), not a durable fact. ` +
          `Don't memorize that a tool/connector is broken — it will rot when the capability is fixed. ` +
          `Instead, fix or flag the capability (e.g. use acquire_capability). The gap has been recorded as an improvement signal.`,
      };
    }

    for (const pattern of DRAMATIC_PATTERNS) {
      if (pattern.test(content)) {
        log.warn('[memory-validation] Dramatic claim detected in save_memory:', content.slice(0, 100));
        // Don't block — but annotate the args so the tool can tag source appropriately
        // Future: could cancel and ask for confirmation
        break;
      }
    }
  });

// C3: Cache the base system prompt per session to avoid rebuilding on every message
const systemPromptCache = new Map<string, { prompt: string; workspace: string | undefined; workspaceId: string | undefined; skillCount: number; personaId: string | null; historyLength: number | undefined; packageMode: ChatPromptPackageMode; model: string | undefined }>();

  // A WorkspaceSession owns the shared mind handle and workspace lifetime, but
  // chat-local mutable tools (plans, save counters) and orchestrator receipts
  // must not be shared by distinct conversations in that workspace.
  interface ChatRuntime {
    orchestrator: Orchestrator;
    tools: ToolDefinition[];
    toolContextKey: string;
    activeTurns: number;
  }
  const MAX_CHAT_RUNTIMES_PER_WORKSPACE = 32;
  const chatRuntimes = new WeakMap<WorkspaceSession, Map<string, ChatRuntime>>();
  const activeChatTurns = new Set<string>();

  function pruneChatRuntimes(cache: Map<string, ChatRuntime>): void {
    if (cache.size <= MAX_CHAT_RUNTIMES_PER_WORKSPACE) return;
    for (const [sessionId, runtime] of cache) {
      if (runtime.activeTurns !== 0) continue;
      cache.delete(sessionId);
      if (cache.size <= MAX_CHAT_RUNTIMES_PER_WORKSPACE) break;
    }
  }

  function acquireChatRuntime(
    workspaceSession: WorkspaceSession,
    sessionId: string,
    workspacePath: string,
    workspaceId: string,
  ): ChatRuntime {
    let cache = chatRuntimes.get(workspaceSession);
    if (!cache) {
      cache = new Map();
      chatRuntimes.set(workspaceSession, cache);
    }

    const toolContextKey = `${workspaceId}\u0000${workspacePath}`;
    let runtime = cache.get(sessionId);
    if (!runtime || runtime.toolContextKey !== toolContextKey) {
      const runtimeOrchestrator = server.agentState.createSessionOrchestrator(workspaceSession.mind);
      runtime = {
        orchestrator: runtimeOrchestrator,
        tools: server.agentState.buildToolsForSession(runtimeOrchestrator, workspacePath, workspaceId),
        toolContextKey,
        activeTurns: 0,
      };
    } else {
      // Map insertion order is the LRU order. Touch a reused runtime.
      cache.delete(sessionId);
    }

    runtime.activeTurns += 1;
    cache.set(sessionId, runtime);
    pruneChatRuntimes(cache);
    return runtime;
  }

  function releaseChatRuntime(
    workspaceSession: WorkspaceSession,
    sessionId: string,
    runtime: ChatRuntime,
  ): void {
    runtime.activeTurns = Math.max(0, runtime.activeTurns - 1);
    const cache = chatRuntimes.get(workspaceSession);
    if (!cache || cache.get(sessionId) !== runtime) return;
    cache.delete(sessionId);
    cache.set(sessionId, runtime);
    pruneChatRuntimes(cache);
  }

  // Profile cache (review Major #4): was fs.readFileSync on every buildSystemPrompt call —
  // blocks the Node event loop on every concurrent SSE request. Load once per mtime change,
  // keyed by file mtime so a profile update flips the cache without a restart.
  let profileCache: { mtimeMs: number; data: Record<string, unknown> | null } | null = null;
  function loadProfile(dataDir: string): Record<string, unknown> | null {
    try {
      const profilePath = path.join(dataDir, 'profile.json');
      if (!fs.existsSync(profilePath)) return null;
      const stat = fs.statSync(profilePath);
      if (profileCache && profileCache.mtimeMs === stat.mtimeMs) return profileCache.data;
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      profileCache = { mtimeMs: stat.mtimeMs, data };
      return data;
    } catch {
      return null;
    }
  }

  // Context compression: track previous summaries per session for iterative compression
  const compressionSummaries = new Map<string, string>();
  // #12: frame id of each session's persisted compaction summary — later
  // compaction passes update that frame in place instead of stacking near-
  // duplicates. In-memory like compressionSummaries (a sidecar restart just
  // means the next pass creates a fresh frame — rare, benign).
  const compactionFrameIds = new Map<string, number>();

  // Credential pool: lazily initialized per-provider key pools for round-robin + cooldown
  const credentialPools = new Map<string, CredentialPool>();

  /** Get or create a credential pool for the LLM provider, loading keys from vault. */
  function getCredentialPool(provider: string): CredentialPool | null {
    if (!server.vault) return null;
    if (credentialPools.has(provider)) return credentialPools.get(provider)!;
    const pool = loadCredentialPool(server.vault, provider);
    if (pool.size === 0) return null;
    credentialPools.set(provider, pool);
    return pool;
  }

  // Auto skill capture: track tool sequences per session and dismissed suggestions
  const sessionToolSequences = new Map<string, string[][]>();
  const dismissedCaptureSuggestions = new Set<string>();
  const MAX_RETAINED_CHAT_SESSION_STATES = 64;
  const MAX_RETAINED_HISTORY_CHARS_PER_SESSION = 2_000_000;
  const MAX_RETAINED_HISTORY_CHARS_TOTAL = 8_000_000;
  const retainedSessionStateLru = new Map<string, true>();

  const retainedHistoryChars = (stateKey: string): number => (
    sessionHistories.get(stateKey)?.reduce(
      (total, message) => total + JSON.stringify(message).length,
      0,
    ) ?? 0
  );

  const evictStateKey = (stateKey: string): void => {
    sessionHistories.delete(stateKey);
    systemPromptCache.delete(stateKey);
    compressionSummaries.delete(stateKey);
    compactionFrameIds.delete(stateKey);
    sessionToolSequences.delete(stateKey);
    retainedSessionStateLru.delete(stateKey);
  };

  const pruneRetainedSessionState = (): void => {
    for (const stateKey of [...retainedSessionStateLru.keys()]) {
      if (
        !activeChatTurns.has(stateKey)
        && retainedHistoryChars(stateKey) > MAX_RETAINED_HISTORY_CHARS_PER_SESSION
      ) {
        evictStateKey(stateKey);
      }
    }
    const totalHistoryChars = (): number => [...retainedSessionStateLru.keys()]
      .reduce((total, stateKey) => total + retainedHistoryChars(stateKey), 0);
    while (
      retainedSessionStateLru.size > MAX_RETAINED_CHAT_SESSION_STATES
      || totalHistoryChars() > MAX_RETAINED_HISTORY_CHARS_TOTAL
    ) {
      const idleStateKey = [...retainedSessionStateLru.keys()]
        .find((stateKey) => !activeChatTurns.has(stateKey));
      if (!idleStateKey) return;
      evictStateKey(idleStateKey);
    }
  };

  const touchSessionState = (stateKey: string): void => {
    retainedSessionStateLru.delete(stateKey);
    retainedSessionStateLru.set(stateKey, true);
    pruneRetainedSessionState();
  };

  const evictWorkspaceKeys = <T>(state: Map<string, T>, workspaceStateId: string): void => {
    for (const stateKey of [...state.keys()]) {
      if (isChatSessionStateKeyForWorkspace(stateKey, workspaceStateId)) {
        state.delete(stateKey);
      }
    }
  };

  const managedSessionStateKey = (workspaceId: string, sessionId: string): string => {
    const target = resolveChatHistoryTarget(
      server.localConfig.dataDir,
      workspaceId,
      true,
    );
    return chatSessionStateKey(target.stateWorkspaceId, sessionId);
  };

  server.agentState.chatStateController = {
    isSessionActive: (workspaceId, sessionId) => (
      activeChatTurns.has(managedSessionStateKey(workspaceId, sessionId))
    ),
    touchSession: touchSessionState,
    evictSession: (workspaceId, sessionId) => {
      evictStateKey(managedSessionStateKey(workspaceId, sessionId));
      const workspaceSession = server.sessionManager.get(workspaceId);
      if (workspaceSession) chatRuntimes.get(workspaceSession)?.delete(sessionId);
    },
    evictWorkspace: (workspaceId) => {
      const target = resolveChatHistoryTarget(
        server.localConfig.dataDir,
        workspaceId,
        true,
      );
      for (const stateKey of [...retainedSessionStateLru.keys()]) {
        if (isChatSessionStateKeyForWorkspace(stateKey, target.stateWorkspaceId)) {
          evictStateKey(stateKey);
        }
      }
      evictWorkspaceKeys(sessionHistories, target.stateWorkspaceId);
      evictWorkspaceKeys(systemPromptCache, target.stateWorkspaceId);
      evictWorkspaceKeys(compressionSummaries, target.stateWorkspaceId);
      evictWorkspaceKeys(compactionFrameIds, target.stateWorkspaceId);
      evictWorkspaceKeys(sessionToolSequences, target.stateWorkspaceId);
      const workspaceSession = server.sessionManager.get(workspaceId);
      if (workspaceSession) chatRuntimes.delete(workspaceSession);
    },
  };
  const unregisterRestoreParticipant = registerChatHistoryRestoreParticipant(
    server.localConfig.dataDir,
    {
      isBusy: () => activeChatTurns.size > 0,
      onRestored: () => {
        sessionHistories.clear();
        systemPromptCache.clear();
        compressionSummaries.clear();
        compactionFrameIds.clear();
        sessionToolSequences.clear();
        retainedSessionStateLru.clear();
        chatHistoryLayout = isolateLegacyDefaultChatSessions(
          server.localConfig.dataDir,
        );
      },
    },
  );
  server.addHook('onClose', async () => {
    unregisterRestoreParticipant();
  });

  // Build the rich system prompt — behavioral specification, not just tool docs
  // Accepts the caller's orchestrator so per-session orchestrators get their own
  // workspace layers reflected in the prompt (Phase A.1 Option Y migration).
  // Phase A.2: accepts an optional `personaOverride` so different chat windows
  // on the same workspace can run different personas without touching the
  // workspace record.
  function buildSystemPrompt(
    orch: Orchestrator,
    workspacePath?: string,
    sessionId?: string,
    historyLength?: number,
    workspaceId?: string,
    personaOverride?: string,
    /**
     * FR #4: when PROMPT_ASSEMBLER is on, the caller pre-fetches a structured
     * AssembledPrompt via `orch.buildAssembledPrompt(query, persona, opts)`.
     * If provided, its `system` replaces the basic `orch.buildSystemPrompt()`
     * call below. The wrapper adds only context that is not already represented
     * by the assembler, so persona and response-shape instructions stay singular.
     * Caching is skipped when assembled is provided because memory recall results
     * vary per turn.
     */
    assembled?: AssembledPrompt | null,
    packageMode: ChatPromptPackageMode = 'full',
    closedWorldRewrite = false,
    contextScope: TurnContextScope = 'default',
    selectedToolCount = 0,
    explicitReadOnlyToolChoice?: string,
    explicitReadOnlyToolSequence?: readonly string[],
    selectedModel?: string,
    cacheWorkspaceId = workspaceId ?? 'default',
    toolFreeAdvisory = false,
    includePersistedMemory = true,
    includeConversationDerivedWorkspaceState = true,
    availableTools?: readonly Pick<ToolDefinition, 'name' | 'description'>[],
  ): string {
    // Resolve the active persona: per-window override > workspace default.
    const wsConfig = workspaceId ? server.workspaceManager?.get(workspaceId) : null;
    const activePersonaId = personaOverride ?? wsConfig?.personaId ?? null;

    if (explicitReadOnlyToolSequence?.length
      && selectedToolCount !== explicitReadOnlyToolSequence.length) {
      return composeStrictReadOnlyToolSequenceChatPrompt({
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
        toolNames: explicitReadOnlyToolSequence,
        toolAvailable: false,
      });
    }
    if (explicitReadOnlyToolSequence?.length
      && packageMode === 'compact'
      && selectedToolCount === explicitReadOnlyToolSequence.length) {
      return composeStrictReadOnlyToolSequenceChatPrompt({
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
        toolNames: explicitReadOnlyToolSequence,
      });
    }
    if (explicitReadOnlyToolChoice && toolFreeAdvisory) {
      return composeStrictReadOnlyToolChatPrompt({
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
        toolName: explicitReadOnlyToolChoice,
        toolAvailable: false,
      });
    }
    if (explicitReadOnlyToolChoice && packageMode === 'compact' && selectedToolCount === 1) {
      return composeStrictReadOnlyToolChatPrompt({
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
        toolName: explicitReadOnlyToolChoice,
      });
    }

    if (contextScope !== 'default') {
      const evidenceBoundedPersona = activePersonaId ? resolvePersona(activePersonaId) : null;
      return composeEvidenceBoundedChatPrompt({
        persona: evidenceBoundedPersona,
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
        contextScope,
        selectedToolCount,
        workspacePath,
      });
    }

    if (closedWorldRewrite) {
      const closedWorldPersona = activePersonaId ? resolvePersona(activePersonaId) : null;
      return composeClosedWorldChatPrompt({
        persona: closedWorldPersona,
        assembled: assembled ?? null,
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
      });
    }
    if (toolFreeAdvisory) {
      const advisoryPersona = activePersonaId ? resolvePersona(activePersonaId) : null;
      return composeToolFreeAdvisoryChatPrompt({
        persona: advisoryPersona,
        behavioralSpec: server.activeBehavioralSpec ?? BEHAVIORAL_SPEC,
        packageMode,
      });
    }

    // Check cache: reuse if same session, workspace, workspaceId, skill count, and persona.
    // Skip cache entirely when assembled is provided — it reflects per-turn
    // memory recall + task-shape detection that should not be cached across turns.
    const cacheKey = chatSessionStateKey(
      cacheWorkspaceId,
      sessionId ?? 'default',
    );
    if (!assembled && includePersistedMemory) {
      const cached = systemPromptCache.get(cacheKey);
      if (cached && cached.workspace === workspacePath && cached.workspaceId === workspaceId && cached.skillCount === skills.length && cached.personaId === activePersonaId && cached.historyLength === historyLength && cached.packageMode === packageMode && cached.model === selectedModel) {
        return cached.prompt;
      }
    }
    const now = new Date();
    // Prefix hygiene: the stable system-prompt head keeps DAY resolution only.
    // Minute resolution is appended after the cacheable prompt body below.
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let prompt = '';
    // Per-turn content, appended after every session-stable section.
    let volatileTail = '';

    // User's custom system prompt (highest priority — user overrides)
    if (userSystemPrompt) {
      prompt += userSystemPrompt + '\n\n';
    }

    // Orchestrator's built prompt (identity + self-awareness + preloaded context).
    // FR #4: when PromptAssembler is on, swap in the structured assembled prompt
    // — adds Identity + Persona + State + Recent + Memory sections via the
    // sixth-layer assembler. Wrapper-only profile, runtime, workspace, active
    // behavioral, and correction context is layered below.
    // AI-OS #6 — supply the durable "why" (project ← workspace name) before the
    // orchestrator renders its system prompt. Empty ancestry self-suppresses.
    if (includePersistedMemory) {
      orch.setGoalAncestry(resolveChatAncestry(server, workspaceId));
    }
    prompt += assembled?.system
      ?? (includePersistedMemory ? orch.buildSystemPrompt(selectedModel, availableTools) : '');

    // Inject user profile context (review Major #4: cached by mtime, no sync I/O per turn)
    if (includePersistedMemory) {
      try {
        const profileData = loadProfile(server.localConfig.dataDir) as Record<string, unknown> & {
          name?: string; role?: string; company?: string; industry?: string;
          communicationStyle?: string; interests?: string[]; language?: string;
          writingStyle?: { analyzed?: boolean; tone?: string; sentenceLength?: string; vocabulary?: string; structure?: string };
          brand?: { analyzed?: boolean; primaryColor?: string; secondaryColor?: string; accentColor?: string; fontHeading?: string; fontBody?: string };
        } | null;
        if (profileData) {
          if (profileData.name || profileData.role || profileData.company) {
            prompt += `\n\n# About the User\n`;
            if (profileData.name) prompt += `- Name: ${profileData.name}\n`;
            if (profileData.role) prompt += `- Role: ${profileData.role}\n`;
            if (profileData.company) prompt += `- Company: ${profileData.company}\n`;
            if (profileData.industry) prompt += `- Industry: ${profileData.industry}\n`;
            if (profileData.communicationStyle) prompt += `- Prefers ${profileData.communicationStyle} responses\n`;
            if (profileData.interests?.length) prompt += `- Interests: ${profileData.interests.join(', ')}\n`;
            const ws = profileData.writingStyle;
            if (ws?.analyzed) {
              prompt += `- Writing style: ${ws.tone} tone, ${ws.sentenceLength} sentences, ${ws.vocabulary} vocabulary, ${ws.structure} structure\n`;
              prompt += `- When drafting content for this user, match their writing style.\n`;
            }
            const b = profileData.brand;
            if (b && (b.analyzed || b.primaryColor !== '#D4A84B')) {
              prompt += `- Brand colors: primary ${b.primaryColor}, secondary ${b.secondaryColor}, accent ${b.accentColor}\n`;
              if (b.fontHeading) prompt += `- Brand fonts: ${b.fontHeading} (headings), ${b.fontBody} (body)\n`;
              prompt += `- When generating documents (docx, pptx, pdf, xlsx), apply these brand styles.\n`;
            }
            if (profileData.language && profileData.language !== 'en') {
              prompt += `- Preferred language: ${profileData.language}\n`;
            }
          }
        }
      } catch { /* profile shape unexpected — continue without */ }
    }

    if (packageMode === 'compact') {
      prompt += `

# Runtime Context
- Date: ${dateStr}
- Platform: ${process.platform} (${process.arch})
- Working directory: ${workspacePath ?? 'not set'}
${wsConfig?.templateId ? `- Workspace template: ${wsConfig.templateId}` : ''}
${includePersistedMemory ? '' : '- Persisted memory: disabled by the user for this turn.'}
`;
    } else {
      prompt += `

# Who You Are

You are Waggle — a personal AI orchestrator with knowledge-work and real-world tools.
You are NOT a chatbot. You are an autonomous agent that thinks, plans, acts, and learns.

You are one orchestrator among many — each user has their own Waggle, fine-tuned to them.
${includePersistedMemory
  ? 'You remember important context, build knowledge over time, and improve with every interaction.'
  : 'Persisted memory is disabled by the user for this turn. Use only the current conversation and permitted tools; do not infer or claim stored context.'}

## Your Runtime (you already know this — do NOT call bash for date/time)
- Date: ${dateStr}
- Platform: ${process.platform} (${process.arch})
- Shell: ${process.platform === 'win32' ? 'cmd.exe (use /t flag for date, time)' : '/bin/sh'}
- Working directory: ${workspacePath ?? os.homedir()}
${workspacePath
  ? (workspacePath.includes('/files') || workspacePath.includes('\\files')
    ? `- Workspace files: managed storage (${workspacePath})\n- Generated files will appear in managed workspace storage.`
    : `- Workspace linked to: ${workspacePath} (all file operations are relative to this directory)\n- Generated files will appear in: ${workspacePath}`)
  : includePersistedMemory
    ? `- No workspace directory set. Use save_memory to store information instead of files.`
    : `- No workspace directory set. Persisted memory is disabled for this turn.`}
${process.platform === 'win32' ? '- Windows note: use `date /t` and `time /t` (not bare `date` which prompts for input). Use `dir` instead of `ls`.' : ''}
${includePersistedMemory
  ? '- Conversation history, when present, is visible above. Session id and turn count arrive with the current turn.'
  : '- Persisted memory is disabled for this turn.'}
${wsConfig?.templateId ? `- Workspace template: ${wsConfig.templateId} — tailor responses to this domain.` : ''}
`;
    }

    // Behavioral rules from the ACTIVE spec — baseline with any deployed
    // self-evolution overrides applied. Falls back to the compiled
    // BEHAVIORAL_SPEC when the server hasn't decorated activeBehavioralSpec
    // (legacy test harness).
    const activeSpec = server.activeBehavioralSpec ?? BEHAVIORAL_SPEC;
    prompt += '\n' + behavioralRulesForPromptPackage(activeSpec, packageMode, selectedToolCount);

    // Token monitoring
    const estimatedTokens = Math.ceil(prompt.length / 4);
    log.info(`[Orchestrator] System prompt: ~${estimatedTokens} tokens (${packageMode}, behavioral-spec v${activeSpec.version})`);
    if (estimatedTokens > 12000) {
      log.warn(`[Orchestrator] System prompt exceeds 12K tokens (${estimatedTokens}). Consider trimming.`);
    }

    // Behavioral spec (v${BEHAVIORAL_SPEC.version}) extracted to packages/agent/src/behavioral-spec.ts
    // Dead code removed — the old 250-line inline spec lived here

    // Append loaded skills with active integration instructions
    if (packageMode === 'full' && includePersistedMemory) {
      prompt += buildSkillPromptSection(skills);
    }

    // Workspace Now — inject structured context so the agent is grounded on first turn
    if (includePersistedMemory && includeConversationDerivedWorkspaceState && workspaceId) {
      try {
        const nowBlock = buildWorkspaceNowBlock({
          dataDir: server.localConfig.dataDir,
          workspaceId,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
          cronSchedules: server.cronStore.list(),
        });
        if (nowBlock) {
          // Use structured state prompt when available (richer: open questions, blockers, stale threads)
          if (nowBlock.structuredState) {
            volatileTail += '\n\n' + formatWorkspaceStatePrompt(nowBlock.structuredState, nowBlock.workspaceName);
          } else {
            volatileTail += '\n\n' + formatWorkspaceNowPrompt(nowBlock);
          }
        }
      } catch {
        // Non-blocking — if workspace context fails, continue without it
      }
    }

    // W3.3: Inject actionable correction signals — user corrections from prior sessions
    if (includePersistedMemory) {
      try {
        const signalStore = orch.getImprovementSignals();
        if (signalStore) {
          const actionable = signalStore.getActionable();
          if (actionable.length > 0) {
            volatileTail += '\n\n# User Corrections (from prior sessions — follow these)\n';
            for (const signal of actionable) {
              volatileTail += `- ${signal.detail} (observed ${signal.count}x)\n`;
            }
          }
        }
      } catch { /* non-blocking */ }
    }

    // W1.3/W7.3: add persona only on the legacy path; assembler-owned persona
    // content stays singular. DOCX guidance always applies; persisted workspace
    // tone is withheld when the user disables memory reads for this turn.
    if (volatileTail) {
      prompt += volatileTail;
    }

    const workspaceTone = includePersistedMemory ? wsConfig?.tone : undefined;
    const activePersona = activePersonaId ? resolvePersona(activePersonaId) : null;
    prompt = composeChatPromptTail(prompt, {
      persona: activePersona,
      workspaceTone,
      assembled: assembled ?? null,
    });

    // C3: Cache the built prompt — only when there's no per-turn assembler
    // input. Caching an assembled prompt would replay stale memory recall.
    if (!assembled && includePersistedMemory) {
      systemPromptCache.set(cacheKey, { prompt, workspace: workspacePath, workspaceId, skillCount: skills.length, personaId: activePersonaId, historyLength, packageMode, model: selectedModel });
    }

    return prompt;
  }

  /**
   * Per-turn context appended to the END of the system prompt.
   *
   * Prefix hygiene: clock time, session id and turn count change on every request.
   * These values used to appear above the rules and tool schemas, invalidating the
   * useful cached prefix. Keeping them at the tail preserves that prefix without
   * changing the user's message or its evidence boundary.
   */
  function buildTurnContextSuffix(turnSessionId: string | undefined, turnCount: number): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const lines = [`Current time: ${timeStr}.`];
    if (turnSessionId) lines.push(`Session: ${turnSessionId}.`);
    if (turnCount > 0) lines.push(`Continuing conversation (${turnCount} previous messages in context).`);
    return `\n\n<turn-context>\n${lines.join('\n')}\n</turn-context>`;
  }
  // POST /api/chat — SSE streaming chat endpoint
  server.post<{
    Body: {
      message: string;
      workspace?: string;
      workspaceId?: string;
      model?: string;
      session?: string;
      /** Browser client alias retained alongside the legacy `session` key. */
      sessionId?: string;
      workspacePath?: string;
      persona?: string;
      /** Exact installed skill proposed by a first-party starter chip; always validated here. */
      selectedSkill?: string;
      /**
       * Phase B.5: tiered autonomy override. When absent or 'normal', the
       * existing gate applies. 'trusted' or 'yolo' relax the gate per the
       * rules in needsConfirmationWithAutonomy.
       * `expiresAt` is a client-supplied deadline — if set and in the past,
       * the server falls back to 'normal' for safety.
       */
      autonomy?: { level: AutonomyLevel; expiresAt?: number };
      /**
       * F4: set by a client Retry after a failed turn. Drops the previously
       * persisted failed user+assistant pair (RAM + disk) before re-issuing so
       * a reload doesn't show a duplicate.
       */
      retry?: boolean;
      retryTarget?: RetryTailExpectation;
      /**
       * Self-evolution: set by the IdleSessionWatcher's loopback review turn.
       * A review turn runs headless — no interactive client watches the SSE
       * stream, so a live approval prompt would auto-deny after the timeout and
       * the proposal would be lost. When true, a gated proposable tool (e.g.
       * create_skill) is HELD for durable human approval in Approvals instead of
       * a live SSE prompt, and any other gated tool is denied. The reviewer can
       * therefore never write to disk without approval.
       */
      proposeHeld?: boolean;
      /**
       * Steal #13: automation-origin memory write-back gate. Set ONLY by
       * headless/automated callers (idle-watcher review turns, scheduled
       * loops) — an automated turn re-analyzes existing transcripts, so its
       * post-response write-back (auto-save, skill distillation, KG
       * extraction, correction detection) would pollute memory with
       * re-detected "decisions" and false correction signals. IM channel
       * adapters must NOT set this: inbound IM messages are real user turns.
       */
      origin?: 'automation' | 'router';
      /**
       * #17: originating IM channel of this turn (real platform + chatId).
       * Set only by ChannelManager.handleInbound via the loopback client —
       * published as the request-scoped turn origin so create_schedule can
       * stamp ai_task delivery targets from a trusted snapshot.
       */
      channel?: { platform: string; chatId: string };
    };
  }>('/api/chat', async (request, reply) => {
    const totalServerStartedAt = performance.now();
    let firstTokenAt: number | null = null;

    // P0-4: Accept both 'workspace' and 'workspaceId' for backwards compat
    // Phase A.2: `persona` is an optional per-window override — takes precedence
    // over the workspace's default persona for this single request only.
    const {
      message, workspace: workspaceRaw, workspaceId: workspaceIdRaw, model, session,
      sessionId: sessionIdAlias,
      workspacePath: explicitWorkspacePath, persona: personaOverride,
      selectedSkill: selectedSkillRaw,
      autonomy: autonomyRaw, retry: retryTurn, retryTarget: retryTargetRaw,
      proposeHeld: proposeHeldTurn,
      origin, channel: channelMeta,
    } = request.body ?? {};

    // Reject a malformed request body before resolving the workspace it names.
    // A syntactically valid unknown workspace still returns 404 below, while
    // invalid message/session input remains a stable 400 regardless of whether
    // the named workspace exists.
    const validatedFields = validateChatRequestFields(
      {
        message,
        workspace: workspaceRaw,
        workspaceId: workspaceIdRaw,
        session,
        sessionId: sessionIdAlias,
        selectedSkill: selectedSkillRaw,
        retry: retryTurn,
        retryTarget: retryTargetRaw,
      },
      name => server.agentState.skills.some(skill => skill.name === name),
    );
    if (validatedFields.rejection) {
      return reply.status(validatedFields.rejection.status).send(validatedFields.rejection.body);
    }
    const { selectedSkill, retryTarget } = validatedFields;

    const workspace = workspaceRaw ?? workspaceIdRaw;
    const authorizedWorkspace = getResolvedChatWorkspaceId(request);
    const requestedSessionId = session ?? sessionIdAlias;
    if (session !== undefined && sessionIdAlias !== undefined && session !== sessionIdAlias) {
      return reply.status(400).send({
        error: 'session and sessionId must match when both are provided',
        code: 'SESSION_ID_CONFLICT',
      });
    }

    const workspaceTarget = resolveChatWorkspaceTarget(
      server,
      workspace,
      authorizedWorkspace,
      getChatHistoryLayout,
    );
    if (workspaceTarget.rejection) {
      return reply.status(workspaceTarget.rejection.status).send(workspaceTarget.rejection.body);
    }
    const {
      workspaceConfig,
      historyTarget,
      usesNamedWorkspace,
      historyWorkspaceId,
      executionWorkspaceId,
      executionScopeId,
      executionWorkspaceConfig,
    } = workspaceTarget;
    // #13: automated turns skip the post-response memory write-back seams
    // below. `proposeHeld` is belt-and-braces — the shipped idle-watcher
    // already sets it, so its review turns are gated even without `origin`.
    // Compliance execution traces stay ungated. Learned memory, improvement
    // signals, and skill capture are gated below by the resolved turn policy.
    const isAutomatedTurn = origin === 'automation' || !!proposeHeldTurn;

    // Phase B.5: resolve the effective autonomy level for this request.
    const autonomyLevel = resolveAutonomyLevel(autonomyRaw);

    // H-AUDIT-1: generate per-turn trace ID at the conceptual turn boundary
    // (POST /api/chat entry). Propagated explicitly into agent-loop,
    // orchestrator, retrieval, prompt-assembler, cognify, and each tool
    // call. Every stage logs a structured event tagged with this turnId
    // so the full turn graph is reconstructable from a single correlation
    // key. Also satisfies EU AI Act Art. 14 traceability requirements.
    const turnId = generateTurnId();
    logTurnEvent(turnId, {
      stage: 'chat.turn.start',
      workspace: executionWorkspaceId,
      model,
      messageChars: (message ?? '').length,
    });

    // A2: Resolve workspace directory — use explicit path, workspace config, or virtual storage
    // NEVER fall back to user homedir — use managed storage instead
    const workspacePaths = resolveChatWorkspacePaths(server, {
      workspace,
      workspaceConfig,
      explicitWorkspacePath,
      usesNamedWorkspace,
      authorizedWorkspace,
    });
    if (workspacePaths.rejection) {
      return reply.status(workspacePaths.rejection.status).send(workspacePaths.rejection.body);
    }
    const workspacePath = workspacePaths.workspacePath;
    const { workspacePathFromTrustedConfig, executionWorkspacePath } = workspacePaths;

    // Validation and auth checks remain before reply.hijack(); once hijacked,
    // reply.status() / reply.send() become no-ops on the raw socket.
    const turnMutationPolicy = classifyExplicitTurnMutationPolicy(message);
    const isPlainInteractiveTurn = autonomyLevel === 'normal'
      && !isAutomatedTurn
      && turnMutationPolicy.contextScope === 'default';
    const resolvedReadOnlyToolDirective = resolveExplicitReadOnlyToolChoice(
      message,
      Array.from(EXPLICIT_READ_ONLY_TOOL_NAMES, name => ({ name })),
    );
    const decisionMatrixToolSequenceRequested = isDecisionMatrixSkillRequest(message)
      && (!selectedSkill || selectedSkill === 'decision-matrix')
      && isPlainInteractiveTurn;
    const boundedExactPersistedMemoryLookup = isBoundedExactPersistedMemoryLookup(message)
      && isPlainInteractiveTurn;
    const directReadFileDirective = parseDirectReadFileDirective(message);
    const directReadFileCandidate = directReadFileDirective.kind !== 'unrelated'
      && isPlainInteractiveTurn
      && Boolean(executionWorkspacePath)
      ? 'read_file'
      : undefined;
    const preScanExplicitReadOnlyToolCandidate = directReadFileCandidate
      ?? (decisionMatrixToolSequenceRequested
        ? 'read_skill'
        : undefined)
      ?? (selectedSkill ? 'read_skill' : undefined)
      ?? (boundedExactPersistedMemoryLookup ? 'search_memory' : undefined)
      ?? (resolvedReadOnlyToolDirective === 'list_skills'
        && isPlainInteractiveTurn
        && detectTaskShape(message).complexity === 'simple'
        && /^\s*(?:(?:you\s+)?must\s+|please\s+)?(?:call|use|invoke|run)\s+(?:the\s+)?(?:tool\s+)?list_skills(?:\s+exactly\s+once|\s+once)?[.!]?\s*$/i.test(message)
        ? resolvedReadOnlyToolDirective
        : undefined);
    const persistedMemoryReadAllowed = allowsPersistedMemoryRead(turnMutationPolicy);
    const toolFreeAdvisoryCandidate = autonomyLevel === 'normal'
      && !isAutomatedTurn
      && !shouldUsePersistedMemoryForTurn(message)
      && !isExplicitMemorySaveRequest(message)
      && !isExplicitExternalResearchRequest(message)
      && isExplicitToolFreeAdvisoryRequest(message, turnMutationPolicy);
    const requestClosedWorldRewrite = isClosedWorldRewriteRequest(message);
    const turnPersonaId = personaOverride
      ?? executionWorkspaceConfig?.personaId
      ?? null;
    const turnPersona = turnPersonaId ? resolvePersona(turnPersonaId) : null;
    const turnPersistence = resolveTurnPersistencePermissions({
      policy: turnMutationPolicy,
      isAutomatedTurn,
      personaIsReadOnly: turnPersona?.isReadOnly === true,
      closedWorldRewrite: requestClosedWorldRewrite,
    });
    // What this turn may leave behind; narrowed once its history is loaded.
    const retention = new TurnRetention({
      ...turnPersistence,
      allowResponseDecoration: allowsPostResponseDecoration(
        turnMutationPolicy,
        requestClosedWorldRewrite,
      ),
    });
    const retainedTurnText = (value: string): string => (
      retention.allowDerivedPersistence ? value : NON_RETAINED_TURN_CONTENT
    );
    const retainedTurnJson = (value: unknown): string => (
      retention.allowDerivedPersistence
        ? JSON.stringify(value) ?? 'null'
        : JSON.stringify({ redacted: NON_RETAINED_TURN_CONTENT })
    );

    // Security: scan for prompt injection patterns
    const injectionResult = scanForInjection(message, 'user_input');
    if (injectionResult.score >= 0.7) {
      // High-confidence injection: block entirely.
      // Review Major #3: flags NOT included in the client response — the scanner's
      // internal pattern vocabulary leaks a roadmap for crafting bypassing payloads.
      log.warn(`[security] Prompt injection BLOCKED (score ${injectionResult.score})`, injectionResult.flags);
      return reply.code(400).send({
        error: 'Message blocked by security scanner',
        code: 'INJECTION_DETECTED',
      });
    } else if (injectionResult.score >= 0.3) {
      log.warn(`[security] Potential prompt injection detected (score ${injectionResult.score})`, injectionResult.flags);
    }
    const warningTierDirectReadFileCandidate = !injectionResult.safe
      && WARNING_TIER_DIRECT_READ_FILE_INTENT_RE.test(message)
      && isPlainInteractiveTurn
      && Boolean(executionWorkspacePath)
      ? 'read_file'
      : undefined;
    const explicitReadOnlyToolCandidate = preScanExplicitReadOnlyToolCandidate
      ?? warningTierDirectReadFileCandidate;

    // Review Critical #3: viewer RBAC moved above reply.hijack() — after hijack,
    // reply.status(403) silently no-ops and the client gets HTTP 200 + empty SSE stream.
    if (workspaceConfig?.teamId && workspaceConfig?.teamRole === 'viewer') {
        return reply.status(403).send({
          error: 'Viewers cannot send messages in team workspaces. Ask a team admin to upgrade your role.',
          code: 'VIEWER_READ_ONLY',
        });
    }

    // Review Critical #1: request-supplied paths stay anchored to dataDir.
    // A workspace directory loaded from persisted config is an explicit user
    // trust grant and was canonicalized by resolveWorkspaceExecutionRoot above.
    if (workspacePath) {
      const resolved = path.resolve(workspacePath);
      const allowed = path.resolve(server.localConfig.dataDir);
      if (!workspacePathFromTrustedConfig
        && resolved !== allowed
        && !resolved.startsWith(allowed + path.sep)) {
        log.warn(`[security] Path traversal attempt blocked: ${workspacePath}`);
        return reply.status(400).send({
          error: 'Invalid workspace path',
          code: 'PATH_TRAVERSAL',
        });
      }
    }

    // Hijack the response so Fastify doesn't try to send its own reply.
    // All validation + auth above — safe to commit to SSE from here.
    await reply.hijack();

    // Set SSE headers via raw response (include CORS since hijack bypasses Fastify plugins)
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': validateOrigin(request.headers.origin as string | undefined),
    });
    // Commit the SSE response before provider time-to-first-token. Otherwise a
    // slow model can look like an offline backend to clients waiting on headers.
    raw.flushHeaders();

    // The response side owns the long-lived SSE socket. Cancelling its reader
    // closes reply.raw (request.raw already finished after the POST body), which
    // must abort the provider/tool run immediately.
    const abortController = new AbortController();
    let turnSignal: AbortSignal = abortController.signal;
    raw.once('close', () => {
      if (!raw.writableEnded) abortController.abort();
    });
    if (raw.destroyed) abortController.abort();

    // Helper to write SSE events
    const sendEvent = (event: string, data: unknown) => {
      if (turnSignal.aborted || raw.destroyed || raw.writableEnded) return;
      if (event === 'token' && firstTokenAt === null) {
        firstTokenAt = performance.now();
      }
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const throwIfTurnAborted = (): void => {
      if (turnSignal.aborted) {
        throw turnSignal.reason ?? new Error('Chat or workspace cancelled');
      }
    };

    // Recalled memory and workspace-session context adopted this turn. Its
    // `receipt` is terminal, content-free proof that saved memory actually
    // entered the model context: the UI must never infer that from message
    // count or an attempted recall, because empty, failed, and safety-dropped
    // lookups did not influence the answer.
    const turnRecall = new TurnRecalledContext();

    // B1-B7: Rerouted message from slash command processing — scoped to handler
    let reroutedMessage: string | undefined;

    // Review Critical #2: the turn's releasable resources are held here so the
    // outer finally can always clean up. Old code's only cleanup was at the
    // happy-path line ~1125; every exception path leaked the pre:tool hook into
    // the shared hookRegistry, causing ghost confirmation prompts on every
    // subsequent request with closures pointing at dead sockets.
    const turnResources = new TurnResources();
    let requestHookRegistry: HookRegistry | undefined;

    // H-07 G4: hoisted so the outer catch can finalize aborted/errored traces
    // with outcome='abandoned'. Without this, a failed turn leaves its row in
    // the 'pending' state and EvalDatasetBuilder skips it, starving the
    // evolution loop of negative examples.
    const turnTrace = new TurnExecutionTrace({
      onFinalizeError: (error, traceId) => {
        log.warn('[chat] execution trace finalize failed; the row stays unfinalized', {
          workspaceId: executionScopeId,
          traceId,
          error,
        });
      },
    });

    // #3 (launch-blocker): hoist the resolved orchestrator so the outer catch
    // can persist the raw user turn even when generation fails. Memory capture
    // must not be contingent on LLM success ("remembers everything").
    let activeSessionOrch: Orchestrator | undefined;
    let workspaceSessionActivity: WorkspaceSessionActivityLease | undefined;
    let workspaceTurnScope: WorkspaceTurnScope | undefined;
    const activeSessionId = requestedSessionId ?? historyWorkspaceId;
    const activeWorkspaceId = historyWorkspaceId;
    const activeExecutionWorkspaceId = executionWorkspaceId;
    const activeSessionStateWorkspaceId = historyTarget.stateWorkspaceId;
    const activeSessionStateKey = chatSessionStateKey(
      activeSessionStateWorkspaceId,
      activeSessionId,
    );
    const sessionPersistenceDataDir = historyTarget.dataDir;
    const accountWorkspaceSessionTokens = (delta: number): void => {
      if (!Number.isFinite(delta) || delta <= 0) return;
      if (workspaceSessionActivity) {
        const leasedSession = workspaceSessionActivity.session;
        if (server.sessionManager.get(leasedSession.workspaceId) === leasedSession) {
          server.sessionManager.addTokens(leasedSession.workspaceId, delta);
        }
        return;
      }
      // Injectable runners may execute without a managed workspace session.
      // Preserve the legacy best-effort accounting attempt only when there is
      // no live generation that this unleased request could mutate.
      if (activeExecutionWorkspaceId && !server.sessionManager.get(activeExecutionWorkspaceId)) {
        server.sessionManager.addTokens(activeExecutionWorkspaceId, delta);
      }
    };
    let activeHistory: Array<{ role: string; content: string; model?: string }> | undefined;
    const usageLedger = new TurnUsageLedger();
    const failedAttemptToolsUsed = new Set<string>();
    let responseCommitted = false;

    // Mutable conversation-local state cannot accept two overlapping turns.
    // Reject the second request before model resolution or history mutation.
    if (activeChatTurns.has(activeSessionStateKey)) {
      sendEvent('error', {
        message: 'Another turn is already running for this session.',
        code: 'SESSION_TURN_IN_PROGRESS',
      });
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return;
    }
    activeChatTurns.add(activeSessionStateKey);
    touchSessionState(activeSessionStateKey);
    const hasCustomRunner = !!server.agentRunner;
    const agentRunner: AgentRunner = server.agentRunner ?? runAgentLoop;

    try {
      requestHookRegistry = hasCustomRunner ? undefined : hookRegistry.fork();

      // Resolve the agent runner (injectable for tests)
      const sessionId = activeSessionId;
      const effectiveWorkspace = activeExecutionWorkspaceId;
      const sessionStateKey = activeSessionStateKey;

      // Named workspaces must acquire one coherent chat runtime before any
      // asynchronous model work or conversation mutation. Construction errors
      // fail closed; mixing a workspace tool pool with the shared orchestrator
      // would cross memory and mutable agent state.
      let sessionOrch: Orchestrator = orchestrator;
      let sessionTools: ToolDefinition[] | undefined;
      let wsSession: WorkspaceSession | undefined;
      if (!hasCustomRunner && usesNamedWorkspace) {
        try {
          if (!effectiveWorkspace) {
            throw new Error('Managed workspace identity is unavailable');
          }
          if (!server.agentState.getWorkspaceMindDb(effectiveWorkspace)) {
            throw new Error('Workspace mind is unavailable');
          }
          const candidateSession = server.sessionManager.getOrCreate(
            effectiveWorkspace,
            () => server.mindCache.acquire(effectiveWorkspace),
            (m) => server.agentState.createSessionOrchestrator(m),
            (m, o) => server.agentState.buildToolsForSession(
              o,
              executionWorkspacePath ?? effectiveWorkspace,
              effectiveWorkspace,
            ),
            server.workspaceManager?.get(effectiveWorkspace)?.personaId ?? undefined,
            () => server.mindCache.release(effectiveWorkspace),
          );
          workspaceSessionActivity = server.sessionManager.acquireActivity(effectiveWorkspace);
          if (!workspaceSessionActivity) {
            throw new Error(`Workspace session is ${candidateSession.status}`);
          }
          const activeWorkspaceSession = workspaceSessionActivity.session;
          turnSignal = AbortSignal.any([
            abortController.signal,
            activeWorkspaceSession.abortController.signal,
          ]);
          if (turnSignal.aborted) {
            throw turnSignal.reason ?? new Error('Chat or workspace cancelled');
          }

          server.mindCache.acquire(effectiveWorkspace);
          turnResources.holdWorkspaceMindPin(() => server.mindCache.release(effectiveWorkspace));
          const runtime = acquireChatRuntime(
            activeWorkspaceSession,
            sessionId,
            executionWorkspacePath ?? effectiveWorkspace,
            effectiveWorkspace,
          );

          wsSession = activeWorkspaceSession;
          turnResources.holdChatRuntime(() => releaseChatRuntime(activeWorkspaceSession, sessionId, runtime));
          sessionOrch = runtime.orchestrator;
          sessionTools = runtime.tools;
        } catch (err) {
          log.warn(`[session] Failed to create workspace chat runtime for "${effectiveWorkspace}": ${(err as Error).message}`);
          throw new Error(`Workspace "${effectiveWorkspace}" is not ready for chat.`);
        }
      } else if (!hasCustomRunner && authorizedWorkspace !== undefined) {
        try {
          if (authorizedWorkspace) {
            const requestMind = server.mindCache.acquire(authorizedWorkspace);
            turnResources.holdSharedMindPin(() => server.mindCache.release(authorizedWorkspace));
            sessionOrch = server.agentState.createSessionOrchestrator(requestMind);
          } else {
            sessionOrch = server.agentState.createSessionOrchestrator();
          }
          sessionTools = server.agentState.buildToolsForSession(
            sessionOrch,
            executionWorkspacePath ?? os.homedir(),
            authorizedWorkspace ?? undefined,
          );
        } catch (err) {
          log.warn(`[session] Failed to create request-scoped chat runtime: ${(err as Error).message}`);
          throw new Error('Chat workspace is not ready.');
        }
      }
      activeSessionOrch = sessionOrch;
      if (!hasCustomRunner) {
        workspaceTurnScope = server.agentState.workspaceTurnCoordinator.createScope(
          executionWorkspacePath ?? os.homedir(),
          turnSignal,
        );
        const heldScope = workspaceTurnScope;
        turnResources.holdTurnScope(() => heldScope.release());
      }

      // ── Model Pilot: resolve model with fallback chain ──
      const pilotConfig = new WaggleConfig(server.localConfig.dataDir);
      const wsModelConfig = executionWorkspaceConfig?.model;
      const primaryModel = model ?? wsModelConfig ?? pilotConfig.getDefaultModel() ?? 'claude-sonnet-4-6';
      const fallbackModel = pilotConfig.getFallbackModel();
      const budgetModel = pilotConfig.getBudgetModel();
      const budgetThreshold = pilotConfig.getBudgetThreshold();

      // Resolve model selection before availability and fallback checks.
      let resolvedModel = primaryModel;
      let modelSwitchReason: string | null = null;
      let budgetModelSelected = false;
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
          resolvedModel = routing.model;
          budgetModelSelected = resolvedModel !== primaryModel;
          if (budgetModelSelected) {
            modelSwitchReason = `Budget ${Math.round(budgetThreshold * 100)}% reached ($${spent.toFixed(2)}/$${dailyBudget.toFixed(2)})`;
          }
        }
      }

      // ── Model resolution: confirm the selected model is routable; on failure fall
      // back budget → primary → configured fallback, recording modelSwitchReason ──
      try {
        const selectedModelBeforeResolution = resolvedModel.trim();
        resolvedModel = await resolveUsableModel(server, resolvedModel);
        const normalizedOnly = resolvedModel
          === canonicalizeModelReference(selectedModelBeforeResolution);
        if (!normalizedOnly) {
          budgetModelSelected = false;
          modelSwitchReason = `${selectedModelBeforeResolution} unavailable; ${resolvedModel} selected`;
        }
      } catch (selectedResolutionError) {
        const unavailableModel = resolvedModel;
        if (budgetModelSelected && unavailableModel !== primaryModel) {
          try {
            resolvedModel = await resolveUsableModel(server, primaryModel);
            budgetModelSelected = false;
            modelSwitchReason = `${unavailableModel} unavailable; primary selected`;
          } catch (primaryResolutionError) {
            if (!fallbackModel || fallbackModel === unavailableModel) throw primaryResolutionError;
            resolvedModel = await resolveUsableModel(server, fallbackModel);
            budgetModelSelected = false;
            modelSwitchReason = `${unavailableModel} and ${primaryModel} unavailable; configured fallback selected`;
          }
        } else {
          if (!fallbackModel || fallbackModel === unavailableModel) throw selectedResolutionError;
          resolvedModel = await resolveUsableModel(server, fallbackModel);
          modelSwitchReason = `${unavailableModel} unavailable; configured fallback selected`;
        }
      }
      throwIfTurnAborted();

      const configuredFallbackModel = fallbackModel
        ? canonicalizeModelReference(fallbackModel)
        : null;
      const hasDistinctConfiguredFallback = Boolean(
        configuredFallbackModel
        && canonicalizeModelReference(resolvedModel) !== configuredFallbackModel,
      );

      // Viewer RBAC moved above reply.hijack() — see review Critical #3 fix at top of handler.

      // A conversation-history denial is a read boundary, not only a prompt-
      // packaging choice. Do not read or cache the saved transcript for this turn.
      if (!turnMutationPolicy.denyConversationHistory && !sessionHistories.has(sessionStateKey)) {
        const saved = loadSessionMessages(
          sessionPersistenceDataDir, activeWorkspaceId, sessionId
        );
        sessionHistories.set(sessionStateKey, saved);
        touchSessionState(sessionStateKey);
      }
      const history = turnMutationPolicy.denyConversationHistory
        ? []
        : sessionHistories.get(sessionStateKey)!;
      activeHistory = turnMutationPolicy.denyConversationHistory ? undefined : history;

      let retryUserAlreadyPersisted = false;
      if (retryTarget && !turnMutationPolicy.denyConversationHistory) {
        if (!retryTailMatches(history, message, retryTarget)) {
          sendEvent('error', {
            message: 'This conversation changed before Retry could replace it. Reload and try again.',
            code: 'RETRY_TARGET_STALE',
          });
          if (!raw.destroyed && !raw.writableEnded) raw.end();
          return;
        }
        const replacement = replaceRetryTailWithUser(
          sessionPersistenceDataDir,
          activeWorkspaceId,
          sessionId,
          message,
          retryTarget,
        );
        if (!replacement.ok) {
          sendEvent('error', {
            message: 'Retry could not safely replace this conversation. Reload and try again.',
            code: 'RETRY_TARGET_STALE',
          });
          if (!raw.destroyed && !raw.writableEnded) raw.end();
          return;
        }
        history.splice(
          history.length - replacement.removed,
          replacement.removed,
          { role: 'user', content: message },
        );
        retryUserAlreadyPersisted = true;
      }

      // F4 legacy retry-dedup: older clients only identified failed turns. Drop
      // the previously persisted failed user+assistant pair (RAM + disk) so a
      // reload doesn't render it duplicated alongside the fresh turn.
      if (retryTurn && !retryTarget && !turnMutationPolicy.denyConversationHistory) {
        const n = history.length;
        const legacyTailMatches = n >= 2
          && history[n - 1].role === 'assistant'
          && typeof history[n - 1].content === 'string'
          && history[n - 1].content.startsWith(GENERATION_FAILED_PREFIX)
          && history[n - 2].role === 'user'
          && history[n - 2].content === message;
        if (legacyTailMatches && stripTrailingFailedPair(
          sessionPersistenceDataDir,
          activeWorkspaceId,
          sessionId,
          message,
        )) {
          history.splice(n - 2, 2);
        }
      }

      // Current-message-only packaging is safe only when there is no prior
      // conversation to erase. Capability classifiers above separately keep
      // workspace, memory, connector, and web evidence requests tool-capable.
      retention.settle({
        toolFreeAdvisory: toolFreeAdvisoryCandidate && history.length === 0,
        forcedReadOnlyTurn: (explicitReadOnlyToolCandidate === 'read_file'
            && directReadFileDirective.kind === 'valid')
          || explicitReadOnlyToolCandidate === 'search_memory'
          || decisionMatrixToolSequenceRequested,
      });

      // A saved-history opt-out is both a read and retention boundary for this turn.
      if (!turnMutationPolicy.denyConversationHistory && !retryUserAlreadyPersisted) {
        history.push({ role: 'user', content: message });
        persistMessage(sessionPersistenceDataDir, activeWorkspaceId, sessionId, { role: 'user', content: message });
      }

      // Check whether the configured LLM path can serve a completion. Process
      // liveness is insufficient for the built-in proxy because it also runs
      // normally before a cloud credential or local model has been configured.
      // resolveUsableModel() only returns an ollama/* selection after the tag
      // is observed locally, so it remains authoritative even if startup's
      // cloud-provider status has not yet caught up with onboarding.
      const resolvedLocalOllama = resolvedModel.toLowerCase().startsWith('ollama/');
      let litellmAvailable = hasCustomRunner || resolvedLocalOllama; // trust injected runners and verified local models
      if (!hasCustomRunner && !resolvedLocalOllama) {
        const llmStatus = server.agentState.llmProvider;
        if ((llmStatus.provider === 'anthropic-proxy' || llmStatus.provider === 'ollama' || llmStatus.provider === 'litellm') && llmStatus.health === 'healthy') {
          // Healthy tracked provider — skip HTTP probe. For litellm the
          // per-request 3s probe raced concurrent completions (uvicorn busy
          // serving LLM calls), randomly dropping healthy turns into echo mode;
          // the health monitor already tracks child liveness.
          litellmAvailable = true;
        } else {
          try {
            const healthHeaders: Record<string, string> = {};
            const token = server.agentState.wsSessionToken;
            if (token) {
              healthHeaders['Authorization'] = `Bearer ${token}`;
            }
            const healthPath = llmStatus.provider === 'anthropic-proxy'
              ? '/health/readiness'
              : '/health/liveliness';
            const healthRes = await fetch(`${getLitellmUrl()}${healthPath}`, {
              signal: AbortSignal.any([turnSignal, AbortSignal.timeout(3000)]),
              headers: healthHeaders,
            });
            litellmAvailable = healthRes.ok;
          } catch {
            // LiteLLM not reachable
          }
        }
      }

      // Streams a canned assistant reply word by word, persists it unless the
      // turn denies conversation history, and emits the terminal `done` event.
      // Resolves false when the turn was aborted before `done` was sent.
      // Does not end the stream: the caller owns `raw.end()`. The two
      // slash-command callers call it; the setup-required echo caller
      // deliberately does not, and reaches the handler's outer `finally`
      // through the skipped agent-loop block instead.
      const streamCannedReply = async (text: string, wordDelayMs: number): Promise<boolean> => {
        for (const word of text.split(' ')) {
          if (turnSignal.aborted) return false;
          sendEvent('token', { content: word + ' ' });
          await new Promise((r) => setTimeout(r, wordDelayMs));
        }
        if (turnSignal.aborted) return false;
        if (!turnMutationPolicy.denyConversationHistory) {
          history.push({ role: 'assistant', content: text });
          persistMessage(sessionPersistenceDataDir, activeWorkspaceId, sessionId, { role: 'assistant', content: text });
        }
        sendEvent('done', {
          content: text,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          toolsUsed: [],
        });
        return true;
      };

      // ── Slash command routing (works even in echo mode) ──
      if (turnSignal.aborted) return;
      const { commandRegistry } = server.agentState;
      const isSlashCommand = commandRegistry.isCommand(message);
      if (isSlashCommand) {
        const cmdContext = buildChatCommandContext({
          server,
          orchestrator: sessionOrch,
          executionWorkspaceId,
          sessionId,
          turnMutationPolicy,
        });
        const marketplaceSubcommand = message.trim().match(
          /^\/(?:marketplace|mp|market)\s+(installed|install|sync)\b/i,
        )?.[1]?.toLowerCase();
        const blocksMarketplaceRead = marketplaceSubcommand === 'installed'
          && !persistedMemoryReadAllowed;
        const blocksMarketplaceMutation = (marketplaceSubcommand === 'install'
          || marketplaceSubcommand === 'sync')
          && (!persistedMemoryReadAllowed || !retention.allowDerivedPersistence);
        const cmdResult = blocksMarketplaceRead || blocksMarketplaceMutation
          ? 'Persisted marketplace state is disabled for this turn.'
          : await commandRegistry.execute(message, cmdContext);

        // B1-B7: Check if the command wants to be re-processed through the agent loop
        if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && litellmAvailable) {
          // Extract the rewritten message and fall through to agent loop processing
          const rerouted = cmdResult.slice(AGENT_LOOP_REROUTE_PREFIX.length);
          sendEvent('step', { content: `Processing /${message.trim().split(/\s+/)[0].slice(1)} via AI...` });
          // Replace the message in history with the original slash command (already persisted)
          // and process the rewritten message through the agent loop below
          // We achieve this by NOT returning here — the code falls through to the agent loop
          // with the rerouted message replacing the original
          reroutedMessage = rerouted;
        } else if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && !litellmAvailable) {
          const cmdName = message.trim().split(/\s+/)[0];
          const friendlyError = `**${cmdName} requires AI** — This command needs a working LLM connection.\n\nConfigure an API key in Settings > API Keys, then try again.`;
          if (!(await streamCannedReply(friendlyError, 10))) return;
          raw.end();
          return; // Review Major #5: explicit terminal — don't fall through to agent loop
        } else {
          // Stream the command result as SSE tokens and persist it
          if (!(await streamCannedReply(cmdResult, 10))) return;
          raw.end();
          return; // Review Major #5: explicit terminal — don't fall through to agent loop
        }
      }

      // B1-B7: Check if a slash command requested agent-loop rerouting
      const shouldRunAgentLoop = reroutedMessage || (!isSlashCommand && litellmAvailable);
      const shouldEchoMode = !reroutedMessage && !isSlashCommand && !litellmAvailable;

      if (shouldEchoMode) {
        // Setup-required mode — respond without pretending the user's input
        // was answered. The raw turn is still persisted for continuity.
        const echoResponse = '**No AI model is ready.**\n\nConfigure a provider key in Settings > API Keys, or install and verify a local model in Settings > Models, then try again.';
        // Persist echo response so session continuity is maintained
        if (!(await streamCannedReply(echoResponse, 15))) return;
      }

      if (shouldRunAgentLoop) {
        // Use rerouted message if from a slash command, otherwise use original
        const agentMessage = reroutedMessage ?? message;
        const closedWorldRewrite = requestClosedWorldRewrite
          || isClosedWorldRewriteRequest(agentMessage);

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
        // With the Phase A.1 session migration, the per-session orchestrator
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
              // Minor #3: scan recalled memory for injection payloads before injecting into prompt
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

                // B5: Include content snippets so ToolCard can show what was recalled
                const snippets = (recall.recalled ?? []).slice(0, 3);
                const snippetText = snippets.map(s => `  - ${s}`).join('\n');
                const resultText = `${recall.count} memories recalled:\n${snippetText}`;
                // PR3.5: distinct provenance sources of the recalled memories
                // (raw frame.source values; the FE owns the friendly label map).
                // Review M-4: emit the breakdown ONLY when it covers EVERY recalled
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
        // Q11:A — Mid-conversation follow-ups like "yes", "run it", "LGTM" are valid
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
        // GAP-006: Prepend ambiguity guard when user message is too brief/vague
        const shouldCheckAmbiguity = isFirstUserMessage
          && !gepaExpanded
          && !closedWorldRewrite
          && !explicitReadOnlyToolCandidate
          && turnMutationPolicy.contextScope === 'default'; // Skip when expansion or an explicit evidence boundary already resolves intent
        const ambiguityPrefix = (!hasCustomRunner && shouldCheckAmbiguity && isAmbiguousMessage(agentMessage)) ? AMBIGUITY_PROMPT : '';

        // M2-7: Track session start on first user message
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

        // FR #4: pre-fetch a structured AssembledPrompt when PROMPT_ASSEMBLER is on.
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

        // W4.5 (plan bug #9-1, double-inject): when the assembler ran, the
        // recall block is already INSIDE the assembled prompt — appending it
        // again injected every recalled memory twice (`staticPromptTail`).
        let systemPrompt = hasCustomRunner ? 'You are a helpful AI assistant.' : '';
        const initialPromptModel = resolvedModel;
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

        // W3.1: Filter tools by persona — non-technical personas get a reduced
        // tool set. The always-available + read-only-write-strip policy lives in
        // persona-tool-filter.ts (extracted so the closed-learning-loop guarantee
        // — create_skill survives the allowlist — is unit-testable; this block is
        // !hasCustomRunner-gated and therefore unreachable from route tests).
        // Resolution order matches buildSystemPrompt (Phase A.2): per-window
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

        // #17: schedule-originated turns must not schedule further work — an
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

          // Steal #6: relevance-gate connected MCP tools into the pool. This is
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

        // B1-B7: If this is a rerouted slash command, replace the last user message
        // with the enriched agent prompt so the LLM gets better instructions
        if (reroutedMessage && !turnMutationPolicy.denyConversationHistory) {
          // The original slash command is already persisted to disk at line 724.
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
          && canUseBudgetModelWithoutCloudEgress(resolvedModel, budgetModel)
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
        const discoveredWindow = getModelContextWindow(resolvedModel);
        const isLocalModel = isOfflineOllamaModelReference(resolvedModel);
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

              // #12: dual-use — persist the summary the compressor already
              // paid for as a durable memory frame (skipped for automated
              // turns per #13, and for injected-runner turns like every other
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
            throw new Error(
              unreadable
                ? 'Team governance policies could not be verified for this workspace. Try again or contact your team admin.'
                : 'Team governance policies could not be reached for this workspace. Check your connection and try again.',
            );
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
            model: resolvedModel,
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
              model: resolvedModel,
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
          systemPrompt = await rebuildSystemPromptForModel(resolvedModel);
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

        const iterBudget = new IterationBudget({
          maxIterations: 90,
          freeToolCalls: ['execute_code'],
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

        // Build agent loop config — with windowed conversation history + hooks
        let bufferedAgentTokens: string[] = [];
        let reasoningActivitySent = false;
        let modelRequestSent = false;
        let modelResponseActivitySent = false;
        let modelActivitySent = false;
        let capabilityReceipt: ReturnType<typeof createPersistedCapabilityReceipt> = null;
        let pendingCapabilityToolResults: Array<{
          input: Record<string, unknown>;
          output: string;
          duration?: number;
        }> = [];
        const toolActivity = new TurnToolActivity({
          explicitReadOnlyToolChoice,
          requiredToolSequence,
          capResultForModel: result => capToolResultForModel(
            result,
            Math.min(4_000, agentRunBudget.toolContextBudget.maxSingleResultChars),
          ),
        });

        const agentConfig: AgentLoopConfig = {
          // Breaker-wrapped, from the composition root (R-2). Read defensively so
          // suites that mount no decorator keep the platform fetch.
          fetch: server.llmFetch ?? globalThis.fetch,
          litellmUrl: getLitellmUrl(),
          litellmApiKey: server.agentState.litellmApiKey,
          model: resolvedModel,
          billingModel: resolvedModel,
          modelSpendBudget: costTracker,
          modelSpendBillingClass: isOfflineOllamaModelReference(resolvedModel)
            || isExactConfiguredKeylessCompatibleModel(server, resolvedModel)
            ? 'free'
            : 'priced',
          spendWorkspaceId: executionScopeId,
          systemPrompt,
          tools: effectiveTools,
          ...(requiredToolSequence ? { requiredToolSequence } : {}),
          messages: windowedMessages,
          stream: true,
          modelOperationTimeoutMs: 100_000,
          ...(hasDistinctConfiguredFallback ? { initialModelActivityTimeoutMs: 20_000 } : {}),
          ...agentRunBudget,
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
          reasoning: reasoningForModelAttempt(resolvedModel),
          hooks: requestHookRegistry,
          capabilityRouter,
          governancePolicies,
          skillDistillationGate: retention.allowDerivedPersistence,
          signal: turnSignal,
          turnId, // H-AUDIT-1: propagate trace ID into the loop

          onModelActivity: () => {
            if (modelResponseActivitySent || turnSignal.aborted) return;
            modelResponseActivitySent = true;
            sendEvent('step', {
              content: 'Model is responding; verifying the answer before display…',
              phase: 'model_active',
            });
          },
          onReasoningActivity: () => {
            if (reasoningActivitySent || turnSignal.aborted) return;
            reasoningActivitySent = true;
            sendEvent('step', { content: 'Thinking through your request…' });
          },
          onRetry: (notice: string) => {
            const content = notice.trim();
            if (content) sendEvent('step', { content });
          },
          onToken: (token: string) => {
            if (firstTokenAt === null) firstTokenAt = performance.now();
            if (token.length > 0 && !modelActivitySent && !turnSignal.aborted) {
              modelActivitySent = true;
              sendEvent('step', {
                content: 'Writing the answer…',
                phase: 'model_streaming',
              });
            }
            bufferedAgentTokens.push(token);
          },
          onGiveUp: (giveUpMessage: string) => {
            // Steal #9 T3 — the tiered loop-guard aborted the run after a
            // critical failure streak. Surface the give-up copy as a step so the
            // client sees it immediately (it is also the loop's final content).
            sendEvent('step', { content: giveUpMessage });
          },
          onToolUse: (name: string, input: Record<string, unknown>) => {
            toolActivity.recordUse(
              name,
              externalToolNames.has(name) || !EXPLICIT_READ_ONLY_TOOL_NAMES.has(name),
            );
            // Send human-readable step description + raw tool event
            const disclosedInput = name === 'search_memory'
              && explicitReadOnlyToolChoice === 'search_memory'
              && boundedExactPersistedMemoryLookup
              ? {}
              : input;
            const stepText = describeToolUseSafe(name, disclosedInput);
            sendEvent('step', { content: stepText });
            sendEvent('tool', { name, input: disclosedInput });
            // Waggle Dance: emit tool call signal
          emitWaggleSignal({ type: 'tool:called', workspaceId: executionScopeId, content: `${name}(${retainedTurnJson(disclosedInput).slice(0, 100)})` });
            // Track start time for duration calculation
            toolActivity.startTimer(name);
          // F2: Audit trail — log tool call
          emitAuditEvent(server, {
            workspaceId: executionScopeId,
              eventType: 'tool_call',
              toolName: name,
              input: retainedTurnJson(disclosedInput),
              sessionId,
              model: resolvedModel,
            });
          },
          onToolResult: (name: string, input: Record<string, unknown>, result: string) => {
            const isBoundedExactMemoryResult = name === 'search_memory'
              && explicitReadOnlyToolChoice === 'search_memory'
              && boundedExactPersistedMemoryLookup;
            const isError = isBoundedExactMemoryResult && boundedExactMemoryExecutionOutcome
              ? boundedExactMemoryExecutionOutcome.status === 'failure'
              : name === 'read_file' && explicitReadOnlyToolChoice === 'read_file'
              ? directReadFileExecutionOutcome === null
                || directReadFileExecutionOutcome.isError
                || directReadFileExecutionOutcome.content !== result
              : isReportedToolFailure(result);
            const duration = toolActivity.recordResult(name, result, isError);

            const boundedExactMemoryResultSummary = isBoundedExactMemoryResult && !isError
              ? boundedExactMemoryExecutionOutcome?.status === 'no-match'
                ? 'No reliable matching value was found in this workspace.'
                : 'Found one matching value in this workspace.'
              : null;

            // Send tool_result SSE event so client can update status + show result
            if (name === 'acquire_capability') {
              if (createPersistedCapabilityReceipt(input, result)) {
                pendingCapabilityToolResults.push({ input, output: result, duration });
              } else {
                sendEvent('tool_result', {
                  name,
                  result: stripCapabilityRequestMarker(result),
                  duration,
                  isError,
                });
              }
            } else {
              const disclosedResult = boundedExactMemoryResultSummary ?? result;
              sendEvent('tool_result', { name, result: disclosedResult, duration, isError });
            }
          // F2: Audit trail — log tool result (truncated output)
          const auditedResult = boundedExactMemoryResultSummary ?? result;
          emitAuditEvent(server, {
            workspaceId: executionScopeId,
              eventType: 'tool_result',
              toolName: name,
              output: retainedTurnText(auditedResult).length > 2000
                ? retainedTurnText(auditedResult).slice(0, 2000) + '...[truncated]'
                : retainedTurnText(auditedResult),
              sessionId,
            });

            applyToolResultSideEffects({
              server,
              executionScopeId,
              activeExecutionWorkspaceId,
              sessionId,
              retention,
              sendEvent,
              name,
              input,
              result,
              isError,
            });
          },
        };

        // ── Credential pool: resolve API key with round-robin ──
        // Extract provider name from model ID (e.g., "anthropic" from "claude-sonnet-4-6")
        // NOTE: the credential pool injects a *provider* key (e.g. sk-ant-…). That is
        // correct only on the direct-provider path (anthropic-proxy / openai-compat).
        // When routing THROUGH LiteLLM, every request must use the LiteLLM master key —
        // LiteLLM holds the real provider keys internally and validates any *other* key
        // as a virtual key against its DB, returning "No connected db." (no_db_connection)
        // when no DB is attached. So skip the pool entirely on the LiteLLM path.
        const usingLiteLLM = server.agentState.llmProvider?.provider === 'litellm';
        const providerName = resolvedModel.startsWith('claude') ? 'anthropic' : resolvedModel.split('/')[0] ?? 'anthropic';
        const credPool = usingLiteLLM ? undefined : getCredentialPool(providerName);
        const poolKey = credPool?.getKey();
        const effectiveApiKey = poolKey ?? server.agentState.litellmApiKey;

        // ── Start execution trace (self-evolution substrate) ──
        // Taken from the composition root, not built here (CA-5). Still read
        // defensively so unit tests with no decorator (legacy suites) pass.
        // Started on the hoisted `turnTrace` so the outer catch can finalize
        // with outcome='abandoned' on any exception path (H-07 G4 fix).
        // This operational audit trail is intentionally retained for
        // bounded/read-only turns; it is not learned memory or a user-work
        // mutation.
        turnTrace.start(server.traceRecorder ?? null, {
          sessionId,
          personaId: activePersonaId,
          workspaceId: effectiveWorkspace ?? null,
          model: resolvedModel,
          input: retainedTurnText(message),
        });

        // #4: route locally-selected Ollama models to Ollama's OpenAI-compatible
        // endpoint instead of LiteLLM (graceful degradation / sovereignty story).
        // The sidecar reaches Ollama directly (as it does for embeddings) — no
        // Docker->host hop, no API key. Strip the 'ollama/' routing prefix to the
        // bare tag Ollama expects (e.g. "llama3.2:latest").
        const isOllamaModel = resolvedModel.startsWith('ollama/');
        const ollamaUrl = (process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434') + '/v1';

        const runConfig: typeof agentConfig = {
          ...agentConfig,
          ...(isOllamaModel ? { litellmUrl: ollamaUrl, model: resolvedModel.slice('ollama/'.length) } : {}),
          litellmApiKey: effectiveApiKey,
          modelSpendTraceId: turnTrace.id,
          ...(retention.allowDerivedPersistence && turnTrace.recording
            ? { traceRecording: turnTrace.recording }
            : {}),
          // AI-OS Phase 3 — skill diffusion. When the D1 closed
          // learning loop fires, broadcast a skill_share signal on
          // the v2 bus so MCP-consuming external tools can adopt
          // the soon-to-be-authored skill. Failures are swallowed
          // upstream (agent-loop wraps in try/catch).
          onSkillDistillationFire: retention.allowDerivedPersistence && server.signalBus
            ? async ({ patternKey, toolsUsed, directive }) => {
                const signalBus = server.signalBus;
                if (!signalBus) return;
                const now = new Date();
                signalBus.record({
                  id: `skill-share-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
            teamId: executionScopeId,
                  senderId: `agent-loop:${activePersonaId ?? 'agent'}`,
                  type: 'broadcast',
                  subtype: 'skill_share',
                  content: {
                    tool: 'waggle-agent',
                    patternKey,
                    toolsUsed: [...toolsUsed],
                    directive,
                    sessionId,
                    workspaceId: effectiveWorkspace ?? null,
                  },
                  referenceId: null,
                  routing: null,
                  createdAt: now,
                });
              }
            : undefined,
        };

        const configForModelAttempt = async (
          logicalModel: string,
          apiKey = effectiveApiKey,
        ): Promise<typeof runConfig> => {
          const useOllama = logicalModel.trim().toLowerCase().startsWith('ollama/');
          const systemPromptForAttempt = rebuildSystemPromptForModel
            ? await rebuildSystemPromptForModel(logicalModel)
            : runConfig.systemPrompt;
          throwIfTurnAborted();
          systemPrompt = systemPromptForAttempt;
          return {
            ...runConfig,
            systemPrompt: systemPromptForAttempt,
            model: useOllama ? logicalModel.slice('ollama/'.length) : logicalModel,
            billingModel: logicalModel,
            modelSpendBillingClass: isOfflineOllamaModelReference(logicalModel)
              || isExactConfiguredKeylessCompatibleModel(server, logicalModel)
              ? 'free'
              : 'priced',
            litellmUrl: useOllama ? ollamaUrl : getLitellmUrl(),
            litellmApiKey: apiKey,
            modelOperationTimeoutMs: 100_000,
            initialModelActivityTimeoutMs: undefined,
            reasoning: reasoningForModelAttempt(logicalModel),
          };
        };

        let announcedModelSwitchKey: string | null = null;
        const announceModelSwitch = (attemptModel: string) => {
          if (!modelSwitchReason) return;
          const switchKey = `${attemptModel}\u0000${modelSwitchReason}`;
          if (announcedModelSwitchKey === switchKey) return;
          announcedModelSwitchKey = switchKey;
          sendEvent('model_switch', { model: attemptModel, reason: modelSwitchReason, primary: primaryModel });
          sendEvent('step', { content: `⬡ Switched to ${attemptModel} — ${modelSwitchReason}` });
        };

        let initialActivityDeadlineAvailable = true;
        const runAgentAttempt = async (config: typeof runConfig) => {
          toolActivity.assertReplayable();
          bufferedAgentTokens = [];
          capabilityReceipt = null;
          pendingCapabilityToolResults = [];
          const attemptModel = config.billingModel ?? resolvedModel;
          usageLedger.beginAttempt(attemptModel, config.modelSpendBillingClass ?? 'priced');
          announceModelSwitch(attemptModel);
          const { toolChoice: _staleToolChoice, ...attemptBaseConfig } = config;
          const initialModelActivityTimeoutMs = initialActivityDeadlineAvailable
            ? attemptBaseConfig.initialModelActivityTimeoutMs
            : undefined;
          initialActivityDeadlineAvailable = false;
          const strictToolRetryContext = toolActivity.strictContinuation(agentMessage);
          let attemptedResult: AgentResponse;
          if (!modelRequestSent && !turnSignal.aborted) {
            modelRequestSent = true;
            sendEvent('step', {
              content: 'Sending your request to the model…',
              phase: 'model_requested',
            });
          }
          try {
            attemptedResult = await agentRunner({
              ...attemptBaseConfig,
              initialModelActivityTimeoutMs,
              ...(toolActivity.pendingExplicitToolChoice
                ? { toolChoice: toolActivity.pendingExplicitToolChoice }
                : explicitReadOnlyToolChoice
                  ? {
                      tools: [],
                      ...(strictToolRetryContext
                        ? {
                            systemPrompt: `${attemptBaseConfig.systemPrompt}\n\n# COMPLETED READ-ONLY TOOL CONTINUATION\nThe requested tool already ran exactly once. No tools remain available; synthesize only from the bounded result in the current messages.`,
                            messages: [...attemptBaseConfig.messages, strictToolRetryContext],
                          }
                        : {}),
                    }
                  : {}),
            });
          } catch (error) {
            const failedUsage = getFailedCompletionUsage(error);
            const failedTools = (error as { toolsUsed?: unknown } | null | undefined)?.toolsUsed;
            if (Array.isArray(failedTools)) {
              for (const tool of failedTools) {
                if (typeof tool === 'string' && tool.trim()) failedAttemptToolsUsed.add(tool.trim());
              }
            }
            usageLedger.recordFailedAttempt(failedUsage, {
              estimated: (error as { usageEstimated?: unknown }).usageEstimated === true,
            });
            throw error;
          }
          if (turnSignal.aborted) {
            usageLedger.completeAttempt(attemptedResult.usage, resolvedModel);
            throwIfTurnAborted();
          }
          toolActivity.assertCompleted();
          const completedResult = explicitReadOnlyToolChoice === 'read_file'
            && directReadFileDirective.kind === 'valid'
            && toolActivity.explicitToolResult !== null
            ? {
                ...attemptedResult,
                content: formatDirectReadFileResponse(
                  directReadFileDirective,
                  toolActivity.explicitToolResult,
                ),
              }
            : explicitReadOnlyToolChoice === 'search_memory'
              && boundedExactPersistedMemoryLookup
              && toolActivity.explicitToolResult !== null
              ? {
                  ...attemptedResult,
                  content: toolActivity.explicitToolResult,
                }
            : attemptedResult;
          if (!completedResult.content.trim()) {
            const emptyError = emptyModelResponseError(completedResult);
            for (const tool of completedResult.toolsUsed) failedAttemptToolsUsed.add(tool);
            // `emptyModelResponseError` builds the error here and never marks it
            // estimated, so this attempt is always a counted one.
            usageLedger.recordFailedAttempt(getFailedCompletionUsage(emptyError));
            throw emptyError;
          }
          return strictToolRetryContext
            ? {
                ...completedResult,
                toolsUsed: Array.from(new Set([
                  ...(explicitReadOnlyToolChoice ? [explicitReadOnlyToolChoice] : []),
                  ...completedResult.toolsUsed,
                ])),
              }
            : completedResult;
        };

        const runModelFallbackChain = async (
          initialError: unknown,
          allowNonRetryableConfiguredFallback = false,
        ) => {
          if (toolActivity.replayBlocked) throw initialError;
          // The agent may already have executed tools before detecting a
          // truncated final completion. Replaying the whole run on another
          // model would repeat those side effects, so this signal is terminal.
          if (isIncompleteCompletionError(initialError)
            || isTerminalEmptyModelResponse(initialError)
            || isTerminalModelBudgetError(initialError)) {
            throw initialError;
          }
          let failure = initialError;
          let failedBudgetModel: string | null = null;

          if (budgetModelSelected && resolvedModel !== primaryModel) {
            failedBudgetModel = resolvedModel;
            try {
              resolvedModel = await resolveUsableModel(server, primaryModel);
              budgetModelSelected = false;
              modelSwitchReason = `${failedBudgetModel} failed; primary selected`;
            } catch (primaryResolutionError) {
              failure = primaryResolutionError;
              budgetModelSelected = false;
              if (!fallbackModel || fallbackModel === failedBudgetModel) throw failure;
              resolvedModel = await resolveUsableModel(server, fallbackModel);
              modelSwitchReason = `${failedBudgetModel} failed and ${primaryModel} unavailable; configured fallback selected`;
              return await runAgentAttempt(await configForModelAttempt(resolvedModel));
            }

            try {
              return await runAgentAttempt(await configForModelAttempt(resolvedModel));
            } catch (primaryRunError) {
              if (toolActivity.replayBlocked) throw primaryRunError;
              if (isIncompleteCompletionError(primaryRunError)
                || isTerminalEmptyModelResponse(primaryRunError)
                || isTerminalModelBudgetError(primaryRunError)) {
                throw primaryRunError;
              }
              failure = primaryRunError;
            }
          }

          if ((allowNonRetryableConfiguredFallback || isRetryableError(failure))
            && fallbackModel
            && fallbackModel !== failedBudgetModel
            && resolvedModel !== fallbackModel) {
            const failedModel = resolvedModel;
            resolvedModel = await resolveUsableModel(server, fallbackModel);
            modelSwitchReason = `${failedModel} failed (${(failure as { status?: number }).status ?? 'timeout'}); configured fallback selected`;
            return await runAgentAttempt(await configForModelAttempt(resolvedModel));
          }

          throw failure;
        };

        const primaryAttemptStartedAt = performance.now();
        const runPrimaryWithSafeInterruptedRetry = async (): Promise<AgentResponse> => {
          try {
            return await runAgentAttempt(runConfig);
          } catch (error) {
            const failedUsage = getFailedCompletionUsage(error);
            const consumedTokens = (failedUsage?.inputTokens ?? 0) + (failedUsage?.outputTokens ?? 0);
            const remainingTokenBudget = runConfig.maxTokenBudget === undefined
              ? 0
              : Math.floor(runConfig.maxTokenBudget - consumedTokens);
            const remainingModelTimeMs = runConfig.modelOperationTimeoutMs === undefined
              ? 0
              : Math.floor(runConfig.modelOperationTimeoutMs - (performance.now() - primaryAttemptStartedAt));
            const canReplayWithoutSideEffects = isRetryableStreamInterruption(error)
              && runConfig.tools.length === 0
              && !budgetModelSelected
              && !toolActivity.replayBlocked
              && !toolActivity.explicitToolWasUsed
              && remainingTokenBudget > 0
              && remainingModelTimeMs > 0;
            if (!canReplayWithoutSideEffects) throw error;
            sendEvent('step', {
              content: 'Model response was interrupted — retrying once on the same model.',
            });
            return await runAgentAttempt({
              ...runConfig,
              maxTokenBudget: remainingTokenBudget,
              modelOperationTimeoutMs: remainingModelTimeMs,
              ...(runConfig.initialModelActivityTimeoutMs === undefined
                ? {}
                : { initialModelActivityTimeoutMs: Math.min(
                    runConfig.initialModelActivityTimeoutMs,
                    remainingModelTimeMs,
                  ) }),
            });
          }
        };

        // ── Run agent with credential pool + fallback chain ──
        let result: AgentResponse;
        const agentStartedAt = performance.now();
        let agentLatencyMs = 0;
        try {
          result = await runPrimaryWithSafeInterruptedRetry();
          // Report success to credential pool
          if (credPool && poolKey) credPool.reportSuccess(poolKey);
        } catch (primaryErr) {
          if (turnSignal.aborted) throw primaryErr;
          if (toolActivity.replayBlocked) throw primaryErr;
          if (toolActivity.explicitToolWasUsed && toolActivity.explicitToolResult === null) {
            throw primaryErr;
          }
          if (isIncompleteCompletionError(primaryErr)
            || isTerminalEmptyModelResponse(primaryErr)
            || isTerminalModelBudgetError(primaryErr)) {
            throw primaryErr;
          }
          // Report error to credential pool and try next key
          if (credPool && poolKey && !isEmptyModelResponseError(primaryErr)) {
            let failedKey = poolKey;
            let credentialError = primaryErr;
            let credentialResult: AgentResponse | null = null;
            let poolExhausted = false;

            for (let failureIndex = 0; failureIndex < credPool.size; failureIndex++) {
              const errorStatus = extractStatusCode(credentialError);
              if (!errorStatus) break;

              const keyName = credPool.getNameForKey(failedKey) ?? failedKey;
              const hasMore = credPool.reportError(
                failedKey,
                errorStatus,
                (credentialError as Error).message,
              );
              log.warn(`[credential-pool] Key ${keyName} failed (${errorStatus}), cooldown applied. More keys: ${hasMore}`);

              if (!hasMore || failureIndex === credPool.size - 1) {
                poolExhausted = true;
                break;
              }

              const nextKey = credPool.getKey();
              if (!nextKey) {
                poolExhausted = true;
                break;
              }
              sendEvent('step', { content: `API key rotated — retrying with next credential` });
              try {
                credentialResult = await runAgentAttempt({ ...runConfig, litellmApiKey: nextKey });
                credPool.reportSuccess(nextKey);
                break;
              } catch (nextCredentialError) {
                if (turnSignal.aborted) throw nextCredentialError;
                if (toolActivity.replayBlocked) {
                  throw nextCredentialError;
                }
                if (isEmptyModelResponseError(nextCredentialError)) {
                  credentialError = nextCredentialError;
                  break;
                }
                if (isIncompleteCompletionError(nextCredentialError)
                  || isTerminalModelBudgetError(nextCredentialError)) {
                  throw nextCredentialError;
                }
                failedKey = nextKey;
                credentialError = nextCredentialError;
              }
            }

            result = credentialResult
              ?? await runModelFallbackChain(credentialError, poolExhausted);
          } else {
            result = await runModelFallbackChain(primaryErr);
          }
        } finally {
          agentLatencyMs = Math.max(0, Math.round(performance.now() - agentStartedAt));
        }

        // The model response is complete, but proposal resolution below can
        // still be interrupted. Preserve usage before any further awaited work.
        result = {
          ...result,
          toolsUsed: [...new Set([...failedAttemptToolsUsed, ...(result.toolsUsed ?? [])])],
        };
        usageLedger.completeAttempt(result.usage, resolvedModel);

        const capabilityToolResults = pendingCapabilityToolResults as Array<{
          input: Record<string, unknown>;
          output: string;
          duration?: number;
        }>;
        for (const capabilityToolResult of capabilityToolResults) {
          const issued = await issueCapabilityProposalFromToolResult({
            store: server.capabilityProposalStore,
            workspaceId: activeWorkspaceId,
            sessionId,
            output: capabilityToolResult.output,
            resolveIdentity: (packageId) => resolveMarketplaceApprovalIdentity(server, packageId),
          });
          // Marketplace output is proposal-bound; bundled starter-pack output
          // remains a trusted completed receipt without marketplace lifecycle.
          capabilityReceipt = createPersistedCapabilityReceipt(
            capabilityToolResult.input,
            issued.output,
          ) ?? capabilityReceipt;
          sendEvent('tool_result', {
            name: 'acquire_capability',
            result: issued.output,
            duration: capabilityToolResult.duration,
            isError: false,
          });
          throwIfTurnAborted();
        }
        pendingCapabilityToolResults = [];

        // Track iteration and inject budget pressure
        iterBudget.tick();
        const budgetPressure = iterBudget.getPressureMessage();
        if (budgetPressure) {
          sendEvent('step', { content: budgetPressure.trim() });
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

        // L-17 C3: per-session token accumulation for /api/fleet visibility.
        // costTracker is per-workspace cost; sessionManager holds per-session
        // token totals that persist for the life of the active session.
        accountWorkspaceSessionTokens(
          usageLedger.total.inputTokens + usageLedger.total.outputTokens,
        );
        usageLedger.markAccounted();

        // M8: commit deferred signal markings now that model call succeeded
        if (!hasCustomRunner && retention.allowDerivedPersistence) sessionOrch.commitSurfacedSignals();

        // ── R1 closed learning loop: deterministic skill distillation ──
        // Hermes parity (premium-harness D1). The runtime — not just the
        // behavioral-spec prose — detects a successful ≥5-tool turn and
        // surfaces the distillation directive, so the agent reliably authors
        // a reusable skill via its own create_skill tool. R2-gated end to
        // end: a refusal / self-incapacity turn yields no plan. The signal
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
                } catch {
                  // Duplicate or schema error — skip silently
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
                if (!dismissedCaptureSuggestions.has(patternKey)) {
                  sendEvent('notification', {
                    type: 'workflow_captured',
                    title: captureResult.notification?.title ?? 'Pattern detected',
                    message: captureResult.notification?.message ?? captureResult.reason,
                    pattern: captureResult.pattern,
                  });
                  log.info(`[auto-skill] Suggested capture: ${patternKey}`);
                }
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

        // IMP-004: Contextual cron suggestion — nudge user about /schedule when response discusses recurring work
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
          model: resolvedModel,
          ...(capabilityReceipt ? { tools: [capabilityReceipt] } : {}),
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
          model: usageLedger.attemptModel ?? resolvedModel,
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
        const finalTokenChunks = bufferedAgentTokens.join('') === finalContent
          ? bufferedAgentTokens
          : finalContent ? [finalContent] : [];
        for (const token of finalTokenChunks) {
          sendEvent('token', { content: token });
        }
        bufferedAgentTokens = [];

        // Send the done event with full response + model info + per-message cost
        const messageCost = result.usage ? resultCost : undefined;
        const doneAt = performance.now();
        sendEvent('done', {
          content: finalContent,
          usage: turnUsage,
          usageEstimated: usageLedger.isEstimated,
          toolsUsed: result.toolsUsed,
          model: resolvedModel,
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
        responseCommitted = true;

      // Waggle Dance: emit agent completion signal
      try {
        emitWaggleSignal({
          type: 'agent:completed',
          workspaceId: executionScopeId,
            content: `Completed: ${(result.toolsUsed ?? []).length} tools used, ${turnUsage.outputTokens} tokens`,
            metadata: { model: resolvedModel, toolsUsed: result.toolsUsed, cost: messageCost },
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
                ? `${resolvedModel} · ${toolCount} tool${toolCount === 1 ? '' : 's'} used`
                : `${resolvedModel} · response ready`,
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
                // PR3.5 frame↔trace backlink — link auto-saved frames to the
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
              }
            }
          }
        }
      }
    } catch (err) {
      if (responseCommitted) {
        log.warn('[chat] post-commit observer failed after the response was already delivered', {
          workspaceId: activeWorkspaceId,
          sessionId: activeSessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!raw.destroyed && !raw.writableEnded) raw.end();
        return;
      }
      const failedCompletionUsage = getFailedCompletionUsage(err);
      const abortedErrorUsage = turnSignal.aborted
        ? getBillableUsage((err as { usage?: unknown } | null | undefined)?.usage)
        : null;
      const billableAttemptReceipts = [
        ...usageLedger.receipts,
      ];
      const recordedAttemptUsage = billableAttemptReceipts.length > 0
        ? billableAttemptReceipts.reduce((total, receipt) => ({
            inputTokens: total.inputTokens + receipt.usage.inputTokens,
            outputTokens: total.outputTokens + receipt.usage.outputTokens,
          }), { inputTokens: 0, outputTokens: 0 })
        : null;
      const billableFailureUsage = recordedAttemptUsage
        ?? failedCompletionUsage
        ?? abortedErrorUsage
        ?? (turnSignal.aborted ? usageLedger.abortedAttemptUsage : null);
      let failureCostUsd: number | undefined;
      if (billableFailureUsage && usageLedger.attemptModel) {
        try {
          const accountingReceipts = billableAttemptReceipts.length > 0
            ? billableAttemptReceipts
            : [{
                model: usageLedger.attemptModel,
                billingClass: usageLedger.attemptBillingClass,
                usage: billableFailureUsage,
              }];
          failureCostUsd = accountingReceipts.reduce((total, receipt) => (
            total + costTracker.calculateUsageCost({
              model: receipt.model,
              input: receipt.usage.inputTokens,
              output: receipt.usage.outputTokens,
              billingClass: receipt.billingClass,
            })
          ), 0);
          if (!usageLedger.isAccounted && hasCustomRunner) {
            for (const receipt of accountingReceipts) {
              costTracker.addUsage(
                receipt.model,
                receipt.usage.inputTokens,
                receipt.usage.outputTokens,
                activeExecutionWorkspaceId ?? PERSONAL_CHAT_SCOPE_ID,
                { billingClass: receipt.billingClass },
              );
            }
          }
          if (!usageLedger.isAccounted) {
            accountWorkspaceSessionTokens(
              billableFailureUsage.inputTokens + billableFailureUsage.outputTokens,
            );
          }
        } catch (accountingError) {
          log.warn(
            '[chat] incomplete completion usage accounting failed:',
            accountingError instanceof Error ? accountingError.message : String(accountingError),
          );
        }
      }
      // H-07 G4: finalize aborted trace so the evolution dataset builder can
      // mine it as a negative example. Without this the row stays 'pending'
      // and GEPA never sees it — starving the loop of counterexamples.
      turnTrace.finalizeOnce(() => {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          outcome: 'abandoned',
          output: '',
          model: usageLedger.attemptModel ?? undefined,
          tokens: billableFailureUsage ? {
            input: billableFailureUsage.inputTokens,
            output: billableFailureUsage.outputTokens,
          } : undefined,
          costUsd: failureCostUsd,
          ...(!turnSignal.aborted && {
            correctionFeedback: retainedTurnText(errMsg).slice(0, 500),
          }),
        };
      });
      // A user Stop/client disconnect is not an assistant answer or generation
      // failure. Keep the already-persisted user turn, but never fabricate an
      // authoritative assistant/error turn from partial work.
      if (turnSignal.aborted) {
        log.info(`[chat] turn ${turnId} cancelled by client or workspace lifecycle`);
        if (!raw.destroyed && !raw.writableEnded) raw.end();
        return;
      }
      // Everything past the abort check is a real failure, and it is about to
      // be turned into a user-facing sentence and forgotten. The post-commit
      // branch at the top of this catch logs its error; this path never did, so
      // a failure that matched none of the classifications below left the user
      // holding a raw message and the server holding no record of it at all
      // (TD-CHAT-15). The stack goes to the log and only to the log.
      log.error('[chat] turn failed before the response was committed', {
        workspaceId: activeWorkspaceId,
        sessionId: activeSessionId,
        turnId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });

      // Send user-friendly error event — never show raw traces
      let errorMessage: string;
      if (err instanceof Error) {
        // Clean up common error messages for the user. Authentication and
        // endpoint availability are different recovery paths: never send a
        // user to API-key settings when a local/OpenAI-compatible endpoint is
        // simply down or restarting.
        if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          errorMessage = 'API key is invalid or expired. Update it in Settings > API Keys.';
        } else if (
          /ECONNREFUSED|fetch failed|ENETUNREACH|EHOSTUNREACH|socket hang up/i.test(err.message)
          || /Could not reach (?:the )?(?:AI )?model endpoint/i.test(err.message)
          || /Server error retry cap exceeded (?:\(\d+ consecutive (?:502|503|504) errors\)|after \d+ retries \(latest (?:502|503|504)\))/i.test(err.message)
        ) {
          errorMessage = 'The model endpoint is not responding. It may be down or restarting. Check Settings > Models, then try again.';
        } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
          errorMessage = 'The request timed out. The model may be overloaded — try again in a moment.';
        } else if (err.message.includes('context_length') || err.message.includes('too many tokens')) {
          errorMessage = 'The conversation is too long for the model. Try clearing the chat and starting fresh.';
        } else {
          errorMessage = err.message;
        }
      } else {
        errorMessage = 'Something went wrong. Try sending your message again.';
      }
      // Send clean error to user — don't leak raw recalled context (contains system prompt instructions)
      const budgetCode = isTerminalModelBudgetError(err)
        ? (err as { code: string }).code
        : undefined;
      sendEvent('error', { message: errorMessage, ...(budgetCode ? { code: budgetCode } : {}) });

      // Persist the assistant-side failure as a real conversation turn. The UI
      // already shows the SSE error while the stream is live, but without this
      // saved message a refresh or /api/history call loses the assistant outcome
      // and the next turn lacks the failure context.
      if (activeHistory && activeWorkspaceId && activeSessionId) {
        const assistantError = `${GENERATION_FAILED_PREFIX}${errorMessage}`;
        try {
          activeHistory.push({ role: 'assistant', content: assistantError });
          persistMessage(sessionPersistenceDataDir, activeWorkspaceId, activeSessionId, {
            role: 'assistant',
            content: assistantError,
          });
        } catch (persistErr) {
          log.warn('[chat] assistant error persistence failed:', persistErr instanceof Error ? persistErr.message : String(persistErr));
        }
      }

      // #3 (launch-blocker): memory capture MUST NOT depend on generation
      // success. On the happy path the write-back at ~L1410 captures the
      // exchange; when the model call fails that never runs, so the user's
      // turn would be lost from memory ("remembers everything" broken). Persist
      // the raw turn directly here — NOT via the conservative pattern-write-back
      // (which may extract nothing) — so it's recallable (keyword half of
      // HybridSearch now; embedded on the next cognify/distill pass). The 8-char
      // floor skips trivial acks ("ok", "thanks"). Best-effort: a persistence
      // failure must never mask the original error or break the SSE stream.
      // Gated by the resolved persistence policy for automated, bounded, and
      // persona-read-only turns. Persisting one of those prompts here as a
      // 'user_stated' frame would bypass the happy-path memory boundary.
      if (activeSessionOrch && retention.allowMemoryPersistence && message.trim().length >= 8) {
        try {
          const workspaceMind = usesNamedWorkspace
            ? server.agentState.getWorkspaceMindDb(historyWorkspaceId)
            : null;
          if (usesNamedWorkspace && !workspaceMind) {
            throw new Error('Authorized workspace memory is unavailable');
          }
          const frames = workspaceMind
            ? new FrameStore(workspaceMind)
            : activeSessionOrch.getFrames();
          const sessions = workspaceMind
            ? new SessionStore(workspaceMind)
            : activeSessionOrch.getSessions();
          const active = sessions.getActive();
          const gopId = active.length > 0 ? active[0].gop_id : sessions.create().gop_id;
          const latestI = frames.getLatestIFrame(gopId);
          if (latestI) frames.createPFrame(gopId, message, latestI.id, 'normal', 'user_stated');
          else frames.createIFrame(gopId, message, 'normal', 'user_stated');
          log.info('[chat] persisted raw user turn to memory despite generation failure');
        } catch (persistErr) {
          log.warn('[chat] raw-turn persistence on error path failed:', persistErr instanceof Error ? persistErr.message : String(persistErr));
        }
      }
    } finally {
      // Workspace turn scope, chat runtime, both mind pins, and — defensively,
      // for every path the happy-path `unhookTools()` did not reach — the
      // pre:tool hook. Released in that order; see `TurnResources`.
      await turnResources.releaseHeld();
      // H-07 G4: defensive trace finalization. Catches SSE-disconnect and any
      // exotic exit path where the outer catch didn't run. Outcome stays
      // 'abandoned' because we don't know if the agent produced a usable
      // output — the correction-detector can upgrade it later if appropriate.
      turnTrace.finalizeOnce(() => ({
        outcome: 'abandoned',
        output: retainedTurnText(''),
        model: usageLedger.attemptModel ?? undefined,
      }));
      activeChatTurns.delete(activeSessionStateKey);
      pruneRetainedSessionState();
      // End the SSE stream before releasing the exact workspace generation.
      // This lives inside the outer finally so post-commit early returns and
      // observer failures cannot leak the activity lease.
      try {
        if (!raw.destroyed && !raw.writableEnded) raw.end();
      } finally {
        workspaceSessionActivity?.release();
      }
    }
  });

  // DELETE /api/chat/history — clear session history AND all per-session in-process state.
  // Review Major #6: previously only sessionHistories was evicted. The other Maps
  // (systemPromptCache, compressionSummaries, sessionToolSequences) grew unbounded
  // across the sidecar's lifetime, compounding in heavy-use instances.
  server.delete<{
    Querystring: { session?: string; workspace?: string };
  }>('/api/chat/history', async (request, reply) => {
    const sessionId = request.query.session ?? 'default';
    const workspaceId = request.query.workspace;
    assertSafeSegment(sessionId, 'session');
    if (workspaceId) assertSafeSegment(workspaceId, 'workspace');

    const historyTarget = resolveChatHistoryTarget(
      server.localConfig.dataDir,
      workspaceId,
      !!server.workspaceManager?.get('default'),
    );
    const historyWorkspaceId = historyTarget.workspaceId;
    if (historyWorkspaceId === 'default') {
      const currentChatHistoryLayout = getChatHistoryLayout();
      if (currentChatHistoryLayout.status === 'recovery-required') {
        return reply.status(409).send({
          error: 'Default chat history needs recovery before it can be cleared.',
          code: currentChatHistoryLayout.code,
        });
      }
    }
    const scopedStateKey = chatSessionStateKey(
      historyTarget.stateWorkspaceId,
      sessionId,
    );
    if (
      activeChatTurns.has(scopedStateKey)
      || (!workspaceId && activeChatTurns.has(sessionId))
    ) {
      return reply.status(409).send({
        error: 'Cannot clear history while this session has an active turn.',
        code: 'SESSION_TURN_IN_PROGRESS',
      });
    }

    fs.rmSync(
      path.join(
        historyTarget.dataDir,
        'workspaces',
        historyWorkspaceId,
        'sessions',
        `${sessionId}.jsonl`,
      ),
      { force: true },
    );

    evictStateKey(scopedStateKey);
    if (!workspaceId) evictStateKey(sessionId);

    if (
      historyTarget.isManagedWorkspace
      || historyWorkspaceId !== 'default'
    ) {
      const workspaceSession = server.sessionManager.get(historyWorkspaceId);
      if (workspaceSession) {
        chatRuntimes.get(workspaceSession)?.delete(sessionId);
      }
    }
    return reply.send({ ok: true, cleared: sessionId });
  });
};
