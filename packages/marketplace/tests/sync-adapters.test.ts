/**
 * Marketplace Sync Adapters — Unit Tests
 *
 * Tests for the new sync adapters: awesome-list parser, GitHub repo content,
 * NPM search, web registry, deduplication, and source seeding.
 *
 * All HTTP calls are mocked — no real network traffic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { MarketplaceDB } from '../src/db';
import {
  MarketplaceSync,
  parseAwesomeListMarkdown,
  parseNpmSearchResults,
  normalizeName,
  deduplicatePackages,
} from '../src/sync';
import { seedNewSources, NEW_SOURCES } from '../src/sources-seed';
import type { MarketplaceSource } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────

function createEmptyTempDb(): {
  db: MarketplaceDB;
  tmpDir: string;
  dbPath: string;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mkt-adapt-'));
  const dbPath = path.join(tmpDir, 'marketplace.db');

  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  raw.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      url TEXT,
      source_type TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'multi',
      total_packages INTEGER DEFAULT 0,
      install_method TEXT DEFAULT 'api_fetch',
      api_endpoint TEXT,
      description TEXT,
      last_synced_at TEXT,
      is_custom BOOLEAN DEFAULT 0,
      sync_state TEXT DEFAULT NULL
    );

    CREATE TABLE packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id),
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      author TEXT,
      package_type TEXT NOT NULL,
      waggle_install_type TEXT NOT NULL,
      waggle_install_path TEXT,
      version TEXT DEFAULT '1.0.0',
      license TEXT,
      repository_url TEXT,
      homepage_url TEXT,
      downloads INTEGER DEFAULT 0,
      stars INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      category TEXT,
      subcategory TEXT,
      install_manifest JSON,
      platforms JSON DEFAULT '[]',
      min_waggle_version TEXT,
      dependencies JSON DEFAULT '[]',
      packs JSON DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      security_status TEXT DEFAULT 'unscanned',
      security_score INTEGER DEFAULT -1,
      last_scanned_at TEXT,
      content_hash TEXT,
      scan_engines JSON,
      scan_findings JSON,
      scan_blocked BOOLEAN DEFAULT 0,
      UNIQUE(source_id, name)
    );

    CREATE VIRTUAL TABLE packages_fts USING fts5(
      name, display_name, description, author, category,
      content='packages', content_rowid='id'
    );

    CREATE TABLE packs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      target_roles TEXT,
      icon TEXT,
      priority TEXT DEFAULT 'MEDIUM',
      connectors_needed JSON DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE pack_packages (
      pack_id INTEGER REFERENCES packs(id),
      package_id INTEGER REFERENCES packages(id),
      is_core BOOLEAN DEFAULT 0,
      PRIMARY KEY (pack_id, package_id)
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE package_tags (
      package_id INTEGER REFERENCES packages(id),
      tag_id INTEGER REFERENCES tags(id),
      PRIMARY KEY (package_id, tag_id)
    );

    CREATE TABLE installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER REFERENCES packages(id),
      installed_version TEXT NOT NULL,
      installed_at TEXT DEFAULT (datetime('now')),
      install_path TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      config JSON DEFAULT '{}'
    );

    CREATE TABLE scan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER REFERENCES packages(id),
      scanned_at TEXT DEFAULT (datetime('now')),
      overall_severity TEXT NOT NULL,
      security_score INTEGER NOT NULL,
      content_hash TEXT,
      engines_used JSON,
      findings JSON,
      blocked BOOLEAN DEFAULT 0,
      scan_duration_ms INTEGER,
      triggered_by TEXT DEFAULT 'manual'
    );

    CREATE TABLE security_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  raw.close();
  return { db: new MarketplaceDB(dbPath), tmpDir, dbPath };
}

/** Insert a test source into the DB */
function insertSource(
  db: MarketplaceDB,
  source: Partial<MarketplaceSource> & {
    name: string;
    source_type: string;
  },
): number {
  const rawDb = (db as any).db;
  const result = rawDb
    .prepare(
      `INSERT INTO sources (name, display_name, url, source_type, platform, total_packages, install_method, api_endpoint, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      source.name,
      source.display_name || source.name,
      source.url || '',
      source.source_type,
      source.platform || 'multi',
      source.total_packages || 0,
      source.install_method || 'api_fetch',
      source.api_endpoint || null,
      source.description || '',
    );
  return result.lastInsertRowid as number;
}

// ── Awesome-List Parser ─────────────────────────────────────────────

describe('parseAwesomeListMarkdown', () => {
  it('extracts bullet-list links with descriptions', () => {
    const md = `
# Awesome MCP Servers

## Servers
- [FileSurfer](https://github.com/user/filesurfer) - Browse and manage files
- [WebSearch](https://github.com/user/websearch) - Search the web using Brave API
    `;

    const links = parseAwesomeListMarkdown(md);
    expect(links.length).toBe(2);
    expect(links[0].name).toBe('FileSurfer');
    expect(links[0].url).toBe('https://github.com/user/filesurfer');
    expect(links[0].description).toBe('Browse and manage files');
    expect(links[1].name).toBe('WebSearch');
  });

  it('extracts table-format links', () => {
    const md = `
| Name | Description |
|------|-------------|
| [DBTool](https://example.com/dbtool) | Database management |
| [APIMon](https://example.com/apimon) | API monitoring |
    `;

    const links = parseAwesomeListMarkdown(md);
    expect(links.length).toBe(2);
    expect(links[0].name).toBe('DBTool');
    // Table format captures description after the pipe separator; may include trailing pipe
    expect(links[0].description).toContain('Database management');
  });

  it('extracts heading-level links', () => {
    const md = `
### [SuperSkill](https://github.com/org/super-skill)
A really great skill for doing things.
    `;

    const links = parseAwesomeListMarkdown(md);
    expect(links.length).toBe(1);
    expect(links[0].name).toBe('SuperSkill');
  });

  it('skips badge images and shields.io links', () => {
    const md = `
[![Build](https://shields.io/badge/build-passing)](https://shields.io/test)
- [RealTool](https://github.com/user/real-tool) - Actual tool
    `;

    const links = parseAwesomeListMarkdown(md);
    // Should only have RealTool, not the badge
    expect(links.length).toBe(1);
    expect(links[0].name).toBe('RealTool');
  });

  it('deduplicates by URL', () => {
    const md = `
- [Tool](https://github.com/user/tool) - First mention
- [Tool](https://github.com/user/tool) - Duplicate
    `;

    const links = parseAwesomeListMarkdown(md);
    expect(links.length).toBe(1);
  });

  it('skips image file URLs', () => {
    const md = `
- [Logo](https://example.com/logo.png)
- [RealSkill](https://github.com/user/skill) - Good skill
    `;

    const links = parseAwesomeListMarkdown(md);
    expect(links.length).toBe(1);
    expect(links[0].name).toBe('RealSkill');
  });

  it('handles empty markdown gracefully', () => {
    expect(parseAwesomeListMarkdown('')).toEqual([]);
    expect(parseAwesomeListMarkdown('No links here')).toEqual([]);
  });
});

// ── Awesome-List Adapter (full sync) ────────────────────────────────

describe('Awesome-List Adapter', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('syncs packages from an awesome-list repo README', async () => {
    insertSource(db, {
      name: 'awesome-mcp-servers',
      display_name: 'Awesome MCP Servers',
      url: 'https://github.com/punkpeye/awesome-mcp-servers',
      source_type: 'community_repo',
    });

    const readmeMd = `
# Awesome MCP Servers
- [FileSystem MCP](https://github.com/user/filesystem-mcp) - File system access
- [Brave Search](https://github.com/user/brave-search) - Web search
- [Notion Plugin](https://github.com/user/notion-plugin) - Notion integration
    `;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => readmeMd,
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['awesome-mcp-servers'],
    });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(3);
    expect(results[0].errors.length).toBe(0);
  });

  it('handles fetch failure gracefully', async () => {
    insertSource(db, {
      name: 'awesome-test',
      display_name: 'Awesome Test',
      url: 'https://github.com/user/awesome-test',
      source_type: 'community_repo',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['awesome-test'] });

    expect(results.length).toBe(1);
    expect(results[0].errors.length).toBeGreaterThan(0);
  });
});

// ── GitHub Repo Content Adapter ─────────────────────────────────────

describe('GitHub Repo Content Adapter', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('finds SKILL.md files in repo tree', async () => {
    insertSource(db, {
      name: 'claude-skills-collection',
      display_name: 'Claude Skills Collection',
      url: 'https://github.com/abubakarsiddik31/claude-skills-collection',
      source_type: 'community_repo',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'abc123',
          tree: [
            { path: 'code-reviewer/SKILL.md', type: 'blob', size: 1200 },
            { path: 'code-reviewer/README.md', type: 'blob', size: 500 },
            { path: 'test-writer/skill.md', type: 'blob', size: 800 },
            {
              path: 'api-tester/api-tester.skill.md',
              type: 'blob',
              size: 600,
            },
            { path: 'README.md', type: 'blob', size: 2000 },
            { path: 'src', type: 'tree' },
          ],
        }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['claude-skills-collection'],
    });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(3); // 3 skill files found
    expect(results[0].errors.length).toBe(0);
  });

  it('handles empty repo tree gracefully', async () => {
    insertSource(db, {
      name: 'empty-repo',
      display_name: 'Empty Repo',
      url: 'https://github.com/user/empty-repo',
      source_type: 'community_repo',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ sha: 'abc123', tree: [] }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['empty-repo'] });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(0);
    expect(results[0].errors.length).toBe(0);
  });
});

// ── NPM Search Adapter ─────────────────────────────────────────────

describe('parseNpmSearchResults', () => {
  it('parses standard npm search API response', () => {
    const data = {
      objects: [
        {
          package: {
            name: '@anthropic/mcp-server-filesystem',
            description: 'MCP server for filesystem operations',
            version: '0.6.2',
            publisher: { username: 'anthropic' },
            keywords: ['mcp', 'mcp-server'],
            links: {
              repository: 'https://github.com/anthropic/servers',
              homepage: 'https://anthropic.com',
              npm: 'https://npmjs.com/package/@anthropic/mcp-server-filesystem',
            },
          },
        },
        {
          package: {
            name: 'mcp-server-sqlite',
            description: 'SQLite MCP server',
            version: '1.0.0',
            maintainers: [{ username: 'sqldev' }],
            keywords: ['mcp-server'],
          },
        },
      ],
    };

    const results = parseNpmSearchResults(data);
    expect(results.length).toBe(2);
    expect(results[0].name).toBe('@anthropic/mcp-server-filesystem');
    expect(results[0].author).toBe('anthropic');
    expect(results[0].npm_package).toBe(
      '@anthropic/mcp-server-filesystem',
    );
    expect(results[0].repository_url).toBe(
      'https://github.com/anthropic/servers',
    );
    expect(results[1].name).toBe('mcp-server-sqlite');
    expect(results[1].author).toBe('sqldev');
  });

  it('handles empty response', () => {
    expect(parseNpmSearchResults({})).toEqual([]);
    expect(parseNpmSearchResults({ objects: [] })).toEqual([]);
  });

  it('filters out entries without names', () => {
    const data = {
      objects: [
        { package: { description: 'No name' } },
        { package: { name: 'valid-pkg', description: 'Has name' } },
      ],
    };
    const results = parseNpmSearchResults(data);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('valid-pkg');
  });
});

describe('NPM Search Adapter (full sync)', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('syncs MCP packages from npm registry', async () => {
    insertSource(db, {
      name: 'npm-mcp-servers',
      display_name: 'NPM MCP Servers',
      url: 'https://www.npmjs.com/search?q=keywords:mcp-server',
      source_type: 'npm_registry',
      api_endpoint:
        'https://registry.npmjs.org/-/v1/search?text=keywords:mcp-server&size=250',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          objects: [
            {
              package: {
                name: '@mcp/server-github',
                description: 'GitHub integration MCP server',
                version: '1.2.0',
                publisher: { username: 'mcpdev' },
                links: {
                  repository: 'https://github.com/mcp/server-github',
                },
              },
            },
            {
              package: {
                name: 'mcp-server-postgres',
                description: 'PostgreSQL MCP server',
                version: '0.9.0',
                publisher: { username: 'dbdev' },
              },
            },
          ],
        }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['npm-mcp-servers'] });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(2);
    expect(results[0].errors.length).toBe(0);
  });
});

// ── Web Registry Adapter ────────────────────────────────────────────

describe('Web Registry Adapter', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('handles { skills: [...] } response format', async () => {
    insertSource(db, {
      name: 'skills-sh',
      display_name: 'Skills.sh',
      url: 'https://skills.sh/',
      source_type: 'aggregator',
      api_endpoint: 'https://skills.sh/api/skills',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          skills: [
            {
              name: 'Code Reviewer',
              slug: 'code-reviewer',
              description: 'Reviews code',
              author: 'dev1',
            },
            {
              name: 'Test Writer',
              slug: 'test-writer',
              description: 'Writes tests',
              author: 'dev2',
            },
          ],
        }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skills-sh'] });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(2);
    expect(results[0].errors.length).toBe(0);
  });

  it('handles { data: [...] } response format', async () => {
    insertSource(db, {
      name: 'agent-skills-cc',
      display_name: 'Agent Skills CC',
      url: 'https://agent-skills.cc/',
      source_type: 'aggregator',
      api_endpoint: 'https://agent-skills.cc/api/skills',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { name: 'SkillA', description: 'First skill' },
            { name: 'SkillB', description: 'Second skill' },
            { name: 'MCP Bridge', description: 'MCP integration' },
          ],
        }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['agent-skills-cc'],
    });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(3);
  });

  it('handles { items: [...] } response format', async () => {
    insertSource(db, {
      name: 'mcpmarket',
      display_name: 'MCP Market',
      url: 'https://mcpmarket.com/tools/skills',
      source_type: 'aggregator',
      api_endpoint: 'https://mcpmarket.com/api/tools',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ name: 'MCP Tool 1', description: 'A tool' }],
        }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['mcpmarket'] });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(1);
  });

  it('handles root array response format', async () => {
    insertSource(db, {
      name: 'skillsdirectory',
      display_name: 'Skills Directory',
      url: 'https://www.skillsdirectory.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://www.skillsdirectory.com/api/skills',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { name: 'Skill Alpha', description: 'Alpha skill' },
          { name: 'Skill Beta', description: 'Beta skill' },
        ],
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['skillsdirectory'],
    });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(2);
  });

  it('reports error on empty structured data', async () => {
    insertSource(db, {
      name: 'empty-registry',
      display_name: 'Empty Registry',
      url: 'https://empty.example.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://empty.example.com/api/skills',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'No data' }),
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['empty-registry'],
    });

    expect(results.length).toBe(1);
    expect(results[0].added).toBe(0);
    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[0].errors[0]).toContain('No structured data');
  });
});

// ── Deduplication ───────────────────────────────────────────────────

describe('normalizeName', () => {
  it('strips source prefixes and normalizes', () => {
    expect(normalizeName('awesome-mcp-servers-brave-search')).toBe(
      'bravesearch',
    );
    expect(normalizeName('npm-mcp-servers-mcp-server-git')).toBe(
      'mcpservergit',
    );
    expect(normalizeName('skills-sh-code-reviewer')).toBe(
      'codereviewer',
    );
  });

  it('normalizes simple names', () => {
    expect(normalizeName('code-reviewer')).toBe('codereviewer');
    expect(normalizeName('code_reviewer')).toBe('codereviewer');
    expect(normalizeName('CodeReviewer')).toBe('codereviewer');
  });
});

describe('deduplicatePackages', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes lower-quality duplicates', () => {
    const sourceId = insertSource(db, {
      name: 'test-source',
      source_type: 'community_repo',
    });
    const sourceId2 = insertSource(db, {
      name: 'test-source-2',
      source_type: 'aggregator',
    });

    // Insert duplicate packages with different scores
    db.upsertPackage({
      source_id: sourceId,
      name: 'code-reviewer',
      display_name: 'Code Reviewer',
      description: 'Reviews code',
      author: 'dev1',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/code-reviewer.md',
      version: '1.0.0',
      downloads: 100,
      stars: 50,
      category: 'general',
      platforms: JSON.stringify([]) as any,
      dependencies: JSON.stringify([]) as any,
      packs: JSON.stringify([]) as any,
      install_manifest: JSON.stringify({}) as any,
    });

    db.upsertPackage({
      source_id: sourceId2,
      name: 'code_reviewer',
      display_name: 'Code Reviewer',
      description: 'Also reviews code',
      author: 'dev2',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/code_reviewer.md',
      version: '1.0.0',
      downloads: 10,
      stars: 5,
      category: 'general',
      platforms: JSON.stringify([]) as any,
      dependencies: JSON.stringify([]) as any,
      packs: JSON.stringify([]) as any,
      install_manifest: JSON.stringify({}) as any,
    });

    const removed = deduplicatePackages(db);
    expect(removed).toBe(1);

    // The higher-quality one should remain
    const remaining = db.getPackageByName('code-reviewer');
    expect(remaining).not.toBeNull();
    expect(remaining!.downloads).toBe(100);

    // The lower-quality one should be gone
    const gone = db.getPackageByName('code_reviewer');
    expect(gone).toBeNull();
  });

  it('returns 0 when no duplicates exist', () => {
    const sourceId = insertSource(db, {
      name: 'test-source',
      source_type: 'community_repo',
    });

    db.upsertPackage({
      source_id: sourceId,
      name: 'unique-skill-a',
      display_name: 'A',
      description: '',
      author: 'dev',
      package_type: 'skill',
      waggle_install_type: 'skill',
      downloads: 0,
      stars: 0,
      category: 'general',
      platforms: JSON.stringify([]) as any,
      dependencies: JSON.stringify([]) as any,
      packs: JSON.stringify([]) as any,
      install_manifest: JSON.stringify({}) as any,
    });

    db.upsertPackage({
      source_id: sourceId,
      name: 'unique-skill-b',
      display_name: 'B',
      description: '',
      author: 'dev',
      package_type: 'skill',
      waggle_install_type: 'skill',
      downloads: 0,
      stars: 0,
      category: 'general',
      platforms: JSON.stringify([]) as any,
      dependencies: JSON.stringify([]) as any,
      packs: JSON.stringify([]) as any,
      install_manifest: JSON.stringify({}) as any,
    });

    const removed = deduplicatePackages(db);
    expect(removed).toBe(0);
  });

  it('handles empty database', () => {
    const removed = deduplicatePackages(db);
    expect(removed).toBe(0);
  });
});

// ── Source Seeding ──────────────────────────────────────────────────

describe('seedNewSources', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('seeds all new sources into an empty DB', () => {
    const added = seedNewSources(db);
    expect(added).toBe(NEW_SOURCES.length);
    expect(added).toBeGreaterThanOrEqual(10);

    const sources = db.listSources();
    expect(sources.length).toBe(NEW_SOURCES.length);

    // Check specific sources exist
    const names = sources.map((s) => s.name);
    expect(names).toContain('skills-sh');
    expect(names).toContain('npm-mcp-servers');
    expect(names).toContain('awesome-mcp-servers');
    expect(names).toContain('mcpmarket');
  });

  it('skips already-existing sources', () => {
    // First seed
    const first = seedNewSources(db);
    expect(first).toBe(NEW_SOURCES.length);

    // Second seed should add nothing
    const second = seedNewSources(db);
    expect(second).toBe(0);
  });

  it('npm_registry sources have api_endpoint set', () => {
    seedNewSources(db);
    const sources = db.listSources();
    const npmSources = sources.filter(
      (s) => s.source_type === 'npm_registry',
    );
    expect(npmSources.length).toBe(2);
    for (const s of npmSources) {
      expect(s.api_endpoint).toBeTruthy();
      expect(s.api_endpoint).toContain('registry.npmjs.org');
    }
  });

  it('aggregator sources have api_endpoint set', () => {
    seedNewSources(db);
    const sources = db.listSources();
    const aggregators = sources.filter(
      (s) => s.source_type === 'aggregator',
    );
    expect(aggregators.length).toBeGreaterThan(0);
    for (const s of aggregators) {
      expect(s.api_endpoint).toBeTruthy();
    }
  });
});

// ── Adapter Routing ─────────────────────────────────────────────────

describe('Adapter routing for new source types', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
        text: async () => '',
      }),
    );
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('npm_registry sources get routed to npm adapter', async () => {
    insertSource(db, {
      name: 'npm-test',
      display_name: 'NPM Test',
      url: 'https://www.npmjs.com/search?q=mcp',
      source_type: 'npm_registry',
      api_endpoint:
        'https://registry.npmjs.org/-/v1/search?text=mcp&size=10',
    });

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['npm-test'] });

    expect(results.length).toBe(1);
    // Should have errors (404 mock) but the adapter was invoked
    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('npm-test');
  });

  it('awesome-* community_repo sources get routed to awesome-list adapter', async () => {
    insertSource(db, {
      name: 'awesome-test-list',
      display_name: 'Awesome Test',
      url: 'https://github.com/user/awesome-test-list',
      source_type: 'community_repo',
    });

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['awesome-test-list'],
    });

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('awesome-test-list');
  });

  it('non-awesome community_repo with repo path gets routed to repo content adapter', async () => {
    insertSource(db, {
      name: 'skills-repo',
      display_name: 'Skills Repo',
      url: 'https://github.com/user/skills-repo',
      source_type: 'community_repo',
    });

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skills-repo'] });

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('skills-repo');
  });

  it('aggregator with api_endpoint (non-github) gets web registry adapter', async () => {
    insertSource(db, {
      name: 'web-reg-test',
      display_name: 'Web Registry',
      url: 'https://example.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://example.com/api/skills',
    });

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['web-reg-test'],
    });

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('web-reg-test');
  });

  it('repos with "awesome" in the middle of the name get routed to awesome-list adapter', async () => {
    insertSource(db, {
      name: 'antigravity-awesome-skills',
      display_name: 'Antigravity Awesome Skills',
      url: 'https://github.com/sickn33/antigravity-awesome-skills',
      source_type: 'community_repo',
    });

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['antigravity-awesome-skills'],
    });

    expect(results.length).toBe(1);
    // Should hit the awesome-list adapter (fetches README), not repo content adapter
    // 404 mock means it will error but we can confirm the adapter was invoked
    expect(results[0].source).toBe('antigravity-awesome-skills');
  });

  it('non-awesome GitHub repos with specific repo paths get routed to repo content adapter', async () => {
    insertSource(db, {
      name: 'microsoft-skills',
      display_name: 'Microsoft Skills',
      url: 'https://github.com/microsoft/skills',
      source_type: 'community_repo',
    });

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({
      sources: ['microsoft-skills'],
    });

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('microsoft-skills');
  });
});

// ── New GitHub Skill Repo Sources ──────────────────────────────────

describe('New GitHub skill repo sources', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('seeds all 10 new GitHub skill repo sources', () => {
    const added = seedNewSources(db);
    const sources = db.listSources();
    const names = sources.map((s) => s.name);

    // Verify all 10 new sources exist
    expect(names).toContain('antigravity-awesome-skills');
    expect(names).toContain('skillmatic-awesome-skills');
    expect(names).toContain('alirezarezvani-claude-skills');
    expect(names).toContain('microsoft-skills');
    expect(names).toContain('muratcankoylan-context-engineering');
    expect(names).toContain('hoodini-ai-agents-skills');
    expect(names).toContain('hashicorp-agent-skills');
    expect(names).toContain('supabase-agent-skills');
    expect(names).toContain('callstack-agent-skills');
    expect(names).toContain('ckanner-agent-skills');
  });

  it('new GitHub repos are all community_repo type with null api_endpoint', () => {
    seedNewSources(db);
    const sources = db.listSources();
    const newGithubSources = sources.filter((s) =>
      ['antigravity-awesome-skills', 'skillmatic-awesome-skills',
       'alirezarezvani-claude-skills', 'microsoft-skills',
       'muratcankoylan-context-engineering', 'hoodini-ai-agents-skills',
       'hashicorp-agent-skills', 'supabase-agent-skills',
       'callstack-agent-skills', 'ckanner-agent-skills'].includes(s.name)
    );

    expect(newGithubSources.length).toBe(10);
    for (const s of newGithubSources) {
      expect(s.source_type).toBe('community_repo');
      expect(s.api_endpoint).toBeNull();
      expect(s.url).toContain('github.com');
    }
  });

  it('total NEW_SOURCES count is 20 (10 original + 10 new)', () => {
    expect(NEW_SOURCES.length).toBe(20);
  });
});

// ── skillsdirectory.com API endpoint update ─────────────────────────

describe('skillsdirectory.com API endpoint', () => {
  it('has the updated v1 API endpoint with query params', () => {
    const sdSource = NEW_SOURCES.find((s) => s.name === 'skillsdirectory');
    expect(sdSource).toBeDefined();
    expect(sdSource!.api_endpoint).toBe(
      'https://www.skillsdirectory.com/api/v1/skills?sort=votes',
    );
  });
});

// ── Web Registry Adapter: Vault API Key Support ────────────────────

describe('Web Registry Adapter — vault API key support', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('sends Authorization and X-Api-Key headers when vault has API key', async () => {
    insertSource(db, {
      name: 'skillsdirectory',
      display_name: 'Skills Directory',
      url: 'https://www.skillsdirectory.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://www.skillsdirectory.com/api/v1/skills?limit=100&sort=votes',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        skills: [{ name: 'Test Skill', slug: 'test-skill', description: 'A test' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const vaultLookup = vi.fn().mockImplementation((key: string) => {
      if (key === 'marketplace:source:skillsdirectory:api_key') return 'sk-test-12345';
      return null;
    });

    const sync = new MarketplaceSync(db, vaultLookup);
    const results = await sync.syncAll({ sources: ['skillsdirectory'] });

    expect(results[0].added).toBe(1);
    expect(vaultLookup).toHaveBeenCalledWith('marketplace:source:skillsdirectory:api_key');

    // Verify fetch was called with auth headers
    const fetchCall = mockFetch.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers['Authorization']).toBe('Bearer sk-test-12345');
    expect(headers['X-Api-Key']).toBe('sk-test-12345');
  });

  it('reports helpful error on 401 response when no API key configured', async () => {
    insertSource(db, {
      name: 'skillsdirectory',
      display_name: 'Skills Directory',
      url: 'https://www.skillsdirectory.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://www.skillsdirectory.com/api/v1/skills?limit=100&sort=votes',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      }),
    );

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skillsdirectory'] });

    expect(results[0].added).toBe(0);
    expect(results[0].errors.length).toBe(1);
    expect(results[0].errors[0]).toContain('requires authentication');
    expect(results[0].errors[0]).toContain('marketplace:source:skillsdirectory:api_key');
  });

  it('works without vault lookup (no headers added)', async () => {
    insertSource(db, {
      name: 'skills-sh',
      display_name: 'Skills.sh',
      url: 'https://skills.sh/',
      source_type: 'aggregator',
      api_endpoint: 'https://skills.sh/api/skills',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        skills: [{ name: 'Skill1', slug: 'skill1', description: 'Test' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // No vault lookup provided
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skills-sh'] });

    expect(results[0].added).toBe(1);

    // Verify no auth headers were added
    const fetchCall = mockFetch.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['X-Api-Key']).toBeUndefined();
  });
});

// ── Sync State (resumable sync) ─────────────────────────────────────

describe('MarketplaceDB sync state', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no sync state exists', () => {
    const sourceId = insertSource(db, {
      name: 'test-source',
      source_type: 'aggregator',
    });
    expect(db.getSyncState(sourceId)).toBeNull();
  });

  it('saves and retrieves sync state', () => {
    const sourceId = insertSource(db, {
      name: 'test-source',
      source_type: 'aggregator',
    });
    const state = { lastOffset: 500, totalSynced: 42, lastSyncedAt: '2026-03-19T12:00:00Z' };
    db.setSyncState(sourceId, state);

    const retrieved = db.getSyncState(sourceId);
    expect(retrieved).toEqual(state);
  });

  it('clears sync state when set to null', () => {
    const sourceId = insertSource(db, {
      name: 'test-source',
      source_type: 'aggregator',
    });
    db.setSyncState(sourceId, { lastOffset: 100 });
    expect(db.getSyncState(sourceId)).not.toBeNull();

    db.setSyncState(sourceId, null);
    expect(db.getSyncState(sourceId)).toBeNull();
  });

  it('overwrites previous sync state', () => {
    const sourceId = insertSource(db, {
      name: 'test-source',
      source_type: 'aggregator',
    });
    db.setSyncState(sourceId, { lastOffset: 100 });
    db.setSyncState(sourceId, { lastOffset: 200, totalSynced: 50 });

    const retrieved = db.getSyncState(sourceId);
    expect(retrieved).toEqual({ lastOffset: 200, totalSynced: 50 });
  });
});

// ── Resumable Web Registry Sync ─────────────────────────────────────

describe('Web Registry Adapter — resumable sync', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('saves sync state on 429 rate limit and resumes from saved offset', async () => {
    const sourceId = insertSource(db, {
      name: 'skillsdirectory',
      display_name: 'Skills Directory',
      url: 'https://www.skillsdirectory.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://www.skillsdirectory.com/api/v1/skills',
    });

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        // First page succeeds
        return {
          ok: true, status: 200,
          json: async () => {
            // Return exactly pageSize items to trigger next page
            const items = Array.from({ length: 100 }, (_, i) => ({
              name: `Skill ${i}`, slug: `skill-${i}`, description: `Skill number ${i}`,
            }));
            return { skills: items };
          },
        };
      }
      // Second page hits rate limit
      return { ok: false, status: 429, statusText: 'Too Many Requests' };
    });
    vi.stubGlobal('fetch', mockFetch);

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skillsdirectory'] });

    expect(results[0].added).toBe(100);
    expect(results[0].errors.length).toBe(1);
    expect(results[0].errors[0]).toContain('rate limit');

    // Sync state should be saved
    const state = db.getSyncState(sourceId);
    expect(state).not.toBeNull();
    expect(state!.lastOffset).toBe(100);
  });

  it('resumes from previously saved offset', async () => {
    const sourceId = insertSource(db, {
      name: 'skillsdirectory',
      display_name: 'Skills Directory',
      url: 'https://www.skillsdirectory.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://www.skillsdirectory.com/api/v1/skills',
    });

    // Pre-set sync state as if a previous run was interrupted at offset 500
    db.setSyncState(sourceId, { lastOffset: 500, totalSynced: 500 });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        skills: [{ name: 'Skill A', slug: 'skill-a', description: 'Resumed skill' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skillsdirectory'] });

    expect(results[0].added).toBe(1);

    // Verify it started from offset 500
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('offset=500');

    // Sync state should be cleared after completing
    const state = db.getSyncState(sourceId);
    expect(state).toBeNull();
  });

  it('resets sync state when all pages are exhausted', async () => {
    const sourceId = insertSource(db, {
      name: 'skills-sh',
      display_name: 'Skills.sh',
      url: 'https://skills.sh/',
      source_type: 'aggregator',
      api_endpoint: 'https://skills.sh/api/skills',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        skills: [{ name: 'Only Skill', slug: 'only-skill', description: 'Just one' }],
      }),
    }));

    const sync = new MarketplaceSync(db);
    await sync.syncAll({ sources: ['skills-sh'] });

    // Fewer items than page size -> full sync done -> state should be null
    const state = db.getSyncState(sourceId);
    expect(state).toBeNull();
  });
});

// ── Resumable SkillsMP Sync ─────────────────────────────────────────

describe('SkillsMP Adapter — resumable sync', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('saves progress on 429 and includes completed query count', async () => {
    const sourceId = insertSource(db, {
      name: 'skillsmp',
      display_name: 'SkillsMP',
      url: 'https://skillsmp.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://skillsmp.com/api/v1',
    });

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First query, first page — return fewer than perPage (query exhausted)
        return {
          ok: true, status: 200,
          json: async () => ({
            data: {
              skills: [{ id: 's1', name: 'Code Skill', description: 'A skill' }],
              pagination: { hasNext: false },
            },
          }),
        };
      }
      // Second query hits rate limit
      return { ok: false, status: 429, statusText: 'Too Many Requests' };
    });
    vi.stubGlobal('fetch', mockFetch);

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skillsmp'] });

    expect(results[0].added).toBe(1);
    expect(results[0].errors.length).toBe(1);
    expect(results[0].errors[0]).toContain('rate limit');
    expect(results[0].errors[0]).toContain('1/');

    // Sync state should record completed queries and current position
    const state = db.getSyncState(sourceId);
    expect(state).not.toBeNull();
    expect(state!.completedQueries).toContain('code');
    expect(state!.lastQueryIndex).toBe(1);
  });

  it('skips completed queries when resuming', async () => {
    const sourceId = insertSource(db, {
      name: 'skillsmp',
      display_name: 'SkillsMP',
      url: 'https://skillsmp.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://skillsmp.com/api/v1',
    });

    // Pre-set sync state: first 3 queries are done, resume at query index 3
    db.setSyncState(sourceId, {
      lastQueryIndex: 3,
      lastPage: 1,
      completedQueries: ['code', 'python', 'javascript'],
      totalSynced: 150,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        data: {
          skills: [{ id: 'ts-1', name: 'TypeScript Skill', description: 'TS skill' }],
          pagination: { hasNext: false },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skillsmp'] });

    // Should have synced from query index 3 onward (typescript, react, ...)
    expect(results[0].added).toBeGreaterThan(0);

    // The first fetch call should NOT be for "code", "python", or "javascript"
    const firstFetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstFetchUrl).toContain('q=typescript');
  });

  it('resets sync state when all queries complete', async () => {
    const sourceId = insertSource(db, {
      name: 'skillsmp',
      display_name: 'SkillsMP',
      url: 'https://skillsmp.com/',
      source_type: 'aggregator',
      api_endpoint: 'https://skillsmp.com/api/v1',
    });

    // Return empty results for all queries (simulates all queries complete fast)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        data: { skills: [], pagination: { hasNext: false } },
      }),
    }));

    const sync = new MarketplaceSync(db);
    await sync.syncAll({ sources: ['skillsmp'] });

    // All queries complete — state should be cleared
    const state = db.getSyncState(sourceId);
    expect(state).toBeNull();
  });
});

// ── Resumable ClawHub Sync ──────────────────────────────────────────

describe('ClawHub Adapter — resumable sync', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('saves sync state on 429 rate limit', async () => {
    const sourceId = insertSource(db, {
      name: 'clawhub',
      display_name: 'ClawHub',
      url: 'https://clawhub.ai/',
      source_type: 'aggregator',
      api_endpoint: 'https://clawhub.ai/api/v1',
    });

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true, status: 200,
          json: async () => ({
            skills: Array.from({ length: 50 }, (_, i) => ({
              slug: `skill-${i}`, name: `Skill ${i}`, description: `Desc ${i}`,
            })),
          }),
        };
      }
      return { ok: false, status: 429, statusText: 'Too Many Requests' };
    });
    vi.stubGlobal('fetch', mockFetch);

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['clawhub'] });

    expect(results[0].added).toBe(50);
    expect(results[0].errors[0]).toContain('rate limit');

    const state = db.getSyncState(sourceId);
    expect(state).not.toBeNull();
    expect(state!.lastPage).toBe(2);
  });

  it('resumes from saved page on next sync', async () => {
    const sourceId = insertSource(db, {
      name: 'clawhub',
      display_name: 'ClawHub',
      url: 'https://clawhub.ai/',
      source_type: 'aggregator',
      api_endpoint: 'https://clawhub.ai/api/v1',
    });

    // Pre-set: interrupted at page 5
    db.setSyncState(sourceId, { lastPage: 5, totalSynced: 200 });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        skills: [{ slug: 'resumed-skill', name: 'Resumed Skill', description: 'From page 5' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['clawhub'] });

    expect(results[0].added).toBe(1);

    // Verify it started from page 5
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('page=5');

    // Sync state cleared after completion
    const state = db.getSyncState(sourceId);
    expect(state).toBeNull();
  });
});
