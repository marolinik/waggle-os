import { describe, expect, it } from 'vitest';

import {
  attachConsoleCapture,
  redactDiagnosticText,
  redactDiagnosticUrl,
} from './_helpers.js';

describe('vision diagnostic redaction', () => {
  it('redacts credentials and repeated sensitive query keys without losing useful URL context', () => {
    const redacted = redactDiagnosticUrl(
      'http://user:password@127.0.0.1:3333/api/chat?Token=one&workspace=alpha&access_token=two&token=three&attempt=2',
    );

    expect(redacted).toContain('http://[REDACTED]@127.0.0.1:3333/api/chat?');
    expect(redacted).toContain('Token=[REDACTED]');
    expect(redacted).toContain('access_token=[REDACTED]');
    expect(redacted).toContain('token=[REDACTED]');
    expect(redacted).toContain('workspace=alpha');
    expect(redacted).toContain('attempt=2');
    expect(redacted).not.toContain('one');
    expect(redacted).not.toContain('two');
    expect(redacted).not.toContain('three');
    expect(redacted).not.toContain('user:password');
  });

  it('handles relative and malformed diagnostic text while preserving method, path, and status', () => {
    expect(redactDiagnosticUrl('/api/chat?session_token=secret&workspace=alpha&attempt=3'))
      .toBe('/api/chat?session_token=[REDACTED]&workspace=alpha&attempt=3');

    const redacted = redactDiagnosticText(
      'POST ::: /api/chat?API_KEY=abc&workspace=alpha — HTTP 503; authorization: Bearer top-secret',
    );
    expect(redacted).toContain('POST ::: /api/chat?API_KEY=[REDACTED]&workspace=alpha');
    expect(redacted).toContain('HTTP 503');
    expect(redacted).toContain('authorization: [REDACTED]');
    expect(redacted).not.toContain('abc');
    expect(redacted).not.toContain('top-secret');

    const fragment = redactDiagnosticUrl('/callback#accessToken=fragment-secret&workspace=alpha');
    expect(fragment).toBe('/callback#accessToken=[REDACTED]&workspace=alpha');
  });

  it('redacts every supported sensitive key case-insensitively', () => {
    const keys = [
      'ToKeN', 'access_token', 'id_token', 'refresh_token', 'session_token',
      'accessToken', 'idToken', 'refreshToken', 'sessionToken', 'api_key', 'ApiKey',
      'api-key', 'x-api-key', 'x_api_key', 'xApiKey', 'key', 'secret', 'password',
      'credential', 'client_secret', 'clientSecret',
      'code', 'signature', 'sig', 'auth', 'authorization', 'cookie',
    ];
    const url = `/api/chat?workspace=alpha&${keys.map((key, index) => `${key}=secret-${index}`).join('&')}`;
    const redacted = redactDiagnosticUrl(url);

    expect(redacted).toContain('workspace=alpha');
    expect(redacted.match(/\[REDACTED\]/g)).toHaveLength(keys.length);
    expect(redacted).not.toMatch(/secret-\d+/);
  });

  it('redacts JSON and camelCase secrets without hiding ordinary diagnostic codes or keys', () => {
    const redacted = redactDiagnosticText(
      '{"token":"json-secret","accessToken":"camel-secret","api_key":"json-api-key","clientSecret":"client-secret"} Error code: ERR_CONNECTION_REFUSED; failed with code=ENOENT; key=Enter',
    );

    expect(redacted).toContain('"token":"[REDACTED]"');
    expect(redacted).toContain('"accessToken":"[REDACTED]"');
    expect(redacted).toContain('"api_key":"[REDACTED]"');
    expect(redacted).toContain('"clientSecret":"[REDACTED]"');
    expect(redacted).toContain('Error code: ERR_CONNECTION_REFUSED');
    expect(redacted).toContain('failed with code=ENOENT');
    expect(redacted).toContain('key=Enter');
    expect(redacted).not.toContain('json-secret');
    expect(redacted).not.toContain('camel-secret');
    expect(redacted).not.toContain('json-api-key');
    expect(redacted).not.toContain('client-secret');

    const escaped = redactDiagnosticText(
      String.raw`{"token":"escaped-secret-\"tail-secret","workspace":"alpha"}`,
    );
    expect(escaped).toContain('"token":"[REDACTED]"');
    expect(escaped).toContain('"workspace":"alpha"');
    expect(escaped).not.toContain('escaped-secret');
    expect(escaped).not.toContain('tail-secret');

    expect(redactDiagnosticText('authorization = Bearer equal-secret; HTTP 401'))
      .toBe('authorization = [REDACTED]; HTTP 401');
    expect(redactDiagnosticText('auth=Bearer direct-secret; HTTP 401'))
      .toBe('auth=[REDACTED]; HTTP 401');
    expect(redactDiagnosticText('Cookie: sid=cookie-secret; theme=dark'))
      .toBe('Cookie: [REDACTED]');
    expect(redactDiagnosticText('X-API-Key: header-secret; HTTP 403'))
      .toBe('X-API-Key: [REDACTED]; HTTP 403');
  });

  it('sanitizes console, page, URL, and request-failure diagnostics at capture time', () => {
    type Handler = (value: unknown) => void;
    const listeners = new Map<string, Handler[]>();
    const page = {
      on(event: string, handler: Handler) {
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      },
    } as unknown as Parameters<typeof attachConsoleCapture>[0];
    const emit = (event: string, value: unknown): void => {
      for (const handler of listeners.get(event) ?? []) handler(value);
    };

    const capture = attachConsoleCapture(page);
    emit('console', {
      type: () => 'error',
      text: () => 'request token=console-secret returned HTTP 401',
    });
    emit('pageerror', new Error('failed /api/chat?secret=page-secret&attempt=9'));
    emit('requestfailed', {
      method: () => 'POST',
      url: () => 'http://127.0.0.1:3333/api/chat?token=url-secret&workspace=alpha',
      failure: () => ({ errorText: 'HTTP 503 credential=failure-secret' }),
    });

    expect(capture.errors).toEqual(['request token=[REDACTED] returned HTTP 401']);
    expect(capture.pageErrors).toEqual(['failed /api/chat?secret=[REDACTED]&attempt=9']);
    expect(capture.networkFailures).toEqual([
      'POST http://127.0.0.1:3333/api/chat?token=[REDACTED]&workspace=alpha — HTTP 503 credential=[REDACTED]',
    ]);
  });
});
