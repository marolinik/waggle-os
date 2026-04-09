/**
 * Presentation generation tool — create .pptx files from structured slides.
 *
 * Uses `pptxgenjs` for pure-JS PowerPoint generation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import PptxGenJS from 'pptxgenjs';
import type { ToolDefinition } from './tools.js';

function resolveSafe(workspace: string, filePath: string): string {
  const resolved = path.resolve(workspace, filePath);
  if (!resolved.startsWith(path.resolve(workspace))) {
    throw new Error(`Path resolves outside workspace: ${filePath}`);
  }
  return resolved;
}

interface SlideDef {
  title?: string;
  subtitle?: string;
  content?: string;
  bullets?: string[];
  layout?: 'title' | 'content' | 'two-column' | 'blank';
  notes?: string;
  table?: { headers: string[]; rows: string[][] };
}

// Hive DS colors for presentations
const COLORS = {
  bg: '08090C',
  text: 'F0EDE4',
  muted: '95A5A6',
  honey: 'E5A000',
  accent: 'A78BFA',
  surface: '131416',
};

export function createPresentationTools(workspace: string): ToolDefinition[] {
  return [
    {
      name: 'generate_pptx',
      description: [
        'Generate a PowerPoint presentation (.pptx) from structured slides.',
        'Provide slides as an array of { title?, subtitle?, content?, bullets?, layout?, notes?, table? }.',
        'Layouts: "title" (title slide), "content" (title+body), "two-column", "blank".',
        'Tables: { headers: string[], rows: string[][] }.',
        'Uses Hive DS brand colors (dark theme with honey accent).',
      ].join(' '),
      parameters: {
        type: 'object' as const,
        required: ['filePath', 'slides'],
        properties: {
          filePath: {
            type: 'string' as const,
            description: 'Output file path relative to workspace (e.g. "documents/deck.pptx")',
          },
          slides: {
            type: 'array' as const,
            description: 'Array of slide definitions',
            items: { type: 'object' as const },
          },
          title: { type: 'string' as const, description: 'Presentation title' },
          author: { type: 'string' as const, description: 'Author name' },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const filePath = args.filePath as string;
        const slides = args.slides as SlideDef[];
        const title = args.title as string | undefined;
        const author = args.author as string | undefined;

        if (!filePath?.endsWith('.pptx')) return 'Error: filePath must end with .pptx';
        if (!slides || slides.length === 0) return 'Error: at least one slide is required';

        try {
          const resolved = resolveSafe(workspace, filePath);
          const pres = new PptxGenJS();
          pres.layout = 'LAYOUT_WIDE';
          if (title) pres.title = title;
          if (author) pres.author = author;
          pres.company = 'Waggle OS';

          // Define master slide with Hive DS colors
          pres.defineSlideMaster({
            title: 'WAGGLE_MASTER',
            background: { color: COLORS.bg },
            objects: [
              {
                text: {
                  text: 'Waggle OS',
                  options: {
                    x: 0.3, y: '93%', w: 2, h: 0.3,
                    fontSize: 8, color: COLORS.muted,
                    fontFace: 'Arial',
                  },
                },
              },
            ],
          });

          for (const slideDef of slides) {
            const layout = slideDef.layout ?? 'content';
            const slide = pres.addSlide({ masterName: 'WAGGLE_MASTER' });

            if (layout === 'title') {
              // Title slide
              if (slideDef.title) {
                slide.addText(slideDef.title, {
                  x: 0.5, y: '35%', w: '90%', h: 1.2,
                  fontSize: 36, color: COLORS.honey,
                  fontFace: 'Arial', bold: true,
                  align: 'center',
                });
              }
              if (slideDef.subtitle) {
                slide.addText(slideDef.subtitle, {
                  x: 0.5, y: '55%', w: '90%', h: 0.8,
                  fontSize: 18, color: COLORS.muted,
                  fontFace: 'Arial',
                  align: 'center',
                });
              }
            } else {
              // Content slide
              if (slideDef.title) {
                slide.addText(slideDef.title, {
                  x: 0.5, y: 0.3, w: '90%', h: 0.6,
                  fontSize: 24, color: COLORS.honey,
                  fontFace: 'Arial', bold: true,
                });
              }

              const contentY = slideDef.title ? 1.1 : 0.3;

              if (slideDef.content) {
                slide.addText(slideDef.content, {
                  x: 0.5, y: contentY, w: '90%', h: 4,
                  fontSize: 14, color: COLORS.text,
                  fontFace: 'Arial',
                  valign: 'top',
                });
              }

              if (slideDef.bullets && slideDef.bullets.length > 0) {
                const bulletText = slideDef.bullets.map(b => ({
                  text: b,
                  options: {
                    fontSize: 14,
                    color: COLORS.text,
                    fontFace: 'Arial',
                    bullet: { type: 'bullet' as const, color: COLORS.honey },
                    paraSpaceAfter: 6,
                  },
                }));
                slide.addText(bulletText, {
                  x: 0.5, y: contentY, w: '90%', h: 4,
                  valign: 'top',
                });
              }

              if (slideDef.table) {
                const tableData = [
                  slideDef.table.headers.map(h => ({ text: h, options: { bold: true, color: COLORS.honey, fontSize: 11 } })),
                  ...slideDef.table.rows.map(row =>
                    row.map(cell => ({ text: cell, options: { color: COLORS.text, fontSize: 10 } }))
                  ),
                ];
                slide.addTable(tableData, {
                  x: 0.5, y: contentY, w: '90%',
                  border: { type: 'solid', pt: 0.5, color: '333333' },
                  colW: Array(slideDef.table.headers.length).fill(12 / slideDef.table.headers.length),
                  autoPage: true,
                });
              }
            }

            if (slideDef.notes) {
              slide.addNotes(slideDef.notes);
            }
          }

          // Write file
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          const data = await pres.write({ outputType: 'nodebuffer' }) as Buffer;
          fs.writeFileSync(resolved, data);

          const stats = fs.statSync(resolved);
          const sizeKB = (stats.size / 1024).toFixed(1);

          return (
            `Successfully generated ${filePath} (${sizeKB} KB)\n` +
            `Slides: ${slides.length} (${slides.filter(s => s.layout === 'title').length} title, ` +
            `${slides.filter(s => s.table).length} with tables)\n` +
            `IMPORTANT: Describe the presentation content in your response.`
          );
        } catch (err: any) {
          return `Error generating presentation: ${err.message}`;
        }
      },
    },
  ];
}
