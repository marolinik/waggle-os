import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { VaultStore } from '../src/vault.js';

const dir = process.env.WAGGLE_VAULT_TEST_DIR;
const systemRoot = process.env.SystemRoot;
if (!dir || !systemRoot) throw new Error('Missing Windows ACL probe environment');

const keyPath = path.join(dir, '.vault-key');
const createdKey = 'cd'.repeat(32);
fs.writeFileSync(keyPath, createdKey, { flag: 'wx' });

const icaclsPath = path.win32.join(systemRoot, 'System32', 'icacls.exe');
execFileSync(icaclsPath, [keyPath, '/grant', '*S-1-1-0:R'], { stdio: 'ignore' });

new VaultStore(dir);
if (fs.readFileSync(keyPath, 'utf-8') !== createdKey) {
  throw new Error('Vault key content changed during ACL remediation');
}

const encodedPath = Buffer.from(keyPath, 'utf-8').toString('base64');
const verifier = [
  "$ErrorActionPreference = 'Stop'",
  `$keyPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))`,
  '$acl = Get-Acl -LiteralPath $keyPath',
  '$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User',
  '$rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))',
  '$current = @($rules | Where-Object { $_.IdentityReference.Value -eq $sid.Value -and $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow })',
  '$full = [Security.AccessControl.FileSystemRights]::FullControl',
  '$hasFull = @($current | Where-Object { ($_.FileSystemRights -band $full) -eq $full }).Count -eq 1',
  'if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 1 -or -not $hasFull) { throw "Vault ACL is not exclusive" }',
].join('; ');
const powershellPath = path.win32.join(
  systemRoot,
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
const verifierEnv: NodeJS.ProcessEnv = { SystemRoot: systemRoot, WINDIR: systemRoot };
for (const name of ['TEMP', 'TMP', 'ComSpec', 'SystemDrive', 'PROCESSOR_ARCHITECTURE']) {
  const value = process.env[name];
  if (value) verifierEnv[name] = value;
}
execFileSync(
  powershellPath,
  [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(verifier, 'utf16le').toString('base64'),
  ],
  { stdio: ['ignore', 'ignore', 'pipe'], env: verifierEnv },
);
