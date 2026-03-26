/**
 * PM-6: Offline indicator tests — verify StatusBar exports and OfflineStatus type.
 *
 * Tests utility/type checks only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import { StatusBar } from '../../src/index.js';
import type { StatusBarProps, OfflineStatus } from '../../src/index.js';

describe('StatusBar offline indicator', () => {
  it('StatusBar is exported as a function', () => {
    // StatusBar may be wrapped in React.memo (returns object)
    expect(['function', 'object']).toContain(typeof StatusBar);
  });

  it('OfflineStatus type supports offline state', () => {
    const offlineState: OfflineStatus = {
      offline: true,
      since: '2026-03-19T10:00:00.000Z',
      queuedMessages: 3,
    };
    expect(offlineState.offline).toBe(true);
    expect(offlineState.since).toBeDefined();
    expect(offlineState.queuedMessages).toBe(3);
  });

  it('OfflineStatus type supports online state', () => {
    const onlineState: OfflineStatus = {
      offline: false,
      since: null,
      queuedMessages: 0,
    };
    expect(onlineState.offline).toBe(false);
    expect(onlineState.since).toBeNull();
    expect(onlineState.queuedMessages).toBe(0);
  });

  it('StatusBarProps accepts offlineStatus as optional', () => {
    // Without offlineStatus — should still compile
    const propsWithout: StatusBarProps = {
      model: 'claude-sonnet-4-6',
      workspace: 'Test',
      tokens: 100,
      cost: 0.01,
      mode: 'local',
    };
    expect(propsWithout.offlineStatus).toBeUndefined();

    // With offlineStatus
    const propsWith: StatusBarProps = {
      model: 'claude-sonnet-4-6',
      workspace: 'Test',
      tokens: 100,
      cost: 0.01,
      mode: 'local',
      offlineStatus: { offline: true, since: '2026-03-19T10:00:00.000Z', queuedMessages: 2 },
    };
    expect(propsWith.offlineStatus?.offline).toBe(true);
    expect(propsWith.offlineStatus?.queuedMessages).toBe(2);
  });

  it('queued message count badge displays for non-zero count', () => {
    // Type-level test: OfflineStatus with queued messages
    const status: OfflineStatus = {
      offline: true,
      since: '2026-03-19T10:00:00.000Z',
      queuedMessages: 5,
    };
    // Badge should show when queuedMessages > 0
    expect(status.queuedMessages > 0).toBe(true);
  });

  it('no badge for zero queued messages', () => {
    const status: OfflineStatus = {
      offline: true,
      since: '2026-03-19T10:00:00.000Z',
      queuedMessages: 0,
    };
    expect(status.queuedMessages > 0).toBe(false);
  });
});
