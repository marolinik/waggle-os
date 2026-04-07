import { describe, it, expect } from 'vitest';
import { filterToolsForContext, filterAvailableTools } from '../src/tool-filter.js';
import type { ToolDefinition } from '../src/tools.js';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: {},
    execute: async () => ({ result: 'ok' }),
  };
}

const ALL_TOOLS: ToolDefinition[] = [
  // code tools
  makeTool('bash'),
  makeTool('read_file'),
  makeTool('write_file'),
  makeTool('edit_file'),
  makeTool('search_files'),
  makeTool('search_content'),
  makeTool('git_status'),
  makeTool('git_diff'),
  makeTool('git_log'),
  makeTool('git_commit'),
  // research tools (non-overlapping with code)
  makeTool('web_search'),
  makeTool('web_fetch'),
  makeTool('search_memory'),
  makeTool('get_identity'),
  makeTool('get_awareness'),
  makeTool('query_knowledge'),
  // other
  makeTool('save_memory'),
  makeTool('custom_tool'),
];

describe('filterToolsForContext', () => {
  it('general context returns all tools', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'general');
    expect(result).toHaveLength(ALL_TOOLS.length);
    expect(result.map(t => t.name)).toEqual(ALL_TOOLS.map(t => t.name));
  });

  it('code context returns only code-related tools', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'code');
    const names = result.map(t => t.name);
    expect(names).toEqual([
      'bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content',
      'git_status', 'git_diff', 'git_log', 'git_commit',
    ]);
  });

  it('research context excludes bash and git tools', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'research');
    const names = result.map(t => t.name);
    expect(names).toEqual([
      'read_file', 'search_files', 'search_content',
      'web_search', 'web_fetch', 'search_memory', 'get_identity', 'get_awareness', 'query_knowledge',
    ]);
    expect(names).not.toContain('bash');
    expect(names).not.toContain('git_status');
    expect(names).not.toContain('git_diff');
    expect(names).not.toContain('git_log');
    expect(names).not.toContain('git_commit');
  });

  it('config.disabled_tools removes specific tools from result', () => {
    const result = filterToolsForContext(ALL_TOOLS, 'code', {
      disabled_tools: ['bash', 'git_commit'],
    });
    const names = result.map(t => t.name);
    expect(names).not.toContain('bash');
    expect(names).not.toContain('git_commit');
    expect(names).toContain('read_file');
    expect(names).toContain('git_status');
  });
});

describe('filterAvailableTools', () => {
  it('includes tools without checkAvailability', () => {
    const tools = [makeTool('bash'), makeTool('web_search')];
    const result = filterAvailableTools(tools);
    expect(result).toHaveLength(2);
  });

  it('includes tools where checkAvailability returns true', () => {
    const tool: ToolDefinition = {
      ...makeTool('browser'),
      checkAvailability: () => true,
    };
    const result = filterAvailableTools([tool]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('browser');
  });

  it('excludes tools where checkAvailability returns false', () => {
    const tool: ToolDefinition = {
      ...makeTool('browser'),
      checkAvailability: () => false,
    };
    const result = filterAvailableTools([tool]);
    expect(result).toHaveLength(0);
  });

  it('excludes tools where checkAvailability throws', () => {
    const tool: ToolDefinition = {
      ...makeTool('broken_tool'),
      checkAvailability: () => { throw new Error('Connection lost'); },
    };
    const result = filterAvailableTools([tool]);
    expect(result).toHaveLength(0);
  });

  it('handles mixed tools correctly', () => {
    const tools: ToolDefinition[] = [
      makeTool('always_on'),
      { ...makeTool('browser'), checkAvailability: () => true },
      { ...makeTool('git'), checkAvailability: () => false },
      { ...makeTool('broken'), checkAvailability: () => { throw new Error(); } },
    ];
    const result = filterAvailableTools(tools);
    const names = result.map(t => t.name);
    expect(names).toEqual(['always_on', 'browser']);
  });

  it('returns empty array when all tools are unavailable', () => {
    const tools: ToolDefinition[] = [
      { ...makeTool('a'), checkAvailability: () => false },
      { ...makeTool('b'), checkAvailability: () => false },
    ];
    expect(filterAvailableTools(tools)).toHaveLength(0);
  });
});
