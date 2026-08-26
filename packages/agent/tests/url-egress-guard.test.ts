import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import {
  classifyAddress,
  assertUrlAllowed,
  safeFetch,
  EgressBlockedError,
  type LookupFn,
  type ResolvedAddress,
  type SafeFetchOptions,
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
const v6 = (address: string): ResolvedAddress => ({ address, family: 6 });

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function startHttpServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an IPv4 test listener');
  }
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

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
    expect(classifyAddress('192.88.99.0')).toBe('reserved');
    expect(classifyAddress('192.88.99.255')).toBe('reserved');
    expect(classifyAddress('192.88.98.255')).toBe('public');
    expect(classifyAddress('192.88.100.0')).toBe('public');
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
    expect(classifyAddress('fec0::1')).toBe('reserved');
    expect(classifyAddress('feff:ffff::1')).toBe('reserved');
    expect(classifyAddress('64:ff9b::1')).toBe('reserved');
    expect(classifyAddress('64:ff9b:1::1')).toBe('reserved');
    expect(classifyAddress('100::1')).toBe('reserved');
    expect(classifyAddress('100:0:0:1::1')).toBe('reserved');
    expect(classifyAddress('2001:2::1')).toBe('reserved');
    expect(classifyAddress('2002::1')).toBe('reserved');
    expect(classifyAddress('3fff::1')).toBe('reserved');
    expect(classifyAddress('3fff:fff::1')).toBe('reserved');
    expect(classifyAddress('5f00::1')).toBe('reserved');
    expect(classifyAddress('64:ff9b:2::1')).toBe('public');
    expect(classifyAddress('100:0:0:2::1')).toBe('public');
    expect(classifyAddress('2001:2:1::1')).toBe('public');
    expect(classifyAddress('3fff:1000::1')).toBe('public');
    expect(classifyAddress('5f01::1')).toBe('public');
    expect(classifyAddress('2606:4700:4700::1111')).toBe('public'); // Cloudflare
    expect(classifyAddress('2001:4860:4860::8888')).toBe('public'); // Google
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

  it('rejects URL credentials before DNS resolution', async () => {
    const lookup = vi.fn<LookupFn>();

    await expect(
      assertUrlAllowed('https://user:password@public.invalid/path', { lookup }),
    ).rejects.toThrow(/credentials/i);
    expect(lookup).not.toHaveBeenCalled();
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

  it('rejects when any resolved address is special-use IPv6', async () => {
    const lookup = mockLookup({
      'mixed-v6.example.com': [v4('93.184.216.34'), v6('2002::1')],
    });
    await expect(assertUrlAllowed('http://mixed-v6.example.com/', { lookup })).rejects.toThrow(/reserved/);
  });

  it('blocks a decimal-obfuscated host once the resolver normalizes it to loopback', async () => {
    // getaddrinfo normalizes 2130706433 -> 127.0.0.1 in production; the guard
    // then classifies + blocks it. Mock that normalization here (no network).
    const lookup = mockLookup({ '2130706433': [v4('127.0.0.1')] });
    await expect(assertUrlAllowed('http://2130706433/', { lookup })).rejects.toThrow(/loopback/);
  });

  it('blocks alternate IPv4 forms that normalize into a special-use range', async () => {
    for (const target of [
      'http://0300.0130.0143.1/',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://127.1/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:10.0.0.1]/',
      'http://[::ffff:169.254.169.254]/',
      'http://[::ffff:192.88.99.1]/',
    ]) {
      await expect(assertUrlAllowed(target)).rejects.toThrow(/blocked/i);
    }

    await expect(assertUrlAllowed('http://[::ffff:8.8.8.8]/')).resolves.toBeInstanceOf(URL);
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
    await expect(assertUrlAllowed('http://[fec0::1]/', { allowLocal: true })).rejects.toThrow(/reserved/);
  });
});

describe('safeFetch', () => {
  it('connects to the exact validated peer and preserves request semantics and Host', async () => {
    const seen: { method?: string; host?: string; authorization?: string; body?: string } = {};
    const server = await startHttpServer(async (request, response) => {
      seen.method = request.method;
      seen.host = request.headers.host;
      seen.authorization = request.headers.authorization;
      seen.body = await readRequestBody(request);
      response.end('hello world');
    });
    const lookup = vi.fn<LookupFn>().mockResolvedValue([v4('127.0.0.1')]);
    const signal = new AbortController().signal;

    try {
      const res = await safeFetch(
        `http://safe.invalid:${server.port}/submit`,
        {
          method: 'POST',
          headers: { authorization: 'Bearer test-token' },
          body: JSON.stringify({ ok: true }),
          signal,
        },
        { lookup, allowLocal: true, maxRedirects: 0 },
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello world');
    } finally {
      await server.close();
    }

    expect(seen).toEqual({
      method: 'POST',
      host: `safe.invalid:${server.port}`,
      authorization: 'Bearer test-token',
      body: JSON.stringify({ ok: true }),
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('blocks a public-to-loopback DNS flip at socket connect', async () => {
    const lookup = vi.fn<LookupFn>()
      .mockResolvedValueOnce([v4('93.184.216.34')])
      .mockResolvedValueOnce([v4('127.0.0.1')]);

    await expect(
      safeFetch('http://rebind.invalid/', {}, { lookup, maxRedirects: 0 }),
    ).rejects.toMatchObject({
      name: 'EgressBlockedError',
      url: 'http://rebind.invalid/',
      addressClass: 'loopback',
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('blocks a public-to-metadata DNS flip at socket connect', async () => {
    const lookup = vi.fn<LookupFn>()
      .mockResolvedValueOnce([v4('93.184.216.34')])
      .mockResolvedValueOnce([v4('169.254.169.254')]);

    await expect(
      safeFetch('http://metadata-rebind.invalid/', {}, { lookup, maxRedirects: 0 }),
    ).rejects.toMatchObject({
      name: 'EgressBlockedError',
      url: 'http://metadata-rebind.invalid/',
      addressClass: 'link-local',
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('pins every redirect hop against a resolver flip', async () => {
    const requests: string[] = [];
    const server = await startHttpServer((request, response) => {
      requests.push(request.url ?? '');
      response.writeHead(302, {
        location: `http://flip.invalid:${server.port}/final`,
      });
      response.end();
    });
    const lookup = vi.fn<LookupFn>(async (hostname) => {
      if (hostname === 'safe.invalid') return [v4('127.0.0.1')];
      const flipCalls = lookup.mock.calls.filter(([host]) => host === 'flip.invalid').length;
      return flipCalls === 1
        ? [v4('93.184.216.34')]
        : [v4('169.254.169.254')];
    });

    try {
      await expect(
        safeFetch(
          `http://safe.invalid:${server.port}/start`,
          {},
          { lookup, allowLocal: true },
        ),
      ).rejects.toMatchObject({
        name: 'EgressBlockedError',
        url: `http://flip.invalid:${server.port}/final`,
        addressClass: 'link-local',
      });
    } finally {
      await server.close();
    }

    expect(requests).toEqual(['/start']);
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it('rejects mixed public/private records at socket lookup', async () => {
    const lookup = vi.fn<LookupFn>()
      .mockResolvedValueOnce([v4('93.184.216.34')])
      .mockResolvedValueOnce([v4('93.184.216.34'), v4('10.0.0.5')]);

    await expect(
      safeFetch('http://mixed.invalid/', {}, { lookup, maxRedirects: 0 }),
    ).rejects.toMatchObject({
      name: 'EgressBlockedError',
      url: 'http://mixed.invalid/',
      addressClass: 'private',
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('rejects an injected fetch implementation instead of silently bypassing pinning', async () => {
    const fetchImpl = vi.fn(async () => new Response('unsafe'));
    const unsafeOptions = {
      lookup: mockLookup({ 'safe.invalid': [v4('93.184.216.34')] }),
      fetchImpl,
    } as unknown as SafeFetchOptions;

    await expect(
      safeFetch('http://safe.invalid/', {}, unsafeOptions),
    ).rejects.toThrow(/fetchImpl.*not supported/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a redirect that points at a private/link-local IP', async () => {
    let calls = 0;
    const server = await startHttpServer((_request, response) => {
      calls++;
      response.writeHead(302, {
        location: 'http://169.254.169.254/latest/meta-data/',
      });
      response.end();
    });
    const lookup = mockLookup({ 'safe.invalid': [v4('127.0.0.1')] });

    try {
      await expect(
        safeFetch(
          `http://safe.invalid:${server.port}/`,
          {},
          { lookup, allowLocal: true },
        ),
      ).rejects.toThrow(/link-local/);
    } finally {
      await server.close();
    }
    expect(calls).toBe(1);
  });

  it('applies Fetch redirect policy and strips credentials across origins', async () => {
    const requests: Array<{
      host?: string;
      method?: string;
      authorization?: string;
      cookie?: string;
      contentType?: string;
      safeHeader?: string;
      body: string;
    }> = [];
    const server = await startHttpServer(async (request, response) => {
      requests.push({
        host: request.headers.host,
        method: request.method,
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
        contentType: request.headers['content-type'],
        safeHeader: request.headers['x-safe'] as string | undefined,
        body: await readRequestBody(request),
      });
      if (requests.length === 1) {
        response.writeHead(302, {
          location: `http://second.invalid:${server.port}/final`,
        });
        response.end();
        return;
      }
      response.end('final page');
    });
    const lookup = mockLookup({
      'first.invalid': [v4('127.0.0.1')],
      'second.invalid': [v4('127.0.0.1')],
    });

    try {
      const res = await safeFetch(
        `http://first.invalid:${server.port}/start`,
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret',
            cookie: 'session=secret',
            'content-type': 'application/json',
            'x-safe': 'preserve-me',
          },
          body: JSON.stringify({ secret: true }),
        },
        { lookup, allowLocal: true },
      );
      expect(await res.text()).toBe('final page');
    } finally {
      await server.close();
    }

    expect(requests).toEqual([
      {
        host: `first.invalid:${server.port}`,
        method: 'POST',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
        contentType: 'application/json',
        safeHeader: 'preserve-me',
        body: JSON.stringify({ secret: true }),
      },
      {
        host: `second.invalid:${server.port}`,
        method: 'GET',
        authorization: undefined,
        cookie: undefined,
        contentType: undefined,
        safeHeader: 'preserve-me',
        body: '',
      },
    ]);
  });

  it('refuses to replay a streamed request body across a preserving redirect', async () => {
    let calls = 0;
    const server = await startHttpServer(async (request, response) => {
      calls++;
      await readRequestBody(request);
      response.writeHead(307, { location: '/retry' });
      response.end();
    });
    const lookup = mockLookup({ 'safe.invalid': [v4('127.0.0.1')] });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('one-shot'));
        controller.close();
      },
    });

    try {
      await expect(
        safeFetch(
          `http://safe.invalid:${server.port}/stream`,
          { method: 'POST', body, duplex: 'half' } as RequestInit,
          { lookup, allowLocal: true },
        ),
      ).rejects.toThrow(/Cannot replay a streamed request body/i);
    } finally {
      await server.close();
    }
    expect(calls).toBe(1);
  });

  it('throws after exceeding the redirect cap', async () => {
    let calls = 0;
    const server = await startHttpServer((_request, response) => {
      calls++;
      response.writeHead(302, { location: '/loop' });
      response.end();
    });
    const lookup = mockLookup({ 'safe.invalid': [v4('127.0.0.1')] });

    try {
      await expect(
        safeFetch(
          `http://safe.invalid:${server.port}/loop`,
          {},
          { lookup, allowLocal: true, maxRedirects: 2 },
        ),
      ).rejects.toThrow(/redirect/i);
    } finally {
      await server.close();
    }
    expect(calls).toBe(3);
  });
});
