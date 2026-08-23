/**
 * Personas REST API Route Tests
 *
 * Tests the GET /api/personas endpoint:
 *   - Returns array of personas
 *   - Each persona has id, name, description, icon
 *   - Does NOT include systemPrompt (sensitive/large)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import {
  deleteCustomPersona,
  deployPersonaOverride,
  isValidCustomPersonaId,
  listPersonas,
  rollbackPersonaOverride,
  saveCustomPersona,
  type AgentPersona,
} from '@waggle/agent';
import { personaRoutes } from '../../src/local/routes/personas.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-personas-route-'));
  tempDirs.push(dir);
  return dir;
}

function createTestServer(dataDir = os.tmpdir()) {
  const server = Fastify({ logger: false });
  server.decorate('localConfig', { dataDir } as never);
  server.register(personaRoutes);
  return server;
}

function makePersona(id: string): AgentPersona {
  return {
    id,
    name: 'Test Persona',
    description: 'A test persona',
    icon: 'test',
    systemPrompt: 'Be useful.',
    modelPreference: 'claude-sonnet-4-6',
    tools: [],
    workspaceAffinity: [],
    suggestedCommands: [],
    defaultWorkflow: null,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows handle lag */ }
  }
});

describe('Personas Routes', () => {
  // ── GET /api/personas ─────────────────────────────────────────────

  describe('GET /api/personas', () => {
    it('returns an array of personas', async () => {
      const server = createTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/personas' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.personas).toBeDefined();
      expect(Array.isArray(body.personas)).toBe(true);
      expect(body.personas.length).toBeGreaterThan(0);
      await server.close();
    });

    it('each persona has id, name, description, icon', async () => {
      const server = createTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/personas' });
      const { personas } = res.json();

      for (const persona of personas) {
        expect(typeof persona.id).toBe('string');
        expect(persona.id.length).toBeGreaterThan(0);
        expect(typeof persona.name).toBe('string');
        expect(persona.name.length).toBeGreaterThan(0);
        expect(typeof persona.description).toBe('string');
        expect(persona.description.length).toBeGreaterThan(0);
        expect(typeof persona.icon).toBe('string');
        expect(persona.icon.length).toBeGreaterThan(0);
      }
      await server.close();
    });

    it('includes workspaceAffinity and suggestedCommands', async () => {
      const server = createTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/personas' });
      const { personas } = res.json();

      for (const persona of personas) {
        expect(Array.isArray(persona.workspaceAffinity)).toBe(true);
        expect(Array.isArray(persona.suggestedCommands)).toBe(true);
      }
      await server.close();
    });

    it('does NOT include systemPrompt or other sensitive fields', async () => {
      const server = createTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/personas' });
      const { personas } = res.json();

      for (const persona of personas) {
        expect(persona.systemPrompt).toBeUndefined();
        expect(persona.modelPreference).toBeUndefined();
        expect(persona.tools).toBeUndefined();
        expect(persona.defaultWorkflow).toBeUndefined();
      }
      await server.close();
    });

    it('contains all 23 personas', async () => {
      const server = createTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/personas' });
      const { personas } = res.json();

      // 22 tiered personas + session-reviewer (internal self-evolution reviewer;
      // returned by the raw list but excluded from onboarding + PersonaSwitcher).
      expect(personas.length).toBe(23);
      const ids = personas.map((p: { id: string }) => p.id);
      expect(ids).toContain('researcher');
      expect(ids).toContain('writer');
      expect(ids).toContain('analyst');
      expect(ids).toContain('coder');
      expect(ids).toContain('project-manager');
      expect(ids).toContain('executive-assistant');
      expect(ids).toContain('sales-rep');
      expect(ids).toContain('marketer');
      expect(ids).toContain('general-purpose');
      expect(ids).toContain('planner');
      expect(ids).toContain('verifier');
      expect(ids).toContain('coordinator');
      await server.close();
    });
  });

  describe('custom persona ID boundaries', () => {
    it('accepts every shipped persona ID', () => {
      for (const persona of listPersonas()) {
        expect(isValidCustomPersonaId(persona.id), persona.id).toBe(true);
      }
    });

    it('rejects unsafe explicit IDs before persistence', async () => {
      const dataDir = makeTempDir();
      const server = createTestServer(dataDir);
      const unsafeIds = [
        '../outside',
        '..\\outside',
        'folder/agent',
        'folder\\agent',
        '.',
        '..',
        'profile:secret',
        'profile::$DATA',
        'control\u0000id',
        'control\u001fid',
        'CON',
        'prn.json',
        'COM1',
        'lPt9.txt',
        'COM¹',
        'lpt².txt',
        'trailing.',
        'trailing ',
      ];

      try {
        for (const id of unsafeIds) {
          const res = await server.inject({
            method: 'POST',
            url: '/api/personas',
            payload: { id, name: 'Unsafe Persona', systemPrompt: 'Do unsafe work.' },
          });
          expect(res.statusCode, id).toBe(400);
          expect(res.json()).toMatchObject({ error: 'Invalid request body' });
        }
      } finally {
        await server.close();
      }
    });

    it('keeps portable custom IDs and built-in conflict responses working', async () => {
      const dataDir = makeTempDir();
      const server = createTestServer(dataDir);

      try {
        const created = await server.inject({
          method: 'POST',
          url: '/api/personas',
          payload: { id: 'qa.v2_agent-1', name: 'QA Agent', systemPrompt: 'Verify changes.' },
        });
        expect(created.statusCode).toBe(201);
        expect(fs.existsSync(path.join(dataDir, 'personas', 'qa.v2_agent-1.json'))).toBe(true);

        const conflict = await server.inject({
          method: 'POST',
          url: '/api/personas',
          payload: { id: 'coder', name: 'Coder Clone', systemPrompt: 'Write code.' },
        });
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toEqual({ error: 'A built-in persona with this ID already exists' });
      } finally {
        await server.close();
      }
    });

    it('rejects unsafe IDs on PATCH and DELETE route parameters', async () => {
      const server = createTestServer(makeTempDir());

      try {
        const patched = await server.inject({
          method: 'PATCH',
          url: '/api/personas/CON',
          payload: { name: 'Changed' },
        });
        expect(patched.statusCode).toBe(400);

        const deleted = await server.inject({ method: 'DELETE', url: '/api/personas/CON' });
        expect(deleted.statusCode).toBe(400);
      } finally {
        await server.close();
      }
    });

    it('saveCustomPersona rejects traversal before writing outside personas', () => {
      const dataDir = makeTempDir();
      const outsidePath = path.join(dataDir, 'outside.json');
      fs.writeFileSync(outsidePath, 'sentinel', 'utf-8');

      expect(() => saveCustomPersona(dataDir, makePersona('../outside')))
        .toThrow('Invalid custom persona ID');
      expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('sentinel');
    });

    it('deleteCustomPersona rejects traversal before deleting outside personas', () => {
      const dataDir = makeTempDir();
      const outsidePath = path.join(dataDir, 'outside.json');
      fs.writeFileSync(outsidePath, 'sentinel', 'utf-8');

      expect(() => deleteCustomPersona(dataDir, '../outside'))
        .toThrow('Invalid custom persona ID');
      expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('sentinel');
    });

    it('deployPersonaOverride rejects traversal before writing an override', () => {
      const dataDir = makeTempDir();
      const outsidePath = path.join(dataDir, 'evolved.json');

      expect(() => deployPersonaOverride(dataDir, {
        personaId: '../evolved',
        systemPrompt: 'Escaped override',
      })).toThrow('Invalid custom persona ID');
      expect(fs.existsSync(outsidePath)).toBe(false);
    });

    it('deployPersonaOverride keeps its validated ID authoritative over overrides', () => {
      const dataDir = makeTempDir();
      const result = deployPersonaOverride(dataDir, {
        personaId: 'safe-persona',
        systemPrompt: 'Validated prompt',
        overrides: { id: '../evolved', systemPrompt: 'Spoofed prompt' } as never,
      });

      const deployed = JSON.parse(fs.readFileSync(result.path, 'utf-8')) as AgentPersona;
      expect(deployed.id).toBe('safe-persona');
      expect(deployed.systemPrompt).toBe('Validated prompt');
      expect(fs.existsSync(path.join(dataDir, 'evolved.json'))).toBe(false);
    });

    it('rollbackPersonaOverride rejects traversal before deleting an override', () => {
      const dataDir = makeTempDir();
      const outsidePath = path.join(dataDir, 'evolved.json');
      fs.writeFileSync(outsidePath, 'sentinel', 'utf-8');

      expect(() => rollbackPersonaOverride(dataDir, '../evolved'))
        .toThrow('Invalid custom persona ID');
      expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('sentinel');
    });
  });
});
