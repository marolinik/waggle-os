import { describe, it, expect } from 'vitest';
import { PermissionManager, READONLY_TOOLS } from '../src/permissions.js';
import type { ToolDefinition } from '../src/tools.js';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: {},
    execute: async () => 'ok',
  };
}

describe('PermissionManager', () => {
  it('default allows all tools', () => {
    const pm = new PermissionManager();
    expect(pm.isAllowed('bash')).toBe(true);
    expect(pm.isAllowed('write_file')).toBe(true);
    expect(pm.isAllowed('read_file')).toBe(true);
    expect(pm.isAllowed('anything')).toBe(true);
  });

  it('blacklist blocks listed tools, allows others', () => {
    const pm = new PermissionManager({ blacklist: ['bash', 'write_file'] });
    expect(pm.isAllowed('bash')).toBe(false);
    expect(pm.isAllowed('write_file')).toBe(false);
    expect(pm.isAllowed('read_file')).toBe(true);
    expect(pm.isAllowed('search_files')).toBe(true);
  });

  it('whitelist allows only listed tools', () => {
    const pm = new PermissionManager({ whitelist: ['read_file', 'search_files'] });
    expect(pm.isAllowed('read_file')).toBe(true);
    expect(pm.isAllowed('search_files')).toBe(true);
    expect(pm.isAllowed('bash')).toBe(false);
    expect(pm.isAllowed('write_file')).toBe(false);
  });

  it('blacklist takes priority over whitelist', () => {
    const pm = new PermissionManager({
      whitelist: ['read_file', 'bash'],
      blacklist: ['bash'],
    });
    expect(pm.isAllowed('read_file')).toBe(true);
    expect(pm.isAllowed('bash')).toBe(false);
    expect(pm.isAllowed('write_file')).toBe(false);
  });

  it('sandbox() only allows readonly tools', () => {
    const pm = PermissionManager.sandbox();
    for (const tool of READONLY_TOOLS) {
      expect(pm.isAllowed(tool)).toBe(true);
    }
    expect(pm.isAllowed('bash')).toBe(false);
    expect(pm.isAllowed('write_file')).toBe(false);
    expect(pm.isAllowed('edit_file')).toBe(false);
  });

  it('filterTools returns only allowed ToolDefinitions', () => {
    const tools = [
      makeTool('read_file'),
      makeTool('bash'),
      makeTool('write_file'),
      makeTool('search_files'),
    ];
    const pm = new PermissionManager({ blacklist: ['bash', 'write_file'] });
    const filtered = pm.filterTools(tools);
    expect(filtered.map(t => t.name)).toEqual(['read_file', 'search_files']);
  });
});
