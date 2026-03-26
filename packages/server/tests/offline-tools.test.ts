/**
 * PM-6: Offline tools tests — verify offline-capable tools are identified
 * and filtering works correctly.
 */

import { describe, it, expect } from 'vitest';
import { createSystemTools } from '../../agent/src/system-tools.js';
import { createGitTools } from '../../agent/src/git-tools.js';
import { filterOfflineTools, getOfflineCapableToolNames } from '../../agent/src/tool-filter.js';
import type { ToolDefinition } from '../../agent/src/tools.js';

describe('offline tool identification', () => {
  const systemTools = createSystemTools('/tmp/test-workspace');
  const gitTools = createGitTools('/tmp/test-workspace');
  const allTools = [...systemTools, ...gitTools];

  it('system tools have offlineCapable property set', () => {
    const offlineTools = systemTools.filter(t => t.offlineCapable === true);
    const offlineNames = offlineTools.map(t => t.name);

    // These should all be offline-capable
    expect(offlineNames).toContain('read_file');
    expect(offlineNames).toContain('write_file');
    expect(offlineNames).toContain('edit_file');
    expect(offlineNames).toContain('search_files');
    expect(offlineNames).toContain('search_content');
    expect(offlineNames).toContain('bash');
    expect(offlineNames).toContain('multi_edit');
    expect(offlineNames).toContain('get_task_output');
    expect(offlineNames).toContain('kill_task');
  });

  it('web tools are NOT offline-capable', () => {
    const webSearch = systemTools.find(t => t.name === 'web_search');
    const webFetch = systemTools.find(t => t.name === 'web_fetch');

    // web_search and web_fetch should not be offline capable
    expect(webSearch?.offlineCapable).not.toBe(true);
    expect(webFetch?.offlineCapable).not.toBe(true);
  });

  it('git tools are offline-capable', () => {
    const offlineGitTools = gitTools.filter(t => t.offlineCapable === true);
    const gitNames = offlineGitTools.map(t => t.name);

    expect(gitNames).toContain('git_status');
    expect(gitNames).toContain('git_diff');
    expect(gitNames).toContain('git_log');
    expect(gitNames).toContain('git_commit');
  });

  it('filterOfflineTools returns only offline-capable tools', () => {
    const filtered = filterOfflineTools(allTools);

    // All returned tools should have offlineCapable === true
    for (const tool of filtered) {
      expect(tool.offlineCapable).toBe(true);
    }

    // Should not include web_search or web_fetch
    const names = filtered.map(t => t.name);
    expect(names).not.toContain('web_search');
    expect(names).not.toContain('web_fetch');

    // Should include local tools
    expect(names).toContain('read_file');
    expect(names).toContain('git_status');
  });

  it('getOfflineCapableToolNames returns name strings', () => {
    const names = getOfflineCapableToolNames(allTools);

    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('read_file');
    expect(names).toContain('search_files');
    expect(names).toContain('git_status');
    expect(names).not.toContain('web_search');
  });

  it('offline tools can execute without LLM', async () => {
    // read_file on a non-existent file should return an error string, not throw
    const readFile = systemTools.find(t => t.name === 'read_file')!;
    const result = await readFile.execute({ path: 'nonexistent-file.txt' });
    expect(typeof result).toBe('string');
    expect(result).toContain('Error');
  });

  it('non-offline tools have offlineCapable unset or false', () => {
    // Create a mock tool without offlineCapable
    const mockTools: ToolDefinition[] = [
      {
        name: 'llm_tool',
        description: 'Needs LLM',
        parameters: {},
        execute: async () => 'needs llm',
      },
      {
        name: 'local_tool',
        description: 'Works offline',
        parameters: {},
        execute: async () => 'works offline',
        offlineCapable: true,
      },
    ];

    const filtered = filterOfflineTools(mockTools);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('local_tool');
  });
});
