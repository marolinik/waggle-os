import { allowLocalFromEnv, safeFetch } from '@waggle/agent';

function hasAllowedProtocol(url: URL, allowLocal: boolean): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isExplicitLoopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  return url.protocol === 'https:' || (url.protocol === 'http:' && allowLocal && isExplicitLoopback);
}

export function normalizeTeamServerBaseUrl(
  value: string,
  allowLocal = allowLocalFromEnv(),
): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || !hasAllowedProtocol(url, allowLocal)) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export async function fetchTeamServer(url: string, init: RequestInit = {}): Promise<Response> {
  const parsed = new URL(url);
  const allowLocal = allowLocalFromEnv();
  if (parsed.username || parsed.password || parsed.hash || !hasAllowedProtocol(parsed, allowLocal)) {
    throw new Error('Blocked insecure Team server URL');
  }
  return safeFetch(url, init, { allowLocal, maxRedirects: 0 });
}
