import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deployPersonaOverride,
  rollbackPersonaOverride,
  deployBehavioralSpecOverride,
  rollbackBehavioralSpecOverride,
  loadBehavioralSpecOverrides,
  applyBehavioralSpecOverrides,
  BEHAVIORAL_SPEC_SECTIONS,
  type BehavioralSpecSection,
} from '../src/evolution-deploy.js';
import { getPersona, listPersonas, setPersonaDataDir } from '../src/personas.js';
import { loadCustomPersonas } from '../src/custom-personas.js';

// ── Test fixture: temp dir per-test ────────────────────────────

describe('evolution-deploy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-evo-deploy-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* Windows lock cleanup racy; ignore */ }
  });

  // ── deployPersonaOverride ──

  describe('deployPersonaOverride', () => {
    it('writes a JSON file named {id}.json in personas/', () => {
      const result = deployPersonaOverride(tmpDir, {
        personaId: 'coder',
        systemPrompt: 'You are the evolved coder.',
      });
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.path.endsWith(path.join('personas', 'coder.json'))).toBe(true);
      expect(result.backupPath).toBeNull();
      expect(result.deployedAt).toBeTruthy();
    });

    it('inherits built-in persona fields when targeting a known id', () => {
      // 'coder' is a built-in persona
      const builtin = getPersona('coder');
      expect(builtin).not.toBeNull();

      deployPersonaOverride(tmpDir, {
        personaId: 'coder',
        systemPrompt: 'EVOLVED coder prompt — tighter format.',
      });

      const [loaded] = loadCustomPersonas(tmpDir);
      expect(loaded.id).toBe('coder');
      expect(loaded.name).toBe(builtin!.name);
      expect(loaded.icon).toBe(builtin!.icon);
      expect(loaded.systemPrompt).toBe('EVOLVED coder prompt — tighter format.');
      expect(loaded.tools).toEqual(builtin!.tools);
    });

    it('creates a backup on subsequent writes', () => {
      const first = deployPersonaOverride(tmpDir, {
        personaId: 'coder', systemPrompt: 'v1',
      });
      expect(first.backupPath).toBeNull();

      const second = deployPersonaOverride(tmpDir, {
        personaId: 'coder', systemPrompt: 'v2',
      });
      expect(second.backupPath).not.toBeNull();
      expect(fs.existsSync(second.backupPath!)).toBe(true);
      expect(JSON.parse(fs.readFileSync(second.backupPath!, 'utf-8')).systemPrompt).toBe('v1');
      expect(JSON.parse(fs.readFileSync(first.path, 'utf-8')).systemPrompt).toBe('v2');
    });

    it('creates a minimal shell for unknown persona ids', () => {
      const result = deployPersonaOverride(tmpDir, {
        personaId: 'made-up-persona',
        systemPrompt: 'fresh prompt',
      });
      const loaded = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
      expect(loaded.id).toBe('made-up-persona');
      expect(loaded.name).toBe('made-up-persona');
      expect(loaded.systemPrompt).toBe('fresh prompt');
      expect(Array.isArray(loaded.tools)).toBe(true);
    });

    it('applies caller-supplied overrides (description, icon, tools)', () => {
      const result = deployPersonaOverride(tmpDir, {
        personaId: 'made-up',
        systemPrompt: 'x',
        overrides: {
          description: 'custom description',
          icon: 'brain',
          tools: ['tool_a', 'tool_b'],
        },
      });
      const loaded = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
      expect(loaded.description).toBe('custom description');
      expect(loaded.icon).toBe('brain');
      expect(loaded.tools).toEqual(['tool_a', 'tool_b']);
    });

    it('is picked up by listPersonas after setPersonaDataDir', () => {
      deployPersonaOverride(tmpDir, {
        personaId: 'coder',
        systemPrompt: 'EVOLVED ROUTING',
      });

      setPersonaDataDir(tmpDir);
      try {
        const personas = listPersonas();
        const evolved = personas.find(p => p.id === 'coder' && p.systemPrompt.includes('EVOLVED ROUTING'));
        expect(evolved).toBeDefined();
      } finally {
        setPersonaDataDir(''); // reset so other tests aren't polluted
      }
    });
  });

  // ── rollbackPersonaOverride ──

  describe('rollbackPersonaOverride', () => {
    it('restores .bak when present', () => {
      deployPersonaOverride(tmpDir, { personaId: 'coder', systemPrompt: 'v1' });
      const second = deployPersonaOverride(tmpDir, { personaId: 'coder', systemPrompt: 'v2' });
      expect(second.backupPath).not.toBeNull();

      const ok = rollbackPersonaOverride(tmpDir, 'coder');
      expect(ok).toBe(true);

      const [loaded] = loadCustomPersonas(tmpDir);
      expect(loaded.systemPrompt).toBe('v1');
    });

    it('deletes the override entirely when no .bak exists', () => {
      deployPersonaOverride(tmpDir, { personaId: 'coder', systemPrompt: 'v1' });
      const ok = rollbackPersonaOverride(tmpDir, 'coder');
      expect(ok).toBe(true);
      expect(loadCustomPersonas(tmpDir)).toHaveLength(0);
    });

    it('returns false for non-existent personas', () => {
      expect(rollbackPersonaOverride(tmpDir, 'ghost')).toBe(false);
    });
  });

  // ── deployBehavioralSpecOverride ──

  describe('deployBehavioralSpecOverride', () => {
    it('writes a JSON file named {section}.json in behavioral-overrides/', () => {
      const result = deployBehavioralSpecOverride(tmpDir, {
        section: 'coreLoop',
        text: 'Evolved core loop instructions.',
      });
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.path.endsWith(path.join('behavioral-overrides', 'coreLoop.json'))).toBe(true);
      const loaded = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
      expect(loaded.section).toBe('coreLoop');
      expect(loaded.text).toBe('Evolved core loop instructions.');
      expect(loaded.deployedAt).toBeTruthy();
    });

    it('stores the originating run uuid for audit', () => {
      const result = deployBehavioralSpecOverride(tmpDir, {
        section: 'qualityRules',
        text: 'new quality rules',
        runUuid: 'test-run-uuid-123',
      });
      const loaded = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
      expect(loaded.runUuid).toBe('test-run-uuid-123');
    });

    it('creates backup on subsequent writes', () => {
      const first = deployBehavioralSpecOverride(tmpDir, {
        section: 'coreLoop', text: 'v1',
      });
      expect(first.backupPath).toBeNull();
      const second = deployBehavioralSpecOverride(tmpDir, {
        section: 'coreLoop', text: 'v2',
      });
      expect(second.backupPath).not.toBeNull();
      expect(JSON.parse(fs.readFileSync(second.backupPath!, 'utf-8')).text).toBe('v1');
    });

    it('rejects unknown sections', () => {
      expect(() =>
        deployBehavioralSpecOverride(tmpDir, {
          section: 'notASection' as BehavioralSpecSection,
          text: 'x',
        }),
      ).toThrow(/Unknown behavioral-spec section/);
    });
  });

  // ── rollbackBehavioralSpecOverride ──

  describe('rollbackBehavioralSpecOverride', () => {
    it('restores .bak when present', () => {
      deployBehavioralSpecOverride(tmpDir, { section: 'coreLoop', text: 'v1' });
      deployBehavioralSpecOverride(tmpDir, { section: 'coreLoop', text: 'v2' });

      const ok = rollbackBehavioralSpecOverride(tmpDir, 'coreLoop');
      expect(ok).toBe(true);

      const overrides = loadBehavioralSpecOverrides(tmpDir);
      expect(overrides.coreLoop).toBe('v1');
    });

    it('removes the override when no backup exists', () => {
      deployBehavioralSpecOverride(tmpDir, { section: 'coreLoop', text: 'v1' });
      const ok = rollbackBehavioralSpecOverride(tmpDir, 'coreLoop');
      expect(ok).toBe(true);
      expect(loadBehavioralSpecOverrides(tmpDir).coreLoop).toBeUndefined();
    });
  });

  // ── loadBehavioralSpecOverrides ──

  describe('loadBehavioralSpecOverrides', () => {
    it('returns empty object when no overrides exist', () => {
      expect(loadBehavioralSpecOverrides(tmpDir)).toEqual({});
    });

    it('returns a section → text map for all written overrides', () => {
      deployBehavioralSpecOverride(tmpDir, { section: 'coreLoop', text: 'evolved core' });
      deployBehavioralSpecOverride(tmpDir, { section: 'qualityRules', text: 'evolved quality' });

      const overrides = loadBehavioralSpecOverrides(tmpDir);
      expect(overrides.coreLoop).toBe('evolved core');
      expect(overrides.qualityRules).toBe('evolved quality');
      expect(overrides.behavioralRules).toBeUndefined();
    });

    it('ignores malformed override files', () => {
      const dir = path.join(tmpDir, 'behavioral-overrides');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'coreLoop.json'), '{ not valid json');

      expect(loadBehavioralSpecOverrides(tmpDir)).toEqual({});
    });

    it('ignores files with empty text', () => {
      const dir = path.join(tmpDir, 'behavioral-overrides');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'coreLoop.json'), JSON.stringify({
        section: 'coreLoop', text: '', deployedAt: '2026-04-14',
      }));

      expect(loadBehavioralSpecOverrides(tmpDir).coreLoop).toBeUndefined();
    });
  });

  // ── applyBehavioralSpecOverrides ──

  describe('applyBehavioralSpecOverrides', () => {
    const baseline: Record<BehavioralSpecSection, string> = {
      coreLoop: 'base core',
      qualityRules: 'base quality',
      behavioralRules: 'base behavioral',
      workPatterns: 'base patterns',
      intelligenceDefaults: 'base intelligence',
    };

    it('returns baseline unchanged when no overrides', () => {
      expect(applyBehavioralSpecOverrides(baseline, {})).toEqual(baseline);
    });

    it('overlays provided sections', () => {
      const merged = applyBehavioralSpecOverrides(baseline, {
        coreLoop: 'EVOLVED core',
        qualityRules: 'EVOLVED quality',
      });
      expect(merged.coreLoop).toBe('EVOLVED core');
      expect(merged.qualityRules).toBe('EVOLVED quality');
      expect(merged.behavioralRules).toBe('base behavioral');
    });

    it('ignores empty/undefined overrides without clobbering baseline', () => {
      const merged = applyBehavioralSpecOverrides(baseline, {
        coreLoop: '',
        qualityRules: undefined,
      });
      expect(merged.coreLoop).toBe('base core');
      expect(merged.qualityRules).toBe('base quality');
    });
  });

  // ── BEHAVIORAL_SPEC_SECTIONS constant ──

  describe('BEHAVIORAL_SPEC_SECTIONS', () => {
    it('contains the expected 5 sections in expected order', () => {
      expect(BEHAVIORAL_SPEC_SECTIONS).toEqual([
        'coreLoop', 'qualityRules', 'behavioralRules',
        'workPatterns', 'intelligenceDefaults',
      ]);
    });
  });
});
