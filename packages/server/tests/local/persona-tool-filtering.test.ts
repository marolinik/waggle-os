/**
 * Persona Tool Filtering Tests
 *
 * Tests that when a workspace has a personaId set, the available tools
 * are filtered to only those declared by the persona + core tools.
 *
 * Core tools (always included): search_memory, save_memory, read_file, write_file
 */

import { describe, it, expect } from 'vitest';
import { getPersona, PERSONAS, type AgentPersona } from '@waggle/agent';

// Simulate the filtering logic from chat.ts
function filterToolsForPersona(
  allToolNames: string[],
  personaId: string | null | undefined,
): string[] {
  const CORE_TOOLS = ['search_memory', 'save_memory', 'read_file', 'write_file'];

  if (!personaId) {
    return allToolNames; // No persona — all tools available
  }

  const persona = getPersona(personaId);
  if (!persona) {
    return allToolNames; // Unknown persona — all tools (defensive)
  }

  const allowedNames = new Set([...persona.tools, ...CORE_TOOLS]);
  return allToolNames.filter(name => allowedNames.has(name));
}

// A representative superset of tools the agent might have
const ALL_TOOL_NAMES = [
  'search_memory', 'save_memory', 'read_file', 'write_file', 'edit_file',
  'search_files', 'search_content', 'bash', 'web_search', 'web_fetch',
  'generate_docx', 'git_status', 'git_diff', 'git_log', 'git_commit',
  'create_plan', 'add_plan_step', 'execute_step', 'show_plan',
  'spawn_agent', 'list_agents', 'get_agent_result',
];

describe('Persona Tool Filtering', () => {
  describe('No persona (all tools)', () => {
    it('returns all tools when personaId is null', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, null);
      expect(result).toEqual(ALL_TOOL_NAMES);
    });

    it('returns all tools when personaId is undefined', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, undefined);
      expect(result).toEqual(ALL_TOOL_NAMES);
    });

    it('returns all tools when personaId is unknown', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'nonexistent-persona');
      expect(result).toEqual(ALL_TOOL_NAMES);
    });
  });

  describe('Core tools always included', () => {
    const CORE_TOOLS = ['search_memory', 'save_memory', 'read_file', 'write_file'];

    it('includes core tools for researcher persona', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'researcher');
      for (const core of CORE_TOOLS) {
        expect(result).toContain(core);
      }
    });

    it('includes core tools for coder persona', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'coder');
      for (const core of CORE_TOOLS) {
        expect(result).toContain(core);
      }
    });

    it('includes core tools for every persona', () => {
      for (const persona of PERSONAS) {
        const result = filterToolsForPersona(ALL_TOOL_NAMES, persona.id);
        for (const core of CORE_TOOLS) {
          expect(result, `${persona.id} should include ${core}`).toContain(core);
        }
      }
    });
  });

  describe('Persona-specific filtering', () => {
    it('researcher has web_search and web_fetch but not bash', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'researcher');
      expect(result).toContain('web_search');
      expect(result).toContain('web_fetch');
      expect(result).not.toContain('bash');
      expect(result).not.toContain('git_status');
    });

    it('writer has edit_file and generate_docx but not bash or git tools', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'writer');
      expect(result).toContain('edit_file');
      expect(result).toContain('generate_docx');
      expect(result).not.toContain('bash');
      expect(result).not.toContain('git_status');
      expect(result).not.toContain('web_search');
    });

    it('coder has bash and git tools but not web_search', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'coder');
      expect(result).toContain('bash');
      expect(result).toContain('git_status');
      expect(result).toContain('git_diff');
      expect(result).toContain('edit_file');
      expect(result).not.toContain('web_search');
      expect(result).not.toContain('generate_docx');
    });

    it('project-manager has plan tools but not bash or git', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'project-manager');
      expect(result).toContain('create_plan');
      expect(result).toContain('add_plan_step');
      expect(result).toContain('execute_step');
      expect(result).toContain('show_plan');
      expect(result).not.toContain('bash');
      expect(result).not.toContain('git_status');
    });

    it('analyst has bash and web tools', () => {
      const result = filterToolsForPersona(ALL_TOOL_NAMES, 'analyst');
      expect(result).toContain('bash');
      expect(result).toContain('web_search');
      expect(result).toContain('web_fetch');
    });
  });

  describe('Filtered set is strictly subset', () => {
    it('filtered tools never include tools not in the original list', () => {
      for (const persona of PERSONAS) {
        const result = filterToolsForPersona(ALL_TOOL_NAMES, persona.id);
        for (const tool of result) {
          expect(ALL_TOOL_NAMES, `${tool} from ${persona.id} should be in ALL_TOOL_NAMES`).toContain(tool);
        }
      }
    });

    it('filtered set is smaller than full set for all personas', () => {
      for (const persona of PERSONAS) {
        const result = filterToolsForPersona(ALL_TOOL_NAMES, persona.id);
        expect(result.length, `${persona.id} should have fewer tools than full set`).toBeLessThan(ALL_TOOL_NAMES.length);
      }
    });
  });

  describe('getPersona returns correct data', () => {
    it('returns null for unknown persona', () => {
      expect(getPersona('nonexistent')).toBeNull();
    });

    it('returns persona with tools array for known ID', () => {
      const persona = getPersona('researcher');
      expect(persona).not.toBeNull();
      expect(Array.isArray(persona!.tools)).toBe(true);
      expect(persona!.tools.length).toBeGreaterThan(0);
    });

    it('all 8 personas are retrievable', () => {
      const ids = ['researcher', 'writer', 'analyst', 'coder', 'project-manager', 'executive-assistant', 'sales-rep', 'marketer'];
      for (const id of ids) {
        const persona = getPersona(id);
        expect(persona, `Persona ${id} should exist`).not.toBeNull();
        expect(persona!.id).toBe(id);
      }
    });
  });
});
