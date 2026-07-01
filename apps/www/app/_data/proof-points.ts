/**
 * 3 honest proof point cards for the proof band (86.49 SOTA arc, 2026-06; 87.66 withdrawn 2026-07-01).
 *
 * Verified claims (LoCoMo, N=1,540, GPT-4.1-mini answerer+judge — the prior
 * SOTA's own protocol): 86.49% overall, a new state of the art at +4.54pp over
 * Memori 81.95 (z=4.64, p<10⁻⁵); 92.27% single-hop (~1pt off the full-context
 * ceiling); fully local, on-device. The judge protocol + reproduction live in
 * the proof copy keys (landing.proof.subhead / landing.proof.methodology).
 *
 * Numbers MUST match apps/web BenchmarkApp + docs/methodology.md §0. Do not
 * fabricate. No +12.5pp GEPA claim, no 74% / oracle-ceiling, no 91% target.
 */

export interface ProofPoint {
  readonly id: string;
  readonly caption: string;
  readonly stat: string;
  readonly name: string;
  readonly description: string;
}

export const proofPoints: readonly ProofPoint[] = Object.freeze([
  {
    id: 'sota',
    caption: 'LoCoMo · same-judge',
    stat: '86.49%',
    name: 'State of the art on memory',
    description:
      "On LoCoMo — the standard long-term conversational-memory test — Waggle's open-source layer scores 86.49%, beating the prior best by +4.54 points under its own protocol and judge. The layer, not the model, does the work.",
  },
  {
    id: 'single-hop',
    caption: 'Single-hop',
    stat: '92.27%',
    name: '~1 point off the ceiling',
    description:
      'Single-hop recall lands at 92.27% — within about a point of handing the model the entire conversation. Near-perfect retrieval of what you actually said.',
  },
  {
    id: 'portable-layer',
    caption: 'Local-first',
    stat: 'Goes with you',
    name: 'Intelligence in the layer',
    description:
      'The intelligence lives in the layer, not the model — so it goes wherever you go, even onto a small model on your own machine.',
  },
]);
