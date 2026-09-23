/**
 * Command Context Sentinels — the fixed answers a host's `CommandContext`
 * returns when it has nothing to give, and the commands that read them.
 *
 * Three server routes build a `CommandContext` and the workflow commands in
 * this package compare its answers by equality, so these strings are wire
 * codes wearing prose, not display text (founder ruling F10, TD-CHAT-28).
 * They live here, beside the interpreter, and hosts import them rather than
 * retyping them.
 */
export const COMMAND_CONTEXT_SENTINEL = {
  /** `getWorkspaceState`: there is no workspace, or nothing in it yet. */
  noWorkspaceState: 'No workspace state available.',
  /** `getWorkspaceState`: the turn denied persisted memory reads. */
  workspaceStateDisabled: 'Persisted workspace state is disabled for this turn.',
  /** `getWorkspaceState`: the turn denied conversation history. */
  conversationStateDisabled: 'Conversation-derived workspace state is disabled for this turn.',
  /** `searchMemory`: the search ran and matched nothing. */
  noMemories: 'No relevant memories found.',
  /** `searchMemory`: the search itself failed. */
  memorySearchUnavailable: 'Memory search unavailable.',
  /** `searchMemory`: the turn denied persisted memory reads. */
  memoryAccessDisabled: 'Persisted memory access is disabled for this turn.',
} as const;

const TURN_DENIAL_NOTICES: ReadonlySet<string> = new Set([
  COMMAND_CONTEXT_SENTINEL.workspaceStateDisabled,
  COMMAND_CONTEXT_SENTINEL.conversationStateDisabled,
  COMMAND_CONTEXT_SENTINEL.memoryAccessDisabled,
]);

/** The answer says the turn denied the read, rather than carrying content. */
export function isTurnDenialNotice(answer: string): boolean {
  return TURN_DENIAL_NOTICES.has(answer);
}

/** The memory search produced nothing a command should present as memories. */
export function isEmptyMemorySearch(answer: string): boolean {
  return answer === COMMAND_CONTEXT_SENTINEL.noMemories
    || answer === COMMAND_CONTEXT_SENTINEL.memorySearchUnavailable
    || answer === COMMAND_CONTEXT_SENTINEL.memoryAccessDisabled;
}
