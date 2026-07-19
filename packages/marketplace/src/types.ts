/**
 * Waggle Marketplace — Type Definitions
 * 
 * Types for the marketplace database, package installation,
 * and integration with Waggle's plugin/skill/MCP systems.
 */

// ─── Database Row Types ───────────────────────────────────────────────

export interface MarketplaceSource {
  id: number;
  name: string;
  display_name: string;
  url: string;
  source_type: 'marketplace' | 'registry' | 'github_org' | 'community_repo' | 'curated_list' | 'aggregator' | 'npm_registry' | 'official_marketplace' | 'commercial_marketplace' | 'tool' | 'specification';
  platform: string;
  total_packages: number;
  install_method: 'npm' | 'git_clone' | 'download' | 'api_fetch' | 'cli' | 'manual';
  api_endpoint: string | null;
  description: string;
  last_synced_at: string | null;
  /** Whether this source was added by the user (vs. built-in seed data). */
  is_custom: boolean;
}

export interface MarketplacePackage {
  id: number;
  source_id: number;
  name: string;
  display_name: string;
  description: string;
  author: string;
  package_type: 'skill' | 'plugin' | 'mcp_server' | 'template' | 'pack';
  waggle_install_type: 'skill' | 'plugin' | 'mcp';
  waggle_install_path: string;
  version: string;
  license: string | null;
  repository_url: string | null;
  homepage_url: string | null;
  downloads: number;
  stars: number;
  rating: number;
  rating_count: number;
  category: string;
  subcategory: string | null;
  install_manifest: InstallManifest | null;
  platforms: string[];
  min_waggle_version: string | null;
  dependencies: string[];
  packs: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Input shape accepted by {@link MarketplaceDB.upsertPackage}.
 *
 * `name` and `source_id` are required. The JSON-serializable columns
 * (`platforms`, `dependencies`, `packs`, `install_manifest`) accept EITHER
 * their structured form (object/array) OR a pre-serialized JSON string —
 * `upsertPackage` serializes objects on the way in, so sync adapters that
 * have already called `JSON.stringify()` can pass the string directly.
 */
export type PackageUpsertInput =
  & Omit<Partial<MarketplacePackage>, 'platforms' | 'dependencies' | 'packs' | 'install_manifest'>
  & {
    name: string;
    source_id: number;
    platforms?: string[] | string;
    dependencies?: string[] | string;
    packs?: string[] | string;
    install_manifest?: InstallManifest | string | null;
  };

/**
 * Optional security-scan columns persisted on the `packages` table by the
 * installer's `recordScanResult()`. They are not part of the core
 * {@link MarketplacePackage} shape (a freshly-synced package has none of them),
 * so callers that read them must treat every field as possibly-absent.
 */
export interface PackageSecurityColumns {
  security_status?: 'unscanned' | 'clean' | 'low' | 'medium' | 'high' | 'critical' | string;
  security_score?: number;
  last_scanned_at?: string | null;
  content_hash?: string | null;
  scan_engines?: string | null;
  scan_findings?: string | null;
  /** 1 = installation was blocked by the security gate, 0 = allowed. */
  scan_blocked?: 0 | 1;
}

/** A catalog package row augmented with its (optional) persisted scan columns. */
export type ScannedPackage = MarketplacePackage & PackageSecurityColumns;

/**
 * Flat row returned by {@link MarketplaceDB.listInstallations}.
 *
 * The query joins `installations` (all columns) with a handful of package
 * columns aliased as `pkg_*`; it is NOT a nested `{ package: ... }` object.
 */
export interface InstalledPackageRow extends Installation {
  pkg_name: string;
  pkg_display_name: string;
  waggle_install_type: MarketplacePackage['waggle_install_type'];
  category: string;
}

export interface MarketplacePack {
  id: number;
  slug: string;
  display_name: string;
  description: string;
  target_roles: string;
  icon: string;
  priority: 'core' | 'recommended' | 'optional';
  connectors_needed: string[];
  created_at: string;
}

export interface Installation {
  id: number;
  package_id: number;
  installed_version: string;
  installed_at: string;
  install_path: string;
  status: 'installed' | 'updating' | 'failed' | 'uninstalled';
  config: Record<string, unknown>;
}

// ─── Install Manifest (stored as JSON in packages table) ──────────────

export interface InstallManifest {
  /** For skills: the markdown content URL or inline content */
  skill_url?: string;
  skill_content?: string;

  /** For plugins: the plugin.json manifest to write */
  plugin_manifest?: PluginManifest;
  /** Git repo to clone for plugin files */
  git_url?: string;

  /** For MCPs: the server configuration */
  mcp_config?: McpServerConfig;

  /** npm package to install (for MCP servers that need it) */
  npm_package?: string;
  npm_args?: string[];

  /** Post-install hooks */
  post_install?: PostInstallHook[];
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  skills?: string[];
  mcpServers?: McpServerConfig[];
  settingsSchema?: Record<string, SettingField>;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** Portable, secret-free identity for one audited marketplace MCP profile. */
export interface MarketplaceMcpProvenance {
  kind: 'marketplace';
  schemaVersion: 1;
  sourceName: 'mcp_registry';
  packageName: string;
  packageVersion: string;
  npmPackage: string;
  profileDigest: `sha256:${string}`;
}

export interface SettingField {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface PostInstallHook {
  type: 'run_command' | 'create_file' | 'append_config';
  command?: string;
  path?: string;
  content?: string;
}

// ─── Workflow Types ──────────────────────────────────────────────────

export type InstallationType = 'skill' | 'plugin' | 'mcp';

export interface InstallRequest {
  packageId: number;
  /** Require the freshly loaded package snapshot to keep this install type. */
  expectedInstallType?: InstallationType;
  /**
   * Bind a delegated MCP install to the exact secret-free catalog receipt the
   * caller selected. Direct marketplace and CLI installs leave this unset.
   */
  expectedMcpProvenance?: MarketplaceMcpProvenance;
  /** Override install path (default: auto-detected from package) */
  installPath?: string;
  /** User-provided settings (API keys, etc.) */
  settings?: Record<string, string>;
  /** Skip confirmation prompt */
  force?: boolean;
  /** Bypass security gate (DANGEROUS — only for trusted packages) */
  forceInsecure?: boolean;
}

export interface InstallResult {
  success: boolean;
  packageId: number;
  packageName: string;
  installType: InstallationType;
  installPath: string;
  message: string;
  errors?: string[];
  /** Stable conflict marker for callers that preserve retryable HTTP 409s. */
  errorCode?: 'PACKAGE_IDENTITY_CHANGED';
  /** Security scan result (attached when scan was performed) */
  scanResult?: import('./security.js').ScanResult;
  /**
   * Exact validated MCP source template used for installation. Environment
   * values remain unresolved catalog templates, so this receipt never carries
   * user secrets and can be safely normalized again at the server boundary.
   */
  mcpSourceConfig?: McpServerConfig;
  /** Source-qualified identity persisted beside the configured MCP entry. */
  mcpProvenance?: MarketplaceMcpProvenance;
}

export interface PackInstallResult {
  packSlug: string;
  packName: string;
  totalPackages: number;
  installed: InstallResult[];
  skipped: string[];
  failed: InstallResult[];
}

export type SearchSort = 'relevance' | 'popular' | 'recent' | 'name';

export interface SearchOptions {
  query?: string;
  type?: InstallationType;
  category?: string;
  pack?: string;
  source?: string;
  sort?: SearchSort;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  packages: MarketplacePackage[];
  total: number;
  facets: {
    types: Record<string, number>;
    categories: Record<string, number>;
    sources: Record<string, number>;
  };
  /** Total number of installed packages across the whole catalog. */
  installedCount: number;
}

export interface SyncOptions {
  sources?: string[];
  fullRefresh?: boolean;
  dryRun?: boolean;
  /**
   * Scan skill content during sync using SecurityGate.
   * Default: false (scanning all packages during sync would be slow).
   * Instead, packages are scanned on first install attempt, and the result is cached.
   */
  scanDuringSync?: boolean;
}

export interface SyncResult {
  source: string;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}
