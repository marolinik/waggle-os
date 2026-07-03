/**
 * Global Fastify error handler for the local sidecar.
 *
 * The sidecar runs with Fastify's own logger DISABLED (`Fastify({ logger: false })`),
 * so without a custom handler an unhandled route exception is logged NOWHERE and
 * its raw `err.message` is returned verbatim in the 500 body (internal-detail leak).
 *
 * One handler for the whole instance:
 *   • Client errors (`statusCode < 500` — Fastify schema validation, or a thrown
 *     `{ statusCode: 4xx }` like the assertSafeSegment path-traversal guard) pass
 *     through with their message and the standard `{ statusCode, error, message }`
 *     shape, preserving existing 4xx contracts.
 *   • 5xx errors are logged with full context via the tagged `log` (console-backed —
 *     the only sink that actually records anything here) and return a generic
 *     `{ error: 'Internal Server Error', requestId }`. `err.message` is echoed ONLY
 *     when `NODE_ENV !== 'production'` (never leak internals in prod; keep them for
 *     local/dev debugging).
 */

import type { FastifyInstance } from 'fastify';
import { STATUS_CODES } from 'node:http';
import type { Logger } from './logger.js';

/** Register the single global error handler on `server`, logging 5xx via `log`. */
export function installErrorHandler(server: FastifyInstance, log: Logger): void {
  server.setErrorHandler((err, request, reply) => {
    const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error');
    const statusCode = typeof (err as { statusCode?: number }).statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;

    if (statusCode < 500) {
      const payload: Record<string, unknown> = {
        statusCode,
        error: STATUS_CODES[statusCode] ?? 'Error',
        message: error.message,
      };
      if ((err as { code?: string }).code) payload.code = (err as { code: string }).code;
      // Fastify schema-validation errors carry a structured `validation` array —
      // surface it so callers keep the field-level detail.
      if ((err as { validation?: unknown }).validation) {
        payload.validation = (err as { validation: unknown }).validation;
      }
      return reply.code(statusCode).send(payload);
    }

    log.error(`Unhandled route error [${request.method} ${request.url}]`, {
      requestId: request.id,
      message: error.message,
      stack: error.stack,
    });

    const body: { error: string; requestId: string; message?: string } = {
      error: 'Internal Server Error',
      requestId: request.id,
    };
    if (process.env.NODE_ENV !== 'production') {
      body.message = error.message;
    }
    return reply.code(statusCode).send(body);
  });
}
