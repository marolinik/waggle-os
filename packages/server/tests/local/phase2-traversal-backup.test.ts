/**
 * Regression test for R1-005 — path traversal in the /api/restore loop.
 *
 * The restore loop in packages/server/src/local/routes/backup.ts validates each
 * manifest entry's target path before writing it to dataDir. The original guard
 *   if (!resolved.startsWith(path.resolve(dataDir))) { skip }
 * lacked a path-separator boundary, so a SIBLING directory whose name shares the
 * dataDir prefix (root '/data', resolved '/data-evil/x') passed the check and
 * escaped the root. It also wrote to a raw `targetPath` rather than the confirmed
 * `resolved` path.
 *
 * This test drives the real route via Fastify inject and proves:
 *   (a) a classic '../' traversal and a sibling-prefix escape are both rejected,
 *       and NO out-of-root file is written;
 *   (b) a normal in-root file IS restored.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as zlib from 'node:zlib';
import { backupRoutes } from '../../src/local/routes/backup.js';

const MAGIC_HEADER = 'WAGGLE-BACKUP-V1';
const IV_LENGTH = 16;

interface FileEntry {
  relativePath: string;
  content: string; // base64
  sizeBytes: number;
}

/** Build an unencrypted .waggle-backup archive (base64) the restore route accepts. */
function buildBackupBase64(files: FileEntry[]): string {
  const manifest = {
    version: 1 as const,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    files,
  };
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(manifest), 'utf-8'));
  const header = Buffer.from(MAGIC_HEADER, 'utf-8');
  const zeroIv = Buffer.alloc(IV_LENGTH, 0); // all-zero IV = unencrypted sentinel
  const zeroTag = Buffer.alloc(16, 0);
  return Buffer.concat([header, zeroIv, zeroTag, compressed]).toString('base64');
}

function entry(relativePath: string, text: string): FileEntry {
  const buf = Buffer.from(text, 'utf-8');
  return { relativePath, content: buf.toString('base64'), sizeBytes: buf.length };
}

describe('R1-005 — /api/restore path traversal guard', () => {
  let server: FastifyInstance;
  let rootBase: string;
  let dataDir: string;

  beforeEach(async () => {
    // dataDir is a child of rootBase so we can detect sibling-prefix escapes.
    rootBase = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-restore-'));
    dataDir = path.join(rootBase, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir } as never);
    await server.register(backupRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(rootBase, { recursive: true, force: true });
  });

  it('rejects a classic ../ traversal entry and writes nothing out of root', async () => {
    const backup = buildBackupBase64([entry('../evil.txt', 'pwned')]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/restore',
      payload: { backup },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.filesRestored).toBe(0);
    expect(json.errors).toBeDefined();
    expect(json.errors.some((e: string) => e.includes('path traversal'))).toBe(true);

    // The escaped file must NOT exist outside dataDir.
    expect(fs.existsSync(path.join(rootBase, 'evil.txt'))).toBe(false);
  });

  it('rejects a sibling-prefix escape (the bug the bare startsWith allowed)', async () => {
    // resolves to <rootBase>/data-evil/x.txt — shares the 'data' prefix but is
    // a sibling of dataDir, so the bare startsWith check would have let it pass.
    const backup = buildBackupBase64([entry('../data-evil/x.txt', 'sibling-escape')]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/restore',
      payload: { backup },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.filesRestored).toBe(0);
    expect(json.errors.some((e: string) => e.includes('path traversal'))).toBe(true);

    // Nothing must be written to the sibling-prefixed directory.
    expect(fs.existsSync(path.join(rootBase, 'data-evil'))).toBe(false);
    expect(fs.existsSync(path.join(rootBase, 'data-evil', 'x.txt'))).toBe(false);
  });

  it('restores a normal in-root file (valid path is NOT rejected)', async () => {
    const backup = buildBackupBase64([
      entry('notes.txt', 'hello'),
      entry('mind/personal.mind', 'sub-dir content'),
    ]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/restore',
      payload: { backup },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.filesRestored).toBe(2);
    expect(json.errors).toBeUndefined();

    // Files land inside dataDir with their content intact.
    expect(fs.readFileSync(path.join(dataDir, 'notes.txt'), 'utf-8')).toBe('hello');
    expect(fs.readFileSync(path.join(dataDir, 'mind', 'personal.mind'), 'utf-8')).toBe('sub-dir content');
  });
});
