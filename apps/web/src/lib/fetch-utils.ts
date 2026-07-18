export class TimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends Error {
  constructor(url: string, cause?: Error) {
    super(`Network error reaching ${url}: ${cause?.message || 'unreachable'}`);
    this.name = 'NetworkError';
  }
}

function combineAbortSignals(signals: AbortSignal[]): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(signals), cleanup: () => {} };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signals.some(signal => signal.aborted)) {
    abort();
  } else {
    for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of signals) signal.removeEventListener('abort', abort);
    },
  };
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combined = options.signal
    ? combineAbortSignals([options.signal, controller.signal])
    : { signal: controller.signal, cleanup: () => {} };

  try {
    const response = await fetch(url, {
      ...options,
      signal: combined.signal,
    });
    return response;
  } catch (err: unknown) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new TimeoutError(url, timeoutMs);
    }
    // Caller cancellation (for example Chat Stop) is control flow, not a
    // timeout/network outage. Preserve the native AbortError for the caller.
    if (options.signal?.aborted) throw err;
    throw new NetworkError(url, err instanceof Error ? err : undefined);
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
}
