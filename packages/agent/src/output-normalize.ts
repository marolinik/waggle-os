/**
 * Output normalization layer — Phase 1.1 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md)
 *
 * Strips reasoning leakage, copied metadata, format scaffolding from
 * model outputs. Produces a `(raw, normalized, actions)` triple so every
 * transformation is auditable and the original signal is never lost.
 *
 * HARD CONSTRAINT (from work order):
 *   "unknown" → "" silently strips legitimate abstention signal — DO NOT.
 *   Map "unknown" / "Unknown" / "Unknown." / "N/A" → canonical "unknown"
 *   (preserved, never empty).
 *
 * Configurable per use case via PRESETS:
 *   - production:        light touch — only obvious leakage (think tags),
 *                        no aggressive label/fence stripping that could
 *                        break user-facing markdown
 *   - benchmark-strict:  full strip — for short-answer benchmarks where
 *                        any extra text counts as wrong
 *   - benchmark-lenient: middle ground — strip leakage + metadata but
 *                        preserve format
 */

export interface NormalizationAction {
  rule: string;
  before: string;
  after: string;
}

export interface NormalizationResult {
  raw: string;
  normalized: string;
  actions: NormalizationAction[];
}

export interface NormalizationConfig {
  /** Strip <think>...</think> blocks (Qwen reasoning leakage). */
  stripThinkTags: boolean;

  /** Strip leading "Answer:" / "Final answer:" / "Final answer is:" labels. */
  stripAnswerLabels: boolean;

  /**
   * Strip markdown fence markers when the WHOLE response is a single fenced
   * block. Does not strip fences mid-response (those may be legitimate code).
   */
  stripWholeResponseMarkdownFence: boolean;

  /**
   * Strip lines that are obviously copied retrieval / memory metadata, e.g.
   *   [memory:synth]
   *   # Recalled Memories
   *   [retrieved 1/8]
   *   <retrieval_context>...</retrieval_context>
   */
  stripCopiedMetadata: boolean;

  /**
   * Aliases that map to the canonical "unknown" abstention. Comparison is
   * case-insensitive and trailing-punctuation-tolerant. The canonical
   * output is the literal string "unknown" (lowercase, no punctuation).
   *
   * IMPORTANT: this NEVER strips abstention to empty. If the input matches
   * any alias, the output is exactly "unknown" — preserved as a signal.
   */
  unknownAliases: readonly string[];

  /**
   * Collapse multiple blank lines to a single blank line. Off by default
   * because some markdown structure (e.g. h2 + table) reads better with
   * preserved blank-line spacing.
   */
  collapseBlankLines: boolean;

  /** Trim leading/trailing whitespace on the final normalized text. */
  trimWhitespace: boolean;
}

const DEFAULT_UNKNOWN_ALIASES: readonly string[] = [
  'unknown',
  'unknown.',
  'n/a',
  'na',
  'not available',
  'not provided',
  'i don\'t know',
  "don't know",
  'cannot determine',
  'no answer',
];

export const PRESETS: Record<string, NormalizationConfig> = {
  production: {
    stripThinkTags: true,
    stripAnswerLabels: false,
    stripWholeResponseMarkdownFence: false,
    stripCopiedMetadata: true,
    unknownAliases: DEFAULT_UNKNOWN_ALIASES,
    collapseBlankLines: false,
    trimWhitespace: true,
  },
  'benchmark-strict': {
    stripThinkTags: true,
    stripAnswerLabels: true,
    stripWholeResponseMarkdownFence: true,
    stripCopiedMetadata: true,
    unknownAliases: DEFAULT_UNKNOWN_ALIASES,
    collapseBlankLines: true,
    trimWhitespace: true,
  },
  'benchmark-lenient': {
    stripThinkTags: true,
    stripAnswerLabels: true,
    stripWholeResponseMarkdownFence: false,
    stripCopiedMetadata: true,
    unknownAliases: DEFAULT_UNKNOWN_ALIASES,
    collapseBlankLines: false,
    trimWhitespace: true,
  },
};

const THINK_TAG_REGEX = /<think>[\s\S]*?<\/think>/gi;
const ANSWER_LABEL_REGEX = /^\s*(?:final\s+answer\s+is\s*:|final\s+answer\s*:|answer\s*:)\s*/i;
const COPIED_METADATA_LINE_REGEX = /^\s*(?:\[(?:memory|retrieved|context|recall)[^\]]*\]|<\/?(?:retrieval|memory|context)_?\w*>|#+\s+recalled\s+memories?|#+\s+retrieved\s+context)\s*$/im;
const WHOLE_RESPONSE_FENCE_REGEX = /^\s*```(?:[a-z0-9_-]+)?\s*\n([\s\S]*?)\n\s*```\s*$/i;

function recordAction(
  actions: NormalizationAction[],
  rule: string,
  before: string,
  after: string,
): void {
  if (before === after) return;
  actions.push({ rule, before, after });
}

function applyStripThinkTags(text: string, actions: NormalizationAction[]): string {
  if (!THINK_TAG_REGEX.test(text)) return text;
  THINK_TAG_REGEX.lastIndex = 0;
  const after = text.replace(THINK_TAG_REGEX, '');
  recordAction(actions, 'strip-think-tags', text, after);
  return after;
}

function applyStripAnswerLabels(text: string, actions: NormalizationAction[]): string {
  if (!ANSWER_LABEL_REGEX.test(text)) return text;
  const after = text.replace(ANSWER_LABEL_REGEX, '');
  recordAction(actions, 'strip-answer-labels', text, after);
  return after;
}

function applyStripWholeResponseMarkdownFence(
  text: string,
  actions: NormalizationAction[],
): string {
  const m = text.match(WHOLE_RESPONSE_FENCE_REGEX);
  if (!m) return text;
  const after = m[1] ?? '';
  recordAction(actions, 'strip-whole-response-markdown-fence', text, after);
  return after;
}

function applyStripCopiedMetadata(text: string, actions: NormalizationAction[]): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let stripped = 0;
  for (const line of lines) {
    if (COPIED_METADATA_LINE_REGEX.test(line)) {
      stripped += 1;
      continue;
    }
    kept.push(line);
  }
  if (stripped === 0) return text;
  const after = kept.join('\n');
  recordAction(actions, `strip-copied-metadata (${stripped} lines)`, text, after);
  return after;
}

function applyCollapseBlankLines(text: string, actions: NormalizationAction[]): string {
  const after = text.replace(/\n[ \t]*\n[ \t]*(\n[ \t]*)+/g, '\n\n');
  if (after === text) return text;
  recordAction(actions, 'collapse-blank-lines', text, after);
  return after;
}

function applyTrimWhitespace(text: string, actions: NormalizationAction[]): string {
  const after = text.trim();
  if (after === text) return text;
  recordAction(actions, 'trim-whitespace', text, after);
  return after;
}

function applyUnknownAliases(
  text: string,
  unknownAliases: readonly string[],
  actions: NormalizationAction[],
): string {
  const candidate = text.trim().replace(/[.!?]+\s*$/, '').toLowerCase();
  if (!candidate) return text;
  for (const alias of unknownAliases) {
    if (candidate === alias.toLowerCase()) {
      const after = 'unknown';
      if (text === after) return text;
      recordAction(actions, `unknown-alias-canonicalize (matched "${alias}")`, text, after);
      return after;
    }
  }
  return text;
}

/**
 * Normalize a model output per the supplied config. Returns the raw input,
 * the normalized output, and an audit trail of every transformation applied
 * (in execution order). Empty inputs pass through unchanged with no actions.
 *
 * Order of operations is fixed and deliberate:
 *   1. strip <think> tags     (largest substring removal first)
 *   2. strip copied metadata  (line-level removal, makes label match easier)
 *   3. strip whole-response markdown fence (whole-content unwrap)
 *   4. strip answer labels    (prefix removal on remaining text)
 *   5. collapse blank lines
 *   6. trim whitespace
 *   7. apply unknown aliases  (LAST — preserves abstention signal as canonical)
 *
 * The unknown-alias step runs LAST so it sees the fully cleaned candidate
 * and can collapse it to canonical "unknown" iff the entire content is an
 * abstention. The hard constraint is that this NEVER produces empty output
 * for a non-empty input that matched an alias.
 */
export function normalize(text: string, config: NormalizationConfig): NormalizationResult {
  const raw = text;
  const actions: NormalizationAction[] = [];

  if (!text) {
    return { raw, normalized: text, actions };
  }

  let cur = text;

  if (config.stripThinkTags) {
    cur = applyStripThinkTags(cur, actions);
  }
  if (config.stripCopiedMetadata) {
    cur = applyStripCopiedMetadata(cur, actions);
  }
  if (config.stripWholeResponseMarkdownFence) {
    cur = applyStripWholeResponseMarkdownFence(cur, actions);
  }
  if (config.stripAnswerLabels) {
    cur = applyStripAnswerLabels(cur, actions);
  }
  if (config.collapseBlankLines) {
    cur = applyCollapseBlankLines(cur, actions);
  }
  if (config.trimWhitespace) {
    cur = applyTrimWhitespace(cur, actions);
  }
  if (config.unknownAliases.length > 0) {
    cur = applyUnknownAliases(cur, config.unknownAliases, actions);
  }

  return { raw, normalized: cur, actions };
}

/**
 * Convenience: normalize using one of the named PRESETS. Throws if the
 * preset name is unknown.
 */
export function normalizeWithPreset(text: string, presetName: string): NormalizationResult {
  const config = PRESETS[presetName];
  if (!config) {
    throw new Error(
      `output-normalize: unknown preset "${presetName}" — ` +
      `available: ${Object.keys(PRESETS).join(', ')}`,
    );
  }
  return normalize(text, config);
}
