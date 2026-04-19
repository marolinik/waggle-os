/**
 * WaggleSignal presentation helpers (M-41 / P18).
 *
 * The Waggle Dance app surfaces cross-agent signals (discovery,
 * handoff, insight, alert, coordination). A user scanning the list
 * wants unacknowledged items first, then the most severe items,
 * then recency. This helper centralises that ordering so the UI
 * stays consistent across list, counters, and summary surfaces.
 */

export type WaggleSignalType = 'discovery' | 'handoff' | 'insight' | 'alert' | 'coordination';

export interface WaggleSignalLike {
  readonly id: string;
  readonly type: WaggleSignalType | string;
  readonly severity?: 'critical' | 'high' | 'normal' | 'low' | null;
  readonly acknowledged?: boolean;
  readonly timestamp?: string | number | null;
}

/** Severity weight: higher = surfaces earlier. */
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function severityScore(s: WaggleSignalLike): number {
  const key = s.severity ?? 'normal';
  return SEVERITY_WEIGHT[key] ?? SEVERITY_WEIGHT.normal;
}

function timestampMs(s: WaggleSignalLike): number {
  const ts = s.timestamp;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Sort signals for display. Unacknowledged first, then severity desc,
 * then timestamp desc. Returns a new array — does not mutate.
 */
export function sortSignalsForDisplay<T extends WaggleSignalLike>(signals: readonly T[]): T[] {
  return [...signals].sort((a, b) => {
    const ackA = a.acknowledged ? 1 : 0;
    const ackB = b.acknowledged ? 1 : 0;
    if (ackA !== ackB) return ackA - ackB;
    const sevDiff = severityScore(b) - severityScore(a);
    if (sevDiff !== 0) return sevDiff;
    return timestampMs(b) - timestampMs(a);
  });
}

/** Group signals by type for summary display. */
export function groupSignalsByType<T extends WaggleSignalLike>(signals: readonly T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const s of signals) {
    const type = typeof s.type === 'string' ? s.type : 'unknown';
    if (!out[type]) out[type] = [];
    out[type].push(s);
  }
  return out;
}

/** Count of unacknowledged signals — used for the header badge. */
export function countUnacknowledged(signals: readonly WaggleSignalLike[]): number {
  return signals.reduce((n, s) => n + (s.acknowledged ? 0 : 1), 0);
}
