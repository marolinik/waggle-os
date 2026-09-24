import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '../logger.js';
const log = createLogger('chat');
import { COMMAND_CONTEXT_SENTINEL, MEMORY_RECALL_UNAVAILABLE_TEXT, runAgentLoop, recordCapabilityGap, lintMemoryWrite, formatTrustSummary, scanForInjection, AGENT_LOOP_REROUTE_PREFIX, routeMessage, CredentialPool, loadCredentialPool, isBoundedSingleFileRoundTrip, generateTurnId, logTurnEvent, READONLY_TOOLS, type ToolDefinition } from '@waggle/agent';
import type { AgentLoopConfig, AgentResponse, Orchestrator, AutonomyLevel, HookRegistry } from '@waggle/agent';
import type {
  WorkspaceSession,
  WorkspaceSessionActivityLease,
} from '../workspace-sessions.js';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt, PERSONAL_COMMAND_WORKSPACE_LABEL } from './workspace-context.js';
import { formatWorkspaceStatePrompt } from '../workspace-state.js';
import { validateOrigin } from '../cors-config.js';
import { listPersonas, BEHAVIORAL_SPEC, detectTaskShape, isClosedWorldRewriteRequest, type AssembledPrompt } from '@waggle/agent';

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

// Slash commands in the personal scope see PERSONAL_COMMAND_WORKSPACE_LABEL,
// deliberately not PERSONAL_CHAT_SCOPE_ID: that sentinel names the
// audit/collaboration stream and must never reach a prompt as a workspace.

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

/** Per-word pacing when a canned reply is streamed: slash-command output. */
const COMMAND_REPLY_WORD_DELAY_MS = 10;
/** Per-word pacing for the "No AI model is ready" setup reply. */
const SETUP_REQUIRED_REPLY_WORD_DELAY_MS = 15;

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
 * personal turn, in which case commands see `PERSONAL_COMMAND_WORKSPACE_LABEL`.
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
    workspaceId: executionWorkspaceId ?? PERSONAL_COMMAND_WORKSPACE_LABEL,
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
 * the chat consumer was reading the wrong function. See
 * docs/GEPA-SCOPE-AUDIT-2026-04-30.md.
 */
function resolvePersona(id: string) {
  return listPersonas().find(p => p.id === id) ?? null;
}
import { WaggleConfig } from '@waggle/core';

// ── Extracted modules ──────────────────────────────────────────────────
import { actionableMemoryDirectiveText, allowsConversationHistory, allowsPersistedMemoryRead, allowsPostResponseDecoration, canUseBudgetModelWithoutCloudEgress, classifyExplicitTurnMutationPolicy, isExplicitToolFreeAdvisoryRequest, primeMemoryDirectiveClassifier, resolveExplicitPersistedMemoryReadDirective, resolveTurnPersistencePermissions, type TurnContextScope, type TurnMutationPolicy } from './chat-helpers.js';
import {
  chatSessionStateKey,
  isChatSessionStateKeyForWorkspace,
  isolateLegacyDefaultChatSessions,
  registerChatHistoryRestoreParticipant,
  resolveChatHistoryTarget,
  persistMessage,
  loadSessionMessages,
  replaceRetryTailWithUser,
  retryTailMatches,
  stripTrailingFailedPair,
  type RetryTailExpectation,
} from './chat-persistence.js';
import { MAX_CONTEXT_MESSAGES, buildSkillPromptSection } from './chat-context.js';
import {
  behavioralRulesForPromptPackage,
  composeClosedWorldChatPrompt,
  composeEvidenceBoundedChatPrompt,
  composeStrictReadOnlyToolChatPrompt,
  composeStrictReadOnlyToolSequenceChatPrompt,
  composeToolFreeAdvisoryChatPrompt,
  composeChatPromptTail,
  type ChatPromptPackageMode,
} from './chat-prompt-packaging.js';
import { applyPersonaToolFilter, filterMcpToolsForPersona, selectToolsForTurn } from '../persona-tool-filter.js';
import { assertSafeSegment } from './validate.js';
import {
  canonicalizeModelReference,
  resolveUsableModel,
} from '../model-availability.js';
import { resolveWorkspaceExecutionRoot } from '../workspace-execution-root.js';
import type { WorkspaceTurnScope } from '../workspace-turn-coordinator.js';
import { getResolvedChatWorkspaceId } from '../security-middleware.js';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import {
  EXPLICIT_READ_ONLY_TOOL_NAMES,
  isBoundedExactPersistedMemoryLookup,
  isDecisionMatrixSkillRequest,
  isExplicitExternalResearchRequest,
  isExplicitMemorySaveRequest,
  resolveExplicitReadOnlyToolChoice,
  shouldUsePersistedMemoryForTurn,
  resolveApprovalTimeoutPolicy,
  resolveChatAncestry,
  type ApprovalTimeoutPolicy,
} from './chat-turn-policy.js';

// ── Re-exports for backwards compatibility ─────────────────────────────
// These were originally exported from chat.ts and are consumed by tests and other packages.
export { shouldPackageSystemPromptForTurn } from './chat-turn-preparation.js';
export {
  bindExactWorkspaceMemorySearchTool,
  boundDirectReadFilePathsMatch,
  formatDirectReadFileResponse,
  parseDirectReadFileDirective,
  type DirectReadFileDirective,
} from './chat-bounded-read-tools.js';
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
import { resolvePersonalFilesRoot } from '../storage/index.js';
import { TurnUsageLedger } from './chat-turn-usage-ledger.js';
import { TurnExecutionTrace } from './chat-turn-execution-trace.js';
import { TurnRecalledContext } from './chat-turn-recall-context.js';
import { NON_RETAINED_TURN_CONTENT, TurnRetention } from './chat-turn-retention.js';
import { SSE_MAX_BUFFERED_BYTES, writeSseEvent } from './chat-sse.js';
import { prepareAgentTurn } from './chat-turn-preparation.js';
import {
  WARNING_TIER_DIRECT_READ_FILE_INTENT_RE,
  formatDirectReadFileResponse,
  parseDirectReadFileDirective,
} from './chat-bounded-read-tools.js';
import { createModelHealthProbe } from './chat-model-health.js';
import { TurnModelSelection } from './chat-turn-model-selection.js';
import { TurnResources } from './chat-turn-resources.js';
import { PERSONAL_CHAT_SCOPE_ID } from './chat-scope.js';
import { handleTurnFailure } from './chat-turn-failure.js';
import { runAgentTurn } from './chat-agent-run.js';
import { completeTurnResponse, runPostCommitEnrichment, type TurnCompletionTurn } from './chat-turn-completion.js';

export type AgentRunner = (config: AgentLoopConfig) => Promise<AgentResponse>;


export const chatRoutes: FastifyPluginAsync = async (server) => {
  primeMemoryDirectiveClassifier();
  const probeModelHealth = createModelHealthProbe();
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

  // Register pre:memory-write validation hook — flags dramatic claims
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

// Cache the base system prompt per session to avoid rebuilding on every message
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

  // Profile cache: a fs.readFileSync on every buildSystemPrompt call would
  // block the Node event loop on every concurrent SSE request. Load once per mtime change,
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
  // Frame id of each session's persisted compaction summary — later
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

  // Auto skill capture: track tool sequences per session
  const sessionToolSequences = new Map<string, string[][]>();
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
  // workspace layers reflected in the prompt.
  // Accepts an optional `personaOverride` so different chat windows
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
     * When PROMPT_ASSEMBLER is on, the caller pre-fetches a structured
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
    // When PromptAssembler is on, swap in the structured assembled prompt
    // — adds Identity + Persona + State + Recent + Memory sections via the
    // sixth-layer assembler. Wrapper-only profile, runtime, workspace, active
    // behavioral, and correction context is layered below.
    // Supply the durable "why" (project ← workspace name) before the
    // orchestrator renders its system prompt. Empty ancestry self-suppresses.
    if (includePersistedMemory) {
      orch.setGoalAncestry(resolveChatAncestry(server, workspaceId));
    }
    prompt += assembled?.system
      ?? (includePersistedMemory ? orch.buildSystemPrompt(selectedModel, availableTools) : '');

    // Inject user profile context (cached by mtime in `loadProfile`, no sync I/O per turn)
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
- Working directory: ${workspacePath ?? resolvePersonalFilesRoot(server.localConfig.dataDir)}
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

    // Inject actionable correction signals — user corrections from prior sessions
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

    if (volatileTail) {
      prompt += volatileTail;
    }

    // Add persona only on the legacy path; assembler-owned persona
    // content stays singular. DOCX guidance always applies; persisted workspace
    // tone is withheld when the user disables memory reads for this turn.
    const workspaceTone = includePersistedMemory ? wsConfig?.tone : undefined;
    const activePersona = activePersonaId ? resolvePersona(activePersonaId) : null;
    prompt = composeChatPromptTail(prompt, {
      persona: activePersona,
      workspaceTone,
      assembled: assembled ?? null,
    });

    // Cache the built prompt — only when there's no per-turn assembler
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
       * Tiered autonomy override, resolved by `resolveAutonomyLevel` at the
       * top of the handler. When absent or 'normal', the
       * existing gate applies. 'trusted' or 'yolo' relax the gate per the
       * rules in needsConfirmationWithAutonomy.
       * `expiresAt` is a client-supplied deadline — if set and in the past,
       * the server falls back to 'normal' for safety.
       */
      autonomy?: { level: AutonomyLevel; expiresAt?: number };
      /**
       * Set by a client Retry after a failed turn. Drops the previously
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
       * Automation-origin memory write-back gate. Set ONLY by
       * headless/automated callers (idle-watcher review turns, scheduled
       * loops) — an automated turn re-analyzes existing transcripts, so its
       * post-response write-back (auto-save, skill distillation, KG
       * extraction, correction detection) would pollute memory with
       * re-detected "decisions" and false correction signals. IM channel
       * adapters must NOT set this: inbound IM messages are real user turns.
       */
      origin?: 'automation' | 'router';
      /**
       * Originating IM channel of this turn (real platform + chatId).
       * Set only by ChannelManager.handleInbound via the loopback client —
       * published as the request-scoped turn origin so create_schedule can
       * stamp ai_task delivery targets from a trusted snapshot.
       */
      channel?: { platform: string; chatId: string };
    };
  }>('/api/chat', async (request, reply) => {
    const totalServerStartedAt = performance.now();
    let firstTokenAt: number | null = null;
    const markFirstToken = (): void => {
      if (firstTokenAt === null) firstTokenAt = performance.now();
    };

    // Accept both 'workspace' and 'workspaceId' for backwards compat (P0-4).
    // `persona` is an optional per-window override — takes precedence
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
    // Automated turns skip the post-response memory write-back seams
    // below. `proposeHeld` is belt-and-braces — the shipped idle-watcher
    // already sets it, so its review turns are gated even without `origin`.
    // Compliance execution traces stay ungated. Learned memory, improvement
    // signals, and skill capture are gated below by the resolved turn policy.
    const isAutomatedTurn = origin === 'automation' || !!proposeHeldTurn;

    // Resolve the effective autonomy level for this request (the request
    // body's `autonomy` field documents the levels and the expiry fallback).
    const autonomyLevel = resolveAutonomyLevel(autonomyRaw);

    // Generate per-turn trace ID at the conceptual turn boundary
    // (POST /api/chat entry). Propagated explicitly into agent-loop,
    // orchestrator, retrieval, prompt-assembler, cognify, and each tool
    // call. Every stage logs a structured event tagged with this turnId
    // so the full turn graph is reconstructable from a single correlation
    // key. Also satisfies EU AI Act Art. 14 traceability requirements (H-AUDIT-1).
    const turnId = generateTurnId();
    logTurnEvent(turnId, {
      stage: 'chat.turn.start',
      workspace: executionWorkspaceId,
      model,
      messageChars: (message ?? '').length,
    });

    // Resolve workspace directory — use explicit path, workspace config, or virtual storage
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
      // Flags NOT included in the client response — the scanner's
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

    // Viewer RBAC runs before reply.hijack() — after hijack,
    // reply.status(403) silently no-ops and the client gets HTTP 200 + empty SSE stream.
    if (workspaceConfig?.teamId && workspaceConfig?.teamRole === 'viewer') {
        return reply.status(403).send({
          error: 'Viewers cannot send messages in team workspaces. Ask a team admin to upgrade your role.',
          code: 'VIEWER_READ_ONLY',
        });
    }

    // Request-supplied paths stay anchored to dataDir.
    // A workspace directory loaded from persisted config is an explicit user
    // trust grant and was canonicalized by resolveWorkspaceExecutionRoot above.
    // A trusted config also makes the request's own path irrelevant, and that
    // path is ignored (pinned in chat-api). Otherwise the body's
    // `workspacePath` is checked even when the branch above did not adopt it,
    // so the answer depends on the request, not on which workspace the session
    // happens to have active (TD-CHAT-44).
    const requestSuppliedPaths = workspacePathFromTrustedConfig ? [] : [
      ...(workspacePath ? [workspacePath] : []),
      ...(typeof explicitWorkspacePath === 'string' && explicitWorkspacePath && explicitWorkspacePath !== workspacePath
        ? [explicitWorkspacePath]
        : []),
    ];
    for (const candidate of requestSuppliedPaths) {
      const resolved = path.resolve(candidate);
      const allowed = path.resolve(server.localConfig.dataDir);
      if (resolved !== allowed && !resolved.startsWith(allowed + path.sep)) {
        log.warn(`[security] Path traversal attempt blocked: ${candidate}`);
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
      if (!writeSseEvent(raw, event, data)) {
        log.warn('[chat] SSE reader stopped reading; closed the stream and aborted the turn', {
          maxBufferedBytes: SSE_MAX_BUFFERED_BYTES,
        });
      }
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

    // Rerouted message from slash command processing — set by the
    // AGENT_LOOP_REROUTE_PREFIX branch of the command dispatch, read by
    // `hasReroute`/`agentMessage` and the last-user-message swap before the loop.
    let reroutedMessage: string | undefined;

    // The turn's releasable resources are held here so the outer finally's
    // `turnResources.releaseHeld()` can always clean up. The happy path's
    // `turnResources.unhookTools()` alone would leave every exception path
    // leaking the pre:tool hook into the shared hookRegistry, causing ghost
    // confirmation prompts on every subsequent request with closures pointing
    // at dead sockets.
    const turnResources = new TurnResources();
    let requestHookRegistry: HookRegistry | undefined;

    // Hoisted so the outer catch and the outer finally can finalize
    // aborted/errored traces with outcome='abandoned' through
    // `turnTrace.finalizeOnce`. Without this, a failed turn leaves its row in
    // the 'pending' state and EvalDatasetBuilder skips it, starving the
    // evolution loop of negative examples.
    const turnTrace = new TurnExecutionTrace({
      onStartError: (error) => {
        log.warn('[chat] execution trace could not start; the turn runs untraced', {
          workspaceId: executionScopeId,
          error,
        });
      },
      onFinalizeError: (error, traceId) => {
        log.warn('[chat] execution trace finalize failed; the row stays unfinalized', {
          workspaceId: executionScopeId,
          traceId,
          error,
        });
      },
    });

    // Hoist the resolved orchestrator so the outer catch's raw-turn capture
    // can persist the user turn even when generation fails. Memory capture
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
            executionWorkspacePath ?? resolvePersonalFilesRoot(server.localConfig.dataDir),
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
          executionWorkspacePath ?? resolvePersonalFilesRoot(server.localConfig.dataDir),
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

      // Viewer RBAC already ran before reply.hijack(), in the `VIEWER_READ_ONLY` check.

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

      // Legacy retry-dedup: older clients only identified failed turns. Drop
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
      const resolvedLocalOllama = modelSelection.model.toLowerCase().startsWith('ollama/');
      let modelAvailable = hasCustomRunner || resolvedLocalOllama; // trust injected runners and verified local models
      if (!hasCustomRunner && !resolvedLocalOllama) {
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

      // Streams a canned assistant reply word by word, persists it unless the
      // turn denies conversation history, and emits the terminal `done` event.
      // Resolves false when the turn was aborted before `done` was sent.
      // Does not end the stream: the caller owns `raw.end()`. The two
      // slash-command callers call it; the setup-required caller
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

      // ── Slash command routing (works even when no model is ready) ──
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

        // Check if the command wants to be re-processed through the agent loop
        if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && modelAvailable) {
          // Extract the rewritten message and fall through to agent loop processing
          const rerouted = cmdResult.slice(AGENT_LOOP_REROUTE_PREFIX.length);
          sendEvent('step', { content: `Processing /${message.trim().split(/\s+/)[0].slice(1)} via AI...` });
          // Replace the message in history with the original slash command (already persisted)
          // and process the rewritten message through the agent loop below
          // We achieve this by NOT returning here — the code falls through to the agent loop
          // with the rerouted message replacing the original
          reroutedMessage = rerouted;
        } else if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && !modelAvailable) {
          const cmdName = message.trim().split(/\s+/)[0];
          const friendlyError = `**${cmdName} requires AI** — This command needs a working LLM connection.\n\nConfigure an API key in Settings > API Keys, then try again.`;
          if (!(await streamCannedReply(friendlyError, COMMAND_REPLY_WORD_DELAY_MS))) return;
          if (!raw.destroyed && !raw.writableEnded) raw.end();
          return; // explicit terminal — don't fall through to agent loop
        } else {
          // Stream the command result as SSE tokens and persist it
          if (!(await streamCannedReply(cmdResult, COMMAND_REPLY_WORD_DELAY_MS))) return;
          if (!raw.destroyed && !raw.writableEnded) raw.end();
          return; // explicit terminal — don't fall through to agent loop
        }
      }

      // Check if a slash command requested agent-loop rerouting.
      // A reroute is the command asking for the loop, whatever its body says;
      // reading the body as a boolean let an empty one end the turn with no
      // answer and no done (TD-CHAT-25).
      const hasReroute = reroutedMessage !== undefined;
      const shouldRunAgentLoop = hasReroute || (!isSlashCommand && modelAvailable);
      const shouldReplySetupRequired = !hasReroute && !isSlashCommand && !modelAvailable;

      if (shouldReplySetupRequired) {
        // Setup-required mode — respond without pretending the user's input
        // was answered. The raw turn is still persisted for continuity.
        const setupRequiredReply = '**No AI model is ready.**\n\nConfigure a provider key in Settings > API Keys, or install and verify a local model in Settings > Models, then try again.';
        // Persist the setup-required reply so session continuity is maintained
        if (!(await streamCannedReply(setupRequiredReply, SETUP_REQUIRED_REPLY_WORD_DELAY_MS))) return;
      }

      if (shouldRunAgentLoop) {
        // Use rerouted message if from a slash command, otherwise use original
        // An empty rerouted body gives the loop nothing to answer, so it gets
        // the user's own command instead.
        const agentMessage = reroutedMessage || message;
        const closedWorldRewrite = requestClosedWorldRewrite
          || isClosedWorldRewriteRequest(agentMessage);

        const turnPreparation = await prepareAgentTurn({
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
        });
        const {
          activePersonaId,
          packageMode,
          selectorLatencyMs,
          toolCatalogCount,
          toolEligibleCount,
          toolOmittedCount,
          toolSelectedCount,
          transmittedToolSchemaChars,
        } = turnPreparation;

        const { result, agentLatencyMs, systemPrompt, attemptState } = await runAgentTurn({
          server, sendEvent, throwIfTurnAborted, turnSignal, markFirstToken, turnId, message,
          agentMessage, sessionId, executionScopeId, effectiveWorkspace, activeExecutionWorkspaceId,
          agentRunner, costTracker, getLitellmUrl, getCredentialPool, modelSelection, resolveModel,
          hasDistinctConfiguredFallback, boundedExactPersistedMemoryLookup, directReadFileDirective,
          requestHookRegistry, retention, retainedTurnText, retainedTurnJson, turnTrace, usageLedger,
          turnPreparation,
        });

        const completionTurn: TurnCompletionTurn = {
          server, sendEvent, throwIfTurnAborted, attemptState, usageLedger, modelSelection,
          turnResources, turnRecall, turnTrace, retention, turnMutationPolicy, costTracker, sessionOrch,
          hasCustomRunner, isAutomatedTurn, message, history, sessionId, sessionStateKey,
          sessionToolSequences, sessionPersistenceDataDir, activeWorkspaceId,
          activeSessionStateWorkspaceId, effectiveWorkspace, executionScopeId, activePersonaId,
          personaOverride, resolvePersona, accountWorkspaceSessionTokens, retainedTurnText,
          toolCatalogCount, toolEligibleCount, toolSelectedCount, toolOmittedCount,
          transmittedToolSchemaChars, systemPrompt, packageMode, selectorLatencyMs, agentLatencyMs,
          totalServerStartedAt, getFirstTokenAt: () => firstTokenAt,
        };
        const completion = await completeTurnResponse(completionTurn, result);
        responseCommitted = true;

        await runPostCommitEnrichment(completionTurn, completion);
      }
    } catch (err) {
      handleTurnFailure({
        server, raw, sendEvent, turnSignal, responseCommitted, turnId, message,
        usageLedger, costTracker, turnTrace, retention, hasCustomRunner,
        usesNamedWorkspace, historyWorkspaceId, activeWorkspaceId, activeSessionId,
        activeExecutionWorkspaceId, sessionPersistenceDataDir, activeHistory,
        activeSessionOrch, accountWorkspaceSessionTokens, retainedTurnText,
      }, err);
    } finally {
      // Workspace turn scope, chat runtime, both mind pins, and — defensively,
      // for every path the happy-path `unhookTools()` did not reach — the
      // pre:tool hook. Released in that order; see `TurnResources`.
      await turnResources.releaseHeld();
      // Defensive finalization of the hoisted `turnTrace`. Catches SSE-disconnect and any
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
  // Every per-session Map is evicted, not only sessionHistories: the others
  // (systemPromptCache, compressionSummaries, sessionToolSequences) would grow
  // unbounded across the sidecar's lifetime, compounding in heavy-use instances.
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
      // A Windows indexer or antivirus can hold the file for a moment; Node
      // retries EBUSY/EPERM here instead of failing the request with a 500
      // (TD-REL-5). A lasting failure still throws before any state is evicted,
      // so the file and the in-process history stay in step.
      { force: true, maxRetries: 10, retryDelay: 50 },
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
