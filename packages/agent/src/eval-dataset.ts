/**
 * Eval Dataset Builder — turns execution traces and harvest frames into
 * train/val/holdout splits for the self-evolution loop.
 *
 * Sources mined:
 *  - ExecutionTraceStore (outcome = success | verified → positive examples;
 *    outcome = corrected → negative example with correctionFeedback as ground truth)
 *  - Optional harvest frames (DistilledKnowledge) for Q&A-style augmentation
 *  - Optional corrections from ImprovementSignalStore
 *
 * Filter pipeline (in order):
 *  1. Secret scanning — reject any example containing credentials / tokens
 *  2. Keyword heuristic — min length, non-trivial content, no duplicate inputs
 *  3. Optional LLM-as-judge relevance filter (pass an llmCall callback)
 *
 * Split is deterministic given a seed — same traces + same seed = same split.
 * Default split ratio is 60/20/20 train/val/holdout.
 */

import type {
  ExecutionTraceStore,
  ParsedExecutionTrace,
  TraceOutcome,
  TraceQueryFilter,
} from '@waggle/core';

// ── Types ───────────────────────────────────────────────────────

export interface EvalExample {
  input: string;
  expected_output: string;
  metadata: EvalExampleMetadata;
}

export interface EvalExampleMetadata {
  traceId?: number;
  personaId?: string | null;
  taskShape?: string | null;
  model?: string | null;
  outcome?: TraceOutcome;
  tags?: string[];
  /** Where this example came from */
  source: 'trace' | 'harvest' | 'correction';
  /** Optional opaque identifier from the source system */
  sourceId?: string;
}

export interface DatasetSplit {
  train: EvalExample[];
  val: EvalExample[];
  holdout: EvalExample[];
  /** Examples that were filtered out — useful for debugging */
  rejected: Array<{ reason: string; preview: string }>;
  /** Stats for logging / UI */
  stats: {
    sourced: number;
    acceptedAfterSecretScan: number;
    acceptedAfterHeuristic: number;
    acceptedAfterJudge: number;
    unique: number;
    total: number;
  };
}

export interface BuildOptions {
  /** Which trace outcomes count as positive examples (default: ['success', 'verified']). */
  positiveOutcomes?: TraceOutcome[];
  /** Whether to include correction traces as negative examples with feedback as expected_output (default true). */
  includeCorrections?: boolean;
  /** Filter passed straight through to ExecutionTraceStore.query */
  traceFilter?: Omit<TraceQueryFilter, 'outcome' | 'limit'> & { limit?: number };
  /** Optional external augmenters */
  harvestExamples?: EvalExample[];
  correctionExamples?: EvalExample[];
  /** Minimum input characters to keep the example (default 10). */
  minInputChars?: number;
  /** Minimum expected_output characters to keep the example (default 5). */
  minOutputChars?: number;
  /** Maximum input + output characters combined; over this, the example is rejected (default 16384). */
  maxCombinedChars?: number;
  /** Optional LLM-as-judge relevance filter. Pass null or omit to skip. */
  judge?: (example: EvalExample) => Promise<JudgeVerdict>;
  /** Ratio triple summing to 1.0 (default [0.6, 0.2, 0.2]). */
  splitRatios?: [number, number, number];
  /** Deterministic seed (default 1). */
  seed?: number;
}

export interface JudgeVerdict {
  keep: boolean;
  reason?: string;
}

// ── Secret patterns (curated from GitHub/OWASP secret-scanning conventions) ──

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'aws-secret-key', re: /\baws(.{0,20})?['"`][0-9a-zA-Z/+]{40}['"`]/ },
  { name: 'github-pat', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'github-fine-grained', re: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/ },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/ },
  { name: 'openai-key', re: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_\-]{20,}\b/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { name: 'stripe-secret', re: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'stripe-publishable', re: /\bpk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/ },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/ },
  { name: 'bearer-token', re: /\bAuthorization:\s*Bearer\s+[A-Za-z0-9_\-\.=]{20,}/i },
  { name: 'basic-auth-url', re: /https?:\/\/[^\/:]+:[^@\/]+@/ },
  { name: 'env-password', re: /\b(?:PASSWORD|PASSWD|SECRET|API_KEY|PRIVATE_KEY)\s*=\s*['"]?[^\s'"]{8,}['"]?/i },
  { name: 'pgsql-url', re: /\bpostgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s]+/ },
  { name: 'generic-high-entropy', re: /\b(?:secret|token|key)['"`\s]{0,3}[:=]['"`\s]{0,3}[A-Za-z0-9+\/=]{32,}\b/i },
];

/** Returns the first secret pattern the text matches, or null if clean. */
export function detectSecrets(text: string): string | null {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) return name;
  }
  return null;
}

/** Exported for tests / tools that want the full list. */
export const SECRET_PATTERN_NAMES = SECRET_PATTERNS.map(p => p.name);

// ── Deterministic PRNG (mulberry32) ─────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle in-place using provided rng. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Builder ─────────────────────────────────────────────────────

export class EvalDatasetBuilder {
  private store: ExecutionTraceStore;

  constructor(store: ExecutionTraceStore) {
    this.store = store;
  }

  /** Mine traces into a typed example list (before filtering). */
  sourceFromTraces(
    positiveOutcomes: TraceOutcome[],
    includeCorrections: boolean,
    filter: BuildOptions['traceFilter'] = {},
  ): EvalExample[] {
    const outcomes: TraceOutcome[] = [...positiveOutcomes];
    if (includeCorrections) outcomes.push('corrected');

    const rows = this.store.queryParsed({
      ...filter,
      outcome: outcomes,
      limit: filter.limit ?? 10_000,
    });

    return rows.map(row => traceToExample(row, includeCorrections));
  }

  /**
   * Build the full dataset split.
   *
   * Filter order:
   *   1. Source (traces + augmenters)
   *   2. Secret scan
   *   3. Heuristic (length, non-trivial)
   *   4. Optional judge
   *   5. Dedup on input hash
   *   6. Shuffle + split
   */
  async build(options: BuildOptions = {}): Promise<DatasetSplit> {
    const positiveOutcomes = options.positiveOutcomes ?? ['success', 'verified'];
    const includeCorrections = options.includeCorrections ?? true;
    const minInputChars = options.minInputChars ?? 10;
    const minOutputChars = options.minOutputChars ?? 5;
    const maxCombinedChars = options.maxCombinedChars ?? 16_384;
    const splitRatios = options.splitRatios ?? [0.6, 0.2, 0.2];
    const seed = options.seed ?? 1;

    validateRatios(splitRatios);

    const rejected: DatasetSplit['rejected'] = [];

    // 1. Source
    const traceExamples = this.sourceFromTraces(
      positiveOutcomes,
      includeCorrections,
      options.traceFilter,
    );
    const sourced: EvalExample[] = [
      ...traceExamples,
      ...(options.harvestExamples ?? []),
      ...(options.correctionExamples ?? []),
    ];

    // 2. Secret scan
    const afterSecretScan: EvalExample[] = [];
    for (const ex of sourced) {
      const hitInput = detectSecrets(ex.input);
      const hitOutput = detectSecrets(ex.expected_output);
      if (hitInput || hitOutput) {
        rejected.push({
          reason: `secret:${hitInput ?? hitOutput}`,
          preview: ex.input.slice(0, 80),
        });
        continue;
      }
      afterSecretScan.push(ex);
    }

    // 3. Heuristic
    const afterHeuristic: EvalExample[] = [];
    for (const ex of afterSecretScan) {
      const input = ex.input.trim();
      const output = ex.expected_output.trim();
      if (input.length < minInputChars) {
        rejected.push({ reason: 'too-short-input', preview: input.slice(0, 80) });
        continue;
      }
      if (output.length < minOutputChars) {
        rejected.push({ reason: 'too-short-output', preview: input.slice(0, 80) });
        continue;
      }
      if (input.length + output.length > maxCombinedChars) {
        rejected.push({ reason: 'too-long', preview: input.slice(0, 80) });
        continue;
      }
      if (isLowSignal(input) || isLowSignal(output)) {
        rejected.push({ reason: 'low-signal', preview: input.slice(0, 80) });
        continue;
      }
      afterHeuristic.push({ ...ex, input, expected_output: output });
    }

    // 4. Optional judge
    let afterJudge = afterHeuristic;
    if (options.judge) {
      afterJudge = [];
      for (const ex of afterHeuristic) {
        try {
          const verdict = await options.judge(ex);
          if (verdict.keep) {
            afterJudge.push(ex);
          } else {
            rejected.push({
              reason: `judge:${verdict.reason ?? 'rejected'}`,
              preview: ex.input.slice(0, 80),
            });
          }
        } catch (err) {
          // On judge failure, keep the example — err on the side of more data.
          afterJudge.push(ex);
        }
      }
    }

    // 5. Dedup on input hash
    const seen = new Set<string>();
    const unique: EvalExample[] = [];
    for (const ex of afterJudge) {
      const key = hashKey(ex.input);
      if (seen.has(key)) {
        rejected.push({ reason: 'duplicate', preview: ex.input.slice(0, 80) });
        continue;
      }
      seen.add(key);
      unique.push(ex);
    }

    // 6. Shuffle + split
    const rng = makeRng(seed);
    const shuffled = shuffle([...unique], rng);
    const { train, val, holdout } = splitExamples(shuffled, splitRatios);

    return {
      train,
      val,
      holdout,
      rejected,
      stats: {
        sourced: sourced.length,
        acceptedAfterSecretScan: afterSecretScan.length,
        acceptedAfterHeuristic: afterHeuristic.length,
        acceptedAfterJudge: afterJudge.length,
        unique: unique.length,
        total: train.length + val.length + holdout.length,
      },
    };
  }
}

// ── JSONL IO ────────────────────────────────────────────────────

/** Serialize examples as JSONL (one JSON object per line). */
export function toJSONL(examples: EvalExample[]): string {
  return examples.map(ex => JSON.stringify(ex)).join('\n');
}

/** Parse JSONL into examples. Silently skips unparseable lines. */
export function fromJSONL(jsonl: string): EvalExample[] {
  const out: EvalExample[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (
        parsed &&
        typeof parsed.input === 'string' &&
        typeof parsed.expected_output === 'string' &&
        parsed.metadata
      ) {
        out.push(parsed as EvalExample);
      }
    } catch {
      // skip malformed line
    }
  }
  return out;
}

// ── Helpers ─────────────────────────────────────────────────────

function traceToExample(
  trace: ParsedExecutionTrace,
  includeCorrections: boolean,
): EvalExample {
  const isCorrected = trace.outcome === 'corrected';
  const expected = isCorrected && includeCorrections
    ? (trace.payload.correctionFeedback ?? trace.payload.output)
    : trace.payload.output;

  return {
    input: trace.payload.input,
    expected_output: expected,
    metadata: {
      traceId: trace.id,
      personaId: trace.persona_id,
      taskShape: trace.task_shape,
      model: trace.model,
      outcome: trace.outcome,
      tags: trace.payload.tags ?? [],
      source: isCorrected ? 'correction' : 'trace',
    },
  };
}

function validateRatios(ratios: [number, number, number]): void {
  const sum = ratios[0] + ratios[1] + ratios[2];
  if (Math.abs(sum - 1.0) > 1e-6) {
    throw new Error(`Split ratios must sum to 1.0, got ${sum}`);
  }
  if (ratios.some(r => r < 0)) {
    throw new Error('Split ratios must be non-negative');
  }
}

function splitExamples(
  examples: EvalExample[],
  ratios: [number, number, number],
): { train: EvalExample[]; val: EvalExample[]; holdout: EvalExample[] } {
  const n = examples.length;
  // Floor-then-assign-remainders so every example ends up in exactly one split.
  const trainN = Math.floor(n * ratios[0]);
  const valN = Math.floor(n * ratios[1]);
  const holdoutN = n - trainN - valN;

  return {
    train: examples.slice(0, trainN),
    val: examples.slice(trainN, trainN + valN),
    holdout: examples.slice(trainN + valN, trainN + valN + holdoutN),
  };
}

/**
 * Cheap signal check — reject examples that are mostly whitespace, repeated
 * punctuation, or otherwise meaningless. Not a language detector.
 */
function isLowSignal(text: string): boolean {
  if (!text) return true;
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length < 3) return true;
  // 80%+ of the same character → reject
  const counts = new Map<string, number>();
  for (const ch of stripped) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  if (maxCount / stripped.length > 0.8) return true;
  // No alphanumeric at all → reject
  if (!/[A-Za-z0-9]/.test(stripped)) return true;
  return false;
}

/**
 * FNV-1a 32-bit hash — stable across processes, no crypto import needed.
 * Used for input-level dedup.
 */
function hashKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
