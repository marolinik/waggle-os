import type { ChatMessage } from '@/lib/types';

/**
 * Lane C (Pillar 2.6-chat) — session-scoped cache of chat thread messages.
 *
 * Mirrors `memory/memory-list-cache.ts`: the last-known message list per
 * (workspace, session) is held at MODULE scope so a re-mount (or a session
 * switch back to a visited thread) can seed its initial state INSTANTLY and
 * refresh in the background — no re-skeleton on return. The keep-alive ChatHost
 * already preserves an in-session thread across tab-away/return; this cache adds
 * the same instant paint for a genuine remount and for switching between two
 * already-visited sessions.
 *
 * Only SETTLED threads are cached (never mid-stream partials or queued turns) —
 * useChat guards the write. Not persisted across reloads: a page reload starts a
 * fresh session by design, and history re-fetches from the sidecar.
 */
const cache = new Map<string, ChatMessage[]>();

/** Stable per-thread key from the two dimensions that select a message list. */
export function chatThreadCacheKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}|${sessionId}`;
}

export function readChatThreadCache(key: string): ChatMessage[] | undefined {
  return cache.get(key);
}

export function writeChatThreadCache(key: string, messages: ChatMessage[]): void {
  cache.set(key, messages);
}

/** Test-only: drop all cached threads so module state can't leak across tests. */
export function clearChatThreadCache(): void {
  cache.clear();
}
