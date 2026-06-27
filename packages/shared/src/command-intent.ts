// Natural-Language Command Bar (Ctrl+K Tier 1 intent layer).
//
// The contract returned by `POST /api/command/interpret`. The resolver maps a
// plain-language request onto the CLOSED action registry (server-side) and
// returns one structured `InterpretResult`. The LLM never emits an endpoint,
// route, or free code — it picks a registry action id; the SERVER derives the
// executable shape below. See docs/nl-command-bar/STEP0-AND-DESIGN.md.

import type { RiskLevel } from './risk.js';
import type { Tier } from './tiers.js';

/** The five resolution outcomes. `plan` is typed but NOT executed in v1. */
export type InterpretKind = 'action' | 'plan' | 'clarify' | 'tier_gated' | 'none';

/**
 * A single resolved, server-validated action. Exactly one of `navigate` /
 * `endpoint` is set — both are derived server-side from the registry, never
 * supplied by the model.
 */
export interface ResolvedAction {
  /** Registry action id (closed set), e.g. 'create_workspace'. */
  id: string;
  /** Human-readable summary for the preview / approval surface. */
  label: string;
  /** Validated params the action was built from (for display + audit). */
  params: Record<string, unknown>;
  /** True → the frontend MUST render the approval surface before executing. */
  sideEffect: boolean;
  /** Risk badge for the approval surface (consistent with confirmation.ts). */
  riskLevel: RiskLevel;
  /** Navigation target — reuses CommandResult nav semantics (`onNavigate`). */
  navigate?: { type: string; id: string };
  /** Server-derived endpoint for a create / side-effect execute. */
  endpoint?: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: Record<string, unknown> };
}

/** The single structured result of an interpret call. */
export interface InterpretResult {
  kind: InterpretKind;
  /** kind === 'action'. */
  action?: ResolvedAction;
  /** kind === 'plan' — typed only; v1 downgrades to clarify/single-action. */
  steps?: ResolvedAction[];
  /** kind === 'clarify'. */
  question?: string;
  options?: string[];
  /** kind === 'tier_gated'. */
  capability?: string;
  requiredTier?: Tier;
  actualTier?: Tier;
  /** User-facing message (kind 'none', and a hint on others). */
  message?: string;
  /**
   * True when resolution failed/degraded (no key, LLM error, parse failure):
   * the frontend should fall back to Tier 0 results.
   */
  fallback?: boolean;
}

/** Request body for `POST /api/command/interpret`. */
export interface InterpretRequest {
  text: string;
  workspaceId?: string;
  /** Lightweight client hints (current route, etc.). Optional. */
  context?: Record<string, unknown>;
}
