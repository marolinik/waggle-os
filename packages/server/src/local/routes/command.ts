/**
 * Command Center / Win+K routes (PRD §16.3, gap cards S00 + S03).
 *
 * SINGULAR `/api/command/*` surface that powers the global command palette.
 * Federates read-only search over the substrates that exist today, and exposes
 * a thin `POST /api/command/execute` ALIAS (founder decision B4) onto the SAME
 * command registry the plural `POST /api/commands/execute` (`commands.ts`) uses —
 * the existing plural route is NOT renamed.
 *
 *   GET  /api/command/search?q=&scope=   — federated palette search
 *   GET  /api/command/recent             — recent palette commands (net-new; [] for now)
 *   GET  /api/command/suggestions        — contextual next-action suggestions (net-new)
 *   POST /api/command/execute            — alias → commandRegistry.execute
 *
 * Surfaces federated by /search (CommandResultType in parens):
 *   - memory      → server.multiMind.search()                       (`memory`)
 *   - workspaces  → server.workspaceManager.list()                  (`workspace`)
 *   - skills      → loadSkills(dataDir)                             (`skill`)
 *   - sessions    → searchSessions() over each workspace's sessions (`session`)
 *   - commands    → server.agentState.commandRegistry.search()      (`command`)
 *
 * `artifact` / `agent` / `automation` / `connector` / `mcp` / `person` facets are
 * intentionally NOT federated yet — their domains (S05/S09/S11/S07/S08) land in
 * later phases. The CommandResultType union carries them so the contract is stable.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import type { CommandResult, Command } from '@waggle/shared';
import type { Orchestrator, LoadedSkill } from '@waggle/agent';
import { loadSkills } from '@waggle/agent';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt } from './workspace-context.js';
import { searchSessions } from './session-utils.js';

/**
 * Memoized `loadSkills()` — the federated `/search` hot path runs per keystroke,
 * and `loadSkills` does a `readdirSync` + N `readFileSync` on every call. The
 * skills dir is stable within a session, so cache once per `waggleHome`.
 */
const skillsCache = new Map<string, LoadedSkill[]>();
function loadSkillsCached(waggleHome: string): LoadedSkill[] {
  const cached = skillsCache.get(waggleHome);
  if (cached) return cached;
  const skills = loadSkills(waggleHome);
  skillsCache.set(waggleHome, skills);
  return skills;
}

/** A federation surface that yields zero rows must never sink the whole search. */
function safeFederate<T>(label: string, fn: () => T[], log: (m: string) => void): T[] {
  try {
    return fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`command/search: ${label} federation failed — ${message}`);
    return [];
  }
}

/** Truncate a content blob into a single-line subtitle. */
function toSubtitle(content: string, max = 120): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export const commandRoutes: FastifyPluginAsync = async (server) => {
  const waggleHome = server.localConfig.dataDir || path.join(os.homedir(), '.waggle');

  // ── GET /api/command/search ───────────────────────────────────────────
  // Federated read over memory + workspaces + skills + sessions + commands.
  server.get<{
    Querystring: { q?: string; scope?: string; limit?: string };
  }>('/api/command/search', async (request, reply) => {
    const q = request.query.q?.trim();
    if (!q || q.length < 2) {
      return reply.status(400).send({ error: 'q (query) must be at least 2 characters' });
    }

    const scope = request.query.scope;
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 50);
    const perFacet = Math.max(3, Math.ceil(limit / 4));
    const lower = q.toLowerCase();
    const logWarn = (m: string): void => server.log.warn(m);

    const results: CommandResult[] = [];

    // Workspaces — name match over the JSON-file registry.
    results.push(...safeFederate('workspaces', () => {
      const matches = server.workspaceManager
        .list()
        .filter((ws) => ws.name.toLowerCase().includes(lower) || ws.group.toLowerCase().includes(lower))
        .slice(0, perFacet);
      return matches.map((ws): CommandResult => ({
        id: `workspace:${ws.id}`,
        type: 'workspace',
        title: ws.name,
        subtitle: ws.description ?? ws.group,
        category: 'navigate',
        icon: ws.icon,
        action: { route: `/workspace/${ws.id}` },
      }));
    }, logWarn));

    // Memory — FTS over personal + active workspace minds.
    results.push(...safeFederate('memory', () => {
      const searchScope = scope === 'personal' || scope === 'workspace' ? scope : 'all';
      const frames = server.multiMind.search(q, searchScope, perFacet);
      return frames.map((frame): CommandResult => ({
        id: `memory:${frame.id}`,
        type: 'memory',
        title: toSubtitle(frame.content, 80),
        subtitle: frame.created_at ? new Date(frame.created_at).toLocaleString() : undefined,
        category: 'search',
        action: { route: `/memory?frame=${encodeURIComponent(frame.id)}` },
      }));
    }, logWarn));

    // Skills — name/content substring over authored skills.
    results.push(...safeFederate('skills', () => {
      const skills = loadSkillsCached(waggleHome)
        .filter((s) => s.name.toLowerCase().includes(lower) || s.content.toLowerCase().includes(lower))
        .slice(0, perFacet);
      return skills.map((skill): CommandResult => ({
        id: `skill:${skill.name}`,
        type: 'skill',
        title: skill.name,
        subtitle: toSubtitle(skill.content, 100),
        category: 'run',
        action: { route: `/skills/${encodeURIComponent(skill.name)}` },
      }));
    }, logWarn));

    // Sessions — federate searchSessions() across each workspace's session dir.
    results.push(...safeFederate('sessions', () => {
      const sessionResults: CommandResult[] = [];
      const workspaces = server.workspaceManager.list();
      let remaining = perFacet;
      for (const ws of workspaces) {
        if (remaining <= 0) break;
        const sessionsDir = path.join(waggleHome, 'workspaces', ws.id, 'sessions');
        if (!fs.existsSync(sessionsDir)) continue;
        const hits = searchSessions(sessionsDir, q, remaining);
        for (const hit of hits) {
          sessionResults.push({
            id: `session:${ws.id}:${hit.sessionId}`,
            type: 'session',
            title: hit.title,
            subtitle: hit.snippets[0]?.text ? toSubtitle(hit.snippets[0].text, 100) : ws.name,
            category: 'navigate',
            action: { route: `/workspace/${ws.id}/session/${hit.sessionId}` },
          });
        }
        remaining = perFacet - sessionResults.length;
      }
      return sessionResults.slice(0, perFacet);
    }, logWarn));

    // Commands — slash-command registry autocomplete.
    results.push(...safeFederate('commands', () => {
      const matches = server.agentState.commandRegistry.search(q).slice(0, perFacet);
      return matches.map((cmd): CommandResult => ({
        id: `command:${cmd.name}`,
        type: 'command',
        title: `/${cmd.name}`,
        subtitle: cmd.description,
        category: 'run',
        action: { endpoint: '/api/command/execute', payload: { input: `/${cmd.name}` } },
      }));
    }, logWarn));

    return { results: results.slice(0, limit) };
  });

  // ── GET /api/command/recent ───────────────────────────────────────────
  // Net-new. v1 derives nothing server-side (recents live client-side in the
  // palette today); returns the stable empty envelope so the FE wires cleanly.
  // Promote to an `ai_interactions`-backed read when cross-device recents are needed.
  server.get('/api/command/recent', async () => {
    const recent: CommandResult[] = [];
    return { recent };
  });

  // ── GET /api/command/suggestions ──────────────────────────────────────
  // Net-new. Suggests slash commands as runnable palette rows. Folds in the
  // command registry's full list (cheapest stable v1); next-action derivation
  // over workspace-state lands when a consumer needs it.
  server.get('/api/command/suggestions', async () => {
    const suggestions = safeFederate('suggestions', () => {
      return server.agentState.commandRegistry
        .list()
        .slice(0, 8)
        .map((cmd): CommandResult => ({
          id: `command:${cmd.name}`,
          type: 'command',
          title: `/${cmd.name}`,
          subtitle: cmd.description,
          category: 'run',
          action: { endpoint: '/api/command/execute', payload: { input: `/${cmd.name}` } },
        }));
    }, (m) => server.log.warn(m));
    return { suggestions };
  });

  // ── POST /api/command/execute ─────────────────────────────────────────
  // B4 ALIAS. Delegates to the SAME CommandRegistry the plural
  // /api/commands/execute uses (`commands.ts`). The palette posts a `Command`
  // ({ id?, input?, payload? }); a slash string in `input` (or `payload.input`)
  // is resolved against the registry with a real, workspace-scoped CommandContext.
  server.post<{ Body: Command }>('/api/command/execute', async (request, reply) => {
    const body = request.body ?? {};
    const payloadInput = typeof body.payload?.input === 'string' ? body.payload.input : undefined;
    const commandStr = body.input ?? payloadInput ?? body.id;
    if (!commandStr) {
      return reply.status(400).send({ error: 'input (or payload.input / id) is required' });
    }

    const { commandRegistry, orchestrator } = server.agentState;
    const workspaceId = body.workspaceId;
    const effectiveWorkspaceId = workspaceId ?? 'default';

    // Mirror commands.ts: scope a per-request orchestrator to this workspace so
    // the alias never collides with an in-flight chat session's orchestrator.
    let commandOrch: Orchestrator = orchestrator;
    if (workspaceId && workspaceId !== 'default') {
      const existing = server.sessionManager.get(workspaceId);
      if (existing) {
        commandOrch = existing.orchestrator;
      } else {
        const mind = server.agentState.getWorkspaceMindDb(workspaceId);
        if (mind) {
          commandOrch = server.agentState.createSessionOrchestrator(mind);
        }
      }
    }

    const context = {
      workspaceId: effectiveWorkspaceId,
      sessionId: 'command',
      searchMemory: async (query: string): Promise<string> => {
        try {
          const recall = await commandOrch.recallMemory(query);
          if (recall.count === 0) return 'No relevant memories found.';
          const items = (recall.recalled ?? []).slice(0, 5);
          return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
        } catch {
          return 'Memory search unavailable.';
        }
      },
      getWorkspaceState: async (): Promise<string> => {
        const block = buildWorkspaceNowBlock({
          dataDir: server.localConfig.dataDir,
          workspaceId: effectiveWorkspaceId,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
          cronSchedules: server.cronStore.list(),
        });
        if (!block) return 'No workspace state available.';
        return formatWorkspaceNowPrompt(block);
      },
      listSkills: (): string[] => {
        return server.agentState.skills.map((s) => s.name);
      },
    };

    const result = await commandRegistry.execute(commandStr, context);
    return reply.send({ ok: true, result });
  });
};
