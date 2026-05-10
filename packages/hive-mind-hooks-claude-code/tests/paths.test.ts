import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import {
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
  resolvePaths,
} from '../src/paths.js';

describe('resolvePaths', () => {
  it('places settings.json + pointer under <home>/.claude/', () => {
    const home = resolve('/fake/home');
    const paths = resolvePaths({ home, hooksDir: resolve('/some/dist/hooks') });
    expect(paths.claudeDir).toBe(join(home, '.claude'));
    expect(paths.settingsPath).toBe(join(home, '.claude', 'settings.json'));
    expect(paths.pointerPath).toBe(join(home, '.claude', 'hive-mind-install.json'));
  });

  it('hooksDir override wins over moduleUrl', () => {
    const explicit = resolve('/x/y/hooks');
    const paths = resolvePaths({
      home: resolve('/h'),
      hooksDir: explicit,
      moduleUrl: 'file:///irrelevant/dist/install.js',
    });
    expect(paths.hooksDir).toBe(explicit);
  });

  it('falls back to cwd/dist/hooks when neither moduleUrl nor hooksDir is given', () => {
    const paths = resolvePaths({ home: resolve('/h') });
    expect(paths.hooksDir).toBe(resolve(process.cwd(), 'dist', 'hooks'));
  });
});

describe('hookCommandFor', () => {
  it('produces a quoted node invocation with absolute path', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks'), 'session-start');
    expect(cmd).toMatch(/^node "[^"]+session-start\.js"$/);
  });

  it('appends --cli-path when supplied', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks'), 'session-start', '/abs/cli/dist/index.js');
    expect(cmd).toMatch(/--cli-path "\/abs\/cli\/dist\/index\.js"$/);
  });

  it('omits --cli-path when empty string is passed', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks'), 'session-start', '');
    expect(cmd).not.toContain('--cli-path');
  });

  it('preserves Windows-style paths inside quotes', () => {
    const cmd = hookCommandFor('/abs/dist/hooks', 'stop', 'C:\\Program Files\\hive-mind\\dist\\index.js');
    expect(cmd).toContain('--cli-path "C:\\Program Files\\hive-mind\\dist\\index.js"');
  });
});

describe('backupPathFor', () => {
  it('replaces colons and dots in the timestamp for filesystem safety', () => {
    const backup = backupPathFor('/h/.claude/settings.json', '2026-04-28T10:30:45.123Z');
    expect(backup).toBe('/h/.claude/settings.json.hive-mind-backup.2026-04-28T10-30-45-123Z');
  });
});

describe('allHookBasenames', () => {
  it('returns the four canonical basenames', () => {
    expect([...allHookBasenames()].sort()).toEqual([
      'pre-compact',
      'session-start',
      'stop',
      'user-prompt-submit',
    ]);
  });
});
