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

export { MarketplaceDB } from './db';
export { MarketplaceInstaller } from './installer';
export { MarketplaceSync, deduplicatePackages, parseAwesomeListMarkdown, parseNpmSearchResults, normalizeName } from './sync';
export type { VaultLookupFn } from './sync';
export { seedNewSources, NEW_SOURCES } from './sources-seed';
export { SecurityGate } from './security';
export { isCiscoScannerAvailable, ciscoScan, getCiscoScannerVersion, resetAvailabilityCache, setExecFile } from './cisco-scanner';
export type { CiscoScanResult, CiscoScanIssue } from './cisco-scanner';
export { ENTERPRISE_PACKS } from './enterprise-packs';
export type { EnterprisePack } from './enterprise-packs';
export { MCP_SERVERS, seedMcpServers } from './mcp-registry';
export type { McpServerEntry } from './mcp-registry';
export { PACKAGE_CATEGORIES, categorizePackage, recategorizeAll } from './categories';
export type { PackageCategoryId } from './categories';

export type {
  MarketplaceSource,
  MarketplacePackage,
  MarketplacePack,
  Installation,
  InstallManifest,
  PluginManifest,
  McpServerConfig,
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
} from './types';

export type {
  Severity,
  SecurityFinding,
  SecurityCategory,
  SecurityEngine,
  ScanResult,
  SecurityGateConfig,
} from './security';
