import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSystemPrompt, loadSkills } from '../src/prompt-loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Prompt Loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-prompt-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadSystemPrompt', () => {
    it('returns null when no system-prompt.md exists', () => {
      const result = loadSystemPrompt(tmpDir);
      expect(result).toBeNull();
    });

    it('loads system-prompt.md from waggle dir', () => {
      fs.writeFileSync(path.join(tmpDir, 'system-prompt.md'), 'You are a helpful bot.');
      const result = loadSystemPrompt(tmpDir);
      expect(result).toBe('You are a helpful bot.');
    });

    it('trims whitespace', () => {
      fs.writeFileSync(path.join(tmpDir, 'system-prompt.md'), '  Hello  \n\n');
      const result = loadSystemPrompt(tmpDir);
      expect(result).toBe('Hello');
    });
  });

  describe('loadSkills', () => {
    it('returns empty array when no skills dir', () => {
      const result = loadSkills(tmpDir);
      expect(result).toEqual([]);
    });

    it('loads .md files from skills directory', () => {
      const skillsDir = path.join(tmpDir, 'skills');
      fs.mkdirSync(skillsDir);
      fs.writeFileSync(path.join(skillsDir, 'coding.md'), '# Coding\nYou are a coder.');
      fs.writeFileSync(path.join(skillsDir, 'research.md'), '# Research\nYou research things.');

      const result = loadSkills(tmpDir);
      expect(result).toHaveLength(2);
      expect(result.map(s => s.name)).toContain('coding');
      expect(result.map(s => s.name)).toContain('research');
    });

    it('ignores non-md files', () => {
      const skillsDir = path.join(tmpDir, 'skills');
      fs.mkdirSync(skillsDir);
      fs.writeFileSync(path.join(skillsDir, 'coding.md'), '# Coding');
      fs.writeFileSync(path.join(skillsDir, 'notes.txt'), 'not a skill');

      const result = loadSkills(tmpDir);
      expect(result).toHaveLength(1);
    });
  });
});
