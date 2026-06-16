/**
 * Pre-priced-run gate barrel (Plan 09).
 *
 * The three gate surfaces a priced run must clear:
 *   - validateRuler          — reproduce a published number within tolerance (D6)
 *   - assertNoGoldSubstring  — leakage firewall over every written artifact (C8)
 *   - runPreregChecklist     — code frozen at a SHA + manifest emitted (§9)
 *
 * The leakage-firewall surface is NOT re-implemented here: Plan 06 already
 * shipped it (substring + normalized gold gates, embedding gate, mind hash,
 * events.jsonl emitter) under `src/firewall/`. This barrel re-exports that
 * canonical surface so gate consumers (preflight, the e2e smoke) have one
 * import site for the whole pre-priced-run gate.
 */
export { validateRuler } from './ruler-validation.js';
export type { RulerSpec, RulerVerdict } from './ruler-validation.js';

// Leakage firewall (Plan 06) — re-exported, not re-implemented.
export {
  normalizeForMatch,
  collectArtifactTexts,
  ARTIFACT_KINDS,
  assertNoGoldSubstring,
  cosineSimilarity,
  maxEmbeddingSimilarity,
  assertEmbeddingGate,
  hashMind,
  emitFirewallAssertion,
  FIREWALL_ASSERTIONS,
} from '../firewall/index.js';
export type {
  Artifact,
  ArtifactKind,
  ArtifactText,
  Gold,
  SubstringGateOptions,
  SubstringMatchType,
  SubstringHit,
  SubstringGateResult,
  FirewallEmbedder,
  MaxSimilarityResult,
  EmbeddingHit,
  PerArtifactMax,
  EmbeddingGateResult,
  FirewallAssertionName,
  FirewallAssertionRow,
} from '../firewall/index.js';

export { runPreregChecklist, defaultGitProbe } from './prereg-checklist.js';
export type {
  GitState, GitProbe, PreregChecklistInput, PreregChecklistResult,
} from './prereg-checklist.js';

export { runPreflight } from './preflight.js';
export type { PreflightInput, PreflightResult, PreflightRuler } from './preflight.js';
