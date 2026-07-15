import { parseRetryAfterSeconds } from './retry-policy.js';

const MIN_RESET_DELAY_MS = 30_000;
const MAX_RESET_DELAY_MS = 12 * 60 * 60 * 1000;
const DEFAULT_RESUME_DELAY_MS = 15 * 60 * 1000;
const RESUME_BUFFER_MS = 30_000;

const RETRY_AFTER_RE = /\bretry-after\s*:\s*(\d+|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT)/i;
const TRY_AGAIN_RE = /\btry\s+again\s+in\s+(\d+(?:\.\d+)?)\s*(s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:our)?s?)\b/i;
const RESET_AT_RE = /\bresets?\s+at\s+(\d{4}-\d{2}-\d{2}T[^\s,;]+|\d{1,2}:\d{2})\b/i;
const RATE_LIMIT_RE = /\b(?:rate[\s_-]*limit(?:ed|ing)?(?:[\s_-]*error)?|quota\s+exceeded|429)\b/i;

export interface RateLimitAssessment {
  isRateLimit: boolean;
  resetAtMs: number | null;
  source: 'retry-after' | 'reset-phrase' | 'status-only' | 'none';
}

export type ResumePlan =
  | { kind: 'scheduled'; fireAtMs: number }
  | { kind: 'manual'; reason: string };

function clampResetAt(resetAtMs: number, nowMs: number): number | null {
  if (!Number.isFinite(resetAtMs)) return null;
  return Math.min(
    nowMs + MAX_RESET_DELAY_MS,
    Math.max(nowMs + MIN_RESET_DELAY_MS, resetAtMs),
  );
}

function retryAfterReset(text: string, nowMs: number): number | null {
  const match = RETRY_AFTER_RE.exec(text);
  if (!match) return null;
  const seconds = parseRetryAfterSeconds(match[1], nowMs);
  return clampResetAt(nowMs + seconds * 1000, nowMs);
}

function relativeReset(text: string, nowMs: number): number | null {
  const match = TRY_AGAIN_RE.exec(text);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2][0].toLowerCase();
  const multiplier = unit === 'h' ? 60 * 60 * 1000 : unit === 'm' ? 60 * 1000 : 1000;
  return clampResetAt(nowMs + value * multiplier, nowMs);
}

function absoluteReset(text: string, nowMs: number): number | null {
  const match = RESET_AT_RE.exec(text);
  if (!match) return null;

  const value = match[1];
  if (value.includes('T')) {
    return clampResetAt(Date.parse(value), nowMs);
  }

  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;

  const now = new Date(nowMs);
  let resetAtMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
  );
  if (resetAtMs <= nowMs) resetAtMs += 24 * 60 * 60 * 1000;
  return clampResetAt(resetAtMs, nowMs);
}

export function classifyRateLimitError(text: string, nowMs: number): RateLimitAssessment {
  const retryAfterMatch = RETRY_AFTER_RE.test(text);
  const relativeMatch = TRY_AGAIN_RE.test(text);
  const absoluteMatch = RESET_AT_RE.test(text);
  const isRateLimit = RATE_LIMIT_RE.test(text)
    || retryAfterMatch
    || relativeMatch
    || absoluteMatch;

  if (!isRateLimit) {
    return { isRateLimit: false, resetAtMs: null, source: 'none' };
  }

  if (retryAfterMatch) {
    const resetAtMs = retryAfterReset(text, nowMs);
    if (resetAtMs !== null) {
      return { isRateLimit: true, resetAtMs, source: 'retry-after' };
    }
  }

  if (relativeMatch || absoluteMatch) {
    const resetAtMs = relativeReset(text, nowMs) ?? absoluteReset(text, nowMs);
    if (resetAtMs !== null) {
      return { isRateLimit: true, resetAtMs, source: 'reset-phrase' };
    }
  }

  return { isRateLimit: true, resetAtMs: null, source: 'status-only' };
}

export function planRateLimitResume(
  assessment: RateLimitAssessment,
  nowMs: number,
): ResumePlan {
  if (!assessment.isRateLimit) {
    return { kind: 'manual', reason: 'not_rate_limited' };
  }

  const maxFireAtMs = nowMs + MAX_RESET_DELAY_MS;
  if (assessment.resetAtMs !== null && Number.isFinite(assessment.resetAtMs)) {
    return {
      kind: 'scheduled',
      fireAtMs: Math.min(assessment.resetAtMs + RESUME_BUFFER_MS, maxFireAtMs),
    };
  }

  return {
    kind: 'scheduled',
    fireAtMs: Math.min(nowMs + DEFAULT_RESUME_DELAY_MS, maxFireAtMs),
  };
}
