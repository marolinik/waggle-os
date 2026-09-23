import { describe, expect, it } from 'vitest';
import {
  COMMAND_CONTEXT_SENTINEL,
  isEmptyMemorySearch,
  isTurnDenialNotice,
} from '../src/commands/command-context-sentinels.js';

describe('command context sentinels', () => {
  it('names the three turn denials, and nothing else, as denial notices', () => {
    expect(isTurnDenialNotice(COMMAND_CONTEXT_SENTINEL.workspaceStateDisabled)).toBe(true);
    expect(isTurnDenialNotice(COMMAND_CONTEXT_SENTINEL.conversationStateDisabled)).toBe(true);
    expect(isTurnDenialNotice(COMMAND_CONTEXT_SENTINEL.memoryAccessDisabled)).toBe(true);
    expect(isTurnDenialNotice(COMMAND_CONTEXT_SENTINEL.noWorkspaceState)).toBe(false);
    expect(isTurnDenialNotice(COMMAND_CONTEXT_SENTINEL.noMemories)).toBe(false);
    expect(isTurnDenialNotice('# Workspace Now — Alpha')).toBe(false);
  });

  it('treats no match, an outage and a denial as an empty memory search', () => {
    expect(isEmptyMemorySearch(COMMAND_CONTEXT_SENTINEL.noMemories)).toBe(true);
    expect(isEmptyMemorySearch(COMMAND_CONTEXT_SENTINEL.memorySearchUnavailable)).toBe(true);
    expect(isEmptyMemorySearch(COMMAND_CONTEXT_SENTINEL.memoryAccessDisabled)).toBe(true);
    expect(isEmptyMemorySearch('1. a remembered decision')).toBe(false);
  });

  it('keeps the wire text the hosts and the persisted histories already carry', () => {
    expect(COMMAND_CONTEXT_SENTINEL).toEqual({
      noWorkspaceState: 'No workspace state available.',
      workspaceStateDisabled: 'Persisted workspace state is disabled for this turn.',
      conversationStateDisabled: 'Conversation-derived workspace state is disabled for this turn.',
      noMemories: 'No relevant memories found.',
      memorySearchUnavailable: 'Memory search unavailable.',
      memoryAccessDisabled: 'Persisted memory access is disabled for this turn.',
    });
  });
});
