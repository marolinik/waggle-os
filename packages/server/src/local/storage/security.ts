import path from 'node:path';

/**
 * Normalize and validate a user-supplied path to prevent path traversal attacks.
 * Returns the safe, resolved subpath relative to the storage root.
 * Throws if the path attempts to escape the root.
 */
export function safePath(root: string, userPath: string): string {
  // Normalize separators and remove leading/trailing slashes
  const cleaned = userPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');

  // Reject explicit traversal
  const segments = cleaned.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error(`Invalid path: "${userPath}" contains traversal segment`);
    }
  }

  const resolved = path.resolve(root, cleaned);

  // Ensure resolved path is still within root
  const normalRoot = path.resolve(root) + path.sep;
  if (!resolved.startsWith(normalRoot) && resolved !== path.resolve(root)) {
    throw new Error(`Invalid path: "${userPath}" escapes workspace root`);
  }

  return resolved;
}

/** Convert an absolute path back to a workspace-relative path (e.g., /attachments/file.pdf) */
export function toRelativePath(root: string, absolutePath: string): string {
  const rel = path.relative(root, absolutePath).replace(/\\/g, '/');
  return '/' + rel;
}
