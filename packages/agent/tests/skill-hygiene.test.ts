import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseHygieneVerdict,
  judgeSkillHygiene,
  runSkillHygieneScan,
  loadActiveSkills,
  type SkillForHygiene,
} from '../src/skill-hygiene.js';
import {
  loadSkillHygiene,
  demoteSkillToDraft,
  isSkillDraft,
  type SkillHygieneVerdict,
} from '../src/skill-hygiene-store.js';
import type { JudgeLLMCall } from '../src/judge.js';

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-hygiene-'));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

/** A judge that returns a canned verdict per target skill name (parsed from the prompt). */
function fakeJudge(byName: Record<string, { verdict: SkillHygieneVerdict; reason: string } | string>): JudgeLLMCall {
  return async (prompt: string) => {
    const m = prompt.match(/TARGET SKILL:\s*(.+)/);
    const name = m ? m[1].trim() : '';
    const canned = byName[name];
    if (canned === undefined) return JSON.stringify({ verdict: 'necessary', reason: 'default' });
    if (typeof canned === 'string') return canned; // raw (for unparseable cases)
    return JSON.stringify(canned);
  };
}

const skill = (name: string, content = 'do a specific thing'): SkillForHygiene => ({ name, content });

describe('parseHygieneVerdict', () => {
  it('parses a clean JSON verdict', () => {
    expect(parseHygieneVerdict('{"verdict":"redundant","reason":"dup of X"}')).toEqual({
      verdict: 'redundant', reason: 'dup of X',
    });
  });
  it('parses a fenced JSON verdict', () => {
    expect(parseHygieneVerdict('```json\n{"verdict":"generic","reason":"too vague"}\n```')?.verdict).toBe('generic');
  });
  it('rejects an invalid verdict value', () => {
    expect(parseHygieneVerdict('{"verdict":"delete","reason":"x"}')).toBeNull();
  });
  it('returns null on non-JSON', () => {
    expect(parseHygieneVerdict('I think this is fine, keep it.')).toBeNull();
    expect(parseHygieneVerdict('')).toBeNull();
  });
});

describe('judgeSkillHygiene (fail-safe)', () => {
  it('keeps active (necessary, parsed=false) when the LLM throws', async () => {
    const throwing: JudgeLLMCall = async () => { throw new Error('boom'); };
    const j = await judgeSkillHygiene(throwing, skill('a'), []);
    expect(j.verdict).toBe('necessary');
    expect(j.parsed).toBe(false);
  });
  it('keeps active (necessary, parsed=false) when the response is unparseable', async () => {
    const garbage: JudgeLLMCall = async () => 'no json here';
    const j = await judgeSkillHygiene(garbage, skill('a'), []);
    expect(j.verdict).toBe('necessary');
    expect(j.parsed).toBe(false);
  });
  it('returns a parsed verdict when the LLM answers cleanly', async () => {
    const j = await judgeSkillHygiene(fakeJudge({ a: { verdict: 'redundant', reason: 'dup' } }), skill('a'), []);
    expect(j).toMatchObject({ verdict: 'redundant', reason: 'dup', parsed: true });
  });
});

describe('runSkillHygieneScan', () => {
  it('demotes a redundant skill to draft via the sidecar — and never deletes/edits', async () => {
    const skills = [skill('keep-me'), skill('dupe')];
    const judge = fakeJudge({
      'keep-me': { verdict: 'necessary', reason: 'unique' },
      'dupe': { verdict: 'redundant', reason: 'overlaps keep-me' },
    });
    const report = await runSkillHygieneScan(home, skills, judge);

    expect(report.scanned).toBe(2);
    expect(report.demoted).toEqual(['dupe']);
    expect(report.kept).toEqual(['keep-me']);

    // sidecar written; status draft + reason
    const idx = loadSkillHygiene(home);
    expect(idx['dupe']).toMatchObject({ status: 'draft', verdict: 'redundant', reason: 'overlaps keep-me' });
    expect(idx['dupe'].judgedAt).toBeTypeOf('string');
    expect(idx['keep-me']).toBeUndefined(); // necessary skills are not written

    // never deletes/edits anything on disk — only the sidecar file exists
    expect(fs.existsSync(path.join(home, 'skill-hygiene.json'))).toBe(true);
  });

  it('dryRun reports demotions but writes nothing', async () => {
    const report = await runSkillHygieneScan(
      home,
      [skill('dupe')],
      fakeJudge({ dupe: { verdict: 'generic', reason: 'vague' } }),
      { dryRun: true },
    );
    expect(report.dryRun).toBe(true);
    expect(report.demoted).toEqual(['dupe']);
    expect(isSkillDraft(home, 'dupe')).toBe(false); // not persisted
    expect(fs.existsSync(path.join(home, 'skill-hygiene.json'))).toBe(false);
  });

  it('skips skills already demoted to draft (no re-judge)', async () => {
    demoteSkillToDraft(home, 'already', 'redundant', 'prior');
    let judged = 0;
    const counting: JudgeLLMCall = async (p) => { judged++; return await fakeJudge({})(p); };
    const report = await runSkillHygieneScan(home, [skill('already'), skill('fresh')], counting);
    expect(report.scanned).toBe(1);      // only 'fresh' is judged
    expect(judged).toBe(1);
    expect(report.judged.map(j => j.name)).toEqual(['fresh']);
  });

  it('uses an injectable clock for judgedAt', async () => {
    const fixed = new Date('2026-06-28T00:00:00.000Z');
    await runSkillHygieneScan(home, [skill('dupe')], fakeJudge({ dupe: { verdict: 'redundant', reason: 'x' } }), {
      now: () => fixed,
    });
    expect(loadSkillHygiene(home)['dupe'].judgedAt).toBe(fixed.toISOString());
  });
});

describe('loadActiveSkills', () => {
  it('excludes draft skills from the active set but keeps them on disk', () => {
    const skillsDir = path.join(home, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'alpha.md'), '# Alpha\nbody', 'utf-8');
    fs.writeFileSync(path.join(skillsDir, 'beta.md'), '# Beta\nbody', 'utf-8');

    demoteSkillToDraft(home, 'beta', 'generic', 'too vague');

    const active = loadActiveSkills(home).map(s => s.name).sort();
    expect(active).toEqual(['alpha']);
    // beta.md is untouched on disk — demotion is reversible
    expect(fs.existsSync(path.join(skillsDir, 'beta.md'))).toBe(true);
  });
});
