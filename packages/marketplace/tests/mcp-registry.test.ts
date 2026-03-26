/**
 * MCP Server Registry — Tests
 *
 * Validates:
 * - MCP_SERVERS has at least 15 entries
 * - Each entry has required fields (name, display_name, description, install_manifest)
 * - Each install_manifest has mcp_config with command and args
 * - seedMcpServers inserts into a temp DB correctly
 * - Duplicate seeding does not create duplicates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { MCP_SERVERS, seedMcpServers, type McpServerEntry } from '../src/mcp-registry';
import { MarketplaceDB } from '../src/db';

// ── Schema: Create a temp marketplace DB with the real schema ────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
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

CREATE TABLE IF NOT EXISTS packages (
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

CREATE TABLE IF NOT EXISTS packs (
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

CREATE TABLE IF NOT EXISTS pack_packages (
    pack_id INTEGER REFERENCES packs(id),
    package_id INTEGER REFERENCES packages(id),
    is_core BOOLEAN DEFAULT 0,
    PRIMARY KEY (pack_id, package_id)
);

CREATE TABLE IF NOT EXISTS installations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    installed_version TEXT NOT NULL,
    installed_at TEXT DEFAULT (datetime('now')),
    install_path TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    config JSON DEFAULT '{}'
);

CREATE VIRTUAL TABLE IF NOT EXISTS packages_fts USING fts5(
    name, display_name, description, author, category,
    content='packages',
    content_rowid='id'
);

CREATE TABLE IF NOT EXISTS scan_history (
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

CREATE TABLE IF NOT EXISTS security_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
`;

// ── Helpers ─────────────────────────────────────────────────────────

let tempDbPath: string;
let db: MarketplaceDB;

function createTempDb(): string {
  const tmpDir = os.tmpdir();
  const dbPath = path.join(tmpDir, `waggle-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const rawDb = new Database(dbPath);
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
  rawDb.exec(SCHEMA_SQL);
  rawDb.close();
  return dbPath;
}

// ── Static Data Validation ──────────────────────────────────────────

describe('MCP_SERVERS definitions', () => {
  it('has at least 15 MCP server entries', () => {
    expect(MCP_SERVERS.length).toBeGreaterThanOrEqual(15);
  });

  it('has at most 25 entries (reasonable catalog size)', () => {
    expect(MCP_SERVERS.length).toBeLessThanOrEqual(25);
  });

  it('every entry has name, display_name, description', () => {
    for (const server of MCP_SERVERS) {
      expect(typeof server.name).toBe('string');
      expect(server.name.length).toBeGreaterThan(0);

      expect(typeof server.display_name).toBe('string');
      expect(server.display_name.length).toBeGreaterThan(0);

      expect(typeof server.description).toBe('string');
      expect(server.description.length).toBeGreaterThan(10);
    }
  });

  it('every entry has install_manifest with mcp_config', () => {
    for (const server of MCP_SERVERS) {
      expect(server.install_manifest).toBeDefined();
      expect(server.install_manifest!.mcp_config).toBeDefined();

      const mcp = server.install_manifest!.mcp_config!;
      expect(typeof mcp.name).toBe('string');
      expect(mcp.name.length).toBeGreaterThan(0);

      expect(typeof mcp.command).toBe('string');
      expect(mcp.command.length).toBeGreaterThan(0);

      expect(Array.isArray(mcp.args)).toBe(true);
      expect(mcp.args.length).toBeGreaterThan(0);
    }
  });

  it('every install_manifest has npm_package', () => {
    for (const server of MCP_SERVERS) {
      expect(typeof server.install_manifest!.npm_package).toBe('string');
      expect(server.install_manifest!.npm_package!.length).toBeGreaterThan(0);
    }
  });

  it('all names are unique', () => {
    const names = MCP_SERVERS.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all names are kebab-case (no spaces or uppercase)', () => {
    for (const server of MCP_SERVERS) {
      expect(server.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every entry has waggle_install_type = mcp', () => {
    for (const server of MCP_SERVERS) {
      expect(server.waggle_install_type).toBe('mcp');
    }
  });

  it('every entry has package_type = mcp_server', () => {
    for (const server of MCP_SERVERS) {
      expect(server.package_type).toBe('mcp_server');
    }
  });

  it('every entry has a category', () => {
    for (const server of MCP_SERVERS) {
      expect(typeof server.category).toBe('string');
      expect(server.category!.length).toBeGreaterThan(0);
    }
  });

  it('covers expected categories', () => {
    const categories = new Set(MCP_SERVERS.map(s => s.category));
    expect(categories.has('developer-tools')).toBe(true);
    expect(categories.has('web')).toBe(true);
    expect(categories.has('productivity')).toBe(true);
    expect(categories.has('knowledge')).toBe(true);
    expect(categories.has('data')).toBe(true);
  });

  it('includes key well-known servers', () => {
    const names = MCP_SERVERS.map(s => s.name);
    expect(names).toContain('filesystem');
    expect(names).toContain('github');
    expect(names).toContain('brave-search');
    expect(names).toContain('memory');
    expect(names).toContain('sequential-thinking');
    expect(names).toContain('puppeteer');
    expect(names).toContain('slack');
  });

  it('mcp_config command is npx or uvx', () => {
    for (const server of MCP_SERVERS) {
      const cmd = server.install_manifest!.mcp_config!.command;
      expect(['npx', 'uvx', 'node']).toContain(cmd);
    }
  });

  it('entries with env vars have string values (possibly empty for user input)', () => {
    for (const server of MCP_SERVERS) {
      const env = server.install_manifest!.mcp_config!.env;
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          expect(typeof key).toBe('string');
          expect(typeof value).toBe('string');
        }
      }
    }
  });
});

// ── Database Seeding ────────────────────────────────────────────────

describe('seedMcpServers', () => {
  beforeEach(() => {
    tempDbPath = createTempDb();
    db = new MarketplaceDB(tempDbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    try { fs.unlinkSync(tempDbPath); } catch { /* ignore */ }
    // Clean up WAL/SHM files
    try { fs.unlinkSync(tempDbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(tempDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('inserts all MCP servers into an empty database', () => {
    const added = seedMcpServers(db);
    expect(added).toBe(MCP_SERVERS.length);
  });

  it('creates the mcp_registry source', () => {
    seedMcpServers(db);
    const sources = db.listSources();
    const mcpSource = sources.find(s => s.name === 'mcp_registry');
    expect(mcpSource).toBeDefined();
    expect(mcpSource!.display_name).toBe('MCP Server Registry');
    expect(mcpSource!.source_type).toBe('registry');
  });

  it('all seeded packages are retrievable by name', () => {
    seedMcpServers(db);
    for (const server of MCP_SERVERS) {
      const pkg = db.getPackageByName(server.name);
      expect(pkg).not.toBeNull();
      expect(pkg!.display_name).toBe(server.display_name);
      expect(pkg!.waggle_install_type).toBe('mcp');
      expect(pkg!.package_type).toBe('mcp_server');
    }
  });

  it('seeded packages have install_manifest with mcp_config', () => {
    seedMcpServers(db);
    for (const server of MCP_SERVERS) {
      const pkg = db.getPackageByName(server.name);
      expect(pkg).not.toBeNull();
      expect(pkg!.install_manifest).toBeDefined();
      expect((pkg!.install_manifest as any).mcp_config).toBeDefined();
      expect((pkg!.install_manifest as any).mcp_config.command).toBeTruthy();
      expect(Array.isArray((pkg!.install_manifest as any).mcp_config.args)).toBe(true);
    }
  });

  it('seeded packages appear in search results', () => {
    seedMcpServers(db);
    const results = db.search({ type: 'mcp', limit: 50 });
    expect(results.total).toBe(MCP_SERVERS.length);
    expect(results.packages.length).toBe(MCP_SERVERS.length);
  });

  it('duplicate seeding does not create duplicates', () => {
    const first = seedMcpServers(db);
    expect(first).toBe(MCP_SERVERS.length);

    const second = seedMcpServers(db);
    expect(second).toBe(0);

    // Verify total count unchanged
    const results = db.search({ type: 'mcp', limit: 100 });
    expect(results.total).toBe(MCP_SERVERS.length);
  });

  it('partial seeding skips existing entries', () => {
    // First seed
    seedMcpServers(db);

    // Manually delete a few entries and re-seed
    const rawDb = (db as any).db;
    rawDb.prepare("DELETE FROM packages WHERE name = 'filesystem'").run();
    rawDb.prepare("DELETE FROM packages WHERE name = 'github'").run();

    // Re-seed should only add the 2 deleted ones back
    const added = seedMcpServers(db);
    expect(added).toBe(2);

    // Total should still be the full count
    const results = db.search({ type: 'mcp', limit: 100 });
    expect(results.total).toBe(MCP_SERVERS.length);
  });

  it('updates source total_packages count', () => {
    seedMcpServers(db);
    const sources = db.listSources();
    const mcpSource = sources.find(s => s.name === 'mcp_registry');
    expect(mcpSource).toBeDefined();
    expect(mcpSource!.total_packages).toBe(MCP_SERVERS.length);
  });

  it('search by category returns correct results', () => {
    seedMcpServers(db);

    const devTools = db.search({ type: 'mcp', category: 'developer-tools', limit: 50 });
    expect(devTools.total).toBeGreaterThanOrEqual(3); // filesystem, git, github, sqlite, postgres

    const web = db.search({ type: 'mcp', category: 'web', limit: 50 });
    expect(web.total).toBeGreaterThanOrEqual(2); // brave-search, fetch, puppeteer

    const productivity = db.search({ type: 'mcp', category: 'productivity', limit: 50 });
    expect(productivity.total).toBeGreaterThanOrEqual(3); // google-drive, slack, notion, gmail
  });

  it('facets include mcp type', () => {
    seedMcpServers(db);
    const results = db.search({ limit: 50 });
    expect(results.facets.types).toHaveProperty('mcp');
    expect(results.facets.types.mcp).toBe(MCP_SERVERS.length);
  });
});
