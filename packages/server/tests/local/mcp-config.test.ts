/**
 * Persisted MCP config store + boot-time runtime population (Phase 4, C4).
 *
 * C4 was THE foundational Extend-layer gap: `McpRuntime` was instantiated
 * empty at boot and nothing ever called addServer(), so "installed" MCPs were
 * lost on restart and every /api/mcps route would have been dead. These tests
 * cover the store CRUD and the exact populate function local/index.ts calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpRuntime } from '@waggle/agent';
import {
  loadMcpConfig,
  saveMcpServerEntry,
  removeMcpServerEntry,
  validateMcpEntry,
  mcpConfigPath,
  populateMcpRuntimeFromConfig,
} from '../../src/local/mcp-config.js';

describe('mcp-config store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mcpcfg-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty config when the file is missing', () => {
    expect(loadMcpConfig(tmpDir)).toEqual({ mcpServers: {} });
  });

  it('returns an empty config on corrupt JSON (never throws) and quarantines the file', () => {
    fs.writeFileSync(mcpConfigPath(tmpDir), '{ not json !!!', 'utf-8');
    const warnings: string[] = [];
    expect(loadMcpConfig(tmpDir, { warn: (m) => warnings.push(m) })).toEqual({ mcpServers: {} });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('quarantined');
    // The corrupt original is preserved aside, never silently discarded
    const quarantined = fs.readdirSync(tmpDir).filter((f) => f.includes('.corrupt-'));
    expect(quarantined).toHaveLength(1);
    expect(fs.existsSync(mcpConfigPath(tmpDir))).toBe(false);
  });

  it('a save after corruption cannot silently wipe the previous servers (quarantine keeps them)', () => {
    saveMcpServerEntry(tmpDir, 'one', { command: 'node' });
    saveMcpServerEntry(tmpDir, 'two', { command: 'uvx' });
    // Crash-mid-write style truncation
    fs.writeFileSync(mcpConfigPath(tmpDir), '{ "mcpServers": { "one": { "comm', 'utf-8');

    // First touch (read-modify-write save) quarantines, then starts fresh
    const silent = { warn: () => { /* quiet */ } };
    expect(loadMcpConfig(tmpDir, silent)).toEqual({ mcpServers: {} });
    saveMcpServerEntry(tmpDir, 'three', { command: 'bun' });

    expect(Object.keys(loadMcpConfig(tmpDir).mcpServers)).toEqual(['three']);
    // The pre-corruption data is still on disk for manual recovery
    const quarantined = fs.readdirSync(tmpDir).filter((f) => f.includes('.corrupt-'));
    expect(quarantined).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmpDir, quarantined[0]), 'utf-8')).toContain('mcpServers');
  });

  it('returns an empty config when mcpServers is the wrong shape', () => {
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({ mcpServers: 'nope' }), 'utf-8');
    expect(loadMcpConfig(tmpDir)).toEqual({ mcpServers: {} });
  });

  it('save/remove round-trips entries (installer-compatible shape)', () => {
    saveMcpServerEntry(tmpDir, 'filesystem', { command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '/tmp'] });
    saveMcpServerEntry(tmpDir, 'custom-db', { command: 'node', args: ['db.js'], env: { DB_URL: 'sqlite://x' }, workspaceId: 'ws-1' });

    const cfg = loadMcpConfig(tmpDir);
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(['custom-db', 'filesystem']);
    expect(cfg.mcpServers['custom-db'].workspaceId).toBe('ws-1');

    // Upsert replaces, not duplicates
    saveMcpServerEntry(tmpDir, 'filesystem', { command: 'node', args: ['fs.js'] });
    const cfg2 = loadMcpConfig(tmpDir);
    expect(Object.keys(cfg2.mcpServers)).toHaveLength(2);
    expect(cfg2.mcpServers['filesystem'].command).toBe('node');

    expect(removeMcpServerEntry(tmpDir, 'filesystem')).toBe(true);
    expect(removeMcpServerEntry(tmpDir, 'filesystem')).toBe(false);
    expect(Object.keys(loadMcpConfig(tmpDir).mcpServers)).toEqual(['custom-db']);
  });

  it('validateMcpEntry rejects bad names and shapes', () => {
    expect(validateMcpEntry('ok-name_1.2', { command: 'node' })).toBeNull();
    expect(validateMcpEntry('', { command: 'node' })).toMatch(/invalid server name/);
    expect(validateMcpEntry('../escape', { command: 'node' })).toMatch(/invalid server name/);
    expect(validateMcpEntry('has space', { command: 'node' })).toMatch(/invalid server name/);
    expect(validateMcpEntry('x', { command: '' })).toMatch(/command/);
    expect(validateMcpEntry('x', { command: 'node', args: 'nope' })).toMatch(/args/);
    expect(validateMcpEntry('x', { command: 'node', env: { A: 1 } })).toMatch(/env/);
    expect(validateMcpEntry('x', { command: 'node', workspaceId: 7 })).toMatch(/workspaceId/);
    expect(validateMcpEntry('x', null)).toMatch(/object/);
  });

  it('uses ~/.waggle when dataDir is empty (same fallback as index.ts)', () => {
    expect(mcpConfigPath('')).toBe(path.join(os.homedir(), '.waggle', '.mcp.json'));
  });
});

describe('populateMcpRuntimeFromConfig (C4 boot population)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mcpboot-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers valid entries WITHOUT starting them; skips bad ones; never throws', () => {
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({
      mcpServers: {
        'good-one': { command: 'node', args: ['a.js'] },
        'good-two': { command: 'uvx', args: ['srv'], workspaceId: 'ws-9' },
        'no-command': { args: ['broken.js'] },
        'bad name!': { command: 'node' },
      },
    }), 'utf-8');

    const runtime = new McpRuntime();
    const result = populateMcpRuntimeFromConfig(runtime, tmpDir);

    expect(result.registered.sort()).toEqual(['good-one', 'good-two']);
    expect(result.skipped.map((s) => s.name).sort()).toEqual(['bad name!', 'no-command']);

    const states = runtime.getServerStates();
    expect(Object.keys(states).sort()).toEqual(['good-one', 'good-two']);
    // Register-only: nothing spawned at boot
    expect(states['good-one']).toBe('stopped');
    expect(states['good-two']).toBe('stopped');
    // Per-entry workspace scoping survives the round-trip (C19)
    expect(runtime.getServer('good-two')!.config.workspaceId).toBe('ws-9');
  });

  it('is safe to call against an already-populated runtime (duplicates skip, not throw)', () => {
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({
      mcpServers: { dup: { command: 'node' } },
    }), 'utf-8');

    const runtime = new McpRuntime();
    expect(populateMcpRuntimeFromConfig(runtime, tmpDir).registered).toEqual(['dup']);
    const second = populateMcpRuntimeFromConfig(runtime, tmpDir);
    expect(second.registered).toEqual([]);
    expect(second.skipped[0].reason).toMatch(/already registered/);
    expect(Object.keys(runtime.getServerStates())).toEqual(['dup']);
  });

  it('handles a missing config file (empty runtime, no throw)', () => {
    const runtime = new McpRuntime();
    const result = populateMcpRuntimeFromConfig(runtime, tmpDir);
    expect(result.registered).toEqual([]);
    expect(Object.keys(runtime.getServerStates())).toEqual([]);
  });
});
