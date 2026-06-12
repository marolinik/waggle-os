/**
 * P5/D4 skill-write governance — HTTP route audit + provenance (binding iv).
 *
 * Asserts the raw POST/PUT/DELETE /api/skills paths now (a) flow through the
 * shared skill-write service, so they redact, stamp provenance, and ENTER THE
 * AUDIT TRAIL, and (b) GET /api/skills surfaces initiator/source so the Skills
 * Hub can badge agent-authored skills.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { skillRoutes } from '../../src/local/routes/skills.js';

interface AuditRow { action: string; initiator: string; capabilityName: string; capabilityType: string }

describe('P5/D4 skill governance routes', () => {
  let dataDir: string;
  let skillsDir: string;
  let server: ReturnType<typeof Fastify>;
  let audit: AuditRow[];

  beforeEach(async () => {
    dataDir = path.join(os.tmpdir(), `waggle-p5-${randomUUID()}`);
    skillsDir = path.join(dataDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    audit = [];
    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir });
    server.decorate('agentState', { skills: [] });
    server.decorate('skillHashStore', { setHash: () => {}, removeHash: () => {}, checkAll: () => ({ changed: [], unchanged: [], missing: [] }) });
    server.decorate('auditStore', {
      record: (e: AuditRow) => { audit.push(e); return e; },
      getRecent: () => audit,
    });
    await server.register(skillRoutes);
    await server.ready();
  });
  afterEach(async () => { await server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  it('POST /api/skills stamps user provenance and audits installed', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/skills', payload: { name: 'my-note', content: '# Note\nbody' } });
    expect(res.statusCode).toBe(200);
    const raw = fs.readFileSync(path.join(skillsDir, 'my-note.md'), 'utf-8');
    expect(raw).toContain('initiator: user');
    expect(raw).toContain('source: api');
    const installed = audit.filter(a => a.action === 'installed' && a.capabilityName === 'my-note');
    expect(installed).toHaveLength(1);
    expect(installed[0].initiator).toBe('user');
  });

  it('GET /api/skills returns initiator/source provenance', async () => {
    // An agent-authored skill on disk.
    fs.writeFileSync(path.join(skillsDir, 'agent-made.md'), '---\ninitiator: agent\nsource: chat\n---\n\n# Agent skill');
    // A legacy skill with no frontmatter → defaults to user.
    fs.writeFileSync(path.join(skillsDir, 'legacy.md'), '# Legacy skill, no frontmatter');
    const res = await server.inject({ method: 'GET', url: '/api/skills' });
    const body = res.json() as { skills: Array<{ name: string; initiator: string; source?: string }> };
    const agentSkill = body.skills.find(s => s.name === 'agent-made');
    const legacy = body.skills.find(s => s.name === 'legacy');
    expect(agentSkill?.initiator).toBe('agent');
    expect(agentSkill?.source).toBe('chat');
    expect(legacy?.initiator).toBe('user');
  });

  it('DELETE /api/skills/:name audits uninstalled', async () => {
    await server.inject({ method: 'POST', url: '/api/skills', payload: { name: 'doomed', content: 'x' } });
    audit.length = 0;
    const res = await server.inject({ method: 'DELETE', url: '/api/skills/doomed' });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(path.join(skillsDir, 'doomed.md'))).toBe(false);
    const uninstalled = audit.filter(a => a.action === 'uninstalled');
    expect(uninstalled).toHaveLength(1);
    expect(uninstalled[0].initiator).toBe('user');
  });

  it('PUT /api/skills/:name preserves original provenance (sticky)', async () => {
    fs.writeFileSync(path.join(skillsDir, 'shared.md'), '---\ninitiator: agent\nsource: chat\n---\n\nv1');
    const res = await server.inject({ method: 'PUT', url: '/api/skills/shared', payload: { content: 'v2 edited in UI' } });
    expect(res.statusCode).toBe(200);
    const raw = fs.readFileSync(path.join(skillsDir, 'shared.md'), 'utf-8');
    expect(raw).toContain('initiator: agent'); // not relaundered to user
    expect(raw).toContain('v2 edited in UI');
  });

  it('POST /api/skills rejects path traversal without auditing', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/skills', payload: { name: '../evil', content: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(audit).toHaveLength(0);
  });
});
