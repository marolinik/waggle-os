import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MindDB } from '@waggle/hive-mind-core';
import { runHookCall, runHookCallCommand } from '../src/commands/hook-call.js';

describe('internal hook-call fast path', () => {
  let dataDir: string;
  let previousDataDir: string | undefined;
  let previousScopes: string | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'hive-mind-hook-call-'));
    previousDataDir = process.env.HIVE_MIND_DATA_DIR;
    previousScopes = process.env.HIVE_MIND_SCOPES;
    process.env.HIVE_MIND_DATA_DIR = dataDir;
    delete process.env.HIVE_MIND_SCOPES;
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.HIVE_MIND_DATA_DIR;
    else process.env.HIVE_MIND_DATA_DIR = previousDataDir;
    if (previousScopes === undefined) delete process.env.HIVE_MIND_SCOPES;
    else process.env.HIVE_MIND_SCOPES = previousScopes;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns the MCP envelope expected by the shim for save_memory', () => {
    const result = runHookCall({
      tool: 'save_memory',
      args: {
        content: 'durable hook decision',
        importance: 'important',
        source: 'system',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      tool: 'save_memory',
      isError: false,
      content: [{ type: 'text' }],
    });
    expect(JSON.parse(result.content?.[0]?.text ?? '')).toMatchObject({
      id: '1',
      success: true,
      workspace: 'personal',
    });

    const db = new MindDB(join(dataDir, 'personal.mind'));
    try {
      expect(db.getDatabase().prepare(
        'SELECT content, importance, source FROM memory_frames WHERE id = 1',
      ).get()).toEqual({
        content: 'durable hook decision',
        importance: 'important',
        source: 'system',
      });
    } finally {
      db.close();
    }
  });

  it('preserves MCP save defaults', () => {
    const result = runHookCall({ tool: 'save_memory', args: { content: 'defaulted frame' } });
    expect(result.ok).toBe(true);
    const db = new MindDB(join(dataDir, 'personal.mind'));
    try {
      expect(db.getDatabase().prepare(
        'SELECT importance, source FROM memory_frames WHERE id = 1',
      ).get()).toEqual({ importance: 'normal', source: 'agent_inferred' });
    } finally {
      db.close();
    }
  });

  it('enforces MCP memory scopes before opening a mind', () => {
    process.env.HIVE_MIND_SCOPES = 'memory:read';
    const deniedSave = runHookCall({
      tool: 'save_memory',
      args: { content: 'must not persist' },
    });
    expect(deniedSave).toMatchObject({
      ok: false,
      tool: 'save_memory',
      error: expect.stringMatching(/memory:write/i),
    });
    expect(existsSync(join(dataDir, 'personal.mind'))).toBe(false);

    const allowedRecall = runHookCall({
      tool: 'recall_memory',
      args: { query: '', scope: 'personal' },
    });
    expect(allowedRecall.ok).toBe(true);

    process.env.HIVE_MIND_SCOPES = 'unrecognized';
    expect(runHookCall({
      tool: 'save_memory',
      args: { content: 'still denied' },
    })).toMatchObject({ ok: false, error: expect.stringMatching(/memory:write/i) });

    process.env.HIVE_MIND_SCOPES = 'memory:write';
    expect(runHookCall({
      tool: 'save_memory',
      args: { content: 'write implies read' },
    }).ok).toBe(true);
    expect(runHookCall({
      tool: 'recall_memory',
      args: { query: '', scope: 'personal' },
    }).ok).toBe(true);
  });

  it('returns bounded important/recent hits for empty personal recall', () => {
    runHookCall({
      tool: 'save_memory',
      args: { content: 'normal frame', importance: 'normal', source: 'system' },
    });
    runHookCall({
      tool: 'save_memory',
      args: { content: 'critical frame', importance: 'critical', source: 'system' },
    });

    const result = runHookCall({
      tool: 'recall_memory',
      args: { query: '', limit: 1, scope: 'personal' },
    });
    expect(result.ok).toBe(true);
    const hits = JSON.parse(result.content?.[0]?.text ?? '') as Array<{ content: string }>;
    expect(hits).toEqual([expect.objectContaining({ content: 'critical frame' })]);
  });

  it('uses the upstream no-results text shape', () => {
    const result = runHookCall({
      tool: 'recall_memory',
      args: { query: '', scope: 'personal' },
    });
    expect(result).toMatchObject({
      ok: true,
      tool: 'recall_memory',
      isError: false,
      content: [{ type: 'text', text: 'No memories found for query: ""' }],
    });
  });

  it('targets a validated current workspace without falling back to personal', () => {
    const workspaceDir = join(dataDir, 'workspaces', 'project-one');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(
      join(workspaceDir, 'workspace.json'),
      JSON.stringify({ id: 'project-one', name: 'Project One' }),
      'utf8',
    );
    expect(runHookCall({
      tool: 'save_memory',
      args: {
        content: 'workspace frame',
        workspace: 'project-one',
      },
    }).ok).toBe(true);

    const recalled = runHookCall({
      tool: 'recall_memory',
      args: { query: '', scope: 'current', workspace: 'project-one' },
    });
    expect(JSON.parse(recalled.content?.[0]?.text ?? '')).toEqual([
      expect.objectContaining({ content: 'workspace frame', from: 'workspace:project-one' }),
    ]);
    expect(existsSync(join(dataDir, 'personal.mind'))).toBe(false);
  });

  it.each([
    { tool: 'recall_memory', args: { query: 'semantic query' }, error: /empty query/i },
    { tool: 'recall_memory', args: { query: '', scope: 'all' }, error: /scope/i },
    { tool: 'recall_memory', args: { query: '', profile: 'recent' }, error: /profile/i },
    { tool: 'recall_memory', args: { query: '', scope: 'current' }, error: /workspace/i },
    { tool: 'recall_memory', args: { query: '', scope: 'personal', workspace: 'ignored' }, error: /workspace.*personal/i },
    { tool: 'recall_memory', args: { query: '', limit: 0 }, error: /limit/i },
    { tool: 'recall_memory', args: { query: '', surprise: true }, error: /unsupported.*surprise/i },
    { tool: 'cleanup_frames', args: {}, error: /unsupported tool/i },
    { tool: 'save_memory', args: { content: 42 }, error: /content/i },
    { tool: 'save_memory', args: { content: 'x', importance: 'forever' }, error: /importance/i },
    { tool: 'save_memory', args: { content: 'x', source: 'claude-code' }, error: /source/i },
    { tool: 'save_memory', args: { content: 'x', metadata: {} }, error: /unsupported.*metadata/i },
  ])('fails closed for $tool/$args', ({ tool, args, error }) => {
    const result = runHookCall({ tool, args });
    expect(result).toMatchObject({ ok: false, tool });
    expect(result.error).toMatch(error);
  });

  it('parses the hidden command wire and always emits JSON', () => {
    const output = runHookCallCommand({
      values: {
        json: true,
        args: JSON.stringify({ content: 'command frame' }),
      },
      positionals: ['save_memory'],
    });
    expect(JSON.parse(output)).toMatchObject({ ok: true, tool: 'save_memory' });
  });

  it('rejects malformed command input before touching a mind', () => {
    expect(() => runHookCallCommand({
      values: { json: true, args: '{bad' },
      positionals: ['save_memory'],
    })).toThrow(/valid JSON/i);
    expect(() => runHookCallCommand({
      values: { json: true },
      positionals: [],
    })).toThrow(/tool name/i);
    expect(() => runHookCallCommand({
      values: {},
      positionals: ['save_memory'],
    })).toThrow(/--json/i);
    expect(JSON.parse(runHookCallCommand({
      values: { json: true, args: '[]' },
      positionals: ['save_memory'],
    }))).toMatchObject({ ok: false, tool: 'save_memory', error: expect.stringMatching(/object/i) });
  });
});
