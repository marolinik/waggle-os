/**
 * MCP hot-reload — refreshMcpIfChanged (steal #7).
 *
 * Reconciles a live McpRuntime with the on-disk `.mcp.json` without a restart:
 * signature fast-path, 3-way add/remove/change diff, restart-only-if-running,
 * and no-teardown on a corrupt file. Uses the same DI'd PassThrough mock-spawn
 * the agent + mcps route tests use so "running" servers are real (stopped)
 * state transitions, not fakes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PassThrough } from 'node:stream';
import { McpRuntime, type McpProcess, type SpawnFn } from '@waggle/agent';
import {
  mcpConfigPath,
  saveMcpServerEntry,
  populateMcpRuntimeFromConfig,
  refreshMcpIfChanged,
  _resetMcpSignatureCache,
} from '../../src/local/mcp-config.js';

interface MockRpcRequest { id?: number | null; method?: string }

function createMockSpawn(): SpawnFn {
  return () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const proc: McpProcess = {
      stdin, stdout, stderr, pid: 4242,
      kill: () => true,
      on: () => proc,
      removeAllListeners: () => proc,
    };
    stdin.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        let req: MockRpcRequest;
        try { req = JSON.parse(line); } catch { continue; }
        if (req.id == null) continue;
        const result = req.method === 'tools/list'
          ? { tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object' } }] }
          : {};
        setImmediate(() => stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n'));
      }
    });
    return proc;
  };
}

/** Bump the config file's mtime forward so the signature fast-path sees the
 *  write as a genuine external edit (what a real editor does). */
function writeConfig(dir: string, servers: Record<string, unknown>, mtimeStep: number): void {
  fs.writeFileSync(mcpConfigPath(dir), JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8');
  const t = new Date(Date.now() + mtimeStep * 1000);
  fs.utimesSync(mcpConfigPath(dir), t, t);
}

describe('refreshMcpIfChanged (MCP hot-reload)', () => {
  let tmpDir: string;
  let runtime: McpRuntime;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mcp-reload-'));
    runtime = new McpRuntime({ spawn: createMockSpawn() });
    _resetMcpSignatureCache();
  });

  afterEach(async () => {
    await runtime.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('no-change fast path: an unchanged file is a no-op', async () => {
    saveMcpServerEntry(tmpDir, 'alpha', { command: 'node' });
    populateMcpRuntimeFromConfig(runtime, tmpDir);

    // First call establishes the signature; runtime already matches the file.
    const first = await refreshMcpIfChanged(runtime, tmpDir);
    expect(first.changed).toBe(false);
    expect(first.added).toEqual([]);
    expect(first.removed).toEqual([]);

    // Second call short-circuits on the unchanged signature.
    const second = await refreshMcpIfChanged(runtime, tmpDir);
    expect(second).toEqual({ changed: false, added: [], removed: [], reregistered: [], restarted: [], skipped: [] });
  });

  it('added: a new server in the file is registered stopped', async () => {
    writeConfig(tmpDir, { alpha: { command: 'node' } }, 1);
    populateMcpRuntimeFromConfig(runtime, tmpDir);
    await refreshMcpIfChanged(runtime, tmpDir); // prime the signature

    writeConfig(tmpDir, { alpha: { command: 'node' }, beta: { command: 'uvx' } }, 2);
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.changed).toBe(true);
    expect(result.added).toEqual(['beta']);
    expect(runtime.getServer('beta')?.getState()).toBe('stopped');
  });

  it('removed: a server dropped from the file is removed from the runtime', async () => {
    writeConfig(tmpDir, { alpha: { command: 'node' }, beta: { command: 'uvx' } }, 1);
    populateMcpRuntimeFromConfig(runtime, tmpDir);
    await refreshMcpIfChanged(runtime, tmpDir);

    writeConfig(tmpDir, { alpha: { command: 'node' } }, 2);
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.removed).toEqual(['beta']);
    expect(runtime.getServer('beta')).toBeUndefined();
    expect(runtime.getServer('alpha')).toBeDefined();
  });

  it('changed (stopped server): re-registers with new config but does not start it', async () => {
    writeConfig(tmpDir, { alpha: { command: 'node', args: ['a.js'] } }, 1);
    populateMcpRuntimeFromConfig(runtime, tmpDir);
    await refreshMcpIfChanged(runtime, tmpDir);

    writeConfig(tmpDir, { alpha: { command: 'node', args: ['b.js'] } }, 2);
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.reregistered).toEqual(['alpha']);
    expect(result.restarted).toEqual([]);
    expect(runtime.getServer('alpha')?.config.args).toEqual(['b.js']);
    expect(runtime.getServer('alpha')?.getState()).toBe('stopped');
  });

  it('changed (running server): re-registers AND restarts', async () => {
    writeConfig(tmpDir, { alpha: { command: 'node', args: ['a.js'] } }, 1);
    populateMcpRuntimeFromConfig(runtime, tmpDir);
    await runtime.getServer('alpha')!.start();
    expect(runtime.getServer('alpha')?.getState()).toBe('ready');
    await refreshMcpIfChanged(runtime, tmpDir);

    writeConfig(tmpDir, { alpha: { command: 'node', args: ['b.js'] } }, 2);
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.reregistered).toEqual(['alpha']);
    expect(result.restarted).toEqual(['alpha']);
    expect(runtime.getServer('alpha')?.config.args).toEqual(['b.js']);
    expect(runtime.getServer('alpha')?.getState()).toBe('ready');
  });

  it('parse failure: warns and never tears down running servers', async () => {
    writeConfig(tmpDir, { alpha: { command: 'node' } }, 1);
    populateMcpRuntimeFromConfig(runtime, tmpDir);
    await runtime.getServer('alpha')!.start();
    await refreshMcpIfChanged(runtime, tmpDir);

    // Corrupt the file, forward the mtime.
    fs.writeFileSync(mcpConfigPath(tmpDir), '{ "mcpServers": { not json', 'utf-8');
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(mcpConfigPath(tmpDir), t, t);

    const warnings: string[] = [];
    const result = await refreshMcpIfChanged(runtime, tmpDir, { warn: (m) => warnings.push(m) });

    expect(result.error).toBeDefined();
    expect(result.removed).toEqual([]);
    expect(warnings).toHaveLength(1);
    // The server survives the bad file, still running.
    expect(runtime.getServer('alpha')?.getState()).toBe('ready');
  });

  it('skips invalid entries without registering them', async () => {
    writeConfig(tmpDir, {}, 1);
    populateMcpRuntimeFromConfig(runtime, tmpDir);
    await refreshMcpIfChanged(runtime, tmpDir);

    // Empty command fails validateMcpEntry.
    writeConfig(tmpDir, { bad: { command: '' } }, 2);
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.added).toEqual([]);
    expect(result.skipped.map((s) => s.name)).toContain('bad');
    expect(runtime.getServer('bad')).toBeUndefined();
  });
});
