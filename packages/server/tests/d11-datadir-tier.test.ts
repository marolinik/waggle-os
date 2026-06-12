/**
 * D11 (UX-Refactor P4) — dataDir resolution + startup tier read.
 *
 *  - resolveDataDir: explicit option > WAGGLE_DATA_DIR env > ~/.waggle. Before
 *    D11, startService ignored the env var while local/index.ts, the
 *    marketplace installer, and memory-mcp honored it — a custom install split
 *    its state across two directories.
 *  - readTierFromDataDir: the startup log line's tier source — same
 *    config.json contract as GET /api/tier, fails closed to FREE.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startService, resolveDataDir } from '../src/local/service.js';
import { readTierFromDataDir } from '../src/middleware/assert-tier.js';
import type { FastifyInstance } from 'fastify';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-d11-test-'));
}

const ENV_KEY = 'WAGGLE_DATA_DIR';

describe('resolveDataDir (D11)', () => {
  const envBefore = process.env[ENV_KEY];
  afterEach(() => {
    if (envBefore === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = envBefore;
  });

  it('explicit option wins over the env var', () => {
    process.env[ENV_KEY] = 'D:/somewhere/else';
    expect(resolveDataDir('D:/explicit')).toBe('D:/explicit');
  });

  it('WAGGLE_DATA_DIR is honored when no option is given', () => {
    process.env[ENV_KEY] = 'D:/from-env';
    expect(resolveDataDir()).toBe('D:/from-env');
  });

  it('defaults to ~/.waggle with neither', () => {
    delete process.env[ENV_KEY];
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.waggle'));
  });

  it('a set-but-EMPTY env var falls through to the default (never an empty dataDir)', () => {
    process.env[ENV_KEY] = '';
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.waggle'));
  });
});

describe('startService honors WAGGLE_DATA_DIR (D11 integration)', () => {
  const envBefore = process.env[ENV_KEY];
  let server: FastifyInstance | undefined;
  let tmp: string | undefined;

  afterEach(async () => {
    if (envBefore === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = envBefore;
    if (server) await server.close();
    server = undefined;
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('boots against the env-pointed directory when no dataDir option is passed', async () => {
    tmp = makeTmpDir();
    const envDir = path.join(tmp, 'env-pointed');
    process.env[ENV_KEY] = envDir;
    const port = 4600 + Math.floor(Math.random() * 400);
    const logSpy = vi.spyOn(console, 'log');

    try {
      const result = await startService({ port, skipLiteLLM: true });
      server = result.server;

      // The env-pointed dir got the install, ~/.waggle got nothing new from us.
      expect(fs.existsSync(path.join(envDir, 'personal.mind'))).toBe(true);
      expect(server.localConfig.dataDir).toBe(envDir);

      // The ratified D11 deliverable is the LOG LINE itself — pin it (review
      // gap: deleting the line kept every gate green).
      const dataDirLine = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((m) => m.includes('[waggle:service] Data dir:'));
      expect(dataDirLine).toContain(envDir);
      expect(dataDirLine).toMatch(/· tier: (TRIAL|FREE|PRO|TEAMS|ENTERPRISE)$/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('readTierFromDataDir (D11 startup log tier source)', () => {
  let tmp: string;
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  function writeConfig(obj: Record<string, unknown>): string {
    tmp = makeTmpDir();
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify(obj));
    return tmp;
  }

  it('reads a canonical tier', () => {
    expect(readTierFromDataDir(writeConfig({ tier: 'PRO' }))).toBe('PRO');
  });

  it('migrates legacy names (solo→FREE, basic→PRO)', () => {
    expect(readTierFromDataDir(writeConfig({ tier: 'solo' }))).toBe('FREE');
    fs.rmSync(tmp, { recursive: true, force: true });
    expect(readTierFromDataDir(writeConfig({ tier: 'basic' }))).toBe('PRO');
  });

  it('TRIAL downgrades to FREE when expired (effective tier, not raw)', () => {
    const expired = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(readTierFromDataDir(writeConfig({ tier: 'TRIAL', trialStartedAt: expired }))).toBe('FREE');
  });

  it('fails closed to FREE on missing dir, missing config, malformed JSON, unknown tier', () => {
    expect(readTierFromDataDir(undefined)).toBe('FREE');
    expect(readTierFromDataDir(path.join(os.tmpdir(), 'waggle-d11-nonexistent'))).toBe('FREE');
    tmp = makeTmpDir();
    fs.writeFileSync(path.join(tmp, 'config.json'), '{not json');
    expect(readTierFromDataDir(tmp)).toBe('FREE');
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ tier: 'PLATINUM' }));
    expect(readTierFromDataDir(tmp)).toBe('FREE');
  });
});
