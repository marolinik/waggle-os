/**
 * Resolve which .mind file a hook event should write to.
 *
 * Resolution rules:
 *   1. If `<cwd>/.hive-mind/workspace.mind` exists, return per-project
 *      mode using that file.
 *   2. Else, walk up looking for `.hive-mind/workspace.mind` (project
 *      root marker).
 *   3. Else, fall back to global mode at `~/.hive-mind/global.mind`.
 *
 * The candidate path is constructed from controlled inputs (resolved
 * cwd + hardcoded `.hive-mind/workspace.mind`), so there is no path-
 * injection vector through this function. Defense-in-depth against
 * malicious symlinks pointing outside the workspace is the caller's
 * responsibility (e.g. via fs.realpath if the threat model requires).
 */

import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve as pathResolve } from 'node:path';

export type WorkspaceMode = 'global' | 'per-project';

export interface Workspace {
  path: string;
  cwd: string;
  mode: WorkspaceMode;
}

export interface ResolveOptions {
  /** Override $HOME for tests. */
  home?: string;
  /** Custom existence probe; defaults to fs.access. */
  exists?: (p: string) => Promise<boolean>;
  /** Whether to walk up the directory tree to find a project marker. Default true. */
  walkUp?: boolean;
}

const HIVE_DIR = '.hive-mind';
const PROJECT_DB = 'workspace.mind';
const GLOBAL_DB = 'global.mind';

async function defaultExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWorkspace(
  cwd?: string,
  opts: ResolveOptions = {},
): Promise<Workspace> {
  const startCwd = pathResolve(cwd ?? process.cwd());
  const home = opts.home ?? homedir();
  const exists = opts.exists ?? defaultExists;
  const walkUp = opts.walkUp ?? true;

  if (walkUp) {
    let dir = startCwd;
    while (true) {
      const candidate = join(dir, HIVE_DIR, PROJECT_DB);
      if (await exists(candidate)) {
        return { path: candidate, cwd: startCwd, mode: 'per-project' };
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } else {
    const candidate = join(startCwd, HIVE_DIR, PROJECT_DB);
    if (await exists(candidate)) {
      return { path: candidate, cwd: startCwd, mode: 'per-project' };
    }
  }

  const globalPath = join(home, HIVE_DIR, GLOBAL_DB);
  return { path: globalPath, cwd: startCwd, mode: 'global' };
}

export function isAbsoluteWorkspacePath(p: string): boolean {
  return isAbsolute(p);
}
