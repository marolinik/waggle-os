/**
 * Vault edge case tests — corrupted files, missing files,
 * concurrent read/write safety, and large value storage.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VaultStore } from '../src/vault.js';

describe('VaultStore edge cases', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-vault-edge-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  // ── Corrupted vault.json ────────────────────────────────────────────

  describe('corrupted vault.json', () => {
    it('handles invalid JSON gracefully — returns null for get', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Store a valid secret first
      vault.set('test-key', 'test-value');
      expect(vault.get('test-key')!.value).toBe('test-value');

      // Corrupt the vault.json file with invalid JSON
      const vaultPath = path.join(dir, 'vault.json');
      fs.writeFileSync(vaultPath, '{ this is not valid JSON !!!', 'utf-8');

      // get should return null (not crash)
      expect(vault.get('test-key')).toBeNull();
    });

    it('handles invalid JSON gracefully — list returns empty array', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Corrupt the vault.json file
      const vaultPath = path.join(dir, 'vault.json');
      fs.writeFileSync(vaultPath, '<xml>not json</xml>', 'utf-8');

      // list should return empty (not crash)
      expect(vault.list()).toEqual([]);
    });

    it('handles invalid JSON gracefully — has returns false', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Corrupt the vault.json file
      const vaultPath = path.join(dir, 'vault.json');
      fs.writeFileSync(vaultPath, '}}broken{{', 'utf-8');

      // has should return false (not crash)
      expect(vault.has('anything')).toBe(false);
    });

    it('can write new secrets after corruption — overwrites corrupted file', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Corrupt the vault.json file
      const vaultPath = path.join(dir, 'vault.json');
      fs.writeFileSync(vaultPath, 'CORRUPT!', 'utf-8');

      // set should overwrite corrupted file with valid data
      vault.set('recovery-key', 'recovered-value');

      // Should be able to read back the new value
      const entry = vault.get('recovery-key');
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe('recovered-value');

      // Verify the file is now valid JSON
      const raw = fs.readFileSync(vaultPath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  // ── Missing vault.json ──────────────────────────────────────────────

  describe('missing vault.json', () => {
    it('creates a new vault.json on next write when file is missing', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);
      const vaultPath = path.join(dir, 'vault.json');

      // Ensure no vault.json exists initially
      if (fs.existsSync(vaultPath)) {
        fs.unlinkSync(vaultPath);
      }
      expect(fs.existsSync(vaultPath)).toBe(false);

      // Write a secret — should create vault.json
      vault.set('new-key', 'new-value');

      expect(fs.existsSync(vaultPath)).toBe(true);
      const entry = vault.get('new-key');
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe('new-value');
    });

    it('get returns null when vault.json does not exist', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);
      const vaultPath = path.join(dir, 'vault.json');

      // Ensure no vault.json exists
      if (fs.existsSync(vaultPath)) {
        fs.unlinkSync(vaultPath);
      }

      expect(vault.get('missing')).toBeNull();
    });

    it('list returns empty array when vault.json does not exist', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);
      const vaultPath = path.join(dir, 'vault.json');

      // Ensure no vault.json exists
      if (fs.existsSync(vaultPath)) {
        fs.unlinkSync(vaultPath);
      }

      expect(vault.list()).toEqual([]);
    });
  });

  // ── Concurrent reads during write ──────────────────────────────────

  describe('concurrent reads during write', () => {
    it('read during setAsync does not corrupt data', async () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Pre-populate with a known value
      vault.set('existing', 'original-value');

      // Start an async write, then immediately read
      const writePromise = vault.setAsync('new-key', 'new-value');
      const readResult = vault.get('existing');

      await writePromise;

      // The original key should still be readable (not corrupted)
      expect(readResult).not.toBeNull();
      expect(readResult!.value).toBe('original-value');

      // The new key should also be present
      const newEntry = vault.get('new-key');
      expect(newEntry).not.toBeNull();
      expect(newEntry!.value).toBe('new-value');

      // The existing key should still be intact
      const existingAfter = vault.get('existing');
      expect(existingAfter).not.toBeNull();
      expect(existingAfter!.value).toBe('original-value');
    });

    it('multiple rapid reads interleaved with writes produce consistent results', async () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Write initial data
      vault.set('stable', 'stable-value');

      // Fire off writes and reads in rapid succession
      const writePromises = [];
      for (let i = 0; i < 5; i++) {
        writePromises.push(vault.setAsync(`rapid-${i}`, `value-${i}`));
      }

      // Interleave reads
      const readResults: (string | null)[] = [];
      for (let i = 0; i < 5; i++) {
        const entry = vault.get('stable');
        readResults.push(entry?.value ?? null);
      }

      await Promise.all(writePromises);

      // All reads of the stable key should return the correct value
      for (const val of readResults) {
        expect(val).toBe('stable-value');
      }

      // All written keys should be present
      for (let i = 0; i < 5; i++) {
        const entry = vault.get(`rapid-${i}`);
        expect(entry).not.toBeNull();
        expect(entry!.value).toBe(`value-${i}`);
      }
    });
  });

  // ── Large value storage ────────────────────────────────────────────

  describe('large value storage', () => {
    it('stores and retrieves a 1MB string correctly', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Generate a 1MB string (1,048,576 characters)
      const largeValue = 'A'.repeat(1024 * 1024);
      expect(largeValue.length).toBe(1024 * 1024);

      vault.set('large-secret', largeValue);

      const entry = vault.get('large-secret');
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe(largeValue);
      expect(entry!.value.length).toBe(1024 * 1024);
    });

    it('large value is encrypted in vault.json — plaintext not present', () => {
      const dir = makeTempDir();
      const vault = new VaultStore(dir);

      // Use a distinctive pattern that would be easy to find if unencrypted
      const largeValue = 'SECRET_MARKER_'.repeat(10000);
      vault.set('large-encrypted', largeValue);

      const rawContent = fs.readFileSync(path.join(dir, 'vault.json'), 'utf-8');
      expect(rawContent).not.toContain('SECRET_MARKER_');

      // Verify the encrypted field has the correct format
      const parsed = JSON.parse(rawContent);
      expect(parsed['large-encrypted'].encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('large value survives round-trip through different VaultStore instances', () => {
      const dir = makeTempDir();

      // Write with one instance
      const vault1 = new VaultStore(dir);
      const largeValue = 'B'.repeat(1024 * 1024);
      vault1.set('large-roundtrip', largeValue);

      // Read with a different instance (same key file)
      const vault2 = new VaultStore(dir);
      const entry = vault2.get('large-roundtrip');
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe(largeValue);
      expect(entry!.value.length).toBe(1024 * 1024);
    });
  });
});
