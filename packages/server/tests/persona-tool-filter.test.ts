import { describe, it, expect } from 'vitest';
import type { ToolDefinition, AgentPersona } from '@waggle/agent';
import {
  applyPersonaToolFilter,
  filterMcpToolsForPersona,
  ALWAYS_AVAILABLE_TOOLS,
  READ_ONLY_WRITE_TOOLS,
  READ_ONLY_ALLOWED_TOOLS,
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

// SEC-GATE fix #4: read-only personas use an ALLOWLIST, so genuine write tools
// not on the old denylist (add_task, compose_workflow, execute_step) can no
// longer silently leak. Ephemeral plan-authoring (create_plan / add_plan_step)
// IS kept — verified side-effect-free in plan-tools.ts (in-memory Plan only),
// exactly like show_plan — so the isReadOnly `planner` persona still works.
describe('applyPersonaToolFilter — read-only allowlist (no write tool leaks)', () => {
  const LEAK_POOL = [
    'read_file', 'search_memory', 'read_skill', 'search_skills', 'show_plan',
    'add_task', 'create_plan', 'add_plan_step', 'compose_workflow', 'execute_step',
    'write_file', 'save_memory', 'bash',
  ].map(tool);

  it('a read-only persona cannot invoke genuine writes (add_task / compose_workflow / execute_step / write_file / bash)', () => {
    const out = applyPersonaToolFilter(LEAK_POOL, persona({ tools: [], isReadOnly: true })).map(t => t.name);
    for (const leaked of ['add_task', 'compose_workflow', 'execute_step', 'write_file', 'save_memory', 'bash']) {
      expect(out, `${leaked} must be stripped from a read-only persona`).not.toContain(leaked);
    }
  });

  it('a read-only persona keeps read tools AND side-effect-free plan authoring', () => {
    const out = applyPersonaToolFilter(LEAK_POOL, persona({ tools: [], isReadOnly: true })).map(t => t.name);
    expect(out).toContain('read_file');
    expect(out).toContain('search_memory');
    expect(out).toContain('read_skill');
    expect(out).toContain('search_skills');
    expect(out).toContain('show_plan');
    // Plan authoring is ephemeral (no persistence) — the planner persona needs it.
    expect(out).toContain('create_plan');
    expect(out).toContain('add_plan_step');
  });

  it('the read-only allowlist enumerates reads + ephemeral plan authoring, excludes real writes', () => {
    expect(READ_ONLY_ALLOWED_TOOLS.has('read_file')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('read_skill')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('create_plan')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('add_plan_step')).toBe(true);
    expect(READ_ONLY_ALLOWED_TOOLS.has('add_task')).toBe(false);
    expect(READ_ONLY_ALLOWED_TOOLS.has('compose_workflow')).toBe(false);
    expect(READ_ONLY_ALLOWED_TOOLS.has('execute_step')).toBe(false);
  });

  it('the real planner persona keeps its planning tools but loses execute/write/bash (regression lock)', () => {
    const PLANNER_POOL = [
      'read_file', 'search_files', 'search_memory', 'query_knowledge',
      'create_plan', 'add_plan_step', 'show_plan',
      'execute_step', 'write_file', 'bash', 'save_memory',
    ].map(tool);
    // Mirrors the shipped isReadOnly planner (persona-data.ts): declares planning
    // tools + bash, disallows the writes. The read-only strip must keep authoring.
    const plannerLike = persona({
      tools: ['read_file', 'search_files', 'search_memory', 'query_knowledge', 'create_plan', 'add_plan_step', 'show_plan', 'bash'],
      disallowedTools: ['write_file', 'execute_step', 'save_memory'],
      isReadOnly: true,
    });
    const out = applyPersonaToolFilter(PLANNER_POOL, plannerLike).map(t => t.name);
    expect(out).toContain('create_plan');
    expect(out).toContain('add_plan_step');
    expect(out).toContain('show_plan');
    expect(out).toContain('read_file');
    expect(out).not.toContain('execute_step');
    expect(out).not.toContain('write_file');
    expect(out).not.toContain('bash'); // read-only strips arbitrary command execution
  });
});

// Steal #6: MCP tools bypass the persona ALLOWLIST (their dynamic
// `mcp_<server>_<tool>` names are never in a persona's static tools[]) but must
// still honor the two safety rails — explicit denylist + read-only.
describe('filterMcpToolsForPersona — MCP persona safety rails', () => {
  const MCP_POOL = ['mcp_github_create_issue', 'mcp_slack_send', 'mcp_postgres_query'].map(tool);

  it('bypasses the allowlist: a narrow persona still gets MCP tools', () => {
    const out = filterMcpToolsForPersona(MCP_POOL, persona({ tools: ['chat_x'] })).map(t => t.name);
    expect(out).toEqual(['mcp_github_create_issue', 'mcp_slack_send', 'mcp_postgres_query']);
  });

  it('honors disallowedTools against MCP tool names', () => {
    const out = filterMcpToolsForPersona(MCP_POOL, persona({ disallowedTools: ['mcp_postgres_query'] })).map(t => t.name);
    expect(out).not.toContain('mcp_postgres_query');
    expect(out).toContain('mcp_github_create_issue');
  });

  it('grants a read-only persona NO MCP tools (unknown-capability external actions)', () => {
    const out = filterMcpToolsForPersona(MCP_POOL, persona({ isReadOnly: true }));
    expect(out).toEqual([]);
  });
});
