/**
 * R1-012 regression — upload size limit must be enforced WHILE reading the
 * request body, not after the whole thing has been buffered into memory.
 *
 * The old code did `const rawBody = await getRawBody(request)` (buffering the
 * ENTIRE stream) and only THEN compared `rawBody.length > MAX_UPLOAD_SIZE`.
 * A multi-GB upload would OOM the process before the size guard ever ran.
 *
 * These tests drive `getRawBody` directly with a fake stream so we don't need
 * to allocate gigabytes: they assert the helper rejects as soon as the
 * accumulated byte count exceeds the limit (and honours Content-Length up
 * front), instead of buffering-then-checking.
 */
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import { getRawBody, MAX_BODY_BYTES_EXCEEDED } from '../../src/local/routes/files.js';

/**
 * Build a fake FastifyRequest whose `.raw` is a real Readable stream
 * (PassThrough) — so we exercise the same `.on('data'|'end'|'error')` +
 * `.destroy()` surface as a Node IncomingMessage. `contentLength` is optional
 * and sets the content-length header (the up-front guard).
 */
function fakeRequest(contentLength?: number) {
  const raw = new PassThrough();
  const headers: Record<string, string> = {};
  if (contentLength != null) headers['content-length'] = String(contentLength);
  const request = { raw, headers } as unknown as FastifyRequest;
  return { request, raw };
}

describe('R1-012 — getRawBody streaming size guard', () => {
  it('rejects via Content-Length before reading any body bytes', async () => {
    const limit = 1024;
    const { request, raw } = fakeRequest(limit + 1);

    const promise = getRawBody(request, limit);

    // We never emit any 'data'/'end' — if the guard works it rejects up front.
    await expect(promise).rejects.toMatchObject({ code: MAX_BODY_BYTES_EXCEEDED });

    // No listeners should have been left dangling on the raw stream.
    expect(raw.listenerCount('data')).toBe(0);
  });

  it('aborts mid-stream once accumulated bytes exceed the limit (no full buffering)', async () => {
    const limit = 1024;
    const { request, raw } = fakeRequest(); // no content-length header

    const promise = getRawBody(request, limit);

    // Emit chunks that together exceed the limit. The guard should reject
    // BEFORE we ever emit 'end' (i.e. without buffering the whole body).
    const chunk = Buffer.alloc(600, 0x61);
    raw.emit('data', chunk); // 600 bytes — under limit, fine
    raw.emit('data', chunk); // 1200 bytes total — over limit, must reject now

    await expect(promise).rejects.toMatchObject({ code: MAX_BODY_BYTES_EXCEEDED });
  });

  it('resolves with the full buffer for a within-limit body', async () => {
    const limit = 1024;
    const { request, raw } = fakeRequest();

    const promise = getRawBody(request, limit);

    const a = Buffer.from('hello ');
    const b = Buffer.from('waggle');
    raw.emit('data', a);
    raw.emit('data', b);
    raw.emit('end');

    const body = await promise;
    expect(body.equals(Buffer.concat([a, b]))).toBe(true);
  });

  it('propagates stream errors via reject', async () => {
    const limit = 1024;
    const { request, raw } = fakeRequest();

    const promise = getRawBody(request, limit);
    const boom = new Error('socket reset');
    raw.emit('error', boom);

    await expect(promise).rejects.toBe(boom);
  });
});
