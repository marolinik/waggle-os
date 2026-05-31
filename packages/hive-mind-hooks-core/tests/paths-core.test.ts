import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  backupPathFor,
  hookCommandFor,
  hooksDirFromModuleUrl,
  hookScriptPath,
  normalizeCliPath,
} from '../src/paths-core.js';

describe('backupPathFor', () => {
  it('replaces colons and dots in the ISO timestamp for Windows safety', () => {
    const backup = backupPathFor('/h/.codex/hooks.json', '2026-06-01T10:30:45.123Z');
    expect(backup).toBe('/h/.codex/hooks.json.hive-mind-backup.2026-06-01T10-30-45-123Z');
  });

  it('contains no `:` or `.` after the configPath suffix', () => {
    const backup = backupPathFor('/h/cfg.json', '2026-06-01T10:30:45.123Z');
    const stampPart = backup.slice('/h/cfg.json.hive-mind-backup.'.length);
    expect(stampPart).not.toContain(':');
    expect(stampPart).not.toContain('.');
  });

  it('keeps the config path verbatim as the prefix', () => {
    const backup = backupPathFor('C:\\Users\\Marko Markovic\\.codex\\hooks.json', '2026-06-01T00:00:00.000Z');
    expect(backup.startsWith('C:\\Users\\Marko Markovic\\.codex\\hooks.json.hive-mind-backup.')).toBe(true);
  });
});

describe('hookCommandFor', () => {
  it('produces a quoted node invocation with no --cli-path when omitted', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks/session-start.js'));
    expect(cmd).toMatch(/^node "[^"]+session-start\.js"$/);
    expect(cmd).not.toContain('--cli-path');
  });

  it('appends a quoted --cli-path when supplied', () => {
    const cmd = hookCommandFor('/abs/dist/hooks/stop.js', '/abs/cli/dist/index.js');
    expect(cmd).toBe('node "/abs/dist/hooks/stop.js" --cli-path "/abs/cli/dist/index.js"');
  });

  it('omits --cli-path when an empty string is passed', () => {
    const cmd = hookCommandFor('/abs/dist/hooks/stop.js', '');
    expect(cmd).not.toContain('--cli-path');
  });

  it('keeps spaces in the script path inside the quotes', () => {
    const scriptPath = 'C:\\Program Files\\hive-mind\\dist\\hooks\\stop.js';
    const cmd = hookCommandFor(scriptPath);
    expect(cmd).toBe('node "C:\\Program Files\\hive-mind\\dist\\hooks\\stop.js"');
  });

  it('keeps spaces in the cli-path inside the quotes', () => {
    const cmd = hookCommandFor('/abs/dist/hooks/stop.js', 'C:\\Program Files\\hive-mind\\dist\\index.js');
    expect(cmd).toContain('--cli-path "C:\\Program Files\\hive-mind\\dist\\index.js"');
  });
});

describe('normalizeCliPath', () => {
  it('returns undefined for undefined / empty / whitespace-only input', () => {
    expect(normalizeCliPath(undefined)).toBeUndefined();
    expect(normalizeCliPath('')).toBeUndefined();
    expect(normalizeCliPath('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCliPath('  /abs/cli/dist/index.js  ')).toBe('/abs/cli/dist/index.js');
  });

  it('throws when the value contains an embedded double-quote', () => {
    expect(() => normalizeCliPath('/abs/cli/has"quote/index.js')).toThrow(/double-quote/);
  });

  it('passes through a clean path with spaces (no double-quote)', () => {
    expect(normalizeCliPath('C:\\Program Files\\hive-mind\\index.js')).toBe(
      'C:\\Program Files\\hive-mind\\index.js',
    );
  });
});

describe('hooksDirFromModuleUrl', () => {
  it('resolves <pkg>/dist/hooks from a dist/<file>.js module url', () => {
    const moduleUrl = pathToFileURL(resolve('/pkg/dist/install.js')).href;
    const hooksDir = hooksDirFromModuleUrl(moduleUrl);
    expect(hooksDir).toBe(resolve('/pkg/dist/hooks'));
  });

  it('returns an absolute, platform-normalized path whose parent is the module dir', () => {
    const moduleUrl = pathToFileURL(resolve('/some/where/dist/index.js')).href;
    const hooksDir = hooksDirFromModuleUrl(moduleUrl);
    expect(dirname(hooksDir)).toBe(resolve('/some/where/dist'));
  });
});

describe('hookScriptPath', () => {
  it('joins <hooksDir>/<basename>.js', () => {
    const hooksDir = resolve('/pkg/dist/hooks');
    expect(hookScriptPath(hooksDir, 'session-start')).toBe(join(hooksDir, 'session-start.js'));
    expect(hookScriptPath(hooksDir, 'stop')).toBe(join(hooksDir, 'stop.js'));
  });
});
