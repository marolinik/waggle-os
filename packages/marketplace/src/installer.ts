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
 * MCP:     Add server config to .mcp.json (or bundle inside a plugin).
 *          Optionally install npm package via npx.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { MarketplaceDB } from './db';
import { SecurityGate, type ScanResult, type SecurityGateConfig } from './security';
import type {
  MarketplacePackage,
  InstallManifest,
  InstallRequest,
  InstallResult,
  PackInstallResult,
  InstallationType,
  McpServerConfig,
  PluginManifest,
} from './types';

const WAGGLE_DIR = join(homedir(), '.waggle');
const SKILLS_DIR = join(WAGGLE_DIR, 'skills');
const PLUGINS_DIR = join(WAGGLE_DIR, 'plugins');
const REGISTRY_PATH = join(PLUGINS_DIR, 'registry.json');
const MCP_CONFIG_PATH = join(process.cwd(), '.mcp.json');

/** Waggle server API base URL (when running locally) */
const API_BASE = process.env.WAGGLE_API_URL || 'http://localhost:3000';

export class MarketplaceInstaller {
  private db: MarketplaceDB;
  private security: SecurityGate;

  constructor(db: MarketplaceDB, securityConfig?: Partial<SecurityGateConfig>) {
    this.db = db;
    this.security = new SecurityGate(securityConfig);
    this.ensureDirectories();
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

    // Check if already installed
    if (!request.force && this.db.isInstalled(pkg.id)) {
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
    const installType = pkg.waggle_install_type as InstallationType;
    let result: InstallResult;

    switch (installType) {
      case 'skill':
        result = await this.installSkill(pkg, request);
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

    // Record in installations table if successful
    if (result.success) {
      this.db.recordInstallation(
        pkg.id,
        pkg.version,
        result.installPath,
        request.settings || {},
      );
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

  private async installSkill(pkg: MarketplacePackage, request: InstallRequest): Promise<InstallResult> {
    const skillName = pkg.name;
    const installPath = request.installPath || join(SKILLS_DIR, `${skillName}.md`);
    const manifest = pkg.install_manifest as InstallManifest | null;

    try {
      let content: string;

      if (manifest?.skill_content) {
        // Inline content from database
        content = manifest.skill_content;
      } else if (manifest?.skill_url) {
        // Fetch from URL (GitHub raw, ClawHub API, etc.)
        content = await this.fetchContent(manifest.skill_url);
      } else if (pkg.repository_url) {
        // Try to fetch SKILL.md from repository
        const rawUrl = this.githubRawUrl(pkg.repository_url, 'SKILL.md');
        content = await this.fetchContent(rawUrl);
      } else {
        // Generate a stub skill file from package metadata
        content = this.generateSkillStub(pkg);
      }

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
    const pluginDir = request.installPath || join(PLUGINS_DIR, pluginName);
    const manifest = pkg.install_manifest as InstallManifest | null;

    try {
      mkdirSync(pluginDir, { recursive: true });

      // Step 1: Clone repo or create from manifest
      if (manifest?.git_url) {
        execSync(`git clone --depth 1 ${manifest.git_url} ${pluginDir}`, {
          stdio: 'pipe',
          timeout: 60_000,
        });
      }

      // Step 2: Write plugin.json
      const pluginManifest: PluginManifest = manifest?.plugin_manifest || {
        name: pluginName,
        version: pkg.version,
        description: pkg.description,
        skills: [],
        mcpServers: [],
      };

      // Apply user settings to the manifest
      if (request.settings && pluginManifest.settingsSchema) {
        for (const [key, value] of Object.entries(request.settings)) {
          // Inject settings into MCP server env vars
          pluginManifest.mcpServers?.forEach(server => {
            if (server.env) {
              for (const envKey of Object.keys(server.env)) {
                if (server.env[envKey] === `\${${key}}`) {
                  server.env[envKey] = value;
                }
              }
            }
          });
        }
      }

      writeFileSync(
        join(pluginDir, 'plugin.json'),
        JSON.stringify(pluginManifest, null, 2),
        'utf-8',
      );

      // Step 3: Install bundled skills
      if (pluginManifest.skills && pluginManifest.skills.length > 0) {
        const skillsDir = join(pluginDir, 'skills');
        mkdirSync(skillsDir, { recursive: true });

        for (const skillName of pluginManifest.skills) {
          const skillPath = join(skillsDir, `${skillName}.md`);
          if (!existsSync(skillPath)) {
            // Try to find the skill in marketplace and install it into the plugin
            const skillPkg = this.db.getPackageByName(skillName);
            if (skillPkg?.install_manifest) {
              const skillManifest = skillPkg.install_manifest as InstallManifest;
              if (skillManifest.skill_url) {
                const content = await this.fetchContent(skillManifest.skill_url);
                writeFileSync(skillPath, content, 'utf-8');
              }
            }
          }
        }
      }

      // Step 4: Update registry.json
      this.updatePluginRegistry(pluginName, pluginManifest);

      // Step 5: Run post-install hooks
      if (manifest?.post_install) {
        for (const hook of manifest.post_install) {
          await this.runPostInstallHook(hook, pluginDir);
        }
      }

      // Step 6: Notify server
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
      if (existsSync(pluginDir)) {
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
        installPath: MCP_CONFIG_PATH,
        message: 'No MCP server configuration found in package manifest.',
        errors: ['Missing mcp_config in install_manifest'],
      };
    }

    try {
      // Step 1: Install npm package if needed
      if (manifest?.npm_package) {
        const args = manifest.npm_args?.join(' ') || '';
        execSync(`npm install -g ${manifest.npm_package} ${args}`, {
          stdio: 'pipe',
          timeout: 120_000,
        });
      }

      // Step 2: Apply user settings to env vars
      const serverConfig = { ...mcpConfig };
      if (request.settings && serverConfig.env) {
        for (const [key, value] of Object.entries(request.settings)) {
          for (const envKey of Object.keys(serverConfig.env)) {
            if (serverConfig.env[envKey] === `\${${key}}` || serverConfig.env[envKey] === '') {
              serverConfig.env[envKey] = value;
            }
          }
        }
      }

      // Step 3: Update .mcp.json
      this.updateMcpConfig(serverConfig);

      return {
        success: true,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'mcp',
        installPath: MCP_CONFIG_PATH,
        message: `MCP server "${pkg.display_name}" added to ${MCP_CONFIG_PATH}`,
      };
    } catch (err) {
      return {
        success: false,
        packageId: pkg.id,
        packageName: pkg.name,
        installType: 'mcp',
        installPath: MCP_CONFIG_PATH,
        message: `Failed to install MCP server: ${(err as Error).message}`,
        errors: [(err as Error).message],
      };
    }
  }

  // ─── Uninstallation ───────────────────────────────────────────────

  private async uninstallSkill(pkg: MarketplacePackage): Promise<void> {
    const skillPath = join(SKILLS_DIR, `${pkg.name}.md`);
    if (existsSync(skillPath)) {
      rmSync(skillPath);
    }
    await this.notifyServer('DELETE', `/api/skills/${pkg.name}`);
  }

  private async uninstallPlugin(pkg: MarketplacePackage): Promise<void> {
    const pluginDir = join(PLUGINS_DIR, pkg.name);
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
      // For MCPs, "content" is the config + description for scanning
      return JSON.stringify({
        name: manifest?.mcp_config?.name || pkg.name,
        description: pkg.description,
        args: manifest?.mcp_config?.args || [],
        env: manifest?.mcp_config?.env || {},
      });
    }

    if (pkg.waggle_install_type === 'plugin') {
      // For plugins, return the manifest as content
      if (manifest?.plugin_manifest) {
        return JSON.stringify(manifest.plugin_manifest);
      }
    }

    return undefined;
  }

  /**
   * Record a security scan result in the database.
   */
  private recordScanResult(packageId: number, result: ScanResult): void {
    try {
      // Update package security columns
      const db = (this.db as any).db; // Access underlying better-sqlite3 instance
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
    const response = await fetch(url);
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

  private updateMcpConfig(serverConfig: McpServerConfig): void {
    let mcpJson: { mcpServers: Record<string, any> } = { mcpServers: {} };
    if (existsSync(MCP_CONFIG_PATH)) {
      mcpJson = JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf-8'));
    }
    mcpJson.mcpServers[serverConfig.name] = {
      command: serverConfig.command,
      args: serverConfig.args,
      ...(serverConfig.env && { env: serverConfig.env }),
    };
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(mcpJson, null, 2), 'utf-8');
  }

  private removeMcpConfig(serverName: string): void {
    if (!existsSync(MCP_CONFIG_PATH)) return;
    const mcpJson = JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf-8'));
    delete mcpJson.mcpServers[serverName];
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(mcpJson, null, 2), 'utf-8');
  }

  private async runPostInstallHook(hook: any, cwd: string): Promise<void> {
    switch (hook.type) {
      case 'run_command':
        if (hook.command) {
          execSync(hook.command, { cwd, stdio: 'pipe', timeout: 30_000 });
        }
        break;
      case 'create_file':
        if (hook.path && hook.content) {
          const fullPath = join(cwd, hook.path);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, hook.content, 'utf-8');
        }
        break;
      case 'append_config':
        // Append to workspace config
        break;
    }
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
