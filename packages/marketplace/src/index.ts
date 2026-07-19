/**
 * Waggle Marketplace — Main Entry Point
 * 
 * @module @waggle/marketplace
 * 
 * Provides:
 *   - MarketplaceDB: SQLite database access for the package catalog
 *   - MarketplaceInstaller: Install/uninstall skills, plugins, MCP servers
 *   - MarketplaceSync: Sync packages from live marketplace sources
 * 
 * Usage:
 *   import { MarketplaceDB, MarketplaceInstaller, MarketplaceSync } from '@waggle/marketplace';
 *   
 *   const db = new MarketplaceDB();
 *   const installer = new MarketplaceInstaller(db);
 *   
 *   // Search and install
 *   const results = db.search({ query: 'code review', type: 'skill' });
 *   await installer.install({ packageId: results.packages[0].id });
 *   
 *   // Install a pack
 *   await installer.installPack('research_analyst');
 *   
 *   // Sync from live sources
 *   const sync = new MarketplaceSync(db);
 *   await sync.syncAll();
 */

export { MarketplaceDB } from './db.js';
export { MarketplaceInstaller } from './installer.js';
export { MarketplaceSync, deduplicatePackages, parseAwesomeListMarkdown, parseNpmSearchResults, normalizeName } from './sync.js';
export type { VaultLookupFn } from './sync.js';
export { defaultFetch } from './fetcher.js';
export type { FetchFn } from './fetcher.js';
export { resolveSkillSource, classifySource, isSafeZipEntry, SkillSourceError } from './multi-source.js';
export type { ResolvedSkillSource, SkillSourceType, ResolveOptions, ZipEntry, ZipExtractor } from './multi-source.js';
export { seedNewSources, NEW_SOURCES } from './sources-seed.js';
export { SecurityGate } from './security.js';
export { isCiscoScannerAvailable, ciscoScan, getCiscoScannerVersion, resetAvailabilityCache, setExecFile } from './cisco-scanner.js';
export type { CiscoScanResult, CiscoScanIssue } from './cisco-scanner.js';
export { ENTERPRISE_PACKS } from './enterprise-packs.js';
export type { EnterprisePack } from './enterprise-packs.js';
export { MCP_SERVERS, seedMcpServers } from './mcp-registry.js';
export type { McpServerEntry } from './mcp-registry.js';
export { createMarketplaceMcpProvenance } from './install-security.js';
export { PACKAGE_CATEGORIES, categorizePackage, recategorizeAll } from './categories.js';
export type { PackageCategoryId } from './categories.js';

export type {
  MarketplaceSource,
  MarketplacePackage,
  MarketplacePack,
  Installation,
  InstallManifest,
  PluginManifest,
  McpServerConfig,
  MarketplaceMcpProvenance,
  SettingField,
  PostInstallHook,
  InstallationType,
  InstallRequest,
  InstallResult,
  PackInstallResult,
  SearchOptions,
  SearchResult,
  SearchSort,
  SyncOptions,
  SyncResult,
} from './types.js';

export type {
  Severity,
  SecurityFinding,
  SecurityCategory,
  SecurityEngine,
  ScanResult,
  SecurityGateConfig,
} from './security.js';
