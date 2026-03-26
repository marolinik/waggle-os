/**
 * Improvement Detector — produces structured, runtime-consumable awareness signals.
 *
 * Per correction #1: Returns actionable signals + surfaced suggestions as structured data,
 * not just prompt text changes.
 *
 * Per correction #5: Awareness is operational — route better, suggest better, adapt better,
 * avoid repeated mistakes.
 *
 * Per correction #3: Workflow suggestions require recency + pattern similarity,
 * not just raw shape count.
 */

import type { ImprovementSignalStore, ActionableSignal, SignalCategory } from '@waggle/core';
import { detectCorrection, type DetectedCorrection } from './correction-detector.js';

// ── Structured output types ──────────────────────────────────

export interface AwarenessSummary {
  /** Capability gaps the agent has encountered repeatedly */
  capabilityGaps: CapabilityGapSignal[];
  /** Behavioral corrections the user has made repeatedly */
  corrections: CorrectionSignal[];
  /** Workflow patterns that recur and could benefit from templates */
  workflowPatterns: WorkflowPatternSignal[];
  /** Total actionable signal count (for deciding whether to inject into prompt) */
  totalActionable: number;
}

export interface CapabilityGapSignal {
  id: number;
  toolName: string;
  occurrences: number;
  suggestion: string;
}

export interface CorrectionSignal {
  id: number;
  patternKey: string;
  detail: string;
  occurrences: number;
  guidance: string;
}

export interface WorkflowPatternSignal {
  id: number;
  patternKey: string;
  occurrences: number;
  suggestion: string;
}

// ── Capability gap recording ─────────────────────────────────

/**
 * Record a capability gap when a tool is not found or a skill is missing.
 * Called from agent-loop when tool lookup fails.
 */
export function recordCapabilityGap(
  store: ImprovementSignalStore,
  toolName: string,
  context?: string,
): void {
  store.record('capability_gap', `missing:${toolName}`, context, {
    tool: toolName,
    lastContext: context,
  });
}

// ── Correction recording ─────────────────────────────────────

/**
 * Analyze a user message for corrections and record if detected.
 * Only task-local and durable corrections are recorded (both go into the store;
 * the store's threshold mechanism handles promotion to actionable).
 *
 * Returns the detected correction (if any) for caller use.
 */
export function analyzeAndRecordCorrection(
  store: ImprovementSignalStore,
  userMessage: string,
  previousAssistantMessage?: string,
): DetectedCorrection | null {
  const correction = detectCorrection(userMessage, previousAssistantMessage);
  if (!correction) return null;

  // Record in store — both durable and task-local go in.
  // Durable corrections get recorded; task-local ones also get recorded but
  // only become actionable if the same pattern_key recurs (count >= threshold).
  store.record('correction', correction.patternKey, correction.detail, {
    isDurable: correction.isDurable,
    confidence: correction.confidence,
  });

  return correction;
}

// ── Workflow pattern recording ────────────────────────────────

const RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Record a workflow pattern occurrence.
 * Per correction #3: requires recency context, not just raw shape count.
 */
export function recordWorkflowPattern(
  store: ImprovementSignalStore,
  taskShape: string,
  taskDescription: string,
): void {
  store.record('workflow_pattern', `shape:${taskShape}`, taskDescription, {
    lastTask: taskDescription.slice(0, 100),
    recordedAt: new Date().toISOString(),
  });
}

// ── Structured awareness builder ─────────────────────────────

/**
 * Build a structured awareness summary from the signal store.
 * Returns runtime-consumable data that can be:
 * 1. Injected into system prompt as guidance
 * 2. Used by the agent loop for routing decisions
 * 3. Displayed in UI as improvement suggestions
 *
 * Per correction #6: capped at 3 actionable signals total, non-repeating.
 */
export function buildAwarenessSummary(store: ImprovementSignalStore): AwarenessSummary {
  const actionable = store.getActionable();

  const capabilityGaps: CapabilityGapSignal[] = [];
  const corrections: CorrectionSignal[] = [];
  const workflowPatterns: WorkflowPatternSignal[] = [];

  for (const signal of actionable) {
    switch (signal.category) {
      case 'capability_gap':
        capabilityGaps.push(formatCapabilityGap(signal));
        break;
      case 'correction':
        corrections.push(formatCorrection(signal));
        break;
      case 'workflow_pattern':
        // Per correction #3: only surface if recent (within 7 days)
        if (isRecent(signal.last_seen)) {
          workflowPatterns.push(formatWorkflowPattern(signal));
        }
        break;
    }
  }

  return {
    capabilityGaps,
    corrections,
    workflowPatterns,
    totalActionable: capabilityGaps.length + corrections.length + workflowPatterns.length,
  };
}

/**
 * Format awareness summary as a prompt section for system prompt injection.
 * Only included when there are actionable signals.
 */
export function formatAwarenessPrompt(summary: AwarenessSummary): string | null {
  if (summary.totalActionable === 0) return null;

  const lines: string[] = ['## Improvement Signals'];

  if (summary.capabilityGaps.length > 0) {
    lines.push('');
    lines.push('**Missing capabilities** (user has needed these before):');
    for (const gap of summary.capabilityGaps) {
      lines.push(`- ${gap.suggestion}`);
    }
  }

  if (summary.corrections.length > 0) {
    lines.push('');
    lines.push('**Behavioral adjustments** (user has corrected these patterns):');
    for (const correction of summary.corrections) {
      lines.push(`- ${correction.guidance}`);
    }
  }

  if (summary.workflowPatterns.length > 0) {
    lines.push('');
    lines.push('**Recurring workflows** (consider suggesting a template):');
    for (const pattern of summary.workflowPatterns) {
      lines.push(`- ${pattern.suggestion}`);
    }
  }

  return lines.join('\n');
}

/**
 * Mark all signals in a summary as surfaced.
 * Call this after the signals have been injected into a prompt or shown to the user.
 */
export function markSummarySurfaced(
  store: ImprovementSignalStore,
  summary: AwarenessSummary,
): void {
  for (const gap of summary.capabilityGaps) store.markSurfaced(gap.id);
  for (const correction of summary.corrections) store.markSurfaced(correction.id);
  for (const pattern of summary.workflowPatterns) store.markSurfaced(pattern.id);
}

// ── Helpers ──────────────────────────────────────────────────

function formatCapabilityGap(signal: ActionableSignal): CapabilityGapSignal {
  const toolName = signal.parsedMetadata.tool as string || signal.pattern_key.replace('missing:', '');
  return {
    id: signal.id,
    toolName,
    occurrences: signal.count,
    suggestion: `User has needed "${toolName}" ${signal.count} times. Consider using acquire_capability to find it.`,
  };
}

function formatCorrection(signal: ActionableSignal): CorrectionSignal {
  return {
    id: signal.id,
    patternKey: signal.pattern_key,
    detail: signal.detail,
    occurrences: signal.count,
    guidance: signal.detail
      ? `${signal.detail} (corrected ${signal.count} times)`
      : `Correction pattern "${signal.pattern_key}" observed ${signal.count} times`,
  };
}

function formatWorkflowPattern(signal: ActionableSignal): WorkflowPatternSignal {
  const shape = signal.pattern_key.replace('shape:', '');
  return {
    id: signal.id,
    patternKey: signal.pattern_key,
    occurrences: signal.count,
    suggestion: `"${shape}" tasks recur frequently (${signal.count} times). A workflow template could streamline this.`,
  };
}

function isRecent(dateStr: string): boolean {
  try {
    const date = new Date(dateStr);
    return Date.now() - date.getTime() < RECENCY_WINDOW_MS;
  } catch {
    return false;
  }
}
