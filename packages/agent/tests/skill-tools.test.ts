import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSkillTools } from '../src/skill-tools.js';

describe('skill-tools', () => {
  let tmpDir: string;
  let skillsDir: string;
  let tools: ReturnType<typeof createSkillTools>;
  let reloadCount: number;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skill-test-'));
    skillsDir = path.join(tmpDir, 'skills');
    reloadCount = 0;
    tools = createSkillTools({
      waggleHome: tmpDir,
      onSkillsChanged: () => { reloadCount++; },
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(name: string, args: Record<string, unknown> = {}) {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.execute(args);
  }

  it('list_skills returns empty when no skills installed', async () => {
    const result = await run('list_skills');
    expect(result).toContain('No skills or plugins installed');
  });

  it('create_skill creates a skill file', async () => {
    const result = await run('create_skill', {
      name: 'test-skill',
      content: '# Test Skill\nDo something useful.',
    });
    expect(result).toContain('Created skill "test-skill"');
    expect(fs.existsSync(path.join(skillsDir, 'test-skill.md'))).toBe(true);
    expect(reloadCount).toBe(1);
  });

  it('create_skill rejects invalid names', async () => {
    const result = await run('create_skill', {
      name: '../etc/passwd',
      content: 'malicious',
    });
    expect(result).toContain('Error');
  });

  it('list_skills shows created skills', async () => {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'my-skill.md'), '# My Skill\nInstructions here.');
    const result = await run('list_skills');
    expect(result).toContain('my-skill');
    expect(result).toContain('Installed Skills (1)');
  });

  it('read_skill returns full content', async () => {
    fs.mkdirSync(skillsDir, { recursive: true });
    const content = '# Full Content\nLots of instructions...';
    fs.writeFileSync(path.join(skillsDir, 'readable.md'), content);
    const result = await run('read_skill', { name: 'readable' });
    expect(result).toBe(content);
  });

  it('delete_skill removes a skill', async () => {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'to-delete.md'), 'temp');
    const result = await run('delete_skill', { name: 'to-delete' });
    expect(result).toContain('Deleted');
    expect(fs.existsSync(path.join(skillsDir, 'to-delete.md'))).toBe(false);
    expect(reloadCount).toBe(1);
  });

  it('delete_skill rejects path traversal', async () => {
    const result = await run('delete_skill', { name: '../../etc' });
    expect(result).toContain('Error');
  });

  it('search_skills finds matching installed skills', async () => {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'code-review.md'), '# Code Review\nReview code for quality issues.');
    const result = await run('search_skills', { query: 'code review' });
    expect(result).toContain('code-review');
    expect(result).toContain('Matching Installed Skills');
  });

  it('search_skills suggests built-in tools', async () => {
    const result = await run('search_skills', { query: 'web search internet' });
    expect(result).toContain('web_search');
    expect(result).toContain('Built-in Tools');
  });

  it('search_skills shows suggestions when nothing matches', async () => {
    const result = await run('search_skills', { query: 'quantum physics simulation' });
    expect(result).toContain('Suggestions');
    expect(result).toContain('create_skill');
  });

  it('create_skill updates existing skill', async () => {
    await run('create_skill', { name: 'updatable', content: 'v1' });
    const result = await run('create_skill', { name: 'updatable', content: 'v2' });
    expect(result).toContain('Updated');
    expect(fs.readFileSync(path.join(skillsDir, 'updatable.md'), 'utf-8')).toBe('v2');
  });
});
