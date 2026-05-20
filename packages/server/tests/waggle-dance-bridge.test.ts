/**
 * AI-OS Phase 1C — bridge tests.
 *
 * Two layers:
 *   1. Unit tests for the pure mapping functions (categorizeSubtype,
 *      buildLegacyContent).
 *   2. End-to-end test: POST /api/waggle-dance/signal → GET
 *      /api/waggle/signals (legacy UI endpoint) returns the bridged
 *      signal.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import {
  categorizeSubtype,
  buildLegacyContent,
} from '../src/local/waggle-dance-bridge.js';
import type { WaggleMessage, MessageSubtype } from '@waggle/shared';

// ── Unit: categorizeSubtype ─────────────────────────────────────────

describe('categorizeSubtype', () => {
  it.each<[MessageSubtype, string]>([
    ['discovery', 'discovery'],
    ['knowledge_check', 'discovery'],
    ['skill_request', 'discovery'],
    ['task_delegation', 'handoff'],
    ['skill_share', 'handoff'],
    ['routed_share', 'handoff'],
    ['knowledge_match', 'insight'],
    ['task_claim', 'coordination'],
    ['model_recipe', 'coordination'],
    ['model_recommendation', 'coordination'],
  ])('maps %s → %s', (subtype, expected) => {
    expect(categorizeSubtype(subtype)).toBe(expected);
  });

  it('falls back to coordination on unknown subtype (defense in depth)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(categorizeSubtype('made_up' as any)).toBe('coordination');
  });
});

// ── Unit: buildLegacyContent ────────────────────────────────────────

function makeMsg(overrides: Partial<WaggleMessage>): WaggleMessage {
  return {
    id: 'm-1',
    teamId: 'personal::test',
    senderId: 'test',
    type: 'broadcast',
    subtype: 'discovery',
    content: {},
    referenceId: null,
    routing: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('buildLegacyContent', () => {
  it('uses content.topic when present', () => {
    const out = buildLegacyContent(
      makeMsg({ subtype: 'discovery', content: { topic: 'webhook rotation' } }),
    );
    expect(out).toBe('discovery: webhook rotation');
  });

  it('falls back to content.task', () => {
    const out = buildLegacyContent(
      makeMsg({
        type: 'request',
        subtype: 'task_delegation',
        content: { task: 'analyze Q4', role: 'analyst' },
      }),
    );
    expect(out).toBe('task_delegation: analyze Q4');
  });

  it('falls back to content.query', () => {
    const out = buildLegacyContent(
      makeMsg({
        type: 'request',
        subtype: 'knowledge_check',
        content: { query: 'sql injection' },
      }),
    );
    expect(out).toBe('knowledge_check: sql injection');
  });

  it('summarizes keys when no topic-like field exists', () => {
    const out = buildLegacyContent(
      makeMsg({
        type: 'response',
        subtype: 'knowledge_match',
        content: { matchedEntities: ['e1', 'e2'], confidence: 0.91 },
      }),
    );
    expect(out).toMatch(/knowledge_match \(/);
    expect(out).toContain('matchedEntities');
    expect(out).toContain('confidence');
  });

  it('handles empty content gracefully', () => {
    const out = buildLegacyContent(
      makeMsg({ type: 'broadcast', subtype: 'discovery', content: {} }),
    );
    expect(out).toBe('discovery');
  });
});

// ── End-to-end: POST v2 signal → GET legacy signals ─────────────────

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-wd-bridge-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('WaggleDance bridge (v2 → legacy)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('e2e');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('bridge-test');
    frames.createIFrame(s.gop_id, 'bridge-test seed', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  beforeEach(() => {
    if (server?.signalBus) server.signalBus.clear();
  });

  it('a discovery posted to /api/waggle-dance/signal appears at /api/waggle/signals', async () => {
    const postRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        senderId: 'claude-code-hook',
        content: { tool: 'claude-code', topic: 'webhook secret rotation' },
      },
    });
    expect(postRes.statusCode).toBe(201);

    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle/signals?limit=10',
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.signals).toBeDefined();
    expect(body.signals.length).toBeGreaterThan(0);
    const bridged = body.signals.find((s: { metadata?: { subtype?: string } }) =>
      s.metadata?.subtype === 'discovery'
    );
    expect(bridged).toBeTruthy();
    expect(bridged.type).toBe('waggle-dance:discovery');
    expect(bridged.workspaceId).toBe('personal::claude-code-hook');
    expect(bridged.content).toContain('webhook secret rotation');
    expect(bridged.metadata.tool).toBe('claude-code');
    expect(bridged.metadata.senderId).toBe('claude-code-hook');
  });

  it('critical priority overrides to alert category', async () => {
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        senderId: 'cursor-hook',
        content: {
          tool: 'cursor',
          topic: 'security finding',
          priority: 'critical',
        },
      },
    });
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle/signals?limit=5',
    });
    const bridged = getRes.json().signals[0];
    expect(bridged.type).toBe('waggle-dance:alert');
    expect(bridged.metadata.priority).toBe('critical');
  });

  it('preserves the full protocol message in metadata for drilldown', async () => {
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'routed_share',
        senderId: 'hermes',
        content: { tool: 'hermes', payload: { docId: 'd-7' } },
        routing: [{ userId: 'u-1', reason: 'reviewer' }],
      },
    });
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle/signals?limit=5',
    });
    const bridged = getRes.json().signals[0];
    expect(bridged.metadata.protocolMessage).toBeTruthy();
    expect(bridged.metadata.protocolMessage.subtype).toBe('routed_share');
    expect(bridged.metadata.protocolMessage.routing).toHaveLength(1);
  });

  it('a knowledge_match response routes through the bridge as insight', async () => {
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'response',
        subtype: 'knowledge_match',
        senderId: 'cursor-hook',
        referenceId: 'orig-request-id',
        content: { matchedEntities: ['e1'], confidence: 0.9 },
      },
    });
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle/signals?limit=5',
    });
    const bridged = getRes.json().signals[0];
    expect(bridged.type).toBe('waggle-dance:insight');
    expect(bridged.metadata.referenceId).toBe('orig-request-id');
  });
});
