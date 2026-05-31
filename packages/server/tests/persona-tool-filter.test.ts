import { describe, it, expect } from 'vitest';
import type { ToolDefinition, AgentPersona } from '@waggle/agent';
import {
  applyPersonaToolFilter,
  ALWAYS_AVAILABLE_TOOLS,
  READ_ONLY_WRITE_TOOLS,
} from '../src/local/persona-tool-filter.js';

const tool = (name: string): ToolDefinition =>
  ({ name, description: name, parameters: { type: 'object', properties: {} }, execute: async () => '' }) as unknown as ToolDefinition;

// applyPersonaToolFilter only reads tools / disallowedTools / isReadOnly.
const persona = (over: Partial<AgentPersona>): AgentPersona =>
  ({ id: 'p', name: 'P', tools: [], ...over }) as unknown as AgentPersona;

const POOL = ['chat_x', 'create_skill', 'read_skill', 'delete_skill', 'search_skills', 'write_file'].map(tool);

describe('applyPersonaToolFilter — self-evolving skill loop guarantee', () => {
  it('create_skill survives a persona allowlist (the loop can author skills)', () => {
    // A persona that declares only its own tool — pre-fix the allowlist stripped
    // create_skill (not declared, not in ALWAYS_AVAILABLE) and the loop 404'd.
    const out = applyPersonaToolFilter(POOL, persona({ tools: ['chat_x'] })).map(t => t.name);
    expect(out).toContain('create_skill');
    expect(out).toContain('read_skill');
    expect(out).toContain('delete_skill');
    expect(out).toContain('search_skills'); // read-side always worked
    expect(out).toContain('chat_x'); // persona's own declared tool
  });

  it('read-only personas cannot create or delete skills, but read_skill stays', () => {
    const out = applyPersonaToolFilter(POOL, persona({ tools: ['chat_x'], isReadOnly: true })).map(t => t.name);
    expect(out).not.toContain('create_skill');
    expect(out).not.toContain('delete_skill');
    expect(out).not.toContain('write_file');
    expect(out).toContain('read_skill'); // a read — allowed even for read-only personas
  });

  it('disallowedTools wins over the always-available set', () => {
    const out = applyPersonaToolFilter(POOL, persona({ tools: ['chat_x'], disallowedTools: ['create_skill'] })).map(t => t.name);
    expect(out).not.toContain('create_skill');
    expect(out).toContain('read_skill'); // not denied
  });

  it('a persona with no declared tools applies no allowlist narrowing', () => {
    const out = applyPersonaToolFilter(POOL, persona({ tools: [] })).map(t => t.name);
    expect(out).toContain('write_file'); // full pool preserved
    expect(out).toContain('create_skill');
  });

  it('the policy sets encode the write-side skill tools correctly', () => {
    expect(ALWAYS_AVAILABLE_TOOLS.has('create_skill')).toBe(true);
    expect(ALWAYS_AVAILABLE_TOOLS.has('read_skill')).toBe(true);
    expect(ALWAYS_AVAILABLE_TOOLS.has('delete_skill')).toBe(true);
    expect(READ_ONLY_WRITE_TOOLS.has('create_skill')).toBe(true);
    expect(READ_ONLY_WRITE_TOOLS.has('delete_skill')).toBe(true);
    expect(READ_ONLY_WRITE_TOOLS.has('read_skill')).toBe(false);
  });
});
