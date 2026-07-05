/**
 * MCP Hub REST surface (UX-Refactor Phase 4, S08/S17).
 *
 * The runtime engine (`McpRuntime`, stdio JSON-RPC) existed but was never
 * wired to any route; this file is that wiring. Persisted config lives at
 * `<dataDir>/.mcp.json` (../mcp-config.ts) — the boot loader (C4) registers
 * those entries so installs survive restarts.
 *
 * Ratified gates honoured:
 *  - A4  — real-where-substrate-exists: installs go through the EXISTING
 *          marketplace installer (SecurityGate + audit ride along);
 *          the static catalog renders honest not-installed states.
 *  - B5  — install is free (Solo): MCP install + custom-add are personal
 *          features (PRO removed). SecurityGate + audit still ride along via
 *          the marketplace installer.
 *  - C19 — scope = single workspaceId v1 (the runtime's native model).
 *  - C20 — stdio-only; no remote-registry transport.
 *  - C21 — /test runs a LIVE spawn + initialize/tools-list round-trip when the
 *          server is registered (already-running servers get a real tools/list
 *          re-issue, never cached state); otherwise a STATIC manifest
 *          validation. Responses label which ran via `mode`. A server mid-start
 *          answers 409 busy.
 *  - C2  — GET /api/mcps/:id/logs is OMITTED: McpServerInstance pipes stderr
 *          but retains nothing (no ring buffer). Deferred with the caveat that
 *          PRD §12.8 "view logs" is unmet at route level in v1.
 */

import type { FastifyInstance } from 'fastify';
import {
  MCP_CATALOG,
  type McpInstance,
  type McpServer,
} from '@waggle/shared';
import type { McpRuntime, McpServerState } from '@waggle/agent';
import { scanForInjection, type RecordAuditInput } from '@waggle/core';
import {
  loadMcpConfig,
  saveMcpServerEntry,
  removeMcpServerEntry,
  validateMcpEntry,
  type PersistedMcpEntry,
} from '../mcp-config.js';
import { authHeaders, clampStr, clampStrArray } from './validate.js';

/** Live-test budget. Must answer BEFORE the FE adapter's 10s request timeout
 *  (15s here meant the route's honest {ok:false} arrived after the client had
 *  already aborted — caught by the 2026-06-10 Extend live smoke), and stays
 *  under the instance's own 30s per-request timeout. */
const TEST_TIMEOUT_MS = 8_000;

/** Clamp env to ≤64 pairs with bounded key/value lengths. Non-record shapes
 *  (and non-string values) pass through untouched so validateMcpEntry still
 *  rejects them with its precise error message. */
function clampEnv(env: unknown): Record<string, string> {
  if (env === null || typeof env !== 'object' || Array.isArray(env)) {
    return env as Record<string, string>;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env as Record<string, unknown>).slice(0, 64)) {
    out[clampStr(k, 200)] = (typeof v === 'string' ? clampStr(v, 1000) : v) as string;
  }
  return out;
}

/** Map the runtime's 4-state machine onto the shared McpInstance status. */
function toInstanceStatus(state: McpServerState | undefined): McpInstance['status'] {
  switch (state) {
    case 'ready': return 'running';
    case 'starting': return 'running'; // transitional — raw `state` is also emitted
    case 'error': return 'error';
    case 'stopped': return 'stopped';
    default: return 'installed'; // persisted but not registered in the runtime
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function mcpRoutes(fastify: FastifyInstance) {
  const dataDir = () => fastify.localConfig?.dataDir ?? '';
  const getRuntime = (): McpRuntime | undefined =>
    (fastify.agentState as { mcpRuntime?: McpRuntime } | undefined)?.mcpRuntime;

  /** Install-audit write — non-blocking like every other auditStore caller. */
  function recordMcpAudit(input: Omit<RecordAuditInput, 'capabilityType'>): void {
    try {
      fastify.auditStore?.record({ ...input, capabilityType: 'mcp' });
    } catch (err) {
      fastify.log.warn({ err, capability: input.capabilityName }, 'mcp install-audit write failed');
    }
  }

  /** Build the shared McpInstance for one persisted/registered server. */
  function buildInstance(name: string, entry: PersistedMcpEntry | undefined, runtime: McpRuntime | undefined): McpInstance & { state?: McpServerState; tools: string[] } {
    const server = runtime?.getServer(name);
    const state = server?.getState();
    const workspaceId = entry?.workspaceId ?? server?.config.workspaceId;
    return {
      id: name,
      name,
      status: toInstanceStatus(state),
      scope: workspaceId ? 'workspace' : 'personal',
      ...(workspaceId ? { connectedTo: [workspaceId] } : {}),
      ...(state ? { state } : {}),
      tools: server?.isHealthy() ? server.getTools().map((t) => t.name) : [],
    };
  }

  /** The instance fields merged into a list item (id/name stay the catalog's). */
  function instanceFields(name: string, entry: PersistedMcpEntry | undefined, runtime: McpRuntime | undefined) {
    const { id: _id, name: _name, ...fields } = buildInstance(name, entry, runtime);
    return fields;
  }

  // ── GET /api/mcps — catalog ⋈ persisted config ⋈ runtime state ────────
  // Honest states (A4): catalog entries that aren't installed say so; no fake
  // instances. Custom (non-catalog) persisted servers are included too.
  interface McpListItem {
    id: string;
    name: string;
    description: string;
    category: string;
    official: boolean;
    installCmd: string;
    source: 'catalog' | 'custom';
    installed: boolean;
    tools: string[];
    // McpInstance fields, present only when installed:
    status?: McpInstance['status'];
    scope?: McpInstance['scope'];
    connectedTo?: string[];
    state?: McpServerState;
  }

  fastify.get('/api/mcps', async () => {
    const runtime = getRuntime();
    const persisted = loadMcpConfig(dataDir()).mcpServers;
    const runtimeNames = new Set(Object.keys(runtime?.getServerStates() ?? {}));
    const installedNames = new Set([...Object.keys(persisted), ...runtimeNames]);

    const catalogIds = new Set<string>();
    const mcps: McpListItem[] = MCP_CATALOG.map((cat: McpServer) => {
      catalogIds.add(cat.id);
      const installed = installedNames.has(cat.id);
      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        category: cat.category,
        official: cat.official ?? false,
        installCmd: cat.installCmd,
        source: 'catalog' as const,
        installed,
        tools: [],
        ...(installed ? instanceFields(cat.id, persisted[cat.id], runtime) : {}),
      };
    });

    // Custom servers (persisted or registered, not in the catalog)
    for (const name of installedNames) {
      if (catalogIds.has(name)) continue;
      mcps.push({
        id: name,
        name,
        description: '',
        category: 'Custom',
        official: false,
        installCmd: '',
        source: 'custom',
        installed: true,
        ...instanceFields(name, persisted[name], runtime),
      });
    }

    return { mcps, total: mcps.length, installed: installedNames.size };
  });

  // ── POST /api/mcps/install — free (Solo), delegates to the marketplace ──
  // installer so SecurityGate + install_audit + .mcp.json write ride along
  // unchanged; then registers + starts the server in the live runtime.
  fastify.post('/api/mcps/install', async (request, reply) => {
    const body = request.body as {
      mcpId?: string;
      settings?: Record<string, string>;
      force?: boolean;
      forceInsecure?: boolean;
    };
    const mcpId = clampStr(body?.mcpId, 200);
    if (!mcpId) return reply.code(400).send({ error: 'mcpId is required' });

    const db = fastify.marketplace;
    if (!db) {
      return reply.code(503).send({
        error: 'Marketplace not available',
        hint: 'MCP installs route through the marketplace installer (A4)',
      });
    }

    // Resolve catalog id → marketplace package (mcp-registry seeds share ids)
    const row = db.getRawDb().prepare(
      "SELECT id FROM packages WHERE name = ? AND waggle_install_type = 'mcp'",
    ).get(mcpId) as { id: number } | undefined;
    if (!row) {
      return reply.code(404).send({ error: `No marketplace MCP package named "${mcpId}"` });
    }

    // Resolve + validate the manifest BEFORE delegating: a package whose
    // mcp_config fails the same validation the C4 boot loader applies would
    // install "successfully" now and then be skipped at every reboot. Reject
    // it up front (422) instead of half-installing.
    const pkg = db.getPackage(row.id);
    const manifest = pkg?.install_manifest as { mcp_config?: { name: string; command: string; args: string[]; env?: Record<string, string> } } | null;
    const mcpConfig = manifest?.mcp_config;
    if (!mcpConfig) {
      return reply.code(422).send({ installed: false, error: 'Package manifest has no mcp_config' });
    }
    const manifestInvalid = validateMcpEntry(mcpConfig.name, { command: mcpConfig.command, args: mcpConfig.args, env: mcpConfig.env });
    if (manifestInvalid) {
      return reply.code(422).send({
        installed: false,
        error: `Package mcp_config would not survive a restart (boot-loader validation): ${manifestInvalid}`,
      });
    }

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/marketplace/install',
      headers: authHeaders(request),
      payload: {
        packageId: row.id,
        settings: body.settings,
        force: body.force,
        forceInsecure: body.forceInsecure,
      },
    });
    const result = res.json() as {
      success?: boolean;
      blocked?: boolean;
      scanResult?: { blocked?: boolean; overall_severity?: string };
    };
    if (res.statusCode >= 400 || result.success === false) {
      // A SecurityGate block (route-level 403 OR installer-level 422 with
      // scanResult.blocked) surfaces as the "risk approval required" state —
      // the server is NOT registered or started (PRD line 743). The audit row
      // is written by the marketplace route in both cases.
      const securityBlocked = result.blocked === true || result.scanResult?.blocked === true;
      return reply.code(res.statusCode >= 400 ? res.statusCode : 422).send({
        installed: false,
        requiresApproval: securityBlocked,
        ...result,
      });
    }

    // The installer wrote the .mcp.json entry; apply the same env templating
    // so the runtime registration matches what was persisted.
    const env = mcpConfig.env ? { ...mcpConfig.env } : undefined;
    if (body.settings && env) {
      for (const [key, value] of Object.entries(body.settings)) {
        for (const envKey of Object.keys(env)) {
          if (env[envKey] === `\${${key}}` || env[envKey] === '') env[envKey] = value;
        }
      }
    }
    const entry: PersistedMcpEntry = { command: mcpConfig.command, args: mcpConfig.args, ...(env ? { env } : {}) };
    // Persist at the server's dataDir too — the installer writes to
    // WAGGLE_DATA_DIR/~/.waggle, which may differ from a custom dataDir.
    saveMcpServerEntry(dataDir(), mcpConfig.name, entry);

    const runtime = getRuntime();
    let status: McpServerState | 'unregistered' = 'unregistered';
    let startError: string | undefined;
    if (runtime) {
      if (runtime.getServer(mcpConfig.name)) await runtime.removeServer(mcpConfig.name);
      runtime.addServer({ name: mcpConfig.name, command: entry.command, args: entry.args, env: entry.env });
      const instance = runtime.getServer(mcpConfig.name)!;
      try {
        await withTimeout(instance.start(), TEST_TIMEOUT_MS, 'MCP start');
      } catch (err) {
        startError = (err as Error).message;
        // withTimeout only rejects OUR promise — the underlying start() (and
        // its spawned child) keeps running otherwise. stop() kills it so a
        // timed-out start never leaks a zombie process.
        await instance.stop().catch(() => { /* best effort */ });
      }
      status = instance.getState();
    }

    // The marketplace route only audits non-clean scans — guarantee an
    // 'installed' trail entry for every MCP install (PRD §12.8 auditable).
    // Risk/approval derive from the installer-level scan: a forceInsecure
    // override of a blocked scan must NOT read like a plain medium-risk
    // install (the marketplace route writes the dedicated override row).
    const scanSeverity = result.scanResult?.overall_severity;
    const overrode = result.scanResult?.blocked === true;
    recordMcpAudit({
      capabilityName: mcpConfig.name,
      source: 'marketplace',
      riskLevel: scanSeverity === 'CRITICAL' ? 'critical'
        : scanSeverity === 'HIGH' ? 'high'
        : 'medium',
      trustSource: 'third_party_verified',
      approvalClass: overrode ? 'elevated' : 'standard',
      action: 'installed',
      initiator: 'user',
      detail: `MCP server installed via marketplace (package ${row.id}); runtime status: ${status}`
        + (scanSeverity ? `; scan severity: ${scanSeverity}` : '')
        + (overrode ? '; SECURITY OVERRIDE: installed despite blocked scan (forceInsecure)' : ''),
    });

    return {
      installed: true,
      mcpId,
      server: mcpConfig.name,
      status,
      ...(startError ? { startError } : {}),
    };
  });

  // ── POST /api/mcps — add a CUSTOM stdio server (C19 single workspaceId) ──
  // Free (Solo), like /api/mcps/install — registering + starting an arbitrary
  // stdio server is a personal feature (PRO removed).
  fastify.post('/api/mcps', async (request, reply) => {
    const body = request.body as {
      name?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      workspaceId?: string;
    };
    const name = clampStr(body?.name, 100);
    // Defense-in-depth size clamps: everything below is persisted verbatim to
    // the boot-read .mcp.json — a multi-MB body must not bloat it permanently.
    const candidate: PersistedMcpEntry = {
      command: typeof body?.command === 'string' ? clampStr(body.command, 1000) : '',
      ...(Array.isArray(body?.args) && body.args.every((a) => typeof a === 'string')
        ? { args: clampStrArray(body.args, 64, 1000) }
        : body?.args !== undefined ? { args: body.args } : {}),
      ...(body?.env !== undefined ? { env: clampEnv(body.env) } : {}),
      ...(body?.workspaceId !== undefined
        ? { workspaceId: typeof body.workspaceId === 'string' ? clampStr(body.workspaceId, 200) : body.workspaceId }
        : {}),
    };
    const invalid = validateMcpEntry(name, candidate);
    if (invalid) return reply.code(400).send({ error: invalid });

    // Injection scan on the external config (S08 card). Scope: this defends
    // the LLM-facing surface (server names/args/env keys later embedded in
    // prompts and tool descriptions) — it is NOT command vetting; spawn risk
    // for user-supplied local servers is accepted by design (same trust model
    // as the marketplace installer running local commands).
    const scanText = [
      candidate.command,
      ...(candidate.args ?? []),
      ...Object.entries(candidate.env ?? {}).flatMap(([k, v]) => [k, v]),
    ].join(' ');
    const scan = scanForInjection(scanText, 'user_input');
    if (!scan.safe) {
      return reply.code(400).send({ error: 'Config rejected by injection scan', flags: scan.flags });
    }

    const runtime = getRuntime();
    const persisted = loadMcpConfig(dataDir()).mcpServers;
    if (persisted[name] || runtime?.getServer(name)) {
      return reply.code(409).send({ error: `MCP server "${name}" already exists` });
    }

    saveMcpServerEntry(dataDir(), name, candidate);
    runtime?.addServer({
      name,
      command: candidate.command,
      args: candidate.args,
      env: candidate.env,
      workspaceId: candidate.workspaceId,
    });

    recordMcpAudit({
      capabilityName: name,
      source: 'custom',
      riskLevel: 'medium',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'installed',
      initiator: 'user',
      detail: `Custom MCP server added (command: ${clampStr(candidate.command, 200)})`,
    });

    return reply.code(201).send({ id: name, registered: !!runtime });
  });

  // ── POST /api/mcps/:id/test — C21 live handshake / static fallback ────
  fastify.post('/api/mcps/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const runtime = getRuntime();
    const instance = runtime?.getServer(id);

    if (instance) {
      const stateBefore = instance.getState();

      // A concurrent /start is mid-flight: start() would no-op (still
      // unhealthy → instant false negative) and our cleanup stop() would kill
      // the in-flight start. Busy is the only honest answer.
      if (stateBefore === 'starting') {
        return reply.code(409).send({
          ok: false,
          error: `MCP server "${id}" is currently starting — retry shortly`,
        });
      }

      // Already running: a REAL tools/list round-trip (C21) — never report
      // cached state as a live test result (a wedged process must test false).
      if (stateBefore === 'ready') {
        try {
          const tools = await withTimeout(instance.refreshTools(), TEST_TIMEOUT_MS, 'MCP test');
          return { ok: true, mode: 'live', tools: tools.map((t) => t.name) };
        } catch (err) {
          return { ok: false, mode: 'live', tools: [], error: (err as Error).message };
        }
      }

      // LIVE: spawn + initialize + tools/list round-trip, leave-as-found.
      try {
        await withTimeout(instance.start(), TEST_TIMEOUT_MS, 'MCP test');
        const ok = instance.isHealthy();
        const tools = instance.getTools().map((t) => t.name);
        await instance.stop();
        return { ok, mode: 'live', tools };
      } catch (err) {
        await instance.stop().catch(() => { /* best effort */ });
        return { ok: false, mode: 'live', tools: [], error: (err as Error).message };
      }
    }

    // STATIC: persisted-but-unregistered entry → validate the manifest shape.
    const persisted = loadMcpConfig(dataDir()).mcpServers[id];
    if (persisted) {
      const invalid = validateMcpEntry(id, persisted);
      return {
        ok: invalid === null,
        mode: 'static',
        tools: [],
        ...(invalid ? { error: invalid } : {}),
      };
    }

    // STATIC: catalog-only (not installed) → validate the catalog manifest.
    const cat = MCP_CATALOG.find((c) => c.id === id);
    if (cat) {
      const ok = typeof cat.installCmd === 'string' && cat.installCmd.trim().length > 0;
      return {
        ok,
        mode: 'static',
        tools: [],
        ...(ok ? {} : { error: 'Catalog entry has no install command' }),
        note: 'Not installed — static manifest validation only (C21 fallback)',
      };
    }

    return reply.code(404).send({ error: `MCP server "${id}" not found` });
  });

  // ── POST /api/mcps/:id/start ───────────────────────────────────────────
  fastify.post('/api/mcps/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const instance = getRuntime()?.getServer(id);
    if (!instance) return reply.code(404).send({ error: `MCP server "${id}" not registered` });
    try {
      await withTimeout(instance.start(), TEST_TIMEOUT_MS, 'MCP start');
      return { status: instance.getState() };
    } catch (err) {
      // withTimeout only rejects OUR promise — without stop() the abandoned
      // start() keeps running and leaks the spawned child on every timeout.
      await instance.stop().catch(() => { /* best effort */ });
      return reply.code(502).send({ status: instance.getState(), error: (err as Error).message });
    }
  });

  // ── POST /api/mcps/:id/stop ────────────────────────────────────────────
  fastify.post('/api/mcps/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const instance = getRuntime()?.getServer(id);
    if (!instance) return reply.code(404).send({ error: `MCP server "${id}" not registered` });
    await instance.stop();
    return { status: instance.getState() };
  });

  // ── POST /api/mcps/:id/revoke — remove from runtime + persisted config ──
  fastify.post('/api/mcps/:id/revoke', async (request, reply) => {
    const { id } = request.params as { id: string };
    const runtime = getRuntime();
    const hadInstance = !!runtime?.getServer(id);
    const removedConfig = removeMcpServerEntry(dataDir(), id);
    if (!hadInstance && !removedConfig) {
      return reply.code(404).send({ error: `MCP server "${id}" is not installed` });
    }
    await runtime?.removeServer(id); // stops the process if running

    // Keep the marketplace's installed:true annotation honest (A4): if this
    // server came from a marketplace package, retire that installation row
    // too — otherwise /api/marketplace/search keeps claiming it's installed.
    try {
      const db = fastify.marketplace;
      const pkgRow = db?.getRawDb().prepare(
        "SELECT id FROM packages WHERE name = ? AND waggle_install_type = 'mcp'",
      ).get(id) as { id: number } | undefined;
      if (pkgRow && db!.isInstalled(pkgRow.id)) {
        db!.markUninstalled(pkgRow.id);
      }
    } catch (err) {
      fastify.log.warn({ err, id }, 'marketplace bookkeeping on MCP revoke failed (non-blocking)');
    }

    recordMcpAudit({
      capabilityName: id,
      source: 'mcp',
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'rejected',
      initiator: 'user',
      detail: 'MCP server revoked — removed from runtime and persisted config',
    });

    return { ok: true, id, stoppedInstance: hadInstance, removedConfig };
  });

  // ── PATCH /api/mcps/:id/permissions — C19 scope: single workspaceId v1 ──
  fastify.patch('/api/mcps/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { scope?: string; workspaceId?: string };

    let workspaceId: string | undefined;
    if (typeof body?.workspaceId === 'string' && body.workspaceId.length > 0) {
      workspaceId = clampStr(body.workspaceId, 200);
    } else if (body?.scope === 'personal') {
      workspaceId = undefined;
    } else {
      return reply.code(400).send({
        error: 'Provide workspaceId (workspace scope) or scope:"personal" (C19: single-workspace scoping v1)',
      });
    }

    const persisted = loadMcpConfig(dataDir()).mcpServers[id];
    const runtime = getRuntime();
    const instance = runtime?.getServer(id);
    if (!persisted && !instance) {
      return reply.code(404).send({ error: `MCP server "${id}" is not installed` });
    }

    if (persisted) {
      const next: PersistedMcpEntry = { ...persisted };
      if (workspaceId) next.workspaceId = workspaceId; else delete next.workspaceId;
      saveMcpServerEntry(dataDir(), id, next);
    }
    if (instance) {
      // The runtime reads config.workspaceId live (getToolsForWorkspace) and
      // exposes no scope-update API; re-registering would needlessly kill the
      // process. In-place update is the deliberate exception to immutability.
      instance.config.workspaceId = workspaceId;
    }

    return { ok: true, id, scope: workspaceId ? 'workspace' : 'personal', ...(workspaceId ? { workspaceId } : {}) };
  });

  // NOTE (C2): GET /api/mcps/:id/logs is intentionally NOT implemented — the
  // runtime retains no stderr/stateChange history (mcp-runtime.ts pipes stderr
  // but drops it). Needs a ring buffer in McpServerInstance first; scheduled
  // as a Phase-4 follow-up. PRD §12.8 "view logs" is unmet in v1.
}
