import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VaultStore } from '../src/vault.js';

describe('Vault Concurrency & Atomic Writes (11B-8)', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-vault-conc-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('5 concurrent setAsync calls — all 5 keys exist after', async () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    // Fire 5 concurrent writes
    await Promise.all([
      vault.setAsync('key-1', 'value-1'),
      vault.setAsync('key-2', 'value-2'),
      vault.setAsync('key-3', 'value-3'),
      vault.setAsync('key-4', 'value-4'),
      vault.setAsync('key-5', 'value-5'),
    ]);

    // Verify all 5 keys exist and have correct values
    for (let i = 1; i <= 5; i++) {
      const entry = vault.get(`key-${i}`);
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe(`value-${i}`);
    }

    // Verify via list that all 5 are present
    const list = vault.list();
    expect(list).toHaveLength(5);
  });

  it('concurrent setAsync and deleteAsync do not corrupt vault', async () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    // Set some initial keys
    vault.set('keep-1', 'v1');
    vault.set('remove-1', 'v2');
    vault.set('keep-2', 'v3');

    // Concurrently set new keys and delete existing ones
    await Promise.all([
      vault.setAsync('new-1', 'new-v1'),
      vault.deleteAsync('remove-1'),
      vault.setAsync('new-2', 'new-v2'),
    ]);

    expect(vault.get('keep-1')?.value).toBe('v1');
    expect(vault.get('keep-2')?.value).toBe('v3');
    expect(vault.get('new-1')?.value).toBe('new-v1');
    expect(vault.get('new-2')?.value).toBe('new-v2');
    expect(vault.get('remove-1')).toBeNull();
  });

  it('atomic write — no vault.json.tmp left behind after write', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('test', 'value');

    const tmpPath = path.join(dir, 'vault.json.tmp');
    expect(fs.existsSync(tmpPath)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'vault.json'))).toBe(true);
  });

  it('deleteAsync returns correct existed flag', async () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('exists', 'val');

    const existed = await vault.deleteAsync('exists');
    expect(existed).toBe(true);

    const notExisted = await vault.deleteAsync('never-was');
    expect(notExisted).toBe(false);
  });

  it('setAsync overwrites existing key', async () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('overwrite-me', 'old-value');
    await vault.setAsync('overwrite-me', 'new-value');

    const entry = vault.get('overwrite-me');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('new-value');
  });

  it('10 concurrent setAsync calls on same key — last one wins', async () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    // Chain them — since writeLock serializes, the last .then() should win
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(vault.setAsync('contested', `value-${i}`));
    }
    await Promise.all(promises);

    const entry = vault.get('contested');
    expect(entry).not.toBeNull();
    // The value should be the last one written (value-9)
    // because the write lock serializes them in order
    expect(entry!.value).toBe('value-9');
  });

  it('sync set still works correctly (backward compatibility)', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('sync-key', 'sync-value', { tag: 'test' });
    const entry = vault.get('sync-key');

    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('sync-value');
    expect(entry!.metadata).toEqual({ tag: 'test' });
  });
});
