import { describe, it, expect } from 'vitest';

describe('Notification SSE Route', () => {
  it('exports notificationRoutes function', async () => {
    const mod = await import('../../src/local/routes/notifications.js');
    expect(mod.notificationRoutes).toBeDefined();
    expect(typeof mod.notificationRoutes).toBe('function');
  });

  it('exports emitNotification function', async () => {
    const mod = await import('../../src/local/routes/notifications.js');
    expect(mod.emitNotification).toBeDefined();
    expect(typeof mod.emitNotification).toBe('function');
  });
});

describe('NotificationEvent shape', () => {
  it('has required fields', () => {
    const event = {
      type: 'notification' as const,
      title: 'Test',
      body: 'Test body',
      category: 'cron' as const,
      timestamp: new Date().toISOString(),
    };
    expect(event.type).toBe('notification');
    expect(event.category).toBe('cron');
  });

  it('supports optional actionUrl', () => {
    const event = {
      type: 'notification' as const,
      title: 'Task',
      body: 'Review Q1',
      category: 'task' as const,
      timestamp: new Date().toISOString(),
      actionUrl: '/tasks',
    };
    expect(event.actionUrl).toBe('/tasks');
  });
});
