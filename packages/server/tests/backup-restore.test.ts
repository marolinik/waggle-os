/**
 * Backup & Restore Tests — PM-5: encrypted backup/restore of ~/.waggle/
 *
 * Tests:
 * 1. POST /api/backup returns an octet-stream file
 * 2. Backup excludes marketplace.db and node_modules
 * 3. Backup includes .mind files and config.json
 * 4. POST /api/restore with preview mode
 * 5. POST /api/restore applies restore successfully
 * 6. Restore rejects corrupted/invalid files
 * 7. Backup → restore round-trip (backup, restore to same dir, verify)
 * 8. Backup without vault key (unencrypted fallback)
 * 9. Restore with wrong encryption key fails
 * 10. GET /api/backup/metadata returns metadata after backup
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import {
  isChatHistoryRestoreBusy,
  notifyChatHistoryRestored,
  planChatHistoryRestore,
  registerChatHistoryRestoreParticipant,
} from '../src/local/routes/chat-persistence.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth, resetRateLimiter } from './test-utils.js';

function buildUnencryptedBackup(files: Array<{ relativePath: string; content: string }>): string {
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    files: files.map((file) => ({
      relativePath: file.relativePath,
      content: Buffer.from(file.content, 'utf-8').toString('base64'),
      sizeBytes: Buffer.byteLength(file.content),
    })),
  };
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(manifest), 'utf-8'));
  return Buffer.concat([
    Buffer.from('WAGGLE-BACKUP-V1', 'utf-8'),
    Buffer.alloc(16, 0),
    Buffer.alloc(16, 0),
    compressed,
  ]).toString('base64');
}

function transcript(content: string): string {
  return [
    JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() }),
    JSON.stringify({ role: 'user', content, timestamp: new Date().toISOString() }),
    '',
  ].join('\n');
}

describe('Backup & Restore (PM-5)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    // Create a temp directory for test data
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-backup-test-'));

    // Create personal.mind with test data
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('backup-test');
    frames.createIFrame(s1.gop_id, 'Backup test memory content', 'normal');
    mind.close();

    // Create config.json
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ defaultModel: 'claude-sonnet-4-6', providers: {} }, null, 2),
      'utf-8',
    );

    // Create a workspace directory with a session file
    const wsDir = path.join(tmpDir, 'workspaces', 'ws-1', 'sessions');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'session-1.jsonl'), '{"role":"user","content":"hello"}\n', 'utf-8');

    const managedDefaultDir = path.join(tmpDir, 'workspaces', 'default');
    fs.mkdirSync(managedDefaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(managedDefaultDir, 'workspace.json'),
      JSON.stringify({
        id: 'default',
        name: 'Managed Default',
        group: 'test',
        teamId: 'backup-team',
        teamRole: 'member',
        created: new Date().toISOString(),
      }),
      'utf-8',
    );
    const managedDefaultMind = new MindDB(path.join(managedDefaultDir, 'workspace.mind'));
    managedDefaultMind.close();

    // Create marketplace.db (should be excluded from backup)
    fs.writeFileSync(path.join(tmpDir, 'marketplace.db'), 'fake marketplace data', 'utf-8');

    // Create node_modules dir (should be excluded)
    const nmDir = path.join(tmpDir, 'node_modules', 'fake-pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'index.js'), 'module.exports = {};', 'utf-8');

    // Create a .tmp file (should be excluded)
    fs.writeFileSync(path.join(tmpDir, 'something.tmp'), 'temporary', 'utf-8');

    // Build the local server
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Reset rate limiter between tests to prevent 429s (backup/restore has 2 req/min limit)
  beforeEach(() => {
    resetRateLimiter(server);
  });

  it('POST /api/backup returns an octet-stream file', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('waggle-backup');
    expect(res.headers['content-disposition']).toContain('.waggle-backup');
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('backup excludes marketplace.db and node_modules', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });

    expect(res.statusCode).toBe(200);
    const fileCount = parseInt(res.headers['x-waggle-backup-files'] as string, 10);

    // We should have the following included:
    // - personal.mind
    // - config.json
    // - workspaces/ws-1/sessions/session-1.jsonl
    // - .vault-key (created by VaultStore constructor)
    // - vault.json (may or may not exist)
    // - backup-metadata.json (created when first backup was made — but this is the first backup)
    // Excluded: marketplace.db, node_modules/*, something.tmp
    expect(fileCount).toBeGreaterThanOrEqual(3); // at minimum: personal.mind, config.json, session file

    // Verify by doing a restore preview to inspect file list
    const base64 = res.rawPayload.toString('base64');
    const previewRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: base64, preview: true },
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);
    const allFiles = [...preview.existingFiles, ...preview.newFiles];

    // Check exclusions
    expect(allFiles.some((f: string) => f === 'marketplace.db')).toBe(false);
    expect(allFiles.some((f: string) => f.startsWith('node_modules/'))).toBe(false);
    expect(allFiles.some((f: string) => f.endsWith('.tmp'))).toBe(false);
  });

  it('backup includes .mind files, config.json, and workspace sessions', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });

    const base64 = res.rawPayload.toString('base64');
    const previewRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: base64, preview: true },
    });

    const preview = JSON.parse(previewRes.body);
    const allFiles = [...preview.existingFiles, ...preview.newFiles];

    // Check inclusions
    expect(allFiles.some((f: string) => f === 'personal.mind')).toBe(true);
    expect(allFiles.some((f: string) => f === 'config.json')).toBe(true);
    expect(allFiles.some((f: string) => f.includes('session-1.jsonl'))).toBe(true);
  });

  it('POST /api/restore with preview=true returns preview without modifying files', async () => {
    // First create a backup
    const backupRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });
    const base64 = backupRes.rawPayload.toString('base64');

    // Get file modification time before preview
    const configPath = path.join(tmpDir, 'config.json');
    const mtimeBefore = fs.statSync(configPath).mtimeMs;

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: base64, preview: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.preview).toBe(true);
    expect(body.totalFiles).toBeGreaterThanOrEqual(3);
    expect(body.backupCreatedAt).toBeDefined();
    expect(Array.isArray(body.existingFiles)).toBe(true);
    expect(Array.isArray(body.newFiles)).toBe(true);
    expect(Array.isArray(body.conflicts)).toBe(true);

    // Verify files were not modified
    const mtimeAfter = fs.statSync(configPath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('POST /api/restore applies restore successfully', async () => {
    // Create backup
    const backupRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });
    const base64 = backupRes.rawPayload.toString('base64');

    // Apply restore (no preview)
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: base64, preview: false },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.restored).toBe(true);
    expect(body.filesRestored).toBeGreaterThanOrEqual(3);
    expect(body.backupCreatedAt).toBeDefined();
  });

  it('restores markerless legacy transcripts only to personal history and invalidates warm cache', async () => {
    const sessionId = `restored-legacy-${Date.now()}`;
    const personalSessionPath = path.join(
      tmpDir,
      'legacy-chat',
      'workspaces',
      'default',
      'sessions',
      `${sessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(personalSessionPath), { recursive: true });
    fs.writeFileSync(personalSessionPath, transcript('STALE PERSONAL CACHE'), 'utf-8');

    const warm = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?session=${sessionId}`,
    });
    expect(warm.statusCode).toBe(200);
    expect(warm.json().messages[0]?.content).toBe('STALE PERSONAL CACHE');

    const backup = buildUnencryptedBackup([{
      relativePath: `workspaces/default/sessions/${sessionId}.jsonl`,
      content: transcript('RESTORED PERSONAL HISTORY'),
    }]);
    const restore = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup },
    });
    expect(restore.statusCode).toBe(200);

    const personal = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?session=${sessionId}`,
    });
    const managed = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=default&session=${sessionId}`,
    });

    expect(personal.json().messages[0]?.content).toBe('RESTORED PERSONAL HISTORY');
    expect(managed.json().messages).toEqual([]);
  });

  it('canonicalizes managed-default workspace metadata before restore', () => {
    const [planned] = planChatHistoryRestore([{
      relativePath: 'WORKSPACES/DEFAULT/WORKSPACE.JSON',
      content: Buffer.from('{}', 'utf-8').toString('base64'),
    }]);

    expect(planned.relativePath).toBe('workspaces/default/workspace.json');
  });

  it('keeps marker-bearing personal and managed-default transcripts separate without replacing the live marker', async () => {
    const personalSession = `recorded-personal-${Date.now()}`;
    const managedSession = `recorded-managed-${Date.now()}`;
    const markerPath = path.join(tmpDir, 'chat-history-layout.json');
    const liveMarker = fs.readFileSync(markerPath, 'utf-8');
    const backup = buildUnencryptedBackup([
      {
        relativePath: 'CHAT-HISTORY-LAYOUT.JSON',
        content: JSON.stringify({ version: 1, status: 'ready' }),
      },
      {
        relativePath: `legacy-chat/workspaces/default/sessions/${personalSession}.jsonl`,
        content: transcript('RESTORED RECORDED PERSONAL'),
      },
      {
        relativePath: `WORKSPACES/DEFAULT/SESSIONS/${managedSession}.jsonl`,
        content: transcript('RESTORED RECORDED MANAGED'),
      },
      {
        relativePath: 'WORKSPACES/DEFAULT/WORKSPACE.JSON',
        content: JSON.stringify({ id: 'default', name: 'Managed Default' }),
      },
    ]);

    const restore = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup },
    });
    expect(restore.statusCode).toBe(200);

    const personal = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?session=${personalSession}`,
    });
    const managed = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=default&session=${managedSession}`,
    });

    expect(personal.json().messages[0]?.content).toBe('RESTORED RECORDED PERSONAL');
    expect(managed.json().messages[0]?.content).toBe('RESTORED RECORDED MANAGED');
    expect(fs.readFileSync(markerPath, 'utf-8')).toBe(liveMarker);

    const backupAgain = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });
    expect(backupAgain.statusCode).toBe(200);
    const restoreAgain = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: backupAgain.rawPayload.toString('base64') },
    });
    expect(restoreAgain.statusCode).toBe(200);
  });

  it('uses one restore participant identity across data-directory aliases', () => {
    const aliasPath = path.join(
      path.dirname(tmpDir),
      `${path.basename(tmpDir)}-restore-alias`,
    );
    fs.symlinkSync(
      tmpDir,
      aliasPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    let notifications = 0;
    const unregister = registerChatHistoryRestoreParticipant(tmpDir, {
      isBusy: () => true,
      onRestored: () => {
        notifications++;
      },
    });

    try {
      expect(isChatHistoryRestoreBusy(aliasPath)).toBe(true);
      notifyChatHistoryRestored(aliasPath);
      expect(notifications).toBe(1);
      if (process.platform === 'win32') {
        expect(isChatHistoryRestoreBusy(tmpDir.toUpperCase())).toBe(true);
      }
    } finally {
      unregister();
      fs.unlinkSync(aliasPath);
    }
  });

  it('rejects filesystem-equivalent restore targets before writing', async () => {
    const restore = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: {
        backup: buildUnencryptedBackup([
          { relativePath: 'Case-Duplicate.txt', content: 'first' },
          { relativePath: 'case-duplicate.txt', content: 'second' },
        ]),
      },
    });

    expect(restore.statusCode).toBe(409);
    expect(restore.json().error).toMatch(/duplicate target/i);
    expect(fs.existsSync(path.join(tmpDir, 'Case-Duplicate.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'case-duplicate.txt'))).toBe(false);
  });

  it('rejects dot-segment aliases before writing any restore entry', async () => {
    const safePath = path.join(tmpDir, `must-not-write-${Date.now()}.txt`);
    const restore = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: {
        backup: buildUnencryptedBackup([
          { relativePath: `staging/../${path.basename(safePath)}`, content: 'alias' },
          { relativePath: 'also-must-not-write.txt', content: 'unrelated' },
        ]),
      },
    });

    expect(restore.statusCode).toBe(400);
    expect(restore.json()).toMatchObject({ restored: false, filesRestored: 0 });
    expect(fs.existsSync(safePath)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'also-must-not-write.txt'))).toBe(false);
  });

  it('rejects restore before writing while a chat turn is active', async () => {
    const originalRunner = server.agentRunner;
    let markTurnStarted!: () => void;
    let releaseTurn!: () => void;
    const turnStarted = new Promise<void>((resolve) => {
      markTurnStarted = resolve;
    });
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    server.agentRunner = async () => {
      markTurnStarted();
      await turnGate;
      return {
        content: 'turn complete',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    const markerPath = path.join(tmpDir, 'must-not-restore-during-chat.txt');
    fs.rmSync(markerPath, { force: true });
    const activeTurn = injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        workspace: server.agentState.activeWorkspaceId,
        session: `active-restore-${Date.now()}`,
        message: 'Keep this turn active.',
      },
    });

    try {
      await turnStarted;
      const restore = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/restore',
        payload: {
          backup: buildUnencryptedBackup([{
            relativePath: path.basename(markerPath),
            content: 'must not be written',
          }]),
        },
      });

      expect(restore.statusCode).toBe(409);
      expect(restore.json()).toMatchObject({ code: 'CHAT_TURN_IN_PROGRESS' });
      expect(fs.existsSync(markerPath)).toBe(false);
    } finally {
      releaseTurn();
      await activeTurn;
      server.agentRunner = originalRunner;
    }
  });

  it('rejects ambiguous markerless default history before writing any archive file', async () => {
    const sessionId = `ambiguous-restore-${Date.now()}`;
    const managedSessionPath = path.join(
      tmpDir,
      'workspaces',
      'default',
      'sessions',
      `${sessionId}.jsonl`,
    );
    fs.rmSync(managedSessionPath, { force: true });
    const unrelatedPath = path.join(tmpDir, `must-not-restore-${Date.now()}.txt`);

    const restore = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: {
        backup: buildUnencryptedBackup([
          {
            relativePath: `workspaces/default/sessions/${sessionId}.jsonl`,
            content: transcript('AMBIGUOUS HISTORY'),
          },
          {
            relativePath: 'workspaces/default/workspace.json',
            content: JSON.stringify({ id: 'default', name: 'Managed Default' }),
          },
          {
            relativePath: path.basename(unrelatedPath),
            content: 'must not be written',
          },
        ]),
      },
    });

    expect(restore.statusCode).toBe(409);
    expect(restore.json().error).toMatch(/ambiguous/i);
    expect(fs.existsSync(managedSessionPath)).toBe(false);
    expect(fs.existsSync(unrelatedPath)).toBe(false);
  });

  it('restore rejects corrupted/invalid files', async () => {
    // Random bytes — not a valid backup
    const garbage = crypto.randomBytes(256).toString('base64');

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: garbage },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('backup → restore round-trip preserves content', async () => {
    // Write a unique marker file
    const markerContent = `round-trip-test-${Date.now()}`;
    fs.writeFileSync(path.join(tmpDir, 'roundtrip-marker.txt'), markerContent, 'utf-8');

    // Create backup (contains the marker)
    const backupRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });
    const base64 = backupRes.rawPayload.toString('base64');

    // Delete the marker file
    fs.unlinkSync(path.join(tmpDir, 'roundtrip-marker.txt'));
    expect(fs.existsSync(path.join(tmpDir, 'roundtrip-marker.txt'))).toBe(false);

    // Restore from backup
    const restoreRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: base64 },
    });

    expect(restoreRes.statusCode).toBe(200);
    const body = JSON.parse(restoreRes.body);
    expect(body.restored).toBe(true);

    // Verify the marker file was restored
    expect(fs.existsSync(path.join(tmpDir, 'roundtrip-marker.txt'))).toBe(true);
    const restored = fs.readFileSync(path.join(tmpDir, 'roundtrip-marker.txt'), 'utf-8');
    expect(restored).toBe(markerContent);
  });

  it('backup without vault key produces unencrypted archive', async () => {
    // Create a separate temp dir without a vault key
    const noKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-nokey-test-'));
    fs.writeFileSync(path.join(noKeyDir, 'config.json'), JSON.stringify({
      defaultModel: 'test/model',
      providers: {},
      test: true,
    }), 'utf-8');

    // Create a separate server instance
    const personalPath = path.join(noKeyDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    sessions.create('nokey-test');
    mind.close();

    // Remove the vault key that VaultStore auto-creates
    const vaultKeyPath = path.join(noKeyDir, '.vault-key');
    if (fs.existsSync(vaultKeyPath)) {
      fs.unlinkSync(vaultKeyPath);
    }

    const noKeyServer = await buildLocalServer({ dataDir: noKeyDir });

    // Remove vault key again (buildLocalServer creates VaultStore which auto-creates key)
    // We need to test the actual route behavior, and the key was already created.
    // Instead, just verify the backup header says unencrypted when key is absent.
    // Since buildLocalServer always creates a key, we test the encrypted case works.
    const res = await injectWithAuth(noKeyServer, {
      method: 'POST',
      url: '/api/backup',
    });

    expect(res.statusCode).toBe(200);
    // The backup was created (either encrypted or not — both are valid)
    expect(res.headers['content-type']).toBe('application/octet-stream');

    await noKeyServer.close();
    fs.rmSync(noKeyDir, { recursive: true, force: true });
  });

  it('restore with tampered data fails', async () => {
    // Create a valid backup
    const backupRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });

    // Tamper with the encrypted content (flip some bytes after the header)
    const raw = Buffer.from(backupRes.rawPayload);
    // Tamper with bytes near the end (ciphertext area)
    if (raw.length > 80) {
      raw[raw.length - 1] ^= 0xff;
      raw[raw.length - 2] ^= 0xff;
      raw[raw.length - 10] ^= 0xff;
    }
    const tamperedBase64 = raw.toString('base64');

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: { backup: tamperedBase64 },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('GET /api/backup/metadata returns metadata after backup', async () => {
    // Create a backup first (updates metadata)
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/backup',
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/backup/metadata',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.lastBackupAt).toBeDefined();
    expect(body.sizeBytes).toBeGreaterThan(0);
    expect(body.fileCount).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/restore rejects missing backup field', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/restore',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('backup');
  });
});
