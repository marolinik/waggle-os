/**
 * Document generation tools — create .docx files from markdown/structured content.
 *
 * Uses the `docx` npm library for pure-JS Word document generation.
 * Parses markdown-like content into structured docx paragraphs.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
  Footer,
  Header,
  type IRunOptions,
} from 'docx';
import type { ToolDefinition } from './tools.js';

/**
 * Resolve a relative path within a workspace, rejecting traversal outside it.
 */
function resolveSafe(workspace: string, filePath: string): string {
  const resolved = path.resolve(workspace, filePath);
  if (!resolved.startsWith(path.resolve(workspace))) {
    throw new Error(`Path resolves outside workspace: ${filePath}`);
  }
  return resolved;
}

// ── Markdown-to-DOCX Parsing ─────────────────────────────────────────

interface ParsedBlock {
  type: 'heading' | 'paragraph' | 'bullet' | 'numbered' | 'table' | 'pagebreak' | 'hr';
  level?: number;
  text?: string;
  runs?: IRunOptions[];
  rows?: string[][];
}

/**
 * Parse inline formatting (bold, italic, code) into TextRun options.
 */
function parseInlineFormatting(text: string): IRunOptions[] {
  const runs: IRunOptions[] = [];
  // Match **bold**, *italic*, `code`, ***bold-italic***
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push({ text: match[2], bold: true, italics: true });
    } else if (match[3]) {
      runs.push({ text: match[3], bold: true });
    } else if (match[4]) {
      runs.push({ text: match[4], italics: true });
    } else if (match[5]) {
      runs.push({ text: match[5], font: 'Consolas', size: 20 });
    } else if (match[6]) {
      runs.push({ text: match[6] });
    }
  }

  return runs.length > 0 ? runs : [{ text }];
}

/**
 * Parse markdown content into structured blocks for docx generation.
 */
function parseMarkdown(content: string): ParsedBlock[] {
  const lines = content.split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Page break
    if (line.trim() === '---pagebreak---' || line.trim() === '\\pagebreak') {
      blocks.push({ type: 'pagebreak' });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headings (# to ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
        runs: parseInlineFormatting(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Table (| col1 | col2 |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i]
          .trim()
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim());
        // Skip separator rows (|---|---|)
        if (!row.every((cell) => /^[-:]+$/.test(cell))) {
          tableRows.push(row);
        }
        i++;
      }
      if (tableRows.length > 0) {
        blocks.push({ type: 'table', rows: tableRows });
      }
      continue;
    }

    // Bullet list (- or *)
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({
        type: 'bullet',
        text: bulletMatch[1],
        runs: parseInlineFormatting(bulletMatch[1]),
      });
      i++;
      continue;
    }

    // Numbered list (1. 2. etc.)
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)/);
    if (numberedMatch) {
      blocks.push({
        type: 'numbered',
        text: numberedMatch[1],
        runs: parseInlineFormatting(numberedMatch[1]),
      });
      i++;
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph — collect consecutive non-empty lines
    let paraText = line;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^\s*[-*]\s/) &&
      !lines[i].match(/^\s*\d+\.\s/) &&
      !lines[i].trim().startsWith('|')
    ) {
      paraText += ' ' + lines[i].trim();
      i++;
    }
    blocks.push({
      type: 'paragraph',
      text: paraText,
      runs: parseInlineFormatting(paraText),
    });
  }

  return blocks;
}

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/**
 * Convert parsed blocks to docx Paragraph/Table objects.
 */
function blocksToDocx(blocks: ParsedBlock[]): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        elements.push(
          new Paragraph({
            heading: HEADING_MAP[block.level ?? 1] ?? HeadingLevel.HEADING_1,
            children: (block.runs ?? []).map((r) => new TextRun(r)),
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }

      case 'paragraph': {
        elements.push(
          new Paragraph({
            children: (block.runs ?? []).map((r) => new TextRun(r)),
            spacing: { after: 120 },
          })
        );
        break;
      }

      case 'bullet': {
        elements.push(
          new Paragraph({
            children: (block.runs ?? []).map((r) => new TextRun(r)),
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
        break;
      }

      case 'numbered': {
        elements.push(
          new Paragraph({
            children: (block.runs ?? []).map((r) => new TextRun(r)),
            numbering: { reference: 'waggle-numbering', level: 0 },
            spacing: { after: 60 },
          })
        );
        break;
      }

      case 'table': {
        if (!block.rows || block.rows.length === 0) break;
        const isFirstHeader = block.rows.length > 1;
        const tableRows = block.rows.map(
          (row, rowIdx) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: parseInlineFormatting(cell).map(
                          (r) =>
                            new TextRun({
                              ...r,
                              bold: rowIdx === 0 && isFirstHeader ? true : r.bold,
                            })
                        ),
                      }),
                    ],
                    width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
                  })
              ),
            })
        );
        elements.push(
          new Table({
            rows: tableRows,
            width: { size: 9000, type: WidthType.DXA },
          })
        );
        elements.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      }

      case 'pagebreak': {
        elements.push(
          new Paragraph({
            children: [new PageBreak()],
          })
        );
        break;
      }

      case 'hr': {
        elements.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' },
            },
            spacing: { before: 200, after: 200 },
          })
        );
        break;
      }
    }
  }

  return elements;
}

// ── Tool Factory ─────────────────────────────────────────────────────

export function createDocumentTools(workspace: string): ToolDefinition[] {
  return [
    {
      name: 'generate_docx',
      description:
        'Generate a formatted Word document (.docx) from markdown content. ' +
        'Supports headings (#-######), **bold**, *italic*, `code`, bullet lists (- item), ' +
        'numbered lists (1. item), tables (| col |), horizontal rules (---), ' +
        'and page breaks (---pagebreak---). The document is saved to the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Output file path relative to workspace (e.g., "reports/market-analysis.docx")',
          },
          content: {
            type: 'string',
            description:
              'Document content in markdown format. Use # for headings, **bold**, *italic*, - for bullets, 1. for numbered lists, | for tables.',
          },
          title: {
            type: 'string',
            description: 'Document title (shown on title page and in metadata)',
          },
          author: {
            type: 'string',
            description: 'Document author (metadata)',
          },
          subject: {
            type: 'string',
            description: 'Document subject (metadata)',
          },
          include_toc: {
            type: 'boolean',
            description: 'Include a table of contents after the title (default: false)',
          },
          include_title_page: {
            type: 'boolean',
            description: 'Include a formatted title page (default: true if title is provided)',
          },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        try {
          const filePath = args.path as string;
          if (!filePath.endsWith('.docx')) {
            return 'Error: Output path must end with .docx';
          }

          const resolved = resolveSafe(workspace, filePath);
          const content = args.content as string;
          const title = args.title as string | undefined;
          const author = (args.author as string) ?? 'Waggle AI';
          const subject = args.subject as string | undefined;
          const includeToc = args.include_toc as boolean | undefined;
          const includeTitlePage = (args.include_title_page as boolean) ?? !!title;

          // Parse markdown content
          const blocks = parseMarkdown(content);
          const bodyElements = blocksToDocx(blocks);

          // Build sections
          const sections: any[] = [];

          // Title page section
          if (includeTitlePage && title) {
            sections.push({
              children: [
                new Paragraph({ spacing: { before: 3000 } }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: title,
                      bold: true,
                      size: 56,
                      color: '2E4057',
                    }),
                  ],
                  spacing: { after: 400 },
                }),
                ...(subject
                  ? [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: subject,
                            size: 28,
                            color: '666666',
                            italics: true,
                          }),
                        ],
                        spacing: { after: 600 },
                      }),
                    ]
                  : []),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `Prepared by ${author}`,
                      size: 24,
                      color: '999999',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: new Date().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }),
                      size: 22,
                      color: '999999',
                    }),
                  ],
                }),
              ],
            });
          }

          // TOC section
          if (includeToc) {
            sections.push({
              children: [
                new Paragraph({
                  heading: HeadingLevel.HEADING_1,
                  children: [new TextRun({ text: 'Table of Contents', bold: true })],
                }),
                new TableOfContents('Table of Contents', {
                  hyperlink: true,
                  headingStyleRange: '1-3',
                }),
              ],
            });
          }

          // Main content section
          sections.push({
            headers: title
              ? {
                  default: new Header({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({
                            text: title,
                            italics: true,
                            size: 18,
                            color: '999999',
                          }),
                        ],
                      }),
                    ],
                  }),
                }
              : undefined,
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: 'Generated by Waggle AI',
                        size: 16,
                        color: 'BBBBBB',
                      }),
                    ],
                  }),
                ],
              }),
            },
            children: bodyElements,
          });

          // Create document
          const doc = new Document({
            creator: author,
            title: title ?? 'Waggle Document',
            subject,
            description: `Generated by Waggle AI on ${new Date().toISOString()}`,
            numbering: {
              config: [
                {
                  reference: 'waggle-numbering',
                  levels: [
                    {
                      level: 0,
                      format: 'decimal' as any,
                      text: '%1.',
                      alignment: AlignmentType.START,
                    },
                  ],
                },
              ],
            },
            styles: {
              default: {
                document: {
                  run: {
                    font: 'Calibri',
                    size: 24,
                  },
                },
                heading1: {
                  run: {
                    font: 'Calibri',
                    size: 36,
                    bold: true,
                    color: '2E4057',
                  },
                  paragraph: {
                    spacing: { before: 360, after: 120 },
                  },
                },
                heading2: {
                  run: {
                    font: 'Calibri',
                    size: 30,
                    bold: true,
                    color: '3B5998',
                  },
                  paragraph: {
                    spacing: { before: 240, after: 100 },
                  },
                },
                heading3: {
                  run: {
                    font: 'Calibri',
                    size: 26,
                    bold: true,
                    color: '4A6FA5',
                  },
                  paragraph: {
                    spacing: { before: 200, after: 80 },
                  },
                },
              },
            },
            sections,
          });

          // Generate buffer and write to disk
          const buffer = await Packer.toBuffer(doc);
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, buffer);

          const stats = fs.statSync(resolved);
          const sizeKB = (stats.size / 1024).toFixed(1);

          // Include a content excerpt so the LLM can summarize what was generated
          const headings = blocks.filter((b) => b.type === 'heading').map(b => b.text ?? '').slice(0, 8);
          const firstParagraph = blocks.find(b => b.type === 'paragraph')?.text?.slice(0, 200) ?? '';
          const excerpt = headings.length > 0
            ? `Key sections: ${headings.join(', ')}. ${firstParagraph ? `Opening: "${firstParagraph}..."` : ''}`
            : firstParagraph ? `Content preview: "${firstParagraph}..."` : '';

          // Strip markdown formatting for a plain-text chat summary
          const strippedContent = content
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^\s*[-*]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/\|/g, '')
            .replace(/^[-:]+$/gm, '')
            .replace(/\n{2,}/g, ' ')
            .replace(/\n/g, ' ')
            .trim();
          const summary = strippedContent.slice(0, 250);

          // W7.5: Track document version in the registry (fire-and-forget)
          const docName = title ?? path.basename(filePath, '.docx');
          try {
            const port = process.env.WAGGLE_PORT ?? '3333';
            // Derive workspaceId from workspace path (last segment of the path)
            const wsSegments = workspace.replace(/\\/g, '/').split('/').filter(Boolean);
            const wsId = wsSegments[wsSegments.length - 1] ?? '';
            if (wsId) {
              fetch(`http://127.0.0.1:${port}/api/workspaces/${encodeURIComponent(wsId)}/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: docName, path: filePath, sizeBytes: stats.size }),
                signal: AbortSignal.timeout(3000),
              }).catch(() => { /* version tracking is best-effort */ });
            }
          } catch { /* version tracking is best-effort */ }

          return (
            `Successfully generated ${filePath} (${sizeKB} KB)\n` +
            `Structure: ${blocks.filter((b) => b.type === 'heading').length} headings, ` +
            `${blocks.filter((b) => b.type === 'paragraph').length} paragraphs, ` +
            `${blocks.filter((b) => b.type === 'table').length} tables, ` +
            `${blocks.filter((b) => b.type === 'bullet' || b.type === 'numbered').length} list items.\n` +
            `${excerpt}\n` +
            `Summary: ${summary}...\n` +
            `IMPORTANT: Provide a 2-3 sentence summary of the document content in your response to the user. Do NOT just say "Generating document..." — describe what was generated.`
          );
        } catch (err: any) {
          return `Error generating document: ${err.message}`;
        }
      },
    },
  ];
}
