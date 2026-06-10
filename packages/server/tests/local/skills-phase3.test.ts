/**
 * Skills Phase-3 alias/dispatcher Route Tests (UX-Refactor, S06/S19).
 *
 * Covers the 3 routes added to routes/skills.ts:
 *   PATCH /api/skills/:id          alias over PUT /api/skills/:name (redaction kept)
 *   POST  /api/skills/:id/test     :id variant of POST /api/skills/test (C37 preview-only)
 *   POST  /api/skills/:id/install  thin dispatcher → starter / pack / marketplace
 *
 * Skills are flat markdown files in {dataDir}/skills — the NAME IS THE ID.
 * skillRoutes auto-installs the starter pack on first run (empty dir), which the
 * starter-source install test leans on (delete one file, reinstall via dispatcher).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listStarterSkills } from '@waggle/sdk';
import { skillRoutes } from '../../src/local/routes/skills.js';

describe('Skills Phase-3 routes', () => {
  let dataDir: string;
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    dataDir = path.join(os.tmpdir(), `waggle-skills-${randomUUID()}`);
    fs.mkdirSync(dataDir, { recursive: true });
    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir });
    server.decorate('agentState', { skills: [] });
    server.decorate('skillHashStore', {
      setHash: () => {},
      removeHash: () => {},
      checkAll: () => ({ changed: [], unchanged: [], missing: [] }),
    });
    server.decorate('auditStore', { record: () => ({}), getRecent: () => [] });
    await server.register(skillRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch { /* Windows handle lingering — ignore */ }
  });

  async function createSkill(name = 'phase-three-skill') {
    const res = await server.inject({
      method: 'POST', url: '/api/skills/create',
      payload: { name, description: 'A Phase-3 test skill', steps: ['Do the thing', 'Verify it'] },
    });
    expect(res.statusCode).toBe(200);
    return name;
  }

  it('PATCH /api/skills/:id updates the markdown body through the guarded write path', async () => {
    const name = await createSkill();
    const res = await server.inject({
      method: 'PATCH', url: `/api/skills/${name}`,
      payload: { content: '# Updated Skill\n\nNew body content.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    const onDisk = fs.readFileSync(path.join(dataDir, 'skills', `${name}.md`), 'utf-8');
    expect(onDisk).toContain('New body content.');
  });

  it('PATCH requires content and 404s on an unknown skill', async () => {
    const name = await createSkill();
    expect((await server.inject({ method: 'PATCH', url: `/api/skills/${name}`, payload: {} })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PATCH', url: '/api/skills/no-such-skill', payload: { content: 'x' } })).statusCode).toBe(404);
  });

  it('PATCH applies the redaction policy on the aliased write (secrets stripped)', async () => {
    const name = await createSkill();
    await server.inject({
      method: 'PATCH', url: `/api/skills/${name}`,
      payload: { content: '# S\n\nUse key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-AAAAAAAA to call.' },
    });
    const onDisk = fs.readFileSync(path.join(dataDir, 'skills', `${name}.md`), 'utf-8');
    expect(onDisk).not.toContain('sk-ant-api03');
  });

  it('POST /api/skills/:id/test is C37 preview-only (wouldInject + metadata, no execution)', async () => {
    const name = await createSkill();
    const res = await server.inject({
      method: 'POST', url: `/api/skills/${name}/test`,
      payload: { testInput: 'Summarize the Q3 numbers' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.wouldInject).toBe('string');
    expect(body.wouldInject.length).toBeGreaterThan(0);
    expect(body.skill.name).toBe(name);
    expect(body.testPreview.input).toBe('Summarize the Q3 numbers');
    expect(body.testPreview.note).toMatch(/not performed/i); // no LLM call
  });

  it('POST /:id/test 404s for an unknown skill', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/skills/no-such-skill/test', payload: {} })).statusCode).toBe(404);
  });

  it('install dispatcher validates source / packageId / traversal ids', async () => {
    expect((await server.inject({
      method: 'POST', url: '/api/skills/some-skill/install', payload: { source: 'bogus' },
    })).statusCode).toBe(400);
    expect((await server.inject({
      method: 'POST', url: '/api/skills/some-skill/install', payload: {},
    })).statusCode).toBe(400);
    // marketplace requires a numeric packageId before any delegation happens.
    expect((await server.inject({
      method: 'POST', url: '/api/skills/some-skill/install', payload: { source: 'marketplace' },
    })).statusCode).toBe(400);
    expect((await server.inject({
      method: 'POST', url: '/api/skills/..%2F..%2Fevil/install', payload: { source: 'starter' },
    })).statusCode).toBe(400);
  });

  it('install dispatcher delegates starter installs to the existing installer', async () => {
    const starter = listStarterSkills();
    if (starter.length === 0) return; // starter pack unavailable in this build — nothing to dispatch
    const id = starter[0];
    // The register-time auto-install already copied it; remove so install succeeds.
    fs.rmSync(path.join(dataDir, 'skills', `${id}.md`), { force: true });

    const res = await server.inject({
      method: 'POST', url: `/api/skills/${id}/install`, payload: { source: 'starter' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installed).toBe(true);
    expect(body.source).toBe('starter');
    expect(fs.existsSync(path.join(dataDir, 'skills', `${id}.md`))).toBe(true);

    // Installing again forwards the existing installer's 409.
    const again = await server.inject({
      method: 'POST', url: `/api/skills/${id}/install`, payload: { source: 'starter' },
    });
    expect(again.statusCode).toBe(409);
  });
});
