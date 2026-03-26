import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

/** Skill ID used for persistence tests */
const TEST_SKILL = 'retrospective';

describe('Capability Persistence & Cross-Surface Agreement', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-persist-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  function initMind(dataDir: string): void {
    const personalPath = path.join(dataDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();
  }

  afterAll(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── Restart Coherence ──────────────────────────────────────────────

  it('installed skill survives server restart', async () => {
    const dataDir = makeTmpDir();
    initMind(dataDir);

    // 1. Build server, install a skill
    const server1 = await buildLocalServer({ dataDir });

    const installRes = await injectWithAuth(server1, {
      method: 'POST',
      url: `/api/skills/starter-pack/${TEST_SKILL}`,
    });
    expect(installRes.statusCode).toBe(200);

    // Verify skill file exists on disk
    const skillPath = path.join(dataDir, 'skills', `${TEST_SKILL}.md`);
    expect(fs.existsSync(skillPath)).toBe(true);

    // 2. Close server
    await server1.close();

    // 3. Rebuild with same dataDir
    const server2 = await buildLocalServer({ dataDir });

    // 4. Verify skill is active after restart
    const catalogRes = await injectWithAuth(server2, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });
    expect(catalogRes.statusCode).toBe(200);
    const catalog = catalogRes.json();
    const skill = catalog.skills.find((s: any) => s.id === TEST_SKILL);
    expect(skill, `${TEST_SKILL} should exist in catalog after restart`).toBeDefined();
    expect(skill.state).toBe('active');

    await server2.close();
  });

  it('multiple installed skills all survive restart', async () => {
    const dataDir = makeTmpDir();
    initMind(dataDir);

    const skillsToInstall = ['retrospective', 'daily-plan', 'brainstorm'];

    // Install skills
    const server1 = await buildLocalServer({ dataDir });
    for (const id of skillsToInstall) {
      const res = await injectWithAuth(server1, {
        method: 'POST',
        url: `/api/skills/starter-pack/${id}`,
      });
      expect(res.statusCode).toBe(200);
    }
    await server1.close();

    // Restart and verify all are active
    const server2 = await buildLocalServer({ dataDir });
    const catalogRes = await injectWithAuth(server2, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });
    const catalog = catalogRes.json();

    for (const id of skillsToInstall) {
      const skill = catalog.skills.find((s: any) => s.id === id);
      expect(skill, `${id} should exist after restart`).toBeDefined();
      expect(skill.state, `${id} should be active after restart`).toBe('active');
    }

    await server2.close();
  });

  // ── Cross-Surface Agreement ────────────────────────────────────────

  it('all endpoints agree on skill state after install', async () => {
    const dataDir = makeTmpDir();
    initMind(dataDir);

    const server = await buildLocalServer({ dataDir });

    // Install a skill
    const installRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/skills/starter-pack/${TEST_SKILL}`,
    });
    expect(installRes.statusCode).toBe(200);

    // Surface 1: Catalog endpoint
    const catalogRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });
    const catalog = catalogRes.json();
    const catalogSkill = catalog.skills.find((s: any) => s.id === TEST_SKILL);
    expect(catalogSkill, 'catalog should contain installed skill').toBeDefined();
    expect(catalogSkill.state).toBe('active');

    // Surface 2: Skills list endpoint
    const skillsRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills',
    });
    const skillsList = skillsRes.json();
    const listedSkill = skillsList.skills.find((s: any) => s.name === TEST_SKILL);
    expect(listedSkill, '/api/skills should contain installed skill').toBeDefined();

    // Surface 3: Capabilities status endpoint
    const capsRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/capabilities/status',
    });
    const caps = capsRes.json();
    const capSkill = caps.skills.find((s: any) => s.name === TEST_SKILL);
    expect(capSkill, '/api/capabilities/status should contain installed skill').toBeDefined();

    // Surface 4: In-memory agentState
    const agentSkill = server.agentState.skills.find(s => s.name === TEST_SKILL);
    expect(agentSkill, 'agentState.skills should contain installed skill').toBeDefined();

    await server.close();
  });

  it('all endpoints agree after restart', async () => {
    const dataDir = makeTmpDir();
    initMind(dataDir);

    // Install, then restart
    const server1 = await buildLocalServer({ dataDir });
    await injectWithAuth(server1, {
      method: 'POST',
      url: `/api/skills/starter-pack/${TEST_SKILL}`,
    });
    await server1.close();

    // Verify agreement after restart
    const server2 = await buildLocalServer({ dataDir });

    const [catalogRes, skillsRes, capsRes] = await Promise.all([
      injectWithAuth(server2, { method: 'GET', url: '/api/skills/starter-pack/catalog' }),
      injectWithAuth(server2, { method: 'GET', url: '/api/skills' }),
      injectWithAuth(server2, { method: 'GET', url: '/api/capabilities/status' }),
    ]);

    const catalog = catalogRes.json();
    const skills = skillsRes.json();
    const caps = capsRes.json();

    // All surfaces report the skill
    expect(catalog.skills.find((s: any) => s.id === TEST_SKILL)?.state).toBe('active');
    expect(skills.skills.find((s: any) => s.name === TEST_SKILL)).toBeDefined();
    expect(caps.skills.find((s: any) => s.name === TEST_SKILL)).toBeDefined();
    expect(server2.agentState.skills.find(s => s.name === TEST_SKILL)).toBeDefined();

    await server2.close();
  });

  // ── dataDir Isolation ──────────────────────────────────────────────

  it('different dataDirs have independent skill state', async () => {
    const dataDir1 = makeTmpDir();
    const dataDir2 = makeTmpDir();
    initMind(dataDir1);
    initMind(dataDir2);

    // Install a skill in dataDir1 only
    const server1 = await buildLocalServer({ dataDir: dataDir1 });
    await injectWithAuth(server1, {
      method: 'POST',
      url: `/api/skills/starter-pack/${TEST_SKILL}`,
    });

    // Verify installed in dataDir1
    const cat1 = await injectWithAuth(server1, { method: 'GET', url: '/api/skills/starter-pack/catalog' });
    expect(cat1.json().skills.find((s: any) => s.id === TEST_SKILL)?.state).toBe('active');
    await server1.close();

    // Verify NOT installed in dataDir2
    const server2 = await buildLocalServer({ dataDir: dataDir2 });
    const cat2 = await injectWithAuth(server2, { method: 'GET', url: '/api/skills/starter-pack/catalog' });
    expect(cat2.json().skills.find((s: any) => s.id === TEST_SKILL)?.state).toBe('available');
    await server2.close();
  });

  // ── Filesystem is canonical ────────────────────────────────────────

  it('deleting skill file from disk makes it unavailable after restart', async () => {
    const dataDir = makeTmpDir();
    initMind(dataDir);

    // Install
    const server1 = await buildLocalServer({ dataDir });
    await injectWithAuth(server1, {
      method: 'POST',
      url: `/api/skills/starter-pack/${TEST_SKILL}`,
    });
    await server1.close();

    // Delete the file manually
    const skillPath = path.join(dataDir, 'skills', `${TEST_SKILL}.md`);
    expect(fs.existsSync(skillPath)).toBe(true);
    fs.unlinkSync(skillPath);

    // Restart — skill should be back to available
    const server2 = await buildLocalServer({ dataDir });
    const catalogRes = await injectWithAuth(server2, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });
    const skill = catalogRes.json().skills.find((s: any) => s.id === TEST_SKILL);
    expect(skill?.state).toBe('available');
    await server2.close();
  });
});
