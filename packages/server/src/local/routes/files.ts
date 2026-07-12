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
import { FileIndexer } from '@waggle/core';

interface WorkspaceParams { workspaceId: string }
interface PathQuery { path?: string }
interface PathBody { path: string }
interface MoveBody { from: string; to: string }
interface CopyBody extends MoveBody { sourceWorkspaceId?: string }

/** Safely read `.message` off an unknown caught value. */
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Safely read a Node-style `.code` off an unknown caught value. */
function errCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

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

/**
 * Resolve (lazily) a FileIndexer for the given workspace's mind.
 * Returns null when the workspace mind is unavailable — indexing then becomes
 * a no-op rather than failing the upload. Indexing is a best-effort side
 * effect of file writes (L-20); user-facing file ops must not fail because
 * of it.
 */
function resolveIndexer(server: FastifyInstance, workspaceId: string): FileIndexer | null {
  try {
    const cache = server.mindCache;
    const mind = cache?.getOrOpen(workspaceId);
    return mind ? new FileIndexer(mind) : null;
  } catch {
    return null;
  }
}

function safeIndex(indexer: FileIndexer | null, op: () => void): void {
  if (!indexer) return;
  try {
    op();
  } catch {
    // Intentional: indexing is a side-effect. Failures are swallowed so a
    // bad frame insert doesn't break the user's file operation. Failures
    // here are rare (bad UTF-8, full disk, etc.) and recoverable by a
    // manual re-index in the future.
  }
}

export async function fileRoutes(server: FastifyInstance) {
  const prefix = '/api/workspaces/:workspaceId/files';

  server.addContentTypeParser(
    /^multipart\/form-data(?:;.*)?$/i,
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_SIZE },
    (_request, body, done) => {
      done(null, body);
    },
  );

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
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Failed to list files' });
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

          let rawBody: Buffer;
          try {
            // Enforce the size limit WHILE reading so an oversized upload can
            // never buffer into memory before the guard runs.
            rawBody = Buffer.isBuffer(request.body)
              ? request.body
              : await getRawBody(request, MAX_UPLOAD_SIZE);
          } catch (err: unknown) {
            if (errCode(err) === MAX_BODY_BYTES_EXCEEDED) {
              return reply.status(413).send({ error: `File exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024}MB limit` });
            }
            throw err;
          }

          const { filename, targetDir, fileData } = parseMultipart(rawBody, boundaryMatch[1]);

          if (!filename || !fileData) {
            return reply.status(400).send({ error: 'Missing file in upload' });
          }

          const targetPath = (targetDir ?? '/').replace(/\/$/, '') + '/' + filename;
          const entry = await provider.write(targetPath, fileData, lookup(filename));
          const indexer = resolveIndexer(server, workspaceId);
          safeIndex(indexer, () => indexer!.indexFile(targetPath, fileData, lookup(filename)));
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
        const indexer = resolveIndexer(server, workspaceId);
        safeIndex(indexer, () => indexer!.indexFile(targetPath, fileData, lookup(body.name)));
        return reply.status(201).send(entry);
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Upload failed' });
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
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Download failed' });
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
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Failed to create directory' });
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
        const indexer = resolveIndexer(server, workspaceId);
        safeIndex(indexer, () => indexer!.removeFile(targetPath));
        return reply.status(204).send();
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Delete failed' });
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
        const indexer = resolveIndexer(server, workspaceId);
        safeIndex(indexer, () => indexer!.moveFile(from, to));
        return entry;
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path') || message.includes('not found')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Move failed' });
      }
    },
  );

  // ── Copy ─────────────────────────────────────────────────────
  server.post<{ Params: WorkspaceParams; Body: CopyBody }>(
    `${prefix}/copy`,
    async (request, reply) => {
      const { workspaceId } = request.params;
      const { from, to, sourceWorkspaceId } = request.body ?? {};

      if (!from || !to) {
        return reply.status(400).send({ error: 'from and to are required' });
      }

      try {
        const { provider: targetProvider } = resolveWorkspace(server, workspaceId);
        const isCrossWorkspace = Boolean(sourceWorkspaceId && sourceWorkspaceId !== workspaceId);
        let entry: Awaited<ReturnType<typeof targetProvider.copy>>;
        if (isCrossWorkspace) {
          // Cross-provider copy intentionally accepts files only. Directory
          // trees have different semantics across local, virtual, and S3
          // storage, so the UI must not imply a portable recursive operation.
          const { provider: sourceProvider } = resolveWorkspace(server, sourceWorkspaceId!);
          const parentPath = from.slice(0, from.lastIndexOf('/')) || '/';
          const sourceName = from.slice(from.lastIndexOf('/') + 1);
          const sourceEntry = (await sourceProvider.list(parentPath)).find(candidate =>
            candidate.path === from || candidate.name === sourceName,
          );
          if (!sourceEntry) throw new Error(`Source not found: ${from}`);
          if (sourceEntry.type !== 'file') throw new Error('Cross-workspace copy supports files only');
          const data = await sourceProvider.read(from);
          entry = await targetProvider.write(to, data, lookup(to));
        } else {
          entry = await targetProvider.copy(from, to);
        }
        // Re-read the copied file and index it independently (the copy may be
        // read-only, paged across a provider, etc. — don't assume we already
        // have the bytes in memory).
        const indexer = resolveIndexer(server, workspaceId);
        if (indexer && entry.type === 'file' && FileIndexer.shouldIndex(to)) {
          try {
            const data = await targetProvider.read(to);
            safeIndex(indexer, () => indexer.indexFile(to, data, lookup(to)));
          } catch {
            // Provider might not support read after copy — skip silently.
          }
        }
        return entry;
      } catch (err: unknown) {
        const message = errMessage(err);
        if (message.includes('Invalid path') || message.includes('not found') || message.includes('files only')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(500).send({ error: message || 'Copy failed' });
      }
    },
  );
}

// ── Helpers ──────────────────────────────────────────────────────

/** Error code attached to the rejection when the body exceeds maxBytes. */
export const MAX_BODY_BYTES_EXCEEDED = 'MAX_BODY_BYTES_EXCEEDED';

/**
 * Read raw request body as Buffer, enforcing `maxBytes` WHILE reading.
 *
 * Guards in two places so a multi-GB upload can never buffer into memory:
 *   1. Content-Length header (when present) is rejected up front.
 *   2. The streamed byte count is tracked and the stream is destroyed the
 *      moment accumulated bytes exceed the limit.
 *
 * Rejects with an Error carrying `code === MAX_BODY_BYTES_EXCEEDED` when the
 * limit is breached, so the caller can map it to 413 Payload Too Large.
 */
export function getRawBody(request: FastifyRequest, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tooLarge = () => {
      const err = new Error(`Request body exceeds ${maxBytes} bytes`) as Error & { code?: string };
      err.code = MAX_BODY_BYTES_EXCEEDED;
      return err;
    };

    // 1. Up-front Content-Length guard — reject before reading any body.
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(tooLarge());
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const onData = (chunk: Buffer) => {
      if (settled) return;
      received += chunk.length;
      // 2. Streamed-byte guard — abort the stream instead of buffering more.
      if (received > maxBytes) {
        settled = true;
        request.raw.off('data', onData);
        request.raw.off('end', onEnd);
        request.raw.off('error', onError);
        // Tear down the socket so the client stops sending the oversized body.
        if (typeof request.raw.destroy === 'function') request.raw.destroy();
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const onError = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    request.raw.on('data', onData);
    request.raw.on('end', onEnd);
    request.raw.on('error', onError);
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
