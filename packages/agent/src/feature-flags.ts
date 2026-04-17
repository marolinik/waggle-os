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
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/** Check if a feature flag is enabled */
export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
