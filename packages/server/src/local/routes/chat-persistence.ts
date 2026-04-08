/**
 * chat-persistence.ts — Message persistence functions for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * These functions depend on `fs`, `path` — no server state.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Persist a chat message to the session's .jsonl file on disk.
 * This ensures messages survive server restarts.
 */
export function persistMessage(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  msg: { role: string; content: string },
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

  const line = JSON.stringify({ role: msg.role, content: msg.content, timestamp: new Date().toISOString() });
  fs.appendFileSync(filePath, line + '\n', 'utf-8');
}

/**
 * Load chat messages from a session's .jsonl file on disk.
 * Returns messages in the format expected by the agent loop.
 */
export function loadSessionMessages(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
): Array<{ role: string; content: string }> {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  const messages: Array<{ role: string; content: string }> = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'meta') continue; // skip metadata line
      if (parsed.role && parsed.content !== undefined) {
        messages.push({ role: parsed.role, content: parsed.content });
      }
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}
