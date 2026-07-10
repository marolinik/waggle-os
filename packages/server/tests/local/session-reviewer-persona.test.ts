/**
 * session-reviewer persona — trust-boundary tool policy.
 *
 * The reviewer runs headless; ALWAYS_AVAILABLE_TOOLS (persona-tool-filter) re-adds
 * write-side tools past any allowlist, so the persona's disallowedTools must strip
 * the dangerous ones while KEEPING create_skill (its one proposal write) and the
 * read tools. This test locks that against regression.
 */

import { describe, it, expect } from 'vitest';
import { getPersona, type ToolDefinition } from '@waggle/agent';
import { applyPersonaToolFilter } from '../../src/local/persona-tool-filter.js';

/** Minimal ToolDefinition stub — only `name` matters for the filter. */
function tool(name: string): ToolDefinition {
  return { name, description: '', parameters: { type: 'object', properties: {} }, execute: async () => '' };
}

// A representative superset spanning reads, writes, memory, exec, and skill tools.
const POOL: ToolDefinition[] = [
  'read_file', 'search_files', 'search_content',
  'search_memory', 'save_memory', 'query_knowledge', 'get_identity', 'get_awareness',
  'correct_knowledge', 'add_task',
  'list_skills', 'search_skills', 'read_skill', 'create_skill', 'delete_skill',
  'write_file', 'edit_file', 'generate_docx', 'bash',
  'git_commit', 'git_push',
  'spawn_agent', 'install_capability', 'acquire_capability',
  'execute_step', 'compose_workflow', 'orchestrate_workflow',
].map(tool);

describe('session-reviewer persona', () => {
  it('exists and is not read-only (so create_skill survives)', () => {
    const p = getPersona('session-reviewer');
    expect(p).toBeTruthy();
    expect(p!.isReadOnly).toBe(false);
    expect(p!.tools).toContain('create_skill');
  });

  it('applyPersonaToolFilter keeps reads + create_skill, strips writes/exec/memory', () => {
    const p = getPersona('session-reviewer')!;
    const names = new Set(applyPersonaToolFilter(POOL, p).map(t => t.name));

    // Kept — the reviewer's read surface + its one proposal write.
    for (const keep of ['read_file', 'search_content', 'search_memory', 'read_skill', 'list_skills', 'create_skill']) {
      expect(names.has(keep), `expected ${keep} to survive`).toBe(true);
    }

    // Stripped — writes, exec, memory writes, and the ALWAYS_AVAILABLE re-adds.
    for (const drop of [
      'save_memory', 'delete_skill', 'install_capability', 'acquire_capability',
      'bash', 'spawn_agent', 'write_file', 'edit_file', 'git_commit',
      'add_task', 'correct_knowledge', 'execute_step', 'compose_workflow',
    ]) {
      expect(names.has(drop), `expected ${drop} to be stripped`).toBe(false);
    }
  });
});
