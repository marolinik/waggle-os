import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { install } from '../src/install.js';
import { HIVE_MIND_MARKER } from '../src/yaml-merger.js';

interface TestEnv {
  home: string;
  hooksDir: string;
  configPath: string;
  pointerPath: string;
}

/** Hermes config.yaml is OPTIONAL — `initial=undefined` exercises create-if-missing. */
async function bootstrap(initialYaml: string | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmher-install-'));
  const hermesDir = join(home, '.hermes');
  await mkdir(hermesDir, { recursive: true });
  const configPath = join(hermesDir, 'config.yaml');
  if (initialYaml !== undefined) {
    await writeFile(configPath, initialYaml, 'utf-8');
  }
  const hooksDir = resolve(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  return { home, hooksDir, configPath, pointerPath: join(hermesDir, 'hive-mind-install.json') };
}

function readPointer(p: string): Promise<Record<string, unknown>> {
  return readFile(p, 'utf-8').then((s) => JSON.parse(s) as Record<string, unknown>);
}

function hooksOf(config: Record<string, unknown>): Record<string, Array<Record<string, unknown>>> {
  return config['hooks'] as Record<string, Array<Record<string, unknown>>>;
}

describe('install (hermes)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws on malformed YAML in an existing config.yaml', async () => {
    env = await bootstrap('hooks:\n\t- : : :\n  bad');
    await expect(install({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/parse/i);
  });

  // ── pre-existed branch ────────────────────────────────────────────────

  it('writes a LITERAL byte-identical backup before mutating a pre-existing config.yaml', async () => {
    // Comments + ordering that a YAML round-trip would NOT preserve — proves
    // the backup is the original bytes, not a re-serialized merge.
    const initial = '# my hermes config\nmodel: opus\nhooks:\n  pre_llm_call:\n    - command: node /existing/x.js\n      timeout: 10\n';
    env = await bootstrap(initial);
    const original = await readFile(env.configPath, 'utf-8');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.backupPath).not.toBeNull();
    const backupContent = await readFile(result.backupPath as string, 'utf-8');
    expect(backupContent).toBe(original);
    // The backup preserves the comment that YAML re-serialization drops.
    expect(backupContent).toContain('# my hermes config');
  });

  it('records created_by_us=false + settings_backup when config.yaml pre-existed', async () => {
    env = await bootstrap('model: opus\nhooks: {}\n');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.createdByUs).toBe(false);
    const pointer = await readPointer(result.pointerPath);
    expect(pointer['created_by_us']).toBe(false);
    expect(pointer['settings_backup']).toBe(result.backupPath);
  });

  it('additively merges hive entries + preserves the user hook entry + user top-level keys', async () => {
    const initial = 'model: opus\nhooks:\n  pre_llm_call:\n    - command: node /existing/x.js\n      timeout: 10\n';
    env = await bootstrap(initial);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    const hooks = hooksOf(after);
    // pre_llm_call now holds the user lint hook + 2 hive entries (session-start inject + user-prompt).
    expect(hooks['pre_llm_call']).toHaveLength(3);
    expect(hooks['pre_llm_call'][0]['command']).toBe('node /existing/x.js');
    expect(hooks['pre_llm_call'][0]['_hive_mind']).toBeUndefined();
    const hiveEntries = hooks['pre_llm_call'].filter((e) => e['_hive_mind'] === HIVE_MIND_MARKER);
    expect(hiveEntries).toHaveLength(2);
    // The split SessionStart observer + the Stop entry are present.
    expect(hooks['on_session_start']).toHaveLength(1);
    expect(hooks['post_llm_call']).toHaveLength(1);
    // User top-level key preserved.
    expect(after['model']).toBe('opus');
  });

  // ── create-if-missing branch ──────────────────────────────────────────

  it('creates config.yaml with the hive hooks when it is absent', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(env.configPath)).toBe(true);
    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    const hooks = hooksOf(after);
    expect(Object.keys(hooks).sort()).toEqual(['on_session_start', 'post_llm_call', 'pre_llm_call']);
    expect(result.createdByUs).toBe(true);
  });

  it('records created_by_us=true and writes NO backup when config.yaml is absent', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.backupPath).toBeNull();
    const pointer = await readPointer(result.pointerPath);
    expect(pointer['created_by_us']).toBe(true);
    expect(pointer['settings_backup']).toBeNull();
  });

  // ── auto-accept consent allow-list ────────────────────────────────────

  it('seeds hooks_auto_accept: true by default (headless consent allow-list)', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.autoAcceptSeeded).toBe(true);
    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    expect(after['hooks_auto_accept']).toBe(true);
  });

  it('does NOT seed auto-accept when autoAccept=false (--no-auto-accept)', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir, autoAccept: false });
    expect(result.autoAcceptSeeded).toBe(false);
    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    expect(after['hooks_auto_accept']).toBeUndefined();
  });

  it('does not re-seed auto-accept when the user already set it true', async () => {
    env = await bootstrap('hooks_auto_accept: true\nhooks: {}\n');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.autoAcceptSeeded).toBe(false);
    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    expect(after['hooks_auto_accept']).toBe(true);
  });

  // ── pointer + events + cli-path ───────────────────────────────────────

  it('drops a pointer file with installed_hooks (3, no pre-compact) + registered_events', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(result.pointerPath)).toBe(true);
    const pointer = await readPointer(result.pointerPath);
    expect(pointer['installed_hooks']).toEqual(['session-start', 'user-prompt-submit', 'stop']);
    expect(typeof pointer['version']).toBe('string');
    const extra = pointer['extra'] as Record<string, unknown>;
    // Dedup'd native event keys across the four register entries.
    expect((extra['registered_events'] as string[]).sort()).toEqual([
      'on_session_start',
      'post_llm_call',
      'pre_llm_call',
    ]);
    expect(extra['auto_accept_seeded']).toBe(true);
  });

  it('result.registeredEvents reports the 3 unique native keys', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect([...result.registeredEvents].sort()).toEqual([
      'on_session_start',
      'post_llm_call',
      'pre_llm_call',
    ]);
  });

  it('clamps the per-hook timeout to the 300s hard cap', async () => {
    env = await bootstrap(undefined);
    await install({ home: env.home, hooksDir: env.hooksDir, hookTimeoutSeconds: 9999 });
    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    const hooks = hooksOf(after);
    expect(hooks['post_llm_call'][0]['timeout']).toBe(300);
  });

  it('respects a custom now() for a deterministic backup filename', async () => {
    env = await bootstrap('hooks: {}\n');
    const fixedTs = '2026-04-28T10:30:45.123Z';
    const result = await install({
      home: env.home,
      hooksDir: env.hooksDir,
      now: () => new Date(fixedTs),
    });
    expect(result.backupPath).toContain('hive-mind-backup.2026-04-28T10-30-45-123Z');
    const stats = await stat(result.backupPath as string);
    expect(stats.isFile()).toBe(true);
  });

  it('threads --cli-path into every generated hook command + records it in the pointer', async () => {
    env = await bootstrap(undefined);
    const cliPath = '/abs/path/to/dist/index.js';
    const result = await install({ home: env.home, hooksDir: env.hooksDir, cliPath });
    expect(result.cliPath).toBe(cliPath);

    const after = parseYaml(await readFile(env.configPath, 'utf-8')) as Record<string, unknown>;
    const hooks = hooksOf(after);
    expect(hooks['post_llm_call'][0]['command']).toContain(`--cli-path "${cliPath}"`);
    expect(hooks['on_session_start'][0]['command']).toContain(`--cli-path "${cliPath}"`);

    const pointer = await readPointer(result.pointerPath);
    expect(pointer['cli_path']).toBe(cliPath);
  });

  it('rejects --cli-path values containing double-quote characters', async () => {
    env = await bootstrap(undefined);
    await expect(install({
      home: env.home,
      hooksDir: env.hooksDir,
      cliPath: 'malicious" && rm -rf / "',
    })).rejects.toThrow(/double-quote/);
  });
});
