import { describe, expect, it } from 'vitest';
import { notificationTargetsCurrentRoute } from './useNotifications';

describe('notificationTargetsCurrentRoute', () => {
  it('matches the visible route while ignoring its query string and trailing slash', () => {
    expect(notificationTargetsCurrentRoute(
      '/workspaces/default-workspace/chat',
      '/workspaces/default-workspace/chat/?session=session-1',
    )).toBe(true);
  });

  it('keeps notifications unread when they point somewhere else or outside Waggle', () => {
    expect(notificationTargetsCurrentRoute('/approvals', '/workspaces/default-workspace/chat')).toBe(false);
    expect(notificationTargetsCurrentRoute('https://example.com/workspaces/default-workspace/chat', '/workspaces/default-workspace/chat')).toBe(false);
    expect(notificationTargetsCurrentRoute(undefined, '/workspaces/default-workspace/chat')).toBe(false);
  });
});
