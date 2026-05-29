import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { buildWorkspaceNowBlock } from '../../src/local/routes/workspace-context.js';

/**
 * R6-006 path-traversal regression.
 *
 * `buildWorkspaceNowBlock` builds session-directory paths from an unvalidated
 * `workspaceId` (getMindPath + dataDir/workspaces/<workspaceId>/sessions),
 * enabling an existence/count probe outside the workspaces root. A guard
 * (assertSafeSegment) now runs at the entry of the helper and THROWS a
 * { statusCode: 400 } error before the value touches the filesystem; the
 * calling route handlers propagate that to Fastify's default error handler.
 *
 * These are unit tests against the exported helper directly (a full route
 * inject is impractical — the route needs heavy mind/wsManager decorators).
 */
describe('R6-006 workspace-context path traversal', () => {
  // A throwaway data dir; the guard fires before this is ever read for the
  // malicious cases, and the valid case short-circuits on a null wsManager.get.
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wctx-traversal-'));

  const maliciousIds = ['../evil', '..%2f..', '../../etc', 'ws/../../secret', '..\\evil'];

  for (const bad of maliciousIds) {
    it(`rejects traversal workspaceId ${JSON.stringify(bad)} with a 400 error before any fs access`, () => {
      const wsManager = {
        get: vi.fn(() => ({ id: bad, name: 'evil' })),
        getMindPath: vi.fn(() => path.join(tmpDataDir, 'mind.sqlite')),
      };
      const activateWorkspaceMind = vi.fn(() => true);

      let thrown: unknown;
      try {
        buildWorkspaceNowBlock({
          dataDir: tmpDataDir,
          workspaceId: bad,
          wsManager,
          activateWorkspaceMind,
        });
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as { statusCode?: number }).statusCode).toBe(400);
      // Guard short-circuits BEFORE the path-building dependencies are touched.
      expect(wsManager.get).not.toHaveBeenCalled();
      expect(wsManager.getMindPath).not.toHaveBeenCalled();
      expect(activateWorkspaceMind).not.toHaveBeenCalled();
    });
  }

  it('does NOT reject a normal valid workspaceId', () => {
    const validId = 'workspace-123_AB';
    const wsManager = {
      // Return null so the helper cleanly returns null after the guard passes —
      // proving the guard did not reject a valid segment.
      get: vi.fn(() => null),
      getMindPath: vi.fn(() => path.join(tmpDataDir, 'mind.sqlite')),
    };
    const activateWorkspaceMind = vi.fn(() => true);

    let result: unknown;
    expect(() => {
      result = buildWorkspaceNowBlock({
        dataDir: tmpDataDir,
        workspaceId: validId,
        wsManager,
        activateWorkspaceMind,
      });
    }).not.toThrow();

    // Guard passed, so execution proceeded to the (mocked) wsManager.get.
    expect(wsManager.get).toHaveBeenCalledWith(validId);
    expect(result).toBeNull();
  });
});
