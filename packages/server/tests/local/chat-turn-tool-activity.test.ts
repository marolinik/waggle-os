import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnToolActivity } from '../../src/local/routes/chat-turn-tool-activity.js';

const identity = (result: string) => result;

describe('TurnToolActivity', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks replay once a side-effecting tool starts, and not before', () => {
    const activity = new TurnToolActivity({
      explicitReadOnlyToolChoice: undefined,
      requiredToolSequence: undefined,
      capResultForModel: identity,
    });
    activity.recordUse('search_files', false);
    expect(activity.replayBlocked).toBe(false);
    expect(() => activity.assertReplayable()).not.toThrow();

    activity.recordUse('write_file', true);
    expect(activity.replayBlocked).toBe(true);
    expect(() => activity.assertReplayable())
      .toThrow('Model attempt cannot be replayed after a side-effecting tool started.');
  });

  it('accepts a required sequence only when used and answered exactly in order', () => {
    const inOrder = new TurnToolActivity({
      explicitReadOnlyToolChoice: undefined,
      requiredToolSequence: ['read_skill', 'calculate_decision_matrix'],
      capResultForModel: identity,
    });
    inOrder.recordUse('read_skill', false);
    inOrder.recordResult('read_skill', '# skill', false);
    inOrder.recordUse('calculate_decision_matrix', false);
    inOrder.recordResult('calculate_decision_matrix', '{"totals":[]}', false);
    expect(() => inOrder.assertCompleted()).not.toThrow();
    // A started sequence is itself unrepeatable.
    expect(inOrder.replayBlocked).toBe(true);

    const reversed = new TurnToolActivity({
      explicitReadOnlyToolChoice: undefined,
      requiredToolSequence: ['read_skill', 'calculate_decision_matrix'],
      capResultForModel: identity,
    });
    reversed.recordUse('calculate_decision_matrix', false);
    reversed.recordResult('calculate_decision_matrix', '{}', false);
    reversed.recordUse('read_skill', false);
    reversed.recordResult('read_skill', '# skill', false);
    expect(() => reversed.assertCompleted())
      .toThrow('Required read-only tool sequence did not complete exactly once in order.');

    const failed = new TurnToolActivity({
      explicitReadOnlyToolChoice: undefined,
      requiredToolSequence: ['read_skill'],
      capResultForModel: identity,
    });
    failed.recordUse('read_skill', false);
    failed.recordResult('read_skill', 'Error: missing', true);
    expect(() => failed.assertCompleted())
      .toThrow('Required read-only tool sequence failed: Error: missing');
  });

  it('bounds the forced tool result and offers it as a strict continuation', () => {
    const activity = new TurnToolActivity({
      explicitReadOnlyToolChoice: 'list_skills',
      requiredToolSequence: undefined,
      capResultForModel: result => result.slice(0, 4),
    });
    expect(activity.pendingExplicitToolChoice).toBe('list_skills');
    expect(activity.strictContinuation('Use list_skills')).toBeNull();

    activity.recordUse('list_skills', false);
    activity.recordResult('list_skills', 'abcdefgh', false);
    expect(activity.pendingExplicitToolChoice).toBeUndefined();
    expect(activity.explicitToolResult).toBe('abcd');
    expect(() => activity.assertCompleted()).not.toThrow();
    expect(activity.strictContinuation('Use list_skills')?.content)
      .toContain('Tool result: "abcd"');
  });

  it('measures a call from its own start when an earlier start of that tool was never answered', () => {
    // Tool calls run one at a time, so a result always answers the latest
    // start of its tool. An older start is left unanswered only when onToolUse
    // threw after startTimer; until TD-CHAT-51 the next call of that tool was
    // charged from the stale start.
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const activity = new TurnToolActivity({
      explicitReadOnlyToolChoice: undefined,
      requiredToolSequence: undefined,
      capResultForModel: identity,
    });
    activity.startTimer('search_files');
    vi.setSystemTime(1_300);
    activity.startTimer('search_files');
    vi.setSystemTime(1_500);
    expect(activity.recordResult('search_files', 'b', false)).toBe(200);
  });

  it('pairs sequential calls of one tool with their own starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const activity = new TurnToolActivity({
      explicitReadOnlyToolChoice: undefined,
      requiredToolSequence: undefined,
      capResultForModel: identity,
    });
    activity.startTimer('search_files');
    vi.setSystemTime(1_100);
    expect(activity.recordResult('search_files', 'a', false)).toBe(100);
    vi.setSystemTime(2_000);
    activity.startTimer('search_files');
    vi.setSystemTime(2_050);
    expect(activity.recordResult('search_files', 'b', false)).toBe(50);
    expect(activity.recordResult('search_files', 'x', false)).toBeUndefined();
  });
});
