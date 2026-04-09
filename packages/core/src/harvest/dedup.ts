/**
 * Harvest Dedup — Pass 4 local deduplication and merge logic.
 *
 * Cross-references distilled knowledge against existing memory frames
 * to prevent duplicates and flag contradictions.
 */

import { createHash } from 'node:crypto';
import type { DistilledKnowledge } from './types.js';

/** Normalize content for comparison (lowercase, trim, collapse whitespace). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Content hash for dedup. */
function contentHash(text: string): string {
  return createHash('sha256').update(normalize(text)).digest('hex').slice(0, 16);
}

/** Simple cosine similarity on character trigrams. */
function trigramSimilarity(a: string, b: string): number {
  const trigramsA = new Set<string>();
  const trigramsB = new Set<string>();
  const normA = normalize(a);
  const normB = normalize(b);

  for (let i = 0; i <= normA.length - 3; i++) trigramsA.add(normA.slice(i, i + 3));
  for (let i = 0; i <= normB.length - 3; i++) trigramsB.add(normB.slice(i, i + 3));

  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  return intersection / Math.max(trigramsA.size, trigramsB.size);
}

export interface DedupResult {
  unique: DistilledKnowledge[];
  duplicatesSkipped: number;
  contradictions: { existing: string; incoming: string }[];
}

/**
 * Deduplicate distilled knowledge against existing frame contents.
 *
 * @param incoming - New distilled knowledge items
 * @param existingContents - Content strings of existing memory frames
 * @param similarityThreshold - Trigram similarity threshold for dedup (default 0.75)
 */
export function dedup(
  incoming: DistilledKnowledge[],
  existingContents: string[],
  similarityThreshold: number = 0.75,
): DedupResult {
  const seenHashes = new Set<string>();
  const existingHashes = new Set(existingContents.map(c => contentHash(c)));
  const unique: DistilledKnowledge[] = [];
  let duplicatesSkipped = 0;
  const contradictions: { existing: string; incoming: string }[] = [];

  for (const item of incoming) {
    const hash = contentHash(item.content);

    // Exact hash match
    if (seenHashes.has(hash) || existingHashes.has(hash)) {
      duplicatesSkipped++;
      continue;
    }

    // Fuzzy match against existing
    let isDuplicate = false;
    for (const existing of existingContents) {
      const sim = trigramSimilarity(item.content, existing);
      if (sim >= similarityThreshold) {
        isDuplicate = true;
        duplicatesSkipped++;
        break;
      }
      // Detect potential contradictions (similar topic, different content)
      if (sim >= 0.4 && sim < similarityThreshold && item.importance === 'important') {
        contradictions.push({ existing, incoming: item.content });
      }
    }

    if (!isDuplicate) {
      seenHashes.add(hash);
      unique.push(item);
    }
  }

  return { unique, duplicatesSkipped, contradictions };
}
