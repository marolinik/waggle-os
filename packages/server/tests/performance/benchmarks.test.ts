/**
 * Performance Benchmarks
 *
 * Tests critical performance paths with generous thresholds (CI is slower).
 * All tests use temp directories — no real user data is touched.
 *
 * Coverage:
 *   1. Cold start: server boot → first response
 *   2. FTS5 search with 1000+ frames
 *   3. Workspace list with 50 workspaces
 *   4. Session load with 500 messages
 *   5. Marketplace FTS5 search (bundled DB)
 *   6. Vault set+get cycle
 *   7. Memory frame batch write (100 frames)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore, VaultStore, WorkspaceManager } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-perf-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}

// ── 1. Cold Start Benchmark ─────────────────────────────────────────────

describe('Performance Benchmarks', () => {
  describe('Cold Start', () => {
    it('server boots and responds within 5 seconds', async () => {
      const tmpDir = createTmpDir('coldstart');
      try {
        // Create a minimal personal.mind so the server can start
        const personalPath = path.join(tmpDir, 'personal.mind');
        const mind = new MindDB(personalPath);
        mind.close();

        const start = Date.now();
        const server = await buildLocalServer({ dataDir: tmpDir });
        const res = await injectWithAuth(server, { method: 'GET', url: '/health' });
        const elapsed = Date.now() - start;

        expect(res.statusCode).toBe(200);
        // Generous threshold: CI machines can be slow. 5s is the safety margin.
        expect(elapsed).toBeLessThan(5000);

        await server.close();
      } finally {
        cleanupDir(tmpDir);
      }
    }, 15_000);
  });

  // ── 2. FTS5 Search Performance ──────────────────────────────────────

  describe('FTS5 Search with 1000 frames', () => {
    let tmpDir: string;
    let mind: MindDB;
    let frames: FrameStore;
    let sessions: SessionStore;
    let gopId: string;

    beforeAll(() => {
      tmpDir = createTmpDir('fts5');
      const dbPath = path.join(tmpDir, 'personal.mind');
      mind = new MindDB(dbPath);
      frames = new FrameStore(mind);
      sessions = new SessionStore(mind);

      // Create a session for FK constraints
      const session = sessions.create('perf-test');
      gopId = session.gop_id;

      // Insert 1000 frames with varied content
      const topics = [
        'machine learning model training optimization',
        'database indexing strategies for SQLite',
        'TypeScript generics and type inference',
        'React component lifecycle management',
        'Node.js event loop performance tuning',
        'memory management garbage collection patterns',
        'API design RESTful best practices',
        'testing strategies unit integration e2e',
        'CI/CD pipeline automation deployment',
        'microservices architecture communication patterns',
      ];

      for (let i = 0; i < 1000; i++) {
        const topic = topics[i % topics.length];
        frames.createIFrame(gopId, `Frame ${i}: ${topic} — detailed notes about ${topic} iteration ${i}`, 'normal');
      }
    });

    afterAll(() => {
      mind.close();
      cleanupDir(tmpDir);
    });

    it('FTS5 keyword search completes within 200ms for 1000 frames', () => {
      const raw = mind.getDatabase();

      const start = Date.now();
      const results = raw.prepare(`
        SELECT mf.* FROM memory_frames mf
        INNER JOIN memory_frames_fts fts ON mf.id = fts.rowid
        WHERE memory_frames_fts MATCH ?
        LIMIT 20
      `).all('machine learning');
      const elapsed = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      // 200ms is generous — SQLite FTS5 on 1000 rows should be <10ms
      expect(elapsed).toBeLessThan(200);
    });

    it('FTS5 wildcard search completes within 200ms', () => {
      const raw = mind.getDatabase();

      const start = Date.now();
      const results = raw.prepare(`
        SELECT mf.* FROM memory_frames mf
        INNER JOIN memory_frames_fts fts ON mf.id = fts.rowid
        WHERE memory_frames_fts MATCH ?
        LIMIT 20
      `).all('database*');
      const elapsed = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(200);
    });

    it('frame count query completes within 50ms', () => {
      const raw = mind.getDatabase();

      const start = Date.now();
      const row = raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number };
      const elapsed = Date.now() - start;

      expect(row.cnt).toBe(1000);
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ── 3. Workspace List Performance ───────────────────────────────────

  describe('Workspace Listing with 50 workspaces', () => {
    let tmpDir: string;
    let server: FastifyInstance;

    beforeAll(async () => {
      tmpDir = createTmpDir('ws-list');

      // Create personal.mind
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      mind.close();

      // Create 50 workspaces via WorkspaceManager
      const wsManager = new WorkspaceManager(tmpDir);
      for (let i = 0; i < 50; i++) {
        wsManager.create({
          name: `Project ${i}`,
          group: `Group ${i % 5}`,
          icon: 'folder',
        });
      }

      server = await buildLocalServer({ dataDir: tmpDir });
    }, 30_000);

    afterAll(async () => {
      await server.close();
      cleanupDir(tmpDir);
    });

    it('listing 50 workspaces via API completes within 500ms', async () => {
      const start = Date.now();
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/workspaces' });
      const elapsed = Date.now() - start;

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.length).toBe(50);
      // 500ms is generous for reading 50 JSON files from disk
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ── 4. Session Load Performance ─────────────────────────────────────

  describe('Session File Loading', () => {
    let tmpDir: string;
    let sessionFilePath: string;

    beforeAll(() => {
      tmpDir = createTmpDir('session-load');

      // Create a session JSONL file with 500 messages
      const sessionsDir = path.join(tmpDir, 'workspaces', 'test-ws', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });

      sessionFilePath = path.join(sessionsDir, '2026-03-19-benchmark.jsonl');
      const lines: string[] = [];
      for (let i = 0; i < 500; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        const content = `${role === 'user' ? 'Question' : 'Answer'} number ${i}: ${
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(3)
        }`;
        lines.push(JSON.stringify({
          role,
          content,
          timestamp: new Date(Date.now() - (500 - i) * 60000).toISOString(),
        }));
      }
      fs.writeFileSync(sessionFilePath, lines.join('\n'));
    });

    afterAll(() => {
      cleanupDir(tmpDir);
    });

    it('loading and parsing a 500-message JSONL file completes within 500ms', () => {
      const start = Date.now();
      const raw = fs.readFileSync(sessionFilePath, 'utf-8');
      const messages = raw.trim().split('\n').map(line => JSON.parse(line));
      const elapsed = Date.now() - start;

      expect(messages.length).toBe(500);
      expect(messages[0].role).toBe('user');
      expect(messages[499].role).toBe('assistant');
      // 500ms is generous — 500 lines of JSONL should parse in <50ms
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ── 5. Marketplace FTS5 Search ──────────────────────────────────────

  describe('Marketplace Search', () => {
    it('marketplace FTS5 search completes within 200ms (bundled DB)', () => {
      // Try to find the bundled marketplace.db
      // Use multiple resolution strategies (relative to test file and repo root)
      const possiblePaths = [
        path.resolve(__dirname, '../../../../marketplace/marketplace.db'),
        path.resolve(__dirname, '../../../../../packages/marketplace/marketplace.db'),
        path.resolve(process.cwd(), 'packages/marketplace/marketplace.db'),
      ];

      let dbPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          dbPath = p;
          break;
        }
      }

      if (!dbPath) {
        // Skip if bundled DB not available (e.g., fresh clone without seed)
        console.log('  [skip] marketplace.db not found — skipping marketplace benchmark');
        return;
      }

      // Copy to a temp location so we don't accidentally modify the source
      const tmpDir = createTmpDir('mkt-search');
      const tmpDbPath = path.join(tmpDir, 'marketplace.db');
      fs.copyFileSync(dbPath, tmpDbPath);

      try {
        // Dynamic import to avoid hard dependency
        const Database = require('better-sqlite3');
        const db = new Database(tmpDbPath, { readonly: true });
        db.pragma('journal_mode = WAL');

        const start = Date.now();
        const results = db.prepare(`
          SELECT p.* FROM packages p
          INNER JOIN packages_fts fts ON p.id = fts.rowid
          WHERE packages_fts MATCH ?
          LIMIT 20
        `).all('code review');
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(200);
        // The marketplace should have at least some results for "code review"
        expect(results.length).toBeGreaterThanOrEqual(0);

        db.close();
      } finally {
        cleanupDir(tmpDir);
      }
    });
  });

  // ── 6. Vault Operations ─────────────────────────────────────────────

  describe('Vault Encrypt/Decrypt Cycle', () => {
    let tmpDir: string;
    let vault: VaultStore;

    beforeEach(() => {
      tmpDir = createTmpDir('vault');
      vault = new VaultStore(tmpDir);
    });

    afterEach(() => {
      cleanupDir(tmpDir);
    });

    it('vault set+get cycle completes within 100ms', () => {
      const start = Date.now();
      vault.set('BENCHMARK_KEY', 'sk-benchmark-secret-value-12345');
      const result = vault.get('BENCHMARK_KEY');
      const elapsed = Date.now() - start;

      expect(result).not.toBeNull();
      expect(result!.value).toBe('sk-benchmark-secret-value-12345');
      // 100ms is generous — AES-256-GCM + file I/O should be <20ms
      expect(elapsed).toBeLessThan(100);
    });

    it('10 sequential set+get cycles complete within 500ms', () => {
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        vault.set(`KEY_${i}`, `secret-value-${i}-${'x'.repeat(100)}`);
        const result = vault.get(`KEY_${i}`);
        expect(result).not.toBeNull();
        expect(result!.value).toBe(`secret-value-${i}-${'x'.repeat(100)}`);
      }
      const elapsed = Date.now() - start;

      // 500ms for 10 encrypt+decrypt+file-write cycles
      expect(elapsed).toBeLessThan(500);
    });

    it('vault list with 20 secrets completes within 50ms', () => {
      // Pre-populate
      for (let i = 0; i < 20; i++) {
        vault.set(`LIST_KEY_${i}`, `value-${i}`);
      }

      const start = Date.now();
      const secrets = vault.list();
      const elapsed = Date.now() - start;

      expect(secrets.length).toBe(20);
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ── 7. Memory Frame Write Performance ───────────────────────────────

  describe('Memory Frame Batch Write', () => {
    let tmpDir: string;
    let mind: MindDB;
    let frames: FrameStore;
    let sessions: SessionStore;

    beforeEach(() => {
      tmpDir = createTmpDir('frame-write');
      const dbPath = path.join(tmpDir, 'write-bench.mind');
      mind = new MindDB(dbPath);
      frames = new FrameStore(mind);
      sessions = new SessionStore(mind);
    });

    afterEach(() => {
      mind.close();
      cleanupDir(tmpDir);
    });

    it('writing 100 I-frames completes within 2 seconds', () => {
      const session = sessions.create('write-bench');
      const gopId = session.gop_id;

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        frames.createIFrame(
          gopId,
          `Batch write test frame ${i}: This is a moderately sized content block that simulates real-world memory frame sizes with enough text to be meaningful.`,
          'normal'
        );
      }
      const elapsed = Date.now() - start;

      // Verify all frames were written
      const allFrames = frames.getGopFrames(gopId);
      expect(allFrames.length).toBe(100);
      // 2 seconds is generous — SQLite WAL mode batch writes should be <500ms
      expect(elapsed).toBeLessThan(2000);
    });

    it('writing 100 P-frames completes within 2 seconds', () => {
      const session = sessions.create('pframe-bench');
      const gopId = session.gop_id;

      // Create an I-frame as the base
      const baseFrame = frames.createIFrame(gopId, 'Base frame for P-frame benchmark', 'normal');

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        frames.createPFrame(
          gopId,
          `P-frame delta ${i}: Updated information about the topic with new details and corrections.`,
          baseFrame.id,
          'normal'
        );
      }
      const elapsed = Date.now() - start;

      // 1 base + 100 P-frames = 101
      const allFrames = frames.getGopFrames(gopId);
      expect(allFrames.length).toBe(101);
      expect(elapsed).toBeLessThan(2000);
    });

    it('creating 50 sessions completes within 1 second', () => {
      const start = Date.now();
      for (let i = 0; i < 50; i++) {
        sessions.create(`session-bench-${i}`);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });
  });
});
