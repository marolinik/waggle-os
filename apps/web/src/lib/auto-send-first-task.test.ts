/**
 * F2 — wizard first-task auto-send gate regression.
 *
 * Pins the race guard (session + history must both be ready) and the "never
 * override an edited composer" / "once only" rules.
 */
import { describe, it, expect } from 'vitest';
import { shouldAutoSendFirstTask, type AutoSendFirstTaskInput } from './auto-send-first-task';

function base(overrides: Partial<AutoSendFirstTaskInput> = {}): AutoSendFirstTaskInput {
  return {
    autoSendInitial: true,
    alreadySent: false,
    initialMessage: 'Draft the launch brief',
    activeSessionId: 'sess-1',
    historyLoaded: true,
    inputUnchanged: true,
    ...overrides,
  };
}

describe('shouldAutoSendFirstTask', () => {
  it('sends when seeded, ready, and untouched', () => {
    expect(shouldAutoSendFirstTask(base())).toBe(true);
  });

  it('does not send when autoSendInitial is false', () => {
    expect(shouldAutoSendFirstTask(base({ autoSendInitial: false }))).toBe(false);
  });

  it('does not send twice (alreadySent)', () => {
    expect(shouldAutoSendFirstTask(base({ alreadySent: true }))).toBe(false);
  });

  it('does not send an empty/whitespace message', () => {
    expect(shouldAutoSendFirstTask(base({ initialMessage: '   ' }))).toBe(false);
    expect(shouldAutoSendFirstTask(base({ initialMessage: undefined }))).toBe(false);
  });

  it('waits for the session to resolve', () => {
    expect(shouldAutoSendFirstTask(base({ activeSessionId: null }))).toBe(false);
  });

  it('waits for history to load (the clobber race)', () => {
    expect(shouldAutoSendFirstTask(base({ historyLoaded: false }))).toBe(false);
  });

  it('never overrides an edited composer', () => {
    expect(shouldAutoSendFirstTask(base({ inputUnchanged: false }))).toBe(false);
  });
});
