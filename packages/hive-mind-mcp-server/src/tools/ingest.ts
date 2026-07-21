/**
 * Ingest tools — import documents, URLs, and files into the memory system.
 *
 * ingest_source: Universal ingestion tool that auto-detects content type
 * and routes through the appropriate adapter.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import {
  getFrameStore,
  getSessions,
  getSearch,
  getKnowledgeGraph,
  getHarvestSourceStore,
  getPersonalDb,
  getAdapter,
} from '../core/setup.js';
import { UrlAdapter } from '@waggle/hive-mind-core';
import type { PdfAdapter } from '@waggle/hive-mind-core';
import type { UniversalImportItem } from '@waggle/hive-mind-core';

const IMPORT_ROOT_ENV = 'HIVE_MIND_MCP_IMPORT_ROOT';
const SENSITIVE_DIRS = new Set([
  '.ssh', '.aws', '.gnupg', '.gpg', '.docker', '.kube', '.azure', '.terraform', '.terraform.d',
]);
const SENSITIVE_FILES = new Set([
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'authorized_keys', 'known_hosts',
  '.netrc', '.pgpass', '.npmrc', '.pypirc', '.git-credentials',
  'credentials', 'credentials.json', 'service-account.json',
  'terraform.tfstate', 'terraform.tfstate.backup',
]);
const SENSITIVE_EXTENSIONS = new Set(['.pem']);
const BACKUP_SUFFIX_RE = /\.(bak|old|backup|orig|copy|save|swp)$/i;
const SAFE_ENV_TEMPLATES = new Set([
  '.env.example', '.env.sample', '.env.template', '.env.dist', '.env.defaults',
]);

function normalizeSegment(segment: string): string {
  return segment.toLowerCase().replace(/::.*$/, '').replace(/[. ]+$/, '');
}

function isSensitiveBase(base: string): boolean {
  if (SENSITIVE_FILES.has(base)) return true;
  const dot = base.lastIndexOf('.');
  if (dot > 0 && SENSITIVE_EXTENSIONS.has(base.slice(dot))) return true;
  if (base === '.env' || base.startsWith('.env.')) return !SAFE_ENV_TEMPLATES.has(base);
  return false;
}

function isSensitivePath(candidate: string): boolean {
  const segments = candidate.replace(/\\/g, '/').split('/').map(normalizeSegment).filter(Boolean);
  if (segments.some((segment) => SENSITIVE_DIRS.has(segment))) return true;
  const base = segments.at(-1);
  if (!base) return false;
  if (isSensitiveBase(base)) return true;
  if (BACKUP_SUFFIX_RE.test(base) && isSensitiveBase(base.replace(BACKUP_SUFFIX_RE, ''))) return true;
  return false;
}

function isOutside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
}

function isCallerAbsolute(candidate: string): boolean {
  return path.isAbsolute(candidate)
    || path.win32.isAbsolute(candidate)
    || path.posix.isAbsolute(candidate)
    || /^[A-Za-z]:/.test(candidate);
}

/** Resolve one caller-supplied relative file under the explicitly configured import root. */
export function resolveImportFilePath(relativePath: string): string {
  const configuredRoot = process.env[IMPORT_ROOT_ENV]?.trim();
  if (!configuredRoot) {
    throw new Error(`Local file imports are disabled. Set ${IMPORT_ROOT_ENV} to an absolute directory.`);
  }
  if (!path.isAbsolute(configuredRoot)) {
    throw new Error(`${IMPORT_ROOT_ENV} must be an absolute directory.`);
  }
  if (!relativePath.trim() || relativePath.includes('\0')) {
    throw new Error('Import file_path must be a non-empty relative path.');
  }
  if (isCallerAbsolute(relativePath)) {
    throw new Error('Absolute import file paths are denied; provide a path relative to the configured import root.');
  }

  const segments = relativePath.replace(/\\/g, '/').split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '' || segment.includes(':'))) {
    throw new Error(`Import path traversal denied: ${relativePath}`);
  }
  if (isSensitivePath(relativePath)) {
    throw new Error(`Access to sensitive import file denied: ${relativePath}`);
  }

  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(configuredRoot);
  } catch {
    throw new Error(`Configured import root does not exist: ${configuredRoot}`);
  }
  if (!fs.statSync(realRoot).isDirectory()) {
    throw new Error(`Configured import root is not a directory: ${configuredRoot}`);
  }

  const lexicalTarget = path.resolve(realRoot, ...segments);
  if (isOutside(realRoot, lexicalTarget)) {
    throw new Error(`Import path resolves outside the configured root: ${relativePath}`);
  }

  let realTarget: string;
  try {
    realTarget = fs.realpathSync.native(lexicalTarget);
  } catch {
    throw new Error(`Import file does not exist: ${relativePath}`);
  }
  if (isOutside(realRoot, realTarget)) {
    throw new Error(`Import path resolves outside the configured root through a symlink: ${relativePath}`);
  }
  if (isSensitivePath(path.relative(realRoot, realTarget))) {
    throw new Error(`Access to sensitive import file denied: ${relativePath}`);
  }
  if (!fs.statSync(realTarget).isFile()) {
    throw new Error(`Import path is not a regular file: ${relativePath}`);
  }
  return realTarget;
}

export function registerIngestTools(server: McpServer): void {

  // ── ingest_source ──────────────────────────────────────────────
  server.tool(
    'ingest_source',
    'Ingest raw text, a web URL, or a file beneath the configured MCP import root. Raw content is never interpreted as a local path.',
    {
      content: z.string().optional()
        .describe('Raw text/markdown content or a web URL. Provide this OR file_path, not both'),
      file_path: z.string().optional()
        .describe(`Relative path beneath ${IMPORT_ROOT_ENV}. Provide this OR content, not both`),
      type_hint: z.enum(['markdown', 'plaintext', 'pdf', 'url', 'auto']).default('auto')
        .describe('Content type hint. "auto" detects from content (default)'),
      importance: z.enum(['critical', 'important', 'normal']).default('normal')
        .describe('Importance level for stored frames'),
      tags: z.array(z.string()).optional()
        .describe('Optional tags to attach as metadata'),
      workspace: z.string().optional()
        .describe('Workspace ID. Omit for personal mind'),
    },
    async ({ content, file_path, type_hint, importance, tags }) => {
      if ((content === undefined) === (file_path === undefined)) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: provide either "content" or "file_path", not both',
          }],
          isError: true,
        };
      }

      let input: string;
      try {
        input = file_path === undefined ? content! : resolveImportFilePath(file_path);
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error processing input: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }

      const detectedType = type_hint === 'auto'
        ? (file_path === undefined ? detectContentType(input) : detectFileContentType(file_path))
        : type_hint;

      if (file_path !== undefined && detectedType === 'url') {
        return {
          content: [{ type: 'text' as const, text: 'Error processing input: a local file_path cannot use the url type hint.' }],
          isError: true,
        };
      }
      if (file_path === undefined && detectedType === 'pdf') {
        return {
          content: [{ type: 'text' as const, text: 'Error processing input: PDF imports require file_path beneath the configured import root.' }],
          isError: true,
        };
      }

      let items: UniversalImportItem[];

      try {
        if (detectedType === 'url') {
          // URL requires async fetch
          const urlAdapter = new UrlAdapter();
          items = await urlAdapter.fetchAndParse(input);
        } else if (detectedType === 'pdf') {
          // PDF requires async parse
          const { PdfAdapter: PdfAdapterClass } = await import('@waggle/hive-mind-core');
          const pdfAdapter = new PdfAdapterClass() as PdfAdapter;
          items = await pdfAdapter.parseFile(input);
        } else {
          // Markdown, plaintext, or raw text — synchronous
          const adapter = getAdapter(detectedType);
          const adapterInput = file_path === undefined && input.length < 500 && !input.includes('\n')
            ? `${input}\n`
            : input;
          items = adapter.parse(adapterInput);
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error processing ${detectedType} content: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }

      if (items.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No content extracted from ${detectedType} input.`,
          }],
        };
      }

      // Store items as frames
      const frameStore = getFrameStore();
      const sessions = getSessions();
      const search = getSearch();
      const kg = getKnowledgeGraph();
      const harvestStore = getHarvestSourceStore();

      const sessionId = `ingest:${detectedType}:${new Date().toISOString().slice(0, 10)}`;
      sessions.ensure(sessionId, undefined, `Ingested ${detectedType} content`);

      let framesCreated = 0;
      let duplicatesSkipped = 0;
      let entitiesCreated = 0;

      // Record max frame id before the batch — see harvest.ts for rationale
      // (id-based dedup detection avoids the ISO-vs-space timestamp format
      // mismatch between JS Dates and SQLite datetime('now')).
      const rawDb = getPersonalDb().getDatabase();
      const maxBefore =
        (rawDb.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM memory_frames').get() as { m: number }).m;

      for (const item of items) {
        const frameContent = item.title
          ? `[${detectedType}] ${item.title}: ${item.content.slice(0, 3000)}`
          : `[${detectedType}] ${item.content.slice(0, 3000)}`;

        const frame = frameStore.createIFrame(
          sessionId,
          frameContent,
          importance,
          'import',
        );

        const isNew = frame.id > maxBefore;

        if (isNew) {
          framesCreated++;

          // Index for semantic search
          try {
            await search.indexFrame(frame.id, frameContent);
          } catch { /* non-fatal */ }

          // Extract entities from metadata
          const metaEntities = item.metadata?.entities;
          if (Array.isArray(metaEntities)) {
            for (const ent of metaEntities as { name: string; type: string }[]) {
              try {
                kg.createEntity(ent.type || 'concept', ent.name, {
                  source: detectedType,
                  ...(tags && { tags }),
                });
                entitiesCreated++;
              } catch { /* non-fatal */ }
            }
          }
        } else {
          duplicatesSkipped++;
        }
      }

      // Record in harvest source store
      const sourceKey = detectedType === 'url' ? 'unknown' : detectedType;
      harvestStore.upsert(
        sourceKey as Parameters<typeof harvestStore.upsert>[0],
        items[0]?.title ?? detectedType,
        input.startsWith('http') ? input : undefined,
      );
      harvestStore.recordSync(
        sourceKey as Parameters<typeof harvestStore.recordSync>[0],
        items.length,
        framesCreated,
      );

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            source_type: detectedType,
            items_parsed: items.length,
            frames_created: framesCreated,
            duplicates_skipped: duplicatesSkipped,
            entities_created: entitiesCreated,
            ...(tags && { tags }),
          }, null, 2),
        }],
      };
    },
  );
}

/** Detect content type from the input string. */
function detectContentType(input: string): 'markdown' | 'plaintext' | 'pdf' | 'url' {
  const trimmed = input.trim();

  // URL detection
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return 'url';
  }

  // Content-based detection
  if (trimmed.startsWith('#') || trimmed.includes('\n## ') || trimmed.includes('\n### ')) {
    return 'markdown';
  }

  return 'plaintext';
}

function detectFileContentType(filePath: string): 'markdown' | 'plaintext' | 'pdf' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return 'plaintext';
}
