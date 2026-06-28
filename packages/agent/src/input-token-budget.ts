/**
 * Adaptive input-token budget for the context compressor.
 *
 * Clean-room re-implementation of the odysseus `compute_input_token_budget`
 * control-flow (concept/math only — no AGPL code). Pure and side-effect free so
 * it is unit-testable.
 *
 * The context compressor (`context-compressor.ts`) historically defaulted
 * `maxContextTokens` to 128000 for EVERY model, so a local 4k/8k Ollama model was
 * sized as if it had a 128k window — over-sizing the prompt and mis-triggering
 * compaction. This derives the effective window from the model's discovered context
 * window: honour an explicit user cap exactly (clamped to the window), otherwise scale
 * to `headroom` of the window capped at a hard max, and stay conservative when the
 * window is unknown.
 */

/** Auto-budget ceiling — covers 128k models, bounds 1M-context models. */
export const DEFAULT_HARD_MAX = 200_000;
/** Fraction of a known window used as the effective budget (output + estimator margin). */
export const DEFAULT_HEADROOM = 0.85;
/** Conservative window assumed when the model's true window is unknown. */
export const DEFAULT_CONTEXT_WINDOW = 8_192;

export interface InputTokenBudgetOptions {
  /** Conservative window when `contextLength <= 0`. Default `DEFAULT_CONTEXT_WINDOW`. */
  readonly conservativeDefault?: number;
  /** Auto-scale fraction of a known window. Default `DEFAULT_HEADROOM`. */
  readonly headroom?: number;
  /** Cap for the auto-scaled budget only (never clamps an explicit user cap). Default `DEFAULT_HARD_MAX`. */
  readonly hardMax?: number;
}

/**
 * Return the effective `maxContextTokens` for the compressor.
 *
 * @param configured   value read from settings (may be 0 / the materialized default).
 * @param contextLength the model's discovered context window; pass 0 when unknown.
 * @param explicit      true iff the user set a NON-default budget (an explicit cap).
 *
 * Rules:
 *  - explicit + configured>0 → honour exactly, clamped to the window only when known.
 *  - auto + window known      → floor(window × headroom), clamped to [1, hardMax].
 *  - window unknown           → configured>0 ? configured : conservativeDefault.
 */
export function computeInputTokenBudget(
  configured: number,
  contextLength: number,
  explicit: boolean,
  opts: InputTokenBudgetOptions = {},
): number {
  const headroom = opts.headroom ?? DEFAULT_HEADROOM;
  const hardMax = opts.hardMax ?? DEFAULT_HARD_MAX;
  const fallback = opts.conservativeDefault ?? DEFAULT_CONTEXT_WINDOW;

  const cfg = Math.max(0, Math.floor(Number.isFinite(configured) ? configured : 0));
  const ctx = Math.max(0, Math.floor(Number.isFinite(contextLength) ? contextLength : 0));

  if (explicit && cfg > 0) {
    return ctx > 0 ? Math.min(cfg, ctx) : cfg;
  }

  if (ctx > 0) {
    const scaled = Math.floor(ctx * headroom);
    return Math.max(1, Math.min(scaled, hardMax));
  }

  return cfg > 0 ? cfg : fallback;
}

/**
 * Best-effort, synchronous discovery of a model's context window from its id.
 *
 * Mirrors the provider-prefix parsing in `model-availability.ts`. Returns 0 for any
 * model whose window we cannot assert from the id — INCLUDING all `ollama/*` local
 * models — so `computeInputTokenBudget` falls back to the conservative default rather
 * than the old 128k assumption. (A precise Ollama window needs an `/api/show` lookup;
 * deferred.)
 */
export function getModelContextWindow(model: string): number {
  const m = model.trim().toLowerCase();
  if (!m) return 0;
  if (m.startsWith('ollama/')) return 0;            // local: stay conservative
  if (m.startsWith('claude-') || m.startsWith('anthropic/')) return 200_000;
  if (m.startsWith('gemini-') || m.startsWith('google/')) return 1_000_000;
  if (m.startsWith('gpt-') || m.startsWith('openai/') || /^o\d/.test(m)) return 128_000;
  return 0;                                         // unknown → conservative
}
