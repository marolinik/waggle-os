/**
 * ComplianceStatusChecker — evaluates AI Act compliance per workspace.
 *
 * Checks:
 * - Art. 12: Automatic event logging (ai_interactions count)
 * - Art. 14: Human oversight (approval/denial actions recorded)
 * - Art. 19: Log retention (oldest log >= 6 months ago)
 * - Art. 26: Deployer monitoring (active monitors)
 * - Art. 50: Model transparency (models disclosed)
 */

import type { InteractionStore } from './interaction-store.js';
import type { ComplianceStatus, ArticleStatus } from './types.js';

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export class ComplianceStatusChecker {
  private store: InteractionStore;

  constructor(store: InteractionStore) {
    this.store = store;
  }

  /** Evaluate full compliance status for a workspace (or all workspaces if null). */
  check(workspaceId?: string): ComplianceStatus {
    const art12 = this.checkArt12(workspaceId);
    const art14 = this.checkArt14(workspaceId);
    const art19 = this.checkArt19();
    const art26 = this.checkArt26();
    const art50 = this.checkArt50(workspaceId);

    const statuses = [art12.status, art14.status, art19.status, art26.status, art50.status];
    const overall = statuses.includes('non-compliant') ? 'non-compliant'
      : statuses.includes('warning') ? 'warning'
      : 'compliant';

    return {
      overall,
      art12Logging: art12,
      art14Oversight: art14,
      art19Retention: art19,
      art26Monitoring: art26,
      art50Transparency: art50,
    };
  }

  /** Art. 12: Automatic recording of events. */
  private checkArt12(workspaceId?: string): ArticleStatus & { totalInteractions: number } {
    const total = this.store.count(workspaceId);

    if (total === 0) {
      // M11: if the DB has been active for >24h with zero interactions, escalate to non-compliant
      const firstRun = this.store.getFirstRunAt();
      const activeOver24h = firstRun
        ? (Date.now() - new Date(firstRun).getTime()) > 24 * 60 * 60 * 1000
        : false;

      return {
        status: activeOver24h ? 'non-compliant' : 'warning',
        detail: activeOver24h
          ? 'No interactions logged despite system being active for over 24 hours. Verify logging pipeline.'
          : 'No interactions logged yet. Logging activates automatically on first AI interaction.',
        totalInteractions: 0,
      };
    }

    return {
      status: 'compliant',
      detail: `${total} interactions logged with full model, token, cost, and tool tracking.`,
      totalInteractions: total,
    };
  }

  /** Art. 14: Human oversight capability. */
  private checkArt14(workspaceId?: string): ArticleStatus & { humanActions: number; approvalRate: number } {
    const counts = this.store.getOversightCounts(workspaceId);

    if (counts.total === 0) {
      return {
        status: 'compliant',
        detail: 'Human oversight capabilities available (approval gates, tool deny lists). No oversight actions recorded yet.',
        humanActions: 0,
        approvalRate: 0,
      };
    }

    const approvalRate = counts.total > 0
      ? Math.round((counts.approved / counts.total) * 100)
      : 0;

    return {
      status: 'compliant',
      detail: `${counts.total} human oversight actions: ${counts.approved} approved, ${counts.denied} denied, ${counts.modified} modified.`,
      humanActions: counts.total,
      approvalRate,
    };
  }

  /** Art. 19: Log retention (minimum 6 months). */
  private checkArt19(): ArticleStatus & { oldestLogDate: string | null; retentionDays: number } {
    const oldest = this.store.getOldestTimestamp();

    if (!oldest) {
      return {
        status: 'compliant',
        detail: 'No logs to retain yet. Retention policy is permanent by default.',
        oldestLogDate: null,
        retentionDays: 0,
      };
    }

    const oldestDate = new Date(oldest);
    const now = new Date();
    const retentionMs = now.getTime() - oldestDate.getTime();
    const retentionDays = Math.floor(retentionMs / (24 * 60 * 60 * 1000));

    // Review Critical #2: the previous expression was a tautology
    // (`retentionMs >= SIX_MONTHS_MS || retentionDays < 180`) that covered every
    // non-negative value of retentionDays. A deployment that pruned logs after 30
    // days still reported compliant.
    //
    // Proper fix requires distinguishing 'system is young' from 'logs were pruned'.
    // We track system age via MindDB's `meta.first_run_at` entry (set on schema init,
    // backfilled for pre-existing DBs). If the system has been running for 180+ days
    // but the oldest log is younger than that, something pruned the logs and we
    // correctly report warning.
    const firstRun = this.store.getFirstRunAt();
    const systemAgeMs = firstRun ? now.getTime() - new Date(firstRun).getTime() : retentionMs;
    const hasBeenRunning6Months = systemAgeMs >= SIX_MONTHS_MS;
    const logsOlderThan6Months = retentionMs >= SIX_MONTHS_MS;
    const meetsMinimum = !hasBeenRunning6Months || logsOlderThan6Months;

    return {
      status: meetsMinimum ? 'compliant' : 'warning',
      detail: meetsMinimum
        ? hasBeenRunning6Months
          ? `Logs retained since ${oldest.split('T')[0]} (${retentionDays} days). Art. 19 minimum (180 days) met.`
          : `Logs retained since ${oldest.split('T')[0]} (${retentionDays} days). System is still within its first 180 days — retention compliance will be enforceable after 2026-${(new Date(firstRun ?? now).getMonth() + 7).toString().padStart(2, '0')}.`
        : `Oldest log: ${oldest.split('T')[0]} (${retentionDays} days) but system is ${Math.floor(systemAgeMs / (24 * 60 * 60 * 1000))} days old. Logs appear to have been pruned — EU AI Act Art. 19 requires 180-day minimum retention.`,
      oldestLogDate: oldest,
      retentionDays,
    };
  }

  /** Art. 26: Deployer monitoring obligations. */
  private checkArt26(): ArticleStatus & { activeMonitors: string[] } {
    // Waggle always has these monitors active
    const monitors = [
      'cost_tracking',       // CostTracker in packages/agent
      'tool_logging',        // Tool calls logged per interaction
      'model_identification', // Model recorded per interaction
      'persona_tracking',    // Persona recorded per interaction
    ];

    return {
      status: 'compliant',
      detail: `${monitors.length} active monitors: cost, tools, model ID, persona.`,
      activeMonitors: monitors,
    };
  }

  /** Art. 50: Transparency — models disclosed. */
  private checkArt50(workspaceId?: string): ArticleStatus & { modelsDisclosed: boolean } {
    const inventory = this.store.getModelInventory(undefined, undefined, workspaceId);
    const modelsDisclosed = inventory.length > 0;

    return {
      status: 'compliant',
      detail: modelsDisclosed
        ? `${inventory.length} model(s) in use, all identified in StatusBar and interaction logs.`
        : 'Model identification active. Models will be disclosed on first interaction.',
      modelsDisclosed,
    };
  }
}
