/**
 * File Management API — /api/workspaces/:workspaceId/files/*
 *
 * Endpoints:
 *   GET  /list?path=/         — List directory contents
 *   POST /upload              — Upload file (multipart)
 *   GET  /download?path=/x    — Download file
 *   POST /mkdir               — Create directory
 *   POST /delete              — Delete file or directory
 *   POST /move                — Move/rename file or directory
 *   POST /copy                — Copy file or directory
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getStorageProvider, MAX_UPLOAD_SIZE } from '../storage/index.js';
import { lookup } from '../utils/mime.js';
import path from 'node:path';

interface WorkspaceParams { workspaceId: string }
interface PathQuery { path?: string }
interface PathBody { path: string }
interface MoveBody { from: string; to: string }

/** Resolve workspace and storage provider from request params */
function resolveWorkspace(server: FastifyInstance, workspaceId: string) {
  const dataDir = server.localConfig.dataDir;

  // Look up workspace metadata (storagePath, storageType)
  const wsMgr = server.workspaceManager;
  const wsMeta = wsMgr?.get(workspaceId);

  // Build workspace-like object for provider resolution
  const workspace = {
    id: workspaceId,
    storageType: (wsMeta?.storageType as 'virtual' | 'local' | 'team') ?? 'virtual',
    storagePath: wsMeta?.storagePath as string | undefined,
    storageConfig: wsMeta?.storageConfig as Record<string, unknown> | undefined,
  };

  const provider = getStorageProvider(workspace, dataDir);
  return { provider, workspace };
}

export async function fileRoutes(server: FastifyInstance) {
  const prefix = '/api/workspaces/:workspaceId/files';

  // ── List directory ───────────────────────────────────────────
  server.get<{ Params: WorkspaceParams; Querystring: PathQuery }>(
    `${prefix}/list`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const dirPath = request.query.path ?? '/';

      try {
        const { provider } = resolveWorkspace(server, workspaceId);
        const entries = await provider.list(dirPath);
        return entries;
      } catch (err: any) {
        if (err.message?.includes('Invalid path')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Failed to list files' });
      }
    },
  );

  // ── Upload file (multipart) ──────────────────────────────────
  server.post<{ Params: WorkspaceParams }>(
    `${prefix}/upload`,
    async (request, reply) => {
      const { workspaceId } = request.params;

      try {
        const { provider } = resolveWorkspace(server, workspaceId);

        // Parse multipart — Fastify doesn't have built-in multipart,
        // so we handle raw body for now
        const contentType = request.headers['content-type'] ?? '';

        if (contentType.includes('multipart/form-data')) {
          // Extract boundary
          const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
          if (!boundaryMatch) {
            return reply.status(400).send({ error: 'Missing multipart boundary' });
          }

          const rawBody = await getRawBody(request);
          if (rawBody.length > MAX_UPLOAD_SIZE) {
            return reply.status(413).send({ error: `File exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024}MB limit` });
          }

          const { filename, targetDir, fileData } = parseMultipart(rawBody, boundaryMatch[1]);

          if (!filename || !fileData) {
            return reply.status(400).send({ error: 'Missing file in upload' });
          }

          const targetPath = (targetDir ?? '/').replace(/\/$/, '') + '/' + filename;
          const entry = await provider.write(targetPath, fileData, lookup(filename));
          return reply.status(201).send(entry);
        }

        // Fallback: JSON body with base64 data
        const body = request.body as { path: string; name: string; data: string } | undefined;
        if (!body?.path || !body?.name || body?.data == null) {
          return reply.status(400).send({ error: 'Provide file, path via multipart or {path, name, data} as JSON' });
        }

        const fileData = Buffer.from(body.data, 'base64');
        if (fileData.length > MAX_UPLOAD_SIZE) {
          return reply.status(413).send({ error: `File exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024}MB limit` });
        }

        const targetPath = body.path.replace(/\/$/, '') + '/' + body.name;
        const entry = await provider.write(targetPath, fileData, lookup(body.name));
        return reply.status(201).send(entry);
      } catch (err: any) {
        if (err.message?.includes('Invalid path')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Upload failed' });
      }
    },
  );

  // ── Download file ────────────────────────────────────────────
  server.get<{ Params: WorkspaceParams; Querystring: PathQuery }>(
    `${prefix}/download`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const filePath = request.query.path;

      if (!filePath) {
        return reply.status(400).send({ error: 'path query parameter is required' });
      }

      try {
        const { provider } = resolveWorkspace(server, workspaceId);

        if (!await provider.exists(filePath)) {
          return reply.status(404).send({ error: 'File not found' });
        }

        const data = await provider.read(filePath);
        const filename = path.basename(filePath);
        const mime = lookup(filename);

        return reply
          .header('Content-Type', mime)
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .header('Content-Length', data.length)
          .send(data);
      } catch (err: any) {
        if (err.message?.includes('Invalid path')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Download failed' });
      }
    },
  );

  // ── Create directory ─────────────────────────────────────────
  server.post<{ Params: WorkspaceParams; Body: PathBody }>(
    `${prefix}/mkdir`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { path: dirPath } = request.body ?? {};

      if (!dirPath) {
        return reply.status(400).send({ error: 'path is required' });
      }

      try {
        const { provider } = resolveWorkspace(server, workspaceId);
        const entry = await provider.mkdir(dirPath);
        return reply.status(201).send(entry);
      } catch (err: any) {
        if (err.message?.includes('Invalid path')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Failed to create directory' });
      }
    },
  );

  // ── Delete file/directory ────────────────────────────────────
  server.post<{ Params: WorkspaceParams; Body: PathBody }>(
    `${prefix}/delete`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { path: targetPath } = request.body ?? {};

      if (!targetPath) {
        return reply.status(400).send({ error: 'path is required' });
      }

      try {
        const { provider } = resolveWorkspace(server, workspaceId);
        await provider.delete(targetPath);
        return reply.status(204).send();
      } catch (err: any) {
        if (err.message?.includes('Invalid path')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Delete failed' });
      }
    },
  );

  // ── Move / Rename ────────────────────────────────────────────
  server.post<{ Params: WorkspaceParams; Body: MoveBody }>(
    `${prefix}/move`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { from, to } = request.body ?? {};

      if (!from || !to) {
        return reply.status(400).send({ error: 'from and to are required' });
      }

      try {
        const { provider } = resolveWorkspace(server, workspaceId);
        const entry = await provider.move(from, to);
        return entry;
      } catch (err: any) {
        if (err.message?.includes('Invalid path') || err.message?.includes('not found')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Move failed' });
      }
    },
  );

  // ── Copy ─────────────────────────────────────────────────────
  server.post<{ Params: WorkspaceParams; Body: MoveBody }>(
    `${prefix}/copy`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { from, to } = request.body ?? {};

      if (!from || !to) {
        return reply.status(400).send({ error: 'from and to are required' });
      }

      try {
        const { provider } = resolveWorkspace(server, workspaceId);
        const entry = await provider.copy(from, to);
        return entry;
      } catch (err: any) {
        if (err.message?.includes('Invalid path') || err.message?.includes('not found')) {
          return reply.status(400).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message ?? 'Copy failed' });
      }
    },
  );
}

// ── Helpers ──────────────────────────────────────────────────────

/** Read raw request body as Buffer */
function getRawBody(request: FastifyRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.raw.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.raw.on('end', () => resolve(Buffer.concat(chunks)));
    request.raw.on('error', reject);
  });
}

/** Minimal multipart parser — extracts first file and path field */
function parseMultipart(body: Buffer, boundary: string): { filename?: string; targetDir?: string; fileData?: Buffer } {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts: Buffer[] = [];
  let start = 0;

  // Split by boundary
  while (true) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (start > 0) {
      parts.push(body.subarray(start, idx));
    }
    start = idx + boundaryBuf.length;
    // Skip \r\n after boundary
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
    // Check for terminating --
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
  }

  let filename: string | undefined;
  let targetDir: string | undefined;
  let fileData: Buffer | undefined;

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString('utf-8');
    const content = part.subarray(headerEnd + 4, part.length - 2); // strip trailing \r\n

    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const nameMatch = headers.match(/name="([^"]+)"/);

    if (filenameMatch) {
      filename = filenameMatch[1];
      fileData = Buffer.from(content);
    } else if (nameMatch?.[1] === 'path') {
      targetDir = content.toString('utf-8').trim();
    }
  }

  return { filename, targetDir, fileData };
}
