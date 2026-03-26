import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isSafeSegment, assertSafeSegment } from '../src/local/routes/validate.js';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

describe('isSafeSegment', () => {
  it('accepts alphanumeric with hyphens and underscores', () => {
    expect(isSafeSegment('valid-id')).toBe(true);
    expect(isSafeSegment('workspace_123')).toBe(true);
    expect(isSafeSegment('abc')).toBe(true);
    expect(isSafeSegment('A-Z_0-9')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(isSafeSegment('../../etc/passwd')).toBe(false);
    expect(isSafeSegment('../secret')).toBe(false);
    expect(isSafeSegment('foo/bar')).toBe(false);
    expect(isSafeSegment('foo\\bar')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeSegment('')).toBe(false);
  });

  it('rejects strings with dots', () => {
    expect(isSafeSegment('foo.bar')).toBe(false);
    expect(isSafeSegment('...')).toBe(false);
  });

  it('rejects strings with spaces or special chars', () => {
    expect(isSafeSegment('foo bar')).toBe(false);
    expect(isSafeSegment('foo%00bar')).toBe(false);
  });
});

describe('assertSafeSegment', () => {
  it('does not throw for valid segments', () => {
    expect(() => assertSafeSegment('valid-id', 'test')).not.toThrow();
  });

  it('throws with statusCode 400 for invalid segments', () => {
    try {
      assertSafeSegment('../../etc/passwd', 'workspaceId');
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('Invalid workspaceId');
      expect(err.statusCode).toBe(400);
    }
  });
});

describe('Route path traversal protection', () => {
  let server: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-validate-'));
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ defaultModel: 'test/model', providers: {} }),
      'utf-8',
    );
    server = await buildLocalServer({ dataDir, port: 0 });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns 400 for workspace GET with traversal id', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces/..%2F..%2Fetc',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for workspace DELETE with traversal id', async () => {
    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: '/api/workspaces/..%2Fsecret',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for sessions list with traversal workspaceId', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces/..%2F..%2Fetc/sessions',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for session DELETE with traversal sessionId', async () => {
    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: '/api/sessions/..%2F..%2Fetc%2Fpasswd',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for session DELETE with traversal workspace query', async () => {
    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: '/api/sessions/valid-id?workspace=..%2F..%2Fetc',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for knowledge graph with traversal workspace query', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/graph?workspace=..%2F..%2Fetc',
    });
    expect(res.statusCode).toBe(400);
  });
});
