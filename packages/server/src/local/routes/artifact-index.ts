/**
 * Artifact index store (UX-Refactor Phase 2C, gap card S05 / gate A6).
 *
 * Per-workspace `artifacts.json` index under the configured data dir — the
 * A6-ratified backing store (NO new `.mind` table). Follows the `tasks.ts`
 * `readTasks(dataDir, workspaceId)` convention (path = `{dataDir}/workspaces/
 * {id}/artifacts.json`) rather than the older `documents.ts` `os.homedir()` hard
 * pin, so the path honours `localConfig.dataDir` and is trivially testable.
 *
 * An artifact is an EXPLICIT produced output (generated doc/deck/sheet/etc. or a
 * user-promoted file), not every ingested input — records land here only via
 * POST /api/artifacts. This module is per-workspace pure I/O + CRUD; the route
 * layer (`artifacts.ts`) owns the cross-workspace fan-out.
 */

import type { Artifact } from '@waggle/shared';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface ArtifactIndexFile {
  artifacts: Artifact[];
}

/** Resolve the artifacts.json path for a workspace (mirrors tasks.ts tasksPath). */
function artifactsFilePath(dataDir: string, workspaceId: string): string {
  return path.join(dataDir, 'workspaces', workspaceId, 'artifacts.json');
}

/** Read a workspace's artifact index. Empty index on a missing/corrupt file. */
export function readArtifactIndex(dataDir: string, workspaceId: string): Artifact[] {
  const filePath = artifactsFilePath(dataDir, workspaceId);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ArtifactIndexFile;
      return Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
    }
  } catch {
    // Corrupted file — degrade to empty rather than throw.
  }
  return [];
}

/** Write a workspace's artifact index, creating the directory tree if needed. */
function writeArtifactIndex(dataDir: string, workspaceId: string, artifacts: Artifact[]): void {
  const filePath = artifactsFilePath(dataDir, workspaceId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify({ artifacts }, null, 2), 'utf-8');
}

/** Fields a caller may supply when creating an artifact. id/createdAt/updatedAt
 *  are assigned here; `workspaceId` is fixed to the target workspace. */
export type NewArtifactInput = Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'workspaceId'>;

/** Append a new artifact record to a workspace index and return the saved row. */
export function addArtifact(dataDir: string, workspaceId: string, input: NewArtifactInput): Artifact {
  const now = new Date().toISOString();
  const record: Artifact = {
    ...input,
    id: `art_${randomUUID()}`,
    workspaceId,
    createdAt: now,
    updatedAt: now,
  };
  const artifacts = readArtifactIndex(dataDir, workspaceId);
  artifacts.push(record);
  writeArtifactIndex(dataDir, workspaceId, artifacts);
  return record;
}

/** Find one artifact by id within a single workspace index. */
export function getArtifactInWorkspace(
  dataDir: string, workspaceId: string, id: string,
): Artifact | undefined {
  return readArtifactIndex(dataDir, workspaceId).find((a) => a.id === id);
}

/** Apply a partial update to an artifact in a workspace index. Immutable fields
 *  (id/workspaceId/createdAt) are never overwritten; updatedAt is stamped.
 *  Returns the updated record, or undefined if the id is not present. */
export function patchArtifactInWorkspace(
  dataDir: string,
  workspaceId: string,
  id: string,
  patch: Partial<Artifact>,
): Artifact | undefined {
  const artifacts = readArtifactIndex(dataDir, workspaceId);
  const idx = artifacts.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  const existing = artifacts[idx];
  const updated: Artifact = {
    ...existing,
    ...patch,
    id: existing.id,
    workspaceId: existing.workspaceId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  artifacts[idx] = updated;
  writeArtifactIndex(dataDir, workspaceId, artifacts);
  return updated;
}

/** Remove an artifact from a workspace index (hard delete, A8). Returns whether
 *  a row was removed. The backing file (if any) is deleted by the route layer. */
export function deleteArtifactFromWorkspace(
  dataDir: string, workspaceId: string, id: string,
): boolean {
  const artifacts = readArtifactIndex(dataDir, workspaceId);
  const next = artifacts.filter((a) => a.id !== id);
  if (next.length === artifacts.length) return false;
  writeArtifactIndex(dataDir, workspaceId, next);
  return true;
}
