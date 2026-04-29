import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceManager, type WorkspaceConfig } from '../src/workspace-config.js';

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
