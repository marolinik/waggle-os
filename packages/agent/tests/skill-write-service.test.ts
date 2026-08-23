import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeSkill, deleteSkill, undoSkillWrite, type SkillWriteDeps } from '../src/skill-write-service.js';
import { parseSkillFrontmatter } from '../src/skill-frontmatter.js';
import { loadSkills } from '../src/prompt-loader.js';
import { loadActiveSkills } from '../src/skill-hygiene.js';

describe('skill-write-service (P5/D4 iii)', () => {
  let dir: string;
  let skillsDir: string;
  const audit: Array<Record<string, unknown>> = [];
  const auditStore = { record: (e: Record<string, unknown>) => { audit.push(e); return e; } };
  let deps: SkillWriteDeps;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skillwrite-'));
    skillsDir = path.join(dir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    audit.length = 0;
    onChange = vi.fn();
    deps = { skillsDir, auditStore: auditStore as never, onChange };
  });
  afterEach(() => fs.rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  }));

  it('creates a skill, stamps provenance, audits installed, fires onChange', () => {
    const res = writeSkill(deps, { name: 'my-skill', content: '# Hello\nbody', initiator: 'agent', source: 'chat' });
    expect(res.ok).toBe(true);
    expect(res.existed).toBe(false);
    const fm = parseSkillFrontmatter(fs.readFileSync(res.path!, 'utf-8')).frontmatter;
    expect(fm.initiator).toBe('agent');
    expect(fm.source).toBe('chat');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'installed', initiator: 'agent', capabilityType: 'skill' });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('preserves the body when prepending a frontmatter block', () => {
    const res = writeSkill(deps, { name: 's', content: '# Title\n\nLine 1\nLine 2', initiator: 'user', source: 'api' });
    const { body } = parseSkillFrontmatter(fs.readFileSync(res.path!, 'utf-8'));
    expect(body).toContain('Line 1');
    expect(body).toContain('Line 2');
  });

  it('preserves unknown frontmatter keys (lossless stamp)', () => {
    const content = `---\nname: Keeper\npermissions:\n  network: true\n---\n\n# Body`;
    const res = writeSkill(deps, { name: 'keeper', content, initiator: 'agent', source: 'chat' });
    const raw = fs.readFileSync(res.path!, 'utf-8');
    expect(raw).toContain('permissions:');
    expect(raw).toContain('network: true');
    const fm = parseSkillFrontmatter(raw).frontmatter;
    expect(fm.initiator).toBe('agent');
    expect(fm.permissions?.network).toBe(true);
  });

  it('provenance is sticky — an update preserves the original author', () => {
    writeSkill(deps, { name: 'x', content: 'one', initiator: 'agent', source: 'chat' });
    const res = writeSkill(deps, { name: 'x', content: 'two — edited by user', initiator: 'user', source: 'api' });
    expect(res.existed).toBe(true);
    const fm = parseSkillFrontmatter(fs.readFileSync(res.path!, 'utf-8')).frontmatter;
    expect(fm.initiator).toBe('agent'); // not relaundered to 'user'
  });

  it('audit row reflects the ACTUAL actor, not the sticky file author (review #2/#4)', () => {
    // A user-authored skill exists; the AGENT then updates it.
    writeSkill(deps, { name: 'y', content: 'v1', initiator: 'user', source: 'api' });
    audit.length = 0;
    writeSkill(deps, { name: 'y', content: 'v2 by agent', initiator: 'agent', source: 'chat' });
    // File provenance stays sticky to the original user author...
    const fm = parseSkillFrontmatter(fs.readFileSync(path.join(skillsDir, 'y.md'), 'utf-8')).frontmatter;
    expect(fm.initiator).toBe('user');
    // ...but the audit row records the AGENT as the actor (D4(i) governance trail).
    expect(audit).toHaveLength(1);
    expect(audit[0].initiator).toBe('agent');
    expect(audit[0].source).toBe('chat');
  });

  it('cannot spoof provenance via the content body', () => {
    const res = writeSkill(deps, {
      name: 'spoof',
      content: '---\ninitiator: user\nsource: trusted\n---\nbody',
      initiator: 'agent',
      source: 'chat',
    });
    const fm = parseSkillFrontmatter(fs.readFileSync(res.path!, 'utf-8')).frontmatter;
    expect(fm.initiator).toBe('agent');
    expect(fm.source).toBe('chat');
  });

  it('redacts secrets before persisting and reports the count', () => {
    const res = writeSkill(deps, {
      name: 'leaky',
      content: 'use sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLL to call',
      initiator: 'agent',
      source: 'chat',
    });
    expect(res.redactions && res.redactions.length).toBeGreaterThan(0);
    expect(fs.readFileSync(res.path!, 'utf-8')).not.toContain('sk-ant-api03-AAAABBBB');
  });

  it('rejects path-traversal names without writing or auditing', () => {
    const res = writeSkill(deps, { name: '../evil', content: 'x', initiator: 'user', source: 'api' });
    expect(res.ok).toBe(false);
    expect(audit).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('deletes a skill, audits uninstalled, fires onChange', () => {
    writeSkill(deps, { name: 'gone', content: 'x', initiator: 'agent', source: 'chat' });
    audit.length = 0;
    onChange.mockClear();
    const res = deleteSkill(deps, { name: 'gone', initiator: 'agent', source: 'chat' });
    expect(res.ok).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'gone.md'))).toBe(false);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'uninstalled', initiator: 'agent' });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('delete of a missing skill returns ok=false, no audit', () => {
    const res = deleteSkill(deps, { name: 'ghost', initiator: 'user', source: 'api' });
    expect(res.ok).toBe(false);
    expect(audit).toHaveLength(0);
  });

  it('degrades gracefully with no auditStore/onChange', () => {
    const res = writeSkill({ skillsDir }, { name: 'bare', content: 'x', initiator: 'user', source: 'api' });
    expect(res.ok).toBe(true);
  });

  describe('backup + undo (P-C)', () => {
    const backupsDir = () => path.join(skillsDir, '.backups');
    const backupsFor = (name: string) =>
      (fs.existsSync(backupsDir()) ? fs.readdirSync(backupsDir()) : []).filter((f) => {
        const base = f.slice(0, -3);
        return f.endsWith('.md') && base.slice(0, base.lastIndexOf('-')) === name;
      });

    it('no backup on the first-ever write', () => {
      writeSkill(deps, { name: 'fresh', content: 'v1', initiator: 'agent', source: 'chat' });
      expect(backupsFor('fresh')).toHaveLength(0);
    });

    it('overwrite snapshots the exact outgoing bytes', () => {
      writeSkill(deps, { name: 'ov', content: 'v1', initiator: 'agent', source: 'chat' });
      const before = fs.readFileSync(path.join(skillsDir, 'ov.md'));
      writeSkill(deps, { name: 'ov', content: 'v2 different', initiator: 'agent', source: 'chat' });
      const backups = backupsFor('ov');
      expect(backups).toHaveLength(1);
      const snapshot = fs.readFileSync(path.join(backupsDir(), backups[0]));
      expect(snapshot.equals(before)).toBe(true);
    });

    it('caps retained backups at the 5 newest, pruning older', () => {
      writeSkill(deps, { name: 'cap', content: 'v1', initiator: 'agent', source: 'chat' });
      for (let i = 2; i <= 8; i++) {
        writeSkill(deps, { name: 'cap', content: `v${i}`, initiator: 'agent', source: 'chat' });
      }
      // 7 overwrites → 7 snapshots, pruned to the newest 5.
      expect(backupsFor('cap')).toHaveLength(5);
    });

    it('parses backup ownership for skill names containing hyphens', () => {
      writeSkill(deps, { name: 'my-hyphen-skill', content: 'v1', initiator: 'agent', source: 'chat' });
      writeSkill(deps, { name: 'my-hyphen-skill', content: 'v2', initiator: 'agent', source: 'chat' });
      expect(backupsFor('my-hyphen-skill')).toHaveLength(1);
    });

    it('delete snapshots the skill before unlinking', () => {
      writeSkill(deps, { name: 'del', content: 'v1', initiator: 'agent', source: 'chat' });
      const before = fs.readFileSync(path.join(skillsDir, 'del.md'));
      deleteSkill(deps, { name: 'del', initiator: 'agent', source: 'chat' });
      const backups = backupsFor('del');
      expect(backups).toHaveLength(1);
      expect(fs.readFileSync(path.join(backupsDir(), backups[0])).equals(before)).toBe(true);
    });

    it('undo restores the exact prior bytes, audits, and reloads', () => {
      writeSkill(deps, { name: 'u', content: 'v1 original', initiator: 'agent', source: 'chat' });
      const original = fs.readFileSync(path.join(skillsDir, 'u.md'));
      writeSkill(deps, { name: 'u', content: 'v2 replacement', initiator: 'agent', source: 'chat' });
      audit.length = 0;
      onChange.mockClear();

      const res = undoSkillWrite(deps, { name: 'u' });
      expect(res.ok).toBe(true);
      expect(res.restoredFrom).toBeTruthy();
      expect(fs.readFileSync(path.join(skillsDir, 'u.md')).equals(original)).toBe(true);
      expect(audit.at(-1)).toMatchObject({ action: 'installed', source: 'restored-from-backup' });
      expect(onChange).toHaveBeenCalled();
    });

    it('undo with no backups returns a clear error, writes nothing', () => {
      writeSkill(deps, { name: 'nobackup', content: 'v1', initiator: 'agent', source: 'chat' });
      audit.length = 0;
      onChange.mockClear();
      const res = undoSkillWrite(deps, { name: 'nobackup' });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/no backup/i);
      expect(audit).toHaveLength(0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('skill loaders ignore the .backups subdir', () => {
      writeSkill(deps, { name: 'live', content: 'v1', initiator: 'agent', source: 'chat' });
      writeSkill(deps, { name: 'live', content: 'v2', initiator: 'agent', source: 'chat' });
      expect(backupsFor('live')).toHaveLength(1); // a backup exists on disk

      const loaded = loadSkills(dir).map((s) => s.name);
      const active = loadActiveSkills(dir).map((s) => s.name);
      expect(loaded).toEqual(['live']);
      expect(active).toEqual(['live']);
      expect(loaded).not.toContain('.backups');
    });
  });
});
