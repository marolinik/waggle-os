import { describe, expect, it } from 'vitest';
import { TurnAttemptState } from '../../src/local/routes/chat-turn-attempt-state.js';
import type { PersistedCapabilityReceipt } from '../../src/local/routes/chat-persistence.js';

const receipt = (id: string): PersistedCapabilityReceipt => ({
  id, name: 'acquire_capability', status: 'done', input: { need: 'x' }, output: 'out',
});

describe('TurnAttemptState', () => {
  it('keeps the buffered chunks when they spell the answer, else one whole-answer token', () => {
    const state = new TurnAttemptState();
    state.bufferToken('ok ');
    state.bufferToken('answer');
    expect(state.takeFinalTokenChunks('ok answer')).toEqual(['ok ', 'answer']);
    expect(state.takeFinalTokenChunks('ok answer')).toEqual(['ok answer']);
    expect(state.takeFinalTokenChunks('')).toEqual([]);
  });

  it('discards the previous attempt on beginAttempt, keeping failed tools and sent steps', () => {
    const state = new TurnAttemptState();
    state.bufferToken('partial');
    state.offerCapabilityReceipt(receipt('capability-1'));
    state.addPendingCapability({ input: {}, output: 'o' });
    state.recordFailedTools(['search_memory']);
    expect(state.claimOnce('modelRequested')).toBe(true);
    state.beginAttempt();
    expect(state.takeFinalTokenChunks('answer')).toEqual(['answer']);
    expect(state.capabilityReceipt).toBeNull();
    expect(state.takePendingCapabilities()).toEqual([]);
    expect(state.toolsUsedWith([])).toEqual(['search_memory']);
    expect(state.claimOnce('modelRequested')).toBe(false);
  });

  it('claims each step once and the initial-activity deadline once', () => {
    const state = new TurnAttemptState();
    expect(state.claimOnce('reasoning')).toBe(true);
    expect(state.claimOnce('reasoning')).toBe(false);
    expect(state.claimOnce('modelStreaming')).toBe(true);
    expect(state.takeInitialActivityDeadline()).toBe(true);
    expect(state.takeInitialActivityDeadline()).toBe(false);
  });

  it('trims failed tools from an error, keeps empty-answer tool names as given, and merges in order', () => {
    const state = new TurnAttemptState();
    state.recordFailedTools([' search_memory ', '', 7, 'read_file']);
    state.recordFailedTools('not an array');
    state.recordFailedToolNames(['list_skills', 'read_file']);
    expect(state.toolsUsedWith(['read_file', 'write_file'])).toEqual([
      'search_memory', 'read_file', 'list_skills', 'write_file',
    ]);
    expect(state.toolsUsedWith(undefined)).toEqual(['search_memory', 'read_file', 'list_skills']);
  });

  it('keeps the current receipt when offered null, and empties pending capabilities on take', () => {
    const state = new TurnAttemptState();
    state.offerCapabilityReceipt(receipt('capability-1'));
    state.offerCapabilityReceipt(null);
    expect(state.capabilityReceipt?.id).toBe('capability-1');
    state.addPendingCapability({ input: { need: 'a' }, output: 'o', duration: 3 });
    expect(state.takePendingCapabilities()).toEqual([{ input: { need: 'a' }, output: 'o', duration: 3 }]);
    expect(state.takePendingCapabilities()).toEqual([]);
  });
});
