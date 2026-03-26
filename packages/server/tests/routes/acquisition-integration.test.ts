import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSkillTools, type SkillToolsDeps } from '@waggle/agent';
import { loadSkills, needsConfirmation } from '@waggle/agent';

/**
 * Integration tests for the Capability Acquisition Loop MVP.
 *
 * Tests the full flow: detect gap → search → propose → install → runtime availability.
 * These tests use real filesystem operations to prove the loop is end-to-end real.
 */
describe('Capability Acquisition — Integration', () => {
  let tmpDir: string;
  let waggleHome: string;
  let skillsDir: string;
  let starterDir: string;
  let tools: ReturnType<typeof createSkillTools>;
  let skillsReloaded: boolean;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-acq-int-'));
    waggleHome = path.join(tmpDir, '.waggle');
    skillsDir = path.join(waggleHome, 'skills');
    starterDir = path.join(tmpDir, 'starter-skills');

    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(starterDir, { recursive: true });

    // Create starter skills
    fs.writeFileSync(
      path.join(starterDir, 'risk-assessment.md'),
      '# Risk Assessment — Project Risk Identification and Ranking\n\nSystematically identify, evaluate, and plan mitigations for project risks.\n\n## What to do\n1. Identify risks\n2. Evaluate likelihood and impact\n3. Plan mitigations',
    );
    fs.writeFileSync(
      path.join(starterDir, 'daily-plan.md'),
      '# Daily Plan — Structured Day Planning\n\nCreate a focused daily plan.\n\n## What to do\n1. Review tasks\n2. Prioritize\n3. Time-block',
    );

    // Pre-install one skill
    fs.writeFileSync(
      path.join(skillsDir, 'catch-up.md'),
      '# Catch-up — Workspace Restart Summary\n\nGenerate a catch-up summary.',
    );

    skillsReloaded = false;

    const deps: SkillToolsDeps = {
      waggleHome,
      starterSkillsDir: starterDir,
      nativeToolNames: ['web_search', 'read_file', 'bash', 'search_memory'],
      getInstalledSkills: () => loadSkills(waggleHome),
      onSkillsChanged: () => { skillsReloaded = true; },
    };

    tools = createSkillTools(deps);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getTool(name: string) {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  // ── Full acquisition flow ─────────────────────────────────────────

  it('full flow: acquire → find starter skill → install → runtime available', async () => {
    // Step 1: Detect gap — user needs risk assessment
    const acquireTool = getTool('acquire_capability');
    const proposal = await acquireTool.execute({ need: 'risk assessment for my project' });

    // Proposal should identify the gap and recommend installation
    expect(proposal).toContain('risk-assessment');
    expect(proposal).toContain('install_capability');
    expect(proposal).toContain('starter-pack');

    // Step 2: Verify the skill is NOT yet installed
    const preInstallSkills = loadSkills(waggleHome);
    expect(preInstallSkills.find(s => s.name === 'risk-assessment')).toBeUndefined();

    // Step 3: Install the recommended skill
    const installTool = getTool('install_capability');
    const installResult = await installTool.execute({
      name: 'risk-assessment',
      source: 'starter-pack',
    });

    // Should succeed and return the skill content
    expect(installResult).toContain('Skill Installed Successfully');
    expect(installResult).toContain('risk-assessment');
    expect(installResult).toContain('Active');
    expect(installResult).toContain('mitigations'); // From the skill content

    // Step 4: Verify hot-reload was triggered
    expect(skillsReloaded).toBe(true);

    // Step 5: Verify the skill is NOW installed on disk
    const postInstallFile = path.join(skillsDir, 'risk-assessment.md');
    expect(fs.existsSync(postInstallFile)).toBe(true);

    // Step 6: Verify the skill is available via loadSkills (runtime availability)
    const postInstallSkills = loadSkills(waggleHome);
    const installedRisk = postInstallSkills.find(s => s.name === 'risk-assessment');
    expect(installedRisk).toBeDefined();
    expect(installedRisk!.content).toContain('mitigations');

    // Step 7: Verify acquire_capability now shows it as active (no longer installable)
    const recheck = await acquireTool.execute({ need: 'risk assessment' });
    expect(recheck).toContain('already have');
    expect(recheck).not.toContain('Capability Gap Detected');
  });

  // ── Approval gate integration ─────────────────────────────────────

  it('install_capability triggers the approval gate', () => {
    // The confirmation module should flag install_capability
    expect(needsConfirmation('install_capability')).toBe(true);
  });

  it('install_capability does NOT trigger approval for read-only tools', () => {
    expect(needsConfirmation('acquire_capability')).toBe(false);
    expect(needsConfirmation('list_skills')).toBe(false);
    expect(needsConfirmation('search_skills')).toBe(false);
    expect(needsConfirmation('suggest_skill')).toBe(false);
  });

  // ── Candidate grounding (not blind install) ────────────────────────

  it('rejects install of non-existent starter skill', async () => {
    const installTool = getTool('install_capability');
    const result = await installTool.execute({
      name: 'nonexistent-skill',
      source: 'starter-pack',
    });

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('rejects install from unsupported source', async () => {
    const installTool = getTool('install_capability');
    const result = await installTool.execute({
      name: 'risk-assessment',
      source: 'marketplace',
    });

    expect(result).toContain('Error');
    expect(result).toContain('not supported');
  });

  it('rejects install of already-installed skill', async () => {
    // First install risk-assessment so it exists in both starter and installed
    const installTool = getTool('install_capability');
    await installTool.execute({ name: 'risk-assessment', source: 'starter-pack' });

    // Now try to install it again
    const result = await installTool.execute({
      name: 'risk-assessment',
      source: 'starter-pack',
    });

    expect(result).toContain('Error');
    expect(result).toContain('already installed');
  });

  it('rejects path traversal in name', async () => {
    const installTool = getTool('install_capability');

    const result = await installTool.execute({
      name: '../../../etc/passwd',
      source: 'starter-pack',
    });

    expect(result).toContain('Error');
    expect(result).toContain('Invalid');
  });

  // ── acquire_capability distinctions ────────────────────────────────

  it('identifies native tools without suggesting install', async () => {
    const acquireTool = getTool('acquire_capability');
    const result = await acquireTool.execute({ need: 'search the web for information' });

    expect(result).toContain('web_search');
    expect(result).toContain('built-in tool');
    expect(result).not.toContain('Capability Gap Detected');
  });

  it('distinguishes active skills from installable ones', async () => {
    const acquireTool = getTool('acquire_capability');
    const result = await acquireTool.execute({ need: 'catch up on workspace' });

    // catch-up is already installed
    expect(result).toContain('catch-up');
    expect(result).toContain('already have');
  });

  it('returns meaningful response for empty need', async () => {
    const acquireTool = getTool('acquire_capability');
    const result = await acquireTool.execute({ need: '' });
    expect(result).toContain('Error');
  });

  // ── Continuation proof (correction #5) ────────────────────────────

  it('install returns full skill content so agent can apply it immediately', async () => {
    const installTool = getTool('install_capability');
    const result = await installTool.execute({
      name: 'risk-assessment',
      source: 'starter-pack',
    });

    // The result should contain the actual skill instructions
    expect(result).toContain('## What to do');
    expect(result).toContain('Identify risks');
    expect(result).toContain('mitigations');
    expect(result).toContain('apply this skill');
  });
});
