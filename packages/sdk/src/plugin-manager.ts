/**
 * Plugin manager for installing, listing, and uninstalling Waggle plugins.
 * Uses a registry.json file in the plugins directory to track installed plugins.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type PluginManifest, validatePluginManifest } from './plugin-manifest.js';
import { PluginRuntimeManager } from './plugin-runtime.js';

interface PluginRegistry {
  plugins: Record<string, PluginManifest>;
}

export class PluginManager {
  private readonly pluginsDir: string;
  private readonly registryPath: string;

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
    this.registryPath = path.join(pluginsDir, 'registry.json');
    this.ensurePluginsDir();
  }

  /**
   * Returns a list of all installed plugins.
   */
  list(): PluginManifest[] {
    const registry = this.readRegistry();
    return Object.values(registry.plugins);
  }

  /**
   * Installs a plugin from a local directory.
   * The source directory must contain a valid plugin.json manifest.
   * Copies the plugin into the plugins directory and registers it.
   */
  installLocal(sourceDir: string): void {
    const manifestPath = path.join(sourceDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No plugin.json found in ${sourceDir}`);
    }

    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    const validation = validatePluginManifest(rawManifest);
    if (!validation.valid) {
      throw new Error(`Invalid plugin manifest: ${validation.errors.join(', ')}`);
    }

    const manifest = rawManifest as unknown as PluginManifest;
    const destDir = path.join(this.pluginsDir, manifest.name);

    // Copy plugin directory to plugins dir
    this.copyDirSync(sourceDir, destDir);

    // Update registry
    const registry = this.readRegistry();
    registry.plugins[manifest.name] = manifest;
    this.writeRegistry(registry);
  }

  /**
   * Uninstalls a plugin by name.
   * Removes the plugin directory and its registry entry.
   */
  uninstall(name: string): void {
    const registry = this.readRegistry();
    if (!(name in registry.plugins)) {
      throw new Error(`Plugin "${name}" is not installed`);
    }

    // Remove plugin directory
    const pluginDir = path.join(this.pluginsDir, name);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    // Update registry
    delete registry.plugins[name];
    this.writeRegistry(registry);
  }

  /**
   * Create a PluginRuntimeManager seeded with all installed plugins.
   * Each plugin is registered in the 'installed' state — call enable() to activate.
   */
  toRuntimeManager(): PluginRuntimeManager {
    const manager = new PluginRuntimeManager();
    for (const manifest of this.list()) {
      manager.register(manifest);
    }
    return manager;
  }

  private ensurePluginsDir(): void {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }
  }

  private readRegistry(): PluginRegistry {
    if (!fs.existsSync(this.registryPath)) {
      return { plugins: {} };
    }
    return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8')) as PluginRegistry;
  }

  private writeRegistry(registry: PluginRegistry): void {
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  }

  private copyDirSync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
