/**
 * 3 honest proof point cards for the proof band (N2 rewrite).
 *
 * Only verifiable claims: the 0.3-point convergence (73.1 vs 73.4 on the same
 * memory layer) and 87.5% single-hop trio-strict. The 67.8% AND-of-3 LoCoMo
 * lead and the raw judge-ensemble math live in the proof copy keys
 * (landing.proof.subhead / landing.proof.methodology), not here.
 *
 * No +12.5pp GEPA claim, no 74% / Mem0-win, no 91% — those were removed.
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
    id: 'convergence',
    caption: 'Same memory layer',
    stat: '0.3 pts',
    name: 'Small model, frontier class',
    description:
      'Two very different models land within 0.3 points on the same memory layer — so a small local model performs in the same class as a frontier one. The layer, not the model, does the work.',
  },
  {
    id: 'single-hop',
    caption: 'Trio-strict',
    stat: '87.5%',
    name: 'Single-hop reasoning',
    description:
      'Single-hop reasoning, trio-strict: 87.5%. Three rival models had to agree before an answer counted.',
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
