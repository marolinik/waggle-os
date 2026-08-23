import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getSkillAuditPath,
  loadSkillAudit,
  saveSkillAudit,
  recordAuditBadge,
  getAuditBadge,
  isSkillVerified,
  clearAuditBadge,
  shouldSkipAudit,
  type SkillAuditBadge,
} from '../src/skill-audit-store.js';

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-audit-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

const badge = (over: Partial<SkillAuditBadge> = {}): Omit<SkillAuditBadge, 'auditedAt'> => ({
  verified: true, score: 0.88, confidence: 0.88, attempts: 1, rewritten: false, demoted: false, ...over,
});

const tempFiles = (): string[] => fs.readdirSync(home).filter(file => file.endsWith('.tmp'));

describe('loadSkillAudit (fail-safe)', () => {
  it('returns {} when the file is missing — and never creates it on read', () => {
    expect(loadSkillAudit(home)).toEqual({});
    expect(fs.existsSync(getSkillAuditPath(home))).toBe(false);
  });
  it('returns {} on corrupt JSON without throwing', () => {
    fs.writeFileSync(getSkillAuditPath(home), '{not json', 'utf-8');
    expect(() => loadSkillAudit(home)).not.toThrow();
    expect(loadSkillAudit(home)).toEqual({});
  });
  it('returns {} when the top-level JSON is an array', () => {
    fs.writeFileSync(getSkillAuditPath(home), '[]', 'utf-8');
    expect(loadSkillAudit(home)).toEqual({});
  });
});

describe('recordAuditBadge', () => {
  it('writes a verified badge atomically and round-trips (no leftover .tmp)', () => {
    const stored = recordAuditBadge(home, 'alpha', badge({ feedback: 'good' }));
    expect(stored).toMatchObject({ verified: true, score: 0.88, confidence: 0.88, attempts: 1 });
    expect(loadSkillAudit(home)['alpha']).toMatchObject({ verified: true, feedback: 'good' });
    expect(fs.existsSync(getSkillAuditPath(home))).toBe(true);
    const leftover = fs.readdirSync(home).filter(f => f.includes('.tmp'));
    expect(leftover).toEqual([]);
  });
  it('persists an unverified badge with feedback + score + demoted flag', () => {
    recordAuditBadge(home, 'bad', badge({ verified: false, score: 0.2, confidence: 0.2, attempts: 2, demoted: true, feedback: 'failed twice' }));
    expect(getAuditBadge(home, 'bad')).toMatchObject({ verified: false, score: 0.2, demoted: true, feedback: 'failed twice' });
  });
  it('stamps auditedAt from the injected clock', () => {
    const fixed = new Date('2026-06-28T00:00:00.000Z');
    recordAuditBadge(home, 'a', badge(), () => fixed);
    expect(getAuditBadge(home, 'a')?.auditedAt).toBe(fixed.toISOString());
  });
  it('overwrites the existing badge for the same skill', () => {
    recordAuditBadge(home, 'alpha', badge({ verified: false, score: 0.2 }));
    recordAuditBadge(home, 'alpha', badge({ verified: true, score: 0.9 }));
    const idx = loadSkillAudit(home);
    expect(Object.keys(idx)).toEqual(['alpha']);
    expect(idx['alpha']).toMatchObject({ verified: true, score: 0.9 });
  });
  it('creates the home dir if absent', () => {
    const nested = path.join(home, 'nested');
    recordAuditBadge(nested, 'x', badge());
    expect(fs.existsSync(getSkillAuditPath(nested))).toBe(true);
  });
});

describe('saveSkillAudit (Windows transient locks)', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'] as const)(
    'retries %s without leaving a temporary file',
    (code) => {
      recordAuditBadge(home, 'prior', badge({ feedback: 'replace me' }));
      const replacement = {
        current: { ...badge({ feedback: 'new index' }), auditedAt: '2026-08-03T00:00:00.000Z' },
      };
      const actualRename = fs.renameSync.bind(fs);
      let attempts = 0;
      const rename = vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
        attempts += 1;
        if (attempts <= 2) throw Object.assign(new Error('temporarily locked'), { code });
        return actualRename(oldPath, newPath);
      });
      const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

      saveSkillAudit(home, replacement);

      expect(rename).toHaveBeenCalledTimes(3);
      expect(wait).toHaveBeenNthCalledWith(1, expect.any(Int32Array), 0, 0, 25);
      expect(wait).toHaveBeenNthCalledWith(2, expect.any(Int32Array), 0, 0, 50);
      expect(loadSkillAudit(home)).toEqual(replacement);
      expect(tempFiles()).toEqual([]);
    },
  );

  it('preserves the prior index and cleans up after bounded retry exhaustion', () => {
    recordAuditBadge(home, 'stable', badge({ feedback: 'keep me' }));
    const prior = fs.readFileSync(getSkillAuditPath(home), 'utf-8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('still locked'), { code: 'EPERM' });
    });
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

    expect(() => saveSkillAudit(home, {})).toThrow('still locked');

    expect(rename).toHaveBeenCalledTimes(10);
    expect(wait).toHaveBeenCalledTimes(9);
    expect(fs.readFileSync(getSkillAuditPath(home), 'utf-8')).toBe(prior);
    expect(tempFiles()).toEqual([]);
  });

  it('does not retry a non-transient rename error and still cleans up', () => {
    recordAuditBadge(home, 'stable', badge({ feedback: 'keep me' }));
    const prior = fs.readFileSync(getSkillAuditPath(home), 'utf-8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('invalid destination'), { code: 'ENOENT' });
    });
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

    expect(() => saveSkillAudit(home, {})).toThrow('invalid destination');

    expect(rename).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(fs.readFileSync(getSkillAuditPath(home), 'utf-8')).toBe(prior);
    expect(tempFiles()).toEqual([]);
  });
});

describe('isSkillVerified / getAuditBadge / clearAuditBadge', () => {
  it('isSkillVerified is true only for verified badges', () => {
    recordAuditBadge(home, 'ok', badge({ verified: true }));
    recordAuditBadge(home, 'no', badge({ verified: false }));
    expect(isSkillVerified(home, 'ok')).toBe(true);
    expect(isSkillVerified(home, 'no')).toBe(false);
    expect(isSkillVerified(home, 'never')).toBe(false);
  });
  it('getAuditBadge is undefined for an unknown skill', () => {
    expect(getAuditBadge(home, 'ghost')).toBeUndefined();
  });
  it('clearAuditBadge removes one badge, leaves others, no-ops on missing', () => {
    recordAuditBadge(home, 'a', badge());
    recordAuditBadge(home, 'b', badge());
    clearAuditBadge(home, 'a');
    expect(getAuditBadge(home, 'a')).toBeUndefined();
    expect(getAuditBadge(home, 'b')).toBeDefined();
    expect(() => clearAuditBadge(home, 'missing')).not.toThrow();
    expect(getAuditBadge(home, 'b')).toBeDefined();
  });
});

describe('shouldSkipAudit (cost guard)', () => {
  const at = (iso: string): SkillAuditBadge => ({
    verified: true, score: 0.9, confidence: 0.9, attempts: 1, rewritten: false, demoted: false,
    lastAuditedHash: 'h1', auditedAt: iso,
  });
  const now = () => new Date('2026-06-28T00:00:00.000Z');

  it('skips a verified, unchanged, recently-audited skill', () => {
    expect(shouldSkipAudit(at('2026-06-27T00:00:00.000Z'), 'h1', { now })).toBe(true);
  });
  it('does NOT skip when the content hash changed (skill was edited)', () => {
    expect(shouldSkipAudit(at('2026-06-27T00:00:00.000Z'), 'h2-edited', { now })).toBe(false);
  });
  it('does NOT skip an unverified badge', () => {
    expect(shouldSkipAudit({ ...at('2026-06-27T00:00:00.000Z'), verified: false }, 'h1', { now })).toBe(false);
  });
  it('does NOT skip a stale audit (older than maxAgeDays)', () => {
    expect(shouldSkipAudit(at('2026-06-01T00:00:00.000Z'), 'h1', { now, maxAgeDays: 7 })).toBe(false);
  });
  it('does NOT skip when there is no badge yet', () => {
    expect(shouldSkipAudit(undefined, 'h1', { now })).toBe(false);
  });
});
