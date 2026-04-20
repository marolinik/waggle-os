/**
 * ComplianceTemplateStore unit tests (M-03)
 *
 * Covers CRUD + section merge semantics + default section fill-in + risk-class CHECK
 * constraint + deletion. Following HarvestRunStore test shape (in-memory MindDB).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { ComplianceTemplateStore, KVARK_TEMPLATE_NAME } from '../../src/compliance/template-store.js';
import type { ComplianceTemplateSections } from '../../src/compliance/types.js';

const ALL_ON: ComplianceTemplateSections = {
  interactions: true,
  oversight: true,
  models: true,
  provenance: true,
  riskAssessment: true,
  fria: true,
};
const ALL_OFF: ComplianceTemplateSections = {
  interactions: false,
  oversight: false,
  models: false,
  provenance: false,
  riskAssessment: false,
  fria: false,
};

describe('ComplianceTemplateStore', () => {
  let db: MindDB;
  let store: ComplianceTemplateStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ComplianceTemplateStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('persists a template with all fields', () => {
      const t = store.create({
        name: 'KVARK enterprise',
        description: 'Full AI Act package for enterprise on-prem',
        sections: ALL_ON,
        riskClassification: 'high-risk',
        orgName: 'KVARK Sovereign',
        footerText: 'Confidential — internal only',
      });
      expect(t.id).toBeGreaterThan(0);
      expect(t.name).toBe('KVARK enterprise');
      expect(t.description).toBe('Full AI Act package for enterprise on-prem');
      expect(t.sections).toEqual(ALL_ON);
      expect(t.riskClassification).toBe('high-risk');
      expect(t.orgName).toBe('KVARK Sovereign');
      expect(t.footerText).toBe('Confidential — internal only');
      expect(t.createdAt).toBeTruthy();
      expect(t.updatedAt).toBeTruthy();
    });

    it('defaults optional fields to null', () => {
      const t = store.create({ name: 'Bare', sections: ALL_OFF });
      expect(t.description).toBeNull();
      expect(t.riskClassification).toBeNull();
      expect(t.orgName).toBeNull();
      expect(t.footerText).toBeNull();
    });

    it('trims whitespace from name', () => {
      const t = store.create({ name: '  Spaced  ', sections: ALL_OFF });
      expect(t.name).toBe('Spaced');
    });

    it('rejects empty name', () => {
      expect(() => store.create({ name: '   ', sections: ALL_OFF })).toThrow(/name is required/i);
    });

    it('fills in missing section keys with defaults', () => {
      const t = store.create({
        name: 'Partial',
        // Only interactions specified; others should fall back to DEFAULT_SECTIONS.
        sections: { interactions: false } as ComplianceTemplateSections,
      });
      expect(t.sections.interactions).toBe(false);
      expect(t.sections.oversight).toBe(true); // default
      expect(t.sections.fria).toBe(false); // default
    });
  });

  describe('getById', () => {
    it('returns null for missing id', () => {
      expect(store.getById(999)).toBeNull();
    });

    it('round-trips a created template', () => {
      const a = store.create({ name: 'A', sections: ALL_ON, riskClassification: 'limited' });
      const b = store.getById(a.id);
      expect(b).not.toBeNull();
      expect(b?.name).toBe('A');
      expect(b?.sections).toEqual(ALL_ON);
      expect(b?.riskClassification).toBe('limited');
    });
  });

  describe('list', () => {
    it('returns empty array when none exist', () => {
      expect(store.list()).toEqual([]);
    });

    it('returns templates newest-updated first', async () => {
      store.create({ name: 'Old', sections: ALL_OFF });
      await new Promise(resolve => setTimeout(resolve, 1100)); // datetime('now') is second-resolution
      store.create({ name: 'New', sections: ALL_OFF });
      const list = store.list();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('New');
      expect(list[1].name).toBe('Old');
    });
  });

  describe('update', () => {
    it('returns null for missing id', () => {
      expect(store.update(999, { name: 'nope' })).toBeNull();
    });

    it('updates only the fields provided', () => {
      const t = store.create({
        name: 'Orig',
        description: 'desc',
        sections: ALL_ON,
        orgName: 'Acme',
      });
      const updated = store.update(t.id, { name: 'Renamed' });
      expect(updated?.name).toBe('Renamed');
      expect(updated?.description).toBe('desc'); // preserved
      expect(updated?.sections).toEqual(ALL_ON); // preserved
      expect(updated?.orgName).toBe('Acme'); // preserved
    });

    it('clears a field when explicitly set to null', () => {
      const t = store.create({
        name: 'T',
        sections: ALL_ON,
        orgName: 'To remove',
        footerText: 'also remove',
      });
      const updated = store.update(t.id, { orgName: null, footerText: null });
      expect(updated?.orgName).toBeNull();
      expect(updated?.footerText).toBeNull();
    });

    it('replaces sections wholesale', () => {
      const t = store.create({ name: 'T', sections: ALL_ON });
      const updated = store.update(t.id, { sections: ALL_OFF });
      expect(updated?.sections).toEqual(ALL_OFF);
    });

    it('rejects an empty rename', () => {
      const t = store.create({ name: 'T', sections: ALL_OFF });
      expect(() => store.update(t.id, { name: '  ' })).toThrow(/name is required/i);
    });

    it('bumps updated_at', async () => {
      const t = store.create({ name: 'T', sections: ALL_OFF });
      await new Promise(resolve => setTimeout(resolve, 1100));
      const updated = store.update(t.id, { name: 'T2' });
      expect(updated?.updatedAt).not.toBe(t.updatedAt);
    });
  });

  describe('delete', () => {
    it('returns false for missing id', () => {
      expect(store.delete(999)).toBe(false);
    });

    it('removes an existing row and returns true', () => {
      const t = store.create({ name: 'T', sections: ALL_OFF });
      expect(store.delete(t.id)).toBe(true);
      expect(store.getById(t.id)).toBeNull();
    });
  });

  describe('risk_classification CHECK constraint', () => {
    it('accepts all four AIActRiskLevel values', () => {
      for (const level of ['minimal', 'limited', 'high-risk', 'unacceptable'] as const) {
        const t = store.create({ name: `T-${level}`, sections: ALL_OFF, riskClassification: level });
        expect(t.riskClassification).toBe(level);
      }
    });

    it('rejects an invalid risk class at the SQL layer', () => {
      expect(() =>
        store.create({
          name: 'Bad',
          sections: ALL_OFF,
          riskClassification: 'super-dangerous' as never,
        }),
      ).toThrow(); // better-sqlite3 surfaces the CHECK violation
    });
  });

  describe('seedKvarkTemplateIfMissing (M-06)', () => {
    it('creates the KVARK template on first run', () => {
      const seeded = store.seedKvarkTemplateIfMissing();
      expect(seeded).not.toBeNull();
      expect(seeded!.name).toBe(KVARK_TEMPLATE_NAME);
      expect(seeded!.riskClassification).toBe('high-risk');
      expect(seeded!.sections.fria).toBe(true);
      expect(seeded!.orgName).toContain('KVARK');
      expect(seeded!.footerText).toContain('sovereign');
    });

    it('is idempotent — second call returns null', () => {
      store.seedKvarkTemplateIfMissing();
      expect(store.seedKvarkTemplateIfMissing()).toBeNull();
      // Only one KVARK row exists.
      const all = store.list().filter(t => t.name === KVARK_TEMPLATE_NAME);
      expect(all).toHaveLength(1);
    });

    it('does not seed when the user already created a same-named template', () => {
      store.create({
        name: KVARK_TEMPLATE_NAME,
        sections: ALL_OFF,
      });
      expect(store.seedKvarkTemplateIfMissing()).toBeNull();
    });
  });

  describe('mergeSections (static)', () => {
    it('unions template + runtime flags', () => {
      const template: ComplianceTemplateSections = { ...ALL_OFF, interactions: true, fria: true };
      const runtime: ComplianceTemplateSections = { ...ALL_OFF, oversight: true };
      const merged = ComplianceTemplateStore.mergeSections(template, runtime);
      expect(merged.interactions).toBe(true); // from template
      expect(merged.oversight).toBe(true); // from runtime
      expect(merged.fria).toBe(true); // from template
      expect(merged.models).toBe(false);
    });

    it('never hides a section the runtime requested (union semantics)', () => {
      const merged = ComplianceTemplateStore.mergeSections(ALL_OFF, ALL_ON);
      expect(merged).toEqual(ALL_ON);
    });

    it('never hides a section the template requested', () => {
      const merged = ComplianceTemplateStore.mergeSections(ALL_ON, ALL_OFF);
      expect(merged).toEqual(ALL_ON);
    });
  });
});
