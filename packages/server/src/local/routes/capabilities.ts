import type { FastifyPluginAsync } from 'fastify';
import { listWorkflowTemplates, WORKFLOW_TEMPLATES } from '@waggle/agent';

/**
 * Capabilities routes — read-only status dashboard for plugins, MCP servers,
 * skills, tools, commands, hooks, and workflow templates. No side effects.
 */
export const capabilitiesRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/capabilities/status — aggregated capability summary
  server.get('/api/capabilities/status', async (_request, reply) => {
    try {
    const { agentState } = server;

    // ── Plugins ──────────────────────────────────────────────────────
    const prm = agentState.pluginRuntimeManager;

    let plugins: Array<{ name: string; state: string; tools: number; skills: number }> = [];
    let pluginToolCount = 0;

    if (prm) {
      const states = prm.getPluginStates();
      const allPluginTools = prm.getAllTools();
      const allPluginSkills = prm.getAllSkills();
      pluginToolCount = allPluginTools.length;

      plugins = Object.entries(states).map(([name, state]) => ({
        name,
        state,
        // Per-plugin tool/skill counts approximated via name prefix convention
        tools: allPluginTools.filter(t => t.name.startsWith(`${name}:`)).length,
        skills: allPluginSkills.filter(s => s.startsWith(`${name}:`)).length || 0,
      }));
    }

    // ── MCP Servers ──────────────────────────────────────────────────
    const mcp = agentState.mcpRuntime;

    let mcpServers: Array<{ name: string; state: string; healthy: boolean; tools: number }> = [];
    let mcpToolCount = 0;

    if (mcp) {
      const states = mcp.getServerStates();
      const healthyNames = new Set(mcp.getHealthy().map(s => s.config.name));
      const allMcpTools = mcp.getAllTools();
      mcpToolCount = allMcpTools.length;

      mcpServers = Object.entries(states).map(([name, state]) => ({
        name,
        state,
        healthy: healthyNames.has(name),
        tools: allMcpTools.filter(t => t.name.startsWith(`${name}:`)).length,
      }));
    }

    // ── Skills (from agentState.skills) ──────────────────────────────
    const skills = (agentState.skills ?? []).map(s => ({
      name: s.name,
      length: s.content?.length ?? 0,
    }));

    // ── Tools summary ────────────────────────────────────────────────
    const totalTools = agentState.allTools?.length ?? 0;
    const nativeTools = totalTools - pluginToolCount - mcpToolCount;

    // ── Commands ─────────────────────────────────────────────────────
    const cr = agentState.commandRegistry;

    const commands = cr
      ? cr.list().map(c => ({
          name: c.name,
          description: c.description,
          usage: c.usage,
        }))
      : [];

    // ── Hooks ──────────────────────────────────────────────────────
    const hookRegistry = agentState.hookRegistry;
    const activityLog = hookRegistry.getActivityLog();

    const hooks = {
      registered: 10, // Total supported hook events
      recentActivity: activityLog.slice(-10).map(entry => ({
        event: entry.event,
        timestamp: entry.timestamp,
        cancelled: entry.cancelled,
        reason: entry.reason,
      })),
    };

    // ── Workflows ──────────────────────────────────────────────────
    const workflows = listWorkflowTemplates().map(name => {
      const factory = WORKFLOW_TEMPLATES[name];
      const tmpl = factory?.('_introspect_');
      return {
        name,
        description: tmpl?.description ?? '',
        steps: tmpl?.steps?.length ?? 0,
      };
    });

    return {
      plugins,
      mcpServers,
      skills,
      tools: {
        count: Math.max(0, nativeTools) + pluginToolCount + mcpToolCount,
        native: Math.max(0, nativeTools),
        plugin: pluginToolCount,
        mcp: mcpToolCount,
      },
      commands,
      hooks,
      workflows,
    };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/capabilities/plugins/:name/enable
  server.post<{ Params: { name: string } }>('/api/capabilities/plugins/:name/enable', async (request, reply) => {
    const { name } = request.params;
    const mgr = server.agentState.pluginRuntimeManager;
    if (!mgr) return reply.status(503).send({ error: 'Plugin runtime not available' });
    try {
      await mgr.enable(name);
      return { ok: true, name, state: 'active' };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/capabilities/plugins/:name/disable
  server.post<{ Params: { name: string } }>('/api/capabilities/plugins/:name/disable', async (request, reply) => {
    const { name } = request.params;
    const mgr = server.agentState.pluginRuntimeManager;
    if (!mgr) return reply.status(503).send({ error: 'Plugin runtime not available' });
    try {
      mgr.disable(name);
      return { ok: true, name, state: 'disabled' };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
};
