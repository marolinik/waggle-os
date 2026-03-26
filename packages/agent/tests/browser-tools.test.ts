import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserTools, _resetBrowserState } from '../src/browser-tools.js';
import type { ToolDefinition } from '../src/tools.js';

// Mock playwright-core so we never actually spawn a browser
vi.mock('playwright-core', () => {
  throw new Error('Cannot find module \'playwright-core\'');
});

describe('Browser Tools', () => {
  let tools: ToolDefinition[];
  const workspace = '/tmp/test-workspace';

  function getTool(name: string): ToolDefinition {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    _resetBrowserState();
    tools = createBrowserTools(workspace);
  });

  // ── Tool registration ─────────────────────────────────────────────────

  it('creates 6 browser tools', () => {
    expect(tools).toHaveLength(6);
    const names = tools.map(t => t.name);
    expect(names).toContain('browser_navigate');
    expect(names).toContain('browser_screenshot');
    expect(names).toContain('browser_click');
    expect(names).toContain('browser_fill');
    expect(names).toContain('browser_evaluate');
    expect(names).toContain('browser_snapshot');
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

  // ── Playwright not installed ──────────────────────────────────────────

  describe('when playwright-core is not installed', () => {
    it('browser_navigate returns helpful install message', async () => {
      const tool = getTool('browser_navigate');
      const result = await tool.execute({ url: 'https://example.com' });

      expect(result).toContain('playwright-core');
      expect(result).toContain('npm install');
    });

    it('browser_screenshot returns helpful install message', async () => {
      const tool = getTool('browser_screenshot');
      const result = await tool.execute({});

      expect(result).toContain('playwright-core');
    });

    it('browser_click returns helpful install message', async () => {
      const tool = getTool('browser_click');
      const result = await tool.execute({ selector: '#btn' });

      expect(result).toContain('playwright-core');
    });

    it('browser_fill returns helpful install message', async () => {
      const tool = getTool('browser_fill');
      const result = await tool.execute({ selector: '#input', value: 'test' });

      expect(result).toContain('playwright-core');
    });

    it('browser_evaluate returns helpful install message', async () => {
      const tool = getTool('browser_evaluate');
      const result = await tool.execute({ script: 'document.title' });

      expect(result).toContain('playwright-core');
    });

    it('browser_snapshot returns helpful install message', async () => {
      const tool = getTool('browser_snapshot');
      const result = await tool.execute({});

      expect(result).toContain('playwright-core');
    });
  });

  // ── Schema validation ─────────────────────────────────────────────────

  describe('parameter schemas', () => {
    it('browser_navigate requires url', () => {
      const tool = getTool('browser_navigate');
      expect(tool.parameters.required).toEqual(['url']);
      expect((tool.parameters.properties as any).url.type).toBe('string');
    });

    it('browser_click requires selector', () => {
      const tool = getTool('browser_click');
      expect(tool.parameters.required).toEqual(['selector']);
    });

    it('browser_fill requires selector and value', () => {
      const tool = getTool('browser_fill');
      expect(tool.parameters.required).toEqual(['selector', 'value']);
    });

    it('browser_evaluate requires script', () => {
      const tool = getTool('browser_evaluate');
      expect(tool.parameters.required).toEqual(['script']);
    });

    it('browser_screenshot has optional full_page', () => {
      const tool = getTool('browser_screenshot');
      expect((tool.parameters.properties as any).full_page.type).toBe('boolean');
    });

    it('browser_snapshot has no required params', () => {
      const tool = getTool('browser_snapshot');
      expect(tool.parameters.required).toBeUndefined();
    });
  });
});
