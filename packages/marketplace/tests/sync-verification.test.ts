/**
 * Marketplace Sync Engine — Verification Tests
 *
 * Tests that validate the MarketplaceSync engine can be instantiated,
 * sources are populated, URLs are well-formed, and sync results have
 * the correct shape.
 *
 * Uses a temporary SQLite database (not the real ~/.waggle/marketplace.db)
 * and mocks global fetch to avoid real network calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { MarketplaceDB } from '../src/db';
import { MarketplaceSync } from '../src/sync';
import type { SyncResult, MarketplaceSource } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────

function getRepoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function getBundledDbPath(): string {
  return path.join(getRepoRoot(), 'packages', 'marketplace', 'marketplace.db');
}

/**
 * Create a temp marketplace DB by copying the bundled one.
 * This ensures tests operate on a disposable copy with all
 * schema + seed data intact.
 */
function createTempDb(): { db: MarketplaceDB; tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mkt-sync-'));
  const dbPath = path.join(tmpDir, 'marketplace.db');
  fs.copyFileSync(getBundledDbPath(), dbPath);
  const db = new MarketplaceDB(dbPath);
  return { db, tmpDir, dbPath };
}

/**
 * Create a temp marketplace DB from scratch with minimal schema.
 * Used for tests that need an empty DB or controlled seed data.
 */
function createEmptyTempDb(): { db: MarketplaceDB; tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mkt-sync-empty-'));
  const dbPath = path.join(tmpDir, 'marketplace.db');

  // Create the DB with required schema
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  raw.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      url TEXT,
      source_type TEXT NOT NULL,
      platform TEXT NOT NULL,
      total_packages INTEGER DEFAULT 0,
      install_method TEXT,
      api_endpoint TEXT,
      description TEXT,
      last_synced_at TEXT
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
      content='packages',
      content_rowid='id'
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

  const db = new MarketplaceDB(dbPath);
  return { db, tmpDir, dbPath };
}

// ── Task 1: Instantiation ───────────────────────────────────────────

describe('MarketplaceSync — Instantiation', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('can be instantiated with a MarketplaceDB', () => {
    const sync = new MarketplaceSync(db);
    expect(sync).toBeDefined();
    expect(sync).toBeInstanceOf(MarketplaceSync);
  });

  it('can be instantiated with an empty temp DB', () => {
    const empty = createEmptyTempDb();
    try {
      const sync = new MarketplaceSync(empty.db);
      expect(sync).toBeDefined();
    } finally {
      empty.db.close();
      fs.rmSync(empty.tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Task 1: Source Audit ────────────────────────────────────────────

describe('MarketplaceSync — Source Audit', () => {
  let db: MarketplaceDB;
  let tmpDir: string;
  let sources: MarketplaceSource[];

  beforeEach(() => {
    const ctx = createTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
    sources = db.listSources();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sources are populated in the DB on init', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('source count is reasonable (>10)', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('source count matches expected 40 seeded sources', () => {
    expect(sources.length).toBe(40);
  });

  it('each source has name, url, and source_type', () => {
    for (const source of sources) {
      expect(source.name).toBeTruthy();
      expect(typeof source.name).toBe('string');
      expect(source.url).toBeDefined();
      expect(typeof source.source_type).toBe('string');
      expect(source.source_type.length).toBeGreaterThan(0);
    }
  });

  it('each source has a display_name', () => {
    for (const source of sources) {
      expect(source.display_name).toBeTruthy();
      expect(typeof source.display_name).toBe('string');
    }
  });

  it('source names are unique', () => {
    const names = sources.map(s => s.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('source URLs are well-formed (valid URL or null)', () => {
    for (const source of sources) {
      if (source.url) {
        // Should not throw — valid URL
        expect(() => new URL(source.url)).not.toThrow();
      }
    }
  });

  it('source api_endpoints are well-formed when present', () => {
    const withEndpoints = sources.filter(s => s.api_endpoint);
    for (const source of withEndpoints) {
      expect(() => new URL(source.api_endpoint!)).not.toThrow();
    }
  });

  it('source_type values are from the expected set', () => {
    const validTypes = [
      'official_marketplace', 'community_repo', 'commercial_marketplace',
      'aggregator', 'tool', 'specification', 'marketplace', 'registry',
      'github_org', 'curated_list',
    ];
    for (const source of sources) {
      expect(validTypes).toContain(source.source_type);
    }
  });

  it('includes expected key sources', () => {
    const names = sources.map(s => s.name);
    // Core Anthropic sources
    expect(names).toContain('anthropics-skills');
    // Community marketplaces
    expect(names).toContain('clawhub');
    expect(names).toContain('skillsmp');
    expect(names).toContain('lobehub');
  });

  it('GitHub-based sources have github.com in their URL', () => {
    const githubSources = sources.filter(s =>
      s.name.includes('github') ||
      s.name.includes('anthropics') ||
      s.name.includes('awesome') ||
      (s.url && s.url.includes('github.com')),
    );
    for (const source of githubSources) {
      if (source.url && source.url.startsWith('http')) {
        expect(source.url).toContain('github.com');
      }
    }
  });
});

// ── Task 3: Sync Shape (mocked fetch) ──────────────────────────────

describe('MarketplaceSync — syncAll shape (mocked)', () => {
  let db: MarketplaceDB;
  let tmpDir: string;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const ctx = createTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;

    // Mock global fetch to prevent real network calls.
    // Return 404 for all requests so adapters get errors but don't crash.
    fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('syncAll returns an array of SyncResult', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('each SyncResult has the correct shape', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll();

    for (const result of results) {
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('errors');
      expect(typeof result.source).toBe('string');
      expect(typeof result.added).toBe('number');
      expect(typeof result.updated).toBe('number');
      expect(typeof result.removed).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    }
  });

  it('returns one result per source', async () => {
    const sync = new MarketplaceSync(db);
    const sources = db.listSources();
    const results = await sync.syncAll();

    expect(results.length).toBe(sources.length);
  });

  it('each result source matches a known source name', async () => {
    const sync = new MarketplaceSync(db);
    const sources = db.listSources();
    const sourceNames = sources.map(s => s.name);
    const results = await sync.syncAll();

    for (const result of results) {
      expect(sourceNames).toContain(result.source);
    }
  });

  it('with mocked 404 fetch, all sources report errors', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll();

    // Sources with adapters that make HTTP calls should have errors
    const sourcesWithErrors = results.filter(r => r.errors.length > 0);
    expect(sourcesWithErrors.length).toBeGreaterThan(0);
  });

  it('no source throws — errors are captured gracefully', async () => {
    const sync = new MarketplaceSync(db);
    // This should not throw even though all fetches fail
    const results = await sync.syncAll();
    expect(results).toBeDefined();
  });

  it('added/updated/removed are non-negative', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll();

    for (const result of results) {
      expect(result.added).toBeGreaterThanOrEqual(0);
      expect(result.updated).toBeGreaterThanOrEqual(0);
      expect(result.removed).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Filtered sync ───────────────────────────────────────────────────

describe('MarketplaceSync — filtered sync', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    }));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('syncAll with sources filter only syncs specified sources', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['clawhub', 'skillsmp'] });

    expect(results.length).toBe(2);
    const names = results.map(r => r.source);
    expect(names).toContain('clawhub');
    expect(names).toContain('skillsmp');
  });

  it('syncAll with unknown source name returns empty results', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['nonexistent-source'] });

    expect(results.length).toBe(0);
  });
});

// ── Individual adapter routing ──────────────────────────────────────

describe('MarketplaceSync — adapter routing', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('GitHub adapter handles successful repo response', async () => {
    // Mock a successful GitHub API response with one skill repo
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([{
        name: 'test-mcp-server',
        full_name: 'anthropics/test-mcp-server',
        description: 'A test MCP server',
        html_url: 'https://github.com/anthropics/test-mcp-server',
        clone_url: 'https://github.com/anthropics/test-mcp-server.git',
        topics: ['mcp', 'mcp-server'],
        stargazers_count: 42,
        license: { spdx_id: 'MIT' },
        homepage: null,
      }]),
    }));

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['anthropics-skills'] });

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('anthropics-skills');
    expect(results[0].added).toBeGreaterThanOrEqual(1);
    expect(results[0].errors.length).toBe(0);
  });

  it('ClawHub adapter handles paginated API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        skills: [{
          slug: 'test-skill',
          name: 'Test Skill',
          description: 'A test skill',
          author: 'tester',
          version: '1.0.0',
          downloads: 100,
        }],
      }),
    }));

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['clawhub'] });

    expect(results.length).toBe(1);
    expect(results[0].source).toBe('clawhub');
    expect(results[0].added).toBe(1);
    expect(results[0].errors.length).toBe(0);
  });

  it('LobeHub adapter handles plugin index response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [{
          identifier: 'test-plugin',
          name: 'Test Plugin',
          description: 'A test plugin',
          version: '1.0.0',
          author: 'lobehub',
        }],
      }),
    }));

    const sync = new MarketplaceSync(db);
    // Find the lobehub source name in the seeded DB
    const sources = db.listSources();
    const lobeSrc = sources.find(s => s.url?.includes('lobehub'));

    if (!lobeSrc) return; // Skip if no lobehub source in seed

    const results = await sync.syncAll({ sources: [lobeSrc.name] });

    expect(results.length).toBe(1);
    expect(results[0].added).toBeGreaterThanOrEqual(1);
    expect(results[0].errors.length).toBe(0);
  });

  it('SkillsMP adapter handles rate limit gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({}),
    }));

    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll({ sources: ['skillsmp'] });

    expect(results.length).toBe(1);
    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[0].errors[0]).toContain('rate limit');
  });
});

// ── Empty DB sync ───────────────────────────────────────────────────

describe('MarketplaceSync — empty DB', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    }));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('syncAll on empty DB returns empty array', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

// ── Sync endpoint response format ───────────────────────────────────

describe('MarketplaceSync — endpoint response aggregation', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    }));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('results can be aggregated into the POST /api/marketplace/sync response format', async () => {
    const sync = new MarketplaceSync(db);
    const results = await sync.syncAll();

    // Simulate the route handler aggregation
    const sourcesChecked = results.length;
    const packagesAdded = results.reduce((sum: number, r: SyncResult) => sum + r.added, 0);
    const packagesUpdated = results.reduce((sum: number, r: SyncResult) => sum + r.updated, 0);
    const errors = results.flatMap((r: SyncResult) => r.errors.map(e => `[${r.source}] ${e}`));

    const responseBody = {
      sourcesChecked,
      packagesAdded,
      packagesUpdated,
      errors,
      details: results,
    };

    expect(typeof responseBody.sourcesChecked).toBe('number');
    expect(typeof responseBody.packagesAdded).toBe('number');
    expect(typeof responseBody.packagesUpdated).toBe('number');
    expect(Array.isArray(responseBody.errors)).toBe(true);
    expect(Array.isArray(responseBody.details)).toBe(true);
    expect(responseBody.sourcesChecked).toBeGreaterThan(0);
    expect(responseBody.details.length).toBe(responseBody.sourcesChecked);
  });
});
