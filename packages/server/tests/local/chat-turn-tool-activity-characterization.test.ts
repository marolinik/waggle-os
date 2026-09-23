/**
 * Characterization tests for one chat turn's tool-activity state in
 * `routes/chat.ts`: the explicit read-only tool choice, the replay guard and
 * the per-tool duration.
 *
 * That state is a dozen handler locals written by the `onToolUse` and
 * `onToolResult` callbacks and read by `runAgentAttempt`. It is about to become
 * one object (TD-CHAT-3), and almost none of what it decides had a test: the
 * failure messages it throws, the `toolChoice` it forces, and the rule that a
 * turn is not replayed after a side-effecting tool started.
 *
 * Every write sits behind `!hasCustomRunner`, so the `server.agentRunner` seam
 * cannot reach it; these pins replace `runAgentLoop` through a module mock
 * instead and drive the callbacks by hand, the same harness the recall-cluster
 * pins use. They assert only what crosses the HTTP boundary — the SSE events —
 * and what the route handed the loop.
 *
 * They pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

type SseEvent = { event: string; data: string };

const PRIMARY_MODEL = 'openrouter/anthropic/claude-sonnet-5';
const FALLBACK_MODEL = 'openrouter/openai/gpt-5.4';
const UNREACHABLE = 'Could not reach the model endpoint after 3 attempts (fetch failed).';

function answer(content: string, toolsUsed: string[] = []): AgentResponse {
  return { content, toolsUsed, usage: { inputTokens: 10, outputTokens: 5 } };
}

describe('POST /api/chat tool-activity state (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let configs: AgentLoopConfig[];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tool-activity-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  beforeEach(() => {
    configs = [];
    loop.runAgentLoop.mockReset();
  });

  /** Each call records the config the route built, then runs `script`. */
  function scriptLoop(...scripts: Array<(config: AgentLoopConfig) => Promise<AgentResponse>>) {
    let call = 0;
    loop.runAgentLoop.mockImplementation(async (config: AgentLoopConfig) => {
      configs.push(config);
      const script = scripts[Math.min(call, scripts.length - 1)];
      call += 1;
      return script(config);
    });
  }

  async function runTurn(message: string, session: string, model = 'claude-sonnet-4-6') {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session, model },
    });
    const events = parseSSE(res.body) as SseEvent[];
    return { status: res.statusCode, events };
  }

  /**
   * A configured fallback model is what makes the route replay a failed
   * attempt at all; without one, neither replay pin below could fail.
   */
  async function withFallbackModel<T>(run: () => Promise<T>): Promise<T> {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel(FALLBACK_MODEL);
    config.save();
    try {
      return await run();
    } finally {
      config.clearFallbackModel();
      config.save();
    }
  }

  const payloads = (events: SseEvent[], name: string) => events
    .filter(e => e.event === name)
    .map(e => JSON.parse(e.data) as Record<string, unknown>);

  it('forces the named read-only tool on the first attempt and reports its duration', async () => {
    scriptLoop(async (config) => {
      config.onToolUse?.('list_skills', {});
      config.onToolResult?.('list_skills', {}, 'No skills installed.');
      return answer('There are no skills installed.', ['list_skills']);
    });
    const { status, events } = await runTurn('Use list_skills', 'tool-activity-forced');
    expect(status).toBe(200);

    expect(configs).toHaveLength(1);
    expect(configs[0].toolChoice).toBe('list_skills');

    const [result] = payloads(events, 'tool_result');
    expect(result).toMatchObject({ name: 'list_skills', result: 'No skills installed.', isError: false });
    expect(typeof result.duration).toBe('number');

    const [done] = payloads(events, 'done');
    expect(done.content).toBe('There are no skills installed.');
    expect(done.toolsUsed).toEqual(['list_skills']);
  });

  it('fails the turn when the forced read-only tool reports a failure', async () => {
    scriptLoop(async (config) => {
      config.onToolUse?.('list_skills', {});
      config.onToolResult?.('list_skills', {}, 'Error: skills directory unreadable');
      return answer('Here are your skills.', ['list_skills']);
    });
    const { status, events } = await runTurn('Use list_skills', 'tool-activity-failed');
    expect(status).toBe(200);

    expect(payloads(events, 'tool_result')[0]).toMatchObject({ name: 'list_skills', isError: true });
    expect(payloads(events, 'done')).toEqual([]);
    const errors = payloads(events, 'error');
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0])).toContain('Required read-only tool list_skills failed: Error: skills directory unreadable');
  });

  it('fails the turn when the model never runs the forced read-only tool', async () => {
    scriptLoop(async () => answer('I did not need a tool.'));
    const { status, events } = await runTurn('Use list_skills', 'tool-activity-skipped');
    expect(status).toBe(200);

    expect(payloads(events, 'done')).toEqual([]);
    const errors = payloads(events, 'error');
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0])).toContain('Required read-only tool list_skills did not complete exactly once.');
  });

  it('does not replay a model attempt after a side-effecting tool started', async () => {
    scriptLoop(async (config) => {
      config.onToolUse?.('write_file', { path: 'notes.txt', content: 'hello' });
      throw new Error(UNREACHABLE);
    });
    const { status, events } = await withFallbackModel(() => (
      runTurn('Write hello into notes.txt', 'tool-activity-no-replay', PRIMARY_MODEL)
    ));
    expect(status).toBe(200);

    expect(loop.runAgentLoop).toHaveBeenCalledTimes(1);
    expect(payloads(events, 'model_switch')).toEqual([]);
    expect(payloads(events, 'done')).toEqual([]);
    expect(payloads(events, 'error')).toHaveLength(1);
  });

  it('replays a model attempt that only ran a read-only tool', async () => {
    scriptLoop(
      async (config) => {
        config.onToolUse?.('search_files', { pattern: '*.txt' });
        throw new Error(UNREACHABLE);
      },
      async () => answer('Recovered on the second attempt.'),
    );
    const { status, events } = await withFallbackModel(() => (
      runTurn('Find the text files', 'tool-activity-replay', PRIMARY_MODEL)
    ));
    expect(status).toBe(200);

    expect(loop.runAgentLoop).toHaveBeenCalledTimes(2);
    expect(payloads(events, 'model_switch')[0]).toMatchObject({ model: FALLBACK_MODEL, primary: PRIMARY_MODEL });
    expect(payloads(events, 'done')[0]?.content).toBe('Recovered on the second attempt.');
  });
  it('replays a completed forced read-only tool as a tool-free strict continuation', async () => {
    scriptLoop(
      async (config) => {
        config.onToolUse?.('list_skills', {});
        config.onToolResult?.('list_skills', {}, 'No skills installed.');
        throw new Error(UNREACHABLE);
      },
      async () => answer('There are no skills installed.'),
    );
    const { status, events } = await withFallbackModel(() => (
      runTurn('Use list_skills', 'tool-activity-strict-continuation', PRIMARY_MODEL)
    ));
    expect(status).toBe(200);

    expect(configs).toHaveLength(2);
    expect(configs[0].toolChoice).toBe('list_skills');
    // The tool ran exactly once, so the replay gets no tools and is told to
    // answer from the bounded result alone.
    expect(configs[1].tools).toEqual([]);
    expect(configs[1].toolChoice).toBeUndefined();
    expect(configs[1].systemPrompt).toContain('# COMPLETED READ-ONLY TOOL CONTINUATION');
    const last = configs[1].messages[configs[1].messages.length - 1] as { role: string; content: string };
    expect(last.role).toBe('user');
    expect(last.content).toContain('# STRICT READ-ONLY TOOL CONTINUATION');
    expect(last.content).toContain('Tool result: "No skills installed."');

    expect(payloads(events, 'done')[0]?.content).toBe('There are no skills installed.');
  });
});
