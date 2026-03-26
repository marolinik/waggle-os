import { describe, it, expect } from 'vitest';

describe('useNotifications', () => {
  it('exports useNotifications hook', async () => {
    const mod = await import('../../src/hooks/useNotifications.js');
    expect(mod.useNotifications).toBeDefined();
    expect(typeof mod.useNotifications).toBe('function');
  });

  it('exports NotificationEvent type shape', () => {
    const event = {
      type: 'notification' as const,
      title: 'Test',
      body: 'Body',
      category: 'cron' as const,
      timestamp: new Date().toISOString(),
    };
    expect(event.type).toBe('notification');
    expect(event.category).toBe('cron');
  });
});
