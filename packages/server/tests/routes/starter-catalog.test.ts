import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

/** Skill ID used for install tests — cleaned up between tests to avoid 409 conflicts */
const INSTALL_TEST_SKILL = 'retrospective';

describe('Starter Skill Catalog', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-catalog-test-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/skills/starter-pack/catalog returns all starter skills', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skills).toBeDefined();
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBe(18);
  });

  it('each skill has the correct shape', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });

    const body = res.json();
    for (const skill of body.skills) {
      expect(skill).toHaveProperty('id');
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('family');
      expect(skill).toHaveProperty('familyLabel');
      expect(skill).toHaveProperty('state');
      expect(skill).toHaveProperty('isWorkflow');
      expect(typeof skill.id).toBe('string');
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
      expect(typeof skill.family).toBe('string');
      expect(typeof skill.familyLabel).toBe('string');
      expect(['active', 'installed', 'available']).toContain(skill.state);
      expect(typeof skill.isWorkflow).toBe('boolean');
    }
  });

  it('families array is populated with correct shape', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });

    const body = res.json();
    expect(body.families).toBeDefined();
    expect(Array.isArray(body.families)).toBe(true);
    expect(body.families.length).toBeGreaterThan(0);
    for (const family of body.families) {
      expect(family).toHaveProperty('id');
      expect(family).toHaveProperty('label');
      expect(typeof family.id).toBe('string');
      expect(typeof family.label).toBe('string');
    }
  });

  it('workflow skills have isWorkflow: true', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });

    const body = res.json();
    const workflowIds = ['research-team', 'review-pair', 'plan-execute'];
    for (const wfId of workflowIds) {
      const skill = body.skills.find((s: { id: string }) => s.id === wfId);
      expect(skill, `workflow skill ${wfId} should exist`).toBeDefined();
      expect(skill.isWorkflow).toBe(true);
    }

    // Non-workflow skills should have isWorkflow: false
    const nonWorkflow = body.skills.filter(
      (s: { id: string }) => !workflowIds.includes(s.id),
    );
    for (const skill of nonWorkflow) {
      expect(skill.isWorkflow).toBe(false);
    }
  });

  it('all skills map to a known family (no "other")', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });

    const body = res.json();
    const knownFamilies = ['writing', 'research', 'decision', 'planning', 'communication', 'code', 'creative'];
    for (const skill of body.skills) {
      expect(
        knownFamilies,
        `skill "${skill.id}" has unknown family "${skill.family}"`,
      ).toContain(skill.family);
    }
  });

  it('POST /api/skills/starter-pack/:id installs a single skill', async () => {
    // Ensure the skill is not already installed (now writes to tmpDir/skills/)
    const skillsDir = path.join(tmpDir, 'skills');
    const targetPath = path.join(skillsDir, `${INSTALL_TEST_SKILL}.md`);
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/skills/starter-pack/${INSTALL_TEST_SKILL}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.skill.id).toBe(INSTALL_TEST_SKILL);
    expect(['active', 'installed']).toContain(body.skill.state);
  });

  it('POST /api/skills/starter-pack/:id returns 409 for already installed', async () => {
    // INSTALL_TEST_SKILL was installed in previous test
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/skills/starter-pack/${INSTALL_TEST_SKILL}`,
    });

    expect(res.statusCode).toBe(409);
  });

  it('POST /api/skills/starter-pack/:id returns 404 for nonexistent skill', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/skills/starter-pack/nonexistent-skill-xyz',
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /api/skills/starter-pack/:id returns 400 for path traversal', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/skills/starter-pack/..%2F..%2Fetc%2Fpasswd',
    });

    expect(res.statusCode).toBe(400);
  });

  it('catalog reflects installed state after single install', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/skills/starter-pack/catalog',
    });

    const body = JSON.parse(res.payload);
    const installed = body.skills.find((s: any) => s.id === INSTALL_TEST_SKILL);
    expect(installed).toBeDefined();
    expect(['active', 'installed']).toContain(installed.state);
  });
});
