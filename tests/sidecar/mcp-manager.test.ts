import { describe, it, expect, beforeEach } from 'vitest';
import { McpManager, type McpServerConfig } from '../../sidecar/src/mcp-manager.js';

describe('MCP Manager', () => {
  let manager: McpManager;

  beforeEach(() => {
    manager = new McpManager();
  });

  it('starts with no servers', () => {
    expect(manager.listServers()).toEqual([]);
  });

  it('adds a server config', () => {
    const config: McpServerConfig = {
      id: 'filesystem',
      name: 'File System',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };
    manager.addServer(config);
    expect(manager.listServers()).toHaveLength(1);
    expect(manager.listServers()[0].id).toBe('filesystem');
  });

  it('removes a server config', () => {
    manager.addServer({ id: 'test', name: 'Test', command: 'echo', args: ['hello'] });
    expect(manager.listServers()).toHaveLength(1);
    manager.removeServer('test');
    expect(manager.listServers()).toHaveLength(0);
  });

  it('prevents duplicate server IDs', () => {
    manager.addServer({ id: 'dup', name: 'First', command: 'a', args: [] });
    expect(() => {
      manager.addServer({ id: 'dup', name: 'Second', command: 'b', args: [] });
    }).toThrow('already exists');
  });

  it('gets server by ID', () => {
    manager.addServer({ id: 'fs', name: 'FS', command: 'npx', args: [] });
    const server = manager.getServer('fs');
    expect(server?.name).toBe('FS');
  });

  it('returns undefined for unknown server', () => {
    expect(manager.getServer('nope')).toBeUndefined();
  });

  it('serializes and deserializes config', () => {
    manager.addServer({ id: 'a', name: 'A', command: 'x', args: ['1'] });
    manager.addServer({ id: 'b', name: 'B', command: 'y', args: ['2'], env: { FOO: 'bar' } });

    const json = manager.toJSON();
    const restored = McpManager.fromJSON(json);

    expect(restored.listServers()).toHaveLength(2);
    expect(restored.getServer('b')?.env).toEqual({ FOO: 'bar' });
  });
});
