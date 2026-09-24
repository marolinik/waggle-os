/**
 * The orchestrator and tool pool a chat turn runs on.
 *
 * Extract Method on the POST /api/chat handler (TD-CHAT-3 slice 16a), moved
 * verbatim. A named workspace takes an activity lease on its managed
 * session, joins the turn signal to that session's abort, pins the mind and
 * acquires the conversation's chat runtime; any other turn without an
 * injected runner builds a request-scoped runtime. Construction errors fail
 * closed. Three values are written back through callbacks the moment they
 * exist, because the handler reads them even when this throws midway: the
 * lease (the outer finally releases it), the joined signal (`sendEvent` and
 * the outer finally read it) and the orchestrator (the failure path's
 * raw-turn capture).
 */
import type { FastifyInstance } from 'fastify';
import type { Orchestrator, ToolDefinition } from '@waggle/agent';
import type { WorkspaceSession, WorkspaceSessionActivityLease } from '../workspace-sessions.js';
import type { WorkspaceTurnScope } from '../workspace-turn-coordinator.js';
import { resolvePersonalFilesRoot } from '../storage/index.js';
import { createLogger } from '../logger.js';
import type { TurnResources } from './chat-turn-resources.js';

const log = createLogger('chat');

/** The part of a conversation's chat runtime a turn uses. */
export interface AcquiredChatRuntime {
  orchestrator: Orchestrator;
  tools: ToolDefinition[];
}

export interface TurnSessionRuntimeInput<R extends AcquiredChatRuntime> {
  server: FastifyInstance;
  /** The shared orchestrator, kept when no runtime is built for the turn. */
  orchestrator: Orchestrator;
  hasCustomRunner: boolean;
  usesNamedWorkspace: boolean;
  authorizedWorkspace: string | null | undefined;
  effectiveWorkspace: string | undefined;
  sessionId: string;
  executionWorkspacePath: string | undefined;
  abortController: AbortController;
  /** The turn signal so far: the response side's abort only. */
  turnSignal: AbortSignal;
  turnResources: TurnResources;
  acquireChatRuntime: (
    workspaceSession: WorkspaceSession,
    sessionId: string,
    workspacePath: string,
    workspaceId: string,
  ) => R;
  releaseChatRuntime: (workspaceSession: WorkspaceSession, sessionId: string, runtime: R) => void;
  setWorkspaceSessionActivity: (lease: WorkspaceSessionActivityLease | undefined) => void;
  setTurnSignal: (signal: AbortSignal) => void;
  setActiveSessionOrch: (orchestrator: Orchestrator) => void;
}

export function acquireTurnSessionRuntime<R extends AcquiredChatRuntime>(input: TurnSessionRuntimeInput<R>) {
  const {
    server, orchestrator, hasCustomRunner, usesNamedWorkspace, authorizedWorkspace,
    effectiveWorkspace, sessionId, executionWorkspacePath, abortController, turnResources,
    acquireChatRuntime, releaseChatRuntime,
    setWorkspaceSessionActivity, setTurnSignal, setActiveSessionOrch,
  } = input;
  let { turnSignal } = input;
  let workspaceSessionActivity: WorkspaceSessionActivityLease | undefined;
  let workspaceTurnScope: WorkspaceTurnScope | undefined;

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
      setWorkspaceSessionActivity(workspaceSessionActivity);
      if (!workspaceSessionActivity) {
        throw new Error(`Workspace session is ${candidateSession.status}`);
      }
      const activeWorkspaceSession = workspaceSessionActivity.session;
      turnSignal = AbortSignal.any([
        abortController.signal,
        activeWorkspaceSession.abortController.signal,
      ]);
      setTurnSignal(turnSignal);
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
  setActiveSessionOrch(sessionOrch);
  if (!hasCustomRunner) {
    workspaceTurnScope = server.agentState.workspaceTurnCoordinator.createScope(
      executionWorkspacePath ?? resolvePersonalFilesRoot(server.localConfig.dataDir),
      turnSignal,
    );
    const heldScope = workspaceTurnScope;
    turnResources.holdTurnScope(() => heldScope.release());
  }

  return { sessionOrch, sessionTools, wsSession, workspaceTurnScope };
}
