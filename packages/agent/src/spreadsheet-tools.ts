/**
 * Spreadsheet generation tool — create .xlsx files from structured data.
 *
 * Uses the `exceljs` library for pure-JS Excel generation.
 * Accepts JSON sheet definitions with rows, columns, and formatting.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import type { ToolDefinition } from './tools.js';

function resolveSafe(workspace: string, filePath: string): string {
  const resolved = path.resolve(workspace, filePath);
  if (!resolved.startsWith(path.resolve(workspace))) {
    throw new Error(`Path resolves outside workspace: ${filePath}`);
  }
  return resolved;
}

interface SheetDef {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
  headerStyle?: { bold?: boolean; fill?: string };
}

export function createSpreadsheetTools(workspace: string): ToolDefinition[] {
  return [
    {
      name: 'generate_xlsx',
      description: [
        'Generate an Excel spreadsheet (.xlsx) from structured data.',
        'Provide sheets as an array of { name, columns, rows }.',
        'Each column: { header, key, width? }. Each row: object keyed by column keys.',
        'Optionally set headerStyle: { bold, fill } for header formatting.',
        'The file is saved to the workspace documents/ directory.',
      ].join(' '),
      parameters: {
        type: 'object' as const,
        required: ['filePath', 'sheets'],
        properties: {
          filePath: {
            type: 'string' as const,
            description: 'Output file path relative to workspace (e.g. "documents/report.xlsx")',
          },
          sheets: {
            type: 'array' as const,
            description: 'Array of sheet definitions',
            items: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' as const, description: 'Sheet name' },
                columns: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      header: { type: 'string' as const },
                      key: { type: 'string' as const },
                      width: { type: 'number' as const },
                    },
                  },
                },
                rows: { type: 'array' as const, items: { type: 'object' as const } },
              },
            },
          },
          title: { type: 'string' as const, description: 'Workbook title (metadata)' },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const filePath = args.filePath as string;
        const sheets = args.sheets as SheetDef[];
        const title = args.title as string | undefined;

        if (!filePath?.endsWith('.xlsx')) return 'Error: filePath must end with .xlsx';
        if (!sheets || sheets.length === 0) return 'Error: at least one sheet is required';

        try {
          const resolved = resolveSafe(workspace, filePath);
          const workbook = new ExcelJS.Workbook();
          workbook.creator = 'Waggle OS';
          if (title) workbook.title = title;

          let totalRows = 0;

          for (const sheetDef of sheets) {
            const sheet = workbook.addWorksheet(sheetDef.name);

            // Set columns
            sheet.columns = sheetDef.columns.map(col => ({
              header: col.header,
              key: col.key,
              width: col.width ?? 15,
            }));

            // Style header row
            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true, size: 11 };
            headerRow.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF2D2D30' },
            };
            headerRow.font = { bold: true, color: { argb: 'FFE5A000' }, size: 11 };

            // Add data rows
            for (const row of sheetDef.rows) {
              sheet.addRow(row);
              totalRows++;
            }

            // Auto-filter on header
            if (sheetDef.rows.length > 0) {
              sheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: 1, column: sheetDef.columns.length },
              };
            }
          }

          // Write file
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          await workbook.xlsx.writeFile(resolved);

          const stats = fs.statSync(resolved);
          const sizeKB = (stats.size / 1024).toFixed(1);

          return (
            `Successfully generated ${filePath} (${sizeKB} KB)\n` +
            `Sheets: ${sheets.map(s => `${s.name} (${s.rows.length} rows)`).join(', ')}\n` +
            `Total: ${sheets.length} sheets, ${totalRows} data rows.\n` +
            `IMPORTANT: Describe the spreadsheet content in your response.`
          );
        } catch (err: any) {
          return `Error generating spreadsheet: ${err.message}`;
        }
      },
    },
  ];
}
