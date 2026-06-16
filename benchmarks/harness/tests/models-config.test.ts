/**
 * Sprint 12 Task 1 Blocker #4 — judge model registry tests.
 *
 * Acceptance criteria (per brief § 4.2):
 *   1. `config/models.json` parses clean via Node JSON.parse.
 *   2. Every entry carries a `pinning_surface` field with a valid enum value.
 *   3. Anthropic-direct entries (`provider: 'anthropic'`) have
 *      `pinning_surface_carve_out_reason: null`.
 *   4. Non-Anthropic entries have non-null carve-out reason strings.
 *   5. Entry `id` field matches the hash-key under which it is stored.
 *   6. The 4 Sprint 11 judge models (Opus 4.7, GPT-5.4, Gemini 3.1,
 *      Grok 4.20) are all present with a valid `judge_role`.
 *
 * Additional coverage (bonus beyond brief's 6-test floor):
 *   - B2 LOCK quadri-vendor tie-break invariant: Grok 4.20 is judge_role
 *     `tertiary` (tie-break reserve, not primary).
 *   - PinningSurface + JudgeRole enum values line up with the TypeScript
 *     types in `types.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import type { JudgeRole, ModelSpec, PinningSurface } from '../src/types.js';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..');
const MODELS_PATH = path.join(HARNESS_ROOT, 'config', 'models.json');

const VALID_PINNING_SURFACES: readonly PinningSurface[] = [
  'anthropic_immutable',
  'floating_alias',
  'revision_hash_pinned',
];

const VALID_JUDGE_ROLES: readonly JudgeRole[] = ['primary', 'secondary', 'tertiary', 'reserve'];

/** Sprint 11 Task 2.2 ratified judge ensemble — 3-primary + 1-reserve. */
const REQUIRED_JUDGE_IDS: readonly string[] = ['claude-opus-4-7', 'gpt-5.4', 'gemini-3.1', 'grok-4.20'];

function loadModels(): Record<string, ModelSpec> {
  const raw = fs.readFileSync(MODELS_PATH, 'utf-8');
  return JSON.parse(raw) as Record<string, ModelSpec>;
}

describe('models.json — file integrity (criterion 1, 5)', () => {
  it('exists at the expected path', () => {
    expect(fs.existsSync(MODELS_PATH)).toBe(true);
  });

  it('parses cleanly as JSON', () => {
    expect(() => loadModels()).not.toThrow();
  });

  it('every entry id matches its hash-key', () => {
    const models = loadModels();
    for (const [key, entry] of Object.entries(models)) {
      expect(entry.id).toBe(key);
    }
  });

  it('no duplicate ids', () => {
    const models = loadModels();
    const ids = Object.values(models).map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pinning_surface field (criteria 2, 3, 4)', () => {
  it('every entry has a pinning_surface field', () => {
    const models = loadModels();
    for (const [key, entry] of Object.entries(models)) {
      expect(entry.pinning_surface, `model ${key} missing pinning_surface`).toBeDefined();
    }
  });

  it('every pinning_surface value is in the B3 addendum § 4 enum', () => {
    const models = loadModels();
    for (const [key, entry] of Object.entries(models)) {
      expect(
        VALID_PINNING_SURFACES.includes(entry.pinning_surface as PinningSurface),
        `model ${key} has invalid pinning_surface: ${entry.pinning_surface}`,
      ).toBe(true);
    }
  });

  it('anthropic_immutable entries have null carve_out_reason', () => {
    const models = loadModels();
    const anthropicImmutable = Object.entries(models).filter(
      ([, entry]) => entry.pinning_surface === 'anthropic_immutable',
    );
    expect(anthropicImmutable.length).toBeGreaterThan(0);
    for (const [key, entry] of anthropicImmutable) {
      expect(
        entry.pinning_surface_carve_out_reason,
        `anthropic_immutable model ${key} must have null carve_out_reason`,
      ).toBeNull();
    }
  });

  it('floating_alias entries have non-null carve_out_reason with B3 addendum rationale', () => {
    const models = loadModels();
    const floatingAlias = Object.entries(models).filter(
      ([, entry]) => entry.pinning_surface === 'floating_alias',
    );
    expect(floatingAlias.length).toBeGreaterThan(0);
    for (const [key, entry] of floatingAlias) {
      const reason = entry.pinning_surface_carve_out_reason;
      expect(reason, `floating_alias model ${key} must have non-null carve_out_reason`).not.toBeNull();
      expect(typeof reason).toBe('string');
      expect((reason as string).length).toBeGreaterThan(10);
      // B3 addendum § 5 requires the reason to reference the addendum so an
      // audit grep surfaces every carve-out in one query.
      expect(reason as string).toMatch(/B3 addendum/);
    }
  });
});

describe('Sprint 11 Task 2.2 judge ensemble (criterion 6)', () => {
  it('all four required judge entries are present', () => {
    const models = loadModels();
    for (const id of REQUIRED_JUDGE_IDS) {
      expect(models[id], `required judge ${id} missing from registry`).toBeDefined();
    }
  });

  it('every judge entry has a judge_role in the valid enum', () => {
    const models = loadModels();
    for (const id of REQUIRED_JUDGE_IDS) {
      const entry = models[id];
      expect(entry.judge_role).toBeDefined();
      expect(VALID_JUDGE_ROLES.includes(entry.judge_role as JudgeRole)).toBe(true);
    }
  });

  it('Opus 4.7 is anthropic_immutable primary (A3 LOCK § 4 consistency)', () => {
    const models = loadModels();
    const opus = models['claude-opus-4-7'];
    expect(opus.pinning_surface).toBe('anthropic_immutable');
    expect(opus.pinning_surface_carve_out_reason).toBeNull();
    expect(opus.judge_role).toBe('primary');
    expect(opus.provider).toBe('anthropic');
  });

  it('Grok 4.20 is the reserve tie-break (B2 LOCK § 1 quadri-vendor invariant)', () => {
    const models = loadModels();
    const grok = models['grok-4.20'];
    expect(grok).toBeDefined();
    expect(grok.judge_role).toBe('reserve');
    expect(grok.pinning_surface).toBe('floating_alias');
    expect(grok.provider).toBe('xai_via_openrouter');
  });

  it('GPT-5.4 + Gemini 3.1 are primary judges (B2 LOCK § 1 3-vendor primary ensemble)', () => {
    const models = loadModels();
    const gpt = models['gpt-5.4'];
    const gemini = models['gemini-3.1'];
    expect(gpt.judge_role).toBe('primary');
    expect(gpt.pinning_surface).toBe('floating_alias');
    expect(gemini.judge_role).toBe('primary');
    expect(gemini.pinning_surface).toBe('floating_alias');
  });

  it('target models (not judges) leave judge_role undefined', () => {
    const models = loadModels();
    const qwenTarget = models['qwen3.6-35b-a3b-stage2'];
    expect(qwenTarget).toBeDefined();
    expect(qwenTarget.judge_role).toBeUndefined();
  });
});

describe('ModelSpec shape invariants', () => {
  it('every entry has the Sprint 7 baseline fields (id/displayName/provider/litellmModel/pricing/contextWindow)', () => {
    const models = loadModels();
    for (const [key, entry] of Object.entries(models)) {
      expect(typeof entry.id, `${key}.id`).toBe('string');
      expect(typeof entry.displayName, `${key}.displayName`).toBe('string');
      expect(typeof entry.provider, `${key}.provider`).toBe('string');
      expect(typeof entry.litellmModel, `${key}.litellmModel`).toBe('string');
      expect(typeof entry.pricePerMillionInput, `${key}.pricePerMillionInput`).toBe('number');
      expect(typeof entry.pricePerMillionOutput, `${key}.pricePerMillionOutput`).toBe('number');
      expect(typeof entry.contextWindow, `${key}.contextWindow`).toBe('number');
    }
  });
});

// ── Plan 05: frontier baseline subjects (Opus 4.8 / GPT-5.5 / Gemini fallback) ──
describe('Plan 05 — claude-opus-4-8 frontier subject', () => {
  it('is present and key === id', () => {
    const models = loadModels();
    const opus48 = models['claude-opus-4-8'];
    expect(opus48, 'claude-opus-4-8 missing from registry').toBeDefined();
    expect(opus48.id).toBe('claude-opus-4-8');
  });

  it('is an anthropic_immutable subject with null carve-out and NO judge_role', () => {
    const models = loadModels();
    const opus48 = models['claude-opus-4-8'];
    expect(opus48.provider).toBe('anthropic');
    expect(opus48.pinning_surface).toBe('anthropic_immutable');
    expect(opus48.pinning_surface_carve_out_reason).toBeNull();
    // Subject model, not a judge — vendor-circularity guard (recon §5.6).
    expect(opus48.judge_role).toBeUndefined();
  });

  it('carries the recon-pinned price ($5/$25) and 1M context, not the 4.6/4.7 $15/$75', () => {
    const models = loadModels();
    const opus48 = models['claude-opus-4-8'];
    expect(opus48.pricePerMillionInput).toBe(5.0);
    expect(opus48.pricePerMillionOutput).toBe(25.0);
    expect(opus48.contextWindow).toBe(1_000_000);
    expect(opus48.litellmModel).toBe('claude-opus-4-8');
  });
});

describe('Plan 05 — gpt-5.5 frontier subject', () => {
  it('is present and key === id', () => {
    const models = loadModels();
    const gpt55 = models['gpt-5.5'];
    expect(gpt55, 'gpt-5.5 missing from registry').toBeDefined();
    expect(gpt55.id).toBe('gpt-5.5');
  });

  it('is a floating_alias subject with a B3-addendum carve-out and NO judge_role', () => {
    const models = loadModels();
    const gpt55 = models['gpt-5.5'];
    expect(gpt55.provider).toBe('openai_via_openrouter');
    expect(gpt55.pinning_surface).toBe('floating_alias');
    const reason = gpt55.pinning_surface_carve_out_reason;
    expect(reason, 'floating_alias requires a non-null carve-out reason').not.toBeNull();
    expect(typeof reason).toBe('string');
    // The strict contract: every floating_alias reason MUST cite the addendum
    // so an audit grep surfaces it (models-config.test.ts:115).
    expect(reason as string).toMatch(/B3 addendum/);
    // Subject, not a judge.
    expect(gpt55.judge_role).toBeUndefined();
  });

  it('carries the recon-pinned price ($5/$30) and records the snapshot in its carve-out', () => {
    const models = loadModels();
    const gpt55 = models['gpt-5.5'];
    expect(gpt55.pricePerMillionInput).toBe(5.0);
    expect(gpt55.pricePerMillionOutput).toBe(30.0);
    expect(gpt55.litellmModel).toBe('gpt-5.5');
    // The dated snapshot (gpt-5.5-2026-04-23) is recorded in the carve-out for
    // the per-row pinning audit (design-spec §5 + redteam E1).
    expect(gpt55.pinning_surface_carve_out_reason as string).toMatch(/gpt-5\.5-2026-04-23/);
  });
});
