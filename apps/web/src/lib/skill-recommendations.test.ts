/**
 * Persona-aware skill recommendations.
 *
 * Two layers of guards:
 *  1. SHAPE — primary length 3-5, no duplicates, fallback for unknown
 *     personas, every persona has a mapping.
 *  2. CATALOG MEMBERSHIP — every recommended skill id resolves into
 *     SKILL_CATALOG and matches a real .md file in
 *     packages/sdk/src/starter-skills/. The latter check uses fs to read
 *     the directory at test time so a renamed/removed starter skill
 *     trips a failing test instead of shipping an empty chip.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  recommendSkills,
  allReferencedSkillIds,
  SKILL_CATALOG,
  SKILL_RECOMMENDATIONS,
} from './skill-recommendations';

// Locate the starter-skills directory relative to this test file.
const STARTER_SKILLS_DIR = path.resolve(__dirname, '../../../../packages/sdk/src/starter-skills');

function readStarterSkillIds(): Set<string> {
  if (!fs.existsSync(STARTER_SKILLS_DIR)) {
    throw new Error(`starter-skills dir not found at ${STARTER_SKILLS_DIR} — adjust the relative path if the repo layout changed`);
  }
  const ids = fs.readdirSync(STARTER_SKILLS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
  return new Set(ids);
}

describe('recommendSkills', () => {
  it('returns universal defaults for an unknown persona id', () => {
    const r = recommendSkills('not-a-real-persona-id');
    const ids = r.map(s => s.id);
    expect(ids).toContain('daily-plan');
    expect(ids).toContain('brainstorm');
    expect(ids).toContain('catch-up');
  });

  it('returns universal defaults when personaId is undefined or null', () => {
    expect(recommendSkills(undefined).length).toBeGreaterThan(0);
    expect(recommendSkills(null).length).toBeGreaterThan(0);
    expect(recommendSkills('').length).toBeGreaterThan(0);
  });

  it('returns persona-specific chips when the id matches', () => {
    const coder = recommendSkills('coder').map(s => s.id);
    expect(coder).toContain('code-review');
    expect(coder).toContain('review-pair');

    const consultant = recommendSkills('consultant').map(s => s.id);
    expect(consultant).toContain('research-synthesis');
    expect(consultant).toContain('decision-matrix');

    const writer = recommendSkills('writer').map(s => s.id);
    expect(writer).toContain('draft-memo');
    expect(writer).toContain('compare-docs');
  });

  it('attaches both label and starter to each chip — surface needs both', () => {
    const r = recommendSkills('coder');
    for (const chip of r) {
      expect(chip.label).toBeTruthy();
      expect(chip.starter).toBeTruthy();
      // Starter is a prompt template — should end with ': ' so the user types after the colon.
      expect(chip.starter.endsWith(': ')).toBe(true);
    }
  });
});

describe('SKILL_RECOMMENDATIONS shape', () => {
  it('every recommendation has 3-5 entries (chip-row cognitive ceiling)', () => {
    for (const [personaId, ids] of Object.entries(SKILL_RECOMMENDATIONS)) {
      expect(ids.length, `persona "${personaId}" has ${ids.length} skills`).toBeGreaterThanOrEqual(3);
      expect(ids.length, `persona "${personaId}" has ${ids.length} skills`).toBeLessThanOrEqual(5);
    }
  });

  it('no recommendation has duplicate skill ids', () => {
    for (const [personaId, ids] of Object.entries(SKILL_RECOMMENDATIONS)) {
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dupes, `persona "${personaId}" duplicates: ${dupes.join(', ')}`).toEqual([]);
    }
  });

  it('every recommended id has a SKILL_CATALOG entry (label + starter resolves)', () => {
    const referenced = allReferencedSkillIds();
    const missing = referenced.filter(id => !(id in SKILL_CATALOG));
    expect(missing, `recommendations reference ids not in SKILL_CATALOG: ${missing.join(', ')}`).toEqual([]);
  });

  it('every SKILL_CATALOG id matches a real .md file in starter-skills (catches typos and renames)', () => {
    const realIds = readStarterSkillIds();
    const catalogIds = Object.keys(SKILL_CATALOG);
    const missingFromDisk = catalogIds.filter(id => !realIds.has(id));
    expect(
      missingFromDisk,
      `SKILL_CATALOG references skills that don't exist in packages/sdk/src/starter-skills/: ${missingFromDisk.join(', ')}`,
    ).toEqual([]);
  });

  it('covers every persona id from persona-data.ts', () => {
    // Mirror of the list in persona-data.ts — duplicated intentionally to
    // avoid coupling apps/web -> packages/agent. If a persona is added
    // there but not here, this test fails and the fix is a one-line entry.
    const ALL_PERSONA_IDS = [
      'researcher', 'writer', 'analyst', 'coder',
      'project-manager', 'executive-assistant', 'sales-rep', 'marketer',
      'product-manager-senior', 'hr-manager', 'legal-professional',
      'finance-owner', 'consultant',
      'general-purpose', 'planner', 'verifier', 'coordinator',
      'support-agent', 'ops-manager', 'data-engineer', 'recruiter',
      'creative-director',
    ];
    const recommended = new Set(Object.keys(SKILL_RECOMMENDATIONS));
    const missing = ALL_PERSONA_IDS.filter(id => !recommended.has(id));
    expect(missing, `personas without a SKILL_RECOMMENDATIONS entry: ${missing.join(', ')}`).toEqual([]);
  });
});
