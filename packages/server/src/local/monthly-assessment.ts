/**
 * Monthly Self-Assessment — generates a structured report of agent performance.
 *
 * Reads optimization logs, feedback stats, and capability gap signals from
 * the personal mind to produce a monthly assessment. Designed to be called
 * by the cron scheduler on the 1st of each month.
 *
 * The assessment is saved as a memory frame (I-frame) in the personal mind
 * so it becomes part of the agent's long-term self-awareness.
 */

import { MindDB, OptimizationLogStore, FrameStore, SessionStore, ImprovementSignalStore } from '@waggle/core';
import type { LocalConfig } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface MonthlyAssessment {
  period: string; // "2026-03"
  totalInteractions: number;
  correctionRate: number;
  improvementTrend: string;
  topStrengths: string[];
  topWeaknesses: string[];
  capabilityGapsDetected: string[];
  skillsInstalled: number;
  recommendation: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Compute a correction rate for a given month from optimization logs.
 */
function computeMonthCorrectionRate(
  db: import('better-sqlite3').Database,
  yearMonth: string,
): { total: number; correctionRate: number } {
  const startDate = `${yearMonth}-01`;
  // Compute end date: next month's first day
  const [year, month] = yearMonth.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(AVG(was_correction * 1.0), 0) as correction_rate
      FROM optimization_log
      WHERE timestamp >= ? AND timestamp < ?
    `).get(startDate, endDate) as { total: number; correction_rate: number } | undefined;

    return {
      total: row?.total ?? 0,
      correctionRate: row?.correction_rate ?? 0,
    };
  } catch {
    return { total: 0, correctionRate: 0 };
  }
}

/**
 * Compute a correction rate for the prior month for trend comparison.
 */
function computePriorMonthCorrectionRate(
  db: import('better-sqlite3').Database,
  yearMonth: string,
): number {
  const [year, month] = yearMonth.split('-').map(Number);
  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;
  const priorYearMonth = `${priorYear}-${String(priorMonth).padStart(2, '0')}`;
  const { correctionRate } = computeMonthCorrectionRate(db, priorYearMonth);
  return correctionRate;
}

/**
 * Get top feedback reasons from the feedback_entries table for the month.
 */
function getTopFeedbackReasons(
  db: import('better-sqlite3').Database,
  yearMonth: string,
): { positiveReasons: string[]; negativeReasons: string[] } {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const negativeReasons: string[] = [];
  const positiveReasons: string[] = [];

  try {
    const negRows = db.prepare(`
      SELECT reason, COUNT(*) as count
      FROM feedback_entries
      WHERE rating = 'down' AND reason IS NOT NULL
        AND created_at >= ? AND created_at < ?
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 5
    `).all(startDate, endDate) as Array<{ reason: string; count: number }>;
    negativeReasons.push(...negRows.map(r => r.reason));
  } catch {
    // feedback_entries table might not exist yet
  }

  // Strengths: areas where positive feedback was given (no reason column for up, so we derive from low correction areas)
  try {
    const posCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM feedback_entries
      WHERE rating = 'up'
        AND created_at >= ? AND created_at < ?
    `).get(startDate, endDate) as { count: number } | undefined;
    if (posCount && posCount.count > 0) {
      positiveReasons.push('Consistent positive user feedback');
    }
  } catch {
    // table might not exist
  }

  return { positiveReasons, negativeReasons };
}

/**
 * Get capability gaps detected from the improvement signals store.
 */
function getCapabilityGaps(signalStore: ImprovementSignalStore): string[] {
  try {
    const gaps = signalStore.getByCategory('capability_gap');
    return gaps
      .filter(g => g.count >= 2) // Only surface gaps that occurred multiple times
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(g => g.pattern_key.replace('missing:', ''));
  } catch {
    return [];
  }
}

/**
 * Count skills installed this month from the install audit trail.
 */
function countSkillsInstalled(
  db: import('better-sqlite3').Database,
  yearMonth: string,
): number {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  try {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM install_audit_trail
      WHERE action = 'installed'
        AND timestamp >= ? AND timestamp < ?
    `).get(startDate, endDate) as { count: number } | undefined;
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Generate a text recommendation based on the assessment data.
 */
function generateRecommendation(
  correctionRate: number,
  trend: string,
  gaps: string[],
  weaknesses: string[],
): string {
  const parts: string[] = [];

  if (correctionRate > 0.3) {
    parts.push('High correction rate detected. Consider reviewing recurring feedback patterns and adjusting behavior accordingly.');
  } else if (correctionRate > 0.15) {
    parts.push('Moderate correction rate. Room for improvement in accuracy and user alignment.');
  } else if (correctionRate > 0) {
    parts.push('Low correction rate. Agent is performing well overall.');
  } else {
    parts.push('No corrections recorded. Consider encouraging more user feedback to track performance.');
  }

  if (gaps.length > 0) {
    parts.push(`Capability gaps detected: ${gaps.slice(0, 3).join(', ')}. Consider installing relevant skills.`);
  }

  if (weaknesses.length > 0) {
    parts.push(`Most common issues: ${weaknesses.slice(0, 3).map(w => w.replace(/_/g, ' ')).join(', ')}.`);
  }

  if (trend.startsWith('+')) {
    parts.push('Positive trend — keep up the good work.');
  } else if (trend.startsWith('-')) {
    parts.push('Negative trend — attention needed on quality.');
  }

  return parts.join(' ');
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Generate a monthly self-assessment from the personal mind data.
 *
 * @param config - Local server configuration (provides dataDir)
 * @param personalMind - The personal MindDB instance
 * @param periodOverride - Optional YYYY-MM override (defaults to previous month)
 */
export function generateMonthlyAssessment(
  config: LocalConfig,
  personalMind: MindDB,
  periodOverride?: string,
): MonthlyAssessment {
  const db = personalMind.getDatabase();

  // Default to previous month
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() is 0-based
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const period = periodOverride ?? `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  // Correction stats for this month
  const { total: totalInteractions, correctionRate } = computeMonthCorrectionRate(db, period);

  // Trend: compare to prior month
  const priorRate = computePriorMonthCorrectionRate(db, period);
  let improvementTrend = '0%';
  if (totalInteractions > 0 && priorRate > 0) {
    const diff = Math.round((priorRate - correctionRate) * 100); // positive = improvement (fewer corrections)
    improvementTrend = diff >= 0 ? `+${diff}%` : `${diff}%`;
  }

  // Feedback analysis
  const { positiveReasons, negativeReasons } = getTopFeedbackReasons(db, period);

  // Capability gaps
  const signalStore = new ImprovementSignalStore(personalMind);
  const capabilityGaps = getCapabilityGaps(signalStore);

  // Skills installed
  const skillsInstalled = countSkillsInstalled(db, period);

  // Derive strengths
  const topStrengths: string[] = [...positiveReasons];
  if (correctionRate < 0.15) topStrengths.push('Low correction rate');
  if (skillsInstalled > 0) topStrengths.push(`${skillsInstalled} new skills adopted`);
  if (topStrengths.length === 0) topStrengths.push('Stable operation');

  // Derive weaknesses
  const topWeaknesses: string[] = negativeReasons.map(r => r.replace(/_/g, ' '));
  if (correctionRate > 0.25) topWeaknesses.push('High correction rate');
  if (capabilityGaps.length > 0) topWeaknesses.push('Missing capabilities requested');

  // Generate recommendation
  const recommendation = generateRecommendation(correctionRate, improvementTrend, capabilityGaps, negativeReasons);

  return {
    period,
    totalInteractions,
    correctionRate: +correctionRate.toFixed(3),
    improvementTrend,
    topStrengths: topStrengths.slice(0, 5),
    topWeaknesses: topWeaknesses.slice(0, 5),
    capabilityGapsDetected: capabilityGaps,
    skillsInstalled,
    recommendation,
  };
}

/**
 * Ensure an "assessment" session exists in the personal mind.
 * FrameStore requires a valid gop_id in the sessions table (FK constraint).
 * We create one permanent session for all assessment frames.
 */
function ensureAssessmentSession(personalMind: MindDB): string {
  const sessions = new SessionStore(personalMind);
  const existing = sessions.getByGopId('assessment');
  if (existing) return existing.gop_id;

  // Insert a permanent session with gop_id = 'assessment'
  const raw = personalMind.getDatabase();
  raw.prepare(`
    INSERT INTO sessions (gop_id, project_id, status, started_at)
    VALUES ('assessment', NULL, 'active', datetime('now'))
  `).run();
  return 'assessment';
}

/**
 * Save a monthly assessment as an I-frame in the personal mind.
 * Uses a dedicated GOP (Group of Pictures) namespace: "assessment".
 */
export function saveAssessmentToMind(personalMind: MindDB, assessment: MonthlyAssessment): void {
  ensureAssessmentSession(personalMind);
  const frames = new FrameStore(personalMind);

  const content = [
    `# Monthly Agent Assessment — ${assessment.period}`,
    '',
    `**Interactions**: ${assessment.totalInteractions}`,
    `**Correction Rate**: ${(assessment.correctionRate * 100).toFixed(1)}%`,
    `**Improvement Trend**: ${assessment.improvementTrend}`,
    '',
    `## Strengths`,
    ...assessment.topStrengths.map(s => `- ${s}`),
    '',
    `## Weaknesses`,
    ...assessment.topWeaknesses.map(w => `- ${w}`),
    '',
    `## Capability Gaps`,
    ...(assessment.capabilityGapsDetected.length > 0
      ? assessment.capabilityGapsDetected.map(g => `- ${g}`)
      : ['- None detected']),
    '',
    `## Recommendation`,
    assessment.recommendation,
    '',
    `---`,
    `Skills installed this month: ${assessment.skillsInstalled}`,
    `Generated: ${new Date().toISOString()}`,
  ].join('\n');

  frames.createIFrame('assessment', content, 'important');
}
