import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileRoutes } from '../../src/local/routes/files.js';

describe('files upload multipart route', () => {
  let server: FastifyInstance;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'waggle-files-upload-'));
    server = Fastify({ logger: false });
    // Partial test doubles: the file routes read only the fields supplied here.
    server.decorate('localConfig', { dataDir } as never);
    server.decorate('workspaceManager', {
      get: () => ({ id: 'ws-upload', storageType: 'virtual' }),
    } as never);
    await server.register(fileRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('accepts browser multipart uploads and lists the new file', async () => {
    const boundary = '----waggle-upload-boundary';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n/\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="successful-upload.md"\r\nContent-Type: text/markdown\r\n\r\n# Successful upload\n\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const upload = await server.inject({
      method: 'POST',
      url: '/api/workspaces/ws-upload/files/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(payload.length),
      },
      payload,
    });

    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({
      name: 'successful-upload.md',
      path: '/successful-upload.md',
      type: 'file',
    });

    const list = await server.inject({
      method: 'GET',
      url: '/api/workspaces/ws-upload/files/list?path=%2F',
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toContainEqual(expect.objectContaining({
      name: 'successful-upload.md',
      path: '/successful-upload.md',
      type: 'file',
    }));
  });
});
