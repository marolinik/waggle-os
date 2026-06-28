/**
 * Integration tests for the §D2 skill-audit routes (POST/GET /api/skills/audit).
 *
 * Gate order under test: PRO tier → vault key → @ax-llm/ax availability → run.
 * The run path is stubbed via the `__waggleSkillAuditLlmFactory` global hook so
 * the loop's synth/run/judge calls never touch the network — mirroring the
 * evolution-run-route test's factory-override pattern.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB, VaultStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import type { FastifyInstance } from 'fastify';
import type { EvolutionLLM } from '@waggle/agent';
import type { Tier } from '@waggle/shared';

type LLMFactory = (apiKey: string) => EvolutionLLM | Promise<EvolutionLLM>;
function installLLMFactory(f: LLMFactory): void {
  (globalThis as unknown as { __waggleSkillAuditLlmFactory?: LLMFactory }).__waggleSkillAuditLlmFactory = f;
}
function clearLLMFactory(): void {
  delete (globalThis as unknown as { __waggleSkillAuditLlmFactory?: LLMFactory }).__waggleSkillAuditLlmFactory;
}

const PASS_JUDGE = '{"correctness":9,"procedure":9,"conciseness":8,"feedback":"good"}';
const FAIL_JUDGE = '{"correctness":2,"procedure":2,"conciseness":2,"feedback":"wrong format"}';

/** EvolutionLLM stub: dispatches scripted replies by the unique rubric marker in each prompt. */
function stubLLM(judge: string): EvolutionLLM {
  return {
    async complete(prompt: string): Promise<string> {
      if (prompt.includes('designing ONE concrete test')) return '{"task":"do the thing","expected":"thing done"}';
      if (prompt.includes('strict, fair evaluator')) return judge;
      if (prompt.includes('repairing an AI agent SKILL document')) return '# Repaired\n\nFollow these specific steps: read the input, apply the rule, return the exact result.';
      return 'a concrete answer';
    },
  } as EvolutionLLM;
}

function writeTier(dataDir: string, tier: Tier, trialStartedAt: string | null = null): void {
  const configPath = path.join(dataDir, 'config.json');
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* fresh */ }
  fs.writeFileSync(configPath, JSON.stringify({ ...existing, tier, trialStartedAt }));
}

describe('skill-audit routes (§D2)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const KEY = 'sk-ant-stub-for-tests';

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skill-audit-'));
    new MindDB(path.join(tmpDir, 'personal.mind')).close();
    new VaultStore(tmpDir).set('anthropic', KEY, { models: ['claude-haiku-4-5-20251001'] });
    // One installed skill to audit.
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'verify-me.md'), '# Verify Me\n\nDo a specific deterministic thing with the input and return the exact result.', 'utf-8');
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    clearLLMFactory();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    clearLLMFactory();
    if (!server.vault?.get('anthropic')) server.vault?.set('anthropic', KEY, { models: ['claude-haiku-4-5-20251001'] });
    writeTier(tmpDir, 'PRO');
    try { fs.rmSync(path.join(tmpDir, 'skill-audit.json'), { force: true }); } catch { /* ignore */ }
  });

  const post = (payload?: unknown) => injectWithAuth(server, { method: 'POST', url: '/api/skills/audit', payload: payload ?? {} });

  it('C1: FREE tier is rejected 403 TIER_INSUFFICIENT (tier gate fires before the key check)', async () => {
    writeTier(tmpDir, 'FREE');
    const res = await post();
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ error: 'TIER_INSUFFICIENT', required: 'PRO', actual: 'FREE' });
  });

  it('C2: fresh TRIAL passes the tier gate (stops at the key check → 422)', async () => {
    writeTier(tmpDir, 'TRIAL', new Date().toISOString());
    server.vault?.delete('anthropic');
    const res = await post();
    expect(res.statusCode).toBe(422); // not 403 — TRIAL ranks ≥ PRO
  });

  it('C3: expired TRIAL falls back to FREE → 403', async () => {
    writeTier(tmpDir, 'TRIAL', '2020-01-01T00:00:00.000Z');
    const res = await post();
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).actual).toBe('FREE');
  });

  it('C4: PRO with no Anthropic key → 422', async () => {
    server.vault?.delete('anthropic');
    const res = await post();
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toMatch(/Anthropic API key/i);
  });

  it('C5: PRO + key but the LLM factory yields nothing → 503', async () => {
    installLLMFactory(() => null as unknown as EvolutionLLM); // simulate @ax-llm/ax unavailable
    const res = await post();
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toMatch(/ax-llm|not available/i);
  });

  it('C6: PRO + key + stub factory + dryRun → report, writes nothing', async () => {
    installLLMFactory(() => stubLLM(FAIL_JUDGE));
    const res = await post({ dryRun: true });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.report.dryRun).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'skill-audit.json'))).toBe(false);
  });

  it('C7: PRO + key + passing stub → verified badge persisted + GET surfaces it', async () => {
    installLLMFactory(() => stubLLM(PASS_JUDGE));
    const res = await post({});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.report.verified).toContain('verify-me');

    const get = await injectWithAuth(server, { method: 'GET', url: '/api/skills/audit' });
    expect(get.statusCode).toBe(200);
    const badges = JSON.parse(get.body).audit;
    expect(badges['verify-me']).toMatchObject({ verified: true });
    expect(badges['verify-me'].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('C8: GET /api/skills surfaces the verified badge for the audited skill', async () => {
    installLLMFactory(() => stubLLM(PASS_JUDGE));
    await post({});
    const get = await injectWithAuth(server, { method: 'GET', url: '/api/skills' });
    const row = JSON.parse(get.body).skills.find((s: { name: string }) => s.name === 'verify-me');
    expect(row.verified).toBe(true);
    expect(row.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('C9: editing a skill clears its verified badge (staleness on read)', async () => {
    installLLMFactory(() => stubLLM(PASS_JUDGE));
    await post({});
    // Edit the skill via the standard PUT — must invalidate the badge.
    const put = await injectWithAuth(server, {
      method: 'PUT', url: '/api/skills/verify-me',
      payload: { content: '# Verify Me\n\nA materially different body that changes the content hash entirely.' },
    });
    expect(put.statusCode).toBe(200);
    const get = await injectWithAuth(server, { method: 'GET', url: '/api/skills' });
    const row = JSON.parse(get.body).skills.find((s: { name: string }) => s.name === 'verify-me');
    expect(row.verified).toBe(false); // badge cleared + hash no longer matches
  });
});
