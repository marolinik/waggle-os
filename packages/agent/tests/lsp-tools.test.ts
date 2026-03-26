import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLspTools, _resetLspState } from '../src/lsp-tools.js';
import type { ToolDefinition } from '../src/tools.js';

// Mock child_process.spawn to prevent actually spawning LSP servers
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original,
    spawn: vi.fn(() => {
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
      try { fs.mkdirSync('/tmp/test-workspace', { recursive: true }); } catch {}
      try { fs.writeFileSync(tmpFile, 'const x = 1;'); } catch {}

      const tool = getTool('lsp_diagnostics');
      const result = await tool.execute({ file_path: 'test.ts' });

      // Should contain an error message (either about spawn or LSP)
      expect(result).toMatch(/error|LSP|typescript-language-server/i);

      // Cleanup
      try { fs.unlinkSync(tmpFile); } catch {}
    });
  });
});
