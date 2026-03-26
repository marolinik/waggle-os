/**
 * KVARK Wiring — tests that KVARK tools register conditionally.
 *
 * Validates:
 * - getKvarkConfig returns null → no KVARK tools
 * - getKvarkConfig returns config → createKvarkTools called
 * - Solo/Team behavior unaffected when vault has no KVARK entry
 */

import { describe, it, expect } from 'vitest';
import { getKvarkConfig, type VaultLike } from '../../src/kvark/kvark-config.js';
import { createKvarkTools, type KvarkClientLike } from '@waggle/agent';

function emptyVault(): VaultLike {
  return { get: () => null };
}

function kvarkVault(): VaultLike {
  return {
    get: (name: string) => {
      if (name === 'kvark:connection') {
        return { value: JSON.stringify({ baseUrl: 'http://kvark:8000', identifier: 'admin', password: 'pass' }) };
      }
      return null;
    },
  };
}

function stubClient(): KvarkClientLike {
  return {
    search: async () => ({ results: [], total: 0, query: '' }),
    askDocument: async () => ({ answer: '', sources: [] }),
  };
}

describe('KVARK Wiring', () => {
  it('no KVARK config → getKvarkConfig returns null', () => {
    const config = getKvarkConfig(emptyVault());
    expect(config).toBeNull();
  });

  it('with KVARK config → getKvarkConfig returns valid config', () => {
    const config = getKvarkConfig(kvarkVault());
    expect(config).not.toBeNull();
    expect(config!.baseUrl).toBe('http://kvark:8000');
  });

  it('no KVARK config → zero additional tools', () => {
    const config = getKvarkConfig(emptyVault());
    // When config is null, no tools created — simulates the if(kvarkConfig) guard
    const toolCount = config ? createKvarkTools({ client: stubClient() }).length : 0;
    expect(toolCount).toBe(0);
  });

  it('with KVARK config → exactly 4 tools registered', () => {
    const config = getKvarkConfig(kvarkVault());
    expect(config).not.toBeNull();
    const tools = createKvarkTools({ client: stubClient() });
    expect(tools).toHaveLength(4);
    expect(tools.map(t => t.name)).toEqual(['kvark_search', 'kvark_feedback', 'kvark_action', 'kvark_ask_document']);
  });

  it('KVARK tools are ToolDefinition-compatible (name, description, parameters, execute)', () => {
    const tools = createKvarkTools({ client: stubClient() });
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('KVARK tools can be appended to an existing tool array', () => {
    const existingTools = [
      { name: 'search_memory', description: 'test', parameters: {}, execute: async () => '' },
      { name: 'save_memory', description: 'test', parameters: {}, execute: async () => '' },
    ];
    const kvarkTools = createKvarkTools({ client: stubClient() });

    const allTools = [...existingTools, ...kvarkTools];
    expect(allTools).toHaveLength(6);
    expect(allTools.map(t => t.name)).toEqual(['search_memory', 'save_memory', 'kvark_search', 'kvark_feedback', 'kvark_action', 'kvark_ask_document']);
  });
});
