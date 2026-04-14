import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB } from '@waggle/core';
import { BEHAVIORAL_SPEC, deployBehavioralSpecOverride } from '@waggle/agent';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';

describe('activeBehavioralSpec integration', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-active-spec-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('loads the compiled baseline when no overrides exist on disk', async () => {
    const server = await buildLocalServer({ dataDir: tmpDir });
    try {
      expect(server.activeBehavioralSpec).toBeDefined();
      expect(server.activeBehavioralSpec.rules).toBe(BEHAVIORAL_SPEC.rules);
      expect(server.activeBehavioralSpec.coreLoop).toBe(BEHAVIORAL_SPEC.coreLoop);
    } finally {
      await server.close();
    }
  });

  it('applies a pre-existing override at boot', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-active-spec2-'));
    try {
      const personalPath = path.join(dir, 'personal.mind');
      const mind = new MindDB(personalPath);
      mind.close();
      // Write an override BEFORE the server boots.
      deployBehavioralSpecOverride(dir, {
        section: 'coreLoop',
        text: 'EVOLVED core loop — test fixture',
      });

      const server = await buildLocalServer({ dataDir: dir });
      try {
        expect(server.activeBehavioralSpec.coreLoop).toBe('EVOLVED core loop — test fixture');
        // Unaffected sections pass through
        expect(server.activeBehavioralSpec.qualityRules).toBe(BEHAVIORAL_SPEC.qualityRules);
        // rules reflects the override
        expect(server.activeBehavioralSpec.rules).toContain('EVOLVED core loop — test fixture');
      } finally {
        await server.close();
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('re-derives activeBehavioralSpec on behavioral-spec:reloaded event', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-active-spec3-'));
    try {
      const personalPath = path.join(dir, 'personal.mind');
      const mind = new MindDB(personalPath);
      mind.close();

      const server = await buildLocalServer({ dataDir: dir });
      try {
        // Sanity: no override yet
        expect(server.activeBehavioralSpec.coreLoop).toBe(BEHAVIORAL_SPEC.coreLoop);

        // Write an override and fire the reload event.
        deployBehavioralSpecOverride(dir, {
          section: 'coreLoop',
          text: 'HOT-RELOADED core loop',
        });
        server.eventBus.emit('behavioral-spec:reloaded', { section: 'coreLoop' });

        // Give the sync listener a tick to update (it's synchronous actually,
        // but await-nothing keeps us defensive).
        await Promise.resolve();

        expect(server.activeBehavioralSpec.coreLoop).toBe('HOT-RELOADED core loop');
      } finally {
        await server.close();
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('accepted evolution run causes activeBehavioralSpec to pick up the override', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-active-spec4-'));
    try {
      const personalPath = path.join(dir, 'personal.mind');
      const mind = new MindDB(personalPath);
      mind.close();

      const server = await buildLocalServer({ dataDir: dir });
      try {
        // Propose a run directly on the store, then accept via HTTP
        const run = server.evolutionStore.create({
          targetKind: 'behavioral-spec-section',
          targetName: 'qualityRules',
          baselineText: BEHAVIORAL_SPEC.qualityRules,
          winnerText: 'END-TO-END EVOLVED quality rules',
          deltaAccuracy: 0.1,
          gateVerdict: 'pass',
          gateReasons: [],
        });

        const res = await server.inject({
          method: 'POST',
          url: `/api/evolution/runs/${run.run_uuid}/accept`,
          headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
          payload: {},
        });
        expect(res.statusCode).toBe(200);

        // Event fires synchronously on emit (EventEmitter behavior); give
        // the listener a microtask just in case.
        await Promise.resolve();

        expect(server.activeBehavioralSpec.qualityRules).toBe('END-TO-END EVOLVED quality rules');
      } finally {
        await server.close();
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
