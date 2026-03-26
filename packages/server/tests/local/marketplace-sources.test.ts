/**
 * Marketplace Source Management — Tests
 *
 * Tests for user-defined source addition, listing, and deletion:
 * - addSource inserts a custom source
 * - listSourcesWithCounts returns package counts
 * - deleteSource removes custom sources but not built-in ones
 * - ensureIsCustomColumn is safe to call multiple times
 * - Enhanced search with sort parameter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { MarketplaceDB } from '@waggle/marketplace';

// ── Helpers ──────────────────────────────────────────────────────────

function createEmptyTempDb(): { db: MarketplaceDB; tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mkt-src-'));
  const dbPath = path.join(tmpDir, 'marketplace.db');

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
      last_synced_at TEXT,
      is_custom BOOLEAN DEFAULT 0
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

  // Seed a built-in source (is_custom = 0)
  raw.prepare(`
    INSERT INTO sources (name, display_name, url, source_type, platform, total_packages, is_custom)
    VALUES ('builtin-source', 'Built-in Source', 'https://example.com', 'marketplace', 'waggle', 5, 0)
  `).run();

  raw.close();

  const db = new MarketplaceDB(dbPath);
  return { db, tmpDir, dbPath };
}

// ── Source Management ────────────────────────────────────────────────

describe('MarketplaceDB -- Source Management', () => {
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

  // ── addSource ──────────────────────────────────────────────────────

  it('addSource inserts a custom source and returns its ID', () => {
    const id = db.addSource({
      name: 'my-skills',
      display_name: 'My Custom Skills',
      url: 'https://github.com/myuser/my-skills',
      source_type: 'community_repo',
    });

    expect(id).toBeGreaterThan(0);

    const source = db.getSource(id);
    expect(source).not.toBeNull();
    expect(source!.name).toBe('my-skills');
    expect(source!.display_name).toBe('My Custom Skills');
    expect(source!.url).toBe('https://github.com/myuser/my-skills');
    expect(source!.source_type).toBe('community_repo');
    expect(source!.is_custom).toBeTruthy();
  });

  it('addSource sets is_custom to true', () => {
    const id = db.addSource({
      name: 'custom-repo',
      display_name: 'Custom Repo',
      url: 'https://github.com/user/repo',
      source_type: 'community_repo',
    });

    const source = db.getSource(id);
    expect(source!.is_custom).toBeTruthy();
  });

  // ── getSourceByName ────────────────────────────────────────────────

  it('getSourceByName returns the correct source', () => {
    const source = db.getSourceByName('builtin-source');
    expect(source).not.toBeNull();
    expect(source!.name).toBe('builtin-source');
    expect(source!.display_name).toBe('Built-in Source');
  });

  it('getSourceByName returns null for non-existent name', () => {
    const source = db.getSourceByName('nonexistent');
    expect(source).toBeNull();
  });

  // ── listSources / listSourcesWithCounts ────────────────────────────

  it('listSources returns all sources', () => {
    db.addSource({
      name: 'custom-1',
      display_name: 'Custom 1',
      url: 'https://example.com/1',
      source_type: 'aggregator',
    });

    const sources = db.listSources();
    expect(sources.length).toBe(2); // 1 built-in + 1 custom
  });

  it('listSourcesWithCounts returns package_count', () => {
    // Add a custom source
    const sourceId = db.addSource({
      name: 'custom-with-packages',
      display_name: 'Custom With Packages',
      url: 'https://example.com/pkgs',
      source_type: 'aggregator',
    });

    // Add a package to this source
    db.upsertPackage({
      name: 'test-pkg',
      source_id: sourceId,
      display_name: 'Test Package',
      description: 'A test package',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/test.md',
      category: 'general',
      platforms: [],
      dependencies: [],
      packs: [],
    });

    const sources = db.listSourcesWithCounts();
    const customSrc = sources.find(s => s.name === 'custom-with-packages');
    expect(customSrc).toBeDefined();
    expect(customSrc!.package_count).toBe(1);
  });

  // ── deleteSource ───────────────────────────────────────────────────

  it('deleteSource removes a custom source', () => {
    const id = db.addSource({
      name: 'to-delete',
      display_name: 'To Delete',
      url: 'https://example.com/delete',
      source_type: 'aggregator',
    });

    const deleted = db.deleteSource(id);
    expect(deleted).toBe(true);

    const source = db.getSource(id);
    expect(source).toBeNull();
  });

  it('deleteSource removes packages belonging to the source', () => {
    const sourceId = db.addSource({
      name: 'to-delete-with-pkgs',
      display_name: 'To Delete With Packages',
      url: 'https://example.com/delete2',
      source_type: 'aggregator',
    });

    // Add packages to this source
    db.upsertPackage({
      name: 'pkg-to-delete',
      source_id: sourceId,
      display_name: 'Package To Delete',
      description: 'Will be deleted with source',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/delete.md',
      category: 'general',
      platforms: [],
      dependencies: [],
      packs: [],
    });

    expect(db.getPackageByName('pkg-to-delete')).not.toBeNull();

    db.deleteSource(sourceId);

    // Package should be gone too
    expect(db.getPackageByName('pkg-to-delete')).toBeNull();
  });

  it('deleteSource refuses to delete built-in source', () => {
    const builtIn = db.getSourceByName('builtin-source');
    expect(builtIn).not.toBeNull();

    const deleted = db.deleteSource(builtIn!.id);
    expect(deleted).toBe(false);

    // Source should still exist
    const stillThere = db.getSource(builtIn!.id);
    expect(stillThere).not.toBeNull();
  });

  it('deleteSource returns false for non-existent ID', () => {
    const deleted = db.deleteSource(99999);
    expect(deleted).toBe(false);
  });

  // ── ensureIsCustomColumn ───────────────────────────────────────────

  it('ensureIsCustomColumn is idempotent (safe to call multiple times)', () => {
    // Column already exists in our test schema
    expect(() => db.ensureIsCustomColumn()).not.toThrow();
    expect(() => db.ensureIsCustomColumn()).not.toThrow();
  });
});

// ── Enhanced Search with Sort ────────────────────────────────────────

describe('MarketplaceDB -- Enhanced Search', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;

    // Seed some packages with different attributes
    db.upsertPackage({
      name: 'alpha-skill',
      source_id: 1,
      display_name: 'Alpha Skill',
      description: 'First skill alphabetically',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/alpha.md',
      category: 'coding',
      downloads: 100,
      stars: 5,
      platforms: [],
      dependencies: [],
      packs: [],
    });

    db.upsertPackage({
      name: 'zeta-skill',
      source_id: 1,
      display_name: 'Zeta Skill',
      description: 'Last skill alphabetically',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/zeta.md',
      category: 'security',
      downloads: 500,
      stars: 20,
      platforms: [],
      dependencies: [],
      packs: [],
    });

    db.upsertPackage({
      name: 'beta-plugin',
      source_id: 1,
      display_name: 'Beta Plugin',
      description: 'A plugin for communication and Slack',
      author: 'tester',
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      waggle_install_path: 'plugins/beta/',
      category: 'communication',
      downloads: 250,
      stars: 10,
      platforms: [],
      dependencies: [],
      packs: [],
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('search returns installedCount in results', () => {
    const results = db.search({ limit: 10 });
    expect(results).toHaveProperty('installedCount');
    expect(typeof results.installedCount).toBe('number');
    expect(results.installedCount).toBe(0); // nothing installed
  });

  it('sort=popular orders by downloads DESC', () => {
    const results = db.search({ sort: 'popular', limit: 10 });
    expect(results.packages.length).toBe(3);
    expect(results.packages[0].name).toBe('zeta-skill'); // 500 downloads
    expect(results.packages[1].name).toBe('beta-plugin'); // 250 downloads
    expect(results.packages[2].name).toBe('alpha-skill'); // 100 downloads
  });

  it('sort=name orders alphabetically by display_name', () => {
    const results = db.search({ sort: 'name', limit: 10 });
    expect(results.packages.length).toBe(3);
    expect(results.packages[0].name).toBe('alpha-skill');
    expect(results.packages[1].name).toBe('beta-plugin');
    expect(results.packages[2].name).toBe('zeta-skill');
  });

  it('category filter works', () => {
    const results = db.search({ category: 'coding', limit: 10 });
    expect(results.packages.length).toBe(1);
    expect(results.packages[0].name).toBe('alpha-skill');
  });

  it('source filter works with source name', () => {
    const results = db.search({ source: 'builtin-source', limit: 10 });
    expect(results.packages.length).toBe(3); // all packages belong to source_id 1
  });

  it('facets include categories with counts', () => {
    const results = db.search({ limit: 10 });
    expect(results.facets.categories).toBeDefined();
    expect(results.facets.categories['coding']).toBe(1);
    expect(results.facets.categories['security']).toBe(1);
    expect(results.facets.categories['communication']).toBe(1);
  });

  it('type filter works', () => {
    const results = db.search({ type: 'plugin', limit: 10 });
    expect(results.packages.length).toBe(1);
    expect(results.packages[0].waggle_install_type).toBe('plugin');
  });

  it('getInstalledCount reflects actual installations', () => {
    expect(db.getInstalledCount()).toBe(0);
  });
});
