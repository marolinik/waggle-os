/**
 * Leakage-firewall module barrel (06-PLAN-leakage-firewall.md).
 *
 * The credibility backbone of the harness-SOTA benchmark: ex-ante invariants
 * (02 §5) implemented + unit-tested BEFORE pre-registration (03 C8), covering
 * ALL written artifacts (03 C1). Plan 08 wires these into the run loop and emits
 * one events.jsonl row per assertion per run row.
 */

export { normalizeForMatch } from './normalize.js';

export { collectArtifactTexts, ARTIFACT_KINDS } from './artifact.js';
export type { Artifact, ArtifactKind, ArtifactText } from './artifact.js';

export { assertNoGoldSubstring } from './substring-gate.js';
export type {
  Gold,
  SubstringGateOptions,
  SubstringMatchType,
  SubstringHit,
  SubstringGateResult,
} from './substring-gate.js';

export { cosineSimilarity, maxEmbeddingSimilarity, assertEmbeddingGate } from './embedding-gate.js';
export type {
  FirewallEmbedder,
  MaxSimilarityResult,
  EmbeddingHit,
  PerArtifactMax,
  EmbeddingGateResult,
} from './embedding-gate.js';

export { hashMind } from './hash-mind.js';

export { emitFirewallAssertion, FIREWALL_ASSERTIONS } from './emit.js';
export type { FirewallAssertionName, FirewallAssertionRow } from './emit.js';
