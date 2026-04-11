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
import type { Orchestrator } from '@waggle/agent';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt } from './workspace-context.js';

export const commandRoutes: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: { command: string; workspaceId?: string };
  }>('/api/commands/execute', async (request, reply) => {
    const { command, workspaceId } = request.body;
    if (!command) {
      return reply.status(400).send({ error: 'command is required' });
    }

    const { commandRegistry, orchestrator } = server.agentState;
    const effectiveWorkspaceId = workspaceId ?? 'default';

    // Phase A.1 migration: build a per-request orchestrator scoped to this
    // workspace so slash commands never collide with in-flight chat sessions
    // via the shared orchestrator singleton. If no workspace is set, fall
    // back to the shared orchestrator (personal mind only).
    let commandOrch: Orchestrator = orchestrator;
    if (workspaceId && workspaceId !== 'default') {
      // Prefer an existing chat session's orchestrator if one is open —
      // matches the workspace mind the user is actively editing.
      const existing = server.sessionManager.get(workspaceId);
      if (existing) {
        commandOrch = existing.orchestrator;
      } else {
        const mind = server.agentState.getWorkspaceMindDb(workspaceId);
        if (mind) {
          commandOrch = server.agentState.createSessionOrchestrator(mind);
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
          if (recall.count === 0) return 'No relevant memories found.';
          const items = (recall.recalled ?? []).slice(0, 5);
          return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
        } catch {
          return 'Memory search unavailable.';
        }
      },

      getWorkspaceState: async (): Promise<string> => {
        const block = buildWorkspaceNowBlock({
          dataDir: server.localConfig.dataDir,
          workspaceId: effectiveWorkspaceId,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
          cronSchedules: server.cronStore.list(),
        });
        if (!block) return 'No workspace state available.';
        return formatWorkspaceNowPrompt(block);
      },

      listSkills: (): string[] => {
        return server.agentState.skills.map(s => s.name);
      },

      // runWorkflow and spawnAgent are intentionally omitted —
      // they require LLM and full agent loop. Commands that need them
      // will return their "not available in this context" fallback.
    };

    const result = await commandRegistry.execute(command, context);
    return reply.send({ result, command });
  });
};
