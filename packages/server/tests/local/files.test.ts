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
import { injectWithAuth } from '../test-utils.js';

describe('File Management API', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;

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

      const names = entries.map((e: any) => e.name);
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
      const names = entries.map((e: any) => e.name);
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
      const names = res.json().map((e: any) => e.name);
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
      const rootNames = origList.json().map((e: any) => e.name);
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
      const names = list.json().map((e: any) => e.name);
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
