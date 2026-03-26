import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildSkillPromptSection } from '../src/local/routes/chat.js';

describe('Skill Integration — System Prompt', () => {
  it('includes "Active Skills" section when skills are loaded', () => {
    const skills = [{ name: 'test-skill', content: 'Do X when asked about Y.' }];
    const section = buildSkillPromptSection(skills);

    expect(section).toContain('# Active Skills');
    expect(section).toContain('Loaded Skills (1)');
    expect(section).toContain('### test-skill');
    expect(section).toContain('Do X when asked about Y.');
  });

  it('includes skill-aware routing instructions when skills exist', () => {
    const skills = [{ name: 'catch-up', content: 'Catch-up workflow steps.' }];
    const section = buildSkillPromptSection(skills);

    expect(section).toContain('Skill-Aware Routing');
    expect(section).toContain('Check if any loaded skill matches the request');
    expect(section).toContain('follow its structured workflow');
    expect(section).toContain('Use suggest_skill to find relevant skills when unsure');
  });

  it('includes suggest_skill reference in routing instructions', () => {
    const skills = [{ name: 'research', content: 'Research workflow.' }];
    const section = buildSkillPromptSection(skills);

    expect(section).toContain('suggest_skill');
  });

  it('does NOT include skill section when no skills loaded', () => {
    const section = buildSkillPromptSection([]);

    expect(section).toBe('');
    expect(section).not.toContain('# Active Skills');
    expect(section).not.toContain('Skill-Aware Routing');
    expect(section).not.toContain('Loaded Skills (');
  });

  it('renders multiple skills with correct count', () => {
    const skills = [
      { name: 'catch-up', content: 'Catch-up steps.' },
      { name: 'draft-memo', content: 'Draft memo steps.' },
      { name: 'research', content: 'Research steps.' },
    ];
    const section = buildSkillPromptSection(skills);

    expect(section).toContain('Loaded Skills (3)');
    expect(section).toContain('### catch-up');
    expect(section).toContain('### draft-memo');
    expect(section).toContain('### research');
    expect(section).toContain('Catch-up steps.');
    expect(section).toContain('Draft memo steps.');
    expect(section).toContain('Research steps.');
  });
});

describe('Skill Integration — Starter Skills Auto-Install', () => {
  it('installStarterSkills produces files in target directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-starter-'));
    const targetDir = path.join(tmpDir, 'skills');

    try {
      const { installStarterSkills } = await import('@waggle/sdk');
      const installed = installStarterSkills(targetDir);

      // Should have installed at least some skills
      expect(installed.length).toBeGreaterThan(0);

      // Target directory should exist and contain .md files
      expect(fs.existsSync(targetDir)).toBe(true);
      const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md'));
      expect(files.length).toBe(installed.length);

      // Each installed skill should have a corresponding file
      for (const name of installed) {
        expect(fs.existsSync(path.join(targetDir, `${name}.md`))).toBe(true);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
