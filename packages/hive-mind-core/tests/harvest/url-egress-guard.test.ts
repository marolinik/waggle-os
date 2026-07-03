import { describe, it, expect } from 'vitest';
import {
  classifyAddress,
  assertUrlAllowed,
  safeFetch,
  EgressBlockedError,
  type LookupFn,
  type ResolvedAddress,
} from '../../src/harvest/url-egress-guard.js';
import { UrlAdapter } from '../../src/harvest/url-adapter.js';

function mockLookup(map: Record<string, ResolvedAddress[]>): LookupFn {
  return async (hostname: string) => {
    const addrs = map[hostname];
    if (!addrs) throw new Error(`ENOTFOUND ${hostname}`);
    return addrs;
  };
}

const v4 = (address: string): ResolvedAddress => ({ address, family: 4 });

describe('url-egress-guard (hive-mind-core)', () => {
  it('classifies the SSRF-relevant ranges', () => {
    expect(classifyAddress('127.0.0.1')).toBe('loopback');
    expect(classifyAddress('169.254.169.254')).toBe('link-local');
    expect(classifyAddress('10.0.0.5')).toBe('private');
    expect(classifyAddress('192.168.1.1')).toBe('private');
    expect(classifyAddress('::1')).toBe('loopback');
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('link-local');
    expect(classifyAddress('8.8.8.8')).toBe('public');
  });

  it('rejects literal loopback / metadata / private / IPv6-loopback (no DNS)', async () => {
    await expect(assertUrlAllowed('http://127.0.0.1/')).rejects.toThrow(/loopback/);
    await expect(assertUrlAllowed('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/link-local/);
    await expect(assertUrlAllowed('http://10.0.0.5/')).rejects.toThrow(/private/);
    await expect(assertUrlAllowed('http://[::1]/')).rejects.toThrow(/loopback/);
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertUrlAllowed('file:///etc/passwd')).rejects.toThrow(/scheme/i);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    const lookup = mockLookup({ 'internal.example.com': [v4('10.1.2.3')] });
    await expect(assertUrlAllowed('http://internal.example.com/', { lookup })).rejects.toThrow(/private/);
  });

  it('allows a public URL', async () => {
    const lookup = mockLookup({ 'example.com': [v4('93.184.216.34')] });
    const url = await assertUrlAllowed('https://example.com/', { lookup });
    expect(url.hostname).toBe('example.com');
  });

  it('safeFetch rejects a redirect to a private IP', async () => {
    const lookup = mockLookup({ 'safe.example.com': [v4('93.184.216.34')] });
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: 'http://10.0.0.9/' } })) as unknown as typeof fetch;
    await expect(
      safeFetch('https://safe.example.com/', {}, { lookup, fetchImpl }),
    ).rejects.toThrow(/private/);
  });

  it('safeFetch returns a normal public response', async () => {
    const lookup = mockLookup({ 'safe.example.com': [v4('93.184.216.34')] });
    const fetchImpl = (async () => new Response('page', { status: 200 })) as unknown as typeof fetch;
    const res = await safeFetch('https://safe.example.com/', {}, { lookup, fetchImpl });
    expect(await res.text()).toBe('page');
  });
});

describe('UrlAdapter.fetchAndParse SSRF guard', () => {
  const adapter = new UrlAdapter();

  it('refuses cloud-metadata / loopback / private targets before fetching', async () => {
    await expect(adapter.fetchAndParse('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(adapter.fetchAndParse('http://127.0.0.1/')).rejects.toThrow(/loopback/);
    await expect(adapter.fetchAndParse('http://10.0.0.5/secret')).rejects.toThrow(/private/);
  });

  it('refuses non-http(s) schemes', async () => {
    await expect(adapter.fetchAndParse('file:///etc/passwd')).rejects.toThrow(/scheme/i);
  });
});
