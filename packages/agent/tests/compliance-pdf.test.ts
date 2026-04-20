/**
 * Skills 2.0 gap H — compliance report PDF generator.
 *
 * Tests the doc-definition builder (buildComplianceDocDefinition) without
 * actually rendering a PDF — that would require pdfmake font bundles that
 * inflate test time and CI brittleness. The render function itself is a
 * thin pdfmake wrapper; if the doc def is structurally correct and
 * pdfmake has its own test coverage upstream, the rendered artifact is
 * trustworthy.
 */
import { describe, it, expect } from 'vitest';
import type { AuditReport } from '@waggle/core';
import { buildComplianceDocDefinition } from '../src/compliance-pdf.js';

function sampleReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    report: {
      version: '1.0',
      generatedAt: '2026-04-15T12:00:00.000Z',
      period: { from: '2026-01-01T00:00:00.000Z', to: '2026-04-15T00:00:00.000Z' },
      generatedBy: 'Waggle OS',
    },
    workspace: {
      id: 'ws-alpha',
      name: 'Alpha Corp Legal',
      riskLevel: 'high-risk',
      riskClassifiedAt: '2026-01-01T00:00:00.000Z',
    },
    complianceStatus: {
      overall: 'compliant',
      art12Logging: { status: 'compliant', detail: 'All interactions logged', totalInteractions: 1247 },
      art14Oversight: { status: 'compliant', detail: '83% approval rate', humanActions: 47, approvalRate: 0.83 },
      art19Retention: { status: 'warning', detail: 'Oldest log near retention limit', oldestLogDate: '2025-04-15T00:00:00.000Z', retentionDays: 365 },
      art26Monitoring: { status: 'compliant', detail: 'Active monitors: drift, bias, throughput', activeMonitors: ['drift', 'bias', 'throughput'] },
      art50Transparency: { status: 'compliant', detail: 'Model disclosure active', modelsDisclosed: true },
    },
    modelInventory: [
      { model: 'claude-sonnet-4-6', provider: 'anthropic', calls: 500, inputTokens: 1_000_000, outputTokens: 200_000, costUsd: 3.5 },
      { model: 'claude-haiku-4-5', provider: 'anthropic', calls: 747, inputTokens: 500_000, outputTokens: 80_000, costUsd: 0.42 },
    ],
    humanOversightLog: [
      { timestamp: '2026-04-10T09:15:00.000Z', action: 'approved', tool: 'save_memory', detail: 'Client contract summary — confirmed' },
      { timestamp: '2026-04-11T14:22:00.000Z', action: 'denied', tool: 'send_email', detail: 'Draft to opposing counsel — halted' },
    ],
    harvestProvenance: [
      { source: 'Claude Code exports', importedAt: '2026-03-01T00:00:00.000Z', itemsImported: 156, framesCreated: 89 },
    ],
    interactionCount: 1247,
    ...overrides,
  };
}

describe('buildComplianceDocDefinition — gap H', () => {
  it('produces a valid pdfmake doc definition with key metadata', () => {
    const doc = buildComplianceDocDefinition(sampleReport());
    expect(doc.info?.title).toContain('Alpha Corp Legal');
    expect(doc.info?.creator).toContain('Waggle');
    expect(doc.pageSize).toBe('A4');
    expect(doc.pageMargins).toEqual([50, 60, 50, 60]);
  });

  it('includes the workspace name and risk level on the cover', () => {
    const doc = buildComplianceDocDefinition(sampleReport());
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('Alpha Corp Legal');
    expect(flat).toContain('HIGH-RISK');
    expect(flat).toContain('AI ACT COMPLIANCE AUDIT');
  });

  it('falls back to "Personal Mind" when workspace is null', () => {
    const doc = buildComplianceDocDefinition(sampleReport({ workspace: null }));
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('Personal Mind');
    expect(flat).toContain('MINIMAL'); // default risk fallback
  });

  it('renders a row per article status with matching badges', () => {
    const doc = buildComplianceDocDefinition(sampleReport());
    const flat = JSON.stringify(doc.content);
    // All 5 article labels appear
    expect(flat).toContain('Art. 12');
    expect(flat).toContain('Art. 14');
    expect(flat).toContain('Art. 19');
    expect(flat).toContain('Art. 26');
    expect(flat).toContain('Art. 50');
    // Status badges appear
    expect(flat).toContain('COMPLIANT');
    expect(flat).toContain('WARNING');
  });

  it('includes a model inventory total row', () => {
    const doc = buildComplianceDocDefinition(sampleReport());
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('claude-sonnet-4-6');
    expect(flat).toContain('claude-haiku-4-5');
    // Total calls = 500 + 747 = 1,247
    expect(flat).toContain('1,247');
    expect(flat).toContain('TOTAL');
  });

  it('shows an empty-state message for empty model inventory', () => {
    const doc = buildComplianceDocDefinition(sampleReport({ modelInventory: [] }));
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('No model calls recorded');
  });

  it('shows an empty-state message for empty oversight log', () => {
    const doc = buildComplianceDocDefinition(sampleReport({ humanOversightLog: [] }));
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('No human oversight events');
  });

  it('caps oversight log display at 50 most-recent entries with a footer', () => {
    const log = Array.from({ length: 120 }, (_, i) => ({
      timestamp: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      action: 'approved' as const,
      tool: 'save_memory',
      detail: `Event ${i}`,
    }));
    const doc = buildComplianceDocDefinition(sampleReport({ humanOversightLog: log }));
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('Showing last 50 of 120 events');
  });

  it('empty provenance produces an empty-state message', () => {
    const doc = buildComplianceDocDefinition(sampleReport({ harvestProvenance: [] }));
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('No harvest provenance data');
  });

  it('summary lists totals derived from report fields', () => {
    const doc = buildComplianceDocDefinition(sampleReport());
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('Total interactions logged: 1,247');
    expect(flat).toContain('Models in inventory: 2');
    expect(flat).toContain('Oversight events: 2');
    expect(flat).toContain('Harvest sources: 1');
  });

  it('styles contain Hive DS honey color', () => {
    const doc = buildComplianceDocDefinition(sampleReport());
    const styles = JSON.stringify(doc.styles);
    expect(styles).toContain('#E5A000'); // HIVE_HONEY
  });
});

describe('buildComplianceDocDefinition — M-03 template overrides', () => {
  it('overrides workspace name with templateOrgName in title + header + cover', () => {
    const doc = buildComplianceDocDefinition(sampleReport(), { orgName: 'KVARK Sovereign Cloud' });
    expect(doc.info?.title).toContain('KVARK Sovereign Cloud');
    expect(doc.info?.title).not.toContain('Alpha Corp Legal');
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('KVARK Sovereign Cloud');
  });

  it('overrides workspace risk level with templateRiskClassification', () => {
    const doc = buildComplianceDocDefinition(sampleReport(), { riskClassification: 'minimal' });
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('MINIMAL');
    // Original workspace risk (HIGH-RISK) should no longer appear on the cover
    // since the cover only renders the override.
    expect(flat).not.toContain('HIGH-RISK');
  });

  it('appends footerText to the rendered footer', () => {
    const doc = buildComplianceDocDefinition(sampleReport(), {
      footerText: 'Confidential — board only',
    });
    // pdfmake `footer` is a function (currentPage, pageCount) => Content.
    // Invoke it to get the rendered cell tree and stringify that.
    const footerFn = doc.footer as ((currentPage: number, pageCount: number) => unknown) | undefined;
    expect(typeof footerFn).toBe('function');
    const footerContent = JSON.stringify(footerFn!(1, 1));
    expect(footerContent).toContain('Confidential — board only');
  });

  it('blank overrides fall back to workspace defaults', () => {
    const doc = buildComplianceDocDefinition(sampleReport(), {
      orgName: '',
      footerText: '',
      riskClassification: null,
    });
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain('Alpha Corp Legal'); // workspace name still used
    expect(flat).toContain('HIGH-RISK'); // workspace risk still used
  });

  it('ignores undefined overrides (no-op call path)', () => {
    const baseline = buildComplianceDocDefinition(sampleReport());
    const overridden = buildComplianceDocDefinition(sampleReport(), undefined);
    expect(JSON.stringify(overridden.info)).toBe(JSON.stringify(baseline.info));
  });
});
