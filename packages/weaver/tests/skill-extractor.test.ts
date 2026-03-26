import { describe, it, expect } from 'vitest';
import { extractSessionSkills } from '../src/skill-extractor.js';

describe('Session Skill Extraction', () => {
  it('extracts repeated tool usage patterns', () => {
    const entries = [
      { role: 'user', content: 'Find all TypeScript files' },
      { role: 'agent', content: 'Found 42 files.', tools_used: ['search_files'] },
      { role: 'user', content: 'Find all test files' },
      { role: 'agent', content: 'Found 20 files.', tools_used: ['search_files'] },
    ];
    const skills = extractSessionSkills(entries);
    expect(skills.length).toBeGreaterThanOrEqual(1);
    expect(skills.some(s => s.tools.includes('search_files'))).toBe(true);
  });

  it('returns empty for trivial conversations', () => {
    const entries = [
      { role: 'user', content: 'Hi' },
      { role: 'agent', content: 'Hello!', tools_used: [] },
    ];
    expect(extractSessionSkills(entries)).toEqual([]);
  });

  it('extracts multi-tool patterns at frequency 1', () => {
    const entries = [
      { role: 'user', content: 'Search and edit the config' },
      { role: 'agent', content: 'Done.', tools_used: ['search_files', 'edit_file'] },
    ];
    const skills = extractSessionSkills(entries);
    expect(skills.length).toBe(1);
    expect(skills[0].tools).toContain('search_files');
    expect(skills[0].tools).toContain('edit_file');
    expect(skills[0].frequency).toBe(1);
  });

  it('ignores single-tool patterns with frequency 1', () => {
    const entries = [
      { role: 'user', content: 'Read the file' },
      { role: 'agent', content: 'Here it is.', tools_used: ['read_file'] },
    ];
    const skills = extractSessionSkills(entries);
    expect(skills).toEqual([]);
  });

  it('skips non user→agent pairs', () => {
    const entries = [
      { role: 'agent', content: 'Welcome!' },
      { role: 'agent', content: 'Done.', tools_used: ['search_files'] },
    ];
    const skills = extractSessionSkills(entries);
    expect(skills).toEqual([]);
  });
});
