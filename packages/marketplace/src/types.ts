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
  /** Security scan result (attached when scan was performed) */
  scanResult?: import('./security.js').ScanResult;
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
