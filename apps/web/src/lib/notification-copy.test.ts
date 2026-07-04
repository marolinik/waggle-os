import { describe, it, expect } from 'vitest';
import { humanizeNotification } from './notification-copy';
import type { Notification } from '@/lib/types';

const notif = (over: Partial<Notification> = {}): Notification => ({
  id: '1',
  type: 'cron',
  title: 'Daily digest completed',
  body: 'Scheduled task ran successfully.',
  read: false,
  timestamp: '2026-07-04T00:00:00Z',
  ...over,
});

describe('humanizeNotification', () => {
  it('softens the generic cron-tick jargon body', () => {
    const out = humanizeNotification(notif());
    expect(out.body).toBe('Your scheduled automation just ran.');
    expect(out.title).toBe('Daily digest completed');
  });

  it('surfaces actionUrl as href', () => {
    const out = humanizeNotification(notif({ actionUrl: '/settings/mission-control' }));
    expect(out.href).toBe('/settings/mission-control');
  });

  it('trims whitespace-only actionUrl to undefined', () => {
    expect(humanizeNotification(notif({ actionUrl: '   ' })).href).toBeUndefined();
    expect(humanizeNotification(notif({ actionUrl: undefined })).href).toBeUndefined();
  });

  it('passes through non-generic bodies unchanged', () => {
    const out = humanizeNotification(notif({ type: 'approval', title: 'Approval needed', body: 'Delete database requires your OK.' }));
    expect(out.body).toBe('Delete database requires your OK.');
  });

  it('fills an empty body with a per-category fallback', () => {
    expect(humanizeNotification(notif({ type: 'approval', body: '' })).body).toBe('An action is waiting for your approval.');
    expect(humanizeNotification(notif({ type: 'agent', body: '   ' })).body).toBe('An agent finished its work.');
  });

  it('falls back to a default title when title is empty', () => {
    expect(humanizeNotification(notif({ title: '' })).title).toBe('Notification');
  });
});
