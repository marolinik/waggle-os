import { describe, it, expect } from 'vitest';
import {
  classifyAddress,
  assertUrlAllowed,
  safeFetch,
  EgressBlockedError,
  type LookupFn,
  type ResolvedAddress,
} from '../src/url-egress-guard.js';

/** Build a mock resolver from a hostname -> addresses map. */
function mockLookup(map: Record<string, ResolvedAddress[]>): LookupFn {
  return async (hostname: string) => {
    const addrs = map[hostname];
    if (!addrs) throw new Error(`ENOTFOUND ${hostname}`);
    return addrs;
  };
}

const v4 = (address: string): ResolvedAddress => ({ address, family: 4 });

describe('classifyAddress', () => {
  it('classifies IPv4 loopback / private / link-local / public', () => {
    expect(classifyAddress('127.0.0.1')).toBe('loopback');
    expect(classifyAddress('127.9.9.9')).toBe('loopback');
    expect(classifyAddress('10.0.0.5')).toBe('private');
    expect(classifyAddress('192.168.1.1')).toBe('private');
    expect(classifyAddress('172.16.0.1')).toBe('private');
    expect(classifyAddress('172.31.255.255')).toBe('private');
    expect(classifyAddress('172.32.0.1')).toBe('public'); // just outside 172.16/12
    expect(classifyAddress('169.254.169.254')).toBe('link-local'); // cloud metadata
    expect(classifyAddress('100.64.0.1')).toBe('private'); // CGNAT
    expect(classifyAddress('0.0.0.0')).toBe('unspecified');
    expect(classifyAddress('224.0.0.1')).toBe('multicast');
    expect(classifyAddress('255.255.255.255')).toBe('reserved');
    expect(classifyAddress('8.8.8.8')).toBe('public');
    expect(classifyAddress('93.184.216.34')).toBe('public');
  });

  it('classifies IPv6 loopback / link-local / ULA / mapped / public', () => {
    expect(classifyAddress('::1')).toBe('loopback');
    expect(classifyAddress('::')).toBe('unspecified');
    expect(classifyAddress('fe80::1')).toBe('link-local');
    expect(classifyAddress('febf::1')).toBe('link-local'); // top of fe80::/10
    expect(classifyAddress('fc00::1')).toBe('unique-local');
    expect(classifyAddress('fd12:3456::1')).toBe('unique-local');
    expect(classifyAddress('ff02::1')).toBe('multicast');
    expect(classifyAddress('2001:db8::1')).toBe('reserved');
    expect(classifyAddress('2606:4700:4700::1111')).toBe('public'); // Cloudflare
  });

  it('unwraps IPv4-mapped IPv6 and classifies the embedded v4', () => {
    expect(classifyAddress('::ffff:127.0.0.1')).toBe('loopback');
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('link-local');
    expect(classifyAddress('::ffff:10.0.0.1')).toBe('private');
    expect(classifyAddress('::ffff:8.8.8.8')).toBe('public');
  });

  it('fails closed on malformed input', () => {
    expect(classifyAddress('not-an-ip')).toBe('invalid');
    expect(classifyAddress('999.999.999.999')).toBe('invalid');
    expect(classifyAddress('')).toBe('invalid');
  });
});

describe('assertUrlAllowed', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertUrlAllowed('ftp://example.com/x')).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(assertUrlAllowed('file:///etc/passwd')).rejects.toThrow(/scheme/i);
    await expect(assertUrlAllowed('gopher://example.com')).rejects.toThrow(/scheme/i);
  });

  it('rejects invalid URLs', async () => {
    await expect(assertUrlAllowed('not a url')).rejects.toThrow(/Invalid URL/);
  });

  it('rejects literal loopback / metadata / private / IPv6-loopback targets (no DNS)', async () => {
    await expect(assertUrlAllowed('http://127.0.0.1/')).rejects.toThrow(/loopback/);
    await expect(assertUrlAllowed('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/link-local/);
    await expect(assertUrlAllowed('http://10.0.0.5/internal')).rejects.toThrow(/private/);
    await expect(assertUrlAllowed('http://[::1]:8080/')).rejects.toThrow(/loopback/);
  });

  it('rejects a hostname that resolves to a private address (DNS-rebind style)', async () => {
    const lookup = mockLookup({ 'internal.example.com': [v4('10.1.2.3')] });
    await expect(assertUrlAllowed('http://internal.example.com/', { lookup })).rejects.toThrow(/private/);
  });

  it('rejects when any of several resolved addresses is private', async () => {
    const lookup = mockLookup({ 'mixed.example.com': [v4('93.184.216.34'), v4('192.168.0.9')] });
    await expect(assertUrlAllowed('http://mixed.example.com/', { lookup })).rejects.toThrow(/private/);
  });

  it('blocks a decimal-obfuscated host once the resolver normalizes it to loopback', async () => {
    // getaddrinfo normalizes 2130706433 -> 127.0.0.1 in production; the guard
    // then classifies + blocks it. Mock that normalization here (no network).
    const lookup = mockLookup({ '2130706433': [v4('127.0.0.1')] });
    await expect(assertUrlAllowed('http://2130706433/', { lookup })).rejects.toThrow(/loopback/);
  });

  it('allows a public URL', async () => {
    const lookup = mockLookup({ 'example.com': [v4('93.184.216.34')] });
    const url = await assertUrlAllowed('https://example.com/page', { lookup });
    expect(url.hostname).toBe('example.com');
  });

  it('allows loopback only when allowLocal is set', async () => {
    await expect(assertUrlAllowed('http://127.0.0.1:5173/')).rejects.toThrow(/loopback/);
    const url = await assertUrlAllowed('http://127.0.0.1:5173/', { allowLocal: true });
    expect(url.hostname).toBe('127.0.0.1');
  });

  it('does not unlock private addresses even with allowLocal', async () => {
    await expect(assertUrlAllowed('http://10.0.0.5/', { allowLocal: true })).rejects.toThrow(/private/);
  });
});

describe('safeFetch', () => {
  const publicLookup = mockLookup({
    'safe.example.com': [v4('93.184.216.34')],
    'a.example.com': [v4('93.184.216.34')],
  });

  it('returns the response for a normal public URL', async () => {
    const fetchImpl = (async () => new Response('hello world', { status: 200 })) as unknown as typeof fetch;
    const res = await safeFetch('https://safe.example.com/', {}, { lookup: publicLookup, fetchImpl });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello world');
  });

  it('rejects a redirect that points at a private/link-local IP', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    }) as unknown as typeof fetch;

    await expect(
      safeFetch('https://safe.example.com/', {}, { lookup: publicLookup, fetchImpl }),
    ).rejects.toThrow(/link-local/);
    // The private target was refused before a second request went out.
    expect(calls).toBe(1);
  });

  it('follows a public redirect to a public target', async () => {
    let calls = 0;
    const fetchImpl = (async (input: string | URL) => {
      calls++;
      const u = String(input);
      if (u.includes('safe.example.com')) {
        return new Response(null, { status: 301, headers: { location: 'https://a.example.com/final' } });
      }
      return new Response('final page', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await safeFetch('https://safe.example.com/', {}, { lookup: publicLookup, fetchImpl });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('final page');
    expect(calls).toBe(2);
  });

  it('throws after exceeding the redirect cap', async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://safe.example.com/loop' } })) as unknown as typeof fetch;

    await expect(
      safeFetch('https://safe.example.com/', {}, { lookup: publicLookup, fetchImpl, maxRedirects: 2 }),
    ).rejects.toThrow(/redirect/i);
  });
});
