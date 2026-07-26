/**
 * chat-persistence.ts — Message persistence functions for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * These functions depend on `fs`, `path` — no server state.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';

const CHAT_SESSION_STATE_SEPARATOR = '\u0000';
const LEGACY_DEFAULT_CHAT_DIR = 'legacy-chat';
const MANAGED_DEFAULT_CHAT_STATE_ID = '\u0001managed-default';
const CHAT_HISTORY_LAYOUT_FILE = 'chat-history-layout.json';
const CHAT_HISTORY_LAYOUT_VERSION = 1;

export const CHAT_HISTORY_RECOVERY_CODE = 'CHAT_HISTORY_RECOVERY_REQUIRED';

export type ChatHistoryLayoutStatus =
  | { status: 'ready' }
  | {
      status: 'recovery-required';
      code: typeof CHAT_HISTORY_RECOVERY_CODE;
      reason: string;
    };

export function legacyDefaultChatDataDir(dataDir: string): string {
  return path.join(dataDir, LEGACY_DEFAULT_CHAT_DIR);
}

export function chatHistoryDataDir(
  dataDir: string,
  isManagedWorkspace: boolean,
): string {
  return isManagedWorkspace ? dataDir : legacyDefaultChatDataDir(dataDir);
}

export function chatHistoryStateWorkspaceId(
  workspaceId: string,
  isManagedWorkspace: boolean,
): string {
  return workspaceId === 'default' && isManagedWorkspace
    ? MANAGED_DEFAULT_CHAT_STATE_ID
    : workspaceId;
}

export interface ChatHistoryTarget {
  workspaceId: string;
  isManagedWorkspace: boolean;
  dataDir: string;
  stateWorkspaceId: string;
}

export function resolveChatHistoryTarget(
  dataDir: string,
  suppliedWorkspaceId: string | undefined,
  managedDefaultExists: boolean,
): ChatHistoryTarget {
  const workspaceId = suppliedWorkspaceId ?? 'default';
  const isManagedWorkspace = !!suppliedWorkspaceId
    && (workspaceId !== 'default' || managedDefaultExists);
  return {
    workspaceId,
    isManagedWorkspace,
    dataDir: chatHistoryDataDir(dataDir, isManagedWorkspace),
    stateWorkspaceId: chatHistoryStateWorkspaceId(
      workspaceId,
      isManagedWorkspace,
    ),
  };
}

function recoveryRequired(reason: string): ChatHistoryLayoutStatus {
  return {
    status: 'recovery-required',
    code: CHAT_HISTORY_RECOVERY_CODE,
    reason,
  };
}

function readLayoutStatus(markerPath: string): ChatHistoryLayoutStatus | null {
  if (!fs.existsSync(markerPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as {
      version?: unknown;
      status?: unknown;
      reason?: unknown;
    };
    if (parsed.version !== CHAT_HISTORY_LAYOUT_VERSION) {
      return recoveryRequired('Chat history layout marker has an unsupported version.');
    }
    if (parsed.status === 'ready') return { status: 'ready' };
    if (parsed.status === 'recovery-required') {
      return recoveryRequired(
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason
          : 'Chat history layout ownership requires manual recovery.',
      );
    }
    return recoveryRequired('Chat history layout marker is invalid.');
  } catch {
    return recoveryRequired('Chat history layout marker is unreadable.');
  }
}

function recordReadyLayout(markerPath: string): ChatHistoryLayoutStatus {
  const ready: ChatHistoryLayoutStatus = { status: 'ready' };
  const temporaryPath =
    `${markerPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = fs.openSync(temporaryPath, 'wx');
    try {
      fs.writeFileSync(
        handle,
        JSON.stringify({
          version: CHAT_HISTORY_LAYOUT_VERSION,
          ...ready,
          recordedAt: new Date().toISOString(),
        }, null, 2) + '\n',
        'utf-8',
      );
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporaryPath, markerPath);
    return ready;
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // A stale temp file is ignored; only the atomically renamed marker counts.
    }
    const existing = readLayoutStatus(markerPath);
    if (existing) return existing;
    return recoveryRequired(
      `Chat history layout marker could not be recorded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function directoryHasEntries(directory: string): boolean {
  return fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
}

/**
 * Establish durable ownership for the two historical `default` namespaces.
 *
 * Before this layout marker existed, implicit chat and a real managed workspace
 * named `default` could both write `workspaces/default/sessions`. We only move
 * the entire directory when no managed workspace exists, which proves every
 * source file is legacy. If both ownership claims already exist, no timestamps,
 * file contents, or mtimes can safely distinguish them: preserve every byte and
 * fail closed until an operator resolves the ambiguity.
 */
export function isolateLegacyDefaultChatSessions(
  dataDir: string,
): ChatHistoryLayoutStatus {
  const markerPath = path.join(dataDir, CHAT_HISTORY_LAYOUT_FILE);
  const recorded = readLayoutStatus(markerPath);
  if (recorded) return recorded;

  const sourceDir = path.join(dataDir, 'workspaces', 'default', 'sessions');
  const workspaceConfigPath = path.join(
    dataDir,
    'workspaces',
    'default',
    'workspace.json',
  );
  const isolatedDataDir = legacyDefaultChatDataDir(dataDir);
  const targetDir = path.join(isolatedDataDir, 'workspaces', 'default', 'sessions');

  try {
    const sourceHasEntries = directoryHasEntries(sourceDir);
    const targetHasEntries = directoryHasEntries(targetDir);
    const managedDefaultExists = fs.existsSync(workspaceConfigPath);

    if (sourceHasEntries && managedDefaultExists) {
      return recoveryRequired(
        'Existing default-workspace sessions have ambiguous legacy or managed ownership.',
      );
    }
    if (sourceHasEntries && targetHasEntries) {
      return recoveryRequired(
        'Both legacy and pre-layout default chat directories contain sessions.',
      );
    }
    if (sourceHasEntries) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      if (fs.existsSync(targetDir)) fs.rmdirSync(targetDir);
      fs.renameSync(sourceDir, targetDir);
    }
    return recordReadyLayout(markerPath);
  } catch (error) {
    return recoveryRequired(
      `Default chat history layout could not be initialized: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Collision-free process-local key for state that belongs to one chat session.
 * Persisted paths and public session ids remain separate workspace/session fields.
 */
export function chatSessionStateKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}${CHAT_SESSION_STATE_SEPARATOR}${sessionId}`;
}

/** Keep cross-session workflow signals inside their originating workspace. */
export function isChatSessionStateKeyForWorkspace(stateKey: string, workspaceId: string): boolean {
  return stateKey.startsWith(`${workspaceId}${CHAT_SESSION_STATE_SEPARATOR}`);
}

/**
 * Persist a chat message to the session's .jsonl file on disk.
 * This ensures messages survive server restarts.
 */
export function persistMessage(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  msg: { role: string; content: string; model?: string },
): void {
  const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);

  // Create file with meta line if it doesn't exist
  if (!fs.existsSync(filePath)) {
    const meta = JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() });
    fs.writeFileSync(filePath, meta + '\n', 'utf-8');
  }

  const line = JSON.stringify({
    role: msg.role,
    content: msg.content,
    timestamp: new Date().toISOString(),
    ...(typeof msg.model === 'string' && msg.model.trim() ? { model: msg.model } : {}),
  });
  fs.appendFileSync(filePath, line + '\n', 'utf-8');
}

/**
 * Strip a trailing failed user+assistant pair from a session's .jsonl file.
 *
 * A chat error persists the user turn followed by an assistant turn whose
 * content begins with GENERATION_FAILED_PREFIX. A client Retry re-issues the
 * same user message, which would leave the old failed pair duplicated on
 * reload. Call this before persisting the retried turn to drop that pair.
 *
 * Only rewrites when the tail is exactly a failed pair (assistant-failure line
 * preceded by a user line). Idempotent and safe otherwise. Returns whether it
 * stripped anything.
 */
export function stripTrailingFailedPair(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
): boolean {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return false;

  const parse = (line: string): { role?: unknown; content?: unknown; type?: unknown } | null => {
    try { return JSON.parse(line); } catch { return null; }
  };

  const lastIdx = lines.length - 1;
  const last = parse(lines[lastIdx]);
  if (!last || last.type === 'meta' || last.role !== 'assistant'
    || typeof last.content !== 'string' || !last.content.startsWith(GENERATION_FAILED_PREFIX)) {
    return false;
  }
  const prev = parse(lines[lastIdx - 1]);
  if (!prev || prev.type === 'meta' || prev.role !== 'user') return false;

  const kept = lines.slice(0, lastIdx - 1);
  fs.writeFileSync(filePath, kept.length ? kept.join('\n') + '\n' : '', 'utf-8');
  return true;
}

/**
 * Load chat messages from a session's .jsonl file on disk.
 * Returns messages in the format expected by the agent loop.
 */
export function loadSessionMessages(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
): Array<{ role: string; content: string; model?: string }> {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  const messages: Array<{ role: string; content: string; model?: string }> = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'meta') continue; // skip metadata line
      if (parsed.role && parsed.content !== undefined) {
        const model = typeof parsed.model === 'string' && parsed.model.trim()
          ? parsed.model
          : undefined;
        messages.push({
          role: parsed.role,
          content: parsed.content,
          ...(model ? { model } : {}),
        });
      }
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}
