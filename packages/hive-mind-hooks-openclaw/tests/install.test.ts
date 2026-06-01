import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSON5 from 'json5';
import { install } from '../src/install.js';
import { HIVE_ENTRY_KEY, HOOKS_KEY } from '../src/json5-merger.js';

interface TestEnv {
  home: string;
  /** A fake compiled handler.js the installer COPIES into the managed hook dir. */
  handlerSource: string;
  configPath: string;
  pointerPath: string;
  hiveHookDir: string;
}

/** openclaw.json is OPTIONAL — `initial=undefined` exercises create-if-missing. */
async function bootstrap(initial: string | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmocl-install-'));
  const openclawDir = join(home, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  const configPath = join(openclawDir, 'openclaw.json');
  if (initial !== undefined) {
    await writeFile(configPath, initial, 'utf-8');
  }
  // Fake compiled handler — install copies this verbatim into the hook dir.
  const distDir = join(home, 'fake-dist');
  await mkdir(distDir, { recursive: true });
  const handlerSource = join(distDir, 'handler.js');
  await writeFile(handlerSource, 'export default async () => {};\n', 'utf-8');
  return {
    home,
    handlerSource,
    configPath,
    pointerPath: join(openclawDir, 'hive-mind-install.json'),
    hiveHookDir: join(openclawDir, 'hooks', 'hive-mind'),
  };
}

function readPointer(p: string): Promise<Record<string, unknown>> {
  return readFile(p, 'utf-8').then((s) => JSON.parse(s) as Record<string, unknown>);
}

function internalEntries(config: Record<string, unknown>): Record<string, unknown> {
  const hooks = config[HOOKS_KEY] as Record<string, Record<string, unknown>> | undefined;
  const internal = hooks?.['internal'] as Record<string, unknown> | undefined;
  return (internal?.['entries'] as Record<string, unknown> | undefined) ?? {};
}

describe('install (openclaw)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws when the compiled handler.js source is missing (build first)', async () => {
    env = await bootstrap(undefined);
    await rm(env.handlerSource, { force: true });
    await expect(install({ home: env.home, handlerSourcePath: env.handlerSource }))
      .rejects.toThrow(/compiled handler not found/i);
  });

  it('throws on a config.json that parses as neither JSON nor JSON5', async () => {
    env = await bootstrap('{ : : : not valid : : : }');
    await expect(install({ home: env.home, handlerSourcePath: env.handlerSource }))
      .rejects.toThrow(/parse/i);
  });

  // ── pre-existed branch ────────────────────────────────────────────────

  it('writes a LITERAL byte-identical backup before mutating a pre-existing openclaw.json', async () => {
    // Comments + trailing commas that a JSON5 round-trip would NOT preserve —
    // proves the backup is the original bytes, not a re-serialized merge.
    const initial = [
      '{',
      '  // my openclaw config',
      '  model: "opus", // keep me',
      '  hooks: { internal: { enabled: false, entries: {} } },',
      '}',
      '',
    ].join('\n');
    env = await bootstrap(initial);
    const original = await readFile(env.configPath, 'utf-8');
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(result.backupPath).not.toBeNull();
    const backupContent = await readFile(result.backupPath as string, 'utf-8');
    expect(backupContent).toBe(original);
    // The backup preserves the comment that JSON re-serialization drops.
    expect(backupContent).toContain('// my openclaw config');
  });

  it('records created_by_us=false + settings_backup when openclaw.json pre-existed', async () => {
    env = await bootstrap('{ "model": "opus", "hooks": {} }');
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(result.createdByUs).toBe(false);
    const pointer = await readPointer(result.pointerPath);
    expect(pointer['created_by_us']).toBe(false);
    expect(pointer['settings_backup']).toBe(result.backupPath);
  });

  it('minimal-touch: flips internal.enabled + adds hive entry, preserving user keys + entries', async () => {
    const initial = [
      '{',
      '  model: "opus",',
      '  hooks: { internal: { enabled: false, entries: { "user-own": { enabled: true } } } },',
      '}',
    ].join('\n');
    env = await bootstrap(initial);
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const after = JSON5.parse(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    const ents = internalEntries(after);
    // Our entry added, the user entry preserved verbatim.
    expect((ents[HIVE_ENTRY_KEY] as Record<string, unknown>)['enabled']).toBe(true);
    expect(ents['user-own']).toEqual({ enabled: true });
    // Subsystem turned on, user top-level key preserved.
    const hooks = after[HOOKS_KEY] as Record<string, Record<string, unknown>>;
    expect(hooks['internal']['enabled']).toBe(true);
    expect(after['model']).toBe('opus');
  });

  // ── create-if-missing branch ──────────────────────────────────────────

  it('creates openclaw.json with the hive entry when it is absent', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(existsSync(env.configPath)).toBe(true);
    const after = JSON5.parse(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    expect((internalEntries(after)[HIVE_ENTRY_KEY] as Record<string, unknown>)['enabled']).toBe(true);
    expect(result.createdByUs).toBe(true);
  });

  it('records created_by_us=true and writes NO backup when openclaw.json is absent', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(result.backupPath).toBeNull();
    const pointer = await readPointer(result.pointerPath);
    expect(pointer['created_by_us']).toBe(true);
    expect(pointer['settings_backup']).toBeNull();
  });

  // ── managed hook DIR (in-process model — no per-event scripts) ─────────

  it('writes the managed hook DIR with HOOK.md + a byte-identical copy of handler.js', async () => {
    env = await bootstrap(undefined);
    const handlerBytes = await readFile(env.handlerSource, 'utf-8');
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(result.hookDir).toBe(env.hiveHookDir);
    expect(existsSync(join(env.hiveHookDir, 'HOOK.md'))).toBe(true);
    expect(existsSync(join(env.hiveHookDir, 'handler.js'))).toBe(true);
    // handler.js is copied verbatim from dist.
    expect(await readFile(join(env.hiveHookDir, 'handler.js'), 'utf-8')).toBe(handlerBytes);
    // HOOK.md declares the four events incl. the prefixed compaction key.
    const hookMd = await readFile(join(env.hiveHookDir, 'HOOK.md'), 'utf-8');
    expect(hookMd).toContain('agent:bootstrap');
    expect(hookMd).toContain('message:received');
    expect(hookMd).toContain('message:sent');
    expect(hookMd).toContain('session:compact:before');
  });

  // ── pointer + lifecycles + cli-path ───────────────────────────────────

  it('drops a pointer recording the four lifecycles + touched keys + hook dir name', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(existsSync(result.pointerPath)).toBe(true);
    const pointer = await readPointer(result.pointerPath);
    expect(pointer['installed_hooks']).toEqual(['session-start', 'user-prompt-submit', 'stop', 'pre-compact']);
    expect(pointer['hooks_dir']).toBe(env.hiveHookDir);
    expect(typeof pointer['version']).toBe('string');
    const extra = pointer['extra'] as Record<string, unknown>;
    expect(extra['hook_dir_name']).toBe('hive-mind');
    expect((extra['touched_keys'] as string[]).sort()).toEqual([
      'hooks.internal.enabled',
      'hooks.internal.entries.hive-mind',
    ]);
    expect([...result.touchedKeys].sort()).toEqual([
      'hooks.internal.enabled',
      'hooks.internal.entries.hive-mind',
    ]);
  });

  it('respects a custom now() for a deterministic backup filename', async () => {
    env = await bootstrap('{ "hooks": {} }');
    const fixedTs = '2026-04-28T10:30:45.123Z';
    const result = await install({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      now: () => new Date(fixedTs),
    });
    expect(result.backupPath).toContain('hive-mind-backup.2026-04-28T10-30-45-123Z');
    const stats = await stat(result.backupPath as string);
    expect(stats.isFile()).toBe(true);
  });

  it('threads --cli-path into the entry env + records it in the pointer', async () => {
    env = await bootstrap(undefined);
    const cliPath = '/abs/path/to/dist/index.js';
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource, cliPath });
    expect(result.cliPath).toBe(cliPath);

    const after = JSON5.parse(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    const hive = internalEntries(after)[HIVE_ENTRY_KEY] as Record<string, unknown>;
    expect((hive['env'] as Record<string, unknown>)['WAGGLE_HIVE_MIND_CLI']).toBe(cliPath);

    const pointer = await readPointer(result.pointerPath);
    expect(pointer['cli_path']).toBe(cliPath);
  });
});
