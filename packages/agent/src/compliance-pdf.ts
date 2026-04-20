/**
 * Skills 2.0 gap H — boardroom-grade compliance report PDF.
 *
 * Consumes an AuditReport (from @waggle/core/compliance) and produces a
 * multi-page PDF styled with Waggle's Hive DS tokens (honey #E5A000).
 * The layout is designed for the KVARK sales pitch: readable at arm's
 * length, executive summary on page 1, detail tables on subsequent
 * pages, page numbers, metadata header.
 *
 * Sections:
 *   1. Cover — org name, risk level, report period, generated-at
 *   2. Executive Summary — compliance status + status badges
 *   3. Article status grid (Art 12/14/19/26/50)
 *   4. Model Inventory table
 *   5. Human Oversight Log table
 *   6. Harvest Provenance table
 *   7. Closing: totals + signature line
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuditReport, ComplianceStatus, ArticleStatus, AIActRiskLevel } from '@waggle/core';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';

/**
 * Optional template-sourced overrides (M-03). Applied over the workspace-derived
 * values so a single workspace can render under multiple branded templates without
 * mutating the underlying WorkspaceConfig. Logo is deferred to Bucket 2.
 */
export interface PdfTemplateOverrides {
  orgName?: string | null;
  footerText?: string | null;
  riskClassification?: AIActRiskLevel | null;
}

/** Hive DS color palette — match design-system conventions */
const HIVE_HONEY = '#E5A000';
const HIVE_DARK = '#08090C';
const HIVE_ACCENT = '#A78BFA';
const STATUS_COLORS: Record<ComplianceStatus['overall'], string> = {
  compliant: '#22A06B',
  warning: '#E5A000',
  'non-compliant': '#C4342F',
};

const ARTICLE_LABELS: Record<string, string> = {
  art12Logging: 'Art. 12 — Logging',
  art14Oversight: 'Art. 14 — Human Oversight',
  art19Retention: 'Art. 19 — Data Retention',
  art26Monitoring: 'Art. 26 — Risk Classification',
  art50Transparency: 'Art. 50 — Transparency',
};

function statusBadge(status: ArticleStatus['status']): Content {
  const color = status === 'compliant' ? STATUS_COLORS.compliant
    : status === 'warning' ? STATUS_COLORS.warning
    : STATUS_COLORS['non-compliant'];
  const label = status === 'compliant' ? 'COMPLIANT'
    : status === 'warning' ? 'WARNING'
    : 'NON-COMPLIANT';
  return { text: label, bold: true, color, fontSize: 9 };
}

function coverContent(report: AuditReport, overrides?: PdfTemplateOverrides): Content[] {
  const wsName = (overrides?.orgName && overrides.orgName.trim()) || report.workspace?.name || 'Personal Mind';
  const riskLevel = (overrides?.riskClassification ?? report.workspace?.riskLevel ?? 'minimal').toUpperCase();
  return [
    { text: 'AI ACT COMPLIANCE AUDIT', style: 'titleKicker', margin: [0, 120, 0, 6] },
    { text: wsName, style: 'title', margin: [0, 0, 0, 12] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 1.5, lineColor: HIVE_HONEY }], margin: [0, 0, 0, 24] },
    {
      columns: [
        [
          { text: 'Risk Level', style: 'metaLabel' },
          { text: riskLevel, style: 'metaValue', margin: [0, 2, 0, 12] },
          { text: 'Period', style: 'metaLabel' },
          { text: `${report.report.period.from.slice(0, 10)} → ${report.report.period.to.slice(0, 10)}`, style: 'metaValue', margin: [0, 2, 0, 12] },
        ],
        [
          { text: 'Overall Status', style: 'metaLabel' },
          { text: report.complianceStatus.overall.toUpperCase(), style: 'metaValue', color: STATUS_COLORS[report.complianceStatus.overall], margin: [0, 2, 0, 12] },
          { text: 'Generated', style: 'metaLabel' },
          { text: report.report.generatedAt.slice(0, 19).replace('T', ' ') + ' UTC', style: 'metaValue', margin: [0, 2, 0, 12] },
        ],
      ],
    },
    { text: '', pageBreak: 'after' },
  ];
}

function articleGrid(status: ComplianceStatus): Content {
  const rows: TableCell[][] = [
    [
      { text: 'Article', style: 'tableHead' },
      { text: 'Status', style: 'tableHead' },
      { text: 'Detail', style: 'tableHead' },
    ],
  ];
  for (const [key, label] of Object.entries(ARTICLE_LABELS)) {
    const article = (status as unknown as Record<string, ArticleStatus>)[key];
    if (!article) continue;
    rows.push([
      { text: label, bold: true, fontSize: 10 },
      statusBadge(article.status),
      { text: article.detail, fontSize: 9 },
    ]);
  }
  return {
    table: { headerRows: 1, widths: [150, 80, '*'], body: rows },
    layout: { hLineColor: () => '#E5E5E5', vLineColor: () => '#E5E5E5' },
    margin: [0, 0, 0, 20],
  };
}

function modelInventoryTable(report: AuditReport): Content {
  if (report.modelInventory.length === 0) {
    return { text: 'No model calls recorded in this period.', italics: true, color: '#6B6B6B', margin: [0, 0, 0, 16] };
  }
  const rows: TableCell[][] = [[
    { text: 'Model', style: 'tableHead' },
    { text: 'Provider', style: 'tableHead' },
    { text: 'Calls', style: 'tableHead', alignment: 'right' },
    { text: 'Input tok', style: 'tableHead', alignment: 'right' },
    { text: 'Output tok', style: 'tableHead', alignment: 'right' },
    { text: 'Cost (USD)', style: 'tableHead', alignment: 'right' },
  ]];
  let totalCalls = 0, totalIn = 0, totalOut = 0, totalCost = 0;
  for (const m of report.modelInventory) {
    totalCalls += m.calls;
    totalIn += m.inputTokens;
    totalOut += m.outputTokens;
    totalCost += m.costUsd;
    rows.push([
      { text: m.model, fontSize: 9 },
      { text: m.provider, fontSize: 9 },
      { text: m.calls.toLocaleString('en-US'), fontSize: 9, alignment: 'right' },
      { text: m.inputTokens.toLocaleString('en-US'), fontSize: 9, alignment: 'right' },
      { text: m.outputTokens.toLocaleString('en-US'), fontSize: 9, alignment: 'right' },
      { text: `$${m.costUsd.toFixed(4)}`, fontSize: 9, alignment: 'right' },
    ]);
  }
  rows.push([
    { text: 'TOTAL', bold: true, fontSize: 9, fillColor: '#FAFAFA' },
    { text: '', fillColor: '#FAFAFA' },
    { text: totalCalls.toLocaleString('en-US'), bold: true, fontSize: 9, alignment: 'right', fillColor: '#FAFAFA' },
    { text: totalIn.toLocaleString('en-US'), bold: true, fontSize: 9, alignment: 'right', fillColor: '#FAFAFA' },
    { text: totalOut.toLocaleString('en-US'), bold: true, fontSize: 9, alignment: 'right', fillColor: '#FAFAFA' },
    { text: `$${totalCost.toFixed(4)}`, bold: true, fontSize: 9, alignment: 'right', fillColor: '#FAFAFA' },
  ]);
  return {
    table: { headerRows: 1, widths: ['*', 70, 40, 60, 60, 60], body: rows },
    layout: { hLineColor: () => '#E5E5E5', vLineColor: () => '#E5E5E5' },
    margin: [0, 0, 0, 20],
  };
}

function oversightLogTable(report: AuditReport): Content {
  if (report.humanOversightLog.length === 0) {
    return { text: 'No human oversight events in this period.', italics: true, color: '#6B6B6B', margin: [0, 0, 0, 16] };
  }
  // Cap at 50 most recent events to keep the PDF tight; detail goes in JSON report
  const shown = report.humanOversightLog.slice(-50);
  const rows: TableCell[][] = [[
    { text: 'Timestamp', style: 'tableHead' },
    { text: 'Action', style: 'tableHead' },
    { text: 'Tool', style: 'tableHead' },
    { text: 'Detail', style: 'tableHead' },
  ]];
  for (const e of shown) {
    rows.push([
      { text: e.timestamp.slice(0, 19).replace('T', ' '), fontSize: 8 },
      { text: e.action, fontSize: 8, bold: true },
      { text: e.tool, fontSize: 8 },
      { text: e.detail.slice(0, 80), fontSize: 8 },
    ]);
  }
  const contents: Content[] = [{
    table: { headerRows: 1, widths: [95, 60, 80, '*'], body: rows },
    layout: { hLineColor: () => '#E5E5E5', vLineColor: () => '#E5E5E5' },
    margin: [0, 0, 0, 8],
  }];
  if (report.humanOversightLog.length > 50) {
    contents.push({
      text: `Showing last 50 of ${report.humanOversightLog.length} events. Full log in JSON report.`,
      fontSize: 8, italics: true, color: '#6B6B6B', margin: [0, 0, 0, 16],
    });
  }
  return contents;
}

function provenanceTable(report: AuditReport): Content {
  if (report.harvestProvenance.length === 0) {
    return { text: 'No harvest provenance data for this period.', italics: true, color: '#6B6B6B', margin: [0, 0, 0, 16] };
  }
  const rows: TableCell[][] = [[
    { text: 'Source', style: 'tableHead' },
    { text: 'Imported At', style: 'tableHead' },
    { text: 'Items', style: 'tableHead', alignment: 'right' },
    { text: 'Frames', style: 'tableHead', alignment: 'right' },
  ]];
  for (const p of report.harvestProvenance) {
    rows.push([
      { text: p.source, fontSize: 9 },
      { text: p.importedAt.slice(0, 19).replace('T', ' '), fontSize: 9 },
      { text: p.itemsImported.toLocaleString('en-US'), fontSize: 9, alignment: 'right' },
      { text: p.framesCreated.toLocaleString('en-US'), fontSize: 9, alignment: 'right' },
    ]);
  }
  return {
    table: { headerRows: 1, widths: ['*', 120, 60, 60], body: rows },
    layout: { hLineColor: () => '#E5E5E5', vLineColor: () => '#E5E5E5' },
    margin: [0, 0, 0, 20],
  };
}

/** Build the pdfmake document definition. Exported for unit-test introspection. */
export function buildComplianceDocDefinition(
  report: AuditReport,
  overrides?: PdfTemplateOverrides,
): TDocumentDefinitions {
  const wsName = (overrides?.orgName && overrides.orgName.trim()) || report.workspace?.name || 'Personal';
  const footerExtra = overrides?.footerText?.trim() || null;
  const content: Content[] = [
    ...coverContent(report, overrides),

    { text: 'Compliance Status', style: 'h1', margin: [0, 0, 0, 6] },
    {
      text: report.complianceStatus.overall === 'compliant'
        ? 'All monitored articles pass. The deployment operates within the AI Act framework for the selected period.'
        : report.complianceStatus.overall === 'warning'
        ? 'One or more articles report warnings. Review the detail column for remediation.'
        : 'At least one article is non-compliant. Remediation is required before the next audit.',
      fontSize: 10, italics: true, color: '#333333', margin: [0, 0, 0, 16],
    },
    articleGrid(report.complianceStatus),

    { text: 'Model Inventory', style: 'h1', margin: [0, 0, 0, 6] },
    { text: `Tracked LLM/embedding model calls across the selected period. Totals appear on the bottom row.`, fontSize: 10, color: '#333333', margin: [0, 0, 0, 10] },
    modelInventoryTable(report),

    { text: 'Human Oversight Log', style: 'h1', margin: [0, 0, 0, 6] },
    { text: `Art. 14 record of human approve/deny/modify actions on agent-proposed tool calls. Total this period: ${report.humanOversightLog.length}.`, fontSize: 10, color: '#333333', margin: [0, 0, 0, 10] },
    ...([] as Content[]).concat(oversightLogTable(report) as any),

    { text: 'Harvest Provenance', style: 'h1', margin: [0, 0, 0, 6] },
    { text: 'Art. 10 data-quality record of conversation imports and their downstream frame counts.', fontSize: 10, color: '#333333', margin: [0, 0, 0, 10] },
    provenanceTable(report),

    { text: 'Summary', style: 'h1', margin: [0, 12, 0, 6] },
    {
      ul: [
        `Total interactions logged: ${report.interactionCount.toLocaleString('en-US')}`,
        `Models in inventory: ${report.modelInventory.length}`,
        `Oversight events: ${report.humanOversightLog.length}`,
        `Harvest sources: ${report.harvestProvenance.length}`,
      ],
      fontSize: 10, color: '#333333', margin: [0, 0, 0, 20],
    },

    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }], margin: [0, 12, 0, 6] },
    {
      text: `Report v${report.report.version} — generated by ${report.report.generatedBy}.`,
      fontSize: 8, color: '#95A5A6', alignment: 'center',
    },
  ];

  return {
    info: {
      title: `Waggle AI Act Compliance Audit — ${wsName}`,
      author: 'Waggle OS',
      creator: 'Waggle OS Compliance Module',
      subject: `AI Act compliance audit for period ${report.report.period.from} → ${report.report.period.to}`,
    },
    pageSize: 'A4',
    pageMargins: [50, 60, 50, 60],
    header: (currentPage: number) => currentPage > 1 ? {
      columns: [
        { text: 'Waggle — AI Act Compliance Audit', fontSize: 8, color: '#95A5A6', margin: [50, 20, 0, 0] },
        { text: wsName, alignment: 'right', fontSize: 8, color: '#95A5A6', margin: [0, 20, 50, 0] },
      ],
    } : undefined,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: footerExtra
            ? `Generated ${report.report.generatedAt.slice(0, 10)} · ${footerExtra}`
            : `Generated ${report.report.generatedAt.slice(0, 10)}`,
          fontSize: 8, color: '#95A5A6', margin: [50, 0, 0, 0],
        },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 8, color: '#95A5A6', margin: [0, 0, 50, 0] },
      ],
    }),
    content,
    styles: {
      titleKicker: { fontSize: 11, color: HIVE_HONEY, bold: true, characterSpacing: 2 },
      title: { fontSize: 30, bold: true, color: HIVE_DARK },
      metaLabel: { fontSize: 8, color: '#95A5A6', characterSpacing: 1 },
      metaValue: { fontSize: 14, bold: true, color: HIVE_DARK },
      h1: { fontSize: 16, bold: true, color: HIVE_HONEY },
      tableHead: { fontSize: 9, bold: true, color: HIVE_DARK, fillColor: '#FAFAFA' },
    },
    defaultStyle: { fontSize: 10, lineHeight: 1.35, color: '#333333' },
  };
}

/**
 * Render an AuditReport to a PDF Buffer.
 * Uses dynamic import so pdfmake is only loaded when PDF generation runs.
 */
export async function renderComplianceReportPdf(
  report: AuditReport,
  overrides?: PdfTemplateOverrides,
): Promise<Buffer> {
  const docDef = buildComplianceDocDefinition(report, overrides);
  const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
  const printer = pdfMake.createPdf(docDef);
  return new Promise<Buffer>((resolve, reject) => {
    printer.getBuffer((buffer: Buffer) => {
      if (buffer) resolve(buffer);
      else reject(new Error('PDF generation returned empty buffer'));
    });
  });
}

/** Convenience: write the PDF to disk. Returns the absolute path. */
export async function writeComplianceReportPdf(
  report: AuditReport,
  outputPath: string,
  overrides?: PdfTemplateOverrides,
): Promise<string> {
  const buffer = await renderComplianceReportPdf(report, overrides);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return path.resolve(outputPath);
}
