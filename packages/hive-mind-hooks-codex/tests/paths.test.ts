import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import {
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
  resolvePaths,
} from '../src/paths.js';

describe('resolvePaths (codex)', () => {
  it('places hooks.json + pointer under <home>/.codex/', () => {
    const home = resolve('/fake/home');
    const paths = resolvePaths({ home, hooksDir: resolve('/some/dist/hooks') });
    expect(paths.codexDir).toBe(join(home, '.codex'));
    // Codex targets a STANDALONE hooks.json — NOT config.toml.
    expect(paths.configPath).toBe(join(home, '.codex', 'hooks.json'));
    expect(paths.pointerPath).toBe(join(home, '.codex', 'hive-mind-install.json'));
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

describe('hookCommandFor (codex, 2-arg shared helper)', () => {
  it('produces a quoted node invocation around the absolute script path', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks/session-start.js'));
    expect(cmd).toMatch(/^node "[^"]+session-start\.js"$/);
  });

  it('appends --cli-path when supplied', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks/session-start.js'), '/abs/cli/dist/index.js');
    expect(cmd).toMatch(/--cli-path "\/abs\/cli\/dist\/index\.js"$/);
  });

  it('omits --cli-path when empty string is passed', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks/session-start.js'), '');
    expect(cmd).not.toContain('--cli-path');
  });

  it('preserves Windows-style paths (with spaces) inside the quotes', () => {
    const cmd = hookCommandFor('/abs/dist/hooks/stop.js', 'C:\\Program Files\\hive-mind\\dist\\index.js');
    expect(cmd).toContain('--cli-path "C:\\Program Files\\hive-mind\\dist\\index.js"');
  });
});

describe('backupPathFor (codex)', () => {
  it('replaces colons and dots in the timestamp for filesystem safety', () => {
    const backup = backupPathFor('/h/.codex/hooks.json', '2026-04-28T10:30:45.123Z');
    expect(backup).toBe('/h/.codex/hooks.json.hive-mind-backup.2026-04-28T10-30-45-123Z');
  });
});

describe('allHookBasenames (codex)', () => {
  it('returns the four canonical basenames (CC clone)', () => {
    expect([...allHookBasenames()].sort()).toEqual([
      'pre-compact',
      'session-start',
      'stop',
      'user-prompt-submit',
    ]);
  });
});
