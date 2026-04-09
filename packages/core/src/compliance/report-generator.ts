/**
 * ReportGenerator — generates AI Act compliance audit reports.
 *
 * Produces JSON reports (PDF generation deferred to document tooling).
 * Reports cover: compliance status, model inventory, oversight log,
 * harvest provenance, and interaction counts.
 */

import type { InteractionStore } from './interaction-store.js';
import type { HarvestSourceStore } from '../harvest/source-store.js';
import { ComplianceStatusChecker } from './status-checker.js';
import type { AuditReport, AuditReportRequest, AIActRiskLevel } from './types.js';

const REPORT_VERSION = '1.0';

export interface ReportGeneratorDeps {
  interactionStore: InteractionStore;
  harvestStore: HarvestSourceStore;
  getWorkspaceRisk?: (workspaceId: string) => AIActRiskLevel;
  getWorkspaceName?: (workspaceId: string) => string;
}

export class ReportGenerator {
  private interactions: InteractionStore;
  private harvest: HarvestSourceStore;
  private getWorkspaceRisk: (id: string) => AIActRiskLevel;
  private getWorkspaceName: (id: string) => string;

  constructor(deps: ReportGeneratorDeps) {
    this.interactions = deps.interactionStore;
    this.harvest = deps.harvestStore;
    this.getWorkspaceRisk = deps.getWorkspaceRisk ?? (() => 'minimal');
    this.getWorkspaceName = deps.getWorkspaceName ?? ((id) => id);
  }

  /** Generate a full audit report. */
  generate(request: AuditReportRequest): AuditReport {
    const checker = new ComplianceStatusChecker(this.interactions);
    const complianceStatus = checker.check(request.workspaceId);

    const report: AuditReport = {
      report: {
        version: REPORT_VERSION,
        generatedAt: new Date().toISOString(),
        period: { from: request.from, to: request.to },
        generatedBy: 'Waggle OS',
      },
      workspace: request.workspaceId ? {
        id: request.workspaceId,
        name: this.getWorkspaceName(request.workspaceId),
        riskLevel: this.getWorkspaceRisk(request.workspaceId),
        riskClassifiedAt: null, // TODO: track classification date in workspace config
      } : null,
      complianceStatus,
      modelInventory: [],
      humanOversightLog: [],
      harvestProvenance: [],
      interactionCount: 0,
    };

    // Model inventory
    if (request.include.models) {
      report.modelInventory = this.interactions.getModelInventory(
        request.from, request.to, request.workspaceId,
      );
    }

    // Human oversight log
    if (request.include.oversight) {
      report.humanOversightLog = this.interactions.getOversightLog(
        request.from, request.to, request.workspaceId,
      );
    }

    // Harvest provenance
    if (request.include.provenance) {
      const sources = this.harvest.getAll();
      report.harvestProvenance = sources.map(s => ({
        source: s.displayName,
        importedAt: s.lastSyncedAt ?? s.createdAt,
        itemsImported: s.itemsImported,
        framesCreated: s.framesCreated,
      }));
    }

    // Interaction count
    if (request.include.interactions) {
      const interactions = this.interactions.getByDateRange(
        request.from, request.to, request.workspaceId,
      );
      report.interactionCount = interactions.length;
    }

    return report;
  }
}
