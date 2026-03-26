import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HookRegistry } from '../src/hooks.js';
import { loadHooksFromConfig } from '../src/hook-loader.js';

describe('loadHooksFromConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-hooks-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads deny hooks from config file', async () => {
    const configPath = path.join(tmpDir, 'hooks.json');
    fs.writeFileSync(configPath, JSON.stringify({
      hooks: {
        'pre:tool': [
          { type: 'deny', tools: ['bash'], pattern: 'rm -rf' },
        ],
      },
    }));

    const registry = new HookRegistry();
    await loadHooksFromConfig(configPath, registry);

    // Verify a hook was registered by firing pre:tool with matching tool+args
    const result = await registry.fire('pre:tool', {
      toolName: 'bash',
      args: { command: 'rm -rf /' },
    });

    expect(result.cancelled).toBe(true);
    expect(result.reason).toContain('rm -rf');
  });

  it('deny hook blocks matching tool and args pattern', async () => {
    const configPath = path.join(tmpDir, 'hooks.json');
    fs.writeFileSync(configPath, JSON.stringify({
      hooks: {
        'pre:tool': [
          { type: 'deny', tools: ['bash', 'write_file'], pattern: 'secrets' },
        ],
      },
    }));

    const registry = new HookRegistry();
    await loadHooksFromConfig(configPath, registry);

    // bash with "secrets" in args — should block
    const r1 = await registry.fire('pre:tool', {
      toolName: 'bash',
      args: { command: 'cat secrets.txt' },
    });
    expect(r1.cancelled).toBe(true);

    // write_file with "secrets" in args — should block
    const r2 = await registry.fire('pre:tool', {
      toolName: 'write_file',
      args: { path: '/tmp/secrets', content: 'data' },
    });
    expect(r2.cancelled).toBe(true);
  });

  it('deny hook allows non-matching tool or args', async () => {
    const configPath = path.join(tmpDir, 'hooks.json');
    fs.writeFileSync(configPath, JSON.stringify({
      hooks: {
        'pre:tool': [
          { type: 'deny', tools: ['bash'], pattern: 'rm -rf' },
        ],
      },
    }));

    const registry = new HookRegistry();
    await loadHooksFromConfig(configPath, registry);

    // Different tool — should allow
    const r1 = await registry.fire('pre:tool', {
      toolName: 'read_file',
      args: { path: '/tmp/rm -rf' },
    });
    expect(r1.cancelled).toBe(false);

    // Same tool but no pattern match — should allow
    const r2 = await registry.fire('pre:tool', {
      toolName: 'bash',
      args: { command: 'ls -la' },
    });
    expect(r2.cancelled).toBe(false);
  });

  it('returns silently when config file does not exist', async () => {
    const configPath = path.join(tmpDir, 'nonexistent-hooks.json');
    const registry = new HookRegistry();

    // Should not throw
    await loadHooksFromConfig(configPath, registry);

    // Registry should have no hooks — fire returns not cancelled
    const result = await registry.fire('pre:tool', {
      toolName: 'bash',
      args: { command: 'rm -rf /' },
    });
    expect(result.cancelled).toBe(false);
  });
});
