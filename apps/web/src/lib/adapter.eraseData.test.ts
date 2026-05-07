/**
 * LocalAdapter.eraseData — GDPR Art. 17 erasure request wiring.
 *
 * Pins the contract between Settings → Privacy → "Erase all my data" + the
 * EraseDataDialog and the server's POST /api/data/erase route (data-erase.ts).
 * Specifically guards the confirmation gate: header `X-Confirm-Erase: yes`
 * + body `{ confirmation: '<exact phrase>' }`. If either drops, the route
 * returns 400 and an unsuspecting user could think their data was wiped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

describe('LocalAdapter.eraseData', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs to /api/data/erase with the confirmation header AND body phrase', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({
        requestedAt: '2026-05-08T12:00:00.000Z',
        markerPath: '/tmp/waggle/.erase-pending.json',
        dataDirSnapshot: { fileCount: 4, totalBytes: 1024, topLevelEntries: [] },
        instruction: 'Quit Waggle and relaunch — erasure completes during startup.',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new LocalAdapter('http://test-server:9999');
    const result = await adapter.eraseData('I UNDERSTAND THIS IS PERMANENT');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe('http://test-server:9999/api/data/erase');
    expect(init.method).toBe('POST');

    // Both halves of the confirmation gate MUST be present.
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Confirm-Erase']).toBe('yes');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ confirmation: 'I UNDERSTAND THIS IS PERMANENT' });

    // Receipt returned verbatim — dialog needs every field.
    expect(result.requestedAt).toBe('2026-05-08T12:00:00.000Z');
    expect(result.markerPath).toBe('/tmp/waggle/.erase-pending.json');
    expect(result.dataDirSnapshot.fileCount).toBe(4);
    expect(result.dataDirSnapshot.totalBytes).toBe(1024);
    expect(result.instruction).toMatch(/relaunch/i);
  });

  it('forwards whatever phrase the caller passes — server validates exact match', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({
        error: 'ERASE_NOT_CONFIRMED',
        message: '"confirmation" must match the exact phrase',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    );

    const adapter = new LocalAdapter('http://test-server:9999');
    // Wrong phrase. Server returns 400. Adapter must throw — silently
    // swallowing would let the dialog claim success.
    await expect(adapter.eraseData('i understand this is permanent'))
      .rejects.toThrow(/Erase failed.*400/);

    // The phrase the caller passed is what gets sent — no client-side
    // normalization or validation.
    const [, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    expect(JSON.parse(init.body as string).confirmation).toBe('i understand this is permanent');
  });

  it('throws on 500 with the server status text when the body is not JSON', async () => {
    fetchSpy.mockResolvedValue(new Response('disk full', { status: 500, statusText: 'Internal Server Error' }));
    const adapter = new LocalAdapter('http://test-server:9999');
    await expect(adapter.eraseData('I UNDERSTAND THIS IS PERMANENT'))
      .rejects.toThrow(/Erase failed.*500/);
  });
});
