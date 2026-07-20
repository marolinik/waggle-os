/**
 * VaultStore — encrypted local secrets store.
 *
 * Encrypts secrets using AES-256-GCM (Node.js built-in crypto).
 * Stores encrypted data in vault.json with a machine-local key file.
 * Each entry is independently encrypted so individual secrets can be
 * updated without re-encrypting everything.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCoreLogger } from '@waggle/hive-mind-core';

const log = createCoreLogger('vault');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

export interface VaultEntry {
  name: string;
  value: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

interface VaultRecord {
  encrypted: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

interface ConnectorCredentialInput {
  type: 'api_key' | 'oauth2' | 'bearer' | 'basic';
  value: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

export class VaultStore {
  private dataDir: string;
  private vaultPath: string;
  private keyPath: string;
  private encryptionKey: Buffer;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.vaultPath = path.join(dataDir, 'vault.json');
    this.keyPath = path.join(dataDir, '.vault-key');

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.encryptionKey = this.ensureKey();
  }

  /** Ensure the encryption key exists. Generate if missing. */
  private ensureKey(): Buffer {
    let key: Buffer;
    let created = false;

    if (fs.existsSync(this.keyPath)) {
      const keyStat = fs.lstatSync(this.keyPath);
      if (!keyStat.isFile() || keyStat.isSymbolicLink()) {
        throw new Error(`Vault key path is not a regular file: ${this.keyPath}`);
      }
      key = Buffer.from(fs.readFileSync(this.keyPath, 'utf-8').trim(), 'hex');
      if (key.length !== KEY_LENGTH) {
        throw new Error(
          `Vault key file is corrupted — expected ${KEY_LENGTH} bytes, got ${key.length}. Delete ${this.keyPath} to regenerate.`
        );
      }
    } else {
      key = crypto.randomBytes(KEY_LENGTH);
      if (process.platform !== 'win32') {
        fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600, flag: 'wx' });
      }
      created = true;
    }

    if (process.platform === 'win32') {
      try {
        this.restrictWindowsKeyPermissions(created ? key : undefined);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Could not restrict vault key permissions on Windows: ${reason}.`);
      }
    }
    return key;
  }

  private restrictWindowsKeyPermissions(newKey?: Buffer): void {
    const systemRoot = process.env.SystemRoot?.trim();
    const normalizedRoot = systemRoot ? path.win32.normalize(systemRoot) : '';
    if (!/^[A-Za-z]:\\/.test(normalizedRoot)) {
      throw new Error('SystemRoot is missing or is not a drive-rooted Windows path');
    }

    const system32 = path.win32.join(normalizedRoot, 'System32');
    const powershell = path.win32.join(
      system32,
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );

    const aclScript = [
      "$ErrorActionPreference = 'Stop'",
      '$keyPath = $env:WAGGLE_VAULT_KEY_PATH',
      '$createKey = $env:WAGGLE_VAULT_CREATE_KEY -eq "1"',
      '$createdByThisInvocation = $false',
      'try {',
      '  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User',
      '  $full = [Security.AccessControl.FileSystemRights]::FullControl',
      '  $allow = [Security.AccessControl.AccessControlType]::Allow',
      '  $targetAcl = New-Object Security.AccessControl.FileSecurity',
      '  $targetAcl.SetOwner($sid)',
      '  $targetAcl.SetAccessRuleProtection($true, $false)',
      '  $targetAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule -ArgumentList @($sid, $full, $allow)))',
      '  if ($createKey) {',
      '    $keyHex = [Console]::In.ReadToEnd().Trim()',
      '    if ($keyHex -notmatch "^[0-9a-f]{64}$") { throw "Invalid generated vault key" }',
      '    $keyBytes = [Text.Encoding]::ASCII.GetBytes($keyHex)',
      '    $stream = [IO.FileStream]::new($keyPath, [IO.FileMode]::CreateNew, $full, [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough, $targetAcl)',
      '    $createdByThisInvocation = $true',
      '    try { $stream.Write($keyBytes, 0, $keyBytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }',
      '  } else {',
      '    $existingAttributes = [IO.File]::GetAttributes($keyPath)',
      '    if (($existingAttributes -band [IO.FileAttributes]::Directory) -or ($existingAttributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Vault key is not a regular file" }',
      '    [IO.File]::SetAccessControl($keyPath, $targetAcl)',
      '  }',
      '  $attributes = [IO.File]::GetAttributes($keyPath)',
      '  $length = [IO.FileInfo]::new($keyPath).Length',
      '  if (($attributes -band [IO.FileAttributes]::Directory) -or ($attributes -band [IO.FileAttributes]::ReparsePoint) -or $length -ne 64) { throw "Vault key payload is not a regular 64-byte file" }',
      '  $acl = [IO.File]::GetAccessControl($keyPath)',
      '  $ownerSid = $acl.GetOwner([Security.Principal.SecurityIdentifier])',
      '  $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))',
      '  $current = @($rules | Where-Object { -not $_.IsInherited -and $_.IdentityReference.Value -eq $sid.Value -and $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow })',
      '  $hasFull = @($current | Where-Object { ($_.FileSystemRights -band $full) -eq $full }).Count -eq 1',
      '  if (-not $acl.AreAccessRulesProtected -or $ownerSid.Value -ne $sid.Value -or $rules.Count -ne 1 -or -not $hasFull) { throw "Vault ACL is not current-user-only" }',
      '} catch {',
      '  if ($createdByThisInvocation) { try { [IO.File]::Delete($keyPath) } catch {} }',
      '  throw',
      '}',
    ].join('\n');
    const childEnv: NodeJS.ProcessEnv = {
      SystemRoot: normalizedRoot,
      WINDIR: normalizedRoot,
      WAGGLE_VAULT_KEY_PATH: this.keyPath,
      WAGGLE_VAULT_CREATE_KEY: newKey ? '1' : '0',
    };
    for (const name of ['TEMP', 'TMP', 'ComSpec', 'SystemDrive', 'PROCESSOR_ARCHITECTURE']) {
      const value = process.env[name];
      if (value) childEnv[name] = value;
    }
    execFileSync(powershell, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(aclScript, 'utf16le').toString('base64'),
    ], {
      encoding: 'utf-8',
      env: childEnv,
      input: newKey?.toString('hex') ?? '',
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    });
  }

  /** Encrypt a plaintext string. Returns iv:authTag:ciphertext (all hex). */
  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /** Decrypt an encoded string (iv:authTag:ciphertext, all hex). */
  private decrypt(encoded: string): string {
    const parts = encoded.split(':');
    if (parts.length !== 3) {
      throw new Error('Vault entry format invalid — expected iv:authTag:ciphertext');
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf-8');
  }

  /** Read the vault file (encrypted entries). */
  private readVault(): Record<string, VaultRecord> {
    if (!fs.existsSync(this.vaultPath)) return {};
    try {
      // Review Critical #3: use a null-prototype object so a malicious `__proto__`
      // key in vault.json cannot pollute Object.prototype when accessed. Matches
      // the `name` validation at the route layer.
      const parsed = JSON.parse(fs.readFileSync(this.vaultPath, 'utf-8'));
      return Object.assign(Object.create(null), parsed);
    } catch (err) {
      // M5: corrupt vault.json — back up the corrupt file so data isn't silently lost
      log.error('Failed to parse vault.json — backing up corrupt file', err);
      const bakPath = this.vaultPath + '.bak';
      try { fs.copyFileSync(this.vaultPath, bakPath); } catch { /* best effort */ }
      return {};
    }
  }

  /** Write the vault file atomically (write to .tmp, then replace). */
  private writeVault(vault: Record<string, VaultRecord>): void {
    const tmpPath = this.vaultPath + '.tmp';
    const data = JSON.stringify(vault, null, 2);
    fs.writeFileSync(tmpPath, data, { mode: 0o600 });
    try {
      try {
        fs.renameSync(tmpPath, this.vaultPath);
      } catch {
        // M6: On Windows, rename fails with EPERM when target exists.
        // Delete target first, then rename — preserves atomicity better than direct write.
        try { fs.unlinkSync(this.vaultPath); } catch { /* target may not exist */ }
        try {
          fs.renameSync(tmpPath, this.vaultPath);
        } catch (renameErr) {
          // Last resort: direct write (non-atomic) — log the degradation
          log.error('Atomic vault write failed, falling back to direct write', renameErr);
          fs.writeFileSync(this.vaultPath, data, { mode: 0o600 });
        }
      }
    } finally {
      // M12: clean up .tmp if it still exists after any failure path
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* best effort */ }
    }
  }

  /** Set a secret (encrypts value, stores metadata alongside). Uses atomic write. */
  set(name: string, value: string, metadata?: Record<string, unknown>): void {
    const vault = this.readVault();
    vault[name] = {
      encrypted: this.encrypt(value),
      metadata,
      updatedAt: new Date().toISOString(),
    };
    this.writeVault(vault);
  }

  /**
   * Async set — delegates to the synchronous set().
   * Review Critical #2: the previous implementation used a promise chain
   * (.writeLock.then(...)) which deferred the actual write to a microtask.
   * A sync set() between the chain call and microtask execution would be
   * overwritten when the deferred write fired. Since all vault I/O is
   * synchronous (fs.readFileSync/writeFileSync), the lock is unnecessary —
   * each callback runs to completion before the next microtask. Delegating
   * to the sync method eliminates the interleaving window entirely.
   */
  async setAsync(name: string, value: string, metadata?: Record<string, unknown>): Promise<void> {
    this.set(name, value, metadata);
  }

  /** Get a decrypted secret by name. Returns null if not found or decryption fails. */
  get(name: string): VaultEntry | null {
    const vault = this.readVault();
    const entry = vault[name];
    if (!entry) return null;
    try {
      return {
        name,
        value: this.decrypt(entry.encrypted),
        metadata: entry.metadata,
        updatedAt: entry.updatedAt,
      };
    } catch {
      return null; // Decryption failed (key mismatch, corrupted)
    }
  }

  /** Delete a secret. Returns true if it existed. Uses atomic write. */
  delete(name: string): boolean {
    const vault = this.readVault();
    if (!vault[name]) return false;
    delete vault[name];
    this.writeVault(vault);
    return true;
  }

  /**
   * Async delete — delegates to the synchronous delete().
   * Review Critical #2: same rationale as setAsync — sync I/O means no
   * interleaving risk. The previous promise-chain approach deferred the
   * actual delete, creating a window where a sync caller's write could
   * be overwritten.
   */
  async deleteAsync(name: string): Promise<boolean> {
    return this.delete(name);
  }

  /** List secret names (without values). */
  list(): Array<{ name: string; metadata?: Record<string, unknown>; updatedAt: string }> {
    const vault = this.readVault();
    return Object.entries(vault).map(([name, entry]) => ({
      name,
      metadata: entry.metadata,
      updatedAt: entry.updatedAt,
    }));
  }

  /** Check if a secret exists. */
  has(name: string): boolean {
    const vault = this.readVault();
    return name in vault;
  }

  /** Set a connector credential with typed metadata. */
  setConnectorCredential(connectorId: string, credential: ConnectorCredentialInput): void {
    this.setConnectorCredentialBundle(connectorId, credential);
  }

  /**
   * Persist a connector credential and its encrypted companion values with one
   * vault-file replacement. This prevents a multi-field credential (for
   * example Jira token + email + site origin) from being partially updated.
   */
  setConnectorCredentialBundle(
    connectorId: string,
    credential: ConnectorCredentialInput,
    relatedSecrets: Readonly<Record<string, string>> = {},
  ): void {
    const secretEntries = Object.entries(relatedSecrets);
    if (secretEntries.some(([suffix]) => !/^[a-z][a-z0-9_]*$/.test(suffix))) {
      throw new TypeError('Invalid connector credential suffix');
    }

    const vault = this.readVault();
    const updatedAt = new Date().toISOString();
    vault[`connector:${connectorId}`] = {
      encrypted: this.encrypt(credential.value),
      metadata: {
        credentialType: credential.type,
        expiresAt: credential.expiresAt,
        scopes: credential.scopes,
      },
      updatedAt,
    };

    const refreshKey = `connector:${connectorId}:refresh`;
    if (credential.refreshToken) {
      vault[refreshKey] = {
        encrypted: this.encrypt(credential.refreshToken),
        updatedAt,
      };
    } else {
      delete vault[refreshKey];
    }

    for (const [suffix, value] of secretEntries) {
      vault[`connector:${connectorId}:${suffix}`] = {
        encrypted: this.encrypt(value),
        updatedAt,
      };
    }
    this.writeVault(vault);
  }

  /** Get a connector credential with typed metadata */
  getConnectorCredential(connectorId: string): {
    value: string;
    type: string;
    refreshToken?: string;
    expiresAt?: string;
    scopes?: string[];
    isExpired: boolean;
  } | null {
    const entry = this.get(`connector:${connectorId}`);
    if (!entry) return null;
    const expiresAt = entry.metadata?.expiresAt as string | undefined;
    // Retrieve refresh token from its own encrypted entry
    const refreshEntry = this.get(`connector:${connectorId}:refresh`);
    return {
      value: entry.value,
      type: (entry.metadata?.credentialType as string) ?? 'api_key',
      // Review Major #7: removed dead plaintext metadata fallback that contradicted
      // the "never in plaintext metadata" security contract from setConnectorCredential.
      refreshToken: refreshEntry?.value,
      expiresAt,
      scopes: entry.metadata?.scopes as string[] | undefined,
      isExpired: expiresAt ? new Date(expiresAt) < new Date() : false,
    };
  }

  /** Migrate plaintext providers from config.json to vault. Returns count migrated. */
  migrateFromConfig(config: { providers?: Record<string, { apiKey: string; models?: string[]; baseUrl?: string }> }): number {
    if (!config.providers) return 0;
    let migrated = 0;
    for (const [name, provider] of Object.entries(config.providers)) {
      if (provider.apiKey && !this.has(name)) {
        this.set(name, provider.apiKey, {
          models: provider.models,
          baseUrl: provider.baseUrl,
        });
        migrated++;
      }
    }
    return migrated;
  }
}
