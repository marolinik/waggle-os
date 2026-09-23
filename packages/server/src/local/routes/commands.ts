/**
 * Command execution route — thin surface that calls CommandRegistry with real CommandContext.
 *
 * POST /api/commands/execute
 * Body: { command: string, workspaceId?: string }
 *
 * Commands like /catchup, /status, /memory, /skills are wired to real runtime.
 * Workflow-dependent commands (/research, /plan, /spawn) return "not available"
 * because runWorkflow and spawnAgent require the full agent loop.
 */

import type { FastifyPluginAsync } from 'fastify';
import { COMMAND_CONTEXT_SENTINEL, MEMORY_RECALL_UNAVAILABLE_TEXT, type Orchestrator } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt, PERSONAL_COMMAND_WORKSPACE_LABEL } from './workspace-context.js';

export const commandRoutes: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: { command: string; workspaceId?: string };
  }>('/api/commands/execute', async (request, reply) => {
    const { command, workspaceId } = request.body;
    if (!command) {
      return reply.status(400).send({ error: 'command is required' });
    }

    const { commandRegistry, orchestrator } = server.agentState;
    // A workspace is in scope only when one is named, and the literal
    // 'default' only when a managed default exists, as in the chat route.
    // Otherwise the command runs on the personal orchestrator and reads no
    // other mind's state (TD-CHAT-35).
    const scopedWorkspaceId = workspaceId
      && (workspaceId !== 'default' || server.workspaceManager.get('default'))
      ? workspaceId
      : undefined;
    const effectiveWorkspaceId = scopedWorkspaceId ?? PERSONAL_COMMAND_WORKSPACE_LABEL;

    // Phase A.1 migration: build a per-request orchestrator scoped to this
    // workspace so slash commands never collide with in-flight chat sessions
    // via the shared orchestrator singleton. If no workspace is set, fall
    // back to the shared orchestrator (personal mind only).
    let commandOrch: Orchestrator = orchestrator;
    let releaseCommandWorkspace: (() => void) | undefined;
    if (scopedWorkspaceId) {
      if (!server.workspaceManager.get(scopedWorkspaceId)) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
      const existing = server.sessionManager.get(scopedWorkspaceId);
      if (existing) {
        const activity = server.sessionManager.acquireActivity(scopedWorkspaceId);
        if (!activity) {
          return reply.status(409).send({ error: 'Workspace session is not active' });
        }
        commandOrch = activity.session.orchestrator;
        releaseCommandWorkspace = activity.release;
      } else {
        const mindLease = server.mindCache.acquireLease(scopedWorkspaceId);
        releaseCommandWorkspace = mindLease.release;
        try {
          commandOrch = server.agentState.createSessionOrchestrator(mindLease.db);
        } catch (err) {
          mindLease.release();
          throw err;
        }
      }
    }

    // Build real CommandContext — wired to actual server/runtime implementations
    const context = {
      workspaceId: effectiveWorkspaceId,
      sessionId: 'command', // commands aren't session-bound

      searchMemory: async (query: string): Promise<string> => {
        try {
          const recall = await commandOrch.recallMemory(query);
          if (recall.count === 0) {
            // recallMemory reports its own failure as an empty result (TD-CHAT-29).
            return recall.text === MEMORY_RECALL_UNAVAILABLE_TEXT
              ? COMMAND_CONTEXT_SENTINEL.memorySearchUnavailable
              : COMMAND_CONTEXT_SENTINEL.noMemories;
          }
          const items = (recall.recalled ?? []).slice(0, 5);
          return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
        } catch {
          return COMMAND_CONTEXT_SENTINEL.memorySearchUnavailable;
        }
      },

      getWorkspaceState: async (): Promise<string> => {
        if (!scopedWorkspaceId) return COMMAND_CONTEXT_SENTINEL.noWorkspaceState;
        const block = buildWorkspaceNowBlock({
          dataDir: server.localConfig.dataDir,
          workspaceId: scopedWorkspaceId,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
          cronSchedules: server.cronStore.list(),
        });
        if (!block) return COMMAND_CONTEXT_SENTINEL.noWorkspaceState;
        return formatWorkspaceNowPrompt(block);
      },

      listSkills: (): string[] => {
        return server.agentState.skills.map(s => s.name);
      },

      getCliAllowlist: (): string[] => server.localConfig.cli?.allowlist ?? [],

      updateCliAllowlist: (action: 'allow' | 'deny', name: string) => {
        const current = server.localConfig.cli?.allowlist ?? [];
        const key = name.toLowerCase();
        const alreadyPresent = current.some(entry => entry.toLowerCase() === key);
        const next = action === 'allow'
          ? alreadyPresent ? current : [...current, name]
          : current.filter(entry => entry.toLowerCase() !== key);

        if (next.length !== current.length) {
          const config = new WaggleConfig(server.localConfig.dataDir);
          config.setCliAllowlist(next);
          config.save();
          server.localConfig.cli = { allowlist: config.getCliAllowlist() };
        }

        return {
          changed: next.length !== current.length,
          allowlist: server.localConfig.cli?.allowlist ?? [],
        };
      },

      // runWorkflow and spawnAgent are intentionally omitted —
      // they require LLM and full agent loop. Commands that need them
      // will return their "not available in this context" fallback.
    };

    try {
      const result = await commandRegistry.execute(command, context);
      return reply.send({ result, command });
    } finally {
      releaseCommandWorkspace?.();
    }
  });
};
