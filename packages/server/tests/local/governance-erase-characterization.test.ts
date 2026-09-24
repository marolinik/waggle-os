/**
 * Characterization pins for what the erase routes do to the `ai_interactions`
 * governance trail in `personal.mind` (D-1).
 *
 * No production path writes `ai_interactions` yet, so each pin records its own
 * rows through `InteractionStore`, the way the compliance route does.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AI_INTERACTIONS_PSEUDONYMIZED_TEXT, InteractionStore } from '@waggle/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

const PROMPT = 'What did I tell you about Ana?';
const ANSWER = 'You said Ana prefers tea.';

describe('erase routes and the ai_interactions trail (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-governance-erase-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  function record(workspaceId: string | undefined, sessionId: string): number {
    return new InteractionStore(server.multiMind.personal).record({
      workspaceId, sessionId, model: 'model-a', provider: 'provider-a',
      inputTokens: 3, outputTokens: 5, costUsd: 0.01, toolsCalled: ['search_memory'],
      inputText: PROMPT, outputText: ANSWER,
    }).id;
  }

  function row(id: number): Record<string, unknown> {
    return server.multiMind.personal.getDatabase()
      .prepare('SELECT * FROM ai_interactions WHERE id = ?').get(id) as Record<string, unknown>;
  }

  // Until D-1 both erase routes left these rows untouched.
  it("clearing a chat history pseudonymizes that session's interactions, and only those", async () => {
    const id = record(undefined, 'gov-session');
    const other = record(undefined, 'gov-other-session');
    const before = row(id);
    const untouched = row(other);
    resetRateLimiter(server);
    const res = await injectWithAuth(server, { method: 'DELETE', url: '/api/chat/history?session=gov-session' });
    expect(res.statusCode).toBe(200);
    const after = row(id);
    expect(after.input_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(after.output_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(after.session_id).toMatch(/^pseud:/);
    expect(after.pseudonymized_at).toEqual(expect.any(String));
    expect([after.model, after.cost_usd, after.tools_called]).toEqual([before.model, before.cost_usd, before.tools_called]);
    expect(row(other)).toEqual(untouched);
    expect(JSON.stringify(after)).not.toContain('Ana');
  });

  it('deleting a workspace pseudonymizes its interactions and its id in them', async () => {
    const workspaceId = server.workspaceManager.create({ name: `gov ${Date.now()}`, group: 'test' }).id;
    const id = record(workspaceId, 'gov-ws-session');
    resetRateLimiter(server);
    const res = await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${workspaceId}` });
    expect(res.statusCode).toBe(204);
    const after = row(id);
    expect(after.workspace_id).toMatch(/^pseud:/);
    expect(after.session_id).toMatch(/^pseud:/);
    expect(after.input_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(JSON.stringify(after)).not.toContain(workspaceId);
  });
});
