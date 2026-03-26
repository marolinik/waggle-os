import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { searchCapabilities } from '../src/capability-acquisition.js';

describe('capability-acquisition trust integration', () => {
  let tmpDir: string;
  let starterDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-trust-'));
    starterDir = path.join(tmpDir, 'starter-skills');
    fs.mkdirSync(starterDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeStarter(name: string, content: string) {
    fs.writeFileSync(path.join(starterDir, `${name}.md`), content);
  }

  it('candidates from searchCapabilities carry trust assessments', () => {
    writeStarter('risk-assessment', '# Risk Assessment\n\n1. Identify risks\n2. Evaluate\n3. Mitigate');

    const proposal = searchCapabilities({
      need: 'risk assessment for my project',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const candidate = proposal.candidates.find(c => c.name === 'risk-assessment');
    expect(candidate).toBeDefined();
    expect(candidate!.trust).toBeDefined();
    expect(candidate!.trust!.trustSource).toBe('starter_pack');
    expect(candidate!.trust!.riskLevel).toBe('low');
    expect(candidate!.trust!.assessmentMode).toBe('heuristic');
  });

  it('native tool candidates get builtin trust source', () => {
    const proposal = searchCapabilities({
      need: 'search the web for information',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: ['web_search', 'web_fetch'],
    });

    const webSearch = proposal.candidates.find(c => c.name === 'web_search');
    expect(webSearch).toBeDefined();
    expect(webSearch!.trust).toBeDefined();
    expect(webSearch!.trust!.trustSource).toBe('builtin');
    expect(webSearch!.trust!.riskLevel).toBe('low');
  });

  it('installed skill candidates get local_user trust source', () => {
    const proposal = searchCapabilities({
      need: 'review my code',
      installedSkills: [
        { name: 'code-review', content: '# Code Review\n\nCheck for bugs and style issues.' },
      ],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const codeReview = proposal.candidates.find(c => c.name === 'code-review');
    expect(codeReview).toBeDefined();
    expect(codeReview!.trust!.trustSource).toBe('local_user');
  });

  it('proposal summary includes risk level for installable candidates', () => {
    writeStarter('research-synthesis', '# Research Synthesis\n\nSynthesize research findings from web_search and web_fetch results');

    const proposal = searchCapabilities({
      need: 'synthesize research',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    expect(proposal.gapDetected).toBe(true);
    // Summary should mention risk
    expect(proposal.summary).toContain('Risk level');
  });

  it('high-risk starter skill is correctly classified', () => {
    writeStarter('deploy-tool', '# Deploy Tool\n\nUse bash to deploy with the api_key, then write_file the deployment log');

    const proposal = searchCapabilities({
      need: 'deploy my application',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const deployer = proposal.candidates.find(c => c.name === 'deploy-tool');
    expect(deployer).toBeDefined();
    // starter_pack base=0 + codeExecution=2 + secrets=2 + fileSystem=1 = 5 → high
    expect(deployer!.trust!.riskLevel).toBe('high');
    expect(deployer!.trust!.approvalClass).toBe('critical');
  });

  it('low-risk instruction-only skill has no elevated permissions', () => {
    writeStarter('brainstorm', '# Brainstorm\n\nUse divergent thinking, then converge on ideas.');

    const proposal = searchCapabilities({
      need: 'brainstorm ideas',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const brainstorm = proposal.candidates.find(c => c.name === 'brainstorm');
    expect(brainstorm).toBeDefined();
    const perms = brainstorm!.trust!.permissions;
    expect(perms.fileSystem).toBe(false);
    expect(perms.network).toBe(false);
    expect(perms.codeExecution).toBe(false);
    expect(perms.externalServices).toBe(false);
    expect(perms.secrets).toBe(false);
    expect(perms.browserAutomation).toBe(false);
  });

  it('trust assessment does not change candidate scoring/ranking', () => {
    writeStarter('risk-assessment', '# Risk Assessment\n\nEvaluate project risks');
    writeStarter('risk-matrix', '# Risk Matrix\n\nCreate a risk probability/impact matrix');

    const proposal = searchCapabilities({
      need: 'risk assessment',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    // Both should appear, scored by keyword match, not by trust
    expect(proposal.candidates.length).toBeGreaterThanOrEqual(1);
    // Scoring is by keyword match — risk-assessment has direct name match
    const first = proposal.candidates[0];
    expect(first.name).toBe('risk-assessment');
    expect(first.trust).toBeDefined();
  });

  it('proposal with installable recommendation mentions approval class', () => {
    writeStarter('daily-plan', '# Daily Plan\n\nOrganize your day effectively');

    const proposal = searchCapabilities({
      need: 'plan my day',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    if (proposal.recommendation?.availability === 'installable') {
      expect(proposal.summary).toContain('Approval required');
    }
  });

  it('candidate trust is available for runtime consumption', () => {
    writeStarter('meeting-prep', '# Meeting Prep\n\nPrepare talking points and agenda');

    const proposal = searchCapabilities({
      need: 'prepare for meeting',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const candidate = proposal.candidates.find(c => c.name === 'meeting-prep');
    expect(candidate).toBeDefined();
    // Trust assessment is structured for runtime use
    const trust = candidate!.trust!;
    expect(typeof trust.riskLevel).toBe('string');
    expect(typeof trust.trustSource).toBe('string');
    expect(typeof trust.approvalClass).toBe('string');
    expect(typeof trust.assessmentMode).toBe('string');
    expect(typeof trust.explanation).toBe('string');
    expect(Array.isArray(trust.factors)).toBe(true);
    expect(typeof trust.permissions).toBe('object');
  });

  it('skill with declared permissions gets assessmentMode mixed', () => {
    const skillWithFrontmatter = `---
permissions:
  network: true
  codeExecution: true
---

# Deploy Skill
Deploy using web_fetch and bash commands.`;

    writeStarter('deploy-skill', skillWithFrontmatter);

    const proposal = searchCapabilities({
      need: 'deploy my application',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const deployer = proposal.candidates.find(c => c.name === 'deploy-skill');
    expect(deployer).toBeDefined();
    expect(deployer!.trust).toBeDefined();
    // Has both declared permissions AND content analysis -> mixed
    expect(deployer!.trust!.assessmentMode).toBe('mixed');
    expect(deployer!.trust!.permissions.network).toBe(true);
    expect(deployer!.trust!.permissions.codeExecution).toBe(true);
  });

  it('skill without frontmatter still gets assessmentMode heuristic', () => {
    writeStarter('plain-skill', '# Plain Skill\n\nJust instructions, no frontmatter at all.');

    const proposal = searchCapabilities({
      need: 'plain skill for task',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const plain = proposal.candidates.find(c => c.name === 'plain-skill');
    expect(plain).toBeDefined();
    expect(plain!.trust!.assessmentMode).toBe('heuristic');
  });

  it('declared permissions are merged with heuristic detection', () => {
    // Frontmatter declares network, content mentions bash (codeExecution heuristic)
    const skillContent = `---
permissions:
  network: true
---

# Hybrid Skill
Run bash commands to process data.`;

    writeStarter('hybrid-skill', skillContent);

    const proposal = searchCapabilities({
      need: 'hybrid skill processing',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: [],
    });

    const hybrid = proposal.candidates.find(c => c.name === 'hybrid-skill');
    expect(hybrid).toBeDefined();
    // network from declared, codeExecution from heuristic (bash keyword)
    expect(hybrid!.trust!.permissions.network).toBe(true);
    expect(hybrid!.trust!.permissions.codeExecution).toBe(true);
    expect(hybrid!.trust!.assessmentMode).toBe('mixed');
  });

  it('multiple candidates each have independent trust assessments', () => {
    writeStarter('simple-skill', '# Simple\n\nJust instructions, no tools.');
    writeStarter('complex-skill', '# Complex\n\nUse bash and web_fetch with api_key');

    const proposal = searchCapabilities({
      need: 'skill for my task',
      installedSkills: [],
      starterSkillsDir: starterDir,
      nativeToolNames: ['bash'],
    });

    const simple = proposal.candidates.find(c => c.name === 'simple-skill');
    const complex = proposal.candidates.find(c => c.name === 'complex-skill');

    if (simple && complex) {
      expect(simple.trust!.riskLevel).not.toBe(complex.trust!.riskLevel);
    }
  });
});
