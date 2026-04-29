/**
 * ComplianceTemplateStore — CRUD for user-editable compliance report templates.
 *
 * M-03: Templates let a user save a named "report shape" (which sections to include,
 * a risk-class override, and optional org/footer text) and re-apply it to subsequent
 * audit-report exports. Sections MERGE with the runtime selection (union semantics).
 *
 * Logo support is deferred to Bucket 2. See docs/plans/COMPLIANCE-AUDIT-2026-04-20.md.
 *
 * DDL is self-contained here (following HarvestRunStore pattern) rather than threaded
 * through mind/schema.ts — compliance_templates is not part of the Art. 12 audit
 * substrate and doesn't need append-only triggers or cross-layer migration tracking.
 */

import type { MindDB } from '@waggle/hive-mind-core';
import type {
  AIActRiskLevel,
  ComplianceTemplate,
  ComplianceTemplateSections,
  CreateComplianceTemplateInput,
  UpdateComplianceTemplateInput,
} from './types.js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS compliance_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  sections_json TEXT NOT NULL DEFAULT '{}',
  risk_classification TEXT CHECK (risk_classification IN ('minimal', 'limited', 'high-risk', 'unacceptable')),
  org_name TEXT,
  footer_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;
// TODO Bucket 2 (M-05 custom branding): add `logo_blob BLOB` + `logo_mime TEXT`
// columns. The `Edit templates` modal will grow a file-picker; renderComplianceReportPdf
// will render the blob into the PDF header when present.

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_compliance_templates_name ON compliance_templates (name)
`;

const DEFAULT_SECTIONS: ComplianceTemplateSections = {
  interactions: true,
  oversight: true,
  models: true,
  provenance: true,
  riskAssessment: true,
  fria: false,
};

/**
 * Canonical name for the seeded KVARK template. Used for idempotency — the
 * seed only fires when no row with this exact name exists.
 */
export const KVARK_TEMPLATE_NAME = 'KVARK Enterprise Audit';

export class ComplianceTemplateStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const existsRow = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='compliance_templates'",
    ).get();
    if (existsRow) return;
    raw.prepare(CREATE_TABLE_SQL).run();
    raw.prepare(CREATE_INDEX_SQL).run();
  }

  create(input: CreateComplianceTemplateInput): ComplianceTemplate {
    const name = input.name.trim();
    if (!name) throw new Error('Template name is required');

    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      INSERT INTO compliance_templates (
        name, description, sections_json, risk_classification, org_name, footer_text
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name,
      input.description ?? null,
      JSON.stringify(this.normalizeSections(input.sections)),
      input.riskClassification ?? null,
      input.orgName ?? null,
      input.footerText ?? null,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): ComplianceTemplate | null {
    const raw = this.db.getDatabase();
    const row = raw.prepare('SELECT * FROM compliance_templates WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToTemplate(row) : null;
  }

  list(): ComplianceTemplate[] {
    const raw = this.db.getDatabase();
    return (
      raw
        .prepare('SELECT * FROM compliance_templates ORDER BY updated_at DESC')
        .all() as Record<string, unknown>[]
    ).map(r => this.rowToTemplate(r));
  }

  update(id: number, patch: UpdateComplianceTemplateInput): ComplianceTemplate | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const next: ComplianceTemplate = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      sections: patch.sections !== undefined ? this.normalizeSections(patch.sections) : existing.sections,
      riskClassification:
        patch.riskClassification !== undefined ? patch.riskClassification : existing.riskClassification,
      orgName: patch.orgName !== undefined ? patch.orgName : existing.orgName,
      footerText: patch.footerText !== undefined ? patch.footerText : existing.footerText,
    };
    if (!next.name) throw new Error('Template name is required');

    const raw = this.db.getDatabase();
    raw.prepare(`
      UPDATE compliance_templates SET
        name = ?,
        description = ?,
        sections_json = ?,
        risk_classification = ?,
        org_name = ?,
        footer_text = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      next.name,
      next.description,
      JSON.stringify(next.sections),
      next.riskClassification,
      next.orgName,
      next.footerText,
      id,
    );
    return this.getById(id);
  }

  /** Returns true if the row existed and was removed, false otherwise. */
  delete(id: number): boolean {
    const raw = this.db.getDatabase();
    const info = raw.prepare('DELETE FROM compliance_templates WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /**
   * Merge a template's section flags with runtime flags. Union semantics: a section
   * is included if EITHER the template OR the runtime toggle turns it on. This keeps
   * the template's role "additive" — it can never silently hide a section the user
   * asked for in the current export.
   */
  static mergeSections(
    template: ComplianceTemplateSections,
    runtime: ComplianceTemplateSections,
  ): ComplianceTemplateSections {
    return {
      interactions: template.interactions || runtime.interactions,
      oversight: template.oversight || runtime.oversight,
      models: template.models || runtime.models,
      provenance: template.provenance || runtime.provenance,
      riskAssessment: template.riskAssessment || runtime.riskAssessment,
      fria: template.fria || runtime.fria,
    };
  }

  private normalizeSections(s: Partial<ComplianceTemplateSections> | undefined): ComplianceTemplateSections {
    return { ...DEFAULT_SECTIONS, ...(s ?? {}) };
  }

  /**
   * Idempotent: seed the built-in "KVARK Enterprise Audit" template if no
   * template with that exact name exists yet (M-06).
   *
   * The KVARK template is a sensible-default shape for sovereign enterprise
   * deployments — every section on (including FRIA, since KVARK serves
   * high-risk enterprise systems), risk pinned at `high-risk`, and org/footer
   * text that signals the sovereign-deployment narrative.
   *
   * Custom KVARK-specific sections (per-department risk breakdown, IAM
   * audit columns, data-residency attestation text) are deferred to
   * Bucket 2 along with the logo field — the current template schema
   * doesn't support custom sections yet.
   *
   * Returns the seeded template, or null if one already existed.
   */
  seedKvarkTemplateIfMissing(): ComplianceTemplate | null {
    const raw = this.db.getDatabase();
    const existing = raw.prepare(
      'SELECT id FROM compliance_templates WHERE name = ? LIMIT 1',
    ).get(KVARK_TEMPLATE_NAME) as { id: number } | undefined;
    if (existing) return null;
    return this.create({
      name: KVARK_TEMPLATE_NAME,
      description:
        'Sovereign AI Act audit shape for enterprise on-prem deployments. ' +
        'Includes all monitored articles (12/14/19/26/50) plus FRIA since KVARK ' +
        'customers typically operate high-risk systems. Data never leaves the ' +
        "customer perimeter; this template's org + footer text signal that " +
        'posture directly on every exported report.',
      sections: { ...DEFAULT_SECTIONS, fria: true },
      riskClassification: 'high-risk',
      orgName: 'KVARK Sovereign — Enterprise Deployment',
      footerText:
        'Confidential · EU AI Act attestation · KVARK sovereign deployment · Data remains within customer perimeter',
    });
  }

  private rowToTemplate(row: Record<string, unknown>): ComplianceTemplate {
    let sections: ComplianceTemplateSections;
    try {
      sections = this.normalizeSections(JSON.parse((row.sections_json as string) ?? '{}'));
    } catch {
      sections = { ...DEFAULT_SECTIONS };
    }
    return {
      id: row.id as number,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      sections,
      riskClassification: (row.risk_classification as AIActRiskLevel | null) ?? null,
      orgName: (row.org_name as string | null) ?? null,
      footerText: (row.footer_text as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
