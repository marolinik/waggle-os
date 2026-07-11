import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelManager } from '../src/local/channels/manager.js';
import { channelRoutes } from '../src/local/channels/routes.js';
import { securityMiddleware } from '../src/local/security-middleware.js';

describe('protected channel management routes', () => {
  let server: FastifyInstance;
  let dataDir: string;
  let originalTrustLocalhost: string | undefined;
  const secrets = new Map<string, string>();

  beforeEach(async () => {
    originalTrustLocalhost = process.env.WAGGLE_TRUST_LOCALHOST;
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-channel-routes-'));
    secrets.clear();
    server = Fastify();
    const vault = {
      get: (key: string) => secrets.has(key) ? { value: secrets.get(key)! } : null,
      has: (key: string) => secrets.has(key),
      set: (key: string, value: string) => { secrets.set(key, value); },
      delete: (key: string) => secrets.delete(key),
    };
    const manager = new ChannelManager({
      dataDir,
      port: 3333,
      sessionToken: 'channel-route-token',
      vault,
      log: { info: () => undefined, warn: () => undefined },
      listWorkspaceIds: () => ['ws-1'],
      adapterFactory: () => null,
    });
    server.decorate('vault', vault as never);
    server.decorate('channelManager', manager);
    server.decorate('workspaceManager', {
      list: () => [{ id: 'ws-1', name: 'Client Alpha' }],
    } as never);
    await server.register(securityMiddleware, { sessionToken: 'channel-route-token' });
    await server.register(channelRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (originalTrustLocalhost === undefined) delete process.env.WAGGLE_TRUST_LOCALHOST;
    else process.env.WAGGLE_TRUST_LOCALHOST = originalTrustLocalhost;
  });

  const auth = { authorization: 'Bearer channel-route-token' };

  it('rejects unauthenticated local callers', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/channels' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'MISSING_TOKEN' });
  });

  it('validates a config atomically and accepts a real workspace id', async () => {
    const badSecret = await server.inject({
      method: 'POST',
      url: '/api/channels/slack/config',
      headers: auth,
      payload: {
        secrets: {
          slack_app_token: 'xapp-valid-first-value',
          unexpected_secret: 'must-reject-the-whole-request',
        },
      },
    });
    expect(badSecret.statusCode).toBe(400);
    expect(secrets.has('slack_app_token')).toBe(false);

    const badWorkspace = await server.inject({
      method: 'POST',
      url: '/api/channels/telegram/config',
      headers: auth,
      payload: { defaultWorkspace: 'missing-workspace' },
    });
    expect(badWorkspace.statusCode).toBe(400);

    const valid = await server.inject({
      method: 'POST',
      url: '/api/channels/telegram/config',
      headers: auth,
      payload: {
        defaultWorkspace: 'ws-1',
        secrets: { telegram_bot_token: '123456:valid-token-value' },
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(secrets.get('telegram_bot_token')).toBe('123456:valid-token-value');
  });
});
