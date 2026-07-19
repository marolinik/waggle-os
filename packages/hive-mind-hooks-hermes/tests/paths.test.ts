import { describe, expect, it } from 'vitest';
import { join, posix, resolve, win32 } from 'node:path';
import {
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
  resolveHermesHome,
  resolvePaths,
} from '../src/paths.js';

describe('resolveHermesHome', () => {
  it('prefers HERMES_HOME over the Windows default', () => {
    expect(resolveHermesHome({
      platform: 'win32',
      home: 'C:\\Users\\tester',
      env: {
        HERMES_HOME: 'D:\\Hermes Data',
        LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
      },
    })).toBe(win32.normalize('D:\\Hermes Data'));
  });

  it('uses LOCALAPPDATA on Windows when HERMES_HOME is absent', () => {
    expect(resolveHermesHome({
      platform: 'win32',
      home: 'C:\\Users\\tester',
      env: { LOCALAPPDATA: 'C:\\Redirected\\Local' },
    })).toBe(win32.join('C:\\Redirected\\Local', 'hermes'));
  });

  it('falls back to the conventional Windows local-app-data directory', () => {
    expect(resolveHermesHome({
      platform: 'win32',
      home: 'C:\\Users\\tester',
      env: {},
    })).toBe(win32.join('C:\\Users\\tester', 'AppData', 'Local', 'hermes'));
  });

  it('uses ~/.hermes on non-Windows platforms', () => {
    expect(resolveHermesHome({
      platform: 'linux',
      home: '/home/tester',
      env: {},
    })).toBe(posix.join('/home/tester', '.hermes'));
  });

  it('ignores blank environment overrides', () => {
    expect(resolveHermesHome({
      platform: 'win32',
      home: 'C:\\Users\\tester',
      env: { HERMES_HOME: '  ', LOCALAPPDATA: '  ' },
    })).toBe(win32.join('C:\\Users\\tester', 'AppData', 'Local', 'hermes'));
  });
});

describe('resolvePaths (hermes)', () => {
  it('places config.yaml + pointer under <home>/.hermes/', () => {
    const home = resolve('/fake/home');
    const paths = resolvePaths({ home, hooksDir: resolve('/some/dist/hooks') });
    expect(paths.hermesDir).toBe(join(home, '.hermes'));
    // Hermes targets the SHELL-HOOKS config.yaml (top-level `hooks:` block) —
    // NOT the gateway dir-hooks (~/.hermes/hooks/<name>/) nor plugin hooks.
    expect(paths.configPath).toBe(join(home, '.hermes', 'config.yaml'));
    expect(paths.pointerPath).toBe(join(home, '.hermes', 'hive-mind-install.json'));
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

  it('uses the runtime Hermes home when no explicit test home is supplied', () => {
    const paths = resolvePaths({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Redirected\\Local' },
      hooksDir: resolve('/some/dist/hooks'),
    });
    expect(paths.hermesDir).toBe(win32.join('C:\\Redirected\\Local', 'hermes'));
    expect(paths.configPath).toBe(win32.join(paths.hermesDir, 'config.yaml'));
    expect(paths.pointerPath).toBe(win32.join(paths.hermesDir, 'hive-mind-install.json'));
  });
});

describe('hookCommandFor (hermes, 2-arg shared helper)', () => {
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

describe('backupPathFor (hermes)', () => {
  it('replaces colons and dots in the timestamp for filesystem safety', () => {
    const backup = backupPathFor('/h/.hermes/config.yaml', '2026-04-28T10:30:45.123Z');
    expect(backup).toBe('/h/.hermes/config.yaml.hive-mind-backup.2026-04-28T10-30-45-123Z');
  });
});

describe('allHookBasenames (hermes — THREE hooks only, NO pre-compact)', () => {
  it('returns exactly the three canonical basenames (Hermes ships no compaction hook)', () => {
    expect([...allHookBasenames()].sort()).toEqual([
      'session-start',
      'stop',
      'user-prompt-submit',
    ]);
    // Explicit: pre-compact is intentionally absent.
    expect([...allHookBasenames()]).not.toContain('pre-compact');
  });
});
