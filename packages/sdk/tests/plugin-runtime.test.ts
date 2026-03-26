import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PluginRuntime,
  PluginRuntimeManager,
  webResearchPluginManifest,
  type PluginManifestWithTools,
  type PluginLifecycleState,
} from '../src/plugin-runtime.js';
import { PluginManager } from '../src/plugin-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simpleManifest(overrides: Partial<PluginManifestWithTools> = {}): PluginManifestWithTools {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    skills: ['test-skill'],
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PluginRuntime — single plugin
// ---------------------------------------------------------------------------

describe('PluginRuntime', () => {
  it('starts in installed state after construction', () => {
    const runtime = new PluginRuntime(simpleManifest());
    expect(runtime.getState()).toBe('installed');
  });

  it('enable() transitions to enabled then active', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    const states: PluginLifecycleState[] = [];
    runtime.on('stateChange', (e: { to: PluginLifecycleState }) => states.push(e.to));

    await runtime.enable();

    expect(runtime.getState()).toBe('active');
    expect(states).toEqual(['enabled', 'active']);
  });

  it('active plugin exposes contributed tools', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();

    const tools = runtime.getContributedTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');
    expect(tools[0].description).toBe('A test tool');
    expect(typeof tools[0].execute).toBe('function');
  });

  it('active plugin exposes contributed skills', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();

    const skills = runtime.getContributedSkills();
    expect(skills).toEqual(['test-skill']);
  });

  it('disable() removes tools and skills, transitions to disabled', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();

    runtime.disable();

    expect(runtime.getState()).toBe('disabled');
    expect(runtime.getContributedTools()).toEqual([]);
    expect(runtime.getContributedSkills()).toEqual([]);
  });

  it('re-enable after disable works', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();
    runtime.disable();
    expect(runtime.getState()).toBe('disabled');

    await runtime.enable();
    expect(runtime.getState()).toBe('active');
    expect(runtime.getContributedTools()).toHaveLength(1);
    expect(runtime.getContributedSkills()).toEqual(['test-skill']);
  });

  it('enters error state on activation failure (missing capability)', async () => {
    const runtime = new PluginRuntime(simpleManifest(), {
      requiredCapabilities: ['network'],
      availableCapabilities: [],
    });

    await expect(runtime.enable()).rejects.toThrow('Missing required capability: network');
    expect(runtime.getState()).toBe('error');
  });

  it('can re-enable from error state', async () => {
    // Use a counter-based executor that throws on first activation, succeeds on second
    let callCount = 0;
    const flakyExecutor = (def: { name: string; description: string; parameters: Record<string, unknown> }) => {
      callCount++;
      if (callCount <= 1) {
        throw new Error('Transient activation failure');
      }
      return async () => 'ok';
    };

    const runtime = new PluginRuntime(simpleManifest(), {
      toolExecutor: flakyExecutor,
    });

    // First enable() fails — toolExecutor throws during activation
    await expect(runtime.enable()).rejects.toThrow('Transient activation failure');
    expect(runtime.getState()).toBe('error');

    // Second enable() succeeds — same runtime, error → enabled → active
    await runtime.enable();
    expect(runtime.getState()).toBe('active');
    expect(runtime.getContributedTools()).toHaveLength(1);
  });

  it('enable() on already-active plugin is a no-op', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();
    expect(runtime.getState()).toBe('active');

    const stateChanges: string[] = [];
    runtime.on('stateChange', (e: { to: string }) => stateChanges.push(e.to));

    await runtime.enable(); // no-op
    expect(runtime.getState()).toBe('active');
    expect(stateChanges).toEqual([]); // no transitions fired
  });

  it('disable() on already-disabled plugin is a no-op', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();
    runtime.disable();
    expect(runtime.getState()).toBe('disabled');

    const stateChanges: string[] = [];
    runtime.on('stateChange', (e: { to: string }) => stateChanges.push(e.to));

    runtime.disable(); // no-op
    expect(runtime.getState()).toBe('disabled');
    expect(stateChanges).toEqual([]);
  });

  it('emits stateChange events with from/to', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    const events: Array<{ plugin: string; from: string; to: string }> = [];
    runtime.on('stateChange', (e) => events.push(e));

    await runtime.enable();

    expect(events).toEqual([
      { plugin: 'test-plugin', from: 'installed', to: 'enabled' },
      { plugin: 'test-plugin', from: 'enabled', to: 'active' },
    ]);
  });

  it('emits error event on activation failure', async () => {
    const runtime = new PluginRuntime(simpleManifest(), {
      requiredCapabilities: ['gpu'],
      availableCapabilities: [],
    });

    const errors: Array<{ plugin: string; error: Error }> = [];
    runtime.on('error', (e) => errors.push(e));

    await runtime.enable().catch(() => {}); // swallow throw

    expect(errors).toHaveLength(1);
    expect(errors[0].plugin).toBe('test-plugin');
    expect(errors[0].error.message).toContain('gpu');
  });

  it('uses custom tool executor when provided', async () => {
    const customExecutor = vi.fn(() => async () => 'custom-result');
    const runtime = new PluginRuntime(simpleManifest(), { toolExecutor: customExecutor });
    await runtime.enable();

    const tools = runtime.getContributedTools();
    expect(customExecutor).toHaveBeenCalledTimes(1);
    const result = await tools[0].execute({});
    expect(result).toBe('custom-result');
  });

  it('default executor returns JSON with tool name and args', async () => {
    const runtime = new PluginRuntime(simpleManifest());
    await runtime.enable();

    const result = await runtime.getContributedTools()[0].execute({ foo: 'bar' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ tool: 'test_tool', args: { foo: 'bar' }, status: 'executed' });
  });
});

// ---------------------------------------------------------------------------
// PluginRuntimeManager — multi-plugin management
// ---------------------------------------------------------------------------

describe('PluginRuntimeManager', () => {
  it('registers a plugin in installed state', () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest());

    const states = mgr.getPluginStates();
    expect(states['test-plugin']).toBe('installed');
  });

  it('registers multiple plugins', () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest({ name: 'plugin-a' }));
    mgr.register(simpleManifest({ name: 'plugin-b' }));

    const states = mgr.getPluginStates();
    expect(Object.keys(states)).toHaveLength(2);
    expect(states['plugin-a']).toBe('installed');
    expect(states['plugin-b']).toBe('installed');
  });

  it('throws on duplicate registration', () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest());
    expect(() => mgr.register(simpleManifest())).toThrow('already registered');
  });

  it('enables and activates a plugin', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest());

    await mgr.enable('test-plugin');
    expect(mgr.getPluginStates()['test-plugin']).toBe('active');
  });

  it('disables a plugin', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest());
    await mgr.enable('test-plugin');

    mgr.disable('test-plugin');
    expect(mgr.getPluginStates()['test-plugin']).toBe('disabled');
  });

  it('getActive() returns only active plugins', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest({ name: 'active-one' }));
    mgr.register(simpleManifest({ name: 'inactive-one' }));

    await mgr.enable('active-one');

    const active = mgr.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].getManifest().name).toBe('active-one');
  });

  it('getAllTools() aggregates tools from all active plugins', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(
      simpleManifest({
        name: 'plugin-a',
        tools: [{ name: 'tool_a', description: 'Tool A', parameters: {} }],
      })
    );
    mgr.register(
      simpleManifest({
        name: 'plugin-b',
        tools: [{ name: 'tool_b', description: 'Tool B', parameters: {} }],
      })
    );

    await mgr.enable('plugin-a');
    await mgr.enable('plugin-b');

    const tools = mgr.getAllTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(['tool_a', 'tool_b']);
  });

  it('getAllSkills() aggregates skills from all active plugins', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest({ name: 'p1', skills: ['skill-a'] }));
    mgr.register(simpleManifest({ name: 'p2', skills: ['skill-b', 'skill-c'] }));

    await mgr.enable('p1');
    await mgr.enable('p2');

    const skills = mgr.getAllSkills();
    expect(skills.sort()).toEqual(['skill-a', 'skill-b', 'skill-c']);
  });

  it('getPluginStates() returns all plugin states', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest({ name: 'a' }));
    mgr.register(simpleManifest({ name: 'b' }));
    mgr.register(simpleManifest({ name: 'c' }));

    await mgr.enable('a');
    await mgr.enable('b');
    mgr.disable('b');

    expect(mgr.getPluginStates()).toEqual({
      a: 'active',
      b: 'disabled',
      c: 'installed',
    });
  });

  it('forwards stateChange events from plugins', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(simpleManifest());

    const events: Array<{ plugin: string; to: string }> = [];
    mgr.on('stateChange', (e) => events.push(e));

    await mgr.enable('test-plugin');

    expect(events).toHaveLength(2); // enabled, active
    expect(events[0].to).toBe('enabled');
    expect(events[1].to).toBe('active');
  });

  it('throws when enabling unregistered plugin', async () => {
    const mgr = new PluginRuntimeManager();
    await expect(mgr.enable('nonexistent')).rejects.toThrow('not registered');
  });
});

// ---------------------------------------------------------------------------
// Flagship plugin fixture — web-research
// ---------------------------------------------------------------------------

describe('webResearchPluginManifest', () => {
  it('has correct name and tools', () => {
    expect(webResearchPluginManifest.name).toBe('web-research');
    expect(webResearchPluginManifest.tools).toHaveLength(2);
    expect(webResearchPluginManifest.tools!.map((t) => t.name)).toEqual(['web_scrape', 'web_summarize']);
  });

  it('can be registered and activated via PluginRuntimeManager', async () => {
    const mgr = new PluginRuntimeManager();
    mgr.register(webResearchPluginManifest);
    await mgr.enable('web-research');

    const tools = mgr.getAllTools();
    expect(tools).toHaveLength(2);
    expect(mgr.getAllSkills()).toEqual(['web-research']);
  });
});

// ---------------------------------------------------------------------------
// PluginManager.toRuntimeManager — bridge from filesystem to runtime
// ---------------------------------------------------------------------------

describe('PluginManager.toRuntimeManager', () => {
  let tmpDir: string;

  function createTestPlugin(pluginsDir: string, name: string): void {
    const pluginDir = path.join(pluginsDir, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    const manifest = {
      name,
      version: '1.0.0',
      description: `Test plugin ${name}`,
      skills: [`${name}-skill`],
      tools: [
        { name: `${name}_tool`, description: `Tool from ${name}`, parameters: { type: 'object', properties: {} } },
      ],
    };
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest));
  }

  it('creates a PluginRuntimeManager with all installed plugins', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pm-bridge-'));
    const pm = new PluginManager(tmpDir);

    // Install two test plugins
    const srcA = path.join(tmpDir, '_src_a');
    const srcB = path.join(tmpDir, '_src_b');
    createTestPlugin(tmpDir, '_src_a');
    createTestPlugin(tmpDir, '_src_b');

    // installLocal copies and registers
    pm.installLocal(srcA);
    pm.installLocal(srcB);

    const rtm = pm.toRuntimeManager();
    const states = rtm.getPluginStates();

    expect(Object.keys(states)).toHaveLength(2);
    expect(states['_src_a']).toBe('installed');
    expect(states['_src_b']).toBe('installed');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runtime manager plugins can be enabled and contribute tools', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pm-bridge2-'));
    const pm = new PluginManager(tmpDir);

    const srcDir = path.join(tmpDir, '_src_plug');
    createTestPlugin(tmpDir, '_src_plug');
    pm.installLocal(srcDir);

    const rtm = pm.toRuntimeManager();
    await rtm.enable('_src_plug');

    const tools = rtm.getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('_src_plug_tool');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty manager when no plugins installed', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pm-empty-'));
    const pm = new PluginManager(tmpDir);

    const rtm = pm.toRuntimeManager();
    expect(Object.keys(rtm.getPluginStates())).toHaveLength(0);
    expect(rtm.getAllTools()).toEqual([]);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
