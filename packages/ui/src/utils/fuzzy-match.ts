/**
 * Simple fuzzy matching — no external deps.
 * Used by GlobalSearch (Ctrl+K) and ChatInput slash autocomplete.
 */

export interface FuzzyResult {
  match: boolean;
  score: number;
}

export function fuzzyMatch(query: string, text: string): FuzzyResult {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (!q) return { match: true, score: 0 };

  // Exact substring — highest score
  const idx = t.indexOf(q);
  if (idx >= 0) return { match: true, score: 100 - idx };

  // Character-by-character fuzzy
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Word boundary or start bonus
      score += (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '/' || t[ti - 1] === '-') ? 10 : 1;
      qi++;
    }
  }

  return { match: qi === q.length, score };
}
