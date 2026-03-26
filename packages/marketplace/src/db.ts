/**
 * Waggle Marketplace — Database Access Layer
 * 
 * SQLite database interface for the marketplace catalog.
 * Uses better-sqlite3 (same driver Waggle core uses for .mind files).
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import type {
  MarketplacePackage,
  MarketplaceSource,
  MarketplacePack,
  Installation,
  SearchOptions,
  SearchResult,
  SearchSort,
} from './types';

const DEFAULT_DB_PATH = join(homedir(), '.waggle', 'marketplace.db');

export class MarketplaceDB {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.db = new Database(dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    // Auto-migrate: ensure is_custom column exists on sources table
    this.migrateSchema();
  }

  /**
   * Apply any necessary schema migrations.
   * Safe to call on all database versions.
   */
  private migrateSchema(): void {
    // Migration: add is_custom column to sources
    try {
      this.db.prepare("SELECT is_custom FROM sources LIMIT 0").run();
    } catch {
      try {
        this.db.prepare("ALTER TABLE sources ADD COLUMN is_custom BOOLEAN DEFAULT 0").run();
      } catch {
        // Table might not exist yet (empty DB) — skip migration
      }
    }

    // Migration: add sync_state column to sources (JSON blob for resumable sync)
    try {
      this.db.prepare("SELECT sync_state FROM sources LIMIT 0").run();
    } catch {
      try {
        this.db.prepare("ALTER TABLE sources ADD COLUMN sync_state TEXT DEFAULT NULL").run();
      } catch {
        // Table might not exist yet (empty DB) — skip migration
      }
    }
  }

  // ─── Package Queries ──────────────────────────────────────────────

  /**
   * Search packages using FTS5 full-text search + faceted filtering.
   */
  search(options: SearchOptions = {}): SearchResult {
    const { query, type, category, pack, source, sort, limit = 50, offset = 0 } = options;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Full-text search via FTS5
    let baseQuery: string;
    if (query) {
      baseQuery = `
        SELECT p.* FROM packages p
        INNER JOIN packages_fts fts ON p.id = fts.rowid
        WHERE packages_fts MATCH @query
      `;
      params.query = query;
    } else {
      baseQuery = `SELECT p.* FROM packages p WHERE 1=1`;
    }

    // Faceted filters
    if (type) {
      conditions.push(`p.waggle_install_type = @type`);
      params.type = type;
    }
    if (category) {
      conditions.push(`p.category = @category`);
      params.category = category;
    }
    if (pack) {
      conditions.push(`EXISTS (
        SELECT 1 FROM pack_packages pp
        INNER JOIN packs pk ON pk.id = pp.pack_id
        WHERE pp.package_id = p.id AND pk.slug = @pack
      )`);
      params.pack = pack;
    }
    if (source) {
      conditions.push(`EXISTS (
        SELECT 1 FROM sources s
        WHERE s.id = p.source_id AND s.name = @source
      )`);
      params.source = source;
    }

    const whereClause = conditions.length > 0
      ? ` AND ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = baseQuery.replace('SELECT p.*', 'SELECT COUNT(*) as total') + whereClause;
    const total = (this.db.prepare(countQuery).get(params) as { total: number }).total;

    // Determine sort order
    const orderClause = this.buildOrderClause(sort, !!query);

    // Get packages
    const fullQuery = baseQuery + whereClause + ` ${orderClause} LIMIT @limit OFFSET @offset`;
    params.limit = limit;
    params.offset = offset;
    const packages = this.db.prepare(fullQuery).all(params) as MarketplacePackage[];

    // Parse JSON fields
    const parsed = packages.map(p => this.parsePackageJson(p));

    // Build facets (on unfiltered result set)
    const facets = this.buildFacets(baseQuery + whereClause, params);

    // Get installed count
    const installedCount = this.getInstalledCount();

    return { packages: parsed, total, facets, installedCount };
  }

  /**
   * Get a single package by ID.
   */
  getPackage(id: number): MarketplacePackage | null {
    const row = this.db.prepare('SELECT * FROM packages WHERE id = ?').get(id) as MarketplacePackage | undefined;
    return row ? this.parsePackageJson(row) : null;
  }

  /**
   * Get a single package by name.
   */
  getPackageByName(name: string): MarketplacePackage | null {
    const row = this.db.prepare('SELECT * FROM packages WHERE name = ?').get(name) as MarketplacePackage | undefined;
    return row ? this.parsePackageJson(row) : null;
  }

  /**
   * Get all packages in a given pack.
   */
  getPacksBySlug(slug: string): { pack: MarketplacePack; packages: MarketplacePackage[] } | null {
    const pack = this.db.prepare('SELECT * FROM packs WHERE slug = ?').get(slug) as MarketplacePack | undefined;
    if (!pack) return null;

    const packages = this.db.prepare(`
      SELECT p.*, pp.is_core FROM packages p
      INNER JOIN pack_packages pp ON pp.package_id = p.id
      WHERE pp.pack_id = ?
      ORDER BY pp.is_core DESC, p.downloads DESC
    `).all(pack.id) as (MarketplacePackage & { is_core: boolean })[];

    return {
      pack: { ...pack, connectors_needed: JSON.parse(pack.connectors_needed as unknown as string || '[]') },
      packages: packages.map(p => this.parsePackageJson(p)),
    };
  }

  /**
   * List all available packs.
   */
  listPacks(): MarketplacePack[] {
    const rows = this.db.prepare('SELECT * FROM packs ORDER BY priority, display_name').all() as MarketplacePack[];
    return rows.map(p => ({
      ...p,
      connectors_needed: JSON.parse(p.connectors_needed as unknown as string || '[]'),
    }));
  }

  /**
   * List all sources.
   */
  listSources(): MarketplaceSource[] {
    return this.db.prepare(`
      SELECT *, COALESCE(is_custom, 0) as is_custom FROM sources ORDER BY total_packages DESC
    `).all() as MarketplaceSource[];
  }

  /**
   * List all sources with package counts derived from the packages table.
   */
  listSourcesWithCounts(): (MarketplaceSource & { package_count: number })[] {
    return this.db.prepare(`
      SELECT s.*, COALESCE(s.is_custom, 0) as is_custom,
             COUNT(p.id) as package_count
      FROM sources s
      LEFT JOIN packages p ON p.source_id = s.id
      GROUP BY s.id
      ORDER BY package_count DESC, s.display_name ASC
    `).all() as (MarketplaceSource & { package_count: number })[];
  }

  /**
   * Get a single source by ID.
   */
  getSource(id: number): MarketplaceSource | null {
    const row = this.db.prepare(
      'SELECT *, COALESCE(is_custom, 0) as is_custom FROM sources WHERE id = ?'
    ).get(id) as MarketplaceSource | undefined;
    return row ?? null;
  }

  /**
   * Get a single source by name.
   */
  getSourceByName(name: string): MarketplaceSource | null {
    const row = this.db.prepare(
      'SELECT *, COALESCE(is_custom, 0) as is_custom FROM sources WHERE name = ?'
    ).get(name) as MarketplaceSource | undefined;
    return row ?? null;
  }

  /**
   * Add a new user-defined source.
   * Returns the source ID.
   */
  addSource(source: {
    name: string;
    display_name: string;
    url: string;
    source_type: string;
    platform?: string;
    install_method?: string;
    api_endpoint?: string | null;
    description?: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO sources (name, display_name, url, source_type, platform, total_packages, install_method, api_endpoint, description, is_custom)
      VALUES (@name, @display_name, @url, @source_type, @platform, 0, @install_method, @api_endpoint, @description, 1)
    `);
    const result = stmt.run({
      name: source.name,
      display_name: source.display_name,
      url: source.url,
      source_type: source.source_type,
      platform: source.platform || 'waggle',
      install_method: source.install_method || 'git_clone',
      api_endpoint: source.api_endpoint ?? null,
      description: source.description || '',
    });
    return result.lastInsertRowid as number;
  }

  /**
   * Delete a user-defined source and all its packages.
   * Returns true if deleted, false if source not found or is built-in.
   */
  deleteSource(id: number): boolean {
    const source = this.getSource(id);
    if (!source) return false;
    if (!source.is_custom) return false;

    // Delete packages belonging to this source first
    this.db.prepare('DELETE FROM packages WHERE source_id = ?').run(id);
    // Delete the source
    const result = this.db.prepare('DELETE FROM sources WHERE id = ? AND is_custom = 1').run(id);
    return result.changes > 0;
  }

  /**
   * Ensure the sources table has the is_custom column.
   * Safe to call on existing databases — no-ops if column already exists.
   */
  ensureIsCustomColumn(): void {
    try {
      this.db.prepare("SELECT is_custom FROM sources LIMIT 1").get();
    } catch {
      // Column doesn't exist — add it
      this.db.prepare("ALTER TABLE sources ADD COLUMN is_custom BOOLEAN DEFAULT 0").run();
    }
  }

  // ─── Sync State (resumable sync for rate-limited sources) ────────

  /**
   * Get the sync state for a source (used for resumable pagination).
   * Returns null if no state is saved.
   */
  getSyncState(sourceId: number): Record<string, unknown> | null {
    const row = this.db.prepare(
      'SELECT sync_state FROM sources WHERE id = ?'
    ).get(sourceId) as { sync_state: string | null } | undefined;
    if (!row || !row.sync_state) return null;
    try {
      return JSON.parse(row.sync_state);
    } catch {
      return null;
    }
  }

  /**
   * Save sync state for a source (used for resumable pagination).
   * Pass null to clear the state (e.g., when a full sync completes).
   */
  setSyncState(sourceId: number, state: Record<string, unknown> | null): void {
    this.db.prepare(
      'UPDATE sources SET sync_state = ? WHERE id = ?'
    ).run(state ? JSON.stringify(state) : null, sourceId);
  }

  // ─── Installation Tracking ────────────────────────────────────────

  /**
   * Record a successful installation.
   */
  recordInstallation(
    packageId: number,
    version: string,
    installPath: string,
    config: Record<string, unknown> = {},
  ): Installation {
    const stmt = this.db.prepare(`
      INSERT INTO installations (package_id, installed_version, installed_at, install_path, status, config)
      VALUES (?, ?, datetime('now'), ?, 'installed', ?)
    `);
    const result = stmt.run(packageId, version, installPath, JSON.stringify(config));
    return this.getInstallation(result.lastInsertRowid as number)!;
  }

  /**
   * Get installation by ID.
   */
  getInstallation(id: number): Installation | null {
    const row = this.db.prepare('SELECT * FROM installations WHERE id = ?').get(id) as Installation | undefined;
    if (!row) return null;
    return { ...row, config: JSON.parse(row.config as unknown as string || '{}') };
  }

  /**
   * Get all active installations.
   */
  listInstallations(): (Installation & { package: MarketplacePackage })[] {
    const rows = this.db.prepare(`
      SELECT i.*, p.name as pkg_name, p.display_name as pkg_display_name,
             p.waggle_install_type, p.category
      FROM installations i
      INNER JOIN packages p ON p.id = i.package_id
      WHERE i.status = 'installed'
      ORDER BY i.installed_at DESC
    `).all() as any[];
    return rows;
  }

  /**
   * Check if a package is already installed.
   */
  isInstalled(packageId: number): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM installations WHERE package_id = ? AND status = 'installed'`
    ).get(packageId);
    return !!row;
  }

  /**
   * Mark an installation as uninstalled.
   */
  markUninstalled(packageId: number): void {
    this.db.prepare(
      `UPDATE installations SET status = 'uninstalled' WHERE package_id = ? AND status = 'installed'`
    ).run(packageId);
  }

  // ─── Upsert (for sync) ───────────────────────────────────────────

  /**
   * Insert or update a package (used by sync scripts).
   */
  upsertPackage(pkg: Partial<MarketplacePackage> & { name: string; source_id: number }): number {
    const existing = this.db.prepare('SELECT id FROM packages WHERE name = ? AND source_id = ?')
      .get(pkg.name, pkg.source_id) as { id: number } | undefined;

    if (existing) {
      const sets: string[] = [];
      const params: Record<string, unknown> = { id: existing.id };
      for (const [key, value] of Object.entries(pkg)) {
        if (key === 'id' || key === 'name' || key === 'source_id') continue;
        sets.push(`${key} = @${key}`);
        params[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
      sets.push(`updated_at = datetime('now')`);
      this.db.prepare(`UPDATE packages SET ${sets.join(', ')} WHERE id = @id`).run(params);
      return existing.id;
    } else {
      const cols = Object.keys(pkg);
      const vals = cols.map(c => `@${c}`);
      const params: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(pkg)) {
        params[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
      const result = this.db.prepare(
        `INSERT INTO packages (${cols.join(', ')}) VALUES (${vals.join(', ')})`
      ).run(params);
      return result.lastInsertRowid as number;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private parsePackageJson(pkg: MarketplacePackage): MarketplacePackage {
    return {
      ...pkg,
      install_manifest: typeof pkg.install_manifest === 'string'
        ? JSON.parse(pkg.install_manifest)
        : pkg.install_manifest,
      platforms: typeof pkg.platforms === 'string'
        ? JSON.parse(pkg.platforms)
        : pkg.platforms || [],
      dependencies: typeof pkg.dependencies === 'string'
        ? JSON.parse(pkg.dependencies)
        : pkg.dependencies || [],
      packs: typeof pkg.packs === 'string'
        ? JSON.parse(pkg.packs)
        : pkg.packs || [],
    };
  }

  private buildOrderClause(sort?: SearchSort, hasQuery?: boolean): string {
    switch (sort) {
      case 'popular':
        return 'ORDER BY p.downloads DESC, p.stars DESC';
      case 'recent':
        return 'ORDER BY p.updated_at DESC, p.created_at DESC';
      case 'name':
        return 'ORDER BY p.display_name ASC';
      case 'relevance':
        // When using FTS, the default rank is relevance; fallback to downloads
        return hasQuery ? 'ORDER BY rank, p.downloads DESC' : 'ORDER BY p.downloads DESC, p.stars DESC';
      default:
        // Default: if query present use relevance, else popularity
        return hasQuery ? 'ORDER BY rank, p.downloads DESC' : 'ORDER BY p.downloads DESC, p.stars DESC';
    }
  }

  /**
   * Count the total number of installed packages.
   */
  getInstalledCount(): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM installations WHERE status = 'installed'`
    ).get() as { cnt: number };
    return row.cnt;
  }

  private buildFacets(baseQuery: string, params: Record<string, unknown>) {
    const facetQuery = baseQuery.replace(
      /SELECT p\.\*/,
      `SELECT p.waggle_install_type, p.category, s.name as source_name`
    ).replace(
      /FROM packages p/,
      `FROM packages p LEFT JOIN sources s ON s.id = p.source_id`
    );

    const rows = this.db.prepare(facetQuery).all(params) as {
      waggle_install_type: string;
      category: string;
      source_name: string;
    }[];

    const types: Record<string, number> = {};
    const categories: Record<string, number> = {};
    const sources: Record<string, number> = {};

    for (const row of rows) {
      types[row.waggle_install_type] = (types[row.waggle_install_type] || 0) + 1;
      categories[row.category] = (categories[row.category] || 0) + 1;
      if (row.source_name) sources[row.source_name] = (sources[row.source_name] || 0) + 1;
    }

    return { types, categories, sources };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
