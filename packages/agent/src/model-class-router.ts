/**
 * Deterministic capability-aware model selection — the portable subset of
 * OpenHuman's model routing (docs/analysis/openhuman-adoption-2026-06-28.md §3.B).
 *
 * Scope is deliberately NARROW (§3.2): a fixed allowlist of KNOWN-lightweight
 * internal calls (compaction summary, classification, short extraction) is
 * routed to the cheapest ready model — Haiku on the built-in Anthropic proxy by
 * default. There is NO task-complexity classifier (that would need its own
 * cost-bearing model and risks mis-routing real reasoning); call sites declare
 * `class: 'lightweight'` a priori, so routing stays deterministic.
 *
 * The universal win is Haiku-on-proxy: ~10–12× cheaper than Sonnet and it
 * materializes for a vanilla FREE user with no local model, protecting the
 * Waggle-funded built-in proxy. A `privacyRequired` call is NEVER downgraded to
 * a cloud budget model — it keeps the caller's model (or a provided on-device
 * model), so "sensitive work stays on-device" can never silently leak to cloud.
 */

export type ModelClass = 'lightweight' | 'reasoning' | 'general';

export interface ModelClassOpts {
  /** Declared workload class for this call. */
  klass?: ModelClass;
  /** When true, never route to a cloud budget model; keep on-device. */
  privacyRequired?: boolean;
  /** Cheap model for lightweight internal calls (default applied by the caller). */
  lightweightModel?: string;
  /** A ready on-device model id (e.g. 'ollama/llama3.1'), when one is configured. */
  localModel?: string;
}

/** The default cheap model for lightweight internal calls on the built-in proxy. */
export const LIGHTWEIGHT_MODEL = 'claude-haiku-4-5';

/**
 * Resolve the effective model for a known internal call. Pure + synchronous.
 *
 *  - privacyRequired  → on-device model if provided, else the caller's model
 *                       (precedence over the lightweight override — never cloud).
 *  - class lightweight → the cheap model, when one is supplied.
 *  - otherwise         → unchanged.
 */
export function resolveModelForClass(requestedModel: string, opts: ModelClassOpts = {}): string {
  if (opts.privacyRequired) return opts.localModel ?? requestedModel;
  if (opts.klass === 'lightweight' && opts.lightweightModel) return opts.lightweightModel;
  return requestedModel;
}
