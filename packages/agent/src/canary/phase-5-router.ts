/**
 * Phase 5 canary router — deterministic per-request routing between
 * pre-Phase-5 baseline shapes and GEPA-evolved variants.
 *
 * Reads WAGGLE_PHASE5_CANARY_PCT (0-100, default 0) via FEATURE_FLAGS, hashes
 * the request_id into a stable 0-99 bucket, and routes to the canary variant
 * iff bucket < canary_pct AND the base shape has a canary mapping AND the
 * canary shape is registered.
 *
 * BIND (manifest gepa-phase-5/manifest.yaml § canary_toggle):
 *   - Deterministic per-request_id routing preserves A/B paired-comparison
 *     validity for §3 monitoring (same request_id always routes the same way).
 *   - Default canary_pct = 0 until PM canary kick-off ratification (§7.3).
 *   - Hot reconfig via process restart; no code redeploy required.
 *   - LOCKED scope (manifest § scope_LOCKED): claude::gen1-v1 +
 *     qwen-thinking::gen1-v1. Mid-flight scope changes require new LOCKED
 *     decision memo + Marko ratifikacija.
 *
 * AUDIT: gepa-phase-5/manifest.yaml § canary_toggle, § scope_LOCKED.
 */

import { FEATURE_FLAGS } from '../feature-flags.js';
import { selectShape, REGISTRY, type SelectShapeOptions } from '../prompt-shapes/selector.js';
import type { PromptShape } from '../prompt-shapes/types.js';

/**
 * Phase 5 LOCKED variant scope. Maps a base shape `name` to its evolved
 * variant's REGISTRY key. Both directions of the mapping are pinned by the
 * scope LOCK (decisions/2026-04-29-phase-5-scope-LOCKED.md).
 *
 * NOT mapped (intentional, per scope LOCK): qwen-non-thinking, gpt,
 * generic-simple. These remain on baseline shapes.
 */
export const BASE_TO_CANARY_VARIANT_MAP: Readonly<Record<string, string>> = Object.freeze({
  claude: 'claude::gen1-v1',
  'qwen-thinking': 'qwen-thinking::gen1-v1',
});

export interface RouteResult {
  /** The PromptShape selected (canary variant or baseline). */
  shape: PromptShape;
  /** True iff routed to a Phase 5 canary variant. */
  isCanary: boolean;
  /** Base shape name resolved by selectShape() before canary consideration. */
  baseShapeName: string;
  /** Canary variant REGISTRY key (only when isCanary === true). */
  canaryShapeName?: string;
  /** Bucket [0, 99] computed from requestId. Useful for monitoring telemetry. */
  bucket: number;
  /** Canary percentage at routing time (snapshotted from FEATURE_FLAGS). */
  canaryPct: number;
}

export interface RouteOptions extends SelectShapeOptions {
  /**
   * Override canary_pct for this single call. Useful for tests + replay.
   * Production callers should rely on FEATURE_FLAGS.PHASE_5_CANARY_PCT.
   * Invalid values fall back to 0 (canary OFF).
   */
  canaryPctOverride?: number;
}

/**
 * Hash a request id into a stable 0-99 bucket using FNV-1a.
 *
 * Properties:
 *   - Deterministic: same input always returns same bucket.
 *   - Reasonable distribution across short alphanumeric request ids.
 *   - Fast (no crypto, no allocations beyond input traversal).
 *
 * Not cryptographically secure — strictly for canary bucketing.
 */
export function hashRequestIdToBucket(requestId: string): number {
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return 0; // fail-safe: non-strings + empty strings → bucket 0
  }
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < requestId.length; i++) {
    hash ^= requestId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime, with 32-bit truncation via Math.imul
    hash >>>= 0; // unsigned 32-bit
  }
  return hash % 100;
}

/**
 * Validate a canary_pct override value. Mirrors feature-flags.ts parser
 * semantics (fail-safe to 0 on malformed input).
 */
function clampCanaryPct(raw: number | undefined): number {
  if (raw === undefined) return FEATURE_FLAGS.PHASE_5_CANARY_PCT;
  if (!Number.isFinite(raw)) return 0;
  if (!Number.isInteger(raw)) return 0;
  if (raw < 0 || raw > 100) return 0;
  return raw;
}

/**
 * Resolve the base shape NAME for a model alias by inspecting the result of
 * selectShape(). Mirrors selectShape's resolution order; returns the
 * `shape.name` string field (which is stable on every PromptShape).
 *
 * If override is provided, returns the override directly (without resolution).
 */
function resolveBaseShapeName(modelAlias: string, options: SelectShapeOptions): string {
  if (options.override) return options.override;
  const shape = selectShape(modelAlias, options);
  return shape.name;
}

/**
 * Route a request to a Phase 5 canary variant or to the baseline shape.
 *
 * Resolution order:
 *   1. Resolve baseline shape name via selectShape() (or options.override).
 *   2. Look up canary variant in BASE_TO_CANARY_VARIANT_MAP.
 *   3. If no canary mapping: return baseline.
 *   4. If canary variant not registered (e.g. shape file missing): return
 *      baseline (fail-safe — never crash a request because evolved variant
 *      isn't loaded yet).
 *   5. Hash requestId into 0-99 bucket; if bucket < canary_pct: route to
 *      canary variant; else: return baseline.
 *
 * Audit: returns full provenance (baseShapeName, canaryShapeName, bucket,
 * canaryPct) so §3 monitoring can record per-request routing decisions.
 */
export function routeRequestToVariant(
  modelAlias: string,
  requestId: string,
  options: RouteOptions = {},
): RouteResult {
  const canaryPct = clampCanaryPct(options.canaryPctOverride);
  const bucket = hashRequestIdToBucket(requestId);
  const baseShapeName = resolveBaseShapeName(modelAlias, options);
  const baseShape = selectShape(modelAlias, options);

  // Canary OFF or no mapping or variant not loaded → return baseline.
  if (canaryPct <= 0) {
    return { shape: baseShape, isCanary: false, baseShapeName, bucket, canaryPct };
  }
  const canaryShapeName = BASE_TO_CANARY_VARIANT_MAP[baseShapeName];
  if (!canaryShapeName) {
    return { shape: baseShape, isCanary: false, baseShapeName, bucket, canaryPct };
  }
  const canaryShape = REGISTRY[canaryShapeName];
  if (!canaryShape) {
    // Variant declared in scope but not registered (e.g. shape file deleted or
    // not yet loaded). Fail-safe to baseline; surface via return value rather
    // than throw so the request still serves.
    return { shape: baseShape, isCanary: false, baseShapeName, bucket, canaryPct };
  }

  // Bucket < canaryPct → route to canary.
  if (bucket < canaryPct) {
    return {
      shape: canaryShape,
      isCanary: true,
      baseShapeName,
      canaryShapeName,
      bucket,
      canaryPct,
    };
  }
  return { shape: baseShape, isCanary: false, baseShapeName, bucket, canaryPct };
}

/**
 * Inspector — list shape NAMES that have an active canary mapping.
 * Useful for §3 monitoring + manifest cross-checks.
 */
export function listCanaryEligibleShapes(): string[] {
  return Object.keys(BASE_TO_CANARY_VARIANT_MAP);
}

/**
 * Inspector — list canary variant REGISTRY keys (in-scope per LOCK).
 */
export function listCanaryVariants(): string[] {
  return Object.values(BASE_TO_CANARY_VARIANT_MAP);
}
