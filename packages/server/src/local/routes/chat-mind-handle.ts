/**
 * The closed-mind-handle check the chat turn uses at its post-response
 * write-back seams, shared by the handler and the completion phase
 * (`chat-turn-completion.ts`). Moved from `chat.ts` unchanged.
 */

/**
 * W4A diagnostics — the "MindDB flake". A long chat turn holds a workspace
 * MindDB handle obtained from the process-wide MultiMindCache (LRU, maxOpen:20).
 * If ≥20 OTHER workspaces are touched mid-turn (home-briefing fan-out, weaver
 * timers, cross-workspace tools), the cache evicts + `.close()`s THIS turn's
 * handle, and the post-response DB write-backs below throw better-sqlite3's
 * native "The database connection is not open". Those catches are non-blocking
 * and swallow it silently, which is exactly why the flake is invisible. This
 * predicate lets us surface a structured warn at the failure seam WITHOUT
 * changing behavior (the write still fails soft) so the root cause can be
 * confirmed live. The real fix (pin-aware eviction) lives in the OSS substrate
 * (packages/hive-mind-core/src/multi-mind-cache.ts) and is out of scope here.
 */
export function isClosedDbError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /database (connection|handle) is not open|database is closed/i.test(msg);
}
