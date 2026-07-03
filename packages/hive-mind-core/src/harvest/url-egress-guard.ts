/**
 * SSRF egress guard for the URL harvest adapter.
 *
 * The harvest URL adapter fetches attacker-influenceable URLs (a user or an
 * MCP client naming a URL to ingest). Without this guard an ingest of
 * `http://169.254.169.254/latest/meta-data/` or an RFC1918 host reaches
 * internal services on the cloud/TEAMS deploy (sidecar binds 0.0.0.0) and can
 * exfiltrate instance-metadata IAM credentials.
 *
 * This module is a self-contained, dependency-free (node builtins only) copy of
 * the guard spec shared with `packages/agent/src/url-egress-guard.ts`. It lives
 * here — rather than importing from @waggle/agent — because hive-mind-core is
 * OSS-mirrored and must not depend on Waggle-proprietary packages. Keep the two
 * implementations in sync; they share one spec.
 *
 * Obfuscated IP literals (octal / decimal / hex) are normalized by the OS
 * resolver: `net.isIP` rejects them as literals, so they fall through to
 * `dns.lookup`, which returns the canonical dotted form we classify.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type AddressClass =
  | 'public'
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'unique-local'
  | 'multicast'
  | 'reserved'
  | 'unspecified'
  | 'invalid';

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export interface EgressGuardOptions {
  /** Permit loopback targets (default false). Only loopback is unlocked. */
  allowLocal?: boolean;
  /** Injectable resolver (tests). Defaults to node:dns/promises lookup(all). */
  lookup?: LookupFn;
}

export class EgressBlockedError extends Error {
  public readonly url: string;
  public readonly addressClass?: AddressClass;
  constructor(message: string, url: string, addressClass?: AddressClass) {
    super(message);
    this.name = 'EgressBlockedError';
    this.url = url;
    this.addressClass = addressClass;
  }
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return [octets[0], octets[1], octets[2], octets[3]];
}

function classifyIpv4(ip: string): AddressClass {
  const octets = parseIpv4Octets(ip);
  if (!octets) return 'invalid';
  const [a, b, c] = octets;
  if (a === 0) return 'unspecified'; // 0.0.0.0/8
  if (a === 127) return 'loopback'; // 127.0.0.0/8
  if (a === 10) return 'private'; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return 'private'; // 172.16.0.0/12
  if (a === 192 && b === 168) return 'private'; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return 'private'; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return 'link-local'; // 169.254.0.0/16 (metadata)
  if (a >= 224 && a <= 239) return 'multicast'; // 224.0.0.0/4
  if (a >= 240) return 'reserved'; // 240.0.0.0/4 + 255.255.255.255
  if (a === 192 && b === 0 && c === 0) return 'reserved'; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return 'reserved'; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return 'reserved'; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return 'reserved'; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return 'reserved'; // TEST-NET-3
  return 'public';
}

function parseIpv6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zoneAt = s.indexOf('%');
  if (zoneAt !== -1) s = s.slice(0, zoneAt);

  const dotMatch = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotMatch) {
    const v4 = parseIpv4Octets(dotMatch[1]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = s.slice(0, dotMatch.index) + hi + ':' + lo;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const tail = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const hextets: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    hextets.push(parseInt(g, 16));
  }
  return hextets;
}

function classifyIpv6(ip: string): AddressClass {
  const h = parseIpv6Hextets(ip);
  if (!h) return 'invalid';

  const firstFive = h[0] | h[1] | h[2] | h[3] | h[4];
  if (firstFive === 0 && (h[5] === 0xffff || h[5] === 0)) {
    const embedded = `${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`;
    const v4Class = classifyIpv4(embedded);
    if (h[5] === 0 && h[6] === 0 && h[7] === 0) return 'unspecified';
    if (h[5] === 0 && h[6] === 0 && h[7] === 1) return 'loopback'; // ::1
    return v4Class;
  }

  if ((h[0] & 0xffc0) === 0xfe80) return 'link-local'; // fe80::/10
  if ((h[0] & 0xfe00) === 0xfc00) return 'unique-local'; // fc00::/7 (ULA)
  if ((h[0] & 0xff00) === 0xff00) return 'multicast'; // ff00::/8
  if (h[0] === 0x2001 && h[1] === 0x0db8) return 'reserved'; // 2001:db8::/32 docs
  if (h[0] === 0x0064 && h[1] === 0xff9b) return 'reserved'; // 64:ff9b::/96 NAT64
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return 'reserved'; // 100::/64 discard
  return 'public';
}

/** Classify a single IP-literal address. Fail-closed: unknown -> 'invalid'. */
export function classifyAddress(ip: string): AddressClass {
  const family = isIP(ip);
  if (family === 4) return classifyIpv4(ip);
  if (family === 6) return classifyIpv6(ip);
  return 'invalid';
}

function isAllowed(cls: AddressClass, allowLocal: boolean): boolean {
  if (cls === 'public') return true;
  if (cls === 'loopback' && allowLocal) return true;
  return false;
}

async function defaultLookup(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family }));
}

/**
 * Validate that `rawUrl` is an http(s) URL whose host resolves only to public
 * addresses. Throws {@link EgressBlockedError} otherwise. Returns parsed URL.
 */
export async function assertUrlAllowed(
  rawUrl: string,
  options: EgressGuardOptions = {},
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new EgressBlockedError('Invalid URL', rawUrl);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new EgressBlockedError(
      `Blocked non-http(s) scheme "${parsed.protocol}"`,
      rawUrl,
    );
  }

  const hostname = parsed.hostname;
  const literalFamily = isIP(hostname);

  let addresses: ResolvedAddress[];
  if (literalFamily !== 0) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    const lookupFn = options.lookup ?? defaultLookup;
    try {
      addresses = await lookupFn(hostname);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new EgressBlockedError(
        `DNS resolution failed for "${hostname}": ${detail}`,
        rawUrl,
      );
    }
    if (!addresses || addresses.length === 0) {
      throw new EgressBlockedError(
        `DNS resolution returned no addresses for "${hostname}"`,
        rawUrl,
      );
    }
  }

  const allowLocal = options.allowLocal ?? false;
  for (const { address } of addresses) {
    const cls = classifyAddress(address);
    if (!isAllowed(cls, allowLocal)) {
      throw new EgressBlockedError(
        `Blocked egress to ${cls} address ${address} (host "${hostname}")`,
        rawUrl,
        cls,
      );
    }
  }

  return parsed;
}

export interface SafeFetchOptions extends EgressGuardOptions {
  /** Maximum redirect hops to follow (default 5). */
  maxRedirects?: number;
  /** Injectable fetch (tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * SSRF-safe fetch. Validates before the request and re-validates every redirect
 * hop (`redirect: 'manual'`). Caller-supplied `redirect` in `init` is ignored.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertUrlAllowed(currentUrl, options);

    const response = await fetchImpl(currentUrl, { ...init, redirect: 'manual' });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = isRedirect ? response.headers.get('location') : null;
    if (!location) {
      return response;
    }

    try {
      await response.body?.cancel();
    } catch {
      /* best-effort; ignore */
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new EgressBlockedError(
        `Invalid redirect target "${location}"`,
        currentUrl,
      );
    }
    currentUrl = nextUrl;
  }

  throw new EgressBlockedError(
    `Exceeded maximum redirects (${maxRedirects})`,
    rawUrl,
  );
}

/** True when local (loopback) fetches are opted in via env. */
export function allowLocalFromEnv(): boolean {
  const v = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
  return v === '1' || v === 'true';
}
