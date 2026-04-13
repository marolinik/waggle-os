/**
 * PDF Source Adapter — extracts text from PDF files.
 *
 * Uses pdf-parse as an optional dependency.
 * If pdf-parse is not installed, provides a clear error message.
 *
 * Splits PDF text by pages, groups into ~3000 char chunks.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type { SourceAdapter, UniversalImportItem } from './types.js';

const MAX_CHUNK_LENGTH = 3000;

function chunkText(text: string, maxLen: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (current.length + trimmed.length + 2 > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? '\n\n' : '') + trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export class PdfAdapter implements SourceAdapter {
  readonly sourceType = 'pdf' as const;
  readonly displayName = 'PDF Document';

  parse(_input: unknown): UniversalImportItem[] {
    // Synchronous parse not supported for PDF — use parseFile()
    return [];
  }

  /** Parse a PDF file from a file path. */
  async parseFile(filePath: string): Promise<UniversalImportItem[]> {
    // Dynamic import — pdf-parse is optional
    let PDFParseClass: unknown;
    try {
      const mod = await import('pdf-parse');
      PDFParseClass = mod.PDFParse;
    } catch {
      throw new Error(
        'pdf-parse is not installed. Install it with: npm install pdf-parse\n'
        + 'Then retry the import.',
      );
    }

    if (typeof PDFParseClass !== 'function') {
      throw new Error('pdf-parse module found but PDFParse class not available.');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    // PDFParse constructor takes { data: Buffer|Uint8Array }
    const parser = new (PDFParseClass as new (opts: { data: Buffer }) => {
      load(): Promise<void>;
      getText(params?: object): Promise<{ text: string; pages: { text: string }[] }>;
      getInfo(params?: object): Promise<{ info: Record<string, string>; numPages: number }>;
      destroy(): Promise<void>;
    })({ data: buffer });

    await parser.load();

    const textResult = await parser.getText();
    let infoResult: { info: Record<string, string>; numPages: number } | undefined;
    try {
      infoResult = await parser.getInfo();
    } catch { /* info extraction is non-fatal */ }

    await parser.destroy();

    const fullText = textResult.text ?? '';
    if (fullText.trim().length < 10) {
      return [];
    }

    const info = infoResult?.info ?? {};
    const numPages = infoResult?.numPages ?? 0;
    const docTitle = info['Title']
      ?? filePath.split(/[\\/]/).pop()?.replace('.pdf', '')
      ?? 'PDF Document';

    const chunks = chunkText(fullText, MAX_CHUNK_LENGTH);

    return chunks.map((chunk, i) => ({
      id: randomUUID(),
      source: 'pdf' as const,
      type: 'document' as const,
      title: chunks.length > 1 ? `${docTitle} (part ${i + 1})` : docTitle,
      content: chunk.slice(0, 4000),
      timestamp: new Date().toISOString(),
      metadata: {
        filePath,
        contentType: 'paper' as const,
        pages: numPages,
        ...(info['Author'] && { author: info['Author'] }),
        part: i + 1,
        totalParts: chunks.length,
      },
    }));
  }
}
