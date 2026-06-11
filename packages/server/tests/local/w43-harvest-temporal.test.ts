import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

/**
 * W4.3c — sidecar harvest commit path: write-time temporal anchoring
 * (W4-PRODUCTION-PORT-PLAN-2026-06-11.md component #6 ingest unification).
 * The commit route now resolves relative cues in content against the source
 * timestamp — same contract as the hive-mind-mcp-server harvest path
 * (commit 09a040d). Benchmark-validated: LoCoMo P4 temporal lineage.
 */

// ChatGPT export shape: one conversation narrating a "yesterday" event.
// create_time 1700000000 = 2023-11-14T22:13:20Z → "yesterday" = 2023-11-13.
const EXPORT_WITH_CUE = [
  {
    title: 'Dentist chat',
    create_time: 1700000000,
    mapping: {
      node1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['I went to the dentist yesterday and it went fine.'] },
          create_time: 1700000000,
        },
      },
    },
  },
];

describe('W4.3c — harvest commit write-time temporal anchoring', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-w43-harvest-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves a relative cue against the source timestamp on commit', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/harvest/commit',
      payload: { data: EXPORT_WITH_CUE, source: 'chatgpt' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { saved: number };
    expect(body.saved).toBeGreaterThan(0);

    const personalDb = server.multiMind!.personal;
    const row = personalDb.getDatabase().prepare(
      `SELECT content, created_at FROM memory_frames WHERE content LIKE '%dentist%'`
    ).get() as { content: string; created_at: string } | undefined;

    expect(row).toBeDefined();
    // "yesterday" resolved against 2023-11-14 (create_time) → 2023-11-13,
    // NOT the export timestamp and NOT ingest wall-clock.
    expect(row!.created_at).toBe('2023-11-13T00:00:00Z');
  });
});
