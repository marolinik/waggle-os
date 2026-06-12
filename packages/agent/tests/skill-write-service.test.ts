import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeSkill, deleteSkill, type SkillWriteDeps } from '../src/skill-write-service.js';
import { parseSkillFrontmatter } from '../src/skill-frontmatter.js';

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
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

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
});
