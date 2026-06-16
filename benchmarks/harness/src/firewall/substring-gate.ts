/**
 * Gold-substring gate — the leakage firewall's spine (02 §5.2, 03 C1/C4/C6).
 *
 * Scans EVERY written artifact (frames, skill bodies, write-back, identity,
 * awareness, user turns — 03 C1) for EVERY Phase-B gold answer, in BOTH:
 *   - exact form (raw `includes` — catches verbatim copies), and
 *   - normalized form (`normalizeForMatch` on both sides — catches case/spacing/
 *     punctuation/Unicode re-encodings that defeat a naive `includes`).
 *
 * A single hit ⇒ `passed=false`. Per 03 C6, do NOT rely on mechanism-spread as a
 * defense; this gate (plus the embedding gate) IS the defense, so it is exhaustive:
 * it reports ALL (artifact, gold) hits, not just the first.
 *
 * Short-gold guard: a 1-3 token gold ("Yes", "$50") would false-positive on
 * ordinary text. Golds whose NORMALIZED length is below `minGoldChars` are
 * skipped by the substring gate and recorded in `skipped_short_golds` — they are
 * the embedding gate's responsibility (semantic match), and the caller MUST run
 * the embedding gate (it does, per the firewall wiring in Plan 08).
 *
 * Pure + deterministic. Does NOT throw on a finding — it returns a report so the
 * caller can emit a per-row audit event (03 C8) before deciding to halt.
 */

import { normalizeForMatch } from './normalize.js';
import { collectArtifactTexts, type Artifact } from './artifact.js';

export interface Gold {
  /** Phase-B task this gold belongs to (for the audit trail). */
  task_id: string;
  /** The gold answer string that must never appear in the mind. */
  text: string;
}

export interface SubstringGateOptions {
  /** Minimum normalized gold length to run the substring gate. Default 8.
   *  Shorter golds are deferred to the embedding gate (see module doc). */
  minGoldChars?: number;
}

export type SubstringMatchType = 'exact' | 'normalized';

export interface SubstringHit {
  artifact_kind: string;
  artifact_id: string;
  gold_task_id: string;
  match_type: SubstringMatchType;
}

export interface SubstringGateResult {
  /** True iff zero hits across all (artifact, gold) pairs. */
  passed: boolean;
  hits: SubstringHit[];
  /** task_ids skipped because their normalized form was shorter than minGoldChars. */
  skipped_short_golds: string[];
  n_artifacts: number;
  n_golds: number;
  min_gold_chars: number;
}

const DEFAULT_MIN_GOLD_CHARS = 8;

export function assertNoGoldSubstring(
  artifacts: readonly Artifact[],
  golds: readonly Gold[],
  options: SubstringGateOptions = {},
): SubstringGateResult {
  if (!Array.isArray(golds)) {
    throw new Error('assertNoGoldSubstring requires an array of golds');
  }
  const minGoldChars = options.minGoldChars ?? DEFAULT_MIN_GOLD_CHARS;
  // collectArtifactTexts validates the artifacts array + each artifact shape.
  const flat = collectArtifactTexts(artifacts);

  // Pre-normalize each artifact once (O(A + G·A) total instead of O(G·A) normalizations).
  const normArtifacts = flat.map(a => ({ ...a, norm: normalizeForMatch(a.text) }));

  const hits: SubstringHit[] = [];
  const skipped_short_golds: string[] = [];

  for (const gold of golds) {
    if (typeof gold?.text !== 'string') {
      throw new Error(`gold text must be a string (task ${gold?.task_id})`);
    }
    if (typeof gold.task_id !== 'string') {
      throw new Error('gold task_id must be a string');
    }
    const normGold = normalizeForMatch(gold.text);
    if (normGold.length < minGoldChars) {
      skipped_short_golds.push(gold.task_id);
      continue;
    }
    for (let i = 0; i < flat.length; i++) {
      const art = flat[i];
      // Exact takes priority in the reported match_type; otherwise normalized.
      if (art.text.includes(gold.text)) {
        hits.push({
          artifact_kind: art.kind,
          artifact_id: art.id,
          gold_task_id: gold.task_id,
          match_type: 'exact',
        });
        continue;
      }
      if (normArtifacts[i].norm.includes(normGold)) {
        hits.push({
          artifact_kind: art.kind,
          artifact_id: art.id,
          gold_task_id: gold.task_id,
          match_type: 'normalized',
        });
      }
    }
  }

  return {
    passed: hits.length === 0,
    hits,
    skipped_short_golds,
    n_artifacts: flat.length,
    n_golds: golds.length,
    min_gold_chars: minGoldChars,
  };
}
