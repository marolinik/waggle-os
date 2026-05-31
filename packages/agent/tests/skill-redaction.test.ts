import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { redactSkillContent } from '../src/skill-redaction.js';

describe('redactSkillContent — strip secrets + paths before skill writes', () => {
  it('redacts an Anthropic API key', () => {
    const { content, redactions } = redactSkillContent('Use key sk-ant-api03-0123456789012345678901 to call.');
    expect(content).not.toContain('sk-ant-api03-0123456789012345678901');
    expect(content).toContain('[REDACTED:anthropic-key]');
    expect(redactions).toContain('anthropic-key');
  });

  it('redacts an env-style secret assignment', () => {
    const { content, redactions } = redactSkillContent('Set OPENAI_API_KEY=sk-proj-ABCDEFGHIJKLMNOPQRSTUV in env.');
    expect(content).not.toContain('sk-proj-ABCDEFGHIJKLMNOPQRSTUV');
    expect(redactions.length).toBeGreaterThan(0);
  });

  it('redacts the running user home directory to ~', () => {
    const home = os.homedir();
    const { content, redactions } = redactSkillContent(`Logs live at ${home}/.waggle/logs/run.log`);
    expect(content).not.toContain(home);
    expect(content).toContain('~');
    expect(redactions).toContain('home-path');
  });

  it('redacts generic Windows + POSIX user-home paths but keeps the tail', () => {
    const win = redactSkillContent('open C:\\Users\\Alice\\.waggle\\skills\\x.md');
    expect(win.content).not.toContain('Alice');
    expect(win.content).toContain('~\\.waggle\\skills\\x.md');
    expect(win.redactions).toContain('home-path');

    const posix = redactSkillContent('cat /Users/bob/projects/secret.txt then /home/carol/notes');
    expect(posix.content).not.toContain('/Users/bob');
    expect(posix.content).not.toContain('/home/carol');
    expect(posix.content).toContain('~/projects/secret.txt');
  });

  it('leaves clean content untouched with no redactions', () => {
    const clean = '# My Skill\n\nRun `npm test` then commit. Reads from /usr/local/bin (a system path).';
    const { content, redactions } = redactSkillContent(clean);
    expect(content).toBe(clean); // /usr/local/bin is NOT a user-home path
    expect(redactions).toEqual([]);
  });

  it('reports every distinct redaction kind', () => {
    const home = os.homedir();
    const { redactions } = redactSkillContent(`key sk-ant-api03-0123456789012345678901 at ${home}/x`);
    expect(redactions).toContain('anthropic-key');
    expect(redactions).toContain('home-path');
  });
});
