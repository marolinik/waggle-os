import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Hoisted mock for node:child_process so static imports in vault.ts are intercepted.
// Defaults to the real implementation; individual tests override via mockImplementation.
const mockExecFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: mockExecFileSync };
});

import { VaultStore, type VaultEntry } from '../src/vault.js';

describe('VaultStore', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const powershellPath = path.win32.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    mockExecFileSync.mockImplementation((
      cmd: string,
      _args: unknown,
      options?: { env?: NodeJS.ProcessEnv; input?: string | Buffer },
    ) => {
      if (cmd === powershellPath) {
        const env = options?.env as NodeJS.ProcessEnv | undefined;
        if (env?.WAGGLE_VAULT_CREATE_KEY === '1') {
          const keyPath = env.WAGGLE_VAULT_KEY_PATH;
          if (!keyPath) throw new Error('missing mocked vault key path');
          const input = Buffer.isBuffer(options?.input)
            ? options.input.toString('utf-8')
            : String(options?.input ?? '');
          fs.writeFileSync(keyPath, input, { flag: 'wx' });
        }
        return '';
      }
      throw new Error(`unexpected executable: ${cmd}`);
    });
  });

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-vault-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
    mockExecFileSync.mockReset();
  });

  it('set and get — store a secret, retrieve it, value matches', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('anthropic', 'sk-ant-secret-key-123');

    const entry = vault.get('anthropic');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('anthropic');
    expect(entry!.value).toBe('sk-ant-secret-key-123');
    expect(entry!.updatedAt).toBeTruthy();
  });

  it('set overwrites — set same name twice, get returns latest', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('openai', 'sk-old-key');
    vault.set('openai', 'sk-new-key');

    const entry = vault.get('openai');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('sk-new-key');
  });

  it('get nonexistent — returns null', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    expect(vault.get('doesnotexist')).toBeNull();
  });

  it('delete — removes secret, get returns null after', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('anthropic', 'sk-ant-key');
    expect(vault.delete('anthropic')).toBe(true);
    expect(vault.get('anthropic')).toBeNull();
  });

  it('delete nonexistent — returns false', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    expect(vault.delete('nope')).toBe(false);
  });

  it('list — shows names + metadata without values', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('anthropic', 'sk-ant-key', { models: ['claude-sonnet-4-6'] });
    vault.set('openai', 'sk-openai-key', { models: ['gpt-4o'], baseUrl: 'https://api.openai.com' });

    const entries = vault.list();
    expect(entries).toHaveLength(2);

    const names = entries.map(e => e.name);
    expect(names).toContain('anthropic');
    expect(names).toContain('openai');

    // list must NOT contain secret values
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('value');
      expect(entry.updatedAt).toBeTruthy();
    }

    const anthropicEntry = entries.find(e => e.name === 'anthropic')!;
    expect(anthropicEntry.metadata).toEqual({ models: ['claude-sonnet-4-6'] });
  });

  it('has — returns true for existing, false for missing', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.set('anthropic', 'sk-ant-key');

    expect(vault.has('anthropic')).toBe(true);
    expect(vault.has('missing')).toBe(false);
  });

  it('encryption is real — vault.json does NOT contain plaintext value', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);
    const secret = 'sk-ant-super-secret-api-key-12345';

    vault.set('anthropic', secret);

    const rawContent = fs.readFileSync(path.join(dir, 'vault.json'), 'utf-8');
    expect(rawContent).not.toContain(secret);

    // The encrypted field should exist and contain hex data with colons (iv:tag:ciphertext)
    const parsed = JSON.parse(rawContent);
    expect(parsed.anthropic.encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('different VaultStore instances with same key can decrypt', () => {
    const dir = makeTempDir();
    const vault1 = new VaultStore(dir);
    vault1.set('anthropic', 'sk-ant-shared-secret');

    // Create a second instance pointing at the same directory (same key file)
    const vault2 = new VaultStore(dir);
    const entry = vault2.get('anthropic');

    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('sk-ant-shared-secret');
  });

  it('migration from config — providers migrated to vault', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    const config = {
      providers: {
        anthropic: { apiKey: 'sk-ant-key-1', models: ['claude-sonnet-4-6'], baseUrl: undefined },
        openai: { apiKey: 'sk-openai-key-1', models: ['gpt-4o'] },
      },
    };

    const migrated = vault.migrateFromConfig(config);
    expect(migrated).toBe(2);

    const anthropic = vault.get('anthropic');
    expect(anthropic).not.toBeNull();
    expect(anthropic!.value).toBe('sk-ant-key-1');
    expect(anthropic!.metadata?.models).toEqual(['claude-sonnet-4-6']);

    const openai = vault.get('openai');
    expect(openai).not.toBeNull();
    expect(openai!.value).toBe('sk-openai-key-1');
  });

  it('migration skips existing — migrate twice, count stays same', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    const config = {
      providers: {
        anthropic: { apiKey: 'sk-ant-key-1', models: ['claude-sonnet-4-6'] },
      },
    };

    const first = vault.migrateFromConfig(config);
    expect(first).toBe(1);

    const second = vault.migrateFromConfig(config);
    expect(second).toBe(0);
  });

  it('key file is generated on first use and reused', () => {
    const dir = makeTempDir();
    new VaultStore(dir);

    const keyPath = path.join(dir, '.vault-key');
    expect(fs.existsSync(keyPath)).toBe(true);

    // Key should be 64 hex chars (32 bytes)
    const keyHex = fs.readFileSync(keyPath, 'utf-8').trim();
    expect(keyHex).toMatch(/^[0-9a-f]{64}$/);

    // Second instance should use the same key (not overwrite)
    new VaultStore(dir);
    const keyHex2 = fs.readFileSync(keyPath, 'utf-8').trim();
    expect(keyHex2).toBe(keyHex);
  });

  it('setConnectorCredential — refresh token is NOT stored as plaintext in vault.json', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);
    const refreshToken = 'rt-super-secret-refresh-token-xyz';

    vault.setConnectorCredential('github', {
      type: 'oauth2',
      value: 'gho_access_token_123',
      refreshToken,
      expiresAt: '2099-01-01T00:00:00Z',
      scopes: ['repo', 'user'],
    });

    // Read raw vault.json and verify the refresh token is NOT in plaintext
    const rawContent = fs.readFileSync(path.join(dir, 'vault.json'), 'utf-8');
    expect(rawContent).not.toContain(refreshToken);

    // The metadata for the main connector entry must NOT contain refreshToken
    const parsed = JSON.parse(rawContent);
    const mainEntry = parsed['connector:github'];
    expect(mainEntry).toBeDefined();
    expect(mainEntry.metadata).not.toHaveProperty('refreshToken');

    // The refresh token should be stored as a separate encrypted entry
    const refreshEntry = parsed['connector:github:refresh'];
    expect(refreshEntry).toBeDefined();
    expect(refreshEntry.encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('getConnectorCredential — returns decrypted refresh token correctly', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);
    const accessToken = 'gho_access_token_456';
    const refreshToken = 'rt-secret-refresh-token-abc';

    vault.setConnectorCredential('github', {
      type: 'oauth2',
      value: accessToken,
      refreshToken,
      expiresAt: '2099-01-01T00:00:00Z',
      scopes: ['repo'],
    });

    const cred = vault.getConnectorCredential('github');
    expect(cred).not.toBeNull();
    expect(cred!.value).toBe(accessToken);
    expect(cred!.refreshToken).toBe(refreshToken);
    expect(cred!.type).toBe('oauth2');
    expect(cred!.expiresAt).toBe('2099-01-01T00:00:00Z');
    expect(cred!.scopes).toEqual(['repo']);
    expect(cred!.isExpired).toBe(false);
  });

  it('setConnectorCredential — without refresh token does not create refresh entry', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    vault.setConnectorCredential('slack', {
      type: 'bearer',
      value: 'xoxb-token-123',
    });

    const rawContent = fs.readFileSync(path.join(dir, 'vault.json'), 'utf-8');
    const parsed = JSON.parse(rawContent);
    expect(parsed['connector:slack']).toBeDefined();
    expect(parsed['connector:slack:refresh']).toBeUndefined();

    const cred = vault.getConnectorCredential('slack');
    expect(cred).not.toBeNull();
    expect(cred!.value).toBe('xoxb-token-123');
    expect(cred!.refreshToken).toBeUndefined();
  });

  it('setConnectorCredential — clears refresh token when re-set without one', () => {
    const dir = makeTempDir();
    const vault = new VaultStore(dir);

    // First set with refresh token
    vault.setConnectorCredential('github', {
      type: 'oauth2',
      value: 'gho_token_1',
      refreshToken: 'rt-old-refresh',
    });
    expect(vault.getConnectorCredential('github')!.refreshToken).toBe('rt-old-refresh');

    // Re-set without refresh token
    vault.setConnectorCredential('github', {
      type: 'oauth2',
      value: 'gho_token_2',
    });
    const cred = vault.getConnectorCredential('github');
    expect(cred!.value).toBe('gho_token_2');
    expect(cred!.refreshToken).toBeUndefined();
    expect(vault.has('connector:github:refresh')).toBe(false);
  });

  it('corrupted key file — truncated hex throws clear error', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');

    // Write a truncated key (only 10 hex chars = 5 bytes instead of 32)
    fs.writeFileSync(keyPath, 'abcdef0123', { mode: 0o600 });

    expect(() => new VaultStore(dir)).toThrowError(
      /Vault key file is corrupted — expected 32 bytes, got 5/
    );
  });

  it('corrupted key file — non-hex content throws clear error', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');

    // Non-hex content: Buffer.from('not-hex-at-all', 'hex') silently produces a short buffer
    fs.writeFileSync(keyPath, 'not-hex-at-all-garbage-content', { mode: 0o600 });

    expect(() => new VaultStore(dir)).toThrowError(
      /Vault key file is corrupted — expected 32 bytes/
    );
  });

  it('corrupted key file — empty file throws clear error', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');

    fs.writeFileSync(keyPath, '', { mode: 0o600 });

    expect(() => new VaultStore(dir)).toThrowError(
      /Vault key file is corrupted — expected 32 bytes, got 0/
    );
  });

  it('Windows key protection — uses absolute System32 tools even with an isolated PATH', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');
    const systemRoot = 'C:\\Windows';
    const powershellPath = path.win32.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );

    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const originalSystemRoot = process.env.SystemRoot;
    const originalPath = process.env.PATH;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.SystemRoot = systemRoot;
    process.env.PATH = path.join(dir, 'sentinel-path');
    mockExecFileSync.mockImplementation((
      cmd: string,
      _args: unknown,
      options?: { env?: NodeJS.ProcessEnv; input?: string | Buffer },
    ) => {
      if (cmd === powershellPath) {
        const mockedPath = options?.env?.WAGGLE_VAULT_KEY_PATH;
        if (!mockedPath) throw new Error('missing mocked vault key path');
        const input = Buffer.isBuffer(options?.input)
          ? options.input.toString('utf-8')
          : String(options?.input ?? '');
        fs.writeFileSync(mockedPath, input, { flag: 'wx' });
        return '';
      }
      throw new Error(`unexpected executable: ${cmd}`);
    });

    try {
      new VaultStore(dir);

      expect(mockExecFileSync).toHaveBeenCalledWith(
        powershellPath,
        expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand']),
        expect.objectContaining({
          env: expect.objectContaining({
            WAGGLE_VAULT_KEY_PATH: keyPath,
            WAGGLE_VAULT_CREATE_KEY: '1',
          }),
          input: expect.stringMatching(/^[0-9a-f]{64}$/),
          stdio: ['pipe', 'ignore', 'pipe'],
        }),
      );
      const powerShellCall = mockExecFileSync.mock.calls.find(([cmd]) => cmd === powershellPath)!;
      const args = powerShellCall[1] as string[];
      const options = powerShellCall[2] as { input: string };
      expect(args.join(' ')).not.toContain(options.input);
      expect(fs.readFileSync(keyPath, 'utf-8')).toBe(options.input);
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      if (originalSystemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = originalSystemRoot;
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      mockExecFileSync.mockReset();
    }
  });

  it('Windows key protection — ACL failure removes a newly generated key and fails closed', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');
    const systemRoot = 'C:\\Windows';

    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const originalSystemRoot = process.env.SystemRoot;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.SystemRoot = systemRoot;
    mockExecFileSync.mockImplementation(() => { throw new Error('Set-Acl failed'); });

    try {
      expect(() => new VaultStore(dir)).toThrow(/restrict vault key permissions/i);
      expect(fs.existsSync(keyPath)).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      if (originalSystemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = originalSystemRoot;
      mockExecFileSync.mockReset();
    }
  });

  it('Windows key protection — a failed create collision never deletes the winning key', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');
    const winnerKey = 'ef'.repeat(32);
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const originalSystemRoot = process.env.SystemRoot;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.SystemRoot = 'C:\\Windows';
    mockExecFileSync.mockImplementation(() => {
      fs.writeFileSync(keyPath, winnerKey, { flag: 'wx' });
      throw new Error('CreateNew collision');
    });

    try {
      expect(() => new VaultStore(dir)).toThrow(/restrict vault key permissions/i);
      expect(fs.readFileSync(keyPath, 'utf-8')).toBe(winnerKey);
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      if (originalSystemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = originalSystemRoot;
      mockExecFileSync.mockReset();
    }
  });

  it('Windows key protection — existing keys are re-hardened and retained on failure', () => {
    const dir = makeTempDir();
    const keyPath = path.join(dir, '.vault-key');
    const keyHex = 'ab'.repeat(32);
    const systemRoot = 'C:\\Windows';
    fs.writeFileSync(keyPath, keyHex, { mode: 0o600 });

    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const originalSystemRoot = process.env.SystemRoot;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.SystemRoot = systemRoot;
    mockExecFileSync.mockImplementation(() => { throw new Error('Set-Acl denied'); });

    try {
      expect(() => new VaultStore(dir)).toThrow(/restrict vault key permissions/i);
      expect(fs.readFileSync(keyPath, 'utf-8')).toBe(keyHex);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        expect.stringContaining('powershell.exe'),
        expect.arrayContaining(['-EncodedCommand']),
        expect.objectContaining({
          env: expect.objectContaining({ WAGGLE_VAULT_CREATE_KEY: '0' }),
        }),
      );
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      if (originalSystemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = originalSystemRoot;
      mockExecFileSync.mockReset();
    }
  });

  it.runIf(process.platform === 'win32')(
    'Windows key protection — removes a pre-existing explicit Everyone allow ACE',
    async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      const dir = makeTempDir();
      const probePath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        'vault-acl-probe.ts',
      );
      const probeMarkerPath = path.join(dir, '.acl-probe-ok');

      await new Promise<void>((resolve, reject) => {
        actual.execFile(
          process.execPath,
          [
            path.resolve('node_modules/vite-node/vite-node.mjs'),
            '--root',
            process.cwd(),
            '--config',
            path.resolve('vitest.config.ts'),
            probePath,
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, WAGGLE_VAULT_TEST_DIR: dir },
            encoding: 'utf-8',
            timeout: 180_000,
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Windows ACL probe failed: ${stderr || stdout || error.message}`));
            } else if (
              !fs.existsSync(probeMarkerPath)
              || fs.readFileSync(probeMarkerPath, 'utf-8') !== 'acl-remediated\n'
            ) {
              reject(new Error('Windows ACL probe exited without a verified completion marker'));
            } else {
              resolve();
            }
          },
        );
      });
    },
    210_000,
  );
});
