/**
 * R2-002 regression: the OAuth callback reflects untrusted query params and
 * upstream response bodies into HTML. Every untrusted value must be
 * HTML-escaped (via escapeXml) before interpolation so a quote/`<script>`
 * bearing value cannot inject markup into the returned page.
 *
 * The error branch (?error=...) is exercised here because it reflects two
 * untrusted query params straight into the HTML response before any network
 * call — no vault seeding or fetch mocking required.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { oauthRoutes } from '../../src/local/routes/oauth.js';

function createTestServer() {
  const server = Fastify({ logger: false });
  server.register(oauthRoutes);
  return server;
}

describe('OAuth callback HTML escaping (R2-002)', () => {
  let server: ReturnType<typeof Fastify>;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('escapes untrusted error + error_description query params', async () => {
    server = createTestServer();
    const errorParam = '<script>alert(1)</script>';
    const descParam = '"><img src=x onerror=alert(2)>';

    const res = await server.inject({
      method: 'GET',
      url: `/api/oauth/github/callback?error=${encodeURIComponent(errorParam)}&error_description=${encodeURIComponent(descParam)}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.body;
    // Raw payload markup must NOT appear verbatim.
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).not.toContain('<img src=x onerror=alert(2)>');
    // Escaped forms must be present instead.
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(body).toContain('&quot;&gt;');
  });

  it('does not double-escape benign error descriptions', async () => {
    server = createTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/oauth/github/callback?error=access_denied&error_description=user%20declined',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('access_denied: user declined');
  });
});
