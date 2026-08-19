import fs from 'node:fs';
import path from 'node:path';
import { isSensitiveFilePath } from '@waggle/core';

export interface SafePathOptions {
  denySensitive?: boolean;
}

export interface SafePathResolution {
  lexicalPath: string;
  operationPath: string;
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

/** Walk up to the deepest ancestor that exists so new descendants stay writable. */
function pathEntryExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function deepestExisting(target: string): string {
  let current = target;
  while (current !== path.dirname(current) && !pathEntryExists(current)) {
    current = path.dirname(current);
  }
  return current;
}

/**
 * Normalize and validate a user-supplied path to prevent path traversal attacks.
 * Returns both the lexical API path and the canonical path used for filesystem operations.
 * Throws if the path attempts to escape the root.
 */
export function resolveSafePath(
  root: string,
  userPath: string,
  options: SafePathOptions = {},
): SafePathResolution {
  // Normalize separators and remove leading/trailing slashes
  const cleaned = userPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');

  // Reject explicit traversal
  const segments = cleaned.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error(`Invalid path: "${userPath}" contains traversal segment`);
    }
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, cleaned);

  // Ensure resolved path is still within root
  if (!isWithin(resolvedRoot, resolved)) {
    throw new Error(`Invalid path: "${userPath}" escapes workspace root`);
  }

  // Node's filesystem APIs follow symlinks and Windows junctions. Validate the
  // deepest existing ancestor so a new file under an escaping link is denied too.
  let realRoot = resolvedRoot;
  let operationPath = resolved;
  if (pathEntryExists(resolvedRoot)) {
    try {
      realRoot = fs.realpathSync(resolvedRoot);
      const existingTarget = deepestExisting(resolved);
      const realTarget = fs.realpathSync(existingTarget);
      operationPath = path.resolve(realTarget, path.relative(existingTarget, resolved));
    } catch {
      throw new Error(`Invalid path: "${userPath}" contains an unresolved filesystem link`);
    }
    if (!isWithin(realRoot, operationPath)) {
      throw new Error(`Invalid path: "${userPath}" escapes workspace root through symlink`);
    }
  }

  if (options.denySensitive) {
    const lexicalRelative = path.relative(resolvedRoot, resolved);
    const realRelative = path.relative(realRoot, operationPath);
    if (isSensitiveFilePath(lexicalRelative) || isSensitiveFilePath(realRelative)) {
      throw new Error(`Invalid path: access to sensitive file denied: ${userPath}`);
    }
  }

  return { lexicalPath: resolved, operationPath };
}

export function safePath(root: string, userPath: string, options: SafePathOptions = {}): string {
  return resolveSafePath(root, userPath, options).lexicalPath;
}

/** Convert an absolute path back to a workspace-relative path (e.g., /attachments/file.pdf) */
export function toRelativePath(root: string, absolutePath: string): string {
  const rel = path.relative(root, absolutePath).replace(/\\/g, '/');
  return '/' + rel;
}
