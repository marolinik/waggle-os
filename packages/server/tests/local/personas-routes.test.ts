/**
 * Personas REST API Route Tests
 *
 * Tests the GET /api/personas endpoint:
 *   - Returns array of personas
 *   - Each persona has id, name, description, icon
 *   - Does NOT include systemPrompt (sensitive/large)
 */

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { personaRoutes } from '../../src/local/routes/personas.js';

function createTestServer() {
  const server = Fastify({ logger: false });
  server.register(personaRoutes);
  return server;
}

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

    it('contains the expected 8 personas', async () => {
      const server = createTestServer();
      const res = await server.inject({ method: 'GET', url: '/api/personas' });
      const { personas } = res.json();

      expect(personas.length).toBe(13);
      const ids = personas.map((p: { id: string }) => p.id);
      expect(ids).toContain('researcher');
      expect(ids).toContain('writer');
      expect(ids).toContain('analyst');
      expect(ids).toContain('coder');
      expect(ids).toContain('project-manager');
      expect(ids).toContain('executive-assistant');
      expect(ids).toContain('sales-rep');
      expect(ids).toContain('marketer');
      await server.close();
    });
  });
});
