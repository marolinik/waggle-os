import { describe, it, expect } from 'vitest';
import { filterToolsForContext } from '../src/tool-filter.js';
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
