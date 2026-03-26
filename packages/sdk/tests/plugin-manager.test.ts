import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validatePluginManifest } from '../src/plugin-manifest.js';
import { PluginManager } from '../src/plugin-manager.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-plugin-test-'));
}

function writePluginJson(dir: string, manifest: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest), 'utf-8');
}

const VALID_MANIFEST = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  skills: ['summarize'],
};

describe('validatePluginManifest', () => {
  it('validates a correct manifest', () => {
    const result = validatePluginManifest(VALID_MANIFEST);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects manifest with missing name', () => {
    const result = validatePluginManifest({
      version: '1.0.0',
      description: 'No name',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('rejects manifest with missing version', () => {
    const result = validatePluginManifest({
      name: 'test',
      description: 'No version',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects manifest with missing description', () => {
    const result = validatePluginManifest({
      name: 'test',
      version: '1.0.0',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('validates manifest with mcpServers', () => {
    const result = validatePluginManifest({
      name: 'mcp-plugin',
      version: '1.0.0',
      description: 'Has MCP servers',
      mcpServers: [{ name: 'server1', command: 'npx', args: ['serve'] }],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid mcpServers entries', () => {
    const result = validatePluginManifest({
      name: 'bad-mcp',
      version: '1.0.0',
      description: 'Bad MCP',
      mcpServers: [{ name: '', command: '' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('PluginManager', () => {
  let pluginsDir: string;
  let manager: PluginManager;
  const tempDirs: string[] = [];

  beforeEach(() => {
    pluginsDir = makeTempDir();
    tempDirs.push(pluginsDir);
    manager = new PluginManager(pluginsDir);
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('starts with no plugins', () => {
    expect(manager.list()).toEqual([]);
  });

  it('installs a local plugin', () => {
    const sourceDir = makeTempDir();
    tempDirs.push(sourceDir);
    writePluginJson(sourceDir, VALID_MANIFEST);

    manager.installLocal(sourceDir);

    const plugins = manager.list();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('test-plugin');
    expect(plugins[0].version).toBe('1.0.0');

    // Verify plugin files were copied
    const copiedManifest = path.join(pluginsDir, 'test-plugin', 'plugin.json');
    expect(fs.existsSync(copiedManifest)).toBe(true);
  });

  it('rejects installing a plugin with invalid manifest', () => {
    const sourceDir = makeTempDir();
    tempDirs.push(sourceDir);
    writePluginJson(sourceDir, { name: '', version: '1.0.0', description: '' });

    expect(() => manager.installLocal(sourceDir)).toThrow('Invalid plugin manifest');
  });

  it('rejects installing from directory without plugin.json', () => {
    const sourceDir = makeTempDir();
    tempDirs.push(sourceDir);

    expect(() => manager.installLocal(sourceDir)).toThrow('No plugin.json found');
  });

  it('uninstalls a plugin', () => {
    const sourceDir = makeTempDir();
    tempDirs.push(sourceDir);
    writePluginJson(sourceDir, VALID_MANIFEST);

    manager.installLocal(sourceDir);
    expect(manager.list()).toHaveLength(1);

    manager.uninstall('test-plugin');
    expect(manager.list()).toHaveLength(0);

    // Verify plugin directory was removed
    expect(fs.existsSync(path.join(pluginsDir, 'test-plugin'))).toBe(false);
  });

  it('throws when uninstalling a plugin that is not installed', () => {
    expect(() => manager.uninstall('nonexistent')).toThrow('not installed');
  });

  it('persists registry across instances', () => {
    const sourceDir = makeTempDir();
    tempDirs.push(sourceDir);
    writePluginJson(sourceDir, VALID_MANIFEST);

    manager.installLocal(sourceDir);

    // Create a new manager instance pointing at the same directory
    const manager2 = new PluginManager(pluginsDir);
    expect(manager2.list()).toHaveLength(1);
    expect(manager2.list()[0].name).toBe('test-plugin');
  });
});
