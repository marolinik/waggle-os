/**
 * Workspace Templates API Tests
 *
 * Validates GET (built-in + user-created) and POST (create custom) endpoints.
 * Uses the standard pattern: tmpDir + buildLocalServer + server.inject().
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

interface TemplateResponse {
  id: string;
  name: string;
  description: string;
  persona: string;
  connectors: string[];
  suggestedCommands: string[];
  starterMemory: string[];
  builtIn: boolean;
}

describe('Workspace Templates API', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-templates-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-critical — OS will clean temp dir
    }
  });

  it('GET /api/workspace-templates returns 7 built-in templates', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspace-templates',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { templates: TemplateResponse[]; count: number };
    expect(body.templates).toBeDefined();
    expect(body.count).toBe(7);
    expect(body.templates.length).toBe(7);
  });

  it('each built-in template has all required fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspace-templates',
    });

    const body = JSON.parse(res.body) as { templates: TemplateResponse[] };
    for (const template of body.templates) {
      expect(template.id).toBeDefined();
      expect(typeof template.name).toBe('string');
      expect(template.name.length).toBeGreaterThan(0);
      expect(typeof template.description).toBe('string');
      expect(template.description.length).toBeGreaterThan(0);
      expect(typeof template.persona).toBe('string');
      expect(template.persona.length).toBeGreaterThan(0);
      expect(Array.isArray(template.connectors)).toBe(true);
      expect(Array.isArray(template.suggestedCommands)).toBe(true);
      expect(template.suggestedCommands.length).toBeGreaterThan(0);
      expect(Array.isArray(template.starterMemory)).toBe(true);
      expect(template.starterMemory.length).toBeGreaterThan(0);
      expect(template.builtIn).toBe(true);
    }
  });

  it('built-in templates have correct IDs', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspace-templates',
    });

    const body = JSON.parse(res.body) as { templates: TemplateResponse[] };
    const ids = body.templates.map(t => t.id);
    expect(ids).toContain('sales-pipeline');
    expect(ids).toContain('research-project');
    expect(ids).toContain('code-review');
    expect(ids).toContain('marketing-campaign');
    expect(ids).toContain('product-launch');
    expect(ids).toContain('legal-review');
  });

  it('built-in templates map to valid persona IDs', async () => {
    const validPersonaIds = [
      'researcher', 'writer', 'analyst', 'coder',
      'project-manager', 'executive-assistant', 'sales-rep', 'marketer',
    ];

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspace-templates',
    });

    const body = JSON.parse(res.body) as { templates: TemplateResponse[] };
    for (const template of body.templates) {
      expect(validPersonaIds).toContain(template.persona);
    }
  });

  it('POST /api/workspace-templates creates a custom template', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspace-templates',
      payload: {
        name: 'My Custom Template',
        description: 'A test template for custom workflows.',
        persona: 'writer',
        connectors: ['slack'],
        suggestedCommands: ['/draft'],
        starterMemory: ['This workspace uses a custom template.'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as TemplateResponse;
    expect(body.id).toMatch(/^custom-/);
    expect(body.name).toBe('My Custom Template');
    expect(body.description).toBe('A test template for custom workflows.');
    expect(body.persona).toBe('writer');
    expect(body.connectors).toEqual(['slack']);
    expect(body.builtIn).toBe(false);
  });

  it('custom template appears in GET after POST', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspace-templates',
    });

    const body = JSON.parse(res.body) as { templates: TemplateResponse[]; count: number };
    // 7 built-in + 1 custom from previous test
    expect(body.count).toBe(8);
    const custom = body.templates.find(t => t.name === 'My Custom Template');
    expect(custom).toBeDefined();
    expect(custom!.builtIn).toBe(false);
  });

  it('POST /api/workspace-templates rejects missing required fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspace-templates',
      payload: {
        name: 'Incomplete Template',
        // missing description, persona, connectors, suggestedCommands, starterMemory
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBeDefined();
  });

  it('POST /api/workspace-templates rejects invalid field types', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspace-templates',
      payload: {
        name: 'Bad Template',
        description: 'A template with bad types.',
        persona: 'writer',
        connectors: 'not-an-array', // should be array
        suggestedCommands: ['/help'],
        starterMemory: ['test'],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toContain('connectors');
  });
});
