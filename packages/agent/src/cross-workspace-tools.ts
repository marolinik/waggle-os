/**
 * Cross-workspace tools — Phase B.2 of the Killer Story plan.
 *
 * Gives the agent read-only access to OTHER workspaces' memory and files
 * so a chat running in Workspace A can surface prior decisions or files
 * from Workspace B. Writes are never allowed through this path —
 * cross-workspace writes require a separate, explicit flow.
 *
 * Every call is gated by the existing confirmation mechanism (the tools
 * are listed in ALWAYS_CONFIRM). The approvals inbox and persistent
 * "always allow" grants land in Phase B.3.
 */

import type { MindDB } from '@waggle/core';
import { HybridSearch } from '@waggle/core';
import type { ToolDefinition } from './tools.js';

export interface CrossWorkspaceToolDeps {
  /** The workspace this tool instance is running in (the "source"). */
  sourceWorkspaceId: string;
  /** Returns the MindDB for the requested workspace, or null if unknown / closed. */
  getMindForWorkspace: (workspaceId: string) => MindDB | null;
  /** Returns the list of known workspace IDs + display names (for discovery). */
  listWorkspaces: () => Array<{ id: string; name: string }>;
  /** Returns a file listing for the given workspace (workspace-scoped path). */
  listWorkspaceFiles?: (workspaceId: string, subPath?: string) => Promise<Array<{
    name: string;
    type: 'file' | 'directory';
    size?: number;
    modifiedAt?: string;
  }>>;
  /**
   * L-21: read a file from another workspace. Optional dependency — if not
   * wired, `read_other_workspace_file` surfaces a clear error instead of
   * failing silently. Resolves to file content as a UTF-8 string (callers
   * that need binary should extend this signature before wiring it).
   */
  readWorkspaceFile?: (workspaceId: string, relativePath: string) => Promise<string>;
  /** The embedder used for semantic search. */
  embedder: import('@waggle/core').Embedder;
}

export function createCrossWorkspaceTools(deps: CrossWorkspaceToolDeps): ToolDefinition[] {
  const { sourceWorkspaceId, getMindForWorkspace, listWorkspaces, listWorkspaceFiles, readWorkspaceFile, embedder } = deps;

  const readOtherWorkspace: ToolDefinition = {
    name: 'read_other_workspace',
    description: [
      'Search memory in another workspace. READ-ONLY — never writes.',
      'Use when the user references something they worked on in a different project.',
      'Requires the target workspace ID. Call list_workspaces first if unsure.',
      'Returns ranked memory frames with the target workspace explicitly named',
      'so you can cite the source clearly ("In Workspace B, you decided...").',
      'First use on a new target workspace prompts the user for approval.',
    ].join(' '),
    parameters: {
      type: 'object' as const,
      required: ['target_workspace_id', 'query'],
      properties: {
        target_workspace_id: {
          type: 'string' as const,
          description: 'The workspace ID to read from. Use list_workspaces to discover valid IDs.',
        },
        query: {
          type: 'string' as const,
          description: 'Natural-language search query. Semantic search over the target workspace memory.',
        },
        limit: {
          type: 'number' as const,
          description: 'Max results to return. Default 10, capped at 30.',
        },
      },
    },
    // Tagged as requiring confirmation — the confirmation gate reads
    // the tool name and triggers the approval hook.
    offlineCapable: false,
    execute: async (args: Record<string, unknown>) => {
      const targetId = String(args.target_workspace_id ?? '').trim();
      const query = String(args.query ?? '').trim();
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);

      if (!targetId) {
        return JSON.stringify({
          error: 'target_workspace_id is required',
          hint: 'Call list_workspaces to see valid IDs.',
        });
      }
      if (!query) {
        return JSON.stringify({ error: 'query is required' });
      }
      if (targetId === sourceWorkspaceId) {
        return JSON.stringify({
          error: 'Target workspace is the same as the source. Use search_memory instead.',
        });
      }

      const mind = getMindForWorkspace(targetId);
      if (!mind) {
        const known = listWorkspaces();
        return JSON.stringify({
          error: `Workspace "${targetId}" not found or not accessible.`,
          knownWorkspaces: known.map(w => ({ id: w.id, name: w.name })),
        });
      }

      try {
        const search = new HybridSearch(mind, embedder);
        const results = await search.search(query, { limit, profile: 'balanced' });
        const targetName = listWorkspaces().find(w => w.id === targetId)?.name ?? targetId;

        if (results.length === 0) {
          return JSON.stringify({
            sourceWorkspace: sourceWorkspaceId,
            targetWorkspace: targetId,
            targetWorkspaceName: targetName,
            query,
            matchCount: 0,
            hint: `No matches in workspace "${targetName}". Try broader terms.`,
          });
        }

        const matches = results.map(r => ({
          content: r.frame.content.slice(0, 500),
          importance: r.frame.importance,
          createdAt: r.frame.created_at,
          score: r.finalScore,
        }));

        return JSON.stringify({
          sourceWorkspace: sourceWorkspaceId,
          targetWorkspace: targetId,
          targetWorkspaceName: targetName,
          query,
          matchCount: matches.length,
          matches,
          citation: `(from workspace "${targetName}")`,
        });
      } catch (err) {
        return JSON.stringify({
          error: `Cross-workspace search failed: ${(err as Error).message}`,
        });
      }
    },
  };

  const listWorkspacesTool: ToolDefinition = {
    name: 'list_workspaces',
    description: [
      'List every workspace the user has, with their IDs and names.',
      'Use this for orientation before calling read_other_workspace or',
      'list_workspace_files when you\'re not sure which target ID to use.',
      'Read-only, no approval required, no cost.',
    ].join(' '),
    parameters: {
      type: 'object' as const,
      required: [],
      properties: {},
    },
    offlineCapable: true,
    execute: async () => {
      const workspaces = listWorkspaces();
      return JSON.stringify({
        sourceWorkspace: sourceWorkspaceId,
        count: workspaces.length,
        workspaces: workspaces.map(w => ({
          id: w.id,
          name: w.name,
          isCurrentWorkspace: w.id === sourceWorkspaceId,
        })),
      });
    },
  };

  const listWorkspaceFilesTool: ToolDefinition = {
    name: 'list_workspace_files',
    description: [
      'List files in ANOTHER workspace (read-only). Use to find documents',
      'or files referenced from elsewhere in the user\'s projects.',
      'First use on a new target workspace prompts the user for approval.',
    ].join(' '),
    parameters: {
      type: 'object' as const,
      required: ['target_workspace_id'],
      properties: {
        target_workspace_id: {
          type: 'string' as const,
          description: 'The workspace ID to list files in. Call list_workspaces to discover IDs.',
        },
        path: {
          type: 'string' as const,
          description: 'Optional sub-path within the workspace. Defaults to the root.',
        },
      },
    },
    offlineCapable: false,
    execute: async (args: Record<string, unknown>) => {
      const targetId = String(args.target_workspace_id ?? '').trim();
      const subPath = args.path ? String(args.path) : undefined;

      if (!targetId) {
        return JSON.stringify({ error: 'target_workspace_id is required' });
      }
      if (targetId === sourceWorkspaceId) {
        return JSON.stringify({
          error: 'Target workspace is the same as the source. Use search_files / read_file on local paths instead.',
        });
      }
      if (!listWorkspaceFiles) {
        return JSON.stringify({
          error: 'Cross-workspace file listing is not available (listWorkspaceFiles not wired).',
        });
      }

      try {
        const files = await listWorkspaceFiles(targetId, subPath);
        const targetName = listWorkspaces().find(w => w.id === targetId)?.name ?? targetId;
        return JSON.stringify({
          sourceWorkspace: sourceWorkspaceId,
          targetWorkspace: targetId,
          targetWorkspaceName: targetName,
          path: subPath ?? '/',
          fileCount: files.length,
          files: files.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            modifiedAt: f.modifiedAt,
          })),
        });
      } catch (err) {
        return JSON.stringify({
          error: `Cross-workspace file listing failed: ${(err as Error).message}`,
        });
      }
    },
  };

  // L-21: read_other_workspace_file. Read-only file access in another
  // workspace. Gated by the same confirmation pattern as the memory
  // reader (key = tool name, registered in ALWAYS_CONFIRM).
  const readOtherWorkspaceFile: ToolDefinition = {
    name: 'read_other_workspace_file',
    description: [
      'Read the contents of a file in ANOTHER workspace. READ-ONLY.',
      'Use after list_workspace_files has shown the file exists — paths',
      'are relative to the target workspace root.',
      'First use on a new target workspace prompts the user for approval.',
      'Returns the file as a UTF-8 string; binary files surface as a',
      'warning rather than raw bytes.',
    ].join(' '),
    parameters: {
      type: 'object' as const,
      required: ['target_workspace_id', 'path'],
      properties: {
        target_workspace_id: {
          type: 'string' as const,
          description: 'The workspace ID to read from. Call list_workspaces to discover IDs.',
        },
        path: {
          type: 'string' as const,
          description: 'Path relative to the target workspace root.',
        },
      },
    },
    offlineCapable: false,
    execute: async (args: Record<string, unknown>) => {
      const targetId = String(args.target_workspace_id ?? '').trim();
      const relativePath = String(args.path ?? '').trim();

      if (!targetId) {
        return JSON.stringify({
          error: 'target_workspace_id is required',
          hint: 'Call list_workspaces to see valid IDs.',
        });
      }
      if (!relativePath) {
        return JSON.stringify({
          error: 'path is required',
          hint: 'Call list_workspace_files to discover file paths first.',
        });
      }
      if (targetId === sourceWorkspaceId) {
        return JSON.stringify({
          error: 'Target workspace is the same as the source. Use read_file on a local path instead.',
        });
      }
      if (!readWorkspaceFile) {
        return JSON.stringify({
          error: 'Cross-workspace file reading is not available (readWorkspaceFile not wired).',
        });
      }

      try {
        const content = await readWorkspaceFile(targetId, relativePath);
        const targetName = listWorkspaces().find(w => w.id === targetId)?.name ?? targetId;
        // Cap at 100KB so a huge file doesn't blow the agent's context.
        const MAX_CHARS = 100_000;
        const truncated = content.length > MAX_CHARS;
        const body = truncated ? content.slice(0, MAX_CHARS) : content;
        return JSON.stringify({
          sourceWorkspace: sourceWorkspaceId,
          targetWorkspace: targetId,
          targetWorkspaceName: targetName,
          path: relativePath,
          size: content.length,
          truncated,
          content: body,
        });
      } catch (err) {
        return JSON.stringify({
          error: `Cross-workspace file read failed: ${(err as Error).message}`,
        });
      }
    },
  };

  return [readOtherWorkspace, listWorkspacesTool, listWorkspaceFilesTool, readOtherWorkspaceFile];
}
