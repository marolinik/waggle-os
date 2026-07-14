/**
 * #15 skill requirement badges: GET /api/skills annotates each skill with
 * `requirements: {satisfied, missingEnv, missingBins} | null` (badge-only v1).
 * Env keys count as present via process.env OR the vault (D2); POST /api/vault
 * invalidates the requirement cache so a new key shows on the next fetch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB } from '@waggle/core';
import { clearSkillRequirementsCache } from '@waggle/agent';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import type { FastifyInstance } from 'fastify';

const MISSING_BIN = 'waggle-no-such-bin-15';
const PRESENT_ENV = 'WAGGLE_REQ_TEST_PRESENT_15';
const MISSING_ENV = 'WAGGLE_REQ_TEST_MISSING_15';
const VAULT_KEY = 'waggle-req-test-vault-key-15';

interface SkillRowShape {
  name: string;
  requirements: { satisfied: boolean; missingEnv: string[]; missingBins: string[] } | null;
}

describe('skill requirements route annotation (#15)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skill-req-'));
    new MindDB(path.join(tmpDir, 'personal.mind')).close();
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'plain.md'), '# Plain\n\nNo requirements declared.', 'utf-8');
    fs.writeFileSync(
      path.join(skillsDir, 'needs-setup.md'),
      `---\ndescription: needs env + bin\nrequires:\n  env: [${MISSING_ENV}]\n  bins: [${MISSING_BIN}]\n---\n\n# Needs Setup\n\nBody.`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(skillsDir, 'env-ok.md'),
      `---\ndescription: env satisfied via process.env, bin via PATH\nrequires:\n  env: [${PRESENT_ENV}]\n  bins: [node]\n---\n\n# Env OK\n\nBody.`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(skillsDir, 'vault-ok.md'),
      `---\ndescription: env satisfied via vault key\nrequires:\n  env: [${VAULT_KEY}]\n---\n\n# Vault OK\n\nBody.`,
      'utf-8',
    );
    server = await buildLocalServer({ dataDir: tmpDir });
    // Full-suite runs saturate the CPU during collect; server boot can exceed
    // vitest's 10s default hook timeout (observed 2026-07-15 full-suite flake).
  }, 60_000);

  afterAll(async () => {
    await server.close();
    delete process.env[PRESENT_ENV];
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }, 60_000);

  beforeEach(() => {
    clearSkillRequirementsCache();
  });

  const getSkills = async (): Promise<SkillRowShape[]> => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/skills' });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).skills as SkillRowShape[];
  };

  it('skill without a requires block gets requirements: null', async () => {
    const rows = await getSkills();
    const plain = rows.find(r => r.name === 'plain');
    expect(plain).toBeDefined();
    expect(plain!.requirements).toBeNull();
  });

  it('missing env key and missing bin are both listed, satisfied=false', async () => {
    const rows = await getSkills();
    const needs = rows.find(r => r.name === 'needs-setup');
    expect(needs!.requirements).toEqual({
      satisfied: false,
      missingEnv: [MISSING_ENV],
      missingBins: [MISSING_BIN],
    });
  });

  it('env key in process.env + bin on PATH satisfy the requirement', async () => {
    process.env[PRESENT_ENV] = '1';
    const rows = await getSkills();
    const envOk = rows.find(r => r.name === 'env-ok');
    expect(envOk!.requirements).toEqual({ satisfied: true, missingEnv: [], missingBins: [] });
  });

  it('a vault key satisfies an env requirement (D2: process.env ∪ vault)', async () => {
    server.vault?.delete(VAULT_KEY);
    let rows = await getSkills();
    expect(rows.find(r => r.name === 'vault-ok')!.requirements!.satisfied).toBe(false);

    server.vault?.set(VAULT_KEY, 'secret-value');
    rows = await getSkills();
    expect(rows.find(r => r.name === 'vault-ok')!.requirements).toEqual({
      satisfied: true, missingEnv: [], missingBins: [],
    });
  });

  it('POST /api/vault flips the badge on the next fetch', async () => {
    server.vault?.delete(VAULT_KEY);
    let rows = await getSkills();
    expect(rows.find(r => r.name === 'vault-ok')!.requirements!.satisfied).toBe(false);

    const post = await injectWithAuth(server, {
      method: 'POST', url: '/api/vault',
      payload: { name: VAULT_KEY, value: 'added-via-api' },
    });
    expect(post.statusCode).toBe(200);

    rows = await getSkills();
    expect(rows.find(r => r.name === 'vault-ok')!.requirements!.satisfied).toBe(true);
  });
});
