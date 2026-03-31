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

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(url, timeoutMs);
    }
    throw new NetworkError(url, err instanceof Error ? err : undefined);
  } finally {
    clearTimeout(timeout);
  }
}
