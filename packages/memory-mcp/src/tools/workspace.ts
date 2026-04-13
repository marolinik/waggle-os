/**
 * Workspace tools — list_workspaces + create_workspace.
 * Wraps WorkspaceManager from @waggle/core.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getWorkspaceManager, getWorkspaceMind, getFrameStore, getKnowledgeGraph } from '../core/setup.js';

export function registerWorkspaceTools(server: McpServer): void {

  // ── list_workspaces ─────────────────────────────────────────────
  server.tool(
    'list_workspaces',
    'List all workspaces with their configuration and memory stats.',
    {},
    async () => {
      const wm = getWorkspaceManager();
      const workspaces = wm.list();

      // Get personal mind stats
      const personalFrameStore = getFrameStore();
      const personalKg = getKnowledgeGraph();
      const personalStats = personalFrameStore.getStats();
      const personalEntityCount = personalKg.getEntityCount();

      const result = {
        personal: {
          frames: personalStats.total,
          by_type: personalStats.byType,
          by_importance: personalStats.byImportance,
          entities: personalEntityCount,
        },
        workspaces: workspaces.map(ws => {
          // Try to get workspace mind stats (non-fatal if unavailable)
          let wsStats = { frames: 0, entities: 0 };
          try {
            const mind = getWorkspaceMind(ws.id);
            if (mind) {
              const fs = mind.frameStore.getStats();
              const ec = mind.knowledgeGraph.getEntityCount();
              wsStats = { frames: fs.total, entities: ec };
            }
          } catch { /* workspace mind not accessible */ }

          return {
            id: ws.id,
            name: ws.name,
            group: ws.group,
            created: ws.created,
            template: ws.templateId ?? null,
            persona: ws.personaId ?? null,
            ...wsStats,
          };
        }),
        default_workspace: wm.getDefault(),
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  // ── create_workspace ────────────────────────────────────────────
  server.tool(
    'create_workspace',
    'Create a new workspace with its own isolated memory mind.',
    {
      name: z.string().describe('Workspace name'),
      group: z.string().optional().describe('Group/category. Defaults to "general"'),
    },
    async ({ name, group }) => {
      const wm = getWorkspaceManager();
      const ws = wm.create({
        name,
        group: group ?? 'general',
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: ws.id,
            name: ws.name,
            group: ws.group,
            created: ws.created,
          }, null, 2),
        }],
      };
    },
  );
}
