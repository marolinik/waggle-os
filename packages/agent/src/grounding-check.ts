/**
 * Grounding check — detects QUANTITATIVE specifics asserted in an agent reply
 * that are NOT present in the sources the reply is supposed to be grounded in
 * (recalled memory + the user's message + conversation).
 *
 * Why this exists: prompt instructions alone do not stop a model from
 * embellishing correct recall with plausible-adjacent invented specifics — e.g.
 * stating "4 months runway" or "227 entities" when neither appears in memory
 * (verified live, 2026-06; see docs/audits/2026-06-01-memory-overclaim-
 * investigation.md). A post-generation check catches these deterministically.
 *
 * Scope (deliberately conservative — false positives are worse than misses,
 * matching pattern-write-back's philosophy): money, percentages, durations, and
 * counts paired with a curated "stat noun". Bare advice quantities ("3 questions",
 * "2 options") are NOT flagged. Proper-noun-only confabulations ("OpenClaw") are
 * out of scope here — they need the LLM verifier layer (Phase 2). This module is
 * a cheap, deterministic pre-filter + observability signal, not the whole fix.
 */

export type SpecificKind = 'money' | 'percent' | 'duration' | 'count';

export interface ClaimedSpecific {
  /** The exact matched phrase, e.g. "4 months", "$19/month", "227 entities". */
  text: string;
  kind: SpecificKind;
  /** The numeric core used for grounding lookup, e.g. "4", "19", "227". */
  number: string;
  /** The unit/noun stem, lowercased + de-pluralized, e.g. "month", "entity". */
  unit: string;
}

export interface GroundingResult {
  specifics: ClaimedSpecific[];
  grounded: ClaimedSpecific[];
  ungrounded: ClaimedSpecific[];
  /** grounded / total; 1 when there are no quantitative specifics to check. */
  score: number;
}

/** Count nouns worth grounding — stats a model invents as facts about the user
 * or system. Curated to exclude benign advice units (questions, steps, options,
 * ways, things, points, reasons, times, items). */
const STAT_NOUNS = [
  'entity', 'entities', 'user', 'users', 'workspace', 'workspaces', 'seat', 'seats',
  'frame', 'frames', 'memory', 'memories', 'session', 'sessions', 'customer', 'customers',
  'employee', 'employees', 'gpu', 'gpus', 'h200', 'h200s', 'rack', 'racks', 'node', 'nodes',
  'token', 'tokens', 'subscriber', 'subscribers', 'member', 'members', 'agent', 'agents',
  'document', 'documents', 'record', 'records', 'connector', 'connectors',
];

const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|billion|million|thousand)?(?:\s?\/\s?(?:mo|month|yr|year|seat|user))?/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?\s?(?:%|percent|percentage points?|pp\b)/gi;
const DURATION_RE = /\b\d+(?:\.\d+)?[-\s]?(?:second|minute|hour|day|week|month|quarter|year)s?\b/gi;
// number + noun; the noun is filtered against STAT_NOUNS below.
const COUNT_RE = /\b(\d[\d,]*)\s+([a-z][a-z-]{1,20})\b/gi;

const num = (s: string): string => s.replace(/[^\d.]/g, '');
const stem = (w: string): string => w.toLowerCase().replace(/s$/, '').replace(/ie$/, 'y');

/** Extract quantitative specifics worth grounding from `text`. */
export function extractClaimedSpecifics(text: string): ClaimedSpecific[] {
  const out: ClaimedSpecific[] = [];
  const seen = new Set<string>();
  const push = (s: ClaimedSpecific): void => {
    const key = `${s.kind}:${s.number}:${s.unit}`;
    if (!seen.has(key)) { seen.add(key); out.push(s); }
  };

  for (const m of text.matchAll(MONEY_RE)) {
    push({ text: m[0].trim(), kind: 'money', number: num(m[0]), unit: 'money' });
  }
  for (const m of text.matchAll(PERCENT_RE)) {
    push({ text: m[0].trim(), kind: 'percent', number: num(m[0]), unit: 'percent' });
  }
  for (const m of text.matchAll(DURATION_RE)) {
    const unitMatch = m[0].match(/(second|minute|hour|day|week|month|quarter|year)/i);
    push({ text: m[0].trim(), kind: 'duration', number: num(m[0]), unit: unitMatch ? unitMatch[1].toLowerCase() : 'duration' });
  }
  for (const m of text.matchAll(COUNT_RE)) {
    const noun = m[2].toLowerCase();
    if (STAT_NOUNS.includes(noun)) {
      push({ text: `${m[1]} ${m[2]}`.trim(), kind: 'count', number: num(m[1]), unit: stem(noun) });
    }
  }
  return out;
}

/**
 * Is a specific grounded in the sources? A specific is grounded when its number
 * appears in the sources AND (for counts/durations) its unit stem appears too —
 * so "$19/month" present in memory grounds, while "4 months runway" (no "4
 * month" in memory) does not. Conservative: a number absent from sources is the
 * strong confabulation signal.
 */
function isGrounded(s: ClaimedSpecific, normalizedSources: string): boolean {
  if (!s.number) return true; // nothing numeric to verify
  // Match the number as a STANDALONE number — not a digit inside a longer
  // number (e.g. "4" must NOT match inside "49"). Escape any decimal point.
  const n = s.number.replace(/\./g, '\\.');
  const standalone = `(?<![\\d.])${n}(?![\\d.])`;
  if (s.kind === 'money' || s.kind === 'percent') {
    return new RegExp(standalone).test(normalizedSources);
  }
  // count/duration: require the number ADJACENT to its unit stem in the sources
  // (either order), so "4 months" only grounds if "4 month(s)" actually appears —
  // not a stray standalone "4" plus a stray "month" elsewhere.
  const u = s.unit.replace(/[^a-z]/g, '');
  if (!u) return new RegExp(standalone).test(normalizedSources);
  const numThenUnit = new RegExp(`${standalone}\\s*[a-z-]{0,3}\\s*${u}`);
  const unitThenNum = new RegExp(`${u}[a-z]*\\s*${standalone}`);
  return numThenUnit.test(normalizedSources) || unitThenNum.test(normalizedSources);
}

/**
 * Check a reply's quantitative specifics against the grounding sources
 * (recalled memory + user message + conversation). Pure + deterministic.
 */
export function checkGrounding(reply: string, sources: string): GroundingResult {
  const specifics = extractClaimedSpecifics(reply);
  const normalizedSources = sources.toLowerCase();
  const grounded: ClaimedSpecific[] = [];
  const ungrounded: ClaimedSpecific[] = [];
  for (const s of specifics) {
    (isGrounded(s, normalizedSources) ? grounded : ungrounded).push(s);
  }
  const score = specifics.length === 0 ? 1 : grounded.length / specifics.length;
  return { specifics, grounded, ungrounded, score };
}
