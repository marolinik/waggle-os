import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceConfig } from '@waggle/core';

/**
 * Resolve the only directory an autonomous run may use. Configured workspace
 * roots are explicit user trust grants; request bodies are never consulted.
 */
export function resolveWorkspaceExecutionRoot(
  dataDir: string,
  workspace: WorkspaceConfig,
): string {
  const configured = workspace.directory || workspace.storagePath;
  if (configured) {
    if (!fs.existsSync(configured)) {
      throw new Error(`Configured workspace directory does not exist: ${configured}`);
    }
    const resolved = fs.realpathSync(configured);
    if (!fs.statSync(resolved).isDirectory()) {
      throw new Error(`Configured workspace path is not a directory: ${configured}`);
    }
    return resolved;
  }

  const workspaceBase = path.resolve(dataDir, 'workspaces', workspace.id);
  const managed = path.resolve(workspaceBase, 'files');
  const relative = path.relative(workspaceBase, managed);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Invalid managed workspace id: ${workspace.id}`);
  }
  fs.mkdirSync(managed, { recursive: true });
  return fs.realpathSync(managed);
}
