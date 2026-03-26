/**
 * KVARK Auth — tests with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KvarkAuth } from '../../src/kvark/kvark-auth.js';
import { KvarkAuthError, KvarkUnavailableError } from '../../src/kvark/kvark-types.js';

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof globalThis.fetch {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++] ?? { status: 500, body: { detail: 'No mock response' } };
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
}

const BASE_CONFIG = { baseUrl: 'http://kvark:8000', identifier: 'admin', password: 'secret' };

describe('KvarkAuth', () => {
  it('login calls POST /api/auth/login and returns token', async () => {
    const fetch = mockFetch([{
      status: 200,
      body: { success: true, access_token: 'jwt-123', token_type: 'bearer', user: { id: 1, identifier: 'admin' }, error: null },
    }]);

    const auth = new KvarkAuth(BASE_CONFIG, fetch);
    const token = await auth.login();

    expect(token).toBe('jwt-123');
    expect(auth.hasToken).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();

    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://kvark:8000/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ identifier: 'admin', password: 'secret' });
  });

  it('getToken returns cached token without re-login', async () => {
    const fetch = mockFetch([{
      status: 200,
      body: { success: true, access_token: 'jwt-cached', token_type: 'bearer', user: null, error: null },
    }]);

    const auth = new KvarkAuth(BASE_CONFIG, fetch);
    const t1 = await auth.getToken();
    const t2 = await auth.getToken();

    expect(t1).toBe('jwt-cached');
    expect(t2).toBe('jwt-cached');
    expect(fetch).toHaveBeenCalledOnce(); // only one login call
  });

  it('invalidate clears token, next getToken re-logins', async () => {
    const fetch = mockFetch([
      { status: 200, body: { success: true, access_token: 'token-1', token_type: 'bearer', user: null, error: null } },
      { status: 200, body: { success: true, access_token: 'token-2', token_type: 'bearer', user: null, error: null } },
    ]);

    const auth = new KvarkAuth(BASE_CONFIG, fetch);
    const t1 = await auth.getToken();
    expect(t1).toBe('token-1');

    auth.invalidate();
    expect(auth.hasToken).toBe(false);

    const t2 = await auth.getToken();
    expect(t2).toBe('token-2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws KvarkAuthError on login failure', async () => {
    const fetch = mockFetch([{
      status: 401,
      body: { detail: 'Invalid credentials' },
    }]);

    const auth = new KvarkAuth(BASE_CONFIG, fetch);
    await expect(auth.login()).rejects.toThrow(KvarkAuthError);
  });

  it('throws KvarkAuthError when success=false in response', async () => {
    const fetch = mockFetch([{
      status: 200,
      body: { success: false, access_token: null, token_type: 'bearer', user: null, error: 'Account disabled' },
    }]);

    const auth = new KvarkAuth(BASE_CONFIG, fetch);
    await expect(auth.login()).rejects.toThrow('Account disabled');
  });

  it('throws KvarkUnavailableError on network failure', async () => {
    const fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof globalThis.fetch;

    const auth = new KvarkAuth(BASE_CONFIG, fetch);
    await expect(auth.login()).rejects.toThrow(KvarkUnavailableError);
  });
});
