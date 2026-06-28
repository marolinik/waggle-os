import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { localInferenceRoutes } from '../../src/local/routes/local-inference.js';

describe('local-inference route — TS engine wiring', () => {
  let server: ReturnType<typeof Fastify>;
  beforeEach(async () => { server = Fastify({ logger: false }); await server.register(localInferenceRoutes); });
  afterEach(async () => { await server.close(); });

  it('/hardware returns the full HardwareInfo shape (real GPU fields, not absent)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/local-inference/hardware' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toMatch(/^(native|basic)$/);          // never 'llmfit'
    expect(body.llmfitAvailable).toBe(false);
    for (const k of ['totalRamGb', 'hasGpu', 'gpuName', 'gpuVramGb', 'gpuCount', 'gpus', 'backend']) {
      expect(body.hardware).toHaveProperty(k);
    }
    expect(Array.isArray(body.hardware.gpus)).toBe(true);
  });

  it('/models returns engine-ranked recommendations from the curated catalog (not 4 hardcoded)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/local-inference/models?limit=50' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('native');                        // proves TS engine, not removed 'basic'
    expect(body.totalScanned).toBeGreaterThan(4);              // catalog size, not the old 4-model stub
    expect(body.models.length).toBeGreaterThan(0);
    const m = body.models[0];
    for (const k of ['scoreComponents', 'estimatedTps', 'memoryRequiredGb', 'bestQuant', 'runMode', 'runtime', 'fitLevel']) {
      expect(m).toHaveProperty(k);
    }
    expect(m.scoreComponents).toHaveProperty('quality'); // real fit math, not zeroed stub
    expect(m.runtime).toBe('Ollama');
  });
});
