/**
 * Waggle Marketplace — Package Installer
 * 
 * Handles installation of skills, plugins, and MCP servers from the
 * marketplace database into the user's ~/.waggle/ directory.
 * 
 * Installation strategies per type:
 * 
 * SKILL:   Download/copy markdown file → ~/.waggle/skills/{name}.md
 *          Then call PUT /api/skills/{name} if server is running.
 * 
 * PLUGIN:  Clone/download plugin dir → ~/.waggle/plugins/{name}/
 *          Write plugin.json manifest, copy skill files, register in registry.json.
 *          Then call POST /api/plugins/install if server is running.
 * 
 * MCP:     Add an exact curated npx/uvx server config to .mcp.json.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { MarketplaceDB } from './db.js';
import { SecurityGate, type ScanResult, type SecurityGateConfig } from './security.js';
import { type FetchFn, defaultFetch } from './fetcher.js';
import {
  assertSafeConfiguredMarketplaceMcpConfig,
  assertSafeMarketplaceInstallManifest,
  assertSafeMarketplaceMcpConfig,
  configureMarketplaceMcpServer,
  resolveManagedInstallPath,
} from './install-security.js';
import type {
  MarketplacePackage,
  InstallManifest,
  InstallRequest,
  InstallResult,
  PackInstallResult,
  InstallationType,
  McpServerConfig,
  PluginManifest,
} from './types.js';

const WAGGLE_DIR = join(homedir(), '.waggle');
const SKILLS_DIR = join(WAGGLE_DIR, 'skills');
const PLUGINS_DIR = join(WAGGLE_DIR, 'plugins');
const REGISTRY_PATH = join(PLUGINS_DIR, 'registry.json');

function isPluginRegistryPath(candidate: string): boolean {
  // Reserve the same namespace on every platform; Windows aliases path casing.
  return resolve(candidate).toLowerCase() === resolve(REGISTRY_PATH).toLowerCase();
}

// UX-Refactor Phase 4 (C4): the sidecar boot loader reads <dataDir>/.mcp.json
// (dataDir = WAGGLE_DATA_DIR or ~/.waggle — see server local/mcp-config.ts).
// This previously wrote to process.cwd(), a file nothing ever read.
// Resolved at CALL time (not module import) so a host that sets
// WAGGLE_DATA_DIR after this module loads still writes to the right place.
function mcpConfigPath(): string {
  return join(process.env.WAGGLE_DATA_DIR || WAGGLE_DIR, '.mcp.json');
}

/** Waggle server API base URL (when running locally) */
const API_BASE = process.env.WAGGLE_API_URL || 'http://localhost:3000';

/** A single server entry inside a `.mcp.json` file. */
interface McpConfigEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** Shape of the `.mcp.json` config file we read/write. */
interface McpConfigFile {
  mcpServers: Record<string, McpConfigEntry>;
}

export class MarketplaceInstaller {
  private db: MarketplaceDB;
  private security: SecurityGate;
  /** Outbound fetch for external skill content — SSRF-guarded when the server
   *  injects it; plain global fetch for standalone/CLI callers. */
  private fetchImpl: FetchFn;

  constructor(db: MarketplaceDB, securityConfig?: Partial<SecurityGateConfig>, fetchImpl?: FetchFn) {
    this.db = db;
    this.security = new SecurityGate(securityConfig);
    this.fetchImpl = fetchImpl ?? defaultFetch;
    this.ensureDirectories();
  }

  static configureMcpServer(
    source: McpServerConfig,
    settings?: Record<string, string>,
  ): McpServerConfig {
    return configureMarketplaceMcpServer(source, settings);
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Install a single package from the marketplace.
   */
  async install(request: InstallRequest): Promise<InstallResult> {
    const pkg = this.db.getPackage(request.packageId);
    if (!pkg) {
      return {
        success: false,
        packageId: request.packageId,
        packageName: 'unknown',
        installType: 'skill',
        installPath: '',
        message: `Package ID ${request.packageId} not found in marketplace database.`,
        errors: ['Package not found'],
      };
    }

    const installType = pkg.waggle_install_type as InstallationType;
    if (request.expectedInstallType && installType !== request.expectedInstallType) {
      const error = `Expected ${request.expectedInstallType} package but installer loaded ${installType}`;
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType,
        installPath: pkg.waggle_install_path,
        message: error,
        errors: [error],
      };
    }
    if (request.installPath !== undefined) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType,
        installPath: request.installPath,
        message: 'Custom install paths are not supported. Marketplace packages install only to Waggle-managed destinations.',
        errors: ['Custom install paths are not supported'],
      };
    }

    try {
      assertSafeMarketplaceInstallManifest(
        installType,
        pkg.install_manifest as InstallManifest | null,
      );
    } catch (err) {
      const error = (err as Error).message;
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType,
        installPath: pkg.waggle_install_path,
        message: `Rejected marketplace manifest: ${error}`,
        errors: [error],
      };
    }

    // Check if already installed
    const wasInstalled = this.db.isInstalled(pkg.id);
    if (installType !== 'mcp' && !request.force && wasInstalled) {
      return {
        success: true,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: pkg.waggle_install_type as InstallationType,
        installPath: pkg.waggle_install_path,
        message: `${pkg.display_name} is already installed. Use force=true to reinstall.`,
      };
    }

    // ─── SECURITY GATE: Pre-install scan ───────────────────────
    // Fetch content early so we can scan it before writing to disk
    let contentToScan: string | undefined;
    try {
      contentToScan = await this.resolveContent(pkg);
    } catch {
      // Content resolution failure is handled in type-specific installers
    }

    const scanResult = await this.security.scan(pkg, contentToScan);
    this.recordScanResult(pkg.id, scanResult);

    if (scanResult.blocked && !request.forceInsecure) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: pkg.waggle_install_type as InstallationType,
        installPath: pkg.waggle_install_path,
        message: `BLOCKED: Security scan found ${scanResult.overall_severity} severity issues. ${scanResult.findings.length} finding(s). Use forceInsecure=true to override.`,
        errors: scanResult.findings.map(f => `[${f.severity}] ${f.title}: ${f.description}`),
        scanResult,
      };
    }
    // ─── END SECURITY GATE ─────────────────────────────────────

    // Dispatch to type-specific installer
    let result: InstallResult;

    switch (installType) {
      case 'skill':
        result = await this.installSkill(pkg, request, contentToScan);
        break;
      case 'plugin':
        result = await this.installPlugin(pkg, request);
        break;
      case 'mcp':
        result = await this.installMcp(pkg, request);
        break;
      default:
        result = {
          success: false,
          packageId: pkg.id,
          packageName: pkg.name,
          installType,
          installPath: '',
          message: `Unknown install type: ${installType}`,
          errors: [`Unsupported waggle_install_type: ${installType}`],
        };
    }

    // Record in installations table if successful. Settings VALUES are
    // typically API keys (§7.1 vault-only secrets) — persist only the keys so
    // the row still documents WHICH settings were supplied without duplicating
    // the secrets into a third plaintext store (.mcp.json already carries the
    // resolved env; see server local/mcp-config.ts for the accepted exposure).
    if (result.success) {
      const settingKeys = Object.fromEntries(
        Object.keys(request.settings ?? {}).map((k) => [k, '[redacted]']),
      );
      if (!(installType === 'mcp' && wasInstalled)) {
        this.db.recordInstallation(
          pkg.id,
          pkg.version,
          result.installPath,
          settingKeys,
        );
      }
      // Attach scan result to install result
      result.scanResult = scanResult;
    }

    return result;
  }

  /**
   * Scan a package without installing it.
   */
  async scanOnly(packageId: number): Promise<ScanResult | null> {
    const pkg = this.db.getPackage(packageId);
    if (!pkg) return null;

    let content: string | undefined;
    try {
      content = await this.resolveContent(pkg);
    } catch { /* will scan without content */ }

    const result = await this.security.scan(pkg, content);
    this.recordScanResult(pkg.id, result);
    return result;
  }

  /**
   * Get a formatted security report for a package.
   */
  async getSecurityReport(packageId: number): Promise<string> {
    const result = await this.scanOnly(packageId);
    if (!result) return 'Package not found.';
    return this.security.formatReport(result);
  }

  /**
   * Install an entire capability pack.
   */
  async installPack(packSlug: string, options?: { force?: boolean }): Promise<PackInstallResult> {
    const packData = this.db.getPacksBySlug(packSlug);
    if (!packData) {
      return {
        packSlug,
        packName: packSlug,
        totalPackages: 0,
        installed: [],
        skipped: [],
        failed: [],
      };
    }

    const result: PackInstallResult = {
      packSlug,
      packName: packData.pack.display_name,
      totalPackages: packData.packages.length,
      installed: [],
      skipped: [],
      failed: [],
    };

    for (const pkg of packData.packages) {
      if (!options?.force && this.db.isInstalled(pkg.id)) {
        result.skipped.push(pkg.display_name);
        continue;
      }

      const installResult = await this.install({
        packageId: pkg.id,
        force: options?.force,
      });

      if (installResult.success) {
        result.installed.push(installResult);
      } else {
        result.failed.push(installResult);
      }
    }

    return result;
  }

  /**
   * Uninstall a package.
   */
  async uninstall(packageId: number): Promise<InstallResult> {
    const pkg = this.db.getPackage(packageId);
    if (!pkg) {
      return {
        success: false,
        packageId,
        packageName: 'unknown',
        installType: 'skill',
        installPath: '',
        message: 'Package not found.',
      };
    }

    const installType = pkg.waggle_install_type as InstallationType;

    try {
      switch (installType) {
        case 'skill':
          await this.uninstallSkill(pkg);
          break;
        case 'plugin':
          await this.uninstallPlugin(pkg);
          break;
        case 'mcp':
          await this.uninstallMcp(pkg);
          break;
      }

      this.db.markUninstalled(packageId);

      return {
        success: true,
        packageId: pkg.id,
        packageName: pkg.name,
        installType,
        installPath: pkg.waggle_install_path,
        message: `${pkg.display_name} has been uninstalled.`,
      };
    } catch (err) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType,
        installPath: pkg.waggle_install_path,
        message: `Failed to uninstall: ${(err as Error).message}`,
        errors: [(err as Error).message],
      };
    }
  }

  // ─── Skill Installation ───────────────────────────────────────────

  private async installSkill(
    pkg: MarketplacePackage,
    request: InstallRequest,
    scannedContent: string | undefined,
  ): Promise<InstallResult> {
    const skillName = pkg.name;
    let installPath = request.installPath || '';

    try {
      installPath = resolveManagedInstallPath(SKILLS_DIR, request.installPath || `${skillName}.md`);
      if (existsSync(installPath) && !request.force) {
        throw new Error(`Skill destination already exists: ${installPath}`);
      }
      if (scannedContent === undefined) {
        throw new Error('Unable to resolve the exact skill content for security scanning.');
      }
      const content = scannedContent;

      // Ensure skills directory exists
      mkdirSync(dirname(installPath), { recursive: true });

      // Write the skill file
      writeFileSync(installPath, content, 'utf-8');

      // Notify Waggle server if running
      await this.notifyServer('PUT', `/api/skills/${skillName}`, {
        name: skillName,
        content,
      });

      return {
        success: true,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'skill',
        installPath,
        message: `Skill "${pkg.display_name}" installed to ${installPath}`,
      };
    } catch (err) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'skill',
        installPath,
        message: `Failed to install skill: ${(err as Error).message}`,
        errors: [(err as Error).message],
      };
    }
  }

  // ─── Plugin Installation ──────────────────────────────────────────

  private async installPlugin(pkg: MarketplacePackage, request: InstallRequest): Promise<InstallResult> {
    const pluginName = pkg.name;
    let pluginDir = '';
    let createdPluginDir = false;
    const manifest = pkg.install_manifest as InstallManifest | null;

    try {
      pluginDir = resolveManagedInstallPath(PLUGINS_DIR, request.installPath || pluginName);
      if (isPluginRegistryPath(pluginDir)) {
        throw new Error('Plugin destination conflicts with the marketplace registry');
      }
      if (existsSync(pluginDir)) {
        if (!request.force) {
          throw new Error(`Plugin destination already exists: ${pluginDir}`);
        }
      } else {
        mkdirSync(pluginDir, { recursive: true });
        createdPluginDir = true;
      }

      // Step 1: Write plugin.json from preflight-validated metadata.
      const sourcePluginManifest: PluginManifest = manifest?.plugin_manifest || {
        name: pluginName,
        version: pkg.version,
        description: pkg.description,
        skills: [],
        mcpServers: [],
      };
      const pluginSettings = sourcePluginManifest.settingsSchema ? request.settings : undefined;
      const pluginManifest: PluginManifest = {
        ...sourcePluginManifest,
        ...(sourcePluginManifest.skills && { skills: [...sourcePluginManifest.skills] }),
        ...(sourcePluginManifest.mcpServers && {
          mcpServers: sourcePluginManifest.mcpServers.map(server => (
            configureMarketplaceMcpServer(server, pluginSettings)
          )),
        }),
      };

      writeFileSync(
        join(pluginDir, 'plugin.json'),
        JSON.stringify(pluginManifest, null, 2),
        'utf-8',
      );

      // Step 2: Update registry.json
      this.updatePluginRegistry(pluginName, pluginManifest);

      // Step 3: Notify server
      await this.notifyServer('POST', '/api/plugins/install', {
        path: pluginDir,
      });

      return {
        success: true,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'plugin',
        installPath: pluginDir,
        message: `Plugin "${pkg.display_name}" installed to ${pluginDir}`,
      };
    } catch (err) {
      // Clean up on failure
      if (createdPluginDir && pluginDir && existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
      }
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'plugin',
        installPath: pluginDir,
        message: `Failed to install plugin: ${(err as Error).message}`,
        errors: [(err as Error).message],
      };
    }
  }

  // ─── MCP Server Installation ──────────────────────────────────────

  private async installMcp(pkg: MarketplacePackage, request: InstallRequest): Promise<InstallResult> {
    const manifest = pkg.install_manifest as InstallManifest | null;
    const mcpConfig = manifest?.mcp_config;

    if (!mcpConfig) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'mcp',
        installPath: mcpConfigPath(),
        message: 'No MCP server configuration found in package manifest.',
        errors: ['Missing mcp_config in install_manifest'],
      };
    }

    try {
      assertSafeMarketplaceMcpConfig(mcpConfig);

      // Step 1: Apply user settings to the exact matching env vars. npx/uvx
      // resolves the curated package when the MCP process starts; installation
      // must not execute package lifecycle scripts.
      const serverConfig = configureMarketplaceMcpServer(mcpConfig, request.settings);

      // Step 2: Update .mcp.json
      this.updateMcpConfig(serverConfig, mcpConfig, request.settings);

      return {
        success: true,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'mcp',
        installPath: mcpConfigPath(),
        message: `MCP server "${pkg.display_name}" added to ${mcpConfigPath()}`,
        mcpSourceConfig: {
          name: mcpConfig.name,
          command: mcpConfig.command,
          args: [...mcpConfig.args],
          ...(mcpConfig.env && { env: { ...mcpConfig.env } }),
        },
      };
    } catch (err) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'mcp',
        installPath: mcpConfigPath(),
        message: `Failed to install MCP server: ${(err as Error).message}`,
        errors: [(err as Error).message],
      };
    }
  }

  // ─── Uninstallation ───────────────────────────────────────────────

  private async uninstallSkill(pkg: MarketplacePackage): Promise<void> {
    const skillPath = resolveManagedInstallPath(SKILLS_DIR, `${pkg.name}.md`);
    if (existsSync(skillPath)) {
      rmSync(skillPath);
    }
    await this.notifyServer('DELETE', `/api/skills/${pkg.name}`);
  }

  private async uninstallPlugin(pkg: MarketplacePackage): Promise<void> {
    const pluginDir = resolveManagedInstallPath(PLUGINS_DIR, pkg.name);
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true, force: true });
    }
    this.removeFromPluginRegistry(pkg.name);
    await this.notifyServer('DELETE', `/api/plugins/${pkg.name}`);
  }

  private async uninstallMcp(pkg: MarketplacePackage): Promise<void> {
    const manifest = pkg.install_manifest as InstallManifest | null;
    const serverName = manifest?.mcp_config?.name || pkg.name;
    this.removeMcpConfig(serverName);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the downloadable content for a package (for pre-install scanning).
   */
  private async resolveContent(pkg: MarketplacePackage): Promise<string | undefined> {
    const manifest = pkg.install_manifest as InstallManifest | null;

    if (pkg.waggle_install_type === 'skill') {
      if (manifest?.skill_content) return manifest.skill_content;
      if (manifest?.skill_url) return this.fetchContent(manifest.skill_url);
      if (pkg.repository_url) {
        const rawUrl = this.githubRawUrl(pkg.repository_url, 'SKILL.md');
        return this.fetchContent(rawUrl);
      }
      return this.generateSkillStub(pkg);
    }

    if (pkg.waggle_install_type === 'mcp') {
      return JSON.stringify({
        name: pkg.name,
        description: pkg.description,
        install_type: pkg.waggle_install_type,
        install_manifest: manifest,
      });
    }

    if (pkg.waggle_install_type === 'plugin') {
      return JSON.stringify({
        name: pkg.name,
        description: pkg.description,
        install_type: pkg.waggle_install_type,
        install_manifest: manifest,
      });
    }

    return undefined;
  }

  /**
   * Record a security scan result in the database.
   */
  private recordScanResult(packageId: number, result: ScanResult): void {
    try {
      // Update package security columns
      const db = this.db.getRawDb(); // Access underlying better-sqlite3 instance
      if (db && db.prepare) {
        db.prepare(`
          UPDATE packages SET
            security_status = ?,
            security_score = ?,
            last_scanned_at = ?,
            content_hash = ?,
            scan_engines = ?,
            scan_findings = ?,
            scan_blocked = ?
          WHERE id = ?
        `).run(
          result.overall_severity.toLowerCase(),
          result.security_score,
          result.scanned_at,
          result.content_hash,
          JSON.stringify(result.engines_used),
          JSON.stringify(result.findings),
          result.blocked ? 1 : 0,
          packageId,
        );

        // Insert into scan_history
        db.prepare(`
          INSERT INTO scan_history
            (package_id, scanned_at, overall_severity, security_score, content_hash, engines_used, findings, blocked, scan_duration_ms, triggered_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          packageId,
          result.scanned_at,
          result.overall_severity,
          result.security_score,
          result.content_hash,
          JSON.stringify(result.engines_used),
          JSON.stringify(result.findings),
          result.blocked ? 1 : 0,
          result.scan_duration_ms,
          'install',
        );
      }
    } catch (err) {
      console.warn(`[security] Failed to record scan result: ${(err as Error).message}`);
    }
  }

  private ensureDirectories(): void {
    mkdirSync(SKILLS_DIR, { recursive: true });
    mkdirSync(PLUGINS_DIR, { recursive: true });
    if (!existsSync(REGISTRY_PATH)) {
      writeFileSync(REGISTRY_PATH, JSON.stringify({ plugins: {} }, null, 2), 'utf-8');
    }
  }

  private async fetchContent(url: string): Promise<string> {
    // External skill content — routed through the injected (SSRF-guarded)
    // fetcher so a malicious skill_url cannot pull an internal/link-local host.
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  private githubRawUrl(repoUrl: string, filePath: string): string {
    // Convert https://github.com/user/repo to https://raw.githubusercontent.com/user/repo/main/filePath
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return repoUrl;
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/${filePath}`;
  }

  private generateSkillStub(pkg: MarketplacePackage): string {
    return `# ${pkg.display_name}

${pkg.description}

> Installed from Waggle Marketplace (source: ${pkg.author || 'community'})
> Category: ${pkg.category}
> Version: ${pkg.version}

---

## Instructions

This skill was installed from the marketplace. Configure or extend it as needed for your workflow.
`;
  }

  private updatePluginRegistry(name: string, manifest: PluginManifest): void {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    registry.plugins[name] = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      skills: manifest.skills || [],
      mcpServers: manifest.mcpServers || [],
    };
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  }

  private removeFromPluginRegistry(name: string): void {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    delete registry.plugins[name];
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  }

  private updateMcpConfig(
    serverConfig: McpServerConfig,
    sourceConfig: McpServerConfig,
    settings: Record<string, string> | undefined,
  ): void {
    assertSafeConfiguredMarketplaceMcpConfig(serverConfig, sourceConfig, settings);
    let mcpJson: McpConfigFile = { mcpServers: {} };
    if (existsSync(mcpConfigPath())) {
      mcpJson = JSON.parse(readFileSync(mcpConfigPath(), 'utf-8')) as McpConfigFile;
    }
    mcpJson.mcpServers[serverConfig.name] = {
      command: serverConfig.command,
      args: serverConfig.args,
      ...(serverConfig.env && { env: serverConfig.env }),
    };
    writeFileSync(mcpConfigPath(), JSON.stringify(mcpJson, null, 2), 'utf-8');
  }

  private removeMcpConfig(serverName: string): void {
    if (!existsSync(mcpConfigPath())) return;
    const mcpJson = JSON.parse(readFileSync(mcpConfigPath(), 'utf-8')) as McpConfigFile;
    delete mcpJson.mcpServers[serverName];
    writeFileSync(mcpConfigPath(), JSON.stringify(mcpJson, null, 2), 'utf-8');
  }

  private async notifyServer(method: string, path: string, body?: unknown): Promise<void> {
    try {
      await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Server not running — that's fine, files are already on disk
    }
  }
}
