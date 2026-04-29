/**
 * Feature Flags — environment-based configuration for progressive enhancement.
 * Enables A/B testing, gradual rollout, and per-workspace configuration.
 *
 * Usage: import { FEATURE_FLAGS } from './feature-flags.js'
 * All flags default to sensible production values when env vars are not set.
 */

export const FEATURE_FLAGS = {
  /** Enable Coordinator persona and multi-agent orchestration */
  COORDINATOR_MODE: process.env['WAGGLE_COORDINATOR_MODE'] === '1',

  /** Enable advanced workflow composition and orchestration */
  ADVANCED_WORKFLOWS: process.env['WAGGLE_ADVANCED_WORKFLOWS'] !== '0',  // default ON

  /** Aggressively auto-save memory after every significant exchange */
  AUTO_SAVE_AGGRESSIVE: process.env['WAGGLE_AUTO_SAVE'] === 'aggressive',

  /** Auto-suggest and prompt capability installation */
  AUTO_CAPABILITY_SUGGEST: process.env['WAGGLE_AUTO_CAPABILITY'] !== '0',  // default ON

  /** Enable 4-layer context compaction for long sessions */
  COMPACTION_ENABLED: process.env['WAGGLE_COMPACTION'] === '1',

  /** Automatically run Verifier agent after every Coordinator workflow */
  VERIFIER_AUTO_RUN: process.env['WAGGLE_AUTO_VERIFY'] === '1',

  /**
   * Enable PromptAssembler — tier-adaptive prompt packaging sixth layer.
   * Default OFF. When ON, agent-loop uses Orchestrator.buildAssembledPrompt()
   * instead of the raw buildSystemPrompt() + recallMemory() path.
   * See docs/specs/PROMPT-ASSEMBLER-V4.md.
   */
  PROMPT_ASSEMBLER: process.env['WAGGLE_PROMPT_ASSEMBLER'] === '1',

  /**
   * Phase 5 canary percentage (0-100, integer). Controls fraction of requests
   * routed to GEPA-evolved variants (claude::gen1-v1 + qwen-thinking::gen1-v1)
   * instead of pre-Phase-5 baseline. Default 0 (canary OFF).
   *
   * Hot-reconfigurable via process restart. NE flip > 0 bez explicit PM canary
   * kick-off ratification (§7.3 of phase-5 deployment brief). Authoritative
   * gradient schedule: 0 → 10 → 25 → 50 → 100 with AND-gate (≥7 days AND ≥30
   * samples per variant per metric) at each step.
   *
   * Invalid values (negative, > 100, non-integer, NaN) are treated as 0 for
   * fail-safe behavior. See packages/agent/src/canary/phase-5-router.ts.
   */
  PHASE_5_CANARY_PCT: parsePhase5CanaryPct(process.env['WAGGLE_PHASE5_CANARY_PCT']),
} as const;

/**
 * Parse and validate WAGGLE_PHASE5_CANARY_PCT env var.
 *
 * Returns an integer in [0, 100]. Anything malformed (negative, > 100, NaN,
 * non-integer, undefined, empty) returns 0 — fail-safe to canary OFF rather
 * than silently routing partial traffic on bad config.
 */
function parsePhase5CanaryPct(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < 0 || parsed > 100) return 0;
  return parsed;
}

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check if a feature flag is enabled.
 *
 * For boolean flags: returns the value directly.
 * For numeric flags (e.g., PHASE_5_CANARY_PCT): returns true iff the value is
 * truthy (> 0). Use the FEATURE_FLAGS object directly when you need the
 * numeric value rather than a boolean.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  return Boolean(FEATURE_FLAGS[flag]);
}
