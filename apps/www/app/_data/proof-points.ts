/**
 * 5 proof point cards for the SOTA Band, in v3.2 LOCKED order.
 *
 * Reorder per amendment §1.2: Trio-strict 33.5% card DROPPED (pilot fail-ovi
 * h2/h3/h4); replaced by GEPA Faza 1 +12.5pp (production-validated).
 *
 * Card 2 description rewording per amendment §1.2 (lock #4):
 * "Substrate beats Mem0 paper by 7.1 points on LoCoMo."
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
    id: 'gepa',
    caption: 'GEPA evaluation',
    stat: '+12.5pp',
    name: 'Claude smarter on held-out',
    description:
      'Independently validated cognitive uplift from the Waggle memory layer. Production-wired today. Methodology in arxiv preprint.',
  },
  {
    id: 'locomo',
    caption: 'LoCoMo substrate',
    stat: '74%',
    name: 'Beats Mem0 paper claim (66.9%)',
    description: 'Substrate beats Mem0 paper by 7.1 points on LoCoMo.',
  },
  {
    id: 'apache',
    caption: 'Substrate',
    stat: 'Apache 2.0',
    name: 'Open source, fork it',
    description:
      'Fork it, audit it, deploy it on your own infra. No license games, no rug-pull risk.',
  },
  {
    id: 'zero-cloud',
    caption: 'Network',
    stat: 'Zero cloud',
    name: 'Local-first by default',
    description:
      'Your work never leaves your device unless you explicitly opt in. Provider routing is signed and traced.',
  },
  {
    id: 'eu-ai-act',
    caption: 'EU AI Act',
    stat: 'Article 12',
    name: 'Audit reports built-in',
    description:
      'Compliance reports generated from work activity. No separate compliance workstream, no spreadsheet exports.',
  },
]);
