import { describe, it, expect } from 'vitest';
import {
  ACTION_IDS,
  validateAndBuildAction,
  checkTier,
  buildActionCatalog,
  type RegistryContext,
} from '../../src/local/command-registry.js';

const ctx: RegistryContext = {
  workspaceId: 'w1',
  workspaces: [
    { id: 'w1', name: 'Acme Redesign' },
    { id: 'w2', name: 'Personal Notes' },
  ],
};

describe('command-registry — closed action registry', () => {
  it('exposes only the v1 action ids', () => {
    expect(ACTION_IDS).toEqual(['open_app', 'open_workspace', 'create_workspace', 'install_mcp']);
  });

  it('rejects an unknown action id (closed registry)', () => {
    expect(validateAndBuildAction('rm_rf_slash', {}, ctx)).toBeNull();
    expect(validateAndBuildAction('exec_shell', { cmd: 'whoami' }, ctx)).toBeNull();
  });

  describe('open_app (nav, read)', () => {
    it('builds a navigate target for a valid app id', () => {
      const a = validateAndBuildAction('open_app', { app: 'memory' }, ctx);
      expect(a).toMatchObject({
        id: 'open_app',
        sideEffect: false,
        riskLevel: 'low',
        navigate: { type: 'command', id: 'command:memory' },
      });
      expect(a?.endpoint).toBeUndefined();
    });

    it('rejects an app id outside NAV_TARGETS (enum guard)', () => {
      expect(validateAndBuildAction('open_app', { app: 'admin-secrets' }, ctx)).toBeNull();
    });
  });

  describe('open_workspace (nav, read)', () => {
    it('resolves by id', () => {
      const a = validateAndBuildAction('open_workspace', { workspaceId: 'w2' }, ctx);
      expect(a?.navigate).toEqual({ type: 'workspace', id: 'workspace:w2' });
    });

    it('resolves by fuzzy name when id is unknown', () => {
      const a = validateAndBuildAction('open_workspace', { name: 'acme' }, ctx);
      expect(a?.navigate).toEqual({ type: 'workspace', id: 'workspace:w1' });
    });

    it('returns null when the workspace cannot be resolved', () => {
      expect(validateAndBuildAction('open_workspace', { name: 'Nonexistent' }, ctx)).toBeNull();
    });
  });

  describe('create_workspace (side-effect, low)', () => {
    it('builds a POST /api/workspaces endpoint with the name filled', () => {
      const a = validateAndBuildAction('create_workspace', { name: 'X Project' }, ctx);
      expect(a).toMatchObject({
        id: 'create_workspace',
        sideEffect: true,
        riskLevel: 'low',
        endpoint: { method: 'POST', path: '/api/workspaces', body: { name: 'X Project', group: 'Personal' } },
      });
    });

    it('returns null without a name', () => {
      expect(validateAndBuildAction('create_workspace', {}, ctx)).toBeNull();
    });
  });

  describe('install_mcp (side-effect, medium, PRO)', () => {
    it('builds a POST /api/mcps/install endpoint for a catalog id', () => {
      const a = validateAndBuildAction('install_mcp', { mcpId: 'postgres' }, ctx);
      expect(a).toMatchObject({
        id: 'install_mcp',
        sideEffect: true,
        riskLevel: 'medium',
        endpoint: { method: 'POST', path: '/api/mcps/install', body: { mcpId: 'postgres' } },
      });
    });

    it('rejects an mcp id outside the surfaced popular set (enum guard)', () => {
      expect(validateAndBuildAction('install_mcp', { mcpId: 'totally-made-up' }, ctx)).toBeNull();
    });
  });

  describe('checkTier', () => {
    it('gates install_mcp on FREE → requires PRO', () => {
      expect(checkTier('install_mcp', 'FREE')).toEqual({ gated: true, requiredTier: 'PRO' });
    });
    it('does not gate install_mcp on PRO', () => {
      expect(checkTier('install_mcp', 'PRO')).toEqual({ gated: false });
    });
    it('never gates a free/read action', () => {
      expect(checkTier('open_app', 'FREE')).toEqual({ gated: false });
      expect(checkTier('create_workspace', 'FREE')).toEqual({ gated: false });
    });
  });

  it('renders a prompt catalog naming every action + nav/mcp targets', () => {
    const catalog = buildActionCatalog();
    for (const id of ACTION_IDS) expect(catalog).toContain(id);
    expect(catalog).toContain('NAV TARGETS');
    expect(catalog).toContain('memory');
    expect(catalog).toContain('POPULAR MCP SERVERS');
    expect(catalog).toContain('postgres');
    expect(catalog).toContain('requires PRO');
  });
});
