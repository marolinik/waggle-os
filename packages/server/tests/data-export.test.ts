import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { MindDB, FrameStore, SessionStore, WorkspaceManager, WaggleConfig, VaultStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

/**
 * Minimal ZIP parser — reads the central directory to extract file names.
 * ZIP files have a central directory at the end with all entry metadata.
 */
function extractZipFileNames(buffer: Buffer): string[] {
  const names: string[] = [];
  // Scan for central directory file headers (signature 0x02014b50)
  for (let i = 0; i < buffer.length - 46; i++) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x01 &&
      buffer[i + 3] === 0x02
    ) {
      const nameLen = buffer.readUInt16LE(i + 28);
      const extraLen = buffer.readUInt16LE(i + 30);
      const commentLen = buffer.readUInt16LE(i + 32);
      const nameStart = i + 46;
      if (nameStart + nameLen <= buffer.length) {
        const name = buffer.toString('utf-8', nameStart, nameStart + nameLen);
        names.push(name);
      }
      // Skip past this entry
      i += 45 + nameLen + extraLen + commentLen;
    }
  }
  return names;
}

/**
 * Extract a specific file's content from a ZIP buffer.
 * Reads local file headers (signature 0x04034b50) for uncompressed entries.
 */
function extractZipFileContent(buffer: Buffer, targetName: string): string | null {
  for (let i = 0; i < buffer.length - 30; i++) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x03 &&
      buffer[i + 3] === 0x04
    ) {
      const compressionMethod = buffer.readUInt16LE(i + 8);
      const compressedSize = buffer.readUInt32LE(i + 18);
      const uncompressedSize = buffer.readUInt32LE(i + 22);
      const nameLen = buffer.readUInt16LE(i + 26);
      const extraLen = buffer.readUInt16LE(i + 28);
      const nameStart = i + 30;
      if (nameStart + nameLen <= buffer.length) {
        const name = buffer.toString('utf-8', nameStart, nameStart + nameLen);
        if (name === targetName && compressionMethod === 0) {
          // Stored (uncompressed) — read directly
          const dataStart = nameStart + nameLen + extraLen;
          if (dataStart + uncompressedSize <= buffer.length) {
            return buffer.toString('utf-8', dataStart, dataStart + uncompressedSize);
          }
        }
      }
    }
  }
  return null;
}

describe('Data Export (GDPR)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    // Create a temp directory for test data
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-export-test-'));

    // Create personal.mind with test data
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test-export');
    frames.createIFrame(s1.gop_id, 'Export test memory frame', 'normal');
    frames.createIFrame(s1.gop_id, 'Another memory for export', 'important');
    mind.close();

    // Create a workspace with a session
    const wsManager = new WorkspaceManager(tmpDir);
    const ws = wsManager.create({ name: 'Test Export WS', group: 'Testing' });
    const sessionsDir = path.join(tmpDir, 'workspaces', ws.id, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'test-session.jsonl'),
      [
        JSON.stringify({ type: 'meta', title: 'Export Test Session', created: new Date().toISOString() }),
        JSON.stringify({ role: 'user', content: 'Hello, test export!', timestamp: new Date().toISOString() }),
        JSON.stringify({ role: 'assistant', content: 'This is a test response for export.', timestamp: new Date().toISOString() }),
      ].join('\n') + '\n',
      'utf-8',
    );

    // Create config.json with a test provider
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('claude-sonnet-4-6');
    config.setProvider('anthropic', { apiKey: 'sk-ant-secret-key-12345678', models: ['claude-sonnet-4-6'] });
    config.save();

    // Create vault with a test entry
    const vault = new VaultStore(tmpDir);
    vault.set('anthropic', 'sk-ant-secret-key-12345678', { models: ['claude-sonnet-4-6'] });

    // Build the local server
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/export returns a ZIP with correct Content-Type', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="waggle-export-\d{4}-\d{2}-\d{2}\.zip"$/);
  });

  it('ZIP contains expected directories (memories, sessions, workspaces)', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/export' });
    const buffer = Buffer.from(res.rawPayload);
    const fileNames = extractZipFileNames(buffer);

    // Check that key directories/files are present
    const hasMemories = fileNames.some(n => n.startsWith('memories/'));
    const hasSessions = fileNames.some(n => n.startsWith('sessions/'));
    const hasWorkspaces = fileNames.some(n => n.startsWith('workspaces/'));
    const hasSettings = fileNames.some(n => n === 'settings.json');
    const hasVaultMeta = fileNames.some(n => n === 'vault-metadata.json');

    expect(hasMemories).toBe(true);
    expect(hasSessions).toBe(true);
    expect(hasWorkspaces).toBe(true);
    expect(hasSettings).toBe(true);
    expect(hasVaultMeta).toBe(true);
  });

  it('settings in export have masked API keys', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/export' });
    const buffer = Buffer.from(res.rawPayload);
    const fileNames = extractZipFileNames(buffer);

    // settings.json must exist
    expect(fileNames).toContain('settings.json');

    // For compressed entries, we verify by checking the raw buffer
    // does NOT contain the original key as plaintext
    const rawContent = buffer.toString('utf-8');
    expect(rawContent).not.toContain('sk-ant-secret-key-12345678');
  });

  it('vault metadata excludes secret values', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/export' });
    const buffer = Buffer.from(res.rawPayload);
    const fileNames = extractZipFileNames(buffer);

    expect(fileNames).toContain('vault-metadata.json');

    // Ensure the full ZIP content does NOT contain the decrypted secret value
    const rawContent = buffer.toString('utf-8');
    expect(rawContent).not.toContain('sk-ant-secret-key-12345678');
  });

  it('export works with empty data (new installation)', async () => {
    // Create a fresh server with empty data
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-export-empty-'));
    const emptyPersonalPath = path.join(emptyDir, 'personal.mind');
    const emptyMind = new MindDB(emptyPersonalPath);
    emptyMind.close();

    const emptyServer = await buildLocalServer({ dataDir: emptyDir });
    try {
      const res = await injectWithAuth(emptyServer, { method: 'POST', url: '/api/export' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');

      const buffer = Buffer.from(res.rawPayload);
      const fileNames = extractZipFileNames(buffer);

      // Even with empty data, core files should exist
      expect(fileNames).toContain('memories/personal-frames.json');
      expect(fileNames).toContain('settings.json');
      expect(fileNames).toContain('vault-metadata.json');
    } finally {
      await emptyServer.close();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('export ZIP has reasonable size (not empty)', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/export' });
    const buffer = Buffer.from(res.rawPayload);
    // ZIP should be at least a few hundred bytes (headers + content)
    expect(buffer.length).toBeGreaterThan(100);
  });
});
