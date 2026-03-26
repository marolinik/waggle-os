/**
 * Document Version Registry — track document versions within a workspace.
 *
 * Endpoints:
 *   GET    /api/workspaces/:id/documents                  — list all tracked documents
 *   POST   /api/workspaces/:id/documents                  — register a new document version
 *   GET    /api/workspaces/:id/documents/:name/versions    — list versions of a document
 *
 * Versions are stored in ~/.waggle/workspaces/{id}/documents.json.
 * Part of Wave 7 — Professional & Vertical Features.
 */

import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DocumentVersion {
  version: number;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export interface TrackedDocument {
  name: string;
  versions: DocumentVersion[];
}

interface DocumentsRegistry {
  documents: TrackedDocument[];
}

/** Resolve the documents.json path for a workspace. */
function documentsFilePath(workspaceId: string): string {
  return path.join(os.homedir(), '.waggle', 'workspaces', workspaceId, 'documents.json');
}

/** Read document registry from disk. Returns empty registry if file doesn't exist. */
function readRegistry(workspaceId: string): DocumentsRegistry {
  const filePath = documentsFilePath(workspaceId);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as DocumentsRegistry;
    }
  } catch {
    // Corrupted file — return empty
  }
  return { documents: [] };
}

/** Write document registry to disk. Creates directory if needed. */
function writeRegistry(workspaceId: string, registry: DocumentsRegistry): void {
  const filePath = documentsFilePath(workspaceId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2), 'utf-8');
}

export const documentRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/workspaces/:id/documents — list all tracked documents
  server.get<{
    Params: { id: string };
  }>('/api/workspaces/:id/documents', async (request) => {
    const { id } = request.params;
    const registry = readRegistry(id);
    return {
      documents: registry.documents.map(doc => ({
        name: doc.name,
        versionCount: doc.versions.length,
        latestVersion: doc.versions.length > 0 ? doc.versions[doc.versions.length - 1] : null,
      })),
    };
  });

  // POST /api/workspaces/:id/documents — register a new document version
  server.post<{
    Params: { id: string };
    Body: {
      name: string;
      path: string;
      sizeBytes?: number;
    };
  }>('/api/workspaces/:id/documents', async (request, reply) => {
    const { id } = request.params;
    const { name, path: docPath, sizeBytes } = request.body ?? {};

    if (!name || !docPath) {
      return reply.status(400).send({ error: 'name and path are required' });
    }

    const registry = readRegistry(id);
    let doc = registry.documents.find(d => d.name === name);

    if (!doc) {
      doc = { name, versions: [] };
      registry.documents.push(doc);
    }

    const nextVersion = doc.versions.length > 0
      ? doc.versions[doc.versions.length - 1].version + 1
      : 1;

    const version: DocumentVersion = {
      version: nextVersion,
      path: docPath,
      createdAt: new Date().toISOString(),
      sizeBytes: sizeBytes ?? 0,
    };

    doc.versions.push(version);
    writeRegistry(id, registry);

    return reply.status(201).send({ document: name, version });
  });

  // GET /api/workspaces/:id/documents/:name/versions — list versions of a document
  server.get<{
    Params: { id: string; name: string };
  }>('/api/workspaces/:id/documents/:name/versions', async (request, reply) => {
    const { id, name } = request.params;
    const registry = readRegistry(id);
    const doc = registry.documents.find(d => d.name === name);

    if (!doc) {
      return reply.status(404).send({ error: 'Document not found' });
    }

    return { name: doc.name, versions: doc.versions };
  });
};
