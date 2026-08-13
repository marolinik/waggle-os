import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceManager, type WorkspaceConfig } from '../src/workspace-manager.js';
import { MultiMindCache } from '../src/multi-mind-cache.js';

describe('WorkspaceManager', () => {
  let tmpDir: string;
  let manager: WorkspaceManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-test-'));
    manager = new WorkspaceManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates workspace with directory, config, mind file, and sessions dir', () => {
      const ws = manager.create({ name: 'My Project', group: 'Work' });

      expect(ws.id).toBe('my-project');
      expect(ws.name).toBe('My Project');
      expect(ws.group).toBe('Work');
      expect(ws.created).toBeTruthy();

      const wsDir = path.join(tmpDir, 'workspaces', 'my-project');
      expect(fs.existsSync(wsDir)).toBe(true);
      expect(fs.existsSync(path.join(wsDir, 'workspace.json'))).toBe(true);
      expect(fs.existsSync(path.join(wsDir, 'workspace.mind'))).toBe(true);
      expect(fs.existsSync(path.join(wsDir, 'sessions'))).toBe(true);
      expect(fs.statSync(path.join(wsDir, 'sessions')).isDirectory()).toBe(true);
    });
  });

  describe('list', () => {
    it('lists all workspaces', () => {
      manager.create({ name: 'Alpha', group: 'Work' });
      manager.create({ name: 'Beta', group: 'Personal' });
      manager.create({ name: 'Gamma', group: 'Work' });

      const all = manager.list();
      expect(all).toHaveLength(3);
      const names = all.map(w => w.name).sort();
      expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('returns empty array when no workspaces exist', () => {
      expect(manager.list()).toEqual([]);
    });
  });

  describe('listByGroup', () => {
    it('lists workspaces filtered by group', () => {
      manager.create({ name: 'Work Task 1', group: 'Work' });
      manager.create({ name: 'Work Task 2', group: 'Work' });
      manager.create({ name: 'Personal Note', group: 'Personal' });

      const workItems = manager.listByGroup('Work');
      expect(workItems).toHaveLength(2);
      expect(workItems.every(w => w.group === 'Work')).toBe(true);

      const personalItems = manager.listByGroup('Personal');
      expect(personalItems).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('gets workspace by id', () => {
      manager.create({ name: 'Test Workspace', group: 'Study' });

      const ws = manager.get('test-workspace');
      expect(ws).not.toBeNull();
      expect(ws!.name).toBe('Test Workspace');
      expect(ws!.group).toBe('Study');
    });

    it('returns null for nonexistent workspace', () => {
      expect(manager.get('does-not-exist')).toBeNull();
    });
  });

  describe('update', () => {
    it('updates workspace config partially', () => {
      manager.create({ name: 'Original', group: 'Work' });

      manager.update('original', { name: 'Updated Name', model: 'gpt-4o' });

      const ws = manager.get('original');
      expect(ws!.name).toBe('Updated Name');
      expect(ws!.model).toBe('gpt-4o');
      expect(ws!.group).toBe('Work'); // unchanged
    });
  });

  describe('AI Act risk classification (L-17 C2)', () => {
    it('stamps riskClassifiedAt on create when riskLevel is provided', () => {
      const before = Date.now();
      const ws = manager.create({ name: 'HR App', group: 'Work', riskLevel: 'high-risk' });
      const after = Date.now();

      expect(ws.riskLevel).toBe('high-risk');
      expect(ws.riskClassifiedAt).toBeTruthy();
      const t = Date.parse(ws.riskClassifiedAt!);
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    });

    it('does not stamp riskClassifiedAt on create when riskLevel is omitted', () => {
      const ws = manager.create({ name: 'Minimal App', group: 'Work' });
      expect(ws.riskLevel).toBeUndefined();
      expect(ws.riskClassifiedAt).toBeUndefined();
    });

    it('auto-stamps riskClassifiedAt when update changes riskLevel', async () => {
      manager.create({ name: 'App', group: 'Work', riskLevel: 'minimal' });
      const initial = manager.get('app')!.riskClassifiedAt;
      expect(initial).toBeTruthy();

      // Wait enough for a different ISO timestamp (millisecond-resolution)
      await new Promise((r) => setTimeout(r, 5));

      manager.update('app', { riskLevel: 'high-risk' });

      const after = manager.get('app')!;
      expect(after.riskLevel).toBe('high-risk');
      expect(after.riskClassifiedAt).toBeTruthy();
      expect(after.riskClassifiedAt).not.toBe(initial);
      expect(Date.parse(after.riskClassifiedAt!)).toBeGreaterThan(Date.parse(initial!));
    });

    it('leaves riskClassifiedAt unchanged when update does not change riskLevel', async () => {
      manager.create({ name: 'Stable', group: 'Work', riskLevel: 'limited' });
      const initial = manager.get('stable')!.riskClassifiedAt;

      await new Promise((r) => setTimeout(r, 5));

      // Update something else
      manager.update('stable', { name: 'Stable Renamed' });
      expect(manager.get('stable')!.riskClassifiedAt).toBe(initial);

      // Update riskLevel to the same value — still no change
      manager.update('stable', { riskLevel: 'limited' });
      expect(manager.get('stable')!.riskClassifiedAt).toBe(initial);
    });
  });

  describe('delete', () => {
    it('deletes workspace and removes directory', () => {
      manager.create({ name: 'To Delete', group: 'Temp' });
      expect(manager.get('to-delete')).not.toBeNull();

      manager.delete('to-delete');

      expect(manager.get('to-delete')).toBeNull();
      const wsDir = path.join(tmpDir, 'workspaces', 'to-delete');
      expect(fs.existsSync(wsDir)).toBe(false);
    });
  });

  describe('getMindPath', () => {
    it('returns path to workspace.mind', () => {
      manager.create({ name: 'Mind Test', group: 'Work' });

      const mindPath = manager.getMindPath('mind-test');
      expect(mindPath).toBe(path.join(tmpDir, 'workspaces', 'mind-test', 'workspace.mind'));
    });

    it.each(['missing-workspace', '..', '../escape', 'C:\\escape']) (
      'rejects invalid or missing workspace id %s before resolving a mind path',
      (id) => {
        expect(() => manager.getMindPath(id)).toThrow(/workspace/i);
      },
    );

    it('rejects an on-disk workspace whose config identity does not match', () => {
      manager.create({ name: 'Expected Workspace', group: 'Work' });
      const configPath = path.join(tmpDir, 'workspaces', 'expected-workspace', 'workspace.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as WorkspaceConfig;
      fs.writeFileSync(configPath, JSON.stringify({ ...config, id: 'different-workspace' }));

      expect(() => manager.getMindPath('expected-workspace')).toThrow(/config id/i);
    });

    it('rejects a dangling mind junction before opening its target', () => {
      manager.create({ name: 'Linked Mind', group: 'Work' });
      const mindPath = path.join(tmpDir, 'workspaces', 'linked-mind', 'workspace.mind');
      const missingTarget = path.join(tmpDir, 'missing-mind-target');
      fs.unlinkSync(mindPath);
      fs.symlinkSync(missingTarget, mindPath, process.platform === 'win32' ? 'junction' : 'dir');

      expect(() => manager.getMindPath('linked-mind')).toThrow(/regular file/i);
      expect(fs.existsSync(missingTarget)).toBe(false);
      fs.unlinkSync(mindPath);
    });

    it('rejects a mind file with another hard-link', () => {
      manager.create({ name: 'Hard Linked Mind', group: 'Work' });
      const mindPath = path.join(tmpDir, 'workspaces', 'hard-linked-mind', 'workspace.mind');
      const outsidePath = path.join(tmpDir, 'outside.mind');
      fs.writeFileSync(outsidePath, 'outside sentinel');
      fs.unlinkSync(mindPath);
      fs.linkSync(outsidePath, mindPath);

      expect(() => manager.getMindPath('hard-linked-mind')).toThrow(/regular file/i);
      expect(fs.readFileSync(outsidePath, 'utf8')).toBe('outside sentinel');
    });

    it('allows a valid workspace to recreate a missing mind inside its directory', () => {
      manager.create({ name: 'Missing Mind', group: 'Work' });
      const mindPath = path.join(tmpDir, 'workspaces', 'missing-mind', 'workspace.mind');
      fs.unlinkSync(mindPath);
      expect(manager.getMindPath('missing-mind')).toBe(mindPath);

      const cache = new MultiMindCache({
        maxOpen: 2,
        getMindPath: id => manager.getMindPath(id),
        allowedRoot: path.join(tmpDir, 'workspaces'),
      });
      expect(cache.getOrOpen('missing-mind')).not.toBeNull();
      expect(fs.statSync(mindPath).isFile()).toBe(true);
      cache.closeAll();
    });

    it('contains resolver failures and rejects a post-resolution junction swap', () => {
      const throwingCache = new MultiMindCache({
        maxOpen: 2,
        getMindPath: () => { throw new Error('unsafe workspace'); },
        allowedRoot: path.join(tmpDir, 'workspaces'),
      });
      expect(throwingCache.getOrOpen('missing')).toBeNull();

      manager.create({ name: 'Swap Target', group: 'Work' });
      const workspaceDir = path.join(tmpDir, 'workspaces', 'swap-target');
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-swap-'));
      const outsideMind = path.join(outsideDir, 'workspace.mind');
      fs.writeFileSync(outsideMind, 'outside sentinel');
      const cache = new MultiMindCache({
        maxOpen: 2,
        allowedRoot: path.join(tmpDir, 'workspaces'),
        getMindPath: id => {
          const resolved = manager.getMindPath(id);
          fs.rmSync(workspaceDir, { recursive: true, force: true });
          fs.symlinkSync(outsideDir, workspaceDir, process.platform === 'win32' ? 'junction' : 'dir');
          return resolved;
        },
      });

      try {
        expect(cache.getOrOpen('swap-target')).toBeNull();
        expect(fs.readFileSync(outsideMind, 'utf8')).toBe('outside sentinel');
      } finally {
        fs.unlinkSync(workspaceDir);
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe('listGroups', () => {
    it('lists unique groups', () => {
      manager.create({ name: 'A', group: 'Work' });
      manager.create({ name: 'B', group: 'Personal' });
      manager.create({ name: 'C', group: 'Work' });
      manager.create({ name: 'D', group: 'Study' });

      const groups = manager.listGroups().sort();
      expect(groups).toEqual(['Personal', 'Study', 'Work']);
    });
  });

  describe('generateId', () => {
    it('generates slug-based ID from name', () => {
      expect(manager.generateId('Q1 Marketing Campaign')).toBe('q1-marketing-campaign');
      expect(manager.generateId('Hello World!')).toBe('hello-world');
      expect(manager.generateId('  Spaces  Everywhere  ')).toBe('spaces-everywhere');
      expect(manager.generateId('UPPER CASE')).toBe('upper-case');
    });

    it('handles duplicate names with suffix', () => {
      manager.create({ name: 'Marketing', group: 'Work' });

      // Second one should get -2
      const id2 = manager.generateId('Marketing');
      expect(id2).toBe('marketing-2');

      // Create it so we can test -3
      manager.create({ name: 'Marketing', group: 'Work' });
      const id3 = manager.generateId('Marketing');
      expect(id3).toBe('marketing-3');
    });
  });

  describe('team workspace support', () => {
    it('creates team workspace with team fields', () => {
      const ws = manager.create({
        name: 'Team Project',
        group: 'Work',
        teamId: 'team-abc-123',
        teamServerUrl: 'https://team.waggle.dev',
        teamRole: 'member',
        teamUserId: 'user-xyz',
      });

      expect(ws.teamId).toBe('team-abc-123');
      expect(ws.teamServerUrl).toBe('https://team.waggle.dev');
      expect(ws.teamRole).toBe('member');
      expect(ws.teamUserId).toBe('user-xyz');
    });

    it('creates solo workspace without team fields', () => {
      const ws = manager.create({ name: 'Solo', group: 'Personal' });

      expect(ws.teamId).toBeUndefined();
      expect(ws.teamServerUrl).toBeUndefined();
      expect(ws.teamRole).toBeUndefined();
      expect(ws.teamUserId).toBeUndefined();
    });

    it('isTeamWorkspace returns true for team workspaces', () => {
      manager.create({
        name: 'Team WS',
        group: 'Work',
        teamId: 'team-1',
        teamServerUrl: 'https://example.com',
      });
      expect(manager.isTeamWorkspace('team-ws')).toBe(true);
    });

    it('isTeamWorkspace returns false for solo workspaces', () => {
      manager.create({ name: 'Solo WS', group: 'Personal' });
      expect(manager.isTeamWorkspace('solo-ws')).toBe(false);
    });

    it('isTeamWorkspace returns false for nonexistent workspace', () => {
      expect(manager.isTeamWorkspace('nope')).toBe(false);
    });

    it('listTeamWorkspaces filters to team-connected only', () => {
      manager.create({ name: 'Solo A', group: 'Work' });
      manager.create({ name: 'Team B', group: 'Work', teamId: 'team-1', teamServerUrl: 'https://a.com' });
      manager.create({ name: 'Solo C', group: 'Personal' });
      manager.create({ name: 'Team D', group: 'Work', teamId: 'team-2', teamServerUrl: 'https://b.com' });

      const teamWs = manager.listTeamWorkspaces();
      expect(teamWs).toHaveLength(2);
      expect(teamWs.map(w => w.name).sort()).toEqual(['Team B', 'Team D']);
    });

    it('persists team fields through get round-trip', () => {
      manager.create({
        name: 'Persist Test',
        group: 'Work',
        teamId: 'team-persist',
        teamServerUrl: 'https://persist.dev',
        teamRole: 'admin',
        teamUserId: 'user-persist',
      });

      const ws = manager.get('persist-test');
      expect(ws!.teamId).toBe('team-persist');
      expect(ws!.teamServerUrl).toBe('https://persist.dev');
      expect(ws!.teamRole).toBe('admin');
      expect(ws!.teamUserId).toBe('user-persist');
    });

    it('updates team fields', () => {
      manager.create({
        name: 'Update Team',
        group: 'Work',
        teamId: 'team-1',
        teamRole: 'member',
      });

      manager.update('update-team', { teamRole: 'admin' });

      const ws = manager.get('update-team');
      expect(ws!.teamRole).toBe('admin');
      expect(ws!.teamId).toBe('team-1'); // unchanged
    });
  });

  // Reverse-ported from OSS hive-mind (oss-drift triage R4, 2026-06-11).
  describe('ensure', () => {
    it('rejects a pre-existing workspace junction without writing through it', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-outside-'));
      const outsideConfig = path.join(outsideDir, 'workspace.json');
      const outsideMind = path.join(outsideDir, 'workspace.mind');
      fs.writeFileSync(outsideConfig, 'outside config');
      fs.writeFileSync(outsideMind, 'outside mind');
      const linkPath = path.join(tmpDir, 'workspaces', 'escape');
      fs.symlinkSync(outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

      try {
        expect(() => manager.ensure('escape')).toThrow(/already exists|valid workspace/i);
        expect(fs.readFileSync(outsideConfig, 'utf8')).toBe('outside config');
        expect(fs.readFileSync(outsideMind, 'utf8')).toBe('outside mind');
        expect(fs.existsSync(path.join(outsideDir, 'sessions'))).toBe(false);
      } finally {
        fs.unlinkSync(linkPath);
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it.each([
      ['malformed', '{"id":'],
      ['mismatched', JSON.stringify({ id: 'other-workspace' })],
    ])('preserves an existing %s workspace when ensure cannot validate it', (_label, rawConfig) => {
      const wsDir = path.join(tmpDir, 'workspaces', 'victim');
      fs.mkdirSync(wsDir);
      const configPath = path.join(wsDir, 'workspace.json');
      const mindPath = path.join(wsDir, 'workspace.mind');
      fs.writeFileSync(configPath, rawConfig);
      fs.writeFileSync(mindPath, 'mind sentinel');

      expect(() => manager.ensure('victim')).toThrow(/already exists|valid workspace/i);
      expect(fs.readFileSync(configPath, 'utf8')).toBe(rawConfig);
      expect(fs.readFileSync(mindPath, 'utf8')).toBe('mind sentinel');
      expect(fs.existsSync(path.join(wsDir, 'sessions'))).toBe(false);
    });
    it('creates a workspace with the exact supplied id when missing', () => {
      const ws = manager.ensure('cwd-derived-id');

      expect(ws.id).toBe('cwd-derived-id');
      expect(ws.name).toBe('cwd-derived-id'); // defaults to id
      expect(ws.group).toBe('auto');
      expect(ws.created).toBeTruthy();

      const wsDir = path.join(tmpDir, 'workspaces', 'cwd-derived-id');
      expect(fs.existsSync(path.join(wsDir, 'workspace.json'))).toBe(true);
      expect(fs.existsSync(path.join(wsDir, 'workspace.mind'))).toBe(true);
      expect(fs.existsSync(path.join(wsDir, 'sessions'))).toBe(true);
    });

    it('returns the existing workspace unchanged when the id exists', () => {
      const created = manager.create({ name: 'My Project', group: 'Work', model: 'gpt-4o' });

      const ensured = manager.ensure(created.id, { name: 'Other Name', group: 'Other' });

      expect(ensured).toEqual(created);
      // On-disk config untouched.
      const onDisk = manager.get(created.id)!;
      expect(onDisk.name).toBe('My Project');
      expect(onDisk.group).toBe('Work');
      expect(onDisk.model).toBe('gpt-4o');
    });

    it('is idempotent — repeated ensure returns the same config', () => {
      const first = manager.ensure('hook-ws', { name: 'Hook WS', group: 'Hooks' });
      const second = manager.ensure('hook-ws');
      expect(second).toEqual(first);
      expect(manager.list().filter(w => w.id === 'hook-ws')).toHaveLength(1);
    });

    it('bypasses slug-collision suffixing — id is used verbatim', () => {
      manager.create({ name: 'Marketing', group: 'Work' }); // takes 'marketing'
      // ensure on a fresh exact id does NOT become marketing-2
      const ws = manager.ensure('marketing-team');
      expect(ws.id).toBe('marketing-team');
    });

    it('passes through mono-only optional fields like create() does', () => {
      const before = Date.now();
      const ws = manager.ensure('risk-ws', {
        name: 'Risk WS',
        group: 'Work',
        personaId: 'researcher',
        riskLevel: 'high-risk',
      });
      const after = Date.now();

      expect(ws.personaId).toBe('researcher');
      expect(ws.riskLevel).toBe('high-risk');
      // riskClassifiedAt auto-stamped, same as create()
      expect(ws.riskClassifiedAt).toBeTruthy();
      const t = Date.parse(ws.riskClassifiedAt!);
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    });
  });

  describe('default workspace', () => {
    it('sets and gets default workspace', () => {
      manager.create({ name: 'Default WS', group: 'Work' });

      manager.setDefault('default-ws');
      expect(manager.getDefault()).toBe('default-ws');
    });

    it('returns null when no default set', () => {
      expect(manager.getDefault()).toBeNull();
    });

    it('throws when setting nonexistent workspace as default', () => {
      expect(() => manager.setDefault('nonexistent')).toThrow();
    });
  });
});
