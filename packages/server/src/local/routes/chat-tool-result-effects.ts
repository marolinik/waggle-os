/**
 * Chat Tool-Result Effects — what a finished tool call leaves behind outside
 * the model's context.
 *
 * Extract Method on the tail of the chat handler's `onToolResult` callback
 * (TD-CHAT-3). Three effects follow every tool result, in this order: a
 * generated Office/PDF file is indexed into the workspace Library, a
 * file-writing tool announces `file_created`, and a `save_memory` in a team
 * workspace is pushed to the team server. None of them reads or writes the
 * callback's turn-tracking state, which is why they can leave the handler
 * while the rest of the callback stays.
 *
 * The block is moved verbatim; only its indentation changed. The handler
 * values it read are the fields of `ToolResultEffect`, bound once under the
 * same names.
 */
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { TeamSync, WaggleConfig } from '@waggle/core';
import type { ArtifactKind } from '@waggle/shared';
import { createLogger } from '../logger.js';
import { getBoundTeamServer } from '../team-server-binding.js';
import { fetchTeamServer } from '../team-server-egress.js';
import { addArtifact, patchArtifactInWorkspace, readArtifactIndex } from './artifact-index.js';
import { readableText } from './chat-helpers.js';
import type { TurnRetention } from './chat-turn-retention.js';

// Same logger name as the handler, so these warnings keep their source.
const log = createLogger('chat');

const GENERATED_ARTIFACT_TO_LIBRARY: Record<string, {
  kind: ArtifactKind;
  mimeType: string;
  pathKey: 'path' | 'filePath';
}> = {
  generate_docx: {
    kind: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pathKey: 'path',
  },
  generate_pdf: { kind: 'document', mimeType: 'application/pdf', pathKey: 'filePath' },
  generate_xlsx: {
    kind: 'spreadsheet',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pathKey: 'filePath',
  },
  generate_pptx: {
    kind: 'presentation',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pathKey: 'filePath',
  },
};

/** One finished tool call, and the turn values its effects read. */
export interface ToolResultEffect {
  server: FastifyInstance;
  executionScopeId: string;
  activeExecutionWorkspaceId: string | undefined;
  sessionId: string;
  retention: TurnRetention;
  sendEvent: (event: string, data: unknown) => void;
  name: string;
  input: Record<string, unknown>;
  result: string;
  isError: boolean;
}

/** Runs the Library, `file_created` and TeamSync effects of one tool result. */
export function applyToolResultSideEffects(effect: ToolResultEffect): void {
  const {
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
  } = effect;
    // Make generated Office/PDF outcomes discoverable in both the live
    // chat and the persistent Library. Regeneration updates the same
    // storage-path card instead of creating duplicates.
    const generatedArtifact = GENERATED_ARTIFACT_TO_LIBRARY[name];
    const generatedPath = generatedArtifact
      ? String(input[generatedArtifact.pathKey] ?? '').trim()
      : '';
    // A turn with no active workspace has no Library to index into.
    // `executionScopeId` falls back to the `personal::default`
    // sentinel, which is a scope id and not a path segment, and the
    // index joins it into `dataDir/workspaces/<id>/artifacts.json`:
    // POSIX writes a file no reader can ever reach (`/api/artifacts`
    // rejects the sentinel through `assertSafeSegment`, and
    // `workspaceIds()` enumerates real workspaces only), Windows throws
    // ENOENT on the `:` into a swallowing catch. Skipping is what the
    // sentinel already means here, and it keeps a non-path value out of
    // a path-joining interface rather than teaching that interface a
    // second id namespace (TD-CHAT-34, founder ruling F7). The
    // generated file itself is still written and still disclosed.
    if (generatedArtifact && generatedPath && !isError && activeExecutionWorkspaceId) {
      const title = String(input.title ?? path.basename(generatedPath, path.extname(generatedPath))).trim();
      const artifactInput = {
        title: title || path.basename(generatedPath),
        kind: generatedArtifact.kind,
        source: 'agent',
        createdBy: 'Waggle AI',
        status: 'draft' as const,
        mimeType: generatedArtifact.mimeType,
        storagePath: generatedPath,
        ...(sessionId ? { relatedSessionIds: [sessionId] } : {}),
      };
      try {
        const existing = readArtifactIndex(server.localConfig.dataDir, executionScopeId)
          .find(artifact => artifact.storagePath === generatedPath);
        if (existing) {
          patchArtifactInWorkspace(
            server.localConfig.dataDir,
            executionScopeId,
            existing.id,
            artifactInput,
          );
        } else {
          addArtifact(server.localConfig.dataDir, executionScopeId, artifactInput);
        }
      } catch (error) {
        log.warn('[chat] could not index generated artifact:', error);
      }
    }

    // Emit file_created events for file-writing tools
    const fileTools: Record<string, 'write' | 'edit' | 'generate'> = {
      write_file: 'write',
      edit_file: 'edit',
      generate_docx: 'generate',
      generate_pdf: 'generate',
      generate_xlsx: 'generate',
      generate_pptx: 'generate',
    };
    const fileAction = fileTools[name];
    const filePathInput = input.path ?? input.filePath;
    if (fileAction && filePathInput && !isError) {
      // The path is model-supplied and may not be coercible. A
      // disclosure must never end the turn, and a `file_created` naming
      // an unreadable path would assert something we cannot state, so
      // the event is dropped rather than faked (TD-CHAT-36).
      const filePath = readableText(filePathInput);
      if (filePath !== undefined) sendEvent('file_created', { filePath, fileAction });
    }

  // TeamSync push — after save_memory in team workspace (fire-and-forget)
  if (retention.allowMemoryPersistence && name === 'save_memory' && !result.startsWith('Error')) {
    const pushWsConfig = activeExecutionWorkspaceId
      ? server.workspaceManager?.get(activeExecutionWorkspaceId)
      : undefined;
      if (pushWsConfig?.teamId) {
        try {
          const waggleConfig = new WaggleConfig(server.localConfig.dataDir);
          const teamServer = getBoundTeamServer(pushWsConfig.teamServerUrl, waggleConfig.getTeamServer());
          if (teamServer?.token) {
            const sync = new TeamSync({
              teamServerUrl: teamServer.url,
              teamSlug: pushWsConfig.teamId,
              authToken: teamServer.token,
              userId: teamServer.userId ?? 'local-user',
              displayName: teamServer.displayName ?? 'You',
            }, fetchTeamServer);
            // Fire-and-forget push — non-blocking
            sync.pushFrame({
              id: Date.now(),
              gop_id: sessionId,
              t: 0,
              frame_type: 'I',
              base_frame_id: null,
              content: typeof result === 'string' ? result.slice(0, 500) : '',
              importance: 'normal',
              source: 'agent_inferred',
              access_count: 0,
              created_at: new Date().toISOString(),
              last_accessed: new Date().toISOString(),
            }).catch(err => log.warn('[waggle] TeamSync push failed:', err.message));
          }
        } catch { /* TeamSync not available */ }
      }
    }
}
