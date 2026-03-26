import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NotionConnector } from '../../src/connectors/notion-connector.js';
import { ConfluenceConnector } from '../../src/connectors/confluence-connector.js';
import { ObsidianConnector } from '../../src/connectors/obsidian-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(
  connectorId: string,
  cred?: { value: string; isExpired: boolean },
  extras?: Record<string, { value: string }>,
): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === connectorId && cred) return { ...cred, type: 'api_key' };
      return null;
    }),
    get: vi.fn((key: string) => extras?.[key] ?? null),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
    setConnectorCredential: vi.fn(),
    migrateFromConfig: vi.fn(() => 0),
  } as unknown as VaultStore;
}

// ── Notion Connector ──────────────────────────────────────────────────

describe('NotionConnector', () => {
  let connector: NotionConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new NotionConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and actions', () => {
    expect(connector.id).toBe('notion');
    expect(connector.name).toBe('Notion');
    expect(connector.service).toBe('notion.so');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
    expect(connector.actions).toHaveLength(7);
    expect(connector.actions.map(a => a.name)).toEqual([
      'search_pages', 'get_page', 'list_databases', 'query_database',
      'create_page', 'update_page', 'get_block_children',
    ]);
  });

  it('action risk levels are correct', () => {
    const risks = Object.fromEntries(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(risks.search_pages).toBe('low');
    expect(risks.get_page).toBe('low');
    expect(risks.list_databases).toBe('low');
    expect(risks.query_database).toBe('low');
    expect(risks.create_page).toBe('medium');
    expect(risks.update_page).toBe('medium');
    expect(risks.get_block_children).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('search_pages', { query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault('notion', { value: 'ntn_test123', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('notion');
  });

  it('healthCheck() returns connected when API responds OK', async () => {
    const vault = createMockVault('notion', { value: 'ntn_test123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: 'bot' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    expect(health.id).toBe('notion');
  });

  it('execute(search_pages) calls POST /search', async () => {
    const vault = createMockVault('notion', { value: 'ntn_test123', isExpired: false });
    await connector.connect(vault);

    const mockResults = { results: [{ id: 'page-1', object: 'page' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResults }) as any;

    const result = await connector.execute('search_pages', { query: 'project plan' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResults);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/search');
    expect(fetchCall[1].method).toBe('POST');
  });

  it('execute(get_page) calls GET /pages/{id}', async () => {
    const vault = createMockVault('notion', { value: 'ntn_test123', isExpired: false });
    await connector.connect(vault);

    const mockPage = { id: 'page-1', object: 'page' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockPage }) as any;

    const result = await connector.execute('get_page', { page_id: 'page-1' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockPage);
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('notion');
    expect(def.tools).toContain('connector_notion_search_pages');
    expect(def.tools).toContain('connector_notion_create_page');
    expect(def.tools).toHaveLength(7);
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault('notion', { value: 'ntn_test123', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });
});

// ── Confluence Connector ──────────────────────────────────────────────

describe('ConfluenceConnector', () => {
  let connector: ConfluenceConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new ConfluenceConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and actions', () => {
    expect(connector.id).toBe('confluence');
    expect(connector.name).toBe('Confluence');
    expect(connector.service).toBe('atlassian.net');
    expect(connector.authType).toBe('basic');
    expect(connector.substrate).toBe('waggle');
    expect(connector.actions).toHaveLength(5);
    expect(connector.actions.map(a => a.name)).toEqual([
      'search_content', 'get_page', 'list_spaces', 'create_page', 'update_page',
    ]);
  });

  it('action risk levels are correct', () => {
    const risks = Object.fromEntries(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(risks.search_content).toBe('low');
    expect(risks.get_page).toBe('low');
    expect(risks.list_spaces).toBe('low');
    expect(risks.create_page).toBe('medium');
    expect(risks.update_page).toBe('medium');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('search_content', { cql: 'type=page' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('connect() retrieves credentials and domain from vault', async () => {
    const vault = createMockVault('confluence', { value: 'api-token-123', isExpired: false }, {
      'connector:confluence:email': { value: 'user@example.com' },
      'connector:confluence:domain': { value: 'mycompany' },
    });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('confluence');
    expect(vault.get).toHaveBeenCalledWith('connector:confluence:email');
    expect(vault.get).toHaveBeenCalledWith('connector:confluence:domain');
  });

  it('healthCheck() returns connected when API responds OK', async () => {
    const vault = createMockVault('confluence', { value: 'api-token-123', isExpired: false }, {
      'connector:confluence:email': { value: 'user@example.com' },
      'connector:confluence:domain': { value: 'mycompany' },
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    expect(health.id).toBe('confluence');
  });

  it('healthCheck() returns disconnected when no domain configured', async () => {
    const vault = createMockVault('confluence', { value: 'api-token-123', isExpired: false }, {
      'connector:confluence:email': { value: 'user@example.com' },
      // no domain entry
    });
    await connector.connect(vault);

    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
  });

  it('execute(search_content) calls GET /search with cql', async () => {
    const vault = createMockVault('confluence', { value: 'api-token-123', isExpired: false }, {
      'connector:confluence:email': { value: 'user@example.com' },
      'connector:confluence:domain': { value: 'mycompany' },
    });
    await connector.connect(vault);

    const mockResults = { results: [{ id: '123', title: 'Test Page' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResults }) as any;

    const result = await connector.execute('search_content', { cql: 'type=page AND text~"test"' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResults);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('mycompany.atlassian.net/wiki/api/v2/search');
    expect(fetchCall[0]).toContain('cql=');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('confluence');
    expect(def.tools).toContain('connector_confluence_search_content');
    expect(def.tools).toContain('connector_confluence_create_page');
    expect(def.tools).toHaveLength(5);
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault('confluence', { value: 'api-token-123', isExpired: false }, {
      'connector:confluence:email': { value: 'user@example.com' },
      'connector:confluence:domain': { value: 'mycompany' },
    });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });
});

// ── Obsidian Connector ────────────────────────────────────────────────

describe('ObsidianConnector', () => {
  let connector: ObsidianConnector;
  let tmpDir: string;

  beforeEach(() => {
    connector = new ObsidianConnector();
    // Create a temp directory as a mock Obsidian vault
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-obsidian-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('has correct id, name, and actions', () => {
    expect(connector.id).toBe('obsidian');
    expect(connector.name).toBe('Obsidian');
    expect(connector.service).toBe('local');
    expect(connector.authType).toBe('api_key');
    expect(connector.substrate).toBe('waggle');
    expect(connector.actions).toHaveLength(6);
    expect(connector.actions.map(a => a.name)).toEqual([
      'search_notes', 'get_note', 'list_notes', 'create_note', 'update_note', 'list_folders',
    ]);
  });

  it('action risk levels are correct', () => {
    const risks = Object.fromEntries(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(risks.search_notes).toBe('low');
    expect(risks.get_note).toBe('low');
    expect(risks.list_notes).toBe('low');
    expect(risks.create_note).toBe('medium');
    expect(risks.update_note).toBe('medium');
    expect(risks.list_folders).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('search_notes', { query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('connect() retrieves vault path from vault', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('obsidian');
  });

  it('healthCheck() returns connected when directory exists', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    expect(health.id).toBe('obsidian');
  });

  it('healthCheck() returns error when directory does not exist', async () => {
    const vault = createMockVault('obsidian', { value: path.join(tmpDir, 'nonexistent'), isExpired: false });
    await connector.connect(vault);

    const health = await connector.healthCheck();
    expect(health.status).toBe('error');
    expect(health.error).toBeDefined();
  });

  it('create_note creates a new file', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('create_note', {
      path: 'test-note.md',
      content: '# Hello World\n\nThis is a test note.',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).created).toBe(true);

    // Verify the file exists
    const filePath = path.join(tmpDir, 'test-note.md');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Hello World\n\nThis is a test note.');
  });

  it('create_note creates parent directories', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('create_note', {
      path: 'Projects/subfolder/deep-note.md',
      content: 'Deep content',
    });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'Projects', 'subfolder', 'deep-note.md'))).toBe(true);
  });

  it('create_note rejects duplicate', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.writeFileSync(path.join(tmpDir, 'existing.md'), 'old content');

    const result = await connector.execute('create_note', {
      path: 'existing.md',
      content: 'new content',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('get_note reads file content', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.writeFileSync(path.join(tmpDir, 'read-me.md'), '# Test\nContent here');

    const result = await connector.execute('get_note', { path: 'read-me.md' });
    expect(result.success).toBe(true);
    expect((result.data as any).content).toBe('# Test\nContent here');
    expect((result.data as any).name).toBe('read-me.md');
  });

  it('get_note returns error for missing file', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('get_note', { path: 'nonexistent.md' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('update_note overwrites file content', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.writeFileSync(path.join(tmpDir, 'update-me.md'), 'old content');

    const result = await connector.execute('update_note', {
      path: 'update-me.md',
      content: 'new content',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).updated).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'update-me.md'), 'utf-8')).toBe('new content');
  });

  it('list_notes returns all markdown files', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.writeFileSync(path.join(tmpDir, 'note1.md'), 'content 1');
    fs.writeFileSync(path.join(tmpDir, 'note2.md'), 'content 2');
    fs.writeFileSync(path.join(tmpDir, 'not-markdown.txt'), 'ignored');

    const result = await connector.execute('list_notes', {});
    expect(result.success).toBe(true);
    const notes = (result.data as any).notes;
    expect(notes).toHaveLength(2);
    expect(notes.map((n: any) => n.name).sort()).toEqual(['note1.md', 'note2.md']);
  });

  it('list_notes includes subfolder files', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.mkdirSync(path.join(tmpDir, 'Projects'));
    fs.writeFileSync(path.join(tmpDir, 'root.md'), 'root');
    fs.writeFileSync(path.join(tmpDir, 'Projects', 'sub.md'), 'sub');

    const result = await connector.execute('list_notes', {});
    expect(result.success).toBe(true);
    expect((result.data as any).notes).toHaveLength(2);
  });

  it('list_notes skips hidden directories', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.mkdirSync(path.join(tmpDir, '.obsidian'));
    fs.writeFileSync(path.join(tmpDir, '.obsidian', 'config.md'), 'hidden');
    fs.writeFileSync(path.join(tmpDir, 'visible.md'), 'visible');

    const result = await connector.execute('list_notes', {});
    expect(result.success).toBe(true);
    expect((result.data as any).notes).toHaveLength(1);
    expect((result.data as any).notes[0].name).toBe('visible.md');
  });

  it('search_notes finds by filename', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.writeFileSync(path.join(tmpDir, 'project-plan.md'), 'Some content');
    fs.writeFileSync(path.join(tmpDir, 'meeting-notes.md'), 'Other content');

    const result = await connector.execute('search_notes', { query: 'project' });
    expect(result.success).toBe(true);
    expect((result.data as any).results).toHaveLength(1);
    expect((result.data as any).results[0].name).toBe('project-plan.md');
  });

  it('search_notes finds by content', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.writeFileSync(path.join(tmpDir, 'note-a.md'), 'This is about JavaScript');
    fs.writeFileSync(path.join(tmpDir, 'note-b.md'), 'This is about TypeScript and Waggle');

    const result = await connector.execute('search_notes', { query: 'waggle' });
    expect(result.success).toBe(true);
    expect((result.data as any).results).toHaveLength(1);
    expect((result.data as any).results[0].name).toBe('note-b.md');
  });

  it('list_folders returns subdirectories', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    fs.mkdirSync(path.join(tmpDir, 'Projects'));
    fs.mkdirSync(path.join(tmpDir, 'Archive'));
    fs.mkdirSync(path.join(tmpDir, '.obsidian')); // hidden, should be excluded

    const result = await connector.execute('list_folders', {});
    expect(result.success).toBe(true);
    const folders = (result.data as any).folders;
    expect(folders).toHaveLength(2);
    expect(folders.map((f: any) => f.name).sort()).toEqual(['Archive', 'Projects']);
  });

  it('rejects path traversal', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('get_note', { path: '../../etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('path traversal');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('obsidian');
    expect(def.tools).toContain('connector_obsidian_search_notes');
    expect(def.tools).toContain('connector_obsidian_create_note');
    expect(def.tools).toHaveLength(6);
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault('obsidian', { value: tmpDir, isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });
});
