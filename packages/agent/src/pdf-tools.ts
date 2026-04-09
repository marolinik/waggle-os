/**
 * PDF generation tool — create .pdf files from structured content.
 *
 * Uses pdfmake for pure-JS PDF generation with markdown-like input.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces.js';
import type { ToolDefinition } from './tools.js';

function resolveSafe(workspace: string, filePath: string): string {
  const resolved = path.resolve(workspace, filePath);
  if (!resolved.startsWith(path.resolve(workspace))) {
    throw new Error(`Path resolves outside workspace: ${filePath}`);
  }
  return resolved;
}

/** Parse markdown-ish content into pdfmake content nodes. */
function parseContent(text: string): Content[] {
  const lines = text.split('\n');
  const content: Content[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      content.push({ text: '', margin: [0, 4, 0, 4] });
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.+)/);
    if (h1Match) {
      content.push({ text: h1Match[1], style: 'h1', margin: [0, 12, 0, 6] });
      continue;
    }
    const h2Match = trimmed.match(/^##\s+(.+)/);
    if (h2Match) {
      content.push({ text: h2Match[1], style: 'h2', margin: [0, 10, 0, 4] });
      continue;
    }
    const h3Match = trimmed.match(/^###\s+(.+)/);
    if (h3Match) {
      content.push({ text: h3Match[1], style: 'h3', margin: [0, 8, 0, 4] });
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      content.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#666666' }],
        margin: [0, 8, 0, 8],
      });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      content.push({
        text: trimmed.replace(/^[-*]\s+/, ''),
        style: 'body',
        margin: [15, 1, 0, 1],
      });
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      content.push({
        text: `${numMatch[1]}. ${numMatch[2]}`,
        style: 'body',
        margin: [15, 1, 0, 1],
      });
      continue;
    }

    const parts = parseInlineFormatting(trimmed);
    content.push({ text: parts, style: 'body', margin: [0, 1, 0, 1] });
  }

  return content;
}

function parseInlineFormatting(text: string): Array<{ text: string; bold?: boolean; italics?: boolean; font?: string }> {
  const parts: Array<{ text: string; bold?: boolean; italics?: boolean; font?: string }> = [];
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let m;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, m.index) });
    }
    if (m[2]) parts.push({ text: m[2], bold: true, italics: true });
    else if (m[3]) parts.push({ text: m[3], bold: true });
    else if (m[4]) parts.push({ text: m[4], italics: true });
    else if (m[5]) parts.push({ text: m[5], font: 'Courier' });
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ text }];
}

export function createPdfTools(workspace: string): ToolDefinition[] {
  return [
    {
      name: 'generate_pdf',
      description: [
        'Generate a PDF document from markdown-like content.',
        'Supports headings (#, ##, ###), bold, italic,',
        'code, bullet lists, numbered lists, and horizontal rules.',
        'Uses Hive DS brand styling with honey accent colors.',
      ].join(' '),
      parameters: {
        type: 'object' as const,
        required: ['filePath', 'content'],
        properties: {
          filePath: {
            type: 'string' as const,
            description: 'Output path relative to workspace (e.g. "documents/report.pdf")',
          },
          content: {
            type: 'string' as const,
            description: 'Markdown-like content for the PDF body',
          },
          title: { type: 'string' as const, description: 'Document title (shown on first page)' },
          author: { type: 'string' as const, description: 'Author name (metadata)' },
          headerText: { type: 'string' as const, description: 'Text shown in page header' },
          footerText: { type: 'string' as const, description: 'Text shown in page footer' },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const filePath = args.filePath as string;
        const contentStr = args.content as string;
        const title = args.title as string | undefined;
        const author = args.author as string | undefined;
        const headerText = args.headerText as string | undefined;
        const footerText = (args.footerText as string) ?? 'Waggle OS';

        if (!filePath?.endsWith('.pdf')) return 'Error: filePath must end with .pdf';
        if (!contentStr) return 'Error: content is required';

        try {
          const resolved = resolveSafe(workspace, filePath);
          const bodyContent = parseContent(contentStr);

          const titleContent: Content[] = title ? [
            { text: title, style: 'title', margin: [0, 80, 0, 10] },
            ...(author ? [{ text: `By ${author}`, style: 'subtitle', margin: [0, 0, 0, 40] } as Content] : []),
            {
              canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#E5A000' }],
              margin: [0, 0, 0, 20],
            },
          ] : [];

          const docDef: TDocumentDefinitions = {
            info: {
              title: title ?? 'Waggle Document',
              author: author ?? 'Waggle OS',
              creator: 'Waggle OS',
            },
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            header: headerText ? {
              text: headerText,
              alignment: 'right' as const,
              margin: [0, 20, 40, 0],
              fontSize: 8,
              color: '#95A5A6',
            } : undefined,
            footer: (currentPage: number, pageCount: number) => ({
              columns: [
                { text: footerText, fontSize: 8, color: '#95A5A6', margin: [40, 0, 0, 0] },
                { text: `${currentPage} / ${pageCount}`, alignment: 'right' as const, fontSize: 8, color: '#95A5A6', margin: [0, 0, 40, 0] },
              ],
            }),
            content: [...titleContent, ...bodyContent],
            styles: {
              title: { fontSize: 28, bold: true, color: '#E5A000' },
              subtitle: { fontSize: 14, color: '#95A5A6' },
              h1: { fontSize: 22, bold: true, color: '#E5A000' },
              h2: { fontSize: 16, bold: true, color: '#D4A017' },
              h3: { fontSize: 13, bold: true, color: '#C0C0C0' },
              body: { fontSize: 11, lineHeight: 1.4, color: '#333333' },
            },
            defaultStyle: { fontSize: 11 },
          };

          const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
          const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
          const printer = pdfMake.createPdf(docDef);

          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            printer.getBuffer((buffer: Buffer) => {
              if (buffer) resolve(buffer);
              else reject(new Error('PDF generation returned empty buffer'));
            });
          });

          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, pdfBuffer);

          const stats = fs.statSync(resolved);
          const sizeKB = (stats.size / 1024).toFixed(1);
          const lineCount = contentStr.split('\n').length;

          return (
            `Successfully generated ${filePath} (${sizeKB} KB)\n` +
            `Content: ${lineCount} lines of markdown parsed into PDF.\n` +
            `IMPORTANT: Describe the document content in your response.`
          );
        } catch (err: any) {
          return `Error generating PDF: ${err.message}`;
        }
      },
    },
  ];
}
