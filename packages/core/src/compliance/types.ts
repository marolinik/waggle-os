/**
 * AI Act Compliance Types — interaction audit, risk classification, report format.
 */

// ── Risk Classification (Art. 26) ──

export type AIActRiskLevel = 'minimal' | 'limited' | 'high-risk' | 'unacceptable';

export type HumanAction = 'approved' | 'denied' | 'modified' | 'none';

// ── Interaction Audit (Art. 12) ──

export interface AIInteraction {
  id: number;
  timestamp: string;
  workspaceId: string | null;
  sessionId: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolsCalled: string[];
  humanAction: HumanAction;
  riskContext: string | null;
  importedFrom: string | null;
  persona: string | null;
  // Review Critical #3 (compliance): EU AI Act Art. 12.1(a) requires recording the
  // actual inputs and outputs of the system, not just token counts. Nullable because
  // pre-existing DBs may have rows from before the columns were added.
  inputText: string | null;
  outputText: string | null;
}

export interface RecordInteractionInput {
  workspaceId?: string;
  sessionId?: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolsCalled?: string[];
  humanAction?: HumanAction;
  riskContext?: string;
  importedFrom?: string;
  persona?: string;
  // Review Critical #3: optional because echo-mode interactions may not have meaningful
  // content. Callers on the live agent path SHOULD pass these; record() does not reject
  // absent values but the compliance status checker flags them as a gap.
  inputText?: string;
  outputText?: string;
}

// ── Compliance Status ──

export interface ArticleStatus {
  status: 'compliant' | 'warning' | 'non-compliant';
  detail: string;
}

export interface ComplianceStatus {
  overall: 'compliant' | 'warning' | 'non-compliant';
  art12Logging: ArticleStatus & { totalInteractions: number };
  art14Oversight: ArticleStatus & { humanActions: number; approvalRate: number };
  art19Retention: ArticleStatus & { oldestLogDate: string | null; retentionDays: number };
  art26Monitoring: ArticleStatus & { activeMonitors: string[] };
  art50Transparency: ArticleStatus & { modelsDisclosed: boolean };
}

// ── Audit Report ──

export interface ModelInventoryEntry {
  model: string;
  provider: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface OversightLogEntry {
  timestamp: string;
  action: HumanAction;
  tool: string;
  detail: string;
  user?: string;
}

export interface HarvestProvenanceEntry {
  source: string;
  importedAt: string;
  itemsImported: number;
  framesCreated: number;
}

export interface AuditReportRequest {
  workspaceId?: string;
  from: string;
  to: string;
  format: 'json' | 'pdf' | 'both';
  include: {
    interactions: boolean;
    oversight: boolean;
    models: boolean;
    provenance: boolean;
    riskAssessment: boolean;
    fria: boolean;
  };
}

export interface AuditReport {
  report: {
    version: string;
    generatedAt: string;
    period: { from: string; to: string };
    generatedBy: string;
  };
  workspace: {
    id: string | null;
    name: string;
    riskLevel: AIActRiskLevel;
    riskClassifiedAt: string | null;
  } | null;
  complianceStatus: ComplianceStatus;
  modelInventory: ModelInventoryEntry[];
  humanOversightLog: OversightLogEntry[];
  harvestProvenance: HarvestProvenanceEntry[];
  interactionCount: number;
}

// ── Compliance Templates (M-03) ──
//
// Templates let a user save a preferred audit-report shape (sections + risk class +
// org/footer overrides) and re-apply it to exports. Sections MERGE (union) with the
// user's runtime section toggles — a template only turns sections ON, never off.
// `riskClassification` overrides the workspace's risk level for that one report.
// Logo support is deferred to Bucket 2 (post-launch).

export interface ComplianceTemplateSections {
  interactions: boolean;
  oversight: boolean;
  models: boolean;
  provenance: boolean;
  riskAssessment: boolean;
  fria: boolean;
}

export interface ComplianceTemplate {
  id: number;
  name: string;
  description: string | null;
  sections: ComplianceTemplateSections;
  riskClassification: AIActRiskLevel | null;
  orgName: string | null;
  footerText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateComplianceTemplateInput {
  name: string;
  description?: string | null;
  sections: ComplianceTemplateSections;
  riskClassification?: AIActRiskLevel | null;
  orgName?: string | null;
  footerText?: string | null;
}

export interface UpdateComplianceTemplateInput {
  name?: string;
  description?: string | null;
  sections?: ComplianceTemplateSections;
  riskClassification?: AIActRiskLevel | null;
  orgName?: string | null;
  footerText?: string | null;
}

// ── Template auto-suggestion ──

export const TEMPLATE_RISK_MAP: Record<string, AIActRiskLevel> = {
  'legal-review': 'high-risk',
  'hr-management': 'high-risk',
  'recruiting': 'high-risk',
  'finance': 'high-risk',
  'insurance': 'high-risk',
  'credit-scoring': 'high-risk',
  'sales-pipeline': 'limited',
  'marketing-campaign': 'limited',
  'research-project': 'minimal',
  'code-review': 'minimal',
  'product-launch': 'limited',
  'agency-consulting': 'limited',
  'blank': 'minimal',
  'content-creation': 'minimal',
  'customer-support': 'limited',
  'data-analysis': 'limited',
  'project-management': 'minimal',
  'education': 'limited',
  'healthcare': 'high-risk',
};
