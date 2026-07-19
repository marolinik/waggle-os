/**
 * MCP Server Registry — Tests
 *
 * Validates:
 * - MCP_SERVERS contains only the exact approved local-stdio profiles
 * - Every executable package selector is version-pinned in metadata and argv
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

const EXACT_PACKAGE_VERSION = /(?:@|==)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const APPROVED_LOCAL_STDIO_SERVERS = [
  'memory',
  'sequential-thinking',
  'brave-search',
  'playwright',
  'chrome-devtools',
];

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
  it('contains only the approved local stdio profiles', () => {
    expect(MCP_SERVERS.map(server => server.name)).toEqual(APPROVED_LOCAL_STDIO_SERVERS);
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

  it('pins every executable package in both metadata and runtime argv', () => {
    for (const server of MCP_SERVERS) {
      const manifest = server.install_manifest!;
      const packageSpec = manifest.npm_package!;
      const versionMatch = EXACT_PACKAGE_VERSION.exec(packageSpec);

      expect(versionMatch, `${server.name} package spec must use an exact version`).not.toBeNull();
      expect(manifest.mcp_config!.args).toContain(packageSpec);
      expect(server.version).toBe(versionMatch![1]);
    }
  });

  it('disables lifecycle scripts for every npx-backed catalog profile', () => {
    for (const server of MCP_SERVERS) {
      const config = server.install_manifest!.mcp_config!;
      if (config.command !== 'npx') continue;

      expect(config.args).toContain('--yes');
      expect(config.args).toContain('--ignore-scripts');
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
    expect(categories).toEqual(new Set(['knowledge', 'web', 'developer-tools']));
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
      const manifest = pkg!.install_manifest;
      expect(manifest?.mcp_config).toBeDefined();
      expect(manifest?.mcp_config?.command).toBeTruthy();
      expect(Array.isArray(manifest?.mcp_config?.args)).toBe(true);
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

  it('refreshes a stale curated manifest and version in place', () => {
    seedMcpServers(db);
    const expected = MCP_SERVERS.find(server => server.name === 'memory')!;
    const before = db.getPackageByName('memory')!;
    const rawDb = db.getRawDb();
    rawDb.prepare('UPDATE packages SET version = ?, install_manifest = ? WHERE id = ?').run(
      '0.0.0',
      JSON.stringify({
        npm_package: '@modelcontextprotocol/server-memory',
        mcp_config: {
          name: 'memory',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
      }),
      before.id,
    );

    expect(seedMcpServers(db)).toBe(0);

    const refreshed = db.getPackage(before.id)!;
    expect(refreshed.id).toBe(before.id);
    expect(refreshed.version).toBe(expected.version);
    expect(refreshed.install_manifest).toEqual(expected.install_manifest);
  });

  it('invalidates stale scan evidence when a curated executable profile changes', () => {
    seedMcpServers(db);
    const memory = db.getPackageByName('memory')!;
    const rawDb = db.getRawDb();
    rawDb.prepare(
      `UPDATE packages SET
         version = '0.0.0',
         install_manifest = '{}',
         security_status = 'clean',
         security_score = 100,
         last_scanned_at = '2026-07-18T12:00:00Z',
         content_hash = 'stale-hash',
         scan_engines = '["content_hash"]',
         scan_findings = '[]',
         scan_blocked = 1
       WHERE id = ?`,
    ).run(memory.id);

    seedMcpServers(db);

    const refreshed = rawDb.prepare(
      `SELECT security_status, security_score, last_scanned_at, content_hash,
              scan_engines, scan_findings, scan_blocked
       FROM packages WHERE id = ?`,
    ).get(memory.id) as Record<string, unknown>;
    expect(refreshed).toEqual({
      security_status: 'unscanned',
      security_score: -1,
      last_scanned_at: null,
      content_hash: null,
      scan_engines: null,
      scan_findings: null,
      scan_blocked: 0,
    });
  });

  it('invalidates stale scan evidence when curated provenance changes', () => {
    seedMcpServers(db);
    const memory = db.getPackageByName('memory')!;
    const rawDb = db.getRawDb();
    rawDb.prepare(
      `UPDATE packages SET
         repository_url = 'https://example.invalid/stale-source',
         security_status = 'clean',
         security_score = 100,
         last_scanned_at = '2026-07-18T12:00:00Z',
         content_hash = 'stale-hash',
         scan_engines = '["gen_trust_hub"]',
         scan_findings = '[]',
         scan_blocked = 0
       WHERE id = ?`,
    ).run(memory.id);

    seedMcpServers(db);

    const refreshed = rawDb.prepare(
      `SELECT security_status, security_score, last_scanned_at, content_hash,
              scan_engines, scan_findings, scan_blocked
       FROM packages WHERE id = ?`,
    ).get(memory.id) as Record<string, unknown>;
    expect(refreshed).toEqual({
      security_status: 'unscanned',
      security_score: -1,
      last_scanned_at: null,
      content_hash: null,
      scan_engines: null,
      scan_findings: null,
      scan_blocked: 0,
    });
  });

  it('preserves current scan evidence during an identical startup reseed', () => {
    seedMcpServers(db);
    const memory = db.getPackageByName('memory')!;
    const rawDb = db.getRawDb();
    rawDb.prepare(
      `UPDATE packages SET
         security_status = 'clean',
         security_score = 100,
         last_scanned_at = '2026-07-18T12:00:00Z',
         content_hash = 'current-hash',
         scan_engines = '["content_hash"]',
         scan_findings = '[]',
         scan_blocked = 0
       WHERE id = ?`,
    ).run(memory.id);

    seedMcpServers(db);

    const preserved = rawDb.prepare(
      `SELECT security_status, security_score, last_scanned_at, content_hash,
              scan_engines, scan_findings, scan_blocked
       FROM packages WHERE id = ?`,
    ).get(memory.id) as Record<string, unknown>;
    expect(preserved).toEqual({
      security_status: 'clean',
      security_score: 100,
      last_scanned_at: '2026-07-18T12:00:00Z',
      content_hash: 'current-hash',
      scan_engines: '["content_hash"]',
      scan_findings: '[]',
      scan_blocked: 0,
    });
  });

  it('preserves an active installation while refreshing its curated package row', () => {
    seedMcpServers(db);
    const memory = db.getPackageByName('memory')!;
    const rawDb = db.getRawDb();
    rawDb.prepare(
      `INSERT INTO installations (package_id, installed_version, install_path, status, config)
       VALUES (?, ?, ?, 'installed', '{}')`,
    ).run(memory.id, 'legacy', '.mcp.json');
    rawDb.prepare('UPDATE packages SET version = ? WHERE id = ?').run('legacy', memory.id);

    seedMcpServers(db);

    expect(db.getPackage(memory.id)!.version).toBe(
      MCP_SERVERS.find(server => server.name === 'memory')!.version,
    );
    expect(db.isInstalled(memory.id)).toBe(true);
  });

  it('seeds a trusted source row when an external source already uses the same name', () => {
    const rawDb = db.getRawDb();
    const externalSource = rawDb.prepare(
      `INSERT INTO sources (name, display_name, source_type, platform)
       VALUES ('external', 'External', 'registry', 'npm')`,
    ).run().lastInsertRowid;
    rawDb.prepare(
      `INSERT INTO packages (
         source_id, name, display_name, description, package_type,
         waggle_install_type, install_manifest
       ) VALUES (?, 'memory', 'External Memory', 'Untrusted shadow row',
         'mcp_server', 'mcp', ?)`,
    ).run(
      externalSource,
      JSON.stringify({
        npm_package: 'external-memory@1.0.0',
        mcp_config: { name: 'memory', command: 'npx', args: ['external-memory@1.0.0'] },
      }),
    );

    expect(seedMcpServers(db)).toBe(MCP_SERVERS.length);

    const trustedRows = rawDb.prepare(
      `SELECT p.* FROM packages p
       INNER JOIN sources s ON s.id = p.source_id
       WHERE s.name = 'mcp_registry' AND p.name = 'memory'`,
    ).all();
    expect(trustedRows).toHaveLength(1);
  });

  it('partial seeding skips existing entries', () => {
    // First seed
    seedMcpServers(db);

    // Manually delete a few entries and re-seed
    const rawDb = db.getRawDb();
    rawDb.prepare("DELETE FROM packages WHERE name = 'memory'").run();
    rawDb.prepare("DELETE FROM packages WHERE name = 'playwright'").run();

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
    expect(devTools.total).toBe(1); // chrome-devtools

    const web = db.search({ type: 'mcp', category: 'web', limit: 50 });
    expect(web.total).toBe(2); // brave-search, playwright

    const knowledge = db.search({ type: 'mcp', category: 'knowledge', limit: 50 });
    expect(knowledge.total).toBe(2); // memory, sequential-thinking
  });

  it('facets include mcp type', () => {
    seedMcpServers(db);
    const results = db.search({ limit: 50 });
    expect(results.facets.types).toHaveProperty('mcp');
    expect(results.facets.types.mcp).toBe(MCP_SERVERS.length);
  });
});

// ── FTS5 query relaxation (P0: acquire_capability verbose-need regression) ──
//
// Root cause: db.search() passed the raw caller string straight into FTS5
// `MATCH @query`. FTS5 implicit-ANDs every term, so a verbose natural-language
// `need` (always the case when acquire_capability calls searchMarketplace)
// matches zero packages, and special chars (':' '\\' '"') in paths like
// `D:\Projects\X` raise an FTS5 syntax error that searchMarketplace swallows
// to []. Net: the inline capability-install feature never surfaces a
// candidate for real agent queries. These tests reproduce that and lock the
// relaxation behaviour in.

describe('db.search — FTS5 query relaxation', () => {
  let ftsDbPath: string;
  let ftsDb: MarketplaceDB;

  beforeEach(() => {
    ftsDbPath = createTempDb();
    ftsDb = new MarketplaceDB(ftsDbPath);
    seedMcpServers(ftsDb); // seeds the 'memory' MCP server
    // The bare test schema declares packages_fts as external-content FTS5
    // with no sync triggers (production ships them in the seed DB). Rebuild
    // the index from the content table so search() exercises real FTS —
    // these tests target query *relaxation*, not FTS population. (Uses the
    // better-sqlite3 statement API, not child_process.)
    (ftsDb as unknown as { db: import('better-sqlite3').Database }).db
      .prepare("INSERT INTO packages_fts(packages_fts) VALUES('rebuild')")
      .run();
  });

  afterEach(() => {
    try { ftsDb.close(); } catch { /* ignore */ }
    try { fs.unlinkSync(ftsDbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(ftsDbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(ftsDbPath + '-shm'); } catch { /* ignore */ }
  });

  const hasMemory = (r: { packages: Array<{ name: string; description: string }> }) =>
    r.packages.some(p => p.name === 'memory' || /memory/i.test(p.description));

  it('baseline: a single tight keyword finds the memory MCP server', () => {
    const r = ftsDb.search({ query: 'memory', limit: 10 });
    expect(r.total).toBeGreaterThan(0);
    expect(hasMemory(r)).toBe(true);
  });

  it('REGRESSION: a verbose natural-language need still surfaces the memory server', () => {
    // Exact shape acquire_capability feeds into searchMarketplace(need).
    const need =
      'Keep durable entities and relationships across many conversations using a persistent MCP memory knowledge graph';
    const r = ftsDb.search({ query: need, limit: 10 });
    expect(r.total).toBeGreaterThan(0);
    expect(hasMemory(r)).toBe(true);
  });

  it('ROBUSTNESS: a need with FTS-special chars (path with : and \\ and quotes) does not throw and still matches', () => {
    const need =
      'remember D:\\Projects\\PM-Waggle-OS — need a "memory" knowledge graph: durable * context';
    expect(() => ftsDb.search({ query: need, limit: 10 })).not.toThrow();
    const r = ftsDb.search({ query: need, limit: 10 });
    expect(r.total).toBeGreaterThan(0);
    expect(hasMemory(r)).toBe(true);
  });

  it('EMPTY/garbage query degrades gracefully (no throw, no crash)', () => {
    expect(() => ftsDb.search({ query: '   ', limit: 10 })).not.toThrow();
    expect(() => ftsDb.search({ query: '!!! "" \\ : * ^', limit: 10 })).not.toThrow();
  });
});
