import { describe, it, expect } from 'vitest';
import { PERSONAS, getPersona, listPersonas, composePersonaPrompt } from '../src/personas.js';

describe('Agent Personas', () => {
  it('PERSONAS catalog has 13 entries', () => {
    expect(PERSONAS).toHaveLength(13);
  });

  it('each persona has required fields', () => {
    for (const persona of PERSONAS) {
      expect(persona.id).toBeTruthy();
      expect(persona.name).toBeTruthy();
      expect(persona.description).toBeTruthy();
      expect(persona.icon).toBeTruthy();
      expect(persona.systemPrompt).toBeTruthy();
      expect(persona.modelPreference).toBeTruthy();
      expect(Array.isArray(persona.tools)).toBe(true);
      expect(persona.tools.length).toBeGreaterThan(0);
      expect(Array.isArray(persona.workspaceAffinity)).toBe(true);
      expect(Array.isArray(persona.suggestedCommands)).toBe(true);
    }
  });

  it('all persona IDs are unique', () => {
    const ids = PERSONAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getPersona(id) returns the matching persona', () => {
    const researcher = getPersona('researcher');
    expect(researcher).not.toBeNull();
    expect(researcher!.name).toBe('Researcher');
    expect(researcher!.tools).toContain('web_search');
  });

  it('getPersona(nonexistent) returns null', () => {
    expect(getPersona('nonexistent')).toBeNull();
    expect(getPersona('')).toBeNull();
  });

  it('listPersonas() returns all 13 personas', () => {
    const list = listPersonas();
    expect(list).toHaveLength(13);
    expect(list).not.toBe(PERSONAS); // Returns a copy
  });

  it('each persona systemPrompt is under 4000 chars', () => {
    for (const persona of PERSONAS) {
      expect(persona.systemPrompt.length).toBeLessThan(4000);
    }
  });

  it('covers the 8 expected roles', () => {
    const ids = PERSONAS.map(p => p.id);
    expect(ids).toContain('researcher');
    expect(ids).toContain('writer');
    expect(ids).toContain('analyst');
    expect(ids).toContain('coder');
    expect(ids).toContain('project-manager');
    expect(ids).toContain('executive-assistant');
    expect(ids).toContain('sales-rep');
    expect(ids).toContain('marketer');
  });
});

describe('Prompt composition', () => {
  const corePrompt = 'You are Waggle, a workspace-native AI agent with persistent memory.';

  it('composePersonaPrompt appends persona after separator', () => {
    const persona = getPersona('researcher')!;
    const result = composePersonaPrompt(corePrompt, persona);

    expect(result).toContain(corePrompt);
    expect(result).toContain('---');
    expect(result).toContain('Persona: Researcher');
    expect(result.indexOf(corePrompt)).toBeLessThan(result.indexOf('Persona: Researcher'));
  });

  it('combined prompt stays under 32000 chars', () => {
    for (const persona of PERSONAS) {
      const result = composePersonaPrompt(corePrompt, persona);
      expect(result.length).toBeLessThanOrEqual(32000);
    }
  });

  it('persona prompt is truncated if combined exceeds limit', () => {
    const longCore = 'A'.repeat(30000);
    const persona = getPersona('researcher')!;
    // Set a tight limit so persona MUST be truncated (account for DOCX hint ~150 chars)
    const result = composePersonaPrompt(longCore, persona, 30300);

    expect(result.length).toBeLessThanOrEqual(30300);
    expect(result).toContain('[...truncated]');
  });

  it('null persona returns core prompt with DOCX hint appended', () => {
    const result = composePersonaPrompt(corePrompt, null);
    expect(result).toContain(corePrompt);
    expect(result).toContain('generate_docx');
  });
});
