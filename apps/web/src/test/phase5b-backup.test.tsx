/**
 * Phase 5b · R4-006 — BackupApp metadata-fetch status classification.
 *
 * Before the fix, `GET /api/backup/metadata` was consumed with a bare
 * `.then(r => r.json())` — no `response.ok` guard. A non-2xx response (e.g. a
 * 500 from a broken backend) deserialized to the error body, whose
 * `data.backups` is undefined, so `data.backups ?? []` collapsed every server
 * fault into the misleading "No backups yet" empty state.
 *
 * The fix routes the status through the pure `classifyMetadataStatus`:
 *   - 404            → 'empty'  (legitimate "no backups yet")
 *   - 2xx            → 'ok'     (parse + render the metadata)
 *   - anything else  → 'error'  (retryable error panel, never the empty state)
 *
 * Why no component-render test: `@testing-library/react` (React 19, hoisted to
 * the monorepo root) mixes its `react-dom/client` copy with this app's React
 * 18.3 and throws "A React Element from an older version of React was
 * rendered." This is the same documented constraint that keeps
 * `ConnectorsApp.shouldResetCredentialInputs` at the pure-function layer; the
 * R4-002 Restore wiring + the rendered error/retry panel are covered by
 * Playwright.
 */
import { describe, it, expect } from 'vitest';
import { classifyMetadataStatus } from '@/components/os/apps/BackupApp';

describe('BackupApp · R4-006 classifyMetadataStatus', () => {
  it('treats 404 as the legitimate empty state, not an error', () => {
    expect(classifyMetadataStatus(404)).toBe('empty');
  });

  it('treats a 200 metadata response as ok', () => {
    expect(classifyMetadataStatus(200)).toBe('ok');
  });

  it('treats a 500 as a (retryable) error, NOT the empty state', () => {
    expect(classifyMetadataStatus(500)).toBe('error');
  });

  it('treats other server faults (502/503) as errors', () => {
    expect(classifyMetadataStatus(502)).toBe('error');
    expect(classifyMetadataStatus(503)).toBe('error');
  });

  it('treats a 401/403 as an error rather than silently showing no backups', () => {
    expect(classifyMetadataStatus(401)).toBe('error');
    expect(classifyMetadataStatus(403)).toBe('error');
  });
});
