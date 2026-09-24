/**
 * Route pin for an oversized model answer (TD-REL-1, TD-CHAT-16 ruling 11).
 *
 * The SSE backlog cap itself is pinned at the unit level in `chat-sse.test.ts`
 * ("closes the stream once a stalled reader falls past the cap"). On the real
 * path one provider answer can never reach that 8 MB cap: the agent's SSE
 * parser fails closed at 2 MiB (`MAX_TOTAL_SSE_CHARS`) first. This pins that
 * real-path behaviour: the real agent loop, fed about 3x the cap by the fake
 * provider, ends the turn with the parser's fail-closed error, sends none of the
 * oversized answer, and releases the socket.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { SSE_MAX_BUFFERED_BYTES } from '../../src/local/routes/chat-sse.js';
import { parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
} from '../helpers/fake-llm-provider.js';

const CHUNK = 'x'.repeat(256 * 1024);
const CHUNK_COUNT = Math.ceil((SSE_MAX_BUFFERED_BYTES * 3) / CHUNK.length);
const SOCKET_CLOSE_DEADLINE_MS = 15_000;

describe('POST /api/chat with an answer larger than the SSE cap', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sse-backpressure-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    markFakeProviderHealthy(server);
    server.llmRetryBackoffMs = () => 0;
    provider = installFakeLlmProvider({
      respond: {
        type: 'text',
        content: CHUNK.repeat(CHUNK_COUNT),
        chunks: Array.from({ length: CHUNK_COUNT }, () => CHUNK),
      },
    });
  });

  afterAll(async () => {
    provider.restore();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('fails the oversized answer closed and releases the socket', async () => {
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    const request = http.request(`${address}/api/chat`, {
      method: 'POST',
      agent: false,
      headers: {
        authorization: `Bearer ${server.agentState.wsSessionToken}`,
        'content-type': 'application/json',
        connection: 'close',
      },
    });
    let body = '';
    const socketClosed = new Promise<'closed'>((resolve) => {
      request.on('socket', (socket) => socket.once('close', () => resolve('closed')));
    });
    request.on('response', (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
    });
    request.on('error', () => { /* a closed socket is the expected end */ });
    request.end(JSON.stringify({ message: 'Write a very long answer', session: 'sse-oversized' }));

    try {
      const outcome = await Promise.race([
        socketClosed,
        new Promise<'still open'>(r => setTimeout(() => r('still open'), SOCKET_CLOSE_DEADLINE_MS)),
      ]);
      expect(outcome).toBe('closed');
      // The model was reached, and the turn ended in an error without a done.
      expect(provider.requests.length).toBeGreaterThan(0);
      const events = parseSSE(body);
      expect(events.some(e => e.event === 'done')).toBe(false);
      expect(events.some(e => e.event === 'error')).toBe(true);
      // None of the oversized answer reached the client.
      expect(body).not.toContain(CHUNK.slice(0, 1024));
      expect(body.length).toBeLessThan(SSE_MAX_BUFFERED_BYTES);
    } finally {
      request.destroy();
    }
  }, SOCKET_CLOSE_DEADLINE_MS + 15_000);
});
