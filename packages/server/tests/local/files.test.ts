/**
 * File Management API Tests
 *
 * Tests the /api/workspaces/:workspaceId/files/* endpoints
 * for virtual storage mode (filesystem-backed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import type { FileEntry } from '../../src/local/storage/types.js';
import { injectWithAuth } from '../test-utils.js';

describe('File Management API', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;
  let targetWorkspaceId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-files-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('files-test');
    frames.createIFrame(s1.gop_id, 'File management test', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });

    // Create a test workspace
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'File Test Workspace', group: 'Test' },
    });
    workspaceId = res.json().id;

    const targetRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Cross-workspace Target', group: 'Test' },
    });
    targetWorkspaceId = targetRes.json().id;
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const prefix = () => `/api/workspaces/${workspaceId}/files`;

  // ── List ─────────────────────────────────────────────────────

  describe('GET /list', () => {
    it('lists root directory with standard dirs', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/`,
      });
      expect(res.statusCode).toBe(200);
      const entries = res.json();
      expect(Array.isArray(entries)).toBe(true);

      const names = entries.map((e: FileEntry) => e.name);
      expect(names).toContain('attachments');
      expect(names).toContain('exports');
      expect(names).toContain('notes');
    });

    it('returns empty array for non-existent subdirectory', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/nonexistent`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('rejects path traversal', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/../../../etc`,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Invalid path');
    });
  });

  // ── Upload ───────────────────────────────────────────────────

  describe('POST /upload', () => {
    it('uploads a file via JSON base64', async () => {
      const content = 'Hello, Waggle!';
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/upload`,
        payload: {
          path: '/attachments',
          name: 'hello.txt',
          data: Buffer.from(content).toString('base64'),
        },
      });
      expect(res.statusCode).toBe(201);
      const entry = res.json();
      expect(entry.name).toBe('hello.txt');
      expect(entry.path).toBe('/attachments/hello.txt');
      expect(entry.type).toBe('file');
      expect(entry.size).toBe(content.length);
      expect(entry.mimeType).toBe('text/plain');
    });

    it('uploaded file appears in list', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/attachments`,
      });
      const entries = res.json();
      const names = entries.map((e: FileEntry) => e.name);
      expect(names).toContain('hello.txt');
    });

    it('accepts empty file upload (0 bytes)', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/upload`,
        payload: { path: '/', name: 'empty.bin', data: '' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().size).toBe(0);
    });
  });

  // ── Download ─────────────────────────────────────────────────

  describe('GET /download', () => {
    it('downloads an uploaded file', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download?path=/attachments/hello.txt`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('Hello, Waggle!');
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('returns 404 for non-existent file', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download?path=/nonexistent.txt`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when path is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download`,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Mkdir ────────────────────────────────────────────────────

  describe('POST /mkdir', () => {
    it('creates a new directory', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/mkdir`,
        payload: { path: '/attachments/screenshots' },
      });
      expect(res.statusCode).toBe(201);
      const entry = res.json();
      expect(entry.name).toBe('screenshots');
      expect(entry.path).toBe('/attachments/screenshots');
      expect(entry.type).toBe('directory');
    });

    it('created directory appears in list', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/attachments`,
      });
      const names = res.json().map((e: FileEntry) => e.name);
      expect(names).toContain('screenshots');
    });

    it('returns 400 when path is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/mkdir`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Move / Rename ────────────────────────────────────────────

  describe('POST /move', () => {
    it('moves a file to a different directory', async () => {
      // First upload a file
      await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/upload`,
        payload: {
          path: '/',
          name: 'moveme.txt',
          data: Buffer.from('move this').toString('base64'),
        },
      });

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/move`,
        payload: { from: '/moveme.txt', to: '/exports/moved.txt' },
      });
      expect(res.statusCode).toBe(200);
      const entry = res.json();
      expect(entry.name).toBe('moved.txt');
      expect(entry.path).toBe('/exports/moved.txt');

      // Original should be gone
      const origList = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/`,
      });
      const rootNames = origList.json().map((e: FileEntry) => e.name);
      expect(rootNames).not.toContain('moveme.txt');
    });

    it('renames a file within the same directory', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/move`,
        payload: { from: '/exports/moved.txt', to: '/exports/renamed.txt' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('renamed.txt');
    });

    it('returns 400 for non-existent source', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/move`,
        payload: { from: '/ghost.txt', to: '/exports/ghost.txt' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Copy ─────────────────────────────────────────────────────

  describe('POST /copy', () => {
    it('copies a file', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/copy`,
        payload: { from: '/exports/renamed.txt', to: '/notes/copy.txt' },
      });
      expect(res.statusCode).toBe(200);
      const entry = res.json();
      expect(entry.name).toBe('copy.txt');
      expect(entry.path).toBe('/notes/copy.txt');

      // Original should still exist
      const origRes = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download?path=/exports/renamed.txt`,
      });
      expect(origRes.statusCode).toBe(200);
    });

    it('copies a file from another workspace without reading from the target store', async () => {
      const source = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/upload`,
        payload: {
          path: '/exports',
          name: 'cross-workspace.txt',
          data: Buffer.from('kept in the source workspace').toString('base64'),
        },
      });
      expect(source.statusCode).toBe(201);

      const copied = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/workspaces/${targetWorkspaceId}/files/copy`,
        payload: {
          sourceWorkspaceId: workspaceId,
          from: '/exports/cross-workspace.txt',
          to: '/notes/cross-workspace.txt',
        },
      });
      expect(copied.statusCode).toBe(200);
      expect(copied.json()).toMatchObject({ name: 'cross-workspace.txt', path: '/notes/cross-workspace.txt', type: 'file' });

      const targetDownload = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/workspaces/${targetWorkspaceId}/files/download?path=/notes/cross-workspace.txt`,
      });
      expect(targetDownload.statusCode).toBe(200);
      expect(targetDownload.body).toBe('kept in the source workspace');

      const sourceDownload = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download?path=/exports/cross-workspace.txt`,
      });
      expect(sourceDownload.statusCode).toBe(200);
    });

    it('rejects cross-workspace directory copies explicitly', async () => {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/workspaces/${targetWorkspaceId}/files/copy`,
        payload: {
          sourceWorkspaceId: workspaceId,
          from: '/attachments',
          to: '/attachments',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('files only');
    });
  });

  // ── Delete ───────────────────────────────────────────────────

  describe('POST /delete', () => {
    it('deletes a file', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/delete`,
        payload: { path: '/notes/copy.txt' },
      });
      expect(res.statusCode).toBe(204);

      // Confirm it's gone
      const dl = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download?path=/notes/copy.txt`,
      });
      expect(dl.statusCode).toBe(404);
    });

    it('deletes a directory recursively', async () => {
      // Upload a file inside the screenshots dir
      await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/upload`,
        payload: {
          path: '/attachments/screenshots',
          name: 'screen1.png',
          data: Buffer.from('fakepng').toString('base64'),
        },
      });

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/delete`,
        payload: { path: '/attachments/screenshots' },
      });
      expect(res.statusCode).toBe(204);

      // Confirm directory is gone
      const list = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/list?path=/attachments`,
      });
      const names = list.json().map((e: FileEntry) => e.name);
      expect(names).not.toContain('screenshots');
    });

    it('returns 400 when path is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/delete`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Security ─────────────────────────────────────────────────

  describe('Path traversal prevention', () => {
    it('rejects .. in upload path', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/upload`,
        payload: {
          path: '/../../../tmp',
          name: 'evil.txt',
          data: Buffer.from('pwned').toString('base64'),
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects .. in download path', async () => {
      // Fastify URL-normalizes the path, so we encode the dots
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `${prefix()}/download?path=/../../../etc/passwd`,
      });
      // Fastify strips .. during URL parsing → becomes /etc/passwd → 404 (not found)
      // Either 400 (safePath catches it) or 404 (file doesn't exist) is acceptable
      expect([400, 404]).toContain(res.statusCode);
    });

    it('rejects .. in delete path', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/delete`,
        payload: { path: '/../../../tmp' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects .. in move source', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/move`,
        payload: { from: '/../../../etc/passwd', to: '/stolen.txt' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects .. in mkdir', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `${prefix()}/mkdir`,
        payload: { path: '/../../../tmp/evil' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('local workspace filesystem boundary', () => {
    it('blocks sensitive files and escaping junctions through the real API', async () => {
      const linkedRoot = path.join(tmpDir, 'linked-security-root');
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-files-api-outside-'));
      fs.mkdirSync(linkedRoot);
      fs.writeFileSync(path.join(linkedRoot, '.env'), 'TOKEN=secret');
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');

      try {
        try {
          fs.symlinkSync(outside, path.join(linkedRoot, 'escape'), 'junction');
        } catch {
          return;
        }

        const created = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/workspaces',
          payload: { name: 'Linked Security Workspace', group: 'Test', storageType: 'local', storagePath: linkedRoot },
        });
        expect(created.statusCode).toBe(201);
        const linkedWorkspaceId = created.json().id as string;
        // Persisted local workspaces can come from prior releases (and the
        // separate workspace-update finding); exercise the real files route.
        server.workspaceManager.update(linkedWorkspaceId, { storageType: 'local', storagePath: linkedRoot });
        const localPrefix = `/api/workspaces/${linkedWorkspaceId}/files`;

        const listed = await injectWithAuth(server, { method: 'GET', url: `${localPrefix}/list?path=/` });
        expect(listed.statusCode).toBe(200);
        expect(listed.json().map((entry: FileEntry) => entry.name)).not.toEqual(expect.arrayContaining(['.env', 'escape']));

        const secretDownload = await injectWithAuth(server, { method: 'GET', url: `${localPrefix}/download?path=/.env` });
        expect(secretDownload.statusCode).toBe(404);

        const secretUpload = await injectWithAuth(server, {
          method: 'POST',
          url: `${localPrefix}/upload`,
          payload: { path: '/', name: '.env', data: Buffer.from('overwrite').toString('base64') },
        });
        expect(secretUpload.statusCode).toBe(400);

        const escapeUpload = await injectWithAuth(server, {
          method: 'POST',
          url: `${localPrefix}/upload`,
          payload: { path: '/escape', name: 'new.txt', data: Buffer.from('outside').toString('base64') },
        });
        expect(escapeUpload.statusCode).toBe(400);
        expect(fs.existsSync(path.join(outside, 'new.txt'))).toBe(false);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});

// ── Storage Provider Unit Tests ────────────────────────────────

describe('FsStorageProvider', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-'));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('ensureStructure creates standard directories', async () => {
    const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
    const provider = new FsStorageProvider(tmpRoot);
    provider.ensureStructure();

    expect(fs.existsSync(path.join(tmpRoot, 'attachments'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'exports'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'notes'))).toBe(true);
  });

  it('write + read roundtrip', async () => {
    const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
    const provider = new FsStorageProvider(tmpRoot);

    const entry = await provider.write('/test.txt', Buffer.from('hello'));
    expect(entry.name).toBe('test.txt');
    expect(entry.size).toBe(5);

    const data = await provider.read('/test.txt');
    expect(data.toString()).toBe('hello');
  });

  it('exists returns correct values', async () => {
    const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
    const provider = new FsStorageProvider(tmpRoot);

    expect(await provider.exists('/test.txt')).toBe(true);
    expect(await provider.exists('/nope.txt')).toBe(false);
  });

  it('list returns sorted entries (dirs first)', async () => {
    const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
    const provider = new FsStorageProvider(tmpRoot);

    const entries = await provider.list('/');
    expect(entries.length).toBeGreaterThan(0);
    // First entries should be directories
    const firstDir = entries.findIndex(e => e.type === 'directory');
    const firstFile = entries.findIndex(e => e.type === 'file');
    if (firstDir >= 0 && firstFile >= 0) {
      expect(firstDir).toBeLessThan(firstFile);
    }
  });

  it('denies reads and deepest-existing writes through an escaping junction', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-outside-'));
    const link = path.join(root, 'escape');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');

    try {
      try {
        fs.symlinkSync(outside, link, 'junction');
      } catch {
        return;
      }

      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });

      await expect(provider.read('/escape/secret.txt')).rejects.toThrow(/symlink|workspace root/i);
      await expect(provider.write('/escape/new/deep/file.txt', Buffer.from('outside'))).rejects.toThrow(/symlink|workspace root/i);
      expect(fs.existsSync(path.join(outside, 'new', 'deep', 'file.txt'))).toBe(false);
      expect(await provider.exists('/escape/secret.txt')).toBe(false);
      await expect(provider.list('/escape')).rejects.toThrow(/symlink|workspace root/i);
      expect((await provider.list('/')).map(entry => entry.name)).not.toContain('escape');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('allows an in-root junction including a not-yet-created descendant', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-inroot-'));
    const real = path.join(root, 'real');
    const link = path.join(root, 'alias');
    fs.mkdirSync(real);

    try {
      try {
        fs.symlinkSync(real, link, 'junction');
      } catch {
        return;
      }

      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });
      await provider.write('/alias/new/deep/file.txt', Buffer.from('inside'));

      expect((await provider.read('/alias/new/deep/file.txt')).toString()).toBe('inside');
      expect(fs.readFileSync(path.join(real, 'new', 'deep', 'file.txt'), 'utf8')).toBe('inside');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a dangling junction before the filesystem operation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-dangling-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-dangling-outside-'));
    const link = path.join(root, 'dangling');

    try {
      try {
        fs.symlinkSync(outside, link, 'junction');
      } catch {
        return;
      }
      fs.rmSync(outside, { recursive: true, force: true });
      expect(fs.existsSync(link)).toBe(false);
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);

      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });
      await expect(provider.write('/dangling/new.txt', Buffer.from('outside'))).rejects.toThrow(/Invalid path/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('denies recursive copy when a nested junction escapes the root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-copy-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-copy-outside-'));
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');

    try {
      try {
        fs.symlinkSync(outside, path.join(source, 'escape'), 'junction');
      } catch {
        return;
      }

      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });

      await expect(provider.copy('/source', '/copied')).rejects.toThrow(/symlink|workspace root/i);
      expect(fs.existsSync(path.join(root, 'copied', 'escape', 'secret.txt'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('denies recursive merge-copy through a destination junction', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-dest-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-dest-outside-'));
    const sourceNested = path.join(root, 'source', 'nested');
    const destination = path.join(root, 'destination');
    fs.mkdirSync(sourceNested, { recursive: true });
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(sourceNested, 'payload.txt'), 'outside');

    try {
      try {
        fs.symlinkSync(outside, path.join(destination, 'nested'), 'junction');
      } catch {
        return;
      }

      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });
      await expect(provider.copy('/source', '/destination')).rejects.toThrow(/symlink|workspace root/i);
      expect(fs.existsSync(path.join(outside, 'payload.txt'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('denies sensitive operations and hides sensitive metadata for linked roots', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-sensitive-'));
    fs.writeFileSync(path.join(root, '.env'), 'TOKEN=secret');
    fs.writeFileSync(path.join(root, 'credentials.json'), '{}');
    fs.writeFileSync(path.join(root, 'README.md'), 'safe');

    try {
      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });

      await expect(provider.read('/.env')).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.write('/.ssh/authorized_keys', Buffer.from('key'))).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.delete('/credentials.json')).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.move('/README.md', '/.env')).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.copy('/README.md', '/credentials.json')).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.mkdir('/.aws')).rejects.toThrow(/sensitive file denied/i);
      expect(await provider.exists('/.env')).toBe(false);

      const names = (await provider.list('/')).map(entry => entry.name);
      expect(names).toContain('README.md');
      expect(names).not.toContain('.env');
      expect(names).not.toContain('credentials.json');
      expect(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8')).toBe('{}');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('denies recursive operations on directories containing sensitive files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-sensitive-tree-'));
    for (const name of ['copy-source', 'move-source', 'delete-source']) {
      fs.mkdirSync(path.join(root, name));
      fs.writeFileSync(path.join(root, name, '.env'), 'TOKEN=secret');
    }

    try {
      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root, { denySensitive: true });

      await expect(provider.copy('/copy-source', '/copy-target')).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.move('/move-source', '/move-target')).rejects.toThrow(/sensitive file denied/i);
      await expect(provider.delete('/delete-source')).rejects.toThrow(/sensitive file denied/i);
      expect(fs.existsSync(path.join(root, 'copy-target'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'move-source', '.env'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'delete-source', '.env'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves sensitive-looking files in app-managed roots', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fsprovider-managed-'));

    try {
      const { FsStorageProvider } = await import('../../src/local/storage/fs-provider.js');
      const provider = new FsStorageProvider(root);
      await provider.write('/.env', Buffer.from('documented workspace content'));

      expect((await provider.read('/.env')).toString()).toBe('documented workspace content');
      expect((await provider.list('/')).map(entry => entry.name)).toContain('.env');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('enables the sensitive deny only for local workspace storage', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-storage-policy-'));
    const linkedRoot = path.join(dataDir, 'linked');
    fs.mkdirSync(linkedRoot);
    fs.writeFileSync(path.join(linkedRoot, '.env'), 'TOKEN=secret');

    try {
      const { getStorageProvider } = await import('../../src/local/storage/index.js');
      const linked = getStorageProvider({ id: 'linked', storageType: 'local', storagePath: linkedRoot }, dataDir);
      const managed = getStorageProvider({ id: 'managed', storageType: 'virtual' }, dataDir);

      await expect(linked.read('/.env')).rejects.toThrow(/sensitive file denied/i);
      await managed.write('/.env', Buffer.from('managed workspace content'));
      expect((await managed.read('/.env')).toString()).toBe('managed workspace content');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('Path Security', () => {
  it('safePath rejects traversal', async () => {
    const { safePath } = await import('../../src/local/storage/security.js');
    expect(() => safePath('/root', '../etc/passwd')).toThrow('Invalid path');
    expect(() => safePath('/root', '../../etc')).toThrow('Invalid path');
    expect(() => safePath('/root', './../../etc')).toThrow('Invalid path');
  });

  it('safePath allows valid paths', async () => {
    const { safePath } = await import('../../src/local/storage/security.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-safe-'));
    fs.mkdirSync(path.join(tmpDir, 'subdir'), { recursive: true });

    const result = safePath(tmpDir, 'subdir');
    expect(result).toBe(path.resolve(tmpDir, 'subdir'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('toRelativePath converts correctly', async () => {
    const { toRelativePath } = await import('../../src/local/storage/security.js');
    const result = toRelativePath('/root/data', '/root/data/attachments/file.pdf');
    expect(result).toBe('/attachments/file.pdf');
  });
});
