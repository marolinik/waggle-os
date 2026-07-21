/**
 * chat-persistence.ts — Message persistence functions for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * These functions depend on `fs`, `path` — no server state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';

const CHAT_SESSION_STATE_SEPARATOR = '\u0000';

/**
 * Collision-free process-local key for state that belongs to one chat session.
 * Persisted paths and public session ids remain separate workspace/session fields.
 */
export function chatSessionStateKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}${CHAT_SESSION_STATE_SEPARATOR}${sessionId}`;
}

/** Match both scoped keys and pre-upgrade raw keys for legacy clear requests. */
export function isChatSessionStateKeyForSession(stateKey: string, sessionId: string): boolean {
  return stateKey === sessionId
    || stateKey.endsWith(`${CHAT_SESSION_STATE_SEPARATOR}${sessionId}`);
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
