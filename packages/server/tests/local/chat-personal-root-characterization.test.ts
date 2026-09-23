/**
 * Characterization tests for where a personal-scope chat turn roots its file
 * work (TD-CHAT-26).
 *
 * A personal turn is one with no workspace in the body and no active
 * workspace: the security middleware resolves it to `null`. Its tools and its
 * turn scope then need a root directory that no workspace supplies. These pins
 * read that root at the two places it is observable without touching the
 * filesystem: the turn scope the coordinator is asked for, and the working
 * directory the system prompt tells the model.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

describe('POST /api/chat personal-scope root (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-personal-root-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
    // No active workspace, and no workspace in the body below: the middleware
    // resolves the turn to the personal scope.
    server.agentState.activeWorkspaceId = null;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('roots a personal turn in the user home directory', async () => {
    const configs: AgentLoopConfig[] = [];
    loop.runAgentLoop.mockImplementation(async (config: AgentLoopConfig) => {
      configs.push(config);
      return { content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    const createScope = vi.spyOn(server.agentState.workspaceTurnCoordinator, 'createScope');
    try {
      resetRateLimiter(server);
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/chat', payload: { message: 'Please draft a short plan for organising my quarterly planning notes into sections.', session: 'personal-root' },
      });
      expect(res.statusCode).toBe(200);
      expect(parseSSE(res.body).some(e => e.event === 'done')).toBe(true);

      // QUIRK (TD-CHAT-26): the comment above the personal path resolution says
      // never fall back to the home directory; both roots do.
      expect(createScope.mock.calls.map(([root]) => root)).toEqual([os.homedir()]);
      expect(configs[0].systemPrompt).toContain(`- Working directory: ${os.homedir()}`);
    } finally {
      createScope.mockRestore();
    }
  });
});
