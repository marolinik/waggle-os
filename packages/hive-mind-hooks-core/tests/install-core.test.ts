import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupByteIdentical,
  readPointer,
  restoreFromBackup,
  writePointer,
  type InstallPointer,
} from '../src/install-core.js';
import { backupPathFor } from '../src/paths-core.js';

const ISO = '2026-06-01T10:30:45.123Z';

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

let dir: string;

async function tmp(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'hmhc-install-'));
  return dir;
}

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

function basePointer(over: Partial<InstallPointer> = {}): InstallPointer {
  return {
    version: '0.1.0',
    installed_at: ISO,
    config_path: '/x/cfg.json',
    settings_backup: null,
    created_by_us: false,
    hooks_dir: null,
    installed_hooks: ['stop'],
    cli_path: null,
    ...over,
  };
}

describe('backupByteIdentical', () => {
  it('writes a byte-identical backup when the config pre-existed', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    // Include comments-as-content / odd bytes so we prove EXACT byte fidelity.
    const original = '{\n  "hooks": {},\n  "user": "kept verbatim ✓"\n}\n';
    await writeFile(configPath, original, 'utf-8');

    const result = await backupByteIdentical(configPath, ISO);

    expect(result.preExisted).toBe(true);
    expect(result.backupPath).toBe(backupPathFor(configPath, ISO));
    const backupBytes = await readFile(result.backupPath as string);
    expect(sha256(backupBytes)).toBe(sha256(Buffer.from(original, 'utf-8')));
  });

  it('writes NO backup and reports preExisted=false when the config is absent', async () => {
    const home = await tmp();
    const configPath = join(home, 'does-not-exist.json');

    const result = await backupByteIdentical(configPath, ISO);

    expect(result.preExisted).toBe(false);
    expect(result.backupPath).toBeNull();
    expect(existsSync(backupPathFor(configPath, ISO))).toBe(false);
  });
});

describe('writePointer / readPointer round-trip', () => {
  it('round-trips a pointer through disk', async () => {
    const home = await tmp();
    const pointerPath = join(home, 'hive-mind-install.json');
    const pointer = basePointer({
      config_path: join(home, 'hooks.json'),
      settings_backup: '/x/hooks.json.hive-mind-backup.stamp',
      installed_hooks: ['session-start', 'stop'],
      cli_path: '/abs/cli/dist/index.js',
      extra: { dir: 'hive-mind' },
    });

    await writePointer(pointerPath, pointer);
    const read = await readPointer(pointerPath);

    expect(read).toEqual(pointer);
  });

  it('throws when the pointer file is absent', async () => {
    const home = await tmp();
    await expect(readPointer(join(home, 'missing.json'))).rejects.toThrow(/no install pointer/);
  });

  it('throws when the pointer JSON is malformed (not parseable)', async () => {
    const home = await tmp();
    const pointerPath = join(home, 'bad.json');
    await writeFile(pointerPath, '{ not valid json', 'utf-8');
    await expect(readPointer(pointerPath)).rejects.toThrow(/malformed/);
  });

  it('throws when the pointer JSON parses but fails the shape check', async () => {
    const home = await tmp();
    const pointerPath = join(home, 'shape.json');
    await writeFile(pointerPath, JSON.stringify({ hello: 'world' }), 'utf-8');
    await expect(readPointer(pointerPath)).rejects.toThrow(/malformed/);
  });
});

describe('restoreFromBackup — created_by_us=false (byte-identical restore)', () => {
  it('restores the pre-install bytes exactly and removes the backup by default', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    const original = '{\n  "hooks": { "Stop": [] },\n  "keep": "me"\n}\n';
    await writeFile(configPath, original, 'utf-8');
    const preHash = sha256(await readFile(configPath));

    // Simulate install: byte-identical backup, then mutate the live config.
    const { backupPath } = await backupByteIdentical(configPath, ISO);
    await writeFile(configPath, '{ "hooks": { "Stop": ["MUTATED"] } }', 'utf-8');
    expect(sha256(await readFile(configPath))).not.toBe(preHash);

    const pointer = basePointer({
      config_path: configPath,
      settings_backup: backupPath,
      created_by_us: false,
    });
    const result = await restoreFromBackup({ configPath, pointer });

    expect(result.createdRemoved).toBe(false);
    expect(result.restoredFrom).toBe(backupPath);
    expect(result.backupRemoved).toBe(true);
    // Invariant §7.3(2): config is byte-identical to pre-install state.
    expect(sha256(await readFile(configPath))).toBe(preHash);
    expect(await readFile(configPath, 'utf-8')).toBe(original);
    expect(existsSync(backupPath as string)).toBe(false);
  });

  it('keeps the backup when cleanupBackup=false', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    await writeFile(configPath, 'ORIGINAL', 'utf-8');
    const { backupPath } = await backupByteIdentical(configPath, ISO);
    await writeFile(configPath, 'MUTATED', 'utf-8');

    const pointer = basePointer({ config_path: configPath, settings_backup: backupPath });
    const result = await restoreFromBackup({ configPath, pointer, cleanupBackup: false });

    expect(result.backupRemoved).toBe(false);
    expect(existsSync(backupPath as string)).toBe(true);
    expect(await readFile(configPath, 'utf-8')).toBe('ORIGINAL');
  });

  it('refuses to delete the backup and throws when the readback does not match', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    await writeFile(configPath, 'ORIGINAL', 'utf-8');
    const { backupPath } = await backupByteIdentical(configPath, ISO);
    const pointer = basePointer({ config_path: configPath, settings_backup: backupPath });

    // Force a round-trip mismatch via the io seam: the verify read returns
    // bytes that differ from the backup, so the guard MUST throw and MUST NOT
    // delete the backup (a failed verification leaves recovery possible).
    await expect(
      restoreFromBackup({
        configPath,
        pointer,
        io: {
          readFile: async (p) =>
            p === backupPath ? Buffer.from('ORIGINAL') : Buffer.from('CORRUPTED'),
          writeFile: async () => {},
        },
      }),
    ).rejects.toThrow(/verification failed/);
    // The backup survives a failed verification — never deleted on mismatch.
    expect(existsSync(backupPath as string)).toBe(true);
  });

  it('throws when created_by_us=false but settings_backup is null', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    await writeFile(configPath, 'x', 'utf-8');
    const pointer = basePointer({ config_path: configPath, settings_backup: null, created_by_us: false });
    await expect(restoreFromBackup({ configPath, pointer })).rejects.toThrow(/cannot restore/);
  });

  it('throws when the referenced backup file is missing', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    await writeFile(configPath, 'x', 'utf-8');
    const pointer = basePointer({
      config_path: configPath,
      settings_backup: join(home, 'ghost-backup'),
      created_by_us: false,
    });
    await expect(restoreFromBackup({ configPath, pointer })).rejects.toThrow(/backup file referenced/);
  });
});

describe('restoreFromBackup — created_by_us=true (delete the file we created)', () => {
  it('deletes the config file we created and leaves no orphan, no backup', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    // Install created this file fresh (no backup ever written).
    await writeFile(configPath, '{ "hooks": {} }', 'utf-8');

    const pointer = basePointer({
      config_path: configPath,
      settings_backup: null,
      created_by_us: true,
    });
    const result = await restoreFromBackup({ configPath, pointer });

    expect(result.createdRemoved).toBe(true);
    expect(result.restoredFrom).toBeNull();
    expect(result.backupRemoved).toBe(false);
    // Invariant §7.3(2): the file we created is removed, no orphan.
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(backupPathFor(configPath, ISO))).toBe(false);
  });

  it('is a no-op-safe delete when the created file was already removed', async () => {
    const home = await tmp();
    const configPath = join(home, 'hooks.json');
    const pointer = basePointer({ config_path: configPath, created_by_us: true });
    const result = await restoreFromBackup({ configPath, pointer });
    expect(result.createdRemoved).toBe(true);
    expect(existsSync(configPath)).toBe(false);
  });
});
