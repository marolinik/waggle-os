import { describe, it, expect, vi } from 'vitest';
import {
  deliverCronResult,
  createDefaultDeliveryPreferences,
  type DeliveryMessage,
  type DeliveryPreferences,
  type DeliveryConnectorRegistry,
  type DeliveryConnector,
  type InAppEmitter,
} from '../src/cron-delivery-router.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeMessage(overrides?: Partial<DeliveryMessage>): DeliveryMessage {
  return {
    title: 'Morning Briefing',
    body: 'You have 3 pending tasks.',
    jobType: 'morning_briefing',
    ...overrides,
  };
}

function makeConnector(success = true): DeliveryConnector {
  return {
    execute: vi.fn().mockResolvedValue({ success, error: success ? undefined : 'Send failed' }),
  };
}

function makeRegistry(connectors: Record<string, DeliveryConnector> = {}): DeliveryConnectorRegistry {
  const connectedIds = Object.keys(connectors);
  return {
    get(id: string) { return connectors[id]; },
    getConnected() { return connectedIds.map(id => ({ id })); },
  };
}

function makeEmitter(): InAppEmitter {
  return vi.fn();
}

// ── Default behavior (in_app) ────────────────────────────────────────────

describe('deliverCronResult — in_app', () => {
  it('delivers to in-app by default', async () => {
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences();

    const results = await deliverCronResult(makeMessage(), prefs, makeRegistry(), emitter);

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe('in_app');
    expect(results[0].success).toBe(true);
    expect(emitter).toHaveBeenCalledOnce();
    expect(emitter).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Morning Briefing',
      body: 'You have 3 pending tasks.',
      category: 'cron',
    }));
  });

  it('includes workspace actionUrl when workspaceId provided', async () => {
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences();

    await deliverCronResult(makeMessage({ workspaceId: 'ws-123' }), prefs, makeRegistry(), emitter);

    expect(emitter).toHaveBeenCalledWith(expect.objectContaining({
      actionUrl: '/workspace/ws-123',
    }));
  });
});

// ── Email delivery ───────────────────────────────────────────────────────

describe('deliverCronResult — email', () => {
  it('routes to email connector when configured', async () => {
    const emailConnector = makeConnector(true);
    const registry = makeRegistry({ gmail: emailConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({
      defaultChannels: ['email'],
      emailTo: 'user@example.com',
    });

    const results = await deliverCronResult(makeMessage(), prefs, registry, emitter);

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe('email');
    expect(results[0].success).toBe(true);
    expect(emailConnector.execute).toHaveBeenCalledWith('send_email', expect.objectContaining({
      to: 'user@example.com',
      subject: '[Waggle] Morning Briefing',
    }));
    expect(emitter).not.toHaveBeenCalled();
  });

  it('falls back to in_app when no email connector connected', async () => {
    const emitter = makeEmitter();
    const registry = makeRegistry({}); // no connectors
    const prefs = createDefaultDeliveryPreferences({ defaultChannels: ['email'] });

    const results = await deliverCronResult(makeMessage(), prefs, registry, emitter);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('fell back to in_app');
    expect(emitter).toHaveBeenCalledOnce();
  });
});

// ── Slack delivery ───────────────────────────────────────────────────────

describe('deliverCronResult — slack', () => {
  it('routes to slack connector', async () => {
    const slackConnector = makeConnector(true);
    const registry = makeRegistry({ slack: slackConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({
      defaultChannels: ['slack'],
      slackChannel: 'C123',
    });

    const results = await deliverCronResult(makeMessage(), prefs, registry, emitter);

    expect(results[0].channel).toBe('slack');
    expect(results[0].success).toBe(true);
    expect(slackConnector.execute).toHaveBeenCalledWith('send_message', expect.objectContaining({
      channel: 'C123',
    }));
  });
});

// ── Multi-channel delivery ───────────────────────────────────────────────

describe('deliverCronResult — multi-channel', () => {
  it('delivers to multiple channels', async () => {
    const slackConnector = makeConnector(true);
    const registry = makeRegistry({ slack: slackConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({
      defaultChannels: ['in_app', 'slack'],
      slackChannel: 'C456',
    });

    const results = await deliverCronResult(makeMessage(), prefs, registry, emitter);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ channel: 'in_app', success: true });
    expect(results[1]).toEqual({ channel: 'slack', success: true });
    expect(emitter).toHaveBeenCalledOnce();
    expect(slackConnector.execute).toHaveBeenCalledOnce();
  });
});

// ── Per-job overrides ────────────────────────────────────────────────────

describe('deliverCronResult — per-job overrides', () => {
  it('uses override channels for specific job types', async () => {
    const emailConnector = makeConnector(true);
    const registry = makeRegistry({ gmail: emailConnector });
    const emitter = makeEmitter();
    const prefs: DeliveryPreferences = {
      defaultChannels: ['in_app'],
      overrides: {
        morning_briefing: ['email'],
      },
      emailTo: 'boss@example.com',
    };

    const results = await deliverCronResult(
      makeMessage({ jobType: 'morning_briefing' }),
      prefs, registry, emitter,
    );

    expect(results[0].channel).toBe('email');
    expect(results[0].success).toBe(true);
    // in_app should NOT be called because override replaced default
    expect(emitter).not.toHaveBeenCalled();
  });

  it('falls back to default channels for non-overridden job types', async () => {
    const emitter = makeEmitter();
    const prefs: DeliveryPreferences = {
      defaultChannels: ['in_app'],
      overrides: { morning_briefing: ['email'] },
    };

    await deliverCronResult(
      makeMessage({ jobType: 'task_reminder' }), // not overridden
      prefs, makeRegistry(), emitter,
    );

    expect(emitter).toHaveBeenCalledOnce();
  });
});

// ── Fallback on connector failure ────────────────────────────────────────

describe('deliverCronResult — error handling', () => {
  it('falls back to in_app when connector throws', async () => {
    const brokenConnector: DeliveryConnector = {
      execute: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const registry = makeRegistry({ slack: brokenConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({ defaultChannels: ['slack'] });

    const results = await deliverCronResult(makeMessage(), prefs, registry, emitter);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Network error');
    // Should fall back to in_app
    expect(emitter).toHaveBeenCalledOnce();
  });

  it('reports failure when connector returns success=false', async () => {
    const failConnector = makeConnector(false);
    const registry = makeRegistry({ slack: failConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({ defaultChannels: ['slack'] });

    const results = await deliverCronResult(makeMessage(), prefs, registry, emitter);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Send failed');
  });
});

// ── XSS prevention ─────────────────────────────────────────────────────

describe('deliverCronResult — XSS prevention', () => {
  it('escapes HTML in email body to prevent XSS', async () => {
    const emailConnector = makeConnector(true);
    const registry = makeRegistry({ gmail: emailConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({
      defaultChannels: ['email'],
      emailTo: 'user@test.com',
    });

    await deliverCronResult(
      makeMessage({ title: '<script>alert("xss")</script>', body: 'Test & "quotes"' }),
      prefs, registry, emitter,
    );

    const callArgs = (emailConnector.execute as any).mock.calls[0][1];
    expect(callArgs.html).not.toContain('<script>');
    expect(callArgs.html).toContain('&lt;script&gt;');
    expect(callArgs.html).toContain('&amp;');
    expect(callArgs.html).toContain('&quot;');
  });
});

// ── Default preferences ──────────────────────────────────────────────────

describe('createDefaultDeliveryPreferences', () => {
  it('defaults to in_app only', () => {
    const prefs = createDefaultDeliveryPreferences();
    expect(prefs.defaultChannels).toEqual(['in_app']);
    expect(prefs.overrides).toEqual({});
  });

  it('allows overrides', () => {
    const prefs = createDefaultDeliveryPreferences({
      defaultChannels: ['in_app', 'email'],
      emailTo: 'me@test.com',
    });
    expect(prefs.defaultChannels).toEqual(['in_app', 'email']);
    expect(prefs.emailTo).toBe('me@test.com');
  });
});
