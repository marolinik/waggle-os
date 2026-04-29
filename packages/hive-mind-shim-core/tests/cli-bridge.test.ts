import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createCliBridge, type SpawnFn } from '../src/cli-bridge.js';
import type { ChildProcess } from 'node:child_process';
import type { HookFrame } from '../src/frame-encoder.js';

interface MockChildOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  emitError?: Error;
  delayMs?: number;
}

interface MockSpawnRecord {
  command: string;
  args: readonly string[];
}

function mockChild(opts: MockChildOptions = {}): ChildProcess {
  const emitter = new EventEmitter();
  const stdout = Readable.from([Buffer.from(opts.stdout ?? '')]);
  const stderr = Readable.from([Buffer.from(opts.stderr ?? '')]);
  const child = Object.assign(emitter, {
    stdout,
    stderr,
    kill: vi.fn(() => true),
  }) as unknown as ChildProcess;

  setImmediate(() => {
    if (opts.emitError) {
      emitter.emit('error', opts.emitError);
      return;
    }
    if (opts.delayMs && opts.delayMs > 0) {
      setTimeout(() => emitter.emit('exit', opts.exitCode ?? 0), opts.delayMs);
      return;
    }
    emitter.emit('exit', opts.exitCode ?? 0);
  });

  return child;
}

function makeSpawnImpl(records: MockSpawnRecord[], childOpts: MockChildOptions): SpawnFn {
  return ((command, args) => {
    records.push({ command, args });
    return mockChild(childOpts);
  }) as SpawnFn;
}

function jsonResultEnvelope(payload: unknown, opts: { isError?: boolean } = {}): string {
  const result = {
    ok: true,
    tool: 'test_tool',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: opts.isError ?? false,
  };
  return JSON.stringify(result, null, 2);
}

function plainTextEnvelope(text: string): string {
  return JSON.stringify({
    ok: true,
    tool: 'recall_memory',
    content: [{ type: 'text', text }],
    isError: false,
  }, null, 2);
}

const SAMPLE_FRAME: HookFrame = {
  content: 'hello world',
  importance: 'normal',
  scope: 'sess-7',
  source: 'claude-code',
  metadata: {
    cwd: '/proj',
    timestamp_iso: '2026-04-28T10:00:00.000Z',
    event_type: 'user-prompt-submit',
  },
};

describe('createCliBridge.callMcpTool', () => {
  it('spawns hive-mind-cli with mcp call args and parses success', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: jsonResultEnvelope({ id: 1 }) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });

    const result = await bridge.callMcpTool<{ id: number }>('save_memory', { content: 'x' });
    expect(result.id).toBe(1);

    expect(records).toHaveLength(1);
    expect(records[0].command).toBe('hive-mind-cli');
    expect(records[0].args).toEqual([
      'mcp', 'call', 'save_memory',
      '--args', JSON.stringify({ content: 'x' }),
      '--json',
      '--timeout-ms', '5000',
    ]);
  });

  it('honours custom cli_path', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: jsonResultEnvelope({ ok: 1 }) });
    const bridge = createCliBridge({ spawnImpl, cli_path: '/usr/local/bin/hmc', max_retries: 0 });
    await bridge.callMcpTool('any_tool', {});
    expect(records[0].command).toBe('/usr/local/bin/hmc');
  });

  it('throws when CLI exits non-zero', async () => {
    const spawnImpl = makeSpawnImpl([], {
      stdout: '',
      stderr: 'boom',
      exitCode: 2,
    });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    await expect(bridge.callMcpTool('save_memory', {})).rejects.toThrow(/exited with code 2/);
  });

  it('throws when stdout is malformed JSON', async () => {
    const spawnImpl = makeSpawnImpl([], { stdout: 'not-json{', exitCode: 0 });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    await expect(bridge.callMcpTool('any', {})).rejects.toThrow(/failed to parse CLI JSON output/);
  });

  it('throws when result.ok is false', async () => {
    const stdout = JSON.stringify({ ok: false, tool: 'save_memory', error: 'tool missing' });
    const spawnImpl = makeSpawnImpl([], { stdout });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    await expect(bridge.callMcpTool('save_memory', {})).rejects.toThrow(/save_memory failed/);
  });

  it('throws when result.isError is true (tool-reported error)', async () => {
    const stdout = JSON.stringify({
      ok: true,
      tool: 'recall_memory',
      isError: true,
      content: [{ type: 'text', text: 'no such workspace' }],
    });
    const spawnImpl = makeSpawnImpl([], { stdout });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    await expect(bridge.callMcpTool('recall_memory', {})).rejects.toThrow(/no such workspace/);
  });

  it('returns raw McpCallResult when content text is not JSON-parseable', async () => {
    const stdout = JSON.stringify({
      ok: true,
      tool: 'plain',
      content: [{ type: 'text', text: 'human-readable output' }],
      isError: false,
    });
    const spawnImpl = makeSpawnImpl([], { stdout });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    const result = await bridge.callMcpTool<{ ok: boolean; content?: unknown[] }>('plain', {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
  });
});

describe('createCliBridge.saveMemory (Commit 1.4 wire format)', () => {
  it('passes only content + importance + source to save_memory; embeds scope/parent/source/event in content prefix', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: jsonResultEnvelope({ id: 9, workspace: 'personal' }) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });

    const result = await bridge.saveMemory(SAMPLE_FRAME);
    expect(result).toEqual({ id: '9', success: true, workspace: 'personal' });

    const wireArgs = JSON.parse(records[0].args[4] as string) as Record<string, unknown>;
    expect(Object.keys(wireArgs).sort()).toEqual(['content', 'importance', 'source']);
    expect(wireArgs['source']).toBe('system');
    expect(wireArgs['importance']).toBe('normal');
    expect(wireArgs['content']).toContain('[hm session:sess-7 src:claude-code event:user-prompt-submit] ');
    expect(wireArgs['content']).toContain('hello world');
  });

  it('includes workspace arg when active workspace id is set', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: jsonResultEnvelope({ id: 1, workspace: 'team-foo' }) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    bridge.setWorkspaceById('team-foo');

    await bridge.saveMemory(SAMPLE_FRAME);
    const wireArgs = JSON.parse(records[0].args[4] as string) as Record<string, unknown>;
    expect(wireArgs['workspace']).toBe('team-foo');
  });

  it('per-call workspace override beats setWorkspaceById', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: jsonResultEnvelope({ id: 2 }) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    bridge.setWorkspaceById('default-ws');

    await bridge.saveMemory(SAMPLE_FRAME, { workspace: 'override-ws' });
    const wireArgs = JSON.parse(records[0].args[4] as string) as Record<string, unknown>;
    expect(wireArgs['workspace']).toBe('override-ws');
  });
});

describe('createCliBridge.recallMemory', () => {
  it('returns MemoryHit[] when upstream replies with a JSON array', async () => {
    const hits = [{
      id: 1,
      content: 'past',
      importance: 'normal',
      source: 'system',
      score: 0.91,
      created_at: '2026-04-28T10:00:00.000Z',
      from: 'personal',
    }];
    const spawnImpl = makeSpawnImpl([], { stdout: jsonResultEnvelope(hits) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    const out = await bridge.recallMemory('past');
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(0.91);
  });

  it('returns [] when upstream responds with the "No memories found" plain-text envelope', async () => {
    const spawnImpl = makeSpawnImpl([], { stdout: plainTextEnvelope('No memories found for query: "test"') });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    const out = await bridge.recallMemory('test');
    expect(out).toEqual([]);
  });

  it('passes query + limit + scope + profile through wire args', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: plainTextEnvelope('No memories found for query: "x"') });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    await bridge.recallMemory('x', { limit: 5, scope: 'all', profile: 'recent' });
    const wireArgs = JSON.parse(records[0].args[4] as string) as Record<string, unknown>;
    expect(wireArgs).toMatchObject({ query: 'x', limit: 5, scope: 'all', profile: 'recent' });
  });
});

describe('createCliBridge.cleanupFrames', () => {
  it('calls cleanup_frames and returns pruned count', async () => {
    const records: MockSpawnRecord[] = [];
    const spawnImpl = makeSpawnImpl(records, { stdout: jsonResultEnvelope({ pruned: 7 }) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    const out = await bridge.cleanupFrames();
    expect(records[0].args[2]).toBe('cleanup_frames');
    expect(out.pruned).toBe(7);
  });

  it('falls back to .deleted alias if upstream uses that field name', async () => {
    const spawnImpl = makeSpawnImpl([], { stdout: jsonResultEnvelope({ deleted: 3 }) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    const out = await bridge.cleanupFrames();
    expect(out.pruned).toBe(3);
  });
});

describe('createCliBridge workspace state', () => {
  it('setWorkspaceById + getActiveWorkspaceId round-trip', () => {
    const spawnImpl = makeSpawnImpl([], { stdout: jsonResultEnvelope({}) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0 });
    expect(bridge.getActiveWorkspaceId()).toBeUndefined();
    bridge.setWorkspaceById('foo');
    expect(bridge.getActiveWorkspaceId()).toBe('foo');
    bridge.setWorkspaceById(undefined);
    expect(bridge.getActiveWorkspaceId()).toBeUndefined();
  });

  it('initial_workspace_id seeds the active id', () => {
    const spawnImpl = makeSpawnImpl([], { stdout: jsonResultEnvelope({}) });
    const bridge = createCliBridge({ spawnImpl, max_retries: 0, initial_workspace_id: 'startup-ws' });
    expect(bridge.getActiveWorkspaceId()).toBe('startup-ws');
  });
});
