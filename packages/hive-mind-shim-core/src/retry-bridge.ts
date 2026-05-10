/**
 * Exponential-backoff retry with jitter and per-attempt timeout.
 *
 * Each attempt is wrapped in a Promise.race against a timeout. On
 * failure, the helper sleeps backoff = clamp(base * 2^attempt, max)
 * +/- jitterFactor * exp before retrying. Total attempts capped at
 * (maxRetries + 1): one initial + N retries.
 */

export interface RetryOptions {
  /** Number of retries after the initial attempt. Default 3 (so 4 attempts total). */
  maxRetries?: number;
  /** Base backoff in ms. Default 200. */
  baseBackoffMs?: number;
  /** Cap on per-attempt backoff. Default 5000. */
  maxBackoffMs?: number;
  /** Jitter as a fraction of the computed backoff (+/-). Default 0.25. */
  jitterFactor?: number;
  /** Per-attempt timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Test hook — overrides setTimeout-based delay. */
  delay?: (ms: number) => Promise<void>;
  /** Test hook — overrides Math.random for deterministic jitter. */
  random?: () => number;
}

const DEFAULTS: Required<Pick<
  RetryOptions,
  'maxRetries' | 'baseBackoffMs' | 'maxBackoffMs' | 'jitterFactor' | 'timeoutMs'
>> = {
  maxRetries: 3,
  baseBackoffMs: 200,
  maxBackoffMs: 5000,
  jitterFactor: 0.25,
  timeoutMs: 5000,
};

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`operation timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err instanceof Error ? err : new Error(String(err))); },
    );
  });
}

export function computeBackoff(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterFactor: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  // random() in [0,1); shift to [-1,1) for symmetric jitter.
  const jitter = exp * jitterFactor * (random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const cfg = { ...DEFAULTS, ...opts };
  const delay = opts.delay ?? defaultDelay;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      return await withTimeout(fn(), cfg.timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt === cfg.maxRetries) break;
      const backoff = computeBackoff(attempt, cfg.baseBackoffMs, cfg.maxBackoffMs, cfg.jitterFactor, random);
      await delay(backoff);
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(typeof lastErr === 'string' ? lastErr : 'retry failed without error message');
}
