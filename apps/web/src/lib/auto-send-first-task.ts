/**
 * F2 — pure gate for the wizard first-task auto-send.
 *
 * The imperative bits (the once-only ref, the actual dispatch, clearing the
 * composer) live in ChatApp's effect; this captures the pure decision so it can
 * be unit-tested without rendering the whole chat surface.
 *
 * THE RACE this guards (see useChat history effect): the active session id
 * resolves async, and when it lands useChat REPLACES `messages` with fetched
 * history. An auto-send fired before that replace has its optimistic turn
 * clobbered. So we require BOTH a resolved session AND a completed history
 * fetch before sending.
 */
export interface AutoSendFirstTaskInput {
  /** Seed asked for an auto-send (wizard "Let's go"). */
  autoSendInitial: boolean;
  /** The one-shot has already fired this mount. */
  alreadySent: boolean;
  /** The seeded first message (prefilled into the composer). */
  initialMessage: string | undefined;
  /** Resolved chat session id; null/undefined until useSessions lands. */
  activeSessionId: string | null | undefined;
  /** A real session's history fetch has completed. */
  historyLoaded: boolean;
  /** The composer still holds the untouched seed (user hasn't edited it). */
  inputUnchanged: boolean;
}

export function shouldAutoSendFirstTask(i: AutoSendFirstTaskInput): boolean {
  if (!i.autoSendInitial || i.alreadySent) return false;
  const text = i.initialMessage?.trim();
  if (!text) return false;
  // Wait out the session-land + history-refetch race.
  if (!i.activeSessionId || !i.historyLoaded) return false;
  // User already edited the prefilled text — never override them.
  if (!i.inputUnchanged) return false;
  return true;
}
