/**
 * Global error handler tests (P3).
 *
 * The sidecar runs Fastify with logger:false, so without a custom error handler
 * an unhandled route exception logs NOTHING and returns raw err.message in the
 * 500 body. installErrorHandler(): 5xx → generic envelope + full-context log
 * (message echoed only outside production); 4xx → pass through with message.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import { installErrorHandler } from '../../src/local/error-handler.js';
import type { Logger } from '../../src/local/logger.js';

function makeLogger(): Logger & { error: ReturnType<typeof vi.fn> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function buildApp(log: Logger) {
  const app = Fastify({ logger: false });
  installErrorHandler(app, log);
  app.get('/throw-500', async () => {
    throw new Error('secret internal detail: db password leaked');
  });
  app.get('/throw-400', async () => {
    throw Object.assign(new Error('Invalid segment: contains illegal characters'), { statusCode: 400 });
  });
  await app.ready();
  return app;
}

describe('global error handler (P3)', () => {
  const ORIG_ENV = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = ORIG_ENV; });

  it('a route that throws returns a generic 500 envelope and does NOT leak the message in production', async () => {
    process.env.NODE_ENV = 'production';
    const log = makeLogger();
    const app = await buildApp(log);
    try {
      const res = await app.inject({ method: 'GET', url: '/throw-500' });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error).toBe('Internal Server Error');
      expect(body.requestId).toBeTruthy();
      // No leak: neither the thrown message nor a stack trace reaches the client.
      expect(body.message).toBeUndefined();
      expect(res.body).not.toContain('secret internal detail');
      expect(res.body).not.toContain('at ');
      // But it WAS logged with full context (the only sink — logger:false).
      expect(log.error).toHaveBeenCalledTimes(1);
      const [msg, ctx] = log.error.mock.calls[0] as [string, { message?: string; stack?: string }];
      expect(msg).toContain('/throw-500');
      expect(ctx.message).toContain('secret internal detail');
      expect(ctx.stack).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it('echoes err.message in the 500 body OUTSIDE production (dev debugging)', async () => {
    process.env.NODE_ENV = 'development';
    const log = makeLogger();
    const app = await buildApp(log);
    try {
      const res = await app.inject({ method: 'GET', url: '/throw-500' });
      expect(res.statusCode).toBe(500);
      expect(res.json().message).toContain('secret internal detail');
      // Stack still never goes to the client, even in dev.
      expect(res.body).not.toContain('at ');
    } finally {
      await app.close();
    }
  });

  it('passes a thrown 4xx through with its message (statusCode < 500 is not treated as a fault)', async () => {
    process.env.NODE_ENV = 'production';
    const log = makeLogger();
    const app = await buildApp(log);
    try {
      const res = await app.inject({ method: 'GET', url: '/throw-400' });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('Invalid segment');
      // Client errors are not logged as server faults.
      expect(log.error).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
