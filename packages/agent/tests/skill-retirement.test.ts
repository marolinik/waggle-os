/**
 * Skills 2.0 gap F — skill usage tracking + auto-retirement.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, ImprovementSignalStore } from '@waggle/core';
import { retireStaleSkills } from '../src/skill-retirement.js';
import {
  recordSkillUsage,
  loadSkillUsage,
  saveSkillUsage,
  forgetSkillUsage,
} from '../src/skill-usage.js';

function seedSkill(dir: string, name: string, mtimeMs: number, content = '# body'): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.md`);
  fs.writeFileSync(p, content, 'utf-8');
  const mtime = new Date(mtimeMs);
  fs.utimesSync(p, mtime, mtime);
  return p;
}

describe('skill-usage — gap F', () => {
  let waggleHome: string;

  beforeEach(() => {
    waggleHome = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-usage-'));
  });
  afterEach(() => {
    fs.rmSync(waggleHome, { recursive: true, force: true });
  });

  it('records a new skill usage and increments on repeat', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const first = recordSkillUsage(waggleHome, 'deploy', () => t0);
    expect(first.count).toBe(1);
    expect(first.lastUsedAt).toBe(t0.toISOString());

    const t1 = new Date('2026-02-01T00:00:00Z');
    const second = recordSkillUsage(waggleHome, 'deploy', () => t1);
    expect(second.count).toBe(2);
    expect(second.lastUsedAt).toBe(t1.toISOString());
  });

  it('loadSkillUsage returns {} when the file is missing', () => {
    expect(loadSkillUsage(waggleHome)).toEqual({});
  });

  it('loadSkillUsage tolerates a corrupt index file', () => {
    fs.writeFileSync(path.join(waggleHome, 'skill-usage.json'), 'not-json{', 'utf-8');
    expect(loadSkillUsage(waggleHome)).toEqual({});
  });

  it('forgetSkillUsage removes a single entry without touching others', () => {
    saveSkillUsage(waggleHome, {
      a: { lastUsedAt: '2026-01-01T00:00:00.000Z', count: 1 },
      b: { lastUsedAt: '2026-01-02T00:00:00.000Z', count: 3 },
    });
    forgetSkillUsage(waggleHome, 'a');
    const idx = loadSkillUsage(waggleHome);
    expect(idx.a).toBeUndefined();
    expect(idx.b).toBeDefined();
  });
});

describe('retireStaleSkills — gap F', () => {
  let waggleHome: string;
  let skillsDir: string;
  let db: MindDB;
  let signals: ImprovementSignalStore;

  const NOW = new Date('2026-04-15T00:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    waggleHome = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-retire-'));
    skillsDir = path.join(waggleHome, 'skills');
    db = new MindDB(':memory:');
    signals = new ImprovementSignalStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(waggleHome, { recursive: true, force: true });
  });

  it('retires skills whose last-used is older than maxIdleDays', () => {
    // Fresh skill — used 10 days ago — should NOT be retired
    const fresh = seedSkill(skillsDir, 'fresh', NOW.getTime());
    saveSkillUsage(waggleHome, {
      fresh: { lastUsedAt: new Date(NOW.getTime() - 10 * DAY).toISOString(), count: 5 },
      stale: { lastUsedAt: new Date(NOW.getTime() - 200 * DAY).toISOString(), count: 1 },
    });
    // Stale skill — used 200 days ago — SHOULD be retired
    const stale = seedSkill(skillsDir, 'stale', NOW.getTime());

    const report = retireStaleSkills(waggleHome, {
      maxIdleDays: 90,
      now: () => NOW,
      improvementSignals: signals,
    });

    expect(report.scanned).toBe(2);
    expect(report.retired).toEqual(['stale']);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
    expect(report.archived.length).toBe(1);
    expect(fs.existsSync(report.archived[0])).toBe(true);

    // Usage entry for the retired skill is cleared
    expect(loadSkillUsage(waggleHome).stale).toBeUndefined();
    expect(loadSkillUsage(waggleHome).fresh).toBeDefined();

    // Signal recorded
    const recorded = signals.getByCategory('workflow_pattern').find(s => s.pattern_key === 'retire:stale');
    expect(recorded).toBeDefined();
  });

  it('falls back to file mtime when no usage entry exists', () => {
    // mtime 200 days ago, no usage entry
    seedSkill(skillsDir, 'never-used', NOW.getTime() - 200 * DAY);
    const report = retireStaleSkills(waggleHome, { maxIdleDays: 90, now: () => NOW });
    expect(report.retired).toEqual(['never-used']);
  });

  it('dry_run reports but does not move files', () => {
    const stalePath = seedSkill(skillsDir, 'stale', NOW.getTime() - 200 * DAY);
    const report = retireStaleSkills(waggleHome, {
      maxIdleDays: 90,
      dryRun: true,
      now: () => NOW,
    });
    expect(report.retired).toEqual(['stale']);
    expect(report.archived.length).toBe(0);
    expect(fs.existsSync(stalePath)).toBe(true); // File NOT moved
  });

  it('returns an empty report when the skills dir is missing', () => {
    const report = retireStaleSkills(waggleHome, { maxIdleDays: 90, now: () => NOW });
    expect(report.scanned).toBe(0);
    expect(report.retired).toEqual([]);
  });

  it('keeps fresh skills untouched when all are within the window', () => {
    seedSkill(skillsDir, 'a', NOW.getTime() - 5 * DAY);
    seedSkill(skillsDir, 'b', NOW.getTime() - 20 * DAY);
    saveSkillUsage(waggleHome, {
      a: { lastUsedAt: new Date(NOW.getTime() - 5 * DAY).toISOString(), count: 1 },
      b: { lastUsedAt: new Date(NOW.getTime() - 20 * DAY).toISOString(), count: 1 },
    });
    const report = retireStaleSkills(waggleHome, { maxIdleDays: 90, now: () => NOW });
    expect(report.retired).toEqual([]);
    expect(report.skipped.every(s => s.reason === 'fresh')).toBe(true);
  });
});
