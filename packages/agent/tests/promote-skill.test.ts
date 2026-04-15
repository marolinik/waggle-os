/**
 * Skills 2.0 gap E — promote_skill tool.
 *
 * Tests the one-step promotion chain personal → workspace → team → enterprise,
 * tier gating, frontmatter rewrite with promoted_from history, file move,
 * and skill_promotion improvement signal emission.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, ImprovementSignalStore } from '@waggle/core';
import { createSkillTools, getSkillDirForScope } from '../src/skill-tools.js';
import { parseSkillFrontmatter } from '../src/skill-frontmatter.js';

function seedSkill(dir: string, name: string, scope: string | null, body = 'body content'): void {
  fs.mkdirSync(dir, { recursive: true });
  const scopeLine = scope ? `scope: ${scope}\n` : '';
  const content = `---\nname: ${name}\ndescription: seeded test skill\n${scopeLine}---\n${body}`;
  fs.writeFileSync(path.join(dir, `${name}.md`), content, 'utf-8');
}

describe('promote_skill — gap E', () => {
  let tmpDir: string;
  let db: MindDB;
  let signals: ImprovementSignalStore;
  let reloadCount: number;

  function createTools(overrides: Partial<Parameters<typeof createSkillTools>[0]> = {}) {
    return createSkillTools({
      waggleHome: tmpDir,
      onSkillsChanged: () => { reloadCount++; },
      getWorkspaceId: () => 'ws-alpha',
      getTeamId: () => 'team-bravo',
      hasTeamSkillLibrary: () => true,
      isEnterprise: () => true,
      improvementSignals: signals,
      ...overrides,
    });
  }

  function run(tools: ReturnType<typeof createSkillTools>, name: string, args: Record<string, unknown> = {}) {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.execute(args);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-promote-test-'));
    db = new MindDB(':memory:');
    signals = new ImprovementSignalStore(db);
    reloadCount = 0;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('happy path', () => {
    it('promotes personal → workspace, moves file, appends history, records signal', async () => {
      const personalDir = getSkillDirForScope(tmpDir, 'personal', {})!;
      seedSkill(personalDir, 'deploy-helper', 'personal');
      const tools = createTools();

      const out = await run(tools, 'promote_skill', { skill_name: 'deploy-helper' });

      expect(out).toContain('personal → workspace');
      expect(out).toContain('Signal recorded');

      // File moved
      expect(fs.existsSync(path.join(personalDir, 'deploy-helper.md'))).toBe(false);
      const wsDir = getSkillDirForScope(tmpDir, 'workspace', { workspaceId: 'ws-alpha' })!;
      const newPath = path.join(wsDir, 'deploy-helper.md');
      expect(fs.existsSync(newPath)).toBe(true);

      // Frontmatter updated with scope + promoted_from history
      const parsed = parseSkillFrontmatter(fs.readFileSync(newPath, 'utf-8'));
      expect(parsed.frontmatter.scope).toBe('workspace');
      expect(parsed.frontmatter.promoted_from).toEqual(['personal']);

      // Signal emitted
      const recorded = signals.getByCategory('skill_promotion');
      expect(recorded.length).toBe(1);
      expect(recorded[0].pattern_key).toBe('promote:deploy-helper:personal->workspace');

      // onSkillsChanged fired
      expect(reloadCount).toBe(1);
    });

    it('appends to existing promoted_from across multiple hops', async () => {
      const wsDir = getSkillDirForScope(tmpDir, 'workspace', { workspaceId: 'ws-alpha' })!;
      // Skill already promoted once (personal → workspace), now promote to team
      fs.mkdirSync(wsDir, { recursive: true });
      const content = `---\nname: already-moved\nscope: workspace\npromoted_from: [personal]\n---\nbody`;
      fs.writeFileSync(path.join(wsDir, 'already-moved.md'), content, 'utf-8');
      const tools = createTools();

      await run(tools, 'promote_skill', { skill_name: 'already-moved' });

      const teamDir = getSkillDirForScope(tmpDir, 'team', { teamId: 'team-bravo' })!;
      const parsed = parseSkillFrontmatter(fs.readFileSync(path.join(teamDir, 'already-moved.md'), 'utf-8'));
      expect(parsed.frontmatter.scope).toBe('team');
      expect(parsed.frontmatter.promoted_from).toEqual(['personal', 'workspace']);
    });
  });

  describe('validation', () => {
    it('errors when skill is not found', async () => {
      const out = await run(createTools(), 'promote_skill', { skill_name: 'ghost' });
      expect(out).toContain('not found in any accessible scope');
    });

    it('errors when already at enterprise (top)', async () => {
      const entDir = getSkillDirForScope(tmpDir, 'enterprise', {})!;
      seedSkill(entDir, 'top', 'enterprise');
      const out = await run(createTools(), 'promote_skill', { skill_name: 'top' });
      expect(out).toContain('already at the top scope');
    });

    it('errors when explicit target_scope is not exactly one rung above', async () => {
      const personalDir = getSkillDirForScope(tmpDir, 'personal', {})!;
      seedSkill(personalDir, 'jumpy', 'personal');
      const out = await run(createTools(), 'promote_skill', {
        skill_name: 'jumpy',
        target_scope: 'team', // skip workspace — disallowed
      });
      expect(out).toContain('not exactly one rung up');
    });

    it('treats a legacy skill without frontmatter scope as its dir-derived scope', async () => {
      const personalDir = getSkillDirForScope(tmpDir, 'personal', {})!;
      seedSkill(personalDir, 'legacy', null); // no scope field
      const out = await run(createTools(), 'promote_skill', { skill_name: 'legacy' });
      expect(out).toContain('personal → workspace');
    });
  });

  describe('tier gating', () => {
    it('denies team promotion when hasTeamSkillLibrary is false', async () => {
      const wsDir = getSkillDirForScope(tmpDir, 'workspace', { workspaceId: 'ws-alpha' })!;
      seedSkill(wsDir, 'paid-feature', 'workspace');
      const tools = createTools({ hasTeamSkillLibrary: () => false });
      const out = await run(tools, 'promote_skill', { skill_name: 'paid-feature' });
      expect(out).toContain('your plan does not include');
      expect(out).toContain('TEAMS or ENTERPRISE');
    });

    it('denies team promotion when no team is linked even if capability allows', async () => {
      const wsDir = getSkillDirForScope(tmpDir, 'workspace', { workspaceId: 'ws-alpha' })!;
      seedSkill(wsDir, 'solo-ws', 'workspace');
      const tools = createTools({ getTeamId: () => null });
      const out = await run(tools, 'promote_skill', { skill_name: 'solo-ws' });
      expect(out).toContain('not linked to a team');
    });

    it('denies enterprise promotion without isEnterprise', async () => {
      const teamDir = getSkillDirForScope(tmpDir, 'team', { teamId: 'team-bravo' })!;
      seedSkill(teamDir, 'hot-skill', 'team');
      const tools = createTools({ isEnterprise: () => false });
      const out = await run(tools, 'promote_skill', { skill_name: 'hot-skill' });
      expect(out).toContain('requires ENTERPRISE tier');
    });

    it('denies workspace promotion when no workspace is active', async () => {
      const personalDir = getSkillDirForScope(tmpDir, 'personal', {})!;
      seedSkill(personalDir, 'orphan', 'personal');
      const tools = createTools({ getWorkspaceId: () => null });
      const out = await run(tools, 'promote_skill', { skill_name: 'orphan' });
      expect(out).toContain('no active workspace');
    });
  });

  describe('safety', () => {
    it('refuses to overwrite an existing skill at the target scope', async () => {
      const personalDir = getSkillDirForScope(tmpDir, 'personal', {})!;
      const wsDir = getSkillDirForScope(tmpDir, 'workspace', { workspaceId: 'ws-alpha' })!;
      seedSkill(personalDir, 'collision', 'personal');
      seedSkill(wsDir, 'collision', 'workspace'); // already exists at target
      const out = await run(createTools(), 'promote_skill', { skill_name: 'collision' });
      expect(out).toContain('already exists at scope');
      // Source file must NOT have been deleted
      expect(fs.existsSync(path.join(personalDir, 'collision.md'))).toBe(true);
    });
  });
});
