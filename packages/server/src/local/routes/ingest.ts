/**
 * POST /api/ingest — file ingestion endpoint.
 *
 * Accepts JSON with base64-encoded file content. Detects type, extracts text
 * where possible, and returns processed results suitable for LLM messages.
 *
 * Supported file types:
 * - Images: png, jpg, jpeg, gif, webp, svg, bmp, ico, tiff
 * - Documents: pdf, docx, pptx
 * - Spreadsheets: xlsx, xls, csv
 * - Text/Code: md, txt, json, xml, yaml, yml, html, htm, css, scss, less,
 *   ts, js, jsx, tsx, py, rs, go, java, c, cpp, h, hpp, rb, php, sh, bat,
 *   sql, r, swift, kt, scala, lua, pl, toml, ini, cfg, conf, env, log,
 *   dockerfile, makefile, gitignore
 * - Archives: zip (lists contents)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import type { FastifyPluginAsync } from 'fastify';

// ── Types ───────────────────────────────────────────────────────────

interface IngestFileInput {
  name: string;
  /** Base64-encoded file content. */
  content: string;
}

interface IngestBody {
  files: IngestFileInput[];
  workspaceId?: string;
}

interface IngestFileResult {
  name: string;
  type: string;
  summary: string;
  content?: string;
}

// ── Extension → category mapping ────────────────────────────────────

type FileCategory = 'image' | 'document' | 'spreadsheet' | 'csv' | 'text' | 'archive' | 'unsupported';

const EXT_CATEGORY: Record<string, FileCategory> = {
  // Images
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  svg: 'image', bmp: 'image', ico: 'image', tiff: 'image', tif: 'image',
  // Documents
  pdf: 'document', docx: 'document', pptx: 'document',
  // Spreadsheets
  xlsx: 'spreadsheet', xls: 'spreadsheet',
  csv: 'csv',
  // Text / Code / Config
  md: 'text', txt: 'text', json: 'text', xml: 'text', yaml: 'text', yml: 'text',
  html: 'text', htm: 'text', css: 'text', scss: 'text', less: 'text',
  ts: 'text', js: 'text', jsx: 'text', tsx: 'text',
  py: 'text', rs: 'text', go: 'text', java: 'text',
  c: 'text', cpp: 'text', h: 'text', hpp: 'text',
  rb: 'text', php: 'text', sh: 'text', bat: 'text', ps1: 'text',
  sql: 'text', r: 'text', swift: 'text', kt: 'text', scala: 'text',
  lua: 'text', pl: 'text', dart: 'text', zig: 'text', v: 'text',
  toml: 'text', ini: 'text', cfg: 'text', conf: 'text', env: 'text',
  log: 'text', dockerfile: 'text', makefile: 'text', gitignore: 'text',
  // Archives
  zip: 'archive',
};

const MIME_FOR_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff', tif: 'image/tiff',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Helpers ─────────────────────────────────────────────────────────

function extOf(name: string): string {
  // Handle dotfiles and extensionless names
  const lower = name.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile' || lower === '.gitignore') return lower.replace('.', '');
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

function categoryOf(ext: string): FileCategory {
  return EXT_CATEGORY[ext] ?? 'unsupported';
}

/** Validate that a string is well-formed base64. */
function isValidBase64(str: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}

/**
 * Parse a single CSV line according to RFC 4180.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current.trim()); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── F2: File Registry ───────────────────────────────────────────────

export interface FileRegistryEntry {
  name: string;
  type: string;
  summary: string;
  sizeBytes: number;
  ingestedAt: string;
}

/** Read all file registry entries for a workspace. */
export function readFileRegistry(dataDir: string, workspaceId: string): FileRegistryEntry[] {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'files.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  const entries: FileRegistryEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch { /* skip malformed lines */ }
  }
  return entries;
}

/** Append a file entry to the workspace registry. */
function addToFileRegistry(dataDir: string, workspaceId: string, entry: FileRegistryEntry): void {
  const dir = path.join(dataDir, 'workspaces', workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'files.jsonl');
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

// ── File processors ─────────────────────────────────────────────────

function processImage(name: string, ext: string, b64: string): IngestFileResult {
  const mime = MIME_FOR_EXT[ext] ?? 'application/octet-stream';
  return {
    name,
    type: 'image',
    summary: `Image file (${ext.toUpperCase()})`,
    content: `data:${mime};base64,${b64}`,
  };
}

async function processPdf(name: string, b64: string): Promise<IngestFileResult> {
  try {
    // pdf-parse is a CJS module — use createRequire for ESM compat
    const require = createRequire(import.meta.url);
    const pdfParse = require('pdf-parse');
    const buffer = Buffer.from(b64, 'base64');
    const data = await pdfParse(buffer);
    const text = data.text?.trim() ?? '';
    const pageCount = data.numpages ?? 0;
    if (!text) {
      return { name, type: 'document', summary: `PDF — ${pageCount} pages (no extractable text, may be scanned/image-based)` };
    }
    return {
      name,
      type: 'document',
      summary: `PDF — ${pageCount} pages, ${text.length} chars extracted`,
      content: text,
    };
  } catch {
    return { name, type: 'document', summary: 'PDF document (extraction failed — may be corrupted or encrypted)' };
  }
}

async function processDocx(name: string, b64: string): Promise<IngestFileResult> {
  try {
    const require = createRequire(import.meta.url);
    const mammoth = require('mammoth');
    const buffer = Buffer.from(b64, 'base64');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() ?? '';
    if (!text) {
      return { name, type: 'document', summary: 'DOCX — empty or no extractable text' };
    }
    const lineCount = text.split('\n').filter((l: string) => l.trim()).length;
    return {
      name,
      type: 'document',
      summary: `DOCX — ${lineCount} paragraphs, ${text.length} chars`,
      content: text,
    };
  } catch {
    return { name, type: 'document', summary: 'DOCX document (extraction failed)' };
  }
}

async function processPptx(name: string, b64: string): Promise<IngestFileResult> {
  // PPTX is a ZIP containing XML slide files. Extract text from slide XMLs.
  try {
    // Use a simple ZIP approach — PPTX slides are in ppt/slides/slideN.xml
    const AdmZip = await tryLoadAdmZip();
    if (!AdmZip) {
      return { name, type: 'document', summary: 'PPTX presentation (install adm-zip for text extraction)' };
    }
    const buffer = Buffer.from(b64, 'base64');
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const slideTexts: string[] = [];
    for (const entry of entries) {
      if (entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/)) {
        const xml = entry.getData().toString('utf-8');
        // Extract text between <a:t> tags
        const texts = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g)?.map(
          (m: string) => m.replace(/<[^>]+>/g, '')
        ) ?? [];
        if (texts.length > 0) {
          slideTexts.push(texts.join(' '));
        }
      }
    }
    if (slideTexts.length === 0) {
      return { name, type: 'document', summary: 'PPTX — no extractable text' };
    }
    const text = slideTexts.map((t, i) => `--- Slide ${i + 1} ---\n${t}`).join('\n\n');
    return {
      name,
      type: 'document',
      summary: `PPTX — ${slideTexts.length} slides, ${text.length} chars`,
      content: text,
    };
  } catch {
    return { name, type: 'document', summary: 'PPTX presentation (extraction failed)' };
  }
}

/** Try to load adm-zip if available, otherwise return null */
async function tryLoadAdmZip(): Promise<any> {
  try {
    const require = createRequire(import.meta.url);
    return require('adm-zip');
  } catch {
    return null;
  }
}

async function processXlsx(name: string, b64: string): Promise<IngestFileResult> {
  try {
    const require = createRequire(import.meta.url);
    const ExcelJS = require('exceljs');
    const buffer = Buffer.from(b64, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheetTexts: string[] = [];
    for (const worksheet of workbook.worksheets) {
      const rows: string[] = [];
      worksheet.eachRow((row: any) => {
        const values = row.values as any[];
        // ExcelJS row.values is 1-indexed (index 0 is undefined), so slice from 1
        const cells = values.slice(1).map((v: any) => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v.result !== undefined) return String(v.result); // formula
          if (typeof v === 'object' && v.text !== undefined) return String(v.text); // rich text
          return String(v);
        });
        rows.push(cells.join(','));
      });
      const csv = rows.join('\n');
      if (csv.trim()) {
        sheetTexts.push(`--- Sheet: ${worksheet.name} ---\n${csv}`);
      }
    }
    if (sheetTexts.length === 0) {
      return { name, type: 'spreadsheet', summary: 'Spreadsheet — empty (no data)' };
    }
    const text = sheetTexts.join('\n\n');
    return {
      name,
      type: 'spreadsheet',
      summary: `Spreadsheet — ${workbook.worksheets.length} sheet(s), ${text.length} chars`,
      content: text,
    };
  } catch {
    return { name, type: 'spreadsheet', summary: 'Spreadsheet (extraction failed)' };
  }
}

function processCsv(name: string, b64: string): IngestFileResult {
  const text = Buffer.from(b64, 'base64').toString('utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const rowCount = Math.max(0, lines.length - 1);
  const headers = lines.length > 0 ? parseCsvLine(lines[0]) : [];
  return {
    name,
    type: 'csv',
    summary: `CSV — ${headers.length} columns, ${rowCount} rows`,
    content: text,
  };
}

function processText(name: string, ext: string, b64: string): IngestFileResult {
  const text = Buffer.from(b64, 'base64').toString('utf-8');
  const lines = text.split(/\r?\n/).filter((l, i, arr) => i < arr.length - 1 || l !== '');
  const lineCount = lines.length;
  return {
    name,
    type: 'text',
    summary: `${ext.toUpperCase()} file — ${lineCount} lines`,
    content: text,
  };
}

function processZip(name: string, b64: string): IngestFileResult {
  // List ZIP contents without full extraction
  try {
    const buffer = Buffer.from(b64, 'base64');
    // Read ZIP central directory for file listing
    // Minimal approach: look for local file headers (PK\x03\x04)
    const entries: string[] = [];
    let offset = 0;
    while (offset < buffer.length - 30) {
      if (buffer[offset] === 0x50 && buffer[offset + 1] === 0x4b &&
          buffer[offset + 2] === 0x03 && buffer[offset + 3] === 0x04) {
        const nameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileName = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf-8');
        entries.push(fileName);
        offset += 30 + nameLen + extraLen + compressedSize;
      } else {
        offset++;
      }
    }
    if (entries.length === 0) {
      return { name, type: 'archive', summary: 'ZIP archive (empty or unreadable)' };
    }
    const listing = entries.slice(0, 50).join('\n');
    const more = entries.length > 50 ? `\n... and ${entries.length - 50} more files` : '';
    return {
      name,
      type: 'archive',
      summary: `ZIP archive — ${entries.length} entries`,
      content: listing + more,
    };
  } catch {
    return { name, type: 'archive', summary: 'ZIP archive (listing failed)' };
  }
}

// ── Main router ─────────────────────────────────────────────────────

async function processFile(input: IngestFileInput): Promise<IngestFileResult> {
  const ext = extOf(input.name);
  const cat = categoryOf(ext);
  switch (cat) {
    case 'image': return processImage(input.name, ext, input.content);
    case 'document': {
      if (ext === 'pdf') return processPdf(input.name, input.content);
      if (ext === 'docx') return processDocx(input.name, input.content);
      if (ext === 'pptx') return processPptx(input.name, input.content);
      return { name: input.name, type: 'document', summary: `Document (.${ext}) — text extraction not available` };
    }
    case 'spreadsheet': return processXlsx(input.name, input.content);
    case 'csv': return processCsv(input.name, input.content);
    case 'text': return processText(input.name, ext, input.content);
    case 'archive': return processZip(input.name, input.content);
    default:
      return { name: input.name, type: 'unsupported', summary: `Unsupported file type (.${ext})` };
  }
}

// ── Route ───────────────────────────────────────────────────────────

export const ingestRoutes: FastifyPluginAsync = async (server) => {
  server.post<{ Body: IngestBody }>('/api/ingest', {
    config: {},
    bodyLimit: 15 * 1024 * 1024, // 15 MB to allow base64 overhead
  }, async (request, reply) => {
    const { files, workspaceId } = request.body ?? {};

    if (!files || !Array.isArray(files) || files.length === 0) {
      return reply.status(400).send({ error: 'files array is required' });
    }

    // Validate each file entry
    for (const f of files) {
      if (!f.name || typeof f.content !== 'string') {
        return reply.status(400).send({ error: `Invalid file entry: ${f.name ?? 'unnamed'}` });
      }
      if (!isValidBase64(f.content)) {
        return reply.status(400).send({ error: `Invalid base64 content for file: ${f.name}` });
      }
      const approxSize = Math.ceil(f.content.length * 0.75);
      if (approxSize > MAX_FILE_SIZE) {
        return reply.status(413).send({
          error: `File ${f.name} exceeds 10 MB limit`,
        });
      }
    }

    const results = await Promise.all(files.map(processFile));

    // F2: Write to workspace file registry
    if (workspaceId && workspaceId !== 'default') {
      try {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.type === 'unsupported') continue;
          const approxSize = Math.ceil(files[i].content.length * 0.75);
          addToFileRegistry(server.localConfig.dataDir, workspaceId, {
            name: result.name,
            type: result.type,
            summary: result.summary,
            sizeBytes: approxSize,
            ingestedAt: new Date().toISOString(),
          });
        }
      } catch { /* non-blocking */ }
    }

    // B1: Persist ingested file summaries to workspace memory so they survive across sessions
    if (workspaceId && workspaceId !== 'default') {
      try {
        server.agentState.activateWorkspaceMind(workspaceId);
        const { orchestrator } = server.agentState;
        for (const result of results) {
          if (result.type === 'unsupported' || !result.content) continue;
          // Save a memory frame with file name, type, and content summary
          const contentPreview = result.content.slice(0, 500);
          const memoryContent = `File ingested: ${result.name} (${result.summary})\n\nContent preview:\n${contentPreview}`;
          await orchestrator.autoSaveFromExchange(
            `User uploaded file: ${result.name}`,
            memoryContent,
          );
        }
      } catch {
        // Non-blocking — if memory save fails, the ingest still succeeds
      }
    }

    return { files: results };
  });
};
