import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Workspace, type WorkspaceConfig } from '../src/workspace.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Workspace', () => {
  let tmpDir: string;
  let ws: Workspace;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-test-'));
    ws = new Workspace(tmpDir);
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  describe('init', () => {
    it('creates .waggle directory structure', () => {
      ws.init();

      expect(fs.existsSync(path.join(tmpDir, '.waggle'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.waggle', 'sessions'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.waggle', 'audit'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.waggle', 'workspace.json'))).toBe(true);

      const config = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.waggle', 'workspace.json'), 'utf-8'),
      );
      expect(config).toEqual({
        model: 'claude-sonnet',
        litellmUrl: 'http://localhost:4000/v1',
      });
    });

    it('does not overwrite existing workspace.json', () => {
      ws.init();

      // Modify config
      ws.updateConfig({ teamSlug: 'my-team' });

      // Re-init should preserve
      ws.init();

      const config = ws.getConfig();
      expect(config.teamSlug).toBe('my-team');
    });
  });

  describe('getRoot', () => {
    it('returns the workspace root path', () => {
      expect(ws.getRoot()).toBe(tmpDir);
    });
  });

  describe('getConfig / updateConfig', () => {
    it('reads workspace config', () => {
      ws.init();
      const config = ws.getConfig();
      expect(config.model).toBe('claude-sonnet');
      expect(config.litellmUrl).toBe('http://localhost:4000/v1');
    });

    it('merges updates into config', () => {
      ws.init();
      ws.updateConfig({ teamSlug: 'acme', model: 'gpt-4o' });

      const config = ws.getConfig();
      expect(config.teamSlug).toBe('acme');
      expect(config.model).toBe('gpt-4o');
      expect(config.litellmUrl).toBe('http://localhost:4000/v1');
    });
  });

  describe('startSession', () => {
    it('generates session ID with date and sequential number', () => {
      ws.init();

      const id1 = ws.startSession();
      const id2 = ws.startSession();

      // Format: YYYY-MM-DD-NNN
      expect(id1).toMatch(/^\d{4}-\d{2}-\d{2}-001$/);
      expect(id2).toMatch(/^\d{4}-\d{2}-\d{2}-002$/);
    });

    it('continues numbering from existing session files', () => {
      ws.init();

      const today = new Date().toISOString().slice(0, 10);
      // Pre-create a session file to simulate prior sessions
      fs.writeFileSync(
        path.join(tmpDir, '.waggle', 'sessions', `${today}-003.jsonl`),
        '',
      );

      const id = ws.startSession();
      expect(id).toBe(`${today}-004`);
    });
  });

  describe('logTurn', () => {
    it('writes JSONL to sessions directory', () => {
      ws.init();
      const sessionId = ws.startSession();

      ws.logTurn(sessionId, 'user', 'Hello agent');
      ws.logTurn(sessionId, 'assistant', 'Hello!', ['search_memory']);

      const filePath = path.join(
        tmpDir,
        '.waggle',
        'sessions',
        `${sessionId}.jsonl`,
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const lines = fs
        .readFileSync(filePath, 'utf-8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

      expect(lines).toHaveLength(2);
      expect(lines[0].role).toBe('user');
      expect(lines[0].content).toBe('Hello agent');
      expect(lines[0].timestamp).toBeDefined();
      expect(lines[0].tools_used).toBeUndefined();

      expect(lines[1].role).toBe('assistant');
      expect(lines[1].content).toBe('Hello!');
      expect(lines[1].tools_used).toEqual(['search_memory']);
    });
  });

  describe('logAudit', () => {
    it('writes JSONL to audit directory', () => {
      ws.init();
      const sessionId = ws.startSession();

      ws.logAudit(sessionId, 'search_memory', { query: 'test' }, 'found 3 results');

      const filePath = path.join(
        tmpDir,
        '.waggle',
        'audit',
        `${sessionId}.jsonl`,
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const lines = fs
        .readFileSync(filePath, 'utf-8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

      expect(lines).toHaveLength(1);
      expect(lines[0].tool).toBe('search_memory');
      expect(lines[0].input).toEqual({ query: 'test' });
      expect(lines[0].output).toBe('found 3 results');
      expect(lines[0].timestamp).toBeDefined();
    });
  });
});
