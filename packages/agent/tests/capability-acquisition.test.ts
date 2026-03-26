import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  searchCapabilities,
  validateInstallCandidate,
  loadStarterSkillsMeta,
  type SearchCapabilitiesInput,
} from '../src/capability-acquisition.js';

describe('capability-acquisition', () => {
  let tmpDir: string;
  let starterDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-acq-'));
    starterDir = path.join(tmpDir, 'starter-skills');
    fs.mkdirSync(starterDir, { recursive: true });

    // Create sample starter skills
    fs.writeFileSync(
      path.join(starterDir, 'risk-assessment.md'),
      '# Risk Assessment — Project Risk Identification and Ranking\n\nSystematically identify, evaluate, and plan mitigations for project risks.\n\n## What to do\n1. Identify risks across categories: Technical, Schedule, External, People, Scope\n2. Evaluate likelihood and impact\n3. Plan mitigations',
    );
    fs.writeFileSync(
      path.join(starterDir, 'research-synthesis.md'),
      '# Research Synthesis — Multi-Source Investigation\n\nConduct structured research across available sources, organize findings, and provide a coherent synthesis.\n\n## What to do\n1. Clarify the research question\n2. Gather from all sources\n3. Organize findings by theme\n4. Synthesize conclusions',
    );
    fs.writeFileSync(
      path.join(starterDir, 'code-review.md'),
      '# Code Review — Structured Review Checklist\n\nReview code changes systematically for correctness, readability, security, and performance.\n\n## What to do\n1. Read the diff\n2. Check correctness and edge cases\n3. Evaluate readability\n4. Security scan',
    );
    fs.writeFileSync(
      path.join(starterDir, 'daily-plan.md'),
      '# Daily Plan — Structured Day Planning\n\nCreate a focused daily plan from workspace context.\n\n## What to do\n1. Review active tasks\n2. Prioritize by urgency and importance\n3. Time-block your day',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── loadStarterSkillsMeta ─────────────────────────────────────────

  describe('loadStarterSkillsMeta', () => {
    it('loads starter skills with name, content, and firstLine', () => {
      const metas = loadStarterSkillsMeta(starterDir);
      expect(metas.length).toBe(4);

      const risk = metas.find(m => m.name === 'risk-assessment');
      expect(risk).toBeDefined();
      expect(risk!.firstLine).toContain('Risk Assessment');
      expect(risk!.content).toContain('mitigations');
    });

    it('returns empty array for non-existent directory', () => {
      const result = loadStarterSkillsMeta('/nonexistent/path');
      expect(result).toEqual([]);
    });
  });

  // ── searchCapabilities ────────────────────────────────────────────

  describe('searchCapabilities', () => {
    it('finds installable starter skill matching the need', () => {
      const result = searchCapabilities({
        need: 'risk assessment for my project',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      expect(result.gapDetected).toBe(true);
      expect(result.alreadyHandled).toBe(false);
      expect(result.candidates.length).toBeGreaterThan(0);

      const riskCandidate = result.candidates.find(c => c.name === 'risk-assessment');
      expect(riskCandidate).toBeDefined();
      expect(riskCandidate!.type).toBe('skill');
      expect(riskCandidate!.availability).toBe('installable');
      expect(riskCandidate!.source).toBe('starter-pack');
      expect(riskCandidate!.installAction).toBe('install_capability');
    });

    it('marks active skills as already handled when they match well', () => {
      const result = searchCapabilities({
        need: 'risk assessment',
        installedSkills: [{
          name: 'risk-assessment',
          content: '# Risk Assessment — identify, evaluate, and plan mitigations for project risks.',
        }],
        starterSkillsDir: starterDir,
      });

      expect(result.alreadyHandled).toBe(true);
      const active = result.candidates.find(c => c.name === 'risk-assessment' && c.availability === 'active');
      expect(active).toBeDefined();
      expect(active!.installAction).toBeNull();
    });

    it('skips starter skills that are already installed', () => {
      const result = searchCapabilities({
        need: 'risk assessment',
        installedSkills: [{
          name: 'risk-assessment',
          content: '# Risk Assessment — custom version',
        }],
        starterSkillsDir: starterDir,
      });

      // Should not have a duplicate installable candidate
      const installable = result.candidates.filter(c => c.name === 'risk-assessment' && c.availability === 'installable');
      expect(installable.length).toBe(0);
    });

    it('finds native tools and marks them as active with no install action', () => {
      const result = searchCapabilities({
        need: 'search the internet for information',
        installedSkills: [],
        starterSkillsDir: starterDir,
        nativeToolNames: ['web_search', 'web_fetch', 'read_file'],
      });

      const webSearch = result.candidates.find(c => c.name === 'web_search');
      expect(webSearch).toBeDefined();
      expect(webSearch!.type).toBe('native');
      expect(webSearch!.availability).toBe('active');
      expect(webSearch!.installAction).toBeNull();
    });

    it('prefers native tools over installable skills when native matches well', () => {
      const result = searchCapabilities({
        need: 'search for files in the project',
        installedSkills: [],
        starterSkillsDir: starterDir,
        nativeToolNames: ['search_files', 'search_content'],
      });

      // Native tool should be first because it's active
      expect(result.alreadyHandled).toBe(true);
      expect(result.recommendation?.type).toBe('native');
    });

    it('returns empty candidates for meaningless keywords', () => {
      const result = searchCapabilities({
        need: 'the a an',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      expect(result.candidates.length).toBe(0);
      expect(result.gapDetected).toBe(false);
    });

    it('returns research-synthesis for research needs', () => {
      const result = searchCapabilities({
        need: 'synthesize research from multiple sources',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      expect(result.gapDetected).toBe(true);
      const research = result.candidates.find(c => c.name === 'research-synthesis');
      expect(research).toBeDefined();
      expect(research!.availability).toBe('installable');
    });

    it('caps candidates at 8', () => {
      // Create many starter skills
      for (let i = 0; i < 15; i++) {
        fs.writeFileSync(
          path.join(starterDir, `test-skill-${i}.md`),
          `# Test Skill ${i}\n\nSkill about assessment and evaluation and risk and planning and research`,
        );
      }

      const result = searchCapabilities({
        need: 'assessment evaluation risk planning research',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      expect(result.candidates.length).toBeLessThanOrEqual(8);
    });

    it('includes matchReason with meaningful keywords', () => {
      const result = searchCapabilities({
        need: 'code review checklist',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      const codeReview = result.candidates.find(c => c.name === 'code-review');
      expect(codeReview).toBeDefined();
      expect(codeReview!.matchReason).toBeTruthy();
      expect(codeReview!.matchReason.length).toBeGreaterThan(5);
    });
  });

  // ── Proposal formatting ───────────────────────────────────────────

  describe('proposal summary', () => {
    it('explains gap and recommendation for installable skill', () => {
      const result = searchCapabilities({
        need: 'risk assessment',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      expect(result.summary).toContain('Capability Gap Detected');
      expect(result.summary).toContain('risk-assessment');
      expect(result.summary).toContain('Recommendation');
      expect(result.summary).toContain('install_capability');
      expect(result.summary).toContain('Approval required');
    });

    it('tells the agent to use existing capability when already handled', () => {
      const result = searchCapabilities({
        need: 'search the web',
        installedSkills: [],
        starterSkillsDir: starterDir,
        nativeToolNames: ['web_search'],
      });

      expect(result.summary).toContain('built-in tool');
      expect(result.summary).toContain('web_search');
      expect(result.summary).not.toContain('Capability Gap Detected');
    });

    it('suggests create_skill when nothing matches', () => {
      const result = searchCapabilities({
        need: 'astrophysics quantum calculations',
        installedSkills: [],
        starterSkillsDir: starterDir,
      });

      expect(result.summary).toContain('create_skill');
    });
  });

  // ── Type/status distinctions (correction #2) ─────────────────────

  describe('type and availability distinctions', () => {
    it('distinguishes native (active), skill (active), skill (installable)', () => {
      const result = searchCapabilities({
        need: 'review code changes',
        installedSkills: [{
          name: 'my-review-guide',
          content: '# My Review Guide\n\nCustom code review process',
        }],
        starterSkillsDir: starterDir,
        nativeToolNames: ['git_diff', 'read_file'],
      });

      const types = result.candidates.map(c => `${c.type}:${c.availability}`);
      // Should have a mix of types
      expect(types.some(t => t === 'native:active')).toBe(true);
      expect(types.some(t => t === 'skill:active' || t === 'skill:installable')).toBe(true);
    });

    it('native tools never have installAction', () => {
      const result = searchCapabilities({
        need: 'bash command terminal',
        installedSkills: [],
        starterSkillsDir: starterDir,
        nativeToolNames: ['bash'],
      });

      for (const c of result.candidates.filter(cc => cc.type === 'native')) {
        expect(c.installAction).toBeNull();
      }
    });
  });

  // ── validateInstallCandidate ──────────────────────────────────────

  describe('validateInstallCandidate', () => {
    it('validates a real starter skill', () => {
      const result = validateInstallCandidate('risk-assessment', 'starter-pack', starterDir, new Set());
      expect(result.valid).toBe(true);
      expect(result.candidateType).toBe('skill');
      expect(result.starterPath).toContain('risk-assessment.md');
    });

    it('rejects non-starter-pack source', () => {
      const result = validateInstallCandidate('risk-assessment', 'marketplace', starterDir, new Set());
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('rejects skill not in starter pack', () => {
      const result = validateInstallCandidate('nonexistent-skill', 'starter-pack', starterDir, new Set());
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects already-installed skill', () => {
      const result = validateInstallCandidate('risk-assessment', 'starter-pack', starterDir, new Set(['risk-assessment']));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already installed');
    });
  });
});
