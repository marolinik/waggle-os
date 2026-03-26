/**
 * Plugin runtime lifecycle management for Waggle plugins.
 *
 * Provides an in-memory state machine for plugin lifecycle (installed → enabled → active → disabled)
 * and tool/skill auto-registration. No filesystem interaction — that's PluginManager's job.
 */

import { EventEmitter } from 'events';
import type { PluginManifest } from './plugin-manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lifecycle states for a plugin runtime */
export type PluginLifecycleState = 'installed' | 'enabled' | 'active' | 'disabled' | 'error';

/** Tool definition contributed by a plugin (mirrors agent ToolDefinition shape) */
export interface PluginToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A fully-hydrated tool with an execute function, created during activation */
export interface PluginTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** Extended manifest that includes tool declarations */
export interface PluginManifestWithTools extends PluginManifest {
  tools?: PluginToolDef[];
}

/** Optional dependencies passed to activation */
export interface ActivationDependencies {
  /** Custom tool executor factory — given a PluginToolDef, return an execute function */
  toolExecutor?: (def: PluginToolDef) => (args: Record<string, unknown>) => Promise<string>;
  /** Required capabilities that must be present for activation to succeed */
  requiredCapabilities?: string[];
  /** Capabilities available in the current environment */
  availableCapabilities?: string[];
}

/** Events emitted by PluginRuntime */
export interface PluginRuntimeEvents {
  stateChange: (event: { plugin: string; from: PluginLifecycleState; to: PluginLifecycleState }) => void;
  error: (event: { plugin: string; error: Error }) => void;
}

// ---------------------------------------------------------------------------
// PluginRuntime — single plugin lifecycle
// ---------------------------------------------------------------------------

export class PluginRuntime extends EventEmitter {
  private state: PluginLifecycleState = 'installed';
  private readonly manifest: PluginManifestWithTools;
  private readonly deps: ActivationDependencies;
  private contributedTools: PluginTool[] = [];
  private contributedSkills: string[] = [];

  constructor(manifest: PluginManifestWithTools, deps?: ActivationDependencies) {
    super();
    this.manifest = manifest;
    this.deps = deps ?? {};
  }

  /** Current lifecycle state */
  getState(): PluginLifecycleState {
    return this.state;
  }

  /** The plugin manifest */
  getManifest(): PluginManifestWithTools {
    return this.manifest;
  }

  /** Tools contributed by this plugin (only populated when active) */
  getContributedTools(): PluginTool[] {
    return [...this.contributedTools];
  }

  /** Skills contributed by this plugin (only populated when active) */
  getContributedSkills(): string[] {
    return [...this.contributedSkills];
  }

  /**
   * Enable the plugin and attempt activation.
   * Transitions: installed|disabled|error → enabled → active (or error).
   */
  async enable(): Promise<void> {
    if (this.state === 'active' || this.state === 'enabled') {
      // Already active or mid-activation — no-op
      return;
    }
    if (this.state !== 'installed' && this.state !== 'disabled' && this.state !== 'error') {
      throw new Error(`Cannot enable plugin "${this.manifest.name}" from state "${this.state}"`);
    }
    this.transition('enabled');
    await this.activate();
  }

  /**
   * Activate the plugin — register tools and skills.
   * Called internally by enable(). Transitions enabled → active or enabled → error.
   */
  private async activate(): Promise<void> {
    try {
      // Check required capabilities
      const required = this.deps.requiredCapabilities ?? [];
      const available = this.deps.availableCapabilities ?? [];
      for (const cap of required) {
        if (!available.includes(cap)) {
          throw new Error(`Missing required capability: ${cap}`);
        }
      }

      // Build contributed tools
      const toolDefs = this.manifest.tools ?? [];
      const executor = this.deps.toolExecutor ?? defaultToolExecutor;
      this.contributedTools = toolDefs.map((def) => ({
        name: def.name,
        description: def.description,
        parameters: def.parameters,
        execute: executor(def),
      }));

      // Register contributed skills
      this.contributedSkills = [...(this.manifest.skills ?? [])];

      this.transition('active');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.transition('error');
      this.emit('error', { plugin: this.manifest.name, error });
      throw error;
    }
  }

  /**
   * Disable the plugin — remove tools and skills.
   * Transitions: active|enabled|error → disabled.
   */
  disable(): void {
    if (this.state === 'disabled' || this.state === 'installed') {
      // Already disabled or never enabled — no-op
      return;
    }
    this.contributedTools = [];
    this.contributedSkills = [];
    this.transition('disabled');
  }

  private transition(to: PluginLifecycleState): void {
    const from = this.state;
    this.state = to;
    this.emit('stateChange', { plugin: this.manifest.name, from, to });
  }
}

// ---------------------------------------------------------------------------
// Default tool executor (stub — returns plugin-name-prefixed acknowledgement)
// ---------------------------------------------------------------------------

function defaultToolExecutor(def: PluginToolDef): (args: Record<string, unknown>) => Promise<string> {
  return async (args) => {
    return JSON.stringify({ tool: def.name, args, status: 'executed' });
  };
}

// ---------------------------------------------------------------------------
// PluginRuntimeManager — manages multiple plugin runtimes
// ---------------------------------------------------------------------------

export class PluginRuntimeManager extends EventEmitter {
  private readonly plugins = new Map<string, PluginRuntime>();

  /**
   * Register a plugin in the `installed` state.
   * Returns the created PluginRuntime.
   */
  register(manifest: PluginManifestWithTools, deps?: ActivationDependencies): PluginRuntime {
    if (this.plugins.has(manifest.name)) {
      throw new Error(`Plugin "${manifest.name}" is already registered`);
    }
    const runtime = new PluginRuntime(manifest, deps);
    // Forward events
    runtime.on('stateChange', (event) => this.emit('stateChange', event));
    runtime.on('error', (event) => this.emit('error', event));
    this.plugins.set(manifest.name, runtime);
    return runtime;
  }

  /**
   * Enable a plugin by name.
   */
  async enable(name: string): Promise<void> {
    const runtime = this.getRuntime(name);
    await runtime.enable();
  }

  /**
   * Disable a plugin by name.
   */
  disable(name: string): void {
    const runtime = this.getRuntime(name);
    runtime.disable();
  }

  /**
   * Return all active plugin runtimes.
   */
  getActive(): PluginRuntime[] {
    return [...this.plugins.values()].filter((p) => p.getState() === 'active');
  }

  /**
   * Aggregate tools from all active plugins.
   */
  getAllTools(): PluginTool[] {
    return this.getActive().flatMap((p) => p.getContributedTools());
  }

  /**
   * Aggregate skills from all active plugins.
   */
  getAllSkills(): string[] {
    return this.getActive().flatMap((p) => p.getContributedSkills());
  }

  /**
   * Return state summary for all registered plugins.
   */
  getPluginStates(): Record<string, PluginLifecycleState> {
    const states: Record<string, PluginLifecycleState> = {};
    for (const [name, runtime] of this.plugins) {
      states[name] = runtime.getState();
    }
    return states;
  }

  /**
   * Get a specific plugin runtime by name.
   */
  getRuntime(name: string): PluginRuntime {
    const runtime = this.plugins.get(name);
    if (!runtime) {
      throw new Error(`Plugin "${name}" is not registered`);
    }
    return runtime;
  }
}

// ---------------------------------------------------------------------------
// Flagship plugin fixture — web-research
// ---------------------------------------------------------------------------

/** Web research plugin manifest (test fixture / example) */
export const webResearchPluginManifest: PluginManifestWithTools = {
  name: 'web-research',
  version: '1.0.0',
  description: 'Web research tools for scraping and summarizing web content',
  skills: ['web-research'],
  tools: [
    {
      name: 'web_scrape',
      description: 'Scrape content from a given URL and return the text',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to scrape' },
          selector: { type: 'string', description: 'Optional CSS selector to extract specific content' },
        },
        required: ['url'],
      },
    },
    {
      name: 'web_summarize',
      description: 'Summarize the content of a web page given its URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to summarize' },
          maxLength: { type: 'number', description: 'Maximum summary length in characters' },
        },
        required: ['url'],
      },
    },
  ],
};
