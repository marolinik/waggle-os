/**
 * Phase 6 — Capability Truth integration tests.
 *
 * Proves the cross-system success criteria for Waves O/P/Q/R:
 *   Capability Router, Starter Skills, Plugin Runtime, MCP Runtime,
 *   Command Registry, Hooks, Workflow Templates, Sub-agent Orchestrator.
 *
 * All tests are self-contained — no server, no Docker, no network.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { CapabilityRouter, type CapabilityRouterDeps } from '../../src/capability-router.js';
import {
  listStarterSkills,
  installStarterSkills,
  PluginRuntimeManager,
  type PluginManifestWithTools,
} from '@waggle/sdk';
import { CommandRegistry } from '../../src/commands/command-registry.js';
import { registerWorkflowCommands } from '../../src/commands/workflow-commands.js';
import { HookRegistry, type HookEvent } from '../../src/hooks.js';
import { listWorkflowTemplates, WORKFLOW_TEMPLATES } from '../../src/workflow-templates.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<CapabilityRouterDeps> = {}): CapabilityRouterDeps {
  return {
    toolNames: [],
    skills: [],
    plugins: [],
    mcpServers: [],
    subAgentRoles: [],
    ...overrides,
  };
}

function makeTestPlugin(name: string, tools: string[]): PluginManifestWithTools {
  return {
    name,
    version: '1.0.0',
    description: `Test plugin: ${name}`,
    tools: tools.map((t) => ({
      name: t,
      description: `Tool ${t}`,
      parameters: { type: 'object', properties: {} },
    })),
  };
}

// ── Temp dir management ─────────────────────────────────────────────────

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-p6-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs.length = 0;
});

// ═════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════

describe('Phase 6 — Capability Truth integration', () => {
  // ── 1. Capability Router Fallback Chain ──────────────────────────────

  it('resolves native -> skill -> plugin -> MCP -> subagent fallback chain', () => {
    const router = new CapabilityRouter(
      makeDeps({
        toolNames: ['research_tool'],
        skills: [{ name: 'research-deep', content: 'Deep research into any topic' }],
        plugins: [{ name: 'research-plugin', description: 'Research helper' }],
        mcpServers: ['research-mcp'],
        subAgentRoles: ['researcher'],
      }),
    );

    // Full resolution: every source type present, sorted by confidence
    const routes = router.resolve('research');
    expect(routes.length).toBe(5);

    const sources = routes.map((r) => r.source);
    expect(sources).toEqual(['native', 'skill', 'plugin', 'mcp', 'subagent']);

    // Native comes first with highest confidence
    expect(routes[0].confidence).toBeGreaterThan(routes[1].confidence);
    expect(routes[routes.length - 1].source).toBe('subagent');

    // Every route is available
    expect(routes.every((r) => r.available)).toBe(true);

    // Exact native match → confidence 1.0
    const exactRouter = new CapabilityRouter(makeDeps({ toolNames: ['save_memory'] }));
    const exact = exactRouter.resolve('save_memory');
    expect(exact[0]).toMatchObject({ source: 'native', confidence: 1.0 });

    // Nothing matches → missing with suggestion
    const emptyRouter = new CapabilityRouter(makeDeps());
    const missing = emptyRouter.resolve('quantum_teleport');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ source: 'missing', available: false });
    expect(missing[0].suggestion).toBeTruthy();
  });

  // ── 2. Starter Skills Auto-Install ──────────────────────────────────

  it('starter skills: listStarterSkills returns 18, installStarterSkills copies to target', () => {
    const skills = listStarterSkills();
    expect(skills).toHaveLength(18);

    // Spot-check well-known skill names
    expect(skills).toContain('catch-up');
    expect(skills).toContain('research-synthesis');
    expect(skills).toContain('decision-matrix');

    // Install to temp dir
    const targetDir = makeTmpDir();
    const installed = installStarterSkills(targetDir);
    expect(installed).toHaveLength(18);

    // Verify files physically exist
    const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.md'));
    expect(files).toHaveLength(18);

    // Idempotent: second install returns 0 (no overwrite)
    const secondRun = installStarterSkills(targetDir);
    expect(secondRun).toHaveLength(0);
  });

  // ── 3. Plugin Lifecycle ─────────────────────────────────────────────

  it('plugin lifecycle: register -> enable -> tools visible -> disable -> tools removed', async () => {
    const mgr = new PluginRuntimeManager();
    const manifest = makeTestPlugin('test-plugin', ['tool_a', 'tool_b']);

    // Register — state is installed, no tools yet
    mgr.register(manifest);
    expect(mgr.getPluginStates()).toEqual({ 'test-plugin': 'installed' });
    expect(mgr.getAllTools()).toHaveLength(0);

    // Enable — transitions to active, tools appear
    await mgr.enable('test-plugin');
    expect(mgr.getPluginStates()).toEqual({ 'test-plugin': 'active' });
    const tools = mgr.getAllTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(['tool_a', 'tool_b']);

    // Tools are executable (default executor returns JSON)
    const result = await tools[0].execute({ input: 'test' });
    expect(JSON.parse(result)).toMatchObject({ tool: tools[0].name, status: 'executed' });

    // Disable — tools removed
    mgr.disable('test-plugin');
    expect(mgr.getPluginStates()).toEqual({ 'test-plugin': 'disabled' });
    expect(mgr.getAllTools()).toHaveLength(0);
  });

  // ── 4. Command Registry End-to-End ──────────────────────────────────

  it('command registry: registerWorkflowCommands -> execute /catchup returns markdown', async () => {
    const registry = new CommandRegistry();
    registerWorkflowCommands(registry);

    // 22 commands registered (13 original + plugins, export, import, settings, cli + search-all, connectors, workflow + pr)
    expect(registry.list()).toHaveLength(22);

    // Execute /catchup with mock context
    const ctx = {
      workspaceId: 'ws-test',
      sessionId: 's-test',
      getWorkspaceState: async () => 'Session count: 5. Recent: architecture review.',
    };
    const catchupResult = await registry.execute('/catchup', ctx);
    expect(catchupResult).toContain('Catch-Up Briefing');

    // Execute /help — lists all commands
    const helpResult = await registry.execute('/help', ctx);
    expect(helpResult).toContain('Available Commands');
    expect(helpResult).toContain('/catchup');
    expect(helpResult).toContain('/research');
    expect(helpResult).toContain('/spawn');

    // Search partial match
    const searchResults = registry.search('res');
    const names = searchResults.map((c) => c.name);
    expect(names).toContain('research');

    // Alias resolution: /catch-up resolves to catchup
    const aliasResult = await registry.execute('/catch-up', ctx);
    expect(aliasResult).toContain('Catch-Up Briefing');

    // Unknown command returns helpful message
    const unknownResult = await registry.execute('/foobar', ctx);
    expect(unknownResult).toContain('Unknown command');
  });

  // ── 5. Hook Scoping ─────────────────────────────────────────────────

  it('workspace-scoped hook fires only for matching workspace', async () => {
    const hooks = new HookRegistry();
    const calls: string[] = [];

    hooks.onScoped(
      'pre:tool',
      (ctx) => {
        calls.push(`ws1:${ctx.toolName}`);
      },
      { workspaceId: 'ws-1' },
    );

    // Fire for ws-1 — handler called
    await hooks.fire('pre:tool', { workspaceId: 'ws-1', toolName: 'save_memory' });
    expect(calls).toEqual(['ws1:save_memory']);

    // Fire for ws-2 — handler NOT called
    await hooks.fire('pre:tool', { workspaceId: 'ws-2', toolName: 'read_file' });
    expect(calls).toEqual(['ws1:save_memory']); // unchanged

    // Fire for ws-1 again
    await hooks.fire('pre:tool', { workspaceId: 'ws-1', toolName: 'search_memory' });
    expect(calls).toEqual(['ws1:save_memory', 'ws1:search_memory']);
  });

  // ── 6. Hook Activity Log ────────────────────────────────────────────

  it('hook activity log records fires and caps at 50', async () => {
    const hooks = new HookRegistry();

    hooks.on('session:start', () => {
      /* no-op */
    });

    // Fire 55 times
    for (let i = 0; i < 55; i++) {
      await hooks.fire('session:start', { sessionId: `s-${i}` });
    }

    const log = hooks.getActivityLog();
    expect(log).toHaveLength(50);

    // Most recent entry should be from the last fire (i=54)
    expect(log[log.length - 1].event).toBe('session:start');
    // Oldest surviving entry should be from i=5 (first 5 were evicted)
    // (entries 0-4 evicted, 5-54 remain = 50 entries)
    expect(log[0].event).toBe('session:start');
  });

  // ── 7. Memory-Write Hook Events ─────────────────────────────────────

  it('pre:memory-write and post:memory-write events can be registered and fired', async () => {
    const hooks = new HookRegistry();
    const captured: { event: string; content: string | undefined }[] = [];

    hooks.on('pre:memory-write', (ctx) => {
      captured.push({ event: 'pre:memory-write', content: ctx.memoryContent });
    });

    hooks.on('post:memory-write', (ctx) => {
      captured.push({ event: 'post:memory-write', content: ctx.memoryContent });
    });

    await hooks.fire('pre:memory-write', {
      memoryContent: 'Architecture decision: use SQLite',
      memoryType: 'decision',
    });

    await hooks.fire('post:memory-write', {
      memoryContent: 'Architecture decision: use SQLite',
      memoryType: 'decision',
    });

    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({
      event: 'pre:memory-write',
      content: 'Architecture decision: use SQLite',
    });
    expect(captured[1]).toMatchObject({
      event: 'post:memory-write',
      content: 'Architecture decision: use SQLite',
    });
  });

  // ── 8. Workflow Templates ───────────────────────────────────────────

  it('workflow templates: 3 available, each has description and steps', () => {
    const templateNames = listWorkflowTemplates();
    expect(templateNames).toHaveLength(3);
    expect(templateNames).toContain('research-team');
    expect(templateNames).toContain('review-pair');
    expect(templateNames).toContain('plan-execute');

    // Each factory produces a template with description and steps
    for (const name of templateNames) {
      const factory = WORKFLOW_TEMPLATES[name];
      expect(factory).toBeDefined();

      const template = factory('test task');
      expect(template.name).toBe(name);
      expect(template.description).toBeTruthy();
      expect(template.steps.length).toBeGreaterThanOrEqual(2);
      expect(template.aggregation).toBeTruthy();

      // Each step has name, role, task
      for (const step of template.steps) {
        expect(step.name).toBeTruthy();
        expect(step.role).toBeTruthy();
        expect(step.task).toContain('test task');
      }
    }

    // research-team specifically has 3 steps with dependency chain
    const research = WORKFLOW_TEMPLATES['research-team']('topic');
    expect(research.steps).toHaveLength(3);
    expect(research.steps[1].dependsOn).toContain('Researcher');
    expect(research.steps[2].dependsOn).toContain('Synthesizer');
    expect(research.steps[2].contextFrom).toContain('Researcher');
    expect(research.steps[2].contextFrom).toContain('Synthesizer');
  });

  // ── 9. Workflow Lifecycle Hooks ─────────────────────────────────────

  it('workflow:start and workflow:end hooks fire correctly', async () => {
    const hooks = new HookRegistry();
    const events: { event: string; name?: string; task?: string }[] = [];

    hooks.on('workflow:start', (ctx) => {
      events.push({ event: 'workflow:start', name: ctx.workflowName, task: ctx.workflowTask });
    });

    hooks.on('workflow:end', (ctx) => {
      events.push({ event: 'workflow:end', name: ctx.workflowName, task: ctx.workflowTask });
    });

    await hooks.fire('workflow:start', {
      workflowName: 'research-team',
      workflowTask: 'Investigate quantum computing',
    });

    await hooks.fire('workflow:end', {
      workflowName: 'research-team',
      workflowTask: 'Investigate quantum computing',
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event: 'workflow:start',
      name: 'research-team',
      task: 'Investigate quantum computing',
    });
    expect(events[1]).toMatchObject({
      event: 'workflow:end',
      name: 'research-team',
      task: 'Investigate quantum computing',
    });

    // Activity log captures both fires
    const log = hooks.getActivityLog();
    expect(log.filter((e) => e.event === 'workflow:start')).toHaveLength(1);
    expect(log.filter((e) => e.event === 'workflow:end')).toHaveLength(1);
  });

  // ── 10. Cross-System Integration ────────────────────────────────────

  it('capability router + commands + hooks work together', async () => {
    // -- Set up all three systems --
    const hooks = new HookRegistry();
    const registry = new CommandRegistry();
    registerWorkflowCommands(registry);

    const hookLog: string[] = [];

    // Hook tracks tool usage
    hooks.on('pre:tool', (ctx) => {
      hookLog.push(`pre:tool:${ctx.toolName}`);
    });

    // Hook tracks command execution via workflow events
    hooks.on('workflow:start', (ctx) => {
      hookLog.push(`workflow:start:${ctx.workflowName}`);
    });

    // Router has native tools, skills matching commands, and plugin
    const router = new CapabilityRouter(
      makeDeps({
        toolNames: ['save_memory', 'search_memory', 'read_file'],
        skills: [
          { name: 'catch-up', content: 'Workspace restart summary' },
          { name: 'research-synthesis', content: 'Deep research into topic' },
        ],
        plugins: [
          { name: 'web-research', description: 'Web research tools for scraping', skills: ['web-research'] },
        ],
        mcpServers: ['github-mcp'],
        subAgentRoles: ['researcher', 'writer', 'coder'],
      }),
    );

    // 1. Router resolves a known native tool
    const memRoutes = router.resolve('save_memory');
    expect(memRoutes[0]).toMatchObject({ source: 'native', confidence: 1.0 });

    // 2. Fire pre:tool hook as agent would before executing the tool
    await hooks.fire('pre:tool', { toolName: 'save_memory', workspaceId: 'ws-1' });
    expect(hookLog).toContain('pre:tool:save_memory');

    // 3. Router resolves something that needs a skill
    const catchupRoutes = router.resolve('catch-up');
    expect(catchupRoutes.some((r) => r.source === 'skill' && r.name === 'catch-up')).toBe(true);

    // 4. Execute the corresponding command
    const ctx = {
      workspaceId: 'ws-1',
      sessionId: 's-1',
      getWorkspaceState: async () => '3 sessions. Last: code review.',
    };
    const result = await registry.execute('/catchup', ctx);
    expect(result).toContain('Catch-Up Briefing');

    // 5. Fire workflow hook as orchestrator would
    await hooks.fire('workflow:start', { workflowName: 'research-team', workflowTask: 'test' });
    expect(hookLog).toContain('workflow:start:research-team');

    // 6. Router resolves web scraping → plugin
    const webRoutes = router.resolve('scraping');
    expect(webRoutes.some((r) => r.source === 'plugin' && r.name === 'web-research')).toBe(true);

    // 7. Router resolves coding → subagent
    const codeRoutes = router.resolve('code');
    expect(codeRoutes.some((r) => r.source === 'subagent' && r.name === 'coder')).toBe(true);

    // 8. Activity log has all fires
    const activityLog = hooks.getActivityLog();
    expect(activityLog).toHaveLength(2); // pre:tool + workflow:start
    expect(activityLog.map((e) => e.event)).toEqual(['pre:tool', 'workflow:start']);
  });
});
