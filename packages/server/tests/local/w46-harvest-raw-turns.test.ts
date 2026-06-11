import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

/**
 * W4.6c — sidecar harvest commit path stores per-turn raw dialogue frames
 * (`[mind-rawturn conv:<key> turn:<n> speaker:<s>]`) alongside the summary
 * frame: the source material for the RAWDETAIL recall lane (plan #10).
 * Kill switch WAGGLE_RAWDETAIL=0 suppresses the writes.
 */

// ChatGPT export: one conversation, three mapped messages in dialogue order.
// create_time 1700000000 = 2023-11-14T22:13:20Z.
const EXPORT_THREE_TURNS = [
  {
    title: 'Gallery visit',
    create_time: 1700000000,
    mapping: {
      n1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['I saw a painting of a sunset with a pink sky today.'] },
          create_time: 1700000000,
        },
      },
      n2: {
        message: {
          author: { role: 'assistant' },
          content: { parts: ['That sounds lovely — which gallery was it?'] },
          create_time: 1700000100,
        },
      },
      n3: {
        message: {
          author: { role: 'user' },
          content: { parts: ['The Mauritshuis, in the east wing.'] },
          create_time: 1700000200,
        },
      },
    },
  },
];

describe('W4.6c — harvest commit stores per-turn raw dialogue frames', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-w46-harvest-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores one [mind-rawturn] frame per dialogue turn, reported in the response', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/harvest/commit',
      payload: { data: EXPORT_THREE_TURNS, source: 'chatgpt' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { saved: number; rawTurnsWritten: number };
    expect(body.saved).toBeGreaterThan(0);
    expect(body.rawTurnsWritten).toBe(3);

    const personalDb = server.multiMind!.personal;
    const rows = personalDb.getDatabase().prepare(
      `SELECT content, created_at FROM memory_frames
       WHERE content LIKE '[mind-rawturn %' ORDER BY id ASC`
    ).all() as Array<{ content: string; created_at: string }>;

    expect(rows).toHaveLength(3);
    expect(rows[0].content).toMatch(/^\[mind-rawturn conv:[A-Za-z0-9_-]+ turn:0 speaker:user\]/);
    expect(rows[0].content).toContain('painting of a sunset with a pink sky');
    expect(rows[1].content).toMatch(/turn:1 speaker:assistant\]/);
    expect(rows[2].content).toContain('Mauritshuis');
    // summary frame still written alongside (not replaced)
    const summary = personalDb.getDatabase().prepare(
      `SELECT COUNT(*) AS c FROM memory_frames WHERE content LIKE '[Harvest:chatgpt]%'`
    ).get() as { c: number };
    expect(summary.c).toBeGreaterThan(0);
  });

  it('WAGGLE_RAWDETAIL=0 suppresses raw-turn writes', async () => {
    process.env.WAGGLE_RAWDETAIL = '0';
    try {
      const before = (server.multiMind!.personal.getDatabase().prepare(
        `SELECT COUNT(*) AS c FROM memory_frames WHERE content LIKE '[mind-rawturn %'`
      ).get() as { c: number }).c;

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/commit',
        payload: {
          data: [{
            title: 'Second convo',
            create_time: 1700100000,
            mapping: {
              m1: {
                message: {
                  author: { role: 'user' },
                  content: { parts: ['a completely different conversation about sailing'] },
                  create_time: 1700100000,
                },
              },
            },
          }],
          source: 'chatgpt',
        },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { rawTurnsWritten: number }).rawTurnsWritten).toBe(0);

      const after = (server.multiMind!.personal.getDatabase().prepare(
        `SELECT COUNT(*) AS c FROM memory_frames WHERE content LIKE '[mind-rawturn %'`
      ).get() as { c: number }).c;
      expect(after).toBe(before);
    } finally {
      delete process.env.WAGGLE_RAWDETAIL;
    }
  });
});
