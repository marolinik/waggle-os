/**
 * File preview utilities — icon mapping, language detection, diff computation.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  content?: string;
  language?: string;
  isImage?: boolean;
  imageUrl?: string;
  timestamp: string;
  action: 'read' | 'write' | 'edit';
}

export interface DiffEntry {
  path: string;
  name: string;
  oldContent: string;
  newContent: string;
  language?: string;
}

export type DiffViewMode = 'unified' | 'side-by-side';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: { old?: number; new?: number };
}

// ── Constants ───────────────────────────────────────────────────────

export const FILE_ICONS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  sql: 'database',
  sh: 'terminal',
  bash: 'terminal',
  zsh: 'terminal',
  bat: 'terminal',
  ps1: 'terminal',
  dockerfile: 'docker',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  ico: 'image',
  bmp: 'image',
};

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  bat: 'batch',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  txt: 'plaintext',
};

export const CODE_EXTENSIONS: Set<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
  'cs', 'rb', 'php', 'swift', 'kt', 'md', 'json', 'yaml', 'yml', 'toml',
  'xml', 'html', 'css', 'scss', 'less', 'sql', 'sh', 'bash', 'zsh', 'bat',
  'ps1', 'dockerfile', 'txt', 'vue', 'svelte',
]);

export const IMAGE_EXTENSIONS: Set<string> = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp',
]);

// ── Functions ───────────────────────────────────────────────────────

/** Maps file extension to icon identifier. */
export function getFileIcon(extension: string): string {
  return FILE_ICONS[extension.toLowerCase()] ?? 'file';
}

/** Maps file extension to language name for syntax highlighting. */
export function getLanguageFromExtension(extension: string): string {
  return LANGUAGE_MAP[extension.toLowerCase()] ?? 'plaintext';
}

/** Checks if extension is an image type. */
export function isImageFile(extension: string): boolean {
  return IMAGE_EXTENSIONS.has(extension.toLowerCase());
}

/** Checks if extension is a code file. */
export function isCodeFile(extension: string): boolean {
  return CODE_EXTENSIONS.has(extension.toLowerCase());
}

/** Extracts file extension from a path. */
export function getFileExtension(path: string): string {
  // Normalize path separators
  const normalized = path.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';
  if (!basename || !basename.includes('.')) return '';
  // Handle dotfiles like .gitignore — single-dot files have no extension
  const parts = basename.split('.');
  if (parts[0] === '' && parts.length === 2) return '';
  return parts[parts.length - 1];
}

/** Truncates long file paths, keeping the end visible. */
export function truncateFilePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path;
  const suffix = path.slice(-(maxLength - 3));
  return '...' + suffix;
}

/** Formats byte count as human-readable string. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Computes a unified diff between old and new content using LCS.
 */
export function computeUnifiedDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent === '' ? [] : oldContent.split('\n');
  const newLines = newContent === '' ? [] : newContent.split('\n');

  if (oldLines.length === 0 && newLines.length === 0) return [];

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        lineNumber: { old: i, new: j },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({
        type: 'added',
        content: newLines[j - 1],
        lineNumber: { new: j },
      });
      j--;
    } else {
      result.push({
        type: 'removed',
        content: oldLines[i - 1],
        lineNumber: { old: i },
      });
      i--;
    }
  }

  return result.reverse();
}
