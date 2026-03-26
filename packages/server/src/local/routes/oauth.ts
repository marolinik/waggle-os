/**
 * OAuth flow routes — requires app credentials configured in vault.
 *
 * Endpoints:
 *   GET /api/oauth/:provider/authorize — redirects to provider's OAuth page
 *   GET /api/oauth/:provider/callback  — handles OAuth callback, stores tokens in vault
 *
 * For each provider, client_id and client_secret must be stored in the vault
 * under the keys specified in OAUTH_PROVIDERS before the flow can start.
 */

import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

// ── OAuth provider configuration ─────────────────────────────────────

interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdKey: string;
  clientSecretKey: string;
}

const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'user', 'read:org'],
    clientIdKey: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretKey: 'GITHUB_OAUTH_CLIENT_SECRET',
  },
  slack: {
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:read', 'users:read'],
    clientIdKey: 'SLACK_OAUTH_CLIENT_ID',
    clientSecretKey: 'SLACK_OAUTH_CLIENT_SECRET',
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.readonly'],
    clientIdKey: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },
  notion: {
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    clientIdKey: 'NOTION_OAUTH_CLIENT_ID',
    clientSecretKey: 'NOTION_OAUTH_CLIENT_SECRET',
  },
  jira: {
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user'],
    clientIdKey: 'JIRA_OAUTH_CLIENT_ID',
    clientSecretKey: 'JIRA_OAUTH_CLIENT_SECRET',
  },
};

/** In-memory store for OAuth state parameters (CSRF protection) */
const pendingStates = new Map<string, { provider: string; createdAt: number }>();

// Clean up expired states every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of pendingStates) {
    if (val.createdAt < cutoff) pendingStates.delete(key);
  }
}, 10 * 60 * 1000);

// ── Routes ────────────────────────────────────────────────────────────

export const oauthRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/oauth/providers — list available OAuth providers and their credential status
  server.get('/api/oauth/providers', async (_request, _reply) => {
    const results: Array<{
      provider: string;
      hasCredentials: boolean;
      clientIdKey: string;
      clientSecretKey: string;
      scopes: string[];
      hasToken: boolean;
    }> = [];

    for (const [provider, config] of Object.entries(OAUTH_PROVIDERS)) {
      const clientId = server.vault?.get(config.clientIdKey);
      const clientSecret = server.vault?.get(config.clientSecretKey);
      const existingToken = server.vault?.get(`${provider}_oauth_token`);

      results.push({
        provider,
        hasCredentials: !!(clientId && clientSecret),
        clientIdKey: config.clientIdKey,
        clientSecretKey: config.clientSecretKey,
        scopes: config.scopes,
        hasToken: !!existingToken,
      });
    }

    return { providers: results };
  });

  // GET /api/oauth/:provider/authorize — build OAuth URL and redirect
  server.get<{
    Params: { provider: string };
  }>('/api/oauth/:provider/authorize', async (request, reply) => {
    const { provider } = request.params;
    const config = OAUTH_PROVIDERS[provider];

    if (!config) {
      return reply.status(400).send({
        error: `Unknown OAuth provider: ${provider}`,
        availableProviders: Object.keys(OAUTH_PROVIDERS),
      });
    }

    if (!server.vault) {
      return reply.status(503).send({ error: 'Vault not available' });
    }

    // Check for client credentials in vault
    const clientIdEntry = server.vault.get(config.clientIdKey);
    const clientSecretEntry = server.vault.get(config.clientSecretKey);

    if (!clientIdEntry || !clientSecretEntry) {
      return reply.status(400).send({
        error: `OAuth credentials not configured for ${provider}. Store ${config.clientIdKey} and ${config.clientSecretKey} in the vault first.`,
        clientIdKey: config.clientIdKey,
        clientSecretKey: config.clientSecretKey,
      });
    }

    // Generate CSRF state parameter
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, { provider, createdAt: Date.now() });

    // Build the callback URL (same server)
    const addr = server.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3333;
    const redirectUri = `http://127.0.0.1:${port}/api/oauth/${provider}/callback`;

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientIdEntry.value,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
    });

    // Add scopes (provider-specific formatting)
    if (config.scopes.length > 0) {
      const scopeParam = provider === 'jira' ? 'scope' : 'scope';
      params.set(scopeParam, config.scopes.join(' '));
    }

    // Provider-specific params
    if (provider === 'google') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    }
    if (provider === 'jira') {
      params.set('audience', 'api.atlassian.com');
      params.set('prompt', 'consent');
    }
    if (provider === 'notion') {
      params.set('owner', 'user');
    }

    const authorizeUrl = `${config.authorizeUrl}?${params.toString()}`;
    return reply.redirect(authorizeUrl);
  });

  // GET /api/oauth/:provider/callback — exchange code for token, store in vault
  server.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>('/api/oauth/:provider/callback', async (request, reply) => {
    const { provider } = request.params;
    const { code, state, error: oauthError, error_description } = request.query;
    const config = OAUTH_PROVIDERS[provider];

    if (!config) {
      return reply.status(400).send({ error: `Unknown OAuth provider: ${provider}` });
    }

    // Handle OAuth error response
    if (oauthError) {
      return reply.type('text/html').send(
        `<html><body><h2>OAuth Error</h2><p>${oauthError}: ${error_description ?? 'Unknown error'}</p>` +
        `<p><a href="http://127.0.0.1:${(server.server.address() as any)?.port ?? 3333}">Return to Waggle</a></p></body></html>`
      );
    }

    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state parameter' });
    }

    // Validate state (CSRF check)
    const pending = pendingStates.get(state);
    if (!pending || pending.provider !== provider) {
      return reply.status(400).send({ error: 'Invalid or expired state parameter' });
    }
    pendingStates.delete(state);

    if (!server.vault) {
      return reply.status(503).send({ error: 'Vault not available' });
    }

    const clientIdEntry = server.vault.get(config.clientIdKey);
    const clientSecretEntry = server.vault.get(config.clientSecretKey);

    if (!clientIdEntry || !clientSecretEntry) {
      return reply.status(400).send({ error: 'OAuth credentials no longer in vault' });
    }

    // Exchange authorization code for token
    const addr = server.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3333;
    const redirectUri = `http://127.0.0.1:${port}/api/oauth/${provider}/callback`;

    try {
      const tokenBody: Record<string, string> = {
        client_id: clientIdEntry.value,
        client_secret: clientSecretEntry.value,
        code,
        redirect_uri: redirectUri,
      };

      // Provider-specific token exchange params
      if (provider === 'github') {
        // GitHub uses different grant_type
      } else {
        tokenBody.grant_type = 'authorization_code';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      // Notion uses Basic auth for token exchange
      if (provider === 'notion') {
        const basic = Buffer.from(`${clientIdEntry.value}:${clientSecretEntry.value}`).toString('base64');
        headers['Authorization'] = `Basic ${basic}`;
        delete tokenBody.client_id;
        delete tokenBody.client_secret;
        headers['Content-Type'] = 'application/json';
      }

      // GitHub requires Accept: application/json
      if (provider === 'github') {
        headers['Accept'] = 'application/json';
      }

      const body = provider === 'notion'
        ? JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
        : new URLSearchParams(tokenBody).toString();

      const tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        return reply.type('text/html').send(
          `<html><body><h2>Token Exchange Failed</h2><p>Status: ${tokenRes.status}</p>` +
          `<pre>${errBody}</pre>` +
          `<p><a href="http://127.0.0.1:${port}">Return to Waggle</a></p></body></html>`
        );
      }

      const tokenData = await tokenRes.json() as Record<string, unknown>;
      const accessToken = (tokenData.access_token ?? tokenData.authed_user?.access_token) as string | undefined;

      if (!accessToken) {
        return reply.type('text/html').send(
          `<html><body><h2>No Access Token</h2><p>The provider did not return an access token.</p>` +
          `<pre>${JSON.stringify(tokenData, null, 2)}</pre>` +
          `<p><a href="http://127.0.0.1:${port}">Return to Waggle</a></p></body></html>`
        );
      }

      // Store the token in vault
      server.vault.set(`${provider}_oauth_token`, accessToken, { credentialType: 'oauth2' });

      // If there's a refresh token, store it too
      const refreshToken = tokenData.refresh_token as string | undefined;
      if (refreshToken) {
        server.vault.set(`${provider}_oauth_refresh_token`, refreshToken, { credentialType: 'oauth2' });
      }

      // Redirect back to settings page with success indicator
      return reply.type('text/html').send(
        `<html><body>` +
        `<h2>Connected to ${provider}!</h2>` +
        `<p>OAuth token has been stored in your vault. You can close this tab.</p>` +
        `<script>` +
        `  // Try to close the tab automatically after a short delay` +
        `  setTimeout(() => { window.close(); }, 2000);` +
        `</script>` +
        `<p><a href="http://127.0.0.1:${port}">Return to Waggle</a></p>` +
        `</body></html>`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.type('text/html').send(
        `<html><body><h2>OAuth Error</h2><p>${message}</p>` +
        `<p><a href="http://127.0.0.1:${port}">Return to Waggle</a></p></body></html>`
      );
    }
  });
};
