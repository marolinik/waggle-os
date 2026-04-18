import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadSystemPrompt,
  loadSystemPromptWithOverrides,
  assertOverridesReachActiveSpec,
  loadSkills,
} from '../src/prompt-loader.js';
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

  // ── H-08 G2 — override-aware loader ──────────────────────────
  describe('loadSystemPromptWithOverrides', () => {
    it('returns baseline when no overrides exist', () => {
      const composed = loadSystemPromptWithOverrides(tmpDir);
      expect(composed.userPromptMd).toBeNull();
      expect(composed.behavioralSpec).toBeDefined();
      // Baseline should contain at least one known section string
      const flattened = Object.values(composed.behavioralSpec).join('\n');
      expect(flattened.length).toBeGreaterThan(0);
      expect(composed.customPersonas).toEqual([]);
    });

    it('surfaces a custom system-prompt.md alongside baseline spec', () => {
      fs.writeFileSync(path.join(tmpDir, 'system-prompt.md'), 'hello from user');
      const composed = loadSystemPromptWithOverrides(tmpDir);
      expect(composed.userPromptMd).toBe('hello from user');
    });

    it('applies behavioral-spec overrides into the active spec', () => {
      const overrideDir = path.join(tmpDir, 'behavioral-overrides');
      fs.mkdirSync(overrideDir, { recursive: true });
      fs.writeFileSync(
        path.join(overrideDir, 'coreLoop.json'),
        JSON.stringify({
          section: 'coreLoop',
          text: 'CUSTOM CORE LOOP CONTENT FOR TEST',
          deployedAt: new Date().toISOString(),
        }),
      );

      const composed = loadSystemPromptWithOverrides(tmpDir);
      const flattened = Object.values(composed.behavioralSpec).join('\n');
      expect(flattened).toContain('CUSTOM CORE LOOP CONTENT FOR TEST');
    });
  });

  describe('assertOverridesReachActiveSpec', () => {
    it('is quiet when no overrides are deployed', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const composed = loadSystemPromptWithOverrides(tmpDir);
      assertOverridesReachActiveSpec(tmpDir, composed.behavioralSpec);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('warns when disk has overrides but activeSpec does not contain them', () => {
      const overrideDir = path.join(tmpDir, 'behavioral-overrides');
      fs.mkdirSync(overrideDir, { recursive: true });
      fs.writeFileSync(
        path.join(overrideDir, 'coreLoop.json'),
        JSON.stringify({
          section: 'coreLoop',
          text: 'UNIQUE MARKER STRING FOR G2 TEST — LONG ENOUGH TO MATCH',
          deployedAt: new Date().toISOString(),
        }),
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Simulate using the BARE loader — activeSpec is the compile-time
      // baseline with no overrides folded in.
      const fakeActiveSpec = loadSystemPromptWithOverrides(path.join(tmpDir, 'nothing')).behavioralSpec;
      assertOverridesReachActiveSpec(tmpDir, fakeActiveSpec);

      expect(warnSpy).toHaveBeenCalled();
      const message = warnSpy.mock.calls[0]?.[0] as string;
      expect(message).toContain('coreLoop');
      warnSpy.mockRestore();
    });
  });
});
