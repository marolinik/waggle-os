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
import { MCP_SERVERS, createMarketplaceMcpProvenance } from '@waggle/marketplace';
import {
  loadMcpConfig,
  saveMcpServerEntry,
  removeMcpServerEntry,
  validateMcpEntry,
  mcpConfigPath,
  populateMcpRuntimeFromConfig,
  refreshMcpIfChanged,
  _resetMcpSignatureCache,
  type PersistedMcpEntry,
} from '../../src/local/mcp-config.js';

const canonicalSource = {
  name: 'mcp_registry',
  source_type: 'registry',
  is_custom: false,
} as const;

function canonicalEntry(packageName: string, envValues: Record<string, string> = {}): PersistedMcpEntry {
  const pkg = MCP_SERVERS.find((candidate) => candidate.name === packageName);
  if (!pkg?.install_manifest?.mcp_config || !pkg.version) {
    throw new Error(`Missing canonical MCP fixture: ${packageName}`);
  }
  const config = pkg.install_manifest.mcp_config;
  const env = Object.fromEntries(
    Object.keys(config.env ?? {}).map((key) => [key, envValues[key] ?? 'fixture-secret']),
  );
  return {
    command: config.command,
    args: [...config.args],
    ...(Object.keys(env).length > 0 ? { env } : {}),
    provenance: createMarketplaceMcpProvenance(
      canonicalSource,
      { name: pkg.name, version: pkg.version },
      config,
    ),
  };
}

describe('mcp-config store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mcpcfg-'));
    _resetMcpSignatureCache();
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

  it('quarantines a structurally invalid config before a later save can overwrite it', () => {
    const invalidConfig = JSON.stringify({ mcpServers: [], recoveryMarker: 'keep-me' });
    fs.writeFileSync(mcpConfigPath(tmpDir), invalidConfig, 'utf-8');

    expect(loadMcpConfig(tmpDir, { warn: () => { /* quiet */ } })).toEqual({ mcpServers: {} });
    saveMcpServerEntry(tmpDir, 'replacement', { command: 'node' });

    expect(loadMcpConfig(tmpDir).mcpServers.replacement).toEqual({ command: 'node' });
    const quarantined = fs.readdirSync(tmpDir).filter((name) => name.includes('.corrupt-'));
    expect(quarantined).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmpDir, quarantined[0]), 'utf-8')).toBe(invalidConfig);
  });

  it('save/remove round-trips entries (installer-compatible shape)', () => {
    saveMcpServerEntry(tmpDir, 'custom-filesystem', { command: 'npx', args: ['@modelcontextprotocol/server-filesystem', '/tmp'] });
    saveMcpServerEntry(tmpDir, 'custom-db', { command: 'node', args: ['db.js'], env: { DB_URL: 'sqlite://x' }, workspaceId: 'ws-1' });

    const cfg = loadMcpConfig(tmpDir);
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(['custom-db', 'custom-filesystem']);
    expect(cfg.mcpServers['custom-db'].workspaceId).toBe('ws-1');

    // Upsert replaces, not duplicates
    saveMcpServerEntry(tmpDir, 'custom-filesystem', { command: 'node', args: ['fs.js'] });
    const cfg2 = loadMcpConfig(tmpDir);
    expect(Object.keys(cfg2.mcpServers)).toHaveLength(2);
    expect(cfg2.mcpServers['custom-filesystem'].command).toBe('node');

    expect(removeMcpServerEntry(tmpDir, 'custom-filesystem')).toBe(true);
    expect(removeMcpServerEntry(tmpDir, 'custom-filesystem')).toBe(false);
    expect(Object.keys(loadMcpConfig(tmpDir).mcpServers)).toEqual(['custom-db']);
  });

  it('round-trips a canonical marketplace provenance receipt without exposing env values', () => {
    const entry = canonicalEntry('brave-search', { BRAVE_API_KEY: 'sentinel-secret' });
    saveMcpServerEntry(tmpDir, 'brave-search', entry);

    const persisted = loadMcpConfig(tmpDir).mcpServers['brave-search'];
    expect(persisted).toEqual(entry);
    expect(JSON.stringify(persisted.provenance)).not.toContain('sentinel-secret');
  });

  it('upgrades an exact legacy marketplace profile without losing configured secrets', () => {
    const legacy = canonicalEntry('brave-search', { BRAVE_API_KEY: 'legacy-secret' });
    delete legacy.provenance;
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({ mcpServers: {
      'brave-search': legacy,
      'custom-safe': { command: 'node', args: ['safe.js'] },
    } }), 'utf-8');

    const loaded = loadMcpConfig(tmpDir);
    expect(loaded.mcpServers['brave-search'].provenance).toMatchObject({
      kind: 'marketplace',
      packageName: 'brave-search',
    });
    expect(loaded.mcpServers['brave-search'].env).toEqual({ BRAVE_API_KEY: 'legacy-secret' });
    expect(loaded.mcpServers['custom-safe']).toEqual({ command: 'node', args: ['safe.js'] });
    expect(fs.readdirSync(tmpDir).some((name) => name.startsWith('.mcp.json.quarantine-'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(mcpConfigPath(tmpDir), 'utf-8'))
      .mcpServers['brave-search'].provenance.packageName).toBe('brave-search');
  });

  it('quarantines provenance downgrade and profile tampering while preserving custom MCPs', () => {
    const tampered = canonicalEntry('brave-search', { BRAVE_API_KEY: 'sentinel-quarantine-secret' });
    tampered.command = 'powershell.exe';
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({
      mcpServers: {
        memory: {
          command: 'powershell.exe',
          args: ['--yes', '--ignore-scripts', '@modelcontextprotocol/server-memory@2026.7.4'],
        },
        'brave-search': tampered,
        'custom-safe': { command: 'node', args: ['safe.js'] },
      },
    }), 'utf-8');
    const warnings: string[] = [];

    expect(loadMcpConfig(tmpDir, { warn: (message) => warnings.push(message) })).toEqual({
      mcpServers: {
        'custom-safe': { command: 'node', args: ['safe.js'] },
      },
    });
    expect(warnings.join('\n')).toMatch(/provenance|approved marketplace profile/i);

    const quarantineName = fs.readdirSync(tmpDir).find((name) => name.startsWith('.mcp.json.quarantine-'));
    expect(quarantineName).toBeDefined();
    const quarantine = JSON.parse(fs.readFileSync(path.join(tmpDir, quarantineName!), 'utf-8'));
    expect(quarantine.entries.memory.reason).toMatch(/provenance/i);
    expect(quarantine.entries['brave-search'].reason).toMatch(/profile|command/i);
    expect(quarantine.entries['brave-search'].entry.env).toEqual({
      BRAVE_API_KEY: 'sentinel-quarantine-secret',
    });
    const active = fs.readFileSync(mcpConfigPath(tmpDir), 'utf-8');
    expect(active).not.toContain('sentinel-quarantine-secret');
    expect(Object.keys(JSON.parse(active).mcpServers)).toEqual(['custom-safe']);
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

  it('requires and verifies provenance for reserved marketplace server names', () => {
    const memory = canonicalEntry('memory');
    expect(validateMcpEntry('memory', memory)).toBeNull();
    expect(validateMcpEntry('memory', { command: memory.command, args: memory.args })).toMatch(/provenance/i);
    expect(validateMcpEntry('memory', {
      ...memory,
      provenance: { ...memory.provenance!, profileDigest: `sha256:${'0'.repeat(64)}` },
    })).toMatch(/digest|provenance/i);
    expect(validateMcpEntry('custom-memory', { command: 'node', args: ['memory.js'] })).toBeNull();
    expect(validateMcpEntry('postgres', { command: 'node', args: ['custom.js'] })).toMatch(/catalog|reserved/i);

    const secretA = canonicalEntry('brave-search', { BRAVE_API_KEY: 'secret-a' });
    const secretB = canonicalEntry('brave-search', { BRAVE_API_KEY: 'secret-b' });
    expect(secretA.provenance).toEqual(secretB.provenance);
    expect(validateMcpEntry('brave-search', secretA)).toBeNull();
    expect(validateMcpEntry('brave-search', secretB)).toBeNull();

    const variants: PersistedMcpEntry[] = [
      { ...secretA, args: [...secretA.args!, '--drift'] },
      { ...secretA, env: { ...secretA.env, NODE_OPTIONS: '--require=evil.js' } },
      { ...secretA, provenance: { ...secretA.provenance!, packageVersion: '999.0.0' } },
      { ...secretA, provenance: { ...secretA.provenance!, npmPackage: '@scope/other@1.0.0' } },
    ];
    for (const variant of variants) expect(validateMcpEntry('brave-search', variant)).not.toBeNull();
  });

  it('uses ~/.waggle when dataDir is empty (same fallback as index.ts)', () => {
    expect(mcpConfigPath('')).toBe(path.join(os.homedir(), '.waggle', '.mcp.json'));
  });
});

describe('populateMcpRuntimeFromConfig (C4 boot population)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mcpboot-'));
    _resetMcpSignatureCache();
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

  it('hot reload preserves running configuration when mcpServers has an array shape', async () => {
    const original = { mcpServers: { 'custom-safe': { command: 'node', args: ['safe.js'] } } };
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify(original), 'utf-8');
    const runtime = new McpRuntime();
    expect(populateMcpRuntimeFromConfig(runtime, tmpDir).registered).toEqual(['custom-safe']);

    const invalidConfig = JSON.stringify({ mcpServers: [], recoveryMarker: 'keep-me' });
    fs.writeFileSync(mcpConfigPath(tmpDir), invalidConfig, 'utf-8');
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.error).toMatch(/mcpServers/i);
    expect(result.removed).toEqual([]);
    expect(runtime.getServer('custom-safe')).toBeDefined();
    expect(fs.readFileSync(mcpConfigPath(tmpDir), 'utf-8')).toBe(invalidConfig);
  });

  it('registers verified marketplace entries at boot and removes them when hot-reload detects tampering', async () => {
    const memory = canonicalEntry('memory');
    const custom = { command: 'node', args: ['safe.js'] };
    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({
      mcpServers: { memory, 'custom-safe': custom },
    }), 'utf-8');
    const runtime = new McpRuntime();

    expect(populateMcpRuntimeFromConfig(runtime, tmpDir).registered.sort()).toEqual(['custom-safe', 'memory']);
    expect(runtime.getServer('memory')).toBeDefined();

    fs.writeFileSync(mcpConfigPath(tmpDir), JSON.stringify({
      mcpServers: {
        memory: {
          ...memory,
          provenance: { ...memory.provenance!, profileDigest: `sha256:${'f'.repeat(64)}` },
        },
        'custom-safe': custom,
      },
    }), 'utf-8');
    const result = await refreshMcpIfChanged(runtime, tmpDir);

    expect(result.removed).toEqual(['memory']);
    expect(result.skipped[0]).toMatchObject({ name: 'memory' });
    expect(result.skipped[0].reason).toMatch(/digest|provenance/i);
    expect(runtime.getServer('memory')).toBeUndefined();
    expect(runtime.getServer('custom-safe')).toBeDefined();
    expect(fs.readdirSync(tmpDir).some((name) => name.startsWith('.mcp.json.quarantine-'))).toBe(true);

    const quarantineCount = fs.readdirSync(tmpDir)
      .filter((name) => name.startsWith('.mcp.json.quarantine-')).length;
    const second = await refreshMcpIfChanged(runtime, tmpDir);
    expect(second).toMatchObject({ changed: false, added: [], removed: [], reregistered: [], skipped: [] });
    expect(fs.readdirSync(tmpDir)
      .filter((name) => name.startsWith('.mcp.json.quarantine-'))).toHaveLength(quarantineCount);
  });
});
