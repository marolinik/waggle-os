// ── F16: Text normalization for fuzzy dedup ──────────────────────────────

/** Normalize text for fuzzy dedup: lowercase, collapse whitespace, strip punctuation */
export function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')    // strip punctuation
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim();
}

/** Compute cosine similarity between two Float32Arrays */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── F22: Dramatic claims detection ───────────────────────────────────────
export const DRAMATIC_CLAIM_PATTERNS: RegExp[] = [
  /\b(shut(?:ting)?\s*down|clos(?:ing|ed)\s+(?:the\s+)?company|going\s+bankrupt|bankrupt(?:cy)?|dissolv(?:ing|ed))\b/i,
  /\b(mass\s+layoff|laid?\s+off\s+everyone|fir(?:ing|ed)\s+(?:all|everyone|the\s+entire))\b/i,
  /\b(lawsuit|legal\s+threat|su(?:ing|ed)\s+(?:us|them|the\s+company)|cease\s+and\s+desist)\b/i,
  /\b(revenue\s*(?:is|=|dropped?\s+to)\s*(?:\$?\s*)?0|lost\s+all\s+(?:our\s+)?funding|funding\s+(?:fell?\s+through|collapsed?))\b/i,
];

/** Detect dramatic claim patterns in content. Returns matched pattern descriptions. */
export function detectDramaticClaims(content: string): string[] {
  const labels = ['company_shutdown', 'mass_layoffs', 'legal_threats', 'dramatic_financial'];
  const matches: string[] = [];
  for (let i = 0; i < DRAMATIC_CLAIM_PATTERNS.length; i++) {
    if (DRAMATIC_CLAIM_PATTERNS[i].test(content)) {
      matches.push(labels[i]);
    }
  }
  return matches;
}

// ── F6: Confidence level type ────────────────────────────────────────────
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unverified';

/** Derive default confidence from source provenance */
export function deriveConfidence(source: string): ConfidenceLevel {
  switch (source) {
    case 'tool_verified': return 'high';
    case 'user_stated':   return 'medium';
    case 'agent_inferred': return 'low';
    default:              return 'unverified';
  }
}
