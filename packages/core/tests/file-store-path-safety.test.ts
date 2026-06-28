import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalFileStore, LinkedDirStore, isSensitiveFilePath } from '../src/file-store.js';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsguard-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('isSensitiveFilePath', () => {
  it('flags SSH/GPG/cloud secret directories and key basenames', () => {
    for (const p of ['.ssh/id_rsa', '.ssh/config', '.aws/credentials', '.gnupg/secring.gpg',
                     'id_rsa', 'id_ed25519', '.netrc', '.pgpass', '.git-credentials', 'credentials.json',
                     'project/nested/.ssh/known_hosts']) {
      expect(isSensitiveFilePath(p), p).toBe(true);
    }
  });
  it('flags dotenv files but NOT their checked-in templates', () => {
    expect(isSensitiveFilePath('.env')).toBe(true);
    expect(isSensitiveFilePath('config/.env.production')).toBe(true);
    expect(isSensitiveFilePath('.env.example')).toBe(false);
    expect(isSensitiveFilePath('.env.template')).toBe(false);
  });
  it('is case-insensitive and path-separator agnostic', () => {
    expect(isSensitiveFilePath('.SSH/ID_RSA')).toBe(true);
    expect(isSensitiveFilePath('.ssh\\id_rsa')).toBe(true);
  });
  it('does NOT flag ordinary files (incl. public keys)', () => {
    for (const p of ['', 'readme.md', 'src/index.ts', 'config.json', 'id_rsa.pub', '.environment', 'data/credentials-form.tsx']) {
      expect(isSensitiveFilePath(p), p).toBe(false);
    }
  });
  it('defeats Windows ADS + trailing dot/space normalization tricks', () => {
    for (const p of ['id_rsa::$DATA', '.env::$DATA', 'id_rsa.', '.env ', '.NPMRC ']) {
      expect(isSensitiveFilePath(p), p).toBe(true);
    }
  });
  it('flags backup copies of secrets but not ordinary backups', () => {
    expect(isSensitiveFilePath('credentials.bak')).toBe(true);
    expect(isSensitiveFilePath('id_rsa.old')).toBe(true);
    expect(isSensitiveFilePath('.npmrc.backup')).toBe(true);
    expect(isSensitiveFilePath('readme.bak')).toBe(false);
  });
  it('flags extended secret classes (pem keys, authorized_keys, cloud, terraform)', () => {
    for (const p of ['deploy/secret.pem', 'authorized_keys', 'known_hosts', '.azure/accessTokens.json',
                     '.terraform/x', 'service-account.json', 'terraform.tfstate', 'infra/terraform.tfstate.backup']) {
      expect(isSensitiveFilePath(p), p).toBe(true);
    }
  });
});

describe('resolveSafe containment (via LocalFileStore)', () => {
  const store = () => new LocalFileStore(tmp, 'ws1'); // root = tmp/workspaces/ws1/files

  it('reads/writes a normal in-root path', async () => {
    const s = store();
    await s.writeFile('notes/todo.txt', 'hi');
    expect((await s.readFile('notes/todo.txt')).toString()).toBe('hi');
  });

  it('denies a classic ../ escape', async () => {
    await expect(store().readFile('../../../etc/passwd')).rejects.toThrow(/traversal denied/i);
  });

  it('denies a SIBLING-prefix escape (the startsWith bug)', async () => {
    // root is .../ws1/files; this resolves to a sibling .../ws1/files-evil which a
    // bare startsWith(root) check WRONGLY admitted. Segment-boundary check rejects it.
    await expect(store().writeFile('../files-evil/loot.txt', 'x')).rejects.toThrow(/traversal denied/i);
  });
});

describe('LinkedDirStore sensitive-file deny (external folder)', () => {
  function seedLinked(): string {
    const dir = path.join(tmp, 'project');
    fs.mkdirSync(path.join(dir, '.ssh'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.aws'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ssh', 'id_rsa'), 'PRIVATE KEY');
    fs.writeFileSync(path.join(dir, '.aws', 'credentials'), '[default]\naws_secret=xxx');
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
    fs.writeFileSync(path.join(dir, '.env.example'), 'SECRET=');
    fs.writeFileSync(path.join(dir, 'README.md'), 'hello');
    fs.writeFileSync(path.join(dir, 'credentials.json'), '{"token":"x"}');
    fs.writeFileSync(path.join(dir, 'data.json'), '{"ok":true}');
    return dir;
  }

  it('denies reading SSH keys, cloud creds, and .env', async () => {
    const s = new LinkedDirStore(seedLinked());
    await expect(s.readFile('.ssh/id_rsa')).rejects.toThrow(/sensitive file denied/i);
    await expect(s.readFile('.aws/credentials')).rejects.toThrow(/sensitive file denied/i);
    await expect(s.readFile('.env')).rejects.toThrow(/sensitive file denied/i);
  });

  it('allows a normal file and the .env template', async () => {
    const s = new LinkedDirStore(seedLinked());
    expect((await s.readFile('README.md')).toString()).toBe('hello');
    expect((await s.readFile('.env.example')).toString()).toBe('SECRET=');
  });

  it('denies writing/clobbering and moving a secret file', async () => {
    const s = new LinkedDirStore(seedLinked());
    await expect(s.writeFile('.ssh/authorized_keys', 'attacker-key')).rejects.toThrow(/sensitive file denied/i);
    await expect(s.moveFile('README.md', '.env')).rejects.toThrow(/sensitive file denied/i);
  });

  it('searchFiles never discloses a non-dot secret (credentials.json)', async () => {
    const s = new LinkedDirStore(seedLinked());
    const names = (await s.searchFiles('*.json')).map(f => f.name);
    expect(names).toContain('data.json');
    expect(names).not.toContain('credentials.json');
  });

  it('listFiles hides non-dot secrets (credentials.json) but keeps normal files', async () => {
    const s = new LinkedDirStore(seedLinked());
    const names = (await s.listFiles()).map(f => f.name);
    expect(names).toContain('README.md');
    expect(names).not.toContain('credentials.json');
  });

  it('searchFiles cannot escape the root via a ../ glob pattern', async () => {
    const outside = path.join(tmp, 'outside'); fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'loot.txt'), 'x');
    const s = new LinkedDirStore(seedLinked());
    const results = await s.searchFiles('../**/*');
    expect(results.every(f => !f.path.includes('..'))).toBe(true);
    expect(results.map(f => f.name)).not.toContain('loot.txt');
  });

  it('still denies a ../ escape out of the linked root', async () => {
    const s = new LinkedDirStore(seedLinked());
    await expect(s.readFile('../../secret.txt')).rejects.toThrow(/traversal denied/i);
  });
});

describe('LinkedDirStore symlink containment (the CRITICAL escape)', () => {
  // Symlink creation can fail without privilege (esp. Windows file symlinks) — the
  // fix still applies; these tests self-skip when the env cannot create the link.
  function trySymlink(target: string, link: string, type: 'junction' | 'file' | 'dir'): boolean {
    try { fs.symlinkSync(target, link, type); return true; } catch { return false; }
  }

  it('denies reading through a junction/symlink that escapes the root', async () => {
    const outside = path.join(tmp, 'outside'); fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'TOPSECRET');
    const root = path.join(tmp, 'proj'); fs.mkdirSync(root, { recursive: true });
    if (!trySymlink(outside, path.join(root, 'escape'), 'junction')) return;
    const s = new LinkedDirStore(root);
    await expect(s.readFile('escape/secret.txt')).rejects.toThrow(/traversal denied/i);
  });

  it('still allows a symlink that stays inside the root (monorepo-style link)', async () => {
    const root = path.join(tmp, 'proj2'); fs.mkdirSync(path.join(root, 'real'), { recursive: true });
    fs.writeFileSync(path.join(root, 'real', 'data.txt'), 'OK');
    if (!trySymlink(path.join(root, 'real'), path.join(root, 'alias'), 'junction')) return;
    const s = new LinkedDirStore(root);
    expect((await s.readFile('alias/data.txt')).toString()).toBe('OK');
  });

  it('denies a symlink that launders an in-root secret past a benign name', async () => {
    const root = path.join(tmp, 'proj3'); fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
    if (!trySymlink(path.join(root, '.env'), path.join(root, 'notes'), 'file')) return;
    const s = new LinkedDirStore(root);
    await expect(s.readFile('notes')).rejects.toThrow(/sensitive file denied/i);
  });
});

describe('LocalFileStore is sandboxed — no sensitive-file deny', () => {
  it('allows a .env in the virtual workspace (the agent\'s own scratch)', async () => {
    const s = new LocalFileStore(tmp, 'ws2');
    await s.writeFile('.env', 'LOCAL=1');
    expect((await s.readFile('.env')).toString()).toBe('LOCAL=1');
  });
});
