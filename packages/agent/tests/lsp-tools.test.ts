import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLspTools,
  _resetLspState,
  spawnLspServerProcess,
  stopLspServerProcess,
} from '../src/lsp-tools.js';
import type { ToolDefinition } from '../src/tools.js';

// Mock child_process.spawn to prevent actually spawning LSP servers
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    spawn: vi.fn((command, args, options) => {
      if (
        command === process.execPath
        && Array.isArray(args)
        && args[0] === '-e'
        && args[2] === process.execPath
      ) {
        return original.spawn(command, args, options);
      }
      throw new Error('spawn ENOENT');
    }),
  };
});

describe('LSP Tools', () => {
  let tools: ToolDefinition[];
  const workspace = '/tmp/test-workspace';

  function getTool(name: string): ToolDefinition {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    _resetLspState();
    tools = createLspTools(workspace);
  });

  // ── Tool registration ─────────────────────────────────────────────────

  it('spawns LSP through the sidecar-owned boundary with a sanitized environment', async () => {
    const previous = process.env.WAGGLE_LSP_AMBIENT_SECRET;
    process.env.WAGGLE_LSP_AMBIENT_SECRET = 'must-not-reach-language-server';
    const fakeProcess = { pid: 4242 };
    const resolveCommand = vi.fn(async () => ({
      binary: process.execPath,
      args: ['/trusted/typescript-language-server.js', '--stdio'],
    }));
    const spawnOwned = vi.fn(() => fakeProcess);

    try {
      const result = await spawnLspServerProcess(workspace, { resolveCommand, spawnOwned });
      expect(result).toBe(fakeProcess);
      expect(resolveCommand).toHaveBeenCalledWith(
        'typescript-language-server',
        ['--stdio'],
        process.platform,
        expect.objectContaining({ env: expect.any(Object) }),
      );
      const resolvedEnv = resolveCommand.mock.calls[0][3].env as NodeJS.ProcessEnv;
      expect(resolvedEnv.WAGGLE_LSP_AMBIENT_SECRET).toBeUndefined();
      expect(spawnOwned).toHaveBeenCalledWith(
        process.execPath,
        ['/trusted/typescript-language-server.js', '--stdio'],
        expect.objectContaining({
          cwd: workspace,
          env: resolvedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }),
      );
      expect(spawnOwned.mock.calls[0][2]).not.toHaveProperty('shell');
    } finally {
      if (previous === undefined) delete process.env.WAGGLE_LSP_AMBIENT_SECRET;
      else process.env.WAGGLE_LSP_AMBIENT_SECRET = previous;
    }
  });

  it.runIf(process.platform === 'win32')(
    'explicit LSP stop removes the supervised target and its descendant',
    async () => {
      const targetSource = [
        "const { spawn } = require('node:child_process');",
        "const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
        'descendant.unref();',
        'console.log(JSON.stringify({ pid: process.pid, descendantPid: descendant.pid }));',
        'setInterval(() => {}, 1000);',
      ].join('\n');
      const child = await spawnLspServerProcess(process.cwd(), {
        resolveCommand: async () => ({
          binary: process.execPath,
          args: ['-e', targetSource],
        }),
      });
      const receipt = await new Promise<{ pid: number; descendantPid: number }>((resolveReceipt, reject) => {
        const timer = setTimeout(() => reject(new Error('LSP target produced no ownership receipt')), 5_000);
        let output = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf8');
          const line = output.split(/\r?\n/, 1)[0];
          try {
            const parsed = JSON.parse(line) as { pid: number; descendantPid: number };
            clearTimeout(timer);
            resolveReceipt(parsed);
          } catch { /* wait for a complete JSON line */ }
        });
      });
      const isAlive = (pid: number): boolean => {
        try { process.kill(pid, 0); return true; } catch { return false; }
      };

      try {
        await stopLspServerProcess(child, 8_000);
        await vi.waitUntil(
          () => !isAlive(receipt.pid) && !isAlive(receipt.descendantPid),
          { timeout: 5_000, interval: 50 },
        );
        expect(isAlive(receipt.pid)).toBe(false);
        expect(isAlive(receipt.descendantPid)).toBe(false);
      } finally {
        const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
        for (const pid of [receipt.pid, receipt.descendantPid, child.pid]) {
          if (!pid || !isAlive(pid)) continue;
          try {
            execFileSync(join(windowsRoot, 'System32', 'taskkill.exe'), [
              '/PID', String(pid), '/T', '/F',
            ], { stdio: 'ignore', windowsHide: true });
          } catch { /* best-effort fixture cleanup */ }
        }
      }
    },
    20_000,
  );

  it('creates 4 LSP tools', () => {
    expect(tools).toHaveLength(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('lsp_diagnostics');
    expect(names).toContain('lsp_definition');
    expect(names).toContain('lsp_references');
    expect(names).toContain('lsp_hover');
  });

  it('tool schemas are well-formed', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });

  // ── Schema validation ─────────────────────────────────────────────────

  describe('parameter schemas', () => {
    it('lsp_diagnostics requires file_path', () => {
      const tool = getTool('lsp_diagnostics');
      expect(tool.parameters.required).toEqual(['file_path']);
    });

    it('lsp_definition requires file_path, line, column', () => {
      const tool = getTool('lsp_definition');
      expect(tool.parameters.required).toEqual(['file_path', 'line', 'column']);
    });

    it('lsp_references requires file_path, line, column', () => {
      const tool = getTool('lsp_references');
      expect(tool.parameters.required).toEqual(['file_path', 'line', 'column']);
    });

    it('lsp_hover requires file_path, line, column', () => {
      const tool = getTool('lsp_hover');
      expect(tool.parameters.required).toEqual(['file_path', 'line', 'column']);
    });
  });

  // ── LSP not available ─────────────────────────────────────────────────

  describe('when typescript-language-server is not available', () => {
    it('lsp_diagnostics returns helpful message for missing file', async () => {
      const tool = getTool('lsp_diagnostics');
      const result = await tool.execute({ file_path: 'nonexistent.ts' });

      expect(result).toContain('Error: File not found');
    });

    it('lsp_definition returns helpful message for missing file', async () => {
      const tool = getTool('lsp_definition');
      const result = await tool.execute({ file_path: 'nonexistent.ts', line: 1, column: 1 });

      expect(result).toContain('Error: File not found');
    });

    it('lsp_references returns helpful message for missing file', async () => {
      const tool = getTool('lsp_references');
      const result = await tool.execute({ file_path: 'nonexistent.ts', line: 1, column: 1 });

      expect(result).toContain('Error: File not found');
    });

    it('lsp_hover returns helpful message for missing file', async () => {
      const tool = getTool('lsp_hover');
      const result = await tool.execute({ file_path: 'nonexistent.ts', line: 1, column: 1 });

      expect(result).toContain('Error: File not found');
    });
  });

  // ── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('lsp_diagnostics handles LSP spawn failure gracefully', async () => {
      // Create a real temp file to pass the file-exists check
      const fs = await import('node:fs');
      const tmpFile = '/tmp/test-workspace/test.ts';
      try { fs.mkdirSync('/tmp/test-workspace', { recursive: true }); } catch { /* dir may already exist */ }
      try { fs.writeFileSync(tmpFile, 'const x = 1;'); } catch { /* best-effort fixture setup */ }

      const tool = getTool('lsp_diagnostics');
      const result = await tool.execute({ file_path: 'test.ts' });

      // Should contain an error message (either about spawn or LSP)
      expect(result).toMatch(/error|LSP|typescript-language-server/i);

      // Cleanup
      try { fs.unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
    });
  });
});
