/**
 * Browse API — /api/browse
 *
 * System-level directory browsing (not workspace-scoped).
 * Used by the Create Workspace dialog to pick storage paths.
 *
 *   GET  /api/browse/local?path=/      — List local filesystem directories
 *   POST /api/browse/local/mkdir       — Create a directory on local filesystem
 */

import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import {
  listWindowsDrives,
  shouldListDrives,
  type BrowseEntry,
} from './browse-helpers.js';

export async function browseRoutes(server: FastifyInstance) {

  // ── List local directories ───────────────────────────────────
  server.get<{ Querystring: { path?: string } }>(
    '/api/browse/local',
    async (request, reply) => {
      const dirPath = request.query.path || '/';

      // P14: on Windows the abstract root '/' collapses to whichever
      // drive the sidecar's CWD is on, hiding the others. Return the
      // full drive list instead so the UI can navigate across drives.
      if (shouldListDrives(process.platform, dirPath)) {
        return { entries: listWindowsDrives(), current: '/' };
      }

      // Basic security: resolve and prevent listing sensitive system dirs
      const resolved = path.resolve(dirPath);

      try {
        if (!fs.existsSync(resolved)) {
          return reply.status(404).send({ error: 'Directory not found' });
        }

        const stat = fs.statSync(resolved);
        if (!stat.isDirectory()) {
          return reply.status(400).send({ error: 'Path is not a directory' });
        }

        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const result: BrowseEntry[] = [];

        for (const entry of entries) {
          // Only show directories, skip hidden files/dirs
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.')) continue;

          result.push({
            name: entry.name,
            path: path.join(resolved, entry.name),
            type: 'directory',
          });
        }

        result.sort((a, b) => a.name.localeCompare(b.name));

        return { entries: result, current: resolved };
      } catch (err: any) {
        if (err.code === 'EACCES') {
          return reply.status(403).send({ error: 'Permission denied' });
        }
        return reply.status(500).send({ error: err.message ?? 'Failed to browse directory' });
      }
    },
  );

  // ── Create directory on local filesystem ─────────────────────
  server.post<{ Body: { path: string } }>(
    '/api/browse/local/mkdir',
    async (request, reply) => {
      const { path: dirPath } = request.body ?? {};

      if (!dirPath) {
        return reply.status(400).send({ error: 'path is required' });
      }

      const resolved = path.resolve(dirPath);

      try {
        fs.mkdirSync(resolved, { recursive: true });
        const name = path.basename(resolved);
        return reply.status(201).send({
          name,
          path: resolved,
          type: 'directory',
        });
      } catch (err: any) {
        if (err.code === 'EACCES') {
          return reply.status(403).send({ error: 'Permission denied' });
        }
        return reply.status(500).send({ error: err.message ?? 'Failed to create directory' });
      }
    },
  );
}
