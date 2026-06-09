/**
 * Harvest classification tests (UX-Refactor Phase 2B.3)
 *
 * Pure unit coverage of harvest-classify.ts (ImportItemType→MemoryKind map +
 * confidence heuristic), plus an end-to-end check that the preview classifies
 * items and that committed frames land as 'unreviewed' with a confidence + kind
 * in their metadata (the C33/B2 behaviour).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ImportItemType } from '@waggle/core';
import { MindDB, FrameStore } from '@waggle/core';
import type { MemoryKind } from '@waggle/shared';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';
import { importItemTypeToMemoryKind, harvestConfidence } from '../../src/local/routes/harvest-classify.js';

const ALL_IMPORT_TYPES: ImportItemType[] = [
  'conversation', 'memory', 'instruction', 'preference', 'artifact', 'rule', 'decision', 'document',
];
const VALID_KINDS: MemoryKind[] = [
  'fact', 'decision', 'task', 'preference', 'strategy', 'learning', 'goal', 'entity',
];

describe('harvest-classify (pure)', () => {
  it('maps every ImportItemType to a valid MemoryKind', () => {
    for (const t of ALL_IMPORT_TYPES) {
      expect(VALID_KINDS).toContain(importItemTypeToMemoryKind(t));
    }
  });

  it('preserves the explicit-statement kinds', () => {
    expect(importItemTypeToMemoryKind('decision')).toBe('decision');
    expect(importItemTypeToMemoryKind('preference')).toBe('preference');
    expect(importItemTypeToMemoryKind('rule')).toBe('preference');
    expect(importItemTypeToMemoryKind('conversation')).toBe('fact');
  });

  it('produces a confidence in [0,100], higher for explicit decisions than chat', () => {
    const decision = harvestConfidence({ type: 'decision', source: 'claude' });
    const chat = harvestConfidence({ type: 'conversation', source: 'unknown' });
    expect(decision).toBeGreaterThanOrEqual(0);
    expect(decision).toBeLessThanOrEqual(100);
    expect(chat).toBeGreaterThanOrEqual(0);
    expect(chat).toBeLessThanOrEqual(100);
    expect(decision).toBeGreaterThan(chat);
  });
});

const CHATGPT_EXPORT = [
  {
    title: 'Editor preferences',
    create_time: 1700000000,
    mapping: {
      n1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['My preferred editor is VSCode with vim bindings.'] },
          create_time: 1700000001,
        },
      },
    },
  },
];

describe('harvest preview + commit classification (Phase 2B.3)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-harvest-classify-test-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET-equivalent preview returns classified items with kind + confidence', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/harvest/preview',
      payload: { data: CHATGPT_EXPORT, source: 'chatgpt' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(VALID_KINDS).toContain(item.kind);
      expect(typeof item.confidence).toBe('number');
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('commit stamps harvested frames as unreviewed with confidence + kind (C33/B2)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/harvest/commit',
      payload: { data: CHATGPT_EXPORT, source: 'chatgpt' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().saved).toBeGreaterThan(0);

    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    const frames = new FrameStore(mind);
    const harvested = frames.getRecent(50).filter(f => f.source === 'import');
    expect(harvested.length).toBeGreaterThan(0);
    const stamped = harvested.find(f => {
      const m = f.metadata ? JSON.parse(f.metadata) : {};
      return m.status === 'unreviewed' && typeof m.confidence === 'number' && VALID_KINDS.includes(m.kind);
    });
    expect(stamped, 'at least one harvested frame is stamped unreviewed').toBeTruthy();
    mind.close();
  });
});
