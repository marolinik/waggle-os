import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
  resolvePaths,
  HIVE_HOOK_DIR_NAME,
  HIVE_HOOK_ENTRY_KEY,
} from '../src/paths.js';

describe('resolvePaths (openclaw)', () => {
  it('places openclaw.json + pointer under <home>/.openclaw/', () => {
    const home = resolve('/fake/home');
    const paths = resolvePaths({ home, handlerSourcePath: resolve('/some/dist/handler.js') });
    expect(paths.openclawDir).toBe(join(home, '.openclaw'));
    expect(paths.configPath).toBe(join(home, '.openclaw', 'openclaw.json'));
    expect(paths.pointerPath).toBe(join(home, '.openclaw', 'hive-mind-install.json'));
  });

  it('resolves the managed hook DIRECTORY (not per-event scripts) under ~/.openclaw/hooks/', () => {
    const home = resolve('/h');
    const paths = resolvePaths({ home, handlerSourcePath: resolve('/d/handler.js') });
    // OpenClaw is in-process: one managed dir holding HOOK.md + handler.js,
    // NOT four separate compiled hook scripts.
    expect(paths.hooksRoot).toBe(join(home, '.openclaw', 'hooks'));
    expect(paths.hiveHookDir).toBe(join(home, '.openclaw', 'hooks', HIVE_HOOK_DIR_NAME));
    expect(paths.hookMdPath).toBe(join(paths.hiveHookDir, 'HOOK.md'));
    expect(paths.installedHandlerPath).toBe(join(paths.hiveHookDir, 'handler.js'));
  });

  it('handlerSourcePath override wins over moduleUrl', () => {
    const explicit = resolve('/x/y/handler.js');
    const paths = resolvePaths({
      home: resolve('/h'),
      handlerSourcePath: explicit,
      moduleUrl: 'file:///irrelevant/dist/install.js',
    });
    expect(paths.handlerSourcePath).toBe(explicit);
  });

  it('derives the self-contained handler bundle sibling from moduleUrl', () => {
    const moduleUrl = pathToFileURL(resolve('/pkg/dist/install.js')).href;
    const paths = resolvePaths({ home: resolve('/h'), moduleUrl });
    expect(paths.handlerSourcePath).toBe(resolve('/pkg/dist/handler.bundle.cjs'));
  });

  it('falls back to cwd/dist/handler.bundle.cjs when neither override is given', () => {
    const paths = resolvePaths({ home: resolve('/h') });
    expect(paths.handlerSourcePath).toBe(resolve(process.cwd(), 'dist', 'handler.bundle.cjs'));
  });
});

describe('allHookBasenames (openclaw — FOUR lifecycles incl. pre-compact)', () => {
  it('names the four lifecycles the single handler dispatches (bookkeeping, not separate files)', () => {
    expect([...allHookBasenames()].sort()).toEqual([
      'pre-compact',
      'session-start',
      'stop',
      'user-prompt-submit',
    ]);
    // Unlike hermes, openclaw DOES carry a compaction lifecycle
    // (session:compact:before → runtime action compact:before).
    expect([...allHookBasenames()]).toContain('pre-compact');
  });
});

describe('exported entry/dir name constants', () => {
  it('the managed dir name and the logical entry key are both "hive-mind"', () => {
    expect(HIVE_HOOK_DIR_NAME).toBe('hive-mind');
    expect(HIVE_HOOK_ENTRY_KEY).toBe('hive-mind');
  });
});

describe('re-exported shared Windows-safe helpers', () => {
  it('backupPathFor replaces colons and dots in the timestamp for filesystem safety', () => {
    const backup = backupPathFor('/h/.openclaw/openclaw.json', '2026-04-28T10:30:45.123Z');
    expect(backup).toBe('/h/.openclaw/openclaw.json.hive-mind-backup.2026-04-28T10-30-45-123Z');
  });

  it('hookCommandFor produces a quoted node invocation and appends --cli-path', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/handler.js'), '/abs/cli/dist/index.js');
    expect(cmd).toMatch(/^node "[^"]+handler\.js"/);
    expect(cmd).toMatch(/--cli-path "\/abs\/cli\/dist\/index\.js"$/);
  });
});
