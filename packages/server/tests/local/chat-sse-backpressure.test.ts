/**
 * Route pin for the SSE backlog cap (TD-REL-1).
 *
 * A real socket, because `inject` has no reader that can stop reading. The
 * route holds a turn's answer tokens until the attempt completes and then
 * writes them all at once, so the backlog peaks in that final write. The
 * client pauses the response and never resumes; the injected runner returns
 * an answer several times the cap. Without the cap the server ends the
 * response with everything still buffered and the socket stays open for as
 * long as the client does not read.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { SSE_MAX_BUFFERED_BYTES } from '../../src/local/routes/chat-sse.js';

const CHUNK = 'x'.repeat(256 * 1024);
const CHUNK_COUNT = Math.ceil((SSE_MAX_BUFFERED_BYTES * 3) / CHUNK.length);
const SOCKET_CLOSE_DEADLINE_MS = 15_000;

describe('POST /api/chat with a reader that stops reading', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sse-backpressure-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      for (let i = 0; i < CHUNK_COUNT; i += 1) config.onToken?.(CHUNK);
      return { content: CHUNK.repeat(CHUNK_COUNT), toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('closes the socket once the unread backlog passes the cap', async () => {
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    const request = http.request(`${address}/api/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${server.agentState.wsSessionToken}`,
        'content-type': 'application/json',
      },
    });
    const socketClosed = new Promise<'closed'>((resolve) => {
      request.on('socket', (socket) => socket.once('close', () => resolve('closed')));
    });
    request.on('response', (response) => response.pause());
    request.on('error', () => { /* the server closes the socket; expected */ });
    request.end(JSON.stringify({ message: 'Write a very long answer', session: 'sse-backpressure' }));

    try {
      const outcome = await Promise.race([
        socketClosed,
        new Promise<'still open'>(r => setTimeout(() => r('still open'), SOCKET_CLOSE_DEADLINE_MS)),
      ]);
      expect(outcome).toBe('closed');
    } finally {
      request.destroy();
    }
  }, SOCKET_CLOSE_DEADLINE_MS + 15_000);
});
