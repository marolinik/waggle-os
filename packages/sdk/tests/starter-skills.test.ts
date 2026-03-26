import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listStarterSkills,
  installStarterSkills,
  getStarterSkillsDir,
} from '../src/starter-skills/index.js';

describe('starter-skills', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-starter-skills-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getStarterSkillsDir() returns a directory that exists', () => {
    const dir = getStarterSkillsDir();
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('listStarterSkills() returns 18 skill names', () => {
    const skills = listStarterSkills();
    expect(skills).toHaveLength(18);
  });

  it('all expected skill names are present', () => {
    const skills = listStarterSkills();
    const expected = [
      'brainstorm',
      'catch-up',
      'code-review',
      'compare-docs',
      'daily-plan',
      'decision-matrix',
      'draft-memo',
      'explain-concept',
      'extract-actions',
      'meeting-prep',
      'plan-execute',
      'research-synthesis',
      'research-team',
      'retrospective',
      'review-pair',
      'risk-assessment',
      'status-update',
      'task-breakdown',
    ];
    expect(skills).toEqual(expected);
  });

  it('each starter skill file exists and has content (> 50 chars)', () => {
    const dir = getStarterSkillsDir();
    const skills = listStarterSkills();
    for (const name of skills) {
      const filePath = path.join(dir, `${name}.md`);
      expect(fs.existsSync(filePath), `${name}.md should exist`).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length, `${name}.md should have > 50 chars`).toBeGreaterThan(50);
    }
  });

  it('all skill names are valid (alphanumeric + hyphens only)', () => {
    const skills = listStarterSkills();
    for (const name of skills) {
      expect(name, `${name} should match [a-z0-9-]+`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('installStarterSkills() copies files to target directory', () => {
    const installed = installStarterSkills(tmpDir);
    expect(installed).toHaveLength(18);

    // Verify files exist in target
    for (const name of installed) {
      const filePath = path.join(tmpDir, `${name}.md`);
      expect(fs.existsSync(filePath), `${name}.md should be installed`).toBe(true);
    }
  });

  it('installStarterSkills() does NOT overwrite existing skills', () => {
    // Pre-create a skill with custom content
    const customContent = '# Custom catch-up skill\nMy custom version.';
    fs.writeFileSync(path.join(tmpDir, 'catch-up.md'), customContent, 'utf-8');

    const installed = installStarterSkills(tmpDir);

    // catch-up should NOT be in the installed list (was skipped)
    expect(installed).not.toContain('catch-up');
    expect(installed).toHaveLength(17);

    // Verify custom content was preserved
    const content = fs.readFileSync(path.join(tmpDir, 'catch-up.md'), 'utf-8');
    expect(content).toBe(customContent);
  });

  it('installStarterSkills() creates target directory if missing', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'skills');
    expect(fs.existsSync(nestedDir)).toBe(false);

    const installed = installStarterSkills(nestedDir);
    expect(installed).toHaveLength(18);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });
});
