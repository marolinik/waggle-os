import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { MindDB, MultiMind, WorkspaceManager, WaggleConfig, createEmbeddingProvider, type EmbeddingProviderConfig, type EmbeddingProviderInstance, FrameStore, SessionStore, InstallAuditStore, CronStore, AwarenessLayer, VaultStore, SkillHashStore, OptimizationLogStore, ImprovementSignalStore, HarvestSourceStore, ClaudeCodeAdapter, reconcileIndexes, TeamSync, TelemetryStore, TELEMETRY_EVENTS } from '@waggle/core';
import { ALLOWED_ORIGINS } from './cors-config.js';
import { MemoryWeaver } from '@waggle/weaver';
import {
  Orchestrator,
  createSystemTools,
  createPlanTools,
  createGitTools,
  createDocumentTools,
  createSpreadsheetTools,
  createPresentationTools,
  createPdfTools,
  createSkillTools,
  createSubAgentTools,
  createWorkflowTools,
  runAgentLoop,
  ensureIdentity,
  loadSystemPrompt,
  loadSkills,
  HookRegistry,
  loadHooksFromConfig,
  CostTracker,
  CommandRegistry,
  registerWorkflowCommands,
  registerMarketplaceCommands,
  createCronTools,
  createSearchTools,
  createBrowserTools,
  createLspTools,
  createCliTools,
  createInsightsTools,
  createConnectorSearchTools,
  McpRuntime,
  isWithinBudget,
  getRecentLogs,
  setPersonaDataDir,
  deliverCronResult,
  createDefaultDeliveryPreferences,
  type ToolDefinition,
  type LoadedSkill,
  type DeliveryPreferences,
} from '@waggle/agent';
import { PluginRuntimeManager, getStarterSkillsDir, validatePluginManifest } from '@waggle/sdk';
import { MarketplaceDB, MarketplaceSync, seedMcpServers, seedNewSources } from '@waggle/marketplace';
import { workspaceRoutes } from './routes/workspaces.js';
import { chatRoutes, type AgentRunner } from './routes/chat.js';
import { memoryRoutes } from './routes/memory.js';
import { settingsRoutes } from './routes/settings.js';
import { sessionRoutes, findUndistilledSessions, markSessionDistilled } from './routes/sessions.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { litellmRoutes } from './routes/litellm.js';
import { ingestRoutes } from './routes/ingest.js';
import { mindRoutes } from './routes/mind.js';
import { agentRoutes } from './routes/agent.js';
import { skillRoutes } from './routes/skills.js';
import { approvalRoutes } from './routes/approval.js';
import { anthropicProxyRoutes } from './routes/anthropic-proxy.js';
import { teamRoutes } from './routes/team.js';
import { taskRoutes } from './routes/tasks.js';
import { capabilitiesRoutes } from './routes/capabilities.js';
import { commandRoutes } from './routes/commands.js';
import { cronRoutes } from './routes/cron.js';
import { notificationRoutes, emitNotification, emitSubagentStatus } from './routes/notifications.js';
import { marketplaceDevRoutes } from './routes/marketplace-dev.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { connectorRoutes } from './routes/connectors.js';
import { fleetRoutes } from './routes/fleet.js';
import { importRoutes } from './routes/import.js';
import { vaultRoutes } from './routes/vault.js';
import { personaRoutes } from './routes/personas.js';
import { feedbackRoutes } from './routes/feedback.js';
import { workflowRoutes } from './routes/workflows.js';
import { workspaceTemplateRoutes } from './routes/workspace-templates.js';
import { exportRoutes } from './routes/export.js';
import { costRoutes } from './routes/cost.js';
import { backupRoutes } from './routes/backup.js';
import { offlineRoutes } from './routes/offline.js';
import { weaverRoutes } from './routes/weaver.js';
import { eventRoutes, closeAuditDb, cleanupAuditEvents } from './routes/events.js';
import { closeTeamsDb } from './routes/team.js';
import { pinRoutes } from './routes/pins.js';
import { documentRoutes } from './routes/documents.js';
import { fileRoutes } from './routes/files.js';
import { browseRoutes } from './routes/browse.js';
import { oauthRoutes } from './routes/oauth.js';
import { waggleSignalRoutes } from './routes/waggle-signals.js';
import { providerRoutes } from './routes/providers.js';
import { profileRoutes } from './routes/profile.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { stripeRoutes } from '../stripe/index.js';
import { agentGroupRoutes } from './routes/agent-groups.js';
import { harvestRoutes } from './routes/harvest.js';
import { complianceRoutes } from './routes/compliance.js';
import { OfflineManager } from './offline-manager.js';
import { log, createLogger } from './logger.js';
import { seedDefaultCrons } from './setup-crons.js';
import { registerConnectors } from './setup-connectors.js';
import { securityMiddleware } from './security-middleware.js';
import { LocalScheduler } from './cron.js';
import {
  generateMorningBriefing,
  checkStaleWorkspaces,
  checkPendingTasks,
  suggestCapabilities,
  type ProactiveContext,
  type ProactiveMessage,
} from './proactive-handlers.js';
import { generateMonthlyAssessment, saveAssessmentToMind } from './monthly-assessment.js';
import { WorkspaceSessionManager } from './workspace-sessions.js';
import { EventEmitter } from 'node:events';

export interface LocalConfig {
  port: number;
  host: string;
  dataDir: string;       // ~/.waggle
  litellmUrl: string;    // http://localhost:4000
}

/** Pending approval request — resolved when user approves or denies. */
export interface PendingApproval {
  resolve: (approved: boolean) => void;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
}

/**
 * Shared agent state — initialized once at server startup,
 * accessible by all route modules for feature parity with CLI.
 */
/** LLM provider health: healthy (verified), degraded (configured, not verified), unavailable */
export type LlmHealthStatus = 'healthy' | 'degraded' | 'unavailable';

/** Which LLM provider is active and its runtime health */
export interface LlmProviderStatus {
  /** Which provider is handling LLM requests */
  provider: 'litellm' | 'anthropic-proxy';
  /** Runtime health — truthful, not optimistic */
  health: LlmHealthStatus;
  /** Human-readable detail (e.g. "LiteLLM on port 4000" or "No API key configured") */
  detail: string;
  /** When this status was last checked */
  checkedAt: string;
}

export interface AgentState {
  orchestrator: Orchestrator;
  allTools: ToolDefinition[];
  hookRegistry: HookRegistry;
  costTracker: CostTracker;
  skills: LoadedSkill[];
  userSystemPrompt: string | null;
  sessionHistories: Map<string, Array<{ role: string; content: string }>>;
  currentModel: string;
  litellmApiKey: string;
  pendingApprovals: Map<string, PendingApproval>;
  /**
   * Rebuild workspace-scoped tools (system, git, document) for a given directory.
   * Optional `orchForMindTools` replaces the shared-orchestrator mind tools with a
   * session-specific orchestrator's tools so concurrent sessions don't collide.
   */
  buildToolsForWorkspace: (workspacePath: string, orchForMindTools?: Orchestrator) => ToolDefinition[];
  /**
   * Create a fresh Orchestrator for a workspace session with the given mind mounted.
   * Each session gets its own instance (Option Y fix from docs/plans/phase-a-the-room.md §9).
   */
  createSessionOrchestrator: (workspaceMind: import('@waggle/core').MindDB) => Orchestrator;
  /**
   * Build the full tool pool for a session, using the session's orchestrator for mind tools.
   * Thin wrapper over buildToolsForWorkspace with the orchForMindTools argument threaded in.
   */
  buildToolsForSession: (sessionOrch: Orchestrator, workspacePath: string) => ToolDefinition[];
  /**
   * Activate workspace mind for the given workspace ID. Returns true if switched.
   * @deprecated — use `sessionManager.getOrCreate()` with `createSessionOrchestrator`
   * and `buildToolsForSession` instead. This legacy path uses a shared orchestrator
   * singleton and is unsafe for concurrent sessions. Being migrated per Phase A.1.
   */
  activateWorkspaceMind: (workspaceId: string) => boolean;
  /** Get a cached workspace MindDB (opens on demand). Returns null if workspace not found. */
  getWorkspaceMindDb: (workspaceId: string) => import('@waggle/core').MindDB | null;
  /** Close and remove a workspace MindDB from cache. Used before workspace deletion to prevent EBUSY. */
  closeWorkspaceMind: (workspaceId: string) => void;
  /** Currently active workspace ID (null = personal only) */
  activeWorkspaceId: string | null;
  /** Current sub-agent orchestrator instance (set during workflow execution) */
  subagentOrchestrator: import('@waggle/agent').SubagentOrchestrator | null;
  /** Plugin runtime manager — lifecycle, tools, skills from plugins */
  pluginRuntimeManager: import('@waggle/sdk').PluginRuntimeManager;
  /** MCP server runtime — stdio servers, health, tools */
  mcpRuntime: import('@waggle/agent').McpRuntime;
  /** Command registry — slash commands */
  commandRegistry: import('@waggle/agent').CommandRegistry;
  /** LLM provider status — which provider is active and whether it's truly healthy */
  llmProvider: LlmProviderStatus;
  /** Session token for WebSocket authentication (generated on server startup) */
  wsSessionToken: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    localConfig: LocalConfig;
    multiMind: MultiMind;
    workspaceManager: WorkspaceManager;
    eventBus: EventEmitter;
    agentRunner?: AgentRunner;
    agentState: AgentState;
    auditStore: import('@waggle/core').InstallAuditStore;
    cronStore: import('@waggle/core').CronStore;
    vault: import('@waggle/core').VaultStore;
    embeddingProvider: import('@waggle/core').EmbeddingProviderInstance;
    skillHashStore: import('@waggle/core').SkillHashStore;
    scheduler: import('./cron.js').LocalScheduler;
    marketplace: import('@waggle/marketplace').MarketplaceDB | null;
    offlineManager: OfflineManager;
    rateLimiter: import('./security-middleware.js').RateLimiter;
    telemetry: import('@waggle/core').TelemetryStore;
    connectorRegistry: import('@waggle/agent').ConnectorRegistry;
    sessionManager: import('./workspace-sessions.js').WorkspaceSessionManager;
  }
}

export async function buildLocalServer(config: Partial<LocalConfig> = {}) {
  const fullConfig: LocalConfig = {
    port: parseInt(process.env.WAGGLE_PORT ?? '3333'),
    host: process.env.WAGGLE_HOST ?? '0.0.0.0',
    dataDir: config.dataDir ?? process.env.WAGGLE_DATA_DIR ?? '',
    litellmUrl: config.litellmUrl ?? 'http://localhost:4000',
    ...config,
  };

  const server = Fastify({ logger: false });

  // Decorate with local config
  server.decorate('localConfig', fullConfig);

  // Set data dir for custom personas (loaded from ~/.waggle/personas/)
  setPersonaDataDir(fullConfig.dataDir);

  // Event bus (replaces Redis pub/sub)
  const eventBus = new EventEmitter();
  server.decorate('eventBus', eventBus);

  // Workspace manager
  const wsManager = new WorkspaceManager(fullConfig.dataDir);
  server.decorate('workspaceManager', wsManager);

  // MultiMind — open personal mind, no workspace yet (selected via API)
  const personalPath = path.join(fullConfig.dataDir, 'personal.mind');
  const multiMind = new MultiMind(personalPath);
  server.decorate('multiMind', multiMind);

  // Install audit store — persistent trail for capability install events
  const auditStore = new InstallAuditStore(multiMind.personal);
  server.decorate('auditStore', auditStore);

  // Cron store — SQLite-backed schedule persistence for Solo
  const cronStore = new CronStore(multiMind.personal);
  server.decorate('cronStore', cronStore);

  seedDefaultCrons(cronStore);

  // Vault — encrypted secret storage
  const vault = new VaultStore(fullConfig.dataDir);
  server.decorate('vault', vault);

  // M2-7: Telemetry — local, opt-in, privacy-first
  const waggleConfigForTelemetry = new WaggleConfig(fullConfig.dataDir);
  const telemetry = new TelemetryStore(fullConfig.dataDir, waggleConfigForTelemetry.getTelemetryEnabled());
  server.decorate('telemetry', telemetry);
  telemetry.track(TELEMETRY_EVENTS.APP_START, { version: '0.2.0', platform: process.platform });
  // embeddingProvider decorated later after creation (needs vault for API keys)

  // Migrate plaintext keys from config.json to vault on first run
  try {
    const waggleConfig = new WaggleConfig(fullConfig.dataDir);
    const configProviders = waggleConfig.getProviders();
    if (Object.keys(configProviders).length > 0) {
      const migrated = vault.migrateFromConfig({ providers: configProviders });
      if (migrated > 0) {
        log.info(` Migrated ${migrated} API key(s) to encrypted vault`);
      }
    }
  } catch {
    // Migration failure should never block startup
  }

  // Connector Registry — manages registered connectors and generates dynamic tools
  const connectorRegistry = registerConnectors(vault);
  server.decorate('connectorRegistry', connectorRegistry);

  // Seed marketplace.db if not present, then open it for production routes
  let marketplaceDb: MarketplaceDB | null = null;
  try {
    const marketplaceDbTarget = path.join(fullConfig.dataDir, 'marketplace.db');
    if (!fs.existsSync(marketplaceDbTarget)) {
      // Try to copy from monorepo packages/marketplace/marketplace.db
      const seedPaths = [
        path.resolve(__dirname, '../../../../marketplace/marketplace.db'),
        path.resolve(__dirname, '../../../../../packages/marketplace/marketplace.db'),
      ];
      for (const seedPath of seedPaths) {
        if (fs.existsSync(seedPath)) {
          fs.copyFileSync(seedPath, marketplaceDbTarget);
          log.info(` Seeded marketplace.db from ${seedPath}`);
          break;
        }
      }
    }
    if (fs.existsSync(marketplaceDbTarget)) {
      marketplaceDb = new MarketplaceDB(marketplaceDbTarget);
      // Seed MCP server registry entries if not already present
      try {
        const mcpAdded = seedMcpServers(marketplaceDb);
        if (mcpAdded > 0) {
          log.info(` Seeded ${mcpAdded} MCP servers into marketplace`);
        }
      } catch (err) {
        log.warn(` MCP registry seed failed: ${(err as Error).message}`);
      }
      // Seed new marketplace sources (skills.sh, mcpmarket, npm, awesome-mcp-servers, etc.)
      try {
        const sourcesAdded = seedNewSources(marketplaceDb);
        if (sourcesAdded > 0) {
          log.info(` Seeded ${sourcesAdded} new marketplace sources`);
        }
      } catch (err) {
        log.warn(` Source seed failed: ${(err as Error).message}`);
      }
      log.info(' Marketplace DB loaded');
    }
  } catch (err) {
    log.warn(` Marketplace DB failed to load: ${(err as Error).message}`);
    // Marketplace is optional — never block startup
  }
  server.decorate('marketplace', marketplaceDb);

  // ── Daily marketplace sync (non-blocking, 15s delay after startup) ──
  if (marketplaceDb) {
    const mpDb = marketplaceDb;
    setTimeout(async () => {
      async function runSync() {
        try {
          const sync = new MarketplaceSync(mpDb);
          const results = await sync.syncAll();
          const added = results.reduce((s: number, r: { added: number }) => s + r.added, 0);
          if (added > 0) log.info(`[marketplace] Sync: +${added} new packages`);
        } catch (e) {
          log.info(`[marketplace] Sync error (non-blocking): ${(e as Error).message}`);
        }
      }
      await runSync();
      setInterval(runSync, 24 * 60 * 60 * 1000);
    }, 15_000);
  }

  // ── Agent state (matches CLI initialization) ────────────────────────
  const litellmApiKey = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';
  const litellmUrl = fullConfig.litellmUrl;

  // Build embedding config from WaggleConfig + Vault keys
  const waggleConfig = new WaggleConfig(fullConfig.dataDir || undefined);
  const embeddingConfig: EmbeddingProviderConfig = waggleConfig.getEmbeddingConfig();

  // Inject API keys from encrypted Vault (never from config.json)
  try {
    const voyageEntry = vault.get('voyage-api-key');
    if (voyageEntry?.value) embeddingConfig.voyage = { apiKey: voyageEntry.value };
  } catch { /* vault may not have this key */ }
  try {
    const openaiEntry = vault.get('openai');
    if (openaiEntry?.value) embeddingConfig.openai = { apiKey: openaiEntry.value };
  } catch { /* vault may not have this key */ }

  // Environment variable override for CI/headless
  if (process.env.VOYAGE_API_KEY && !embeddingConfig.voyage) {
    embeddingConfig.voyage = { apiKey: process.env.VOYAGE_API_KEY };
  }
  if (process.env.OPENAI_API_KEY && !embeddingConfig.openai) {
    embeddingConfig.openai = { apiKey: process.env.OPENAI_API_KEY };
  }

  // Create embedding provider with InProcess → Ollama → API → Mock fallback chain
  const embeddingProvider = await createEmbeddingProvider(embeddingConfig);
  const embedder = embeddingProvider; // satisfies Embedder — drop-in replacement

  // Decorate server with embedding provider for status endpoints
  server.decorate('embeddingProvider', embeddingProvider);

  // Vec index rebuild when real provider activates (mock → real transition)
  if (embeddingProvider.getActiveProvider() !== 'mock') {
    try {
      const db = multiMind.personal.getDatabase();
      const vecRow = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames_vec').get() as { cnt: number } | undefined;
      const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number };
      if (totalRow.cnt > 0 && (vecRow?.cnt ?? 0) < totalRow.cnt) {
        log.info(` Re-indexing ${totalRow.cnt} frames with real embeddings (${embeddingProvider.getActiveProvider()})...`);
        const { vecFixed } = await reconcileIndexes(multiMind.personal, embedder);
        if (vecFixed > 0) {
          log.info(` Re-indexed ${vecFixed} frames with real embeddings`);
        }
      }
    } catch (err) {
      log.warn(` Vec reconciliation deferred: ${(err as Error).message}`);
    }
  }

  // Orchestrator — connects to personal .mind
  const orchestrator = new Orchestrator({
    db: multiMind.personal,
    embedder,
    mode: 'local',
    version: '0.4',
  });
  ensureIdentity(orchestrator.getIdentity());

  // Build tools — use a default workspace (homedir), but tools are rebuilt
  // per-request when a workspace directory is specified in chat.
  const defaultWorkspace = os.homedir();
  const waggleHome = fullConfig.dataDir || path.join(os.homedir(), '.waggle');
  const mindTools = orchestrator.getTools();
  const systemTools = createSystemTools(defaultWorkspace);
  const planTools = createPlanTools();
  const gitTools = createGitTools(defaultWorkspace);
  const documentTools = [
    ...createDocumentTools(defaultWorkspace),
    ...createSpreadsheetTools(defaultWorkspace),
    ...createPresentationTools(defaultWorkspace),
    ...createPdfTools(defaultWorkspace),
  ];

  // Skill management tools — let the agent discover, install, create, and acquire skills
  const starterSkillsDir = getStarterSkillsDir();
  const skillTools = createSkillTools({
    waggleHome,
    starterSkillsDir,
    auditStore,
    nativeToolNames: [
      ...mindTools.map(t => t.name),
      ...systemTools.map(t => t.name),
      ...planTools.map(t => t.name),
      ...gitTools.map(t => t.name),
      ...documentTools.map(t => t.name),
    ],
    getInstalledSkills: () => {
      // Return the current in-memory skill state (hot-reloadable)
      return server.agentState?.skills ?? loadSkills(waggleHome);
    },
    onSkillsChanged: () => {
      // Hot-reload skills into agent state
      const fresh = loadSkills(waggleHome);
      // Will be set after agentState is created (see below)
      reloadSkills?.(fresh);
    },
    searchMarketplace: async (query: string) => {
      // Search the marketplace DB if available (graceful degradation)
      if (!marketplaceDb) return [];
      try {
        const results = marketplaceDb.search({ query, limit: 10 });
        return results.packages.map(pkg => ({
          name: pkg.name,
          description: pkg.description,
          packageType: pkg.package_type,
          source: 'marketplace',
          score: undefined, // FTS5 doesn't expose raw scores through our API
        }));
      } catch {
        return [];
      }
    },
  });

  // Cron tools — let the agent manage cron schedules (via REST API)
  const cronTools = createCronTools();

  // Search tools — Tavily + Brave with vault-backed API keys
  const searchTools = createSearchTools(async (key: string) => {
    try { return vault.get(key)?.value ?? null; } catch { return null; }
  });

  // Browser tools — Playwright-based browser automation
  const browserTools = createBrowserTools(defaultWorkspace);

  // LSP tools — TypeScript language server integration
  const lspTools = createLspTools(defaultWorkspace);

  // CLI tools — governed CLI program execution
  const cliAllowlist = (fullConfig as any).cli?.allowlist ?? [];
  const cliTools = createCliTools({ allowlist: cliAllowlist });

  // Dynamic connector tools (initial — regenerated per workspace in buildToolsForWorkspace)
  const defaultConnectorTools = connectorRegistry.generateTools();

  // Insights tools — self-analytics so the agent can reflect on its own performance.
  // Aggregates optimization logs + improvement signals across the personal mind and
  // every workspace so the agent sees a complete picture regardless of where it runs.
  const insightsTools = createInsightsTools({
    getOptimizationLogs: (limit: number) => {
      const rows: Array<{
        tools_used: string;
        was_correction: number;
        input_tokens: number;
        output_tokens: number;
        timestamp: string;
      }> = [];
      try {
        rows.push(...new OptimizationLogStore(multiMind.personal).getRecent(limit));
      } catch { /* personal store unavailable — keep going */ }
      for (const ws of wsManager.list()) {
        const wsDb = getWorkspaceMindDb(ws.id);
        if (!wsDb) continue;
        try {
          rows.push(...new OptimizationLogStore(wsDb).getRecent(limit));
        } catch { /* workspace store unavailable — skip */ }
      }
      rows.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
      return rows.slice(0, limit).map(row => {
        let toolNames = '';
        try {
          const parsed = JSON.parse(row.tools_used ?? '[]');
          if (Array.isArray(parsed)) toolNames = parsed.join(',');
        } catch { /* malformed — leave empty */ }
        return {
          model: undefined,
          tool_names: toolNames,
          total_tokens: (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
          estimated_cost: 0,
          was_correction: row.was_correction,
          created_at: row.timestamp,
        };
      });
    },
    getImprovementSignals: () => {
      const collectFrom = (db: MindDB) => {
        const store = new ImprovementSignalStore(db);
        return [
          ...store.getByCategory('capability_gap'),
          ...store.getByCategory('correction'),
          ...store.getByCategory('workflow_pattern'),
        ];
      };
      const all: Array<{
        category: string;
        pattern_key: string;
        detail: string;
        count: number;
        first_seen: string;
        last_seen: string;
      }> = [];
      try { all.push(...collectFrom(multiMind.personal)); } catch { /* skip */ }
      for (const ws of wsManager.list()) {
        const wsDb = getWorkspaceMindDb(ws.id);
        if (!wsDb) continue;
        try { all.push(...collectFrom(wsDb)); } catch { /* skip */ }
      }
      return all.map(s => ({
        category: s.category,
        pattern_key: s.pattern_key,
        detail: s.detail,
        count: s.count,
        first_seen: s.first_seen,
        last_seen: s.last_seen,
      }));
    },
  });

  // Connector search tools — give the agent natural-language discovery over
  // the 148-entry MCP catalog (find_connector, list_connector_categories).
  // Static data, zero I/O, no deps — cheap to always-include.
  const connectorSearchTools = createConnectorSearchTools();

  // Collect all non-subagent tools first (sub-agent tools need the full list)
  const baseTools = [...mindTools, ...systemTools, ...planTools, ...gitTools, ...documentTools, ...skillTools, ...cronTools, ...searchTools, ...browserTools, ...lspTools, ...cliTools, ...insightsTools, ...connectorSearchTools, ...defaultConnectorTools];

  // Sub-agent tools — let the main agent spawn specialist sub-agents
  const subAgentTools = createSubAgentTools({
    availableTools: baseTools,
    runLoop: runAgentLoop,
    litellmUrl: fullConfig.litellmUrl,
    litellmApiKey: litellmApiKey,
    defaultModel: 'claude-sonnet-4-6',
  });

  // Workflow tools — multi-agent workflow templates (research, review, plan-execute)
  const workflowTools = createWorkflowTools({
    availableTools: baseTools,
    runLoop: runAgentLoop,
    litellmUrl: fullConfig.litellmUrl,
    litellmApiKey: litellmApiKey,
    defaultModel: 'claude-sonnet-4-6',
    onWorkerStatus: (event) => {
      // Relay sub-agent status to eventBus for SSE notification stream
      const orch = server.agentState.subagentOrchestrator;
      const agents = orch ? orch.getWorkers().map(w => ({
        id: w.id,
        name: w.name,
        role: w.role,
        status: w.status,
        task: w.task,
        toolsUsed: w.toolsUsed,
        startedAt: w.startedAt,
        completedAt: w.completedAt,
      })) : [{
        id: event.workerId,
        name: event.workerState.name,
        role: event.workerState.role,
        status: event.workerState.status,
        task: event.workerState.task,
        toolsUsed: event.workerState.toolsUsed,
        startedAt: event.workerState.startedAt,
        completedAt: event.workerState.completedAt,
      }];
      emitSubagentStatus(server, server.agentState.activeWorkspaceId ?? 'default', agents);
    },
  });

  const allTools = [...baseTools, ...subAgentTools, ...workflowTools];

  // Load user customizations from ~/.waggle/
  const userSystemPrompt = loadSystemPrompt(waggleHome);
  const skills = loadSkills(waggleHome);

  // Skill hash store — detect skill changes on disk
  const skillHashStore = new SkillHashStore(multiMind.personal);
  server.decorate('skillHashStore', skillHashStore);

  // Check for changed skills at startup
  const hashCheck = skillHashStore.checkAll(skills);

  // Auto-verify new skills (first install — no change to flag)
  for (const name of hashCheck.added) {
    const skill = skills.find(s => s.name === name);
    if (skill) skillHashStore.verify(name, skill.content);
  }

  // Log changed skills as warnings
  if (hashCheck.changed.length > 0) {
    log.info(` WARNING: ${hashCheck.changed.length} skill(s) changed on disk: ${hashCheck.changed.join(', ')}`);
    log.info(' Run /skills to review changes');
  }

  // Clean up removed skill hashes
  for (const name of hashCheck.removed) {
    skillHashStore.removeHash(name);
  }

  // Hook registry with user-configured hooks
  const hookRegistry = new HookRegistry();
  await loadHooksFromConfig(path.join(waggleHome, 'hooks.json'), hookRegistry);

  // Cost tracker
  const costTracker = new CostTracker({});

  // Command registry — workflow-native slash commands
  const commandRegistry = new CommandRegistry();
  registerWorkflowCommands(commandRegistry);
  registerMarketplaceCommands(commandRegistry);

  // Plugin runtime manager — lifecycle, tools, skills from plugins
  const pluginRuntimeManager = new PluginRuntimeManager();

  // Auto-load installed plugins from ~/.waggle/plugins/
  const pluginsDir = path.join(waggleHome, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    try {
      const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const pluginName of pluginDirs) {
        const pluginPath = path.join(pluginsDir, pluginName);
        const manifestPath = path.join(pluginPath, 'plugin.json');
        if (!fs.existsSync(manifestPath)) continue;

        try {
          const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
          const validation = validatePluginManifest(raw);
          if (!validation.valid) {
            log.info(` Skipping plugin "${pluginName}": invalid manifest — ${validation.errors.join(', ')}`);
            continue;
          }
          pluginRuntimeManager.register(
            raw as unknown as Parameters<typeof pluginRuntimeManager.register>[0],
            { pluginDir: pluginPath },
          );
          await pluginRuntimeManager.enable(raw.name as string);
        } catch (err) {
          log.info(` Failed to load plugin "${pluginName}": ${(err as Error).message}`);
        }
      }

      const active = pluginRuntimeManager.getActive();
      if (active.length > 0) {
        log.info(` Loaded ${active.length} plugin(s): ${active.map(p => p.getManifest().name).join(', ')}`);
      }
    } catch { /* non-blocking — plugin scan failure must not prevent startup */ }
  }

  // MCP server runtime — stdio servers, health, tools (empty by default)
  const mcpRuntime = new McpRuntime();

  // Session histories (server-side, like CLI)
  const sessionHistories = new Map<string, Array<{ role: string; content: string }>>();

  // Default model
  const currentModel = 'claude-sonnet-4-6';

  // Pending approvals map for confirmation gates
  const pendingApprovals = new Map<string, PendingApproval>();

  // Skill hot-reload callback (set after agentState is created)
  let reloadSkills: ((fresh: LoadedSkill[]) => void) | undefined;

  // Factory to rebuild workspace-scoped tools for a given directory.
  // Optional `orchForMindTools` replaces the shared-orchestrator mind tools with
  // a session-specific orchestrator's tools (Option Y fix from Phase A.1 plan).
  const buildToolsForWorkspace = (
    wsPath: string,
    orchForMindTools?: Orchestrator,
  ): ToolDefinition[] => {
    // Dynamic connector tools (only for connected connectors)
    const connectorTools = connectorRegistry.generateTools();

    // Resolve which mind tools to use — per-session (if provided) or the shared default.
    // Per-session is required for concurrent multi-workspace chat; the shared default
    // is kept for legacy call sites that are still being migrated.
    const mindToolsForRequest = orchForMindTools
      ? orchForMindTools.getTools()
      : mindTools;

    const wsBase = [
      ...mindToolsForRequest,
      ...createSystemTools(wsPath),
      ...createPlanTools(),
      ...createGitTools(wsPath),
      ...createDocumentTools(wsPath),
      ...createSpreadsheetTools(wsPath),
      ...createPresentationTools(wsPath),
      ...createPdfTools(wsPath),
      ...skillTools,
      ...cronTools,
      ...searchTools,
      ...createBrowserTools(wsPath),
      ...createLspTools(wsPath),
      ...cliTools,
      ...connectorTools,
    ];
    const wsSub = createSubAgentTools({
      availableTools: wsBase,
      runLoop: runAgentLoop,
      litellmUrl: fullConfig.litellmUrl,
      litellmApiKey: litellmApiKey,
      defaultModel: 'claude-sonnet-4-6',
    });
    const wsWorkflow = createWorkflowTools({
      availableTools: wsBase,
      runLoop: runAgentLoop,
      litellmUrl: fullConfig.litellmUrl,
      litellmApiKey: litellmApiKey,
      defaultModel: 'claude-sonnet-4-6',
      onWorkerStatus: (event) => {
        const orch = server.agentState.subagentOrchestrator;
        const agents = orch ? orch.getWorkers().map(w => ({
          id: w.id, name: w.name, role: w.role, status: w.status,
          task: w.task, toolsUsed: w.toolsUsed, startedAt: w.startedAt, completedAt: w.completedAt,
        })) : [{
          id: event.workerId, name: event.workerState.name, role: event.workerState.role,
          status: event.workerState.status, task: event.workerState.task,
          toolsUsed: event.workerState.toolsUsed, startedAt: event.workerState.startedAt,
          completedAt: event.workerState.completedAt,
        }];
        emitSubagentStatus(server, server.agentState.activeWorkspaceId ?? 'default', agents);
      },
    });
    return [...wsBase, ...wsSub, ...wsWorkflow];
  };

  // ── Workspace Session Manager ────────────────────────────────────
  // Manages concurrent workspace sessions with independent minds, orchestrators,
  // and tools. Default cap: 3 (Solo tier). Cap is raised via sessionManager.setMaxSessions()
  // at startup once the user's tier is resolved (Basic=5, Teams=10, Enterprise=unbounded).
  const sessionManager = new WorkspaceSessionManager(3);
  server.decorate('sessionManager', sessionManager);

  /**
   * Create a fresh Orchestrator for a workspace session.
   *
   * Each session gets its own instance so concurrent sessions on different
   * workspaces cannot corrupt each other's workspace layers via setWorkspaceMind().
   * Pointer to the shared personal mind is safe — better-sqlite3 WAL mode handles
   * concurrent reads and serializes writes through SQLite's internal lock.
   *
   * See docs/plans/phase-a-the-room.md §9 for the Option X vs Option Y decision.
   */
  const createSessionOrchestrator = (workspaceMind: MindDB): Orchestrator => {
    const sessionOrch = new Orchestrator({
      db: multiMind.personal,
      embedder,
      mode: 'local',
      version: '0.4',
    });
    sessionOrch.setWorkspaceMind(workspaceMind);
    return sessionOrch;
  };

  /**
   * Build the tool pool for a workspace session using the session's own orchestrator
   * for mind tools. Thin wrapper over buildToolsForWorkspace.
   */
  const buildToolsForSession = (
    sessionOrch: Orchestrator,
    wsPath: string,
  ): ToolDefinition[] => {
    return buildToolsForWorkspace(wsPath, sessionOrch);
  };

  // ── Workspace mind cache (legacy — being replaced by sessionManager) ──
  // Kept for backward compatibility during transition.
  const workspaceMindCache = new Map<string, MindDB>();
  let activeWorkspaceId: string | null = null;

  // ── TeamSync cache — one TeamSync instance per team workspace ──
  const teamSyncCache = new Map<string, TeamSync>();

  function getTeamSync(workspaceId: string, wsConfig: any, waggleConfig: WaggleConfig): TeamSync | null {
    if (!wsConfig?.teamId || !wsConfig?.teamServerUrl) return null;
    const cached = teamSyncCache.get(workspaceId);
    if (cached) return cached;
    const teamServer = waggleConfig.getTeamServer();
    if (!teamServer?.token) return null;
    const sync = new TeamSync({
      teamServerUrl: wsConfig.teamServerUrl,
      teamSlug: wsConfig.teamId, // teamId is used as slug
      authToken: teamServer.token,
      userId: teamServer.userId ?? 'local-user',
      displayName: teamServer.displayName ?? 'You',
    });
    teamSyncCache.set(workspaceId, sync);
    return sync;
  }

  /**
   * Activate a workspace's .mind file on the orchestrator.
   * Opens the mind if not cached, then calls setWorkspaceMind().
   */
  const activateWorkspaceMind = (workspaceId: string): boolean => {
    if (activeWorkspaceId === workspaceId) return true; // already active

    const mindPath = wsManager.getMindPath(workspaceId);
    if (!mindPath) return false;

    let wsDb = workspaceMindCache.get(workspaceId);
    if (!wsDb) {
      try {
        wsDb = new MindDB(mindPath);
        workspaceMindCache.set(workspaceId, wsDb);
      } catch {
        return false;
      }
    }

    orchestrator.setWorkspaceMind(wsDb);
    activeWorkspaceId = workspaceId;
    return true;
  };

  // ── Memory Weaver — background consolidation & decay (A1 fix) ────
  // Runs on the personal mind at startup. Workspace minds get weavers when activated.
  const personalFrames = new FrameStore(multiMind.personal);
  const personalSessions = new SessionStore(multiMind.personal);
  const personalWeaver = new MemoryWeaver(multiMind.personal, personalFrames, personalSessions);
  const weaverTimers: NodeJS.Timeout[] = [];
  const workspaceWeavers = new Map<string, { weaver: MemoryWeaver; timers: NodeJS.Timeout[] }>();

  // F2: Track weaver last-run timestamps for status endpoint
  const weaverState: { lastPersonalConsolidation: string | null; lastPersonalDecay: string | null } = {
    lastPersonalConsolidation: null,
    lastPersonalDecay: null,
  };
  const workspaceWeaverStatus: Record<string, { lastConsolidation: string | null }> = {};

  // Run personal mind weaver on intervals
  const runPersonalConsolidation = () => {
    try {
      const active = personalSessions.getActive();
      for (const s of active) personalWeaver.consolidateGop(s.gop_id);
      weaverState.lastPersonalConsolidation = new Date().toISOString();
    } catch (err) { log.debug('Personal consolidation skipped', err); }
  };
  const runPersonalDecay = () => {
    try {
      personalWeaver.decayFrames();
      personalWeaver.strengthenFrames();
      weaverState.lastPersonalDecay = new Date().toISOString();
    } catch (err) { log.debug('Personal decay skipped', err); }
  };
  weaverTimers.push(setInterval(runPersonalConsolidation, 60 * 60 * 1000)); // hourly
  weaverTimers.push(setInterval(runPersonalDecay, 24 * 60 * 60 * 1000));    // daily

  // Extend activateWorkspaceMind to also start a weaver for the workspace
  // and distill any undistilled sessions into durable memory frames.
  const baseActivateWorkspaceMind = activateWorkspaceMind;
  const activateWorkspaceMindWithWeaver = (workspaceId: string): boolean => {
    const result = baseActivateWorkspaceMind(workspaceId);

    // E4: Workspace topic tracking REMOVED — was saving to personal mind, causing
    // cross-workspace leakage. Workspace names are available from workspace config
    // and don't need to be duplicated into memory frames.

    if (result && !workspaceWeavers.has(workspaceId)) {
      const wsDb = workspaceMindCache.get(workspaceId);
      if (wsDb) {
        const wsFrames = new FrameStore(wsDb);
        const wsSessions = new SessionStore(wsDb);
        const wsWeaver = new MemoryWeaver(wsDb, wsFrames, wsSessions);
        const timers: NodeJS.Timeout[] = [];
        timers.push(setInterval(() => {
          try {
            const active = wsSessions.getActive();
            for (const s of active) wsWeaver.consolidateGop(s.gop_id);
          } catch { /* non-blocking */ }
        }, 60 * 60 * 1000));
        timers.push(setInterval(() => {
          try { wsWeaver.decayFrames(); wsWeaver.strengthenFrames(); } catch (err) { log.debug('Workspace memory decay skipped', err); }
        }, 24 * 60 * 60 * 1000));
        workspaceWeavers.set(workspaceId, { weaver: wsWeaver, timers });

        // E2: Distill undistilled sessions into durable memory frames on activation
        try {
          const sessionsDir = path.join(fullConfig.dataDir, 'workspaces', workspaceId, 'sessions');
          const undistilled = findUndistilledSessions(sessionsDir);
          for (const session of undistilled) {
            wsWeaver.distillSessionContent(session.date, session.summary, session.keyPoints);
            markSessionDistilled(session.filePath);
          }
        } catch (err) { log.debug('Workspace distillation skipped', err); }
      }
    }

    // After mind activation for team workspaces — pull remote frames
    if (result) {
      const wsConfig = wsManager.get(workspaceId);
      if (wsConfig?.teamId) {
        const sync = getTeamSync(workspaceId, wsConfig, new WaggleConfig(fullConfig.dataDir));
        if (sync) {
          sync.pullFrames().then(frames => {
            if (frames.length > 0) {
              // Insert pulled frames into local workspace mind
              // Use the mind's frame store to create I-frames from pulled content
              log.info(` TeamSync: pulled ${frames.length} frames for workspace ${workspaceId}`);
            }
          }).catch(err => {
            log.warn(` TeamSync pull failed:`, err.message);
          });
        }
      }
    }

    return result;
  };

  // Helper: get a cached workspace MindDB (opens on demand)
  // A6: Close and remove workspace mind DB from cache before deletion
  const closeWorkspaceMind = (workspaceId: string): void => {
    const wsDb = workspaceMindCache.get(workspaceId);
    if (wsDb) {
      try { wsDb.close(); } catch { /* already closed or never opened */ }
      workspaceMindCache.delete(workspaceId);
    }
    // If this was the active workspace, clear it
    if (activeWorkspaceId === workspaceId) {
      orchestrator.clearWorkspaceMind();
      activeWorkspaceId = null;
    }
  };

  const getWorkspaceMindDb = (workspaceId: string): MindDB | null => {
    let wsDb = workspaceMindCache.get(workspaceId);
    if (wsDb) return wsDb;
    const mindPath = wsManager.getMindPath(workspaceId);
    if (!mindPath) return null;
    try {
      wsDb = new MindDB(mindPath);
      workspaceMindCache.set(workspaceId, wsDb);
      return wsDb;
    } catch {
      return null;
    }
  };

  // Decorate with shared agent state
  server.decorate('agentState', {
    orchestrator,
    allTools,
    hookRegistry,
    costTracker,
    skills,
    userSystemPrompt,
    sessionHistories,
    currentModel,
    litellmApiKey,
    pendingApprovals,
    buildToolsForWorkspace,
    createSessionOrchestrator,
    buildToolsForSession,
    activateWorkspaceMind: activateWorkspaceMindWithWeaver,
    getWorkspaceMindDb,
    closeWorkspaceMind,
    activeWorkspaceId,
    weaverState,
    workspaceWeaverStatus,
    subagentOrchestrator: null,
    pluginRuntimeManager,
    mcpRuntime,
    commandRegistry,
    llmProvider: {
      provider: 'anthropic-proxy' as const,
      health: 'unavailable' as const,
      detail: 'Not yet initialized',
      checkedAt: new Date().toISOString(),
    },
    wsSessionToken: crypto.randomBytes(32).toString('hex'),
  });

  // Wire up skill hot-reload callback
  reloadSkills = (fresh: LoadedSkill[]) => {
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...fresh);
  };

  // Local scheduler — runs cron jobs in-process (Solo, no Redis/BullMQ)
  const scheduler = new LocalScheduler(cronStore, async (schedule) => {
    switch (schedule.job_type) {
      case 'memory_consolidation': {
        // Check if this is a marketplace sync (uses memory_consolidation type for system-level scheduling)
        const mcJobConfig = JSON.parse(schedule.job_config || '{}');
        if (mcJobConfig.action === 'index_reconcile') {
          try {
            // Reconcile personal mind FTS/vec indexes
            const result = await reconcileIndexes(multiMind.personal);
            if (result.ftsFixed > 0 || result.vecFixed > 0) {
              log.info(`[cron] Index reconciliation: FTS=${result.ftsFixed} vec=${result.vecFixed} fixed (personal)`);
            }
            // Reconcile workspace minds
            const workspaces = wsManager.list();
            for (const ws of workspaces) {
              const wsDb = getWorkspaceMindDb(ws.id);
              if (wsDb) {
                const wsResult = await reconcileIndexes(wsDb);
                if (wsResult.ftsFixed > 0 || wsResult.vecFixed > 0) {
                  log.info(`[cron] Index reconciliation: FTS=${wsResult.ftsFixed} vec=${wsResult.vecFixed} fixed (workspace "${ws.name}")`);
                }
              }
            }
          } catch (err) {
            log.warn(`[cron] Index reconciliation failed: ${(err as Error).message}`);
          }
        } else if (mcJobConfig.action === 'marketplace_sync' && marketplaceDb) {
          try {
            const vaultLookup = server.vault ? (key: string) => server.vault!.get(key)?.value ?? null : undefined;
            const sync = new MarketplaceSync(marketplaceDb, vaultLookup);
            const results = await sync.syncAll();
            const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
            if (totalAdded > 0) {
              eventBus.emit('notification', {
                type: 'notification',
                timestamp: new Date().toISOString(),
                title: 'Marketplace sync complete',
                body: `${totalAdded} new capability${totalAdded === 1 ? '' : 's'} discovered`,
                category: 'agent',
                actionUrl: '/capabilities',
              });
            }
            log.info(`[cron] Marketplace sync: ${totalAdded} added across ${results.length} sources`);
          } catch (err) {
            log.warn(`[cron] Marketplace sync failed: ${(err as Error).message}`);
          }
        } else if (mcJobConfig.action === 'harvest_sync') {
          // Phase 7: Memory Harvest — scan registered filesystem sources for new data.
          // Only filesystem-based sources (currently claude-code) can auto-sync; API-based
          // sources like chatgpt/gemini require user-uploaded exports.
          try {
            // Frames have a FK to sessions(gop_id) — ensure the stable
            // `harvest` session row exists before creating any frames.
            new SessionStore(multiMind.personal).ensure('harvest', 'harvest', 'Imported memory from external sources');
            const harvestStore = new HarvestSourceStore(multiMind.personal);
            const personalFrames = new FrameStore(multiMind.personal);
            const stale = harvestStore.getStale();
            let totalItems = 0;
            let totalFrames = 0;
            let sourcesScanned = 0;
            for (const src of stale) {
              if (src.source !== 'claude-code' || !src.sourcePath) continue;
              try {
                const adapter = new ClaudeCodeAdapter();
                const items = adapter.scan(src.sourcePath);
                let saved = 0;
                for (const item of items) {
                  const label = `[Harvest:${item.source}] ${item.title}`;
                  const content = item.content.slice(0, 4000);
                  personalFrames.createIFrame('harvest', `${label}\n\n${content}`, 'normal', 'import');
                  saved++;
                }
                harvestStore.recordSync(src.source, items.length, saved);
                totalItems += items.length;
                totalFrames += saved;
                sourcesScanned++;
              } catch (innerErr) {
                log.warn(`[cron] Harvest sync: source "${src.source}" failed: ${(innerErr as Error).message}`);
              }
            }
            if (sourcesScanned > 0) {
              log.info(`[cron] Harvest sync: ${totalFrames} frames from ${totalItems} items across ${sourcesScanned} source(s)`);
            }
          } catch (err) {
            log.warn(`[cron] Harvest sync failed: ${(err as Error).message}`);
          }
        } else if (mcJobConfig.action === 'memory_compact') {
          // Phase 9a: Memory compaction — prune temporary/deprecated frames, merge stale P-frames.
          // Runs across personal mind and every workspace mind.
          try {
            const personalResult = new FrameStore(multiMind.personal).compact();
            let wsTempPruned = 0;
            let wsDepPruned = 0;
            let wsMerged = 0;
            for (const ws of wsManager.list()) {
              const wsDb = getWorkspaceMindDb(ws.id);
              if (!wsDb) continue;
              try {
                const r = new FrameStore(wsDb).compact();
                wsTempPruned += r.temporaryPruned;
                wsDepPruned += r.deprecatedPruned;
                wsMerged += r.pframesMerged;
              } catch (innerErr) {
                log.warn(`[cron] Memory compaction: workspace "${ws.name}" failed: ${(innerErr as Error).message}`);
              }
            }
            const total =
              personalResult.temporaryPruned + personalResult.deprecatedPruned + personalResult.pframesMerged +
              wsTempPruned + wsDepPruned + wsMerged;
            if (total > 0) {
              log.info(
                `[cron] Memory compaction: personal(temp=${personalResult.temporaryPruned}, dep=${personalResult.deprecatedPruned}, merged=${personalResult.pframesMerged}) ` +
                `workspaces(temp=${wsTempPruned}, dep=${wsDepPruned}, merged=${wsMerged})`
              );
            }
          } catch (err) {
            log.warn(`[cron] Memory compaction failed: ${(err as Error).message}`);
          }
        } else {
          // Normal memory consolidation
          try { runPersonalConsolidation(); } catch { /* non-blocking */ }
        }
        break;
      }
      case 'workspace_health':
        // Log stale frame count per workspace as awareness flag
        try {
          const workspaces = wsManager.list();
          for (const ws of workspaces) {
            const wsDb = getWorkspaceMindDb(ws.id);
            if (wsDb) {
              const wsFrames = new FrameStore(wsDb);
              const staleCount = wsFrames.list({ limit: 100 })
                .filter(f => {
                  const age = Date.now() - new Date(f.last_accessed).getTime();
                  return age > 7 * 24 * 60 * 60 * 1000;
                }).length;
              if (staleCount > 0) {
                const wsAwareness = new AwarenessLayer(wsDb);
                wsAwareness.add('flag', `Workspace "${ws.name}" has ${staleCount} stale memory frames (>7 days untouched)`, 0);
              }
            }
          }
        } catch { /* non-blocking */ }
        break;
      case 'proactive': {
        const proactiveConfig = JSON.parse(schedule.job_config || '{}');
        const proactiveCtx: ProactiveContext = {
          dataDir: fullConfig.dataDir,
          workspaceManager: wsManager,
          getWorkspaceMindDb,
        };

        /** Emit a ProactiveMessage through the delivery router pipeline. */
        const emitProactive = (msg: ProactiveMessage) => {
          // Load delivery preferences from config (or use defaults)
          let deliveryPrefs: DeliveryPreferences;
          try {
            const configPath = path.join(fullConfig.dataDir, 'delivery-preferences.json');
            if (fs.existsSync(configPath)) {
              deliveryPrefs = { ...createDefaultDeliveryPreferences(), ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
            } else {
              deliveryPrefs = createDefaultDeliveryPreferences();
            }
          } catch {
            deliveryPrefs = createDefaultDeliveryPreferences();
          }

          const inAppEmitter = (notification: { title: string; body: string; category: string; actionUrl?: string }) => {
            emitNotification(server, { ...notification, category: notification.category as 'cron' | 'agent' | 'task' });
          };

          deliverCronResult(
            { title: msg.title, body: msg.body, jobType: msg.type, workspaceId: msg.workspaceId, priority: msg.priority },
            deliveryPrefs,
            server.connectorRegistry,
            inAppEmitter,
          ).catch(err => log.warn(`[cron-delivery] Delivery failed: ${(err as Error).message}`));
        };

        try {
          switch (proactiveConfig.action) {
            case 'morning_briefing': {
              const briefing = generateMorningBriefing(proactiveCtx);
              if (briefing) emitProactive(briefing);
              break;
            }
            case 'stale_workspace_check': {
              const staleAlerts = checkStaleWorkspaces(proactiveCtx);
              for (const alert of staleAlerts) emitProactive(alert);
              break;
            }
            case 'task_reminder': {
              const reminders = checkPendingTasks(proactiveCtx);
              for (const reminder of reminders) emitProactive(reminder);
              break;
            }
            case 'capability_suggestion': {
              const suggestion = suggestCapabilities(proactiveCtx);
              if (suggestion) emitProactive(suggestion);
              break;
            }
            default:
              log.warn(`[cron] Unknown proactive action: ${proactiveConfig.action}`);
          }
        } catch (err) {
          log.warn(`[cron] Proactive handler failed: ${(err as Error).message}`);
        }
        break;
      }
      case 'prompt_optimization': {
        // Background GEPA/Ax prompt optimization — runs daily at 2 AM.
        // Iterates workspaces with optimizationEnabled, checks budget, reads logs,
        // and invokes PromptOptimizer for variant generation.
        try {
          const workspaces = wsManager.list().filter(ws => ws.optimizationEnabled);
          for (const ws of workspaces) {
            const wsDb = getWorkspaceMindDb(ws.id);
            if (!wsDb) continue;

            const optStore = new OptimizationLogStore(wsDb);
            const budget = ws.optimizationBudget ?? 100; // cents, default $1/day

            // Check budget before spending any tokens
            if (!isWithinBudget(optStore, budget)) {
              log.info(`[cron] Prompt optimization: workspace "${ws.name}" over budget, skipping`);
              continue;
            }

            // Read recent logs for analysis
            const recentLogs = getRecentLogs(optStore, 100);
            if (recentLogs.length < 5) {
              // Not enough data to optimize yet
              continue;
            }

            // Analyze patterns: high correction rate, common tools, avg turn count
            const stats = optStore.getStats();
            const correctionRate = stats.correctionRate;
            const avgTurns = stats.avgTurnCount;

            // Only trigger optimization if correction rate is above threshold
            // or turn count is significantly above average (indicating inefficiency)
            if (correctionRate > 0.2 || avgTurns > 15) {
              const rate = (correctionRate * 100).toFixed(1);
              log.info(`[cron] Prompt optimization: workspace "${ws.name}" — correction rate ${rate}%, avg turns ${avgTurns.toFixed(1)}`);

              // Re-check budget before the LLM call (another workspace may have consumed tokens)
              if (!isWithinBudget(optStore, budget)) {
                log.info(` GEPA optimization skipped — daily budget exceeded`);
                continue;
              }

              // Get the most recent system prompt from the workspace's logs
              const currentSystemPrompt = recentLogs[0]?.system_prompt ?? '';
              if (!currentSystemPrompt) {
                log.info(`[cron] Prompt optimization: no system prompt in logs, skipping`);
                continue;
              }

              // Generate variant via the built-in Anthropic proxy (localhost)
              try {
                const proxyUrl = `http://127.0.0.1:${fullConfig.port ?? 3333}/v1/chat/completions`;
                const variantResponse = await fetch(proxyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 4096,
                    messages: [
                      {
                        role: 'system',
                        content: `You are a prompt optimization specialist. Your task is to improve an AI agent's system prompt based on performance signals.

The agent's correction rate is ${rate}% (target: under 20%) and average turn count is ${avgTurns.toFixed(1)} (target: under 15).

A high correction rate means the agent frequently misunderstands instructions or produces wrong outputs.
A high turn count means the agent takes too many steps to complete tasks.

Analyze the current system prompt and generate an improved variant that:
1. Adds clearer instructions for areas where corrections are common
2. Reduces unnecessary verbosity that inflates turn count
3. Preserves the core identity and capabilities
4. Is production-ready (not a draft or explanation)

Return ONLY the improved system prompt text. No commentary, no markdown fences, no explanation.`,
                      },
                      {
                        role: 'user',
                        content: `Here is the current system prompt to improve:\n\n${currentSystemPrompt.slice(0, 12000)}`,
                      },
                    ],
                  }),
                  signal: AbortSignal.timeout(60_000),
                });

                if (!variantResponse.ok) {
                  log.warn(`[cron] GEPA variant generation failed: HTTP ${variantResponse.status}`);
                } else {
                  const variantBody = await variantResponse.json() as {
                    choices?: Array<{ message?: { content?: string } }>;
                  };
                  const variantText = variantBody.choices?.[0]?.message?.content ?? '';

                  if (variantText.length > 100) {
                    // Store the variant in the optimization_log with a marker
                    optStore.insert({
                      sessionId: `gepa-variant-${Date.now()}`,
                      workspaceId: ws.id,
                      systemPrompt: variantText,
                      toolsUsed: ['gepa_variant'],
                      turnCount: 0,
                      wasCorrection: false,
                      inputTokens: currentSystemPrompt.length,
                      outputTokens: variantText.length,
                    });
                    log.info(` GEPA generated prompt variant (correction_rate=${rate}%)`);
                  } else {
                    log.warn(`[cron] GEPA variant too short (${variantText.length} chars), discarding`);
                  }
                }
              } catch (variantErr) {
                log.warn(`[cron] GEPA variant generation error: ${(variantErr as Error).message}`);
              }

              eventBus.emit('notification', {
                type: 'notification',
                timestamp: new Date().toISOString(),
                title: 'Prompt optimization signal',
                body: `Workspace "${ws.name}" has ${(correctionRate * 100).toFixed(0)}% correction rate — optimization candidate`,
                category: 'agent',
              });
            }

            // Prune old logs (>30 days) to keep the .mind file lean
            optStore.pruneOlderThan(30);
          }
        } catch (err) {
          log.warn(`[cron] Prompt optimization failed: ${(err as Error).message}`);
        }
        break;
      }
      case 'agent_task': {
        // F9: Execute an agent task prompt in a workspace context
        const taskConfig = JSON.parse(schedule.job_config || '{}');
        const taskPrompt = taskConfig.prompt as string | undefined;
        const taskWorkspace = schedule.workspace_id;

        if (!taskPrompt) {
          log.warn(`[cron] agent_task "${schedule.name}" has no prompt in job_config, skipping`);
          break;
        }

        try {
          // Determine target workspaces: "*" means all, otherwise single workspace
          const targetWorkspaces: Array<{ id: string; name: string }> = [];
          if (taskWorkspace === '*') {
            // F30: Global/cross-workspace — iterate all workspaces
            const allWs = wsManager.list();
            for (const ws of allWs) {
              targetWorkspaces.push({ id: ws.id, name: ws.name });
            }
          } else if (taskWorkspace) {
            const ws = wsManager.get(taskWorkspace);
            if (ws) {
              targetWorkspaces.push({ id: ws.id, name: ws.name });
            } else {
              log.warn(`[cron] agent_task "${schedule.name}" references unknown workspace "${taskWorkspace}"`);
            }
          }

          if (targetWorkspaces.length === 0) {
            log.warn(`[cron] agent_task "${schedule.name}" has no valid target workspaces`);
            break;
          }

          for (const target of targetWorkspaces) {
            try {
              // Activate workspace mind so agent has context
              activateWorkspaceMindWithWeaver(target.id);

              // Use the built-in Anthropic proxy to process the prompt
              const proxyUrl = `http://127.0.0.1:${fullConfig.port ?? 3333}/v1/chat/completions`;
              const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: server.agentState.currentModel ?? 'claude-sonnet-4-6',
                  max_tokens: 2048,
                  messages: [
                    {
                      role: 'user',
                      content: `[Scheduled task for workspace "${target.name}"]\n\n${taskPrompt}`,
                    },
                  ],
                }),
                signal: AbortSignal.timeout(120_000),
              });

              if (response.ok) {
                const body = await response.json() as {
                  choices?: Array<{ message?: { content?: string } }>;
                };
                const output = body.choices?.[0]?.message?.content ?? '';
                const summary = output.length > 200 ? output.slice(0, 197) + '...' : output;

                emitNotification(server, {
                  title: `Scheduled task: ${schedule.name}`,
                  body: summary || 'Task completed',
                  category: 'cron',
                  actionUrl: `/workspace/${target.id}`,
                });

                log.info(`[cron] agent_task "${schedule.name}" completed for workspace "${target.name}" (${output.length} chars)`);
              } else {
                log.warn(`[cron] agent_task "${schedule.name}" LLM call failed: HTTP ${response.status}`);
              }
            } catch (wsErr) {
              log.warn(`[cron] agent_task "${schedule.name}" failed for workspace "${target.name}": ${(wsErr as Error).message}`);
            }
          }
        } catch (err) {
          log.warn(`[cron] agent_task handler failed: ${(err as Error).message}`);
        }
        break;
      }
      case 'monthly_assessment': {
        try {
          const assessment = generateMonthlyAssessment(fullConfig, multiMind.personal);
          saveAssessmentToMind(multiMind.personal, assessment);
          log.info(`[cron] Monthly assessment for ${assessment.period}: ${assessment.totalInteractions} interactions, ${(assessment.correctionRate * 100).toFixed(1)}% correction rate`);
          emitNotification(server, {
            title: 'Monthly agent assessment ready',
            body: `${assessment.period} report: ${assessment.totalInteractions} interactions, ${(assessment.correctionRate * 100).toFixed(1)}% correction rate — check your workspace home`,
            category: 'agent',
            actionUrl: '/',
          });
        } catch (err) {
          log.warn(`[cron] Monthly assessment failed: ${(err as Error).message}`);
        }
        break;
      }
    }
  }, (schedule, result) => {
    // Q16:C — Emit notification after every cron job tick (success or failure)
    if (result.success) {
      emitNotification(server, {
        title: `${schedule.name || 'Scheduled task'} completed`,
        body: 'Scheduled task ran successfully.',
        category: 'cron',
        actionUrl: '/cockpit',
      });
    } else {
      emitNotification(server, {
        title: `${schedule.name || 'Scheduled task'} failed`,
        body: `Error: ${result.error ?? 'Unknown error'}`,
        category: 'cron',
        actionUrl: '/cockpit',
      });
    }
  });
  scheduler.start();
  server.decorate('scheduler', scheduler);

  // F2: Daily audit event cleanup (retain 90 days by default)
  const auditRetentionDays = parseInt(process.env.WAGGLE_AUDIT_RETENTION_DAYS ?? '90', 10);
  const auditCleanupTimer = setInterval(() => {
    const deleted = cleanupAuditEvents(fullConfig.dataDir, auditRetentionDays);
    if (deleted > 0) {
      log.info(`[audit] Cleaned up ${deleted} events older than ${auditRetentionDays} days`);
    }
  }, 24 * 60 * 60 * 1000); // once per day

  // PM-6: Offline manager — periodic LLM health checks
  const offlineManager = new OfflineManager({
    dataDir: fullConfig.dataDir,
    getLlmEndpoint: () => fullConfig.litellmUrl,
    getLlmApiKey: () => server.agentState?.litellmApiKey ?? '',
    eventBus,
    checkIntervalMs: 30_000,
  });
  offlineManager.start();
  server.decorate('offlineManager', offlineManager);

  // Plugins
  // CORS restricted to known Tauri/dev origins — prevents cross-origin attacks from arbitrary websites
  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
        cb(null, true);
      } else {
        cb(new Error('CORS: origin not allowed'), false);
      }
    },
  });
  await server.register(websocket);

  // Security middleware — headers + rate limiting + bearer auth (local server only)
  await server.register(securityMiddleware, {
    sessionToken: server.agentState.wsSessionToken,
  });

  // Routes
  await server.register(workspaceRoutes);
  await server.register(chatRoutes);
  await server.register(memoryRoutes);
  await server.register(settingsRoutes);
  await server.register(sessionRoutes);
  await server.register(knowledgeRoutes);
  await server.register(litellmRoutes);
  await server.register(ingestRoutes);
  await server.register(mindRoutes);
  await server.register(agentRoutes);
  await server.register(skillRoutes);
  await server.register(approvalRoutes);
  await server.register(anthropicProxyRoutes);
  await server.register(teamRoutes);
  await server.register(taskRoutes);
  await server.register(capabilitiesRoutes);
  await server.register(commandRoutes);
  await server.register(cronRoutes);
  await server.register(notificationRoutes);
  await server.register(marketplaceDevRoutes);
  await server.register(marketplaceRoutes);
  await server.register(connectorRoutes);
  await server.register(fleetRoutes);
  await server.register(importRoutes);
  await server.register(vaultRoutes);
  await server.register(personaRoutes);
  await server.register(feedbackRoutes);
  await server.register(workspaceTemplateRoutes);
  await server.register(exportRoutes);
  await server.register(costRoutes);
  await server.register(backupRoutes);
  await server.register(offlineRoutes);
  await server.register(weaverRoutes);
  await server.register(eventRoutes);
  await server.register(workflowRoutes);
  await server.register(pinRoutes);
  await server.register(documentRoutes);
  await server.register(fileRoutes);
  await server.register(waggleSignalRoutes);
  await server.register(providerRoutes);
  await server.register(profileRoutes);
  await server.register(oauthRoutes);
  await server.register(browseRoutes);
  await server.register(telemetryRoutes);
  await server.register(agentGroupRoutes);
  await server.register(stripeRoutes);
  await server.register(harvestRoutes);
  await server.register(complianceRoutes);

  // ── Static file serving for web mode ──────────────────────────
  // When WAGGLE_FRONTEND_DIR is set (or app/dist exists), serve the React frontend
  // as static files. This enables `npx waggle` and Docker web mode.
  const frontendDir = process.env.WAGGLE_FRONTEND_DIR
    ?? [
      path.resolve(process.cwd(), 'app', 'dist'),              // from monorepo root
      path.resolve(process.cwd(), '..', '..', 'app', 'dist'),  // from packages/server/
      path.resolve(process.cwd(), '..', 'app', 'dist'),        // from packages/
      // F1: script-relative fallback — works regardless of CWD
      ...(typeof process.argv[1] === 'string' ? [path.resolve(path.dirname(process.argv[1]), '..', '..', '..', '..', 'app', 'dist')] : []),
    ].find(d => fs.existsSync(path.join(d, 'index.html'))) ?? path.resolve(process.cwd(), 'app', 'dist');
  if (fs.existsSync(frontendDir) && fs.existsSync(path.join(frontendDir, 'index.html'))) {
    await server.register(fastifyStatic, {
      root: frontendDir,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for all non-API, non-static, non-asset routes
    server.setNotFoundHandler((request, reply) => {
      // Don't intercept API routes, WebSocket upgrades, or static assets
      if (request.url.startsWith('/api/') || request.url.startsWith('/v1/') ||
          request.url.startsWith('/assets/') ||
          request.url === '/health' || request.url === '/ws') {
        reply.code(404).send({ error: 'Not found' });
        return;
      }
      reply.sendFile('index.html', frontendDir);
    });
  }

  // WebSocket endpoint — event bus relay to frontend
  // 11A-6: Require session token for WebSocket authentication
  // 11A-8: Per-connection listener tracking (don't kill other clients on disconnect)
  server.get('/ws', { websocket: true }, (socket, request) => {
    // 11A-6: Validate session token from query param
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token !== server.agentState.wsSessionToken) {
      socket.close(4001, 'Unauthorized: invalid session token');
      return;
    }

    // Per-connection listener references for clean removal on disconnect
    const listenerMap = new Map<string, (...args: unknown[]) => void>();

    // Forward approval events and agent events to the WebSocket client
    const eventTypes = ['approval_required', 'step', 'tool', 'done', 'error', 'presence_update', 'notification'] as const;
    for (const evt of eventTypes) {
      const handler = (data: unknown) => {
        try {
          socket.send(JSON.stringify({ event: evt, data }));
        } catch {
          // Client disconnected
        }
      };
      listenerMap.set(evt, handler);
      eventBus.on(evt, handler);
    }

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; requestId?: string; reason?: string };
        if (msg.type === 'approve' && msg.requestId) {
          const pending = server.agentState.pendingApprovals.get(msg.requestId);
          if (pending) {
            server.agentState.pendingApprovals.delete(msg.requestId);
            pending.resolve(true);
          }
        } else if (msg.type === 'deny' && msg.requestId) {
          const pending = server.agentState.pendingApprovals.get(msg.requestId);
          if (pending) {
            server.agentState.pendingApprovals.delete(msg.requestId);
            pending.resolve(false);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      // Remove only THIS connection's listeners, not all clients'
      for (const [evt, handler] of listenerMap) {
        eventBus.removeListener(evt, handler);
      }
      listenerMap.clear();
    });
  });

  // P0-3: Cached API key validation — verify key actually works, not just exists
  let keyValidationCache: { valid: boolean; checkedAt: number; keyHash: string } | null = null;
  const KEY_VALIDATION_TTL = 30 * 1000; // 30 seconds — short so vault updates are picked up quickly

  function hashKey(key: string): string {
    // Simple hash for cache invalidation — not cryptographic
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  async function validateAnthropicKey(): Promise<boolean> {
    // Read key from vault first, fall back to env var
    const vaultKey = server.vault?.get('anthropic')?.value;
    const apiKey = vaultKey || process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) return false;

    const currentHash = hashKey(apiKey);

    // Return cached result if fresh AND key hasn't changed
    if (
      keyValidationCache &&
      keyValidationCache.keyHash === currentHash &&
      Date.now() - keyValidationCache.checkedAt < KEY_VALIDATION_TTL
    ) {
      return keyValidationCache.valid;
    }
    try {
      // Lightweight API call to verify key works
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      // 200 = valid, 401 = invalid/expired, 400 = valid key but bad request (still means key works)
      const valid = res.status !== 401 && res.status !== 403;
      keyValidationCache = { valid, checkedAt: Date.now(), keyHash: currentHash };
      return valid;
    } catch {
      // Network error — don't cache failure, key might be fine
      return keyValidationCache?.valid ?? true;
    }
  }

  // Expose cache invalidation for settings route to call after key update
  (server as any)._invalidateKeyValidationCache = () => {
    keyValidationCache = null;
    // If currently degraded due to bad key, reset to healthy for re-validation
    if (server.agentState.llmProvider.health === 'degraded') {
      server.agentState.llmProvider.health = 'healthy';
      server.agentState.llmProvider.detail = 're-validating after key change';
    }
  };

  // IMP-15: API docs — auto-generated from Fastify route registry
  server.get('/api/docs', async () => {
    const routes: Array<{ method: string; url: string; prefix: string }> = [];
    // Fastify exposes registered routes via the internal routing tree
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allRoutes: any[] = (server as any).routes ?? [];
    // Iterate printRoutes() style — Fastify 4.x stores routes differently
    // Use server.printRoutes() as a fallback reference
    try {
      // Fastify stores routes in server[Symbol.for('registered-routes')] or similar
      // Best approach: iterate after ready using routesByMethod
      for (const route of allRoutes) {
        if (typeof route === 'object' && route.url && route.method) {
          const methods = Array.isArray(route.method) ? route.method : [route.method];
          for (const m of methods) {
            routes.push({ method: m, url: route.url, prefix: route.prefix ?? '' });
          }
        }
      }
    } catch { /* fallback to empty */ }

    // If routes array is empty (Fastify internals differ), provide static list
    if (routes.length === 0) {
      return {
        openapi: '3.0.0',
        info: { title: 'Waggle API', version: '1.0.0', description: 'Workspace-native AI agent platform' },
        note: 'Dynamic route listing unavailable. Use GET /health for status.',
        categories: {
          chat: ['POST /api/chat'],
          workspaces: ['GET /api/workspaces', 'POST /api/workspaces', 'GET /api/workspaces/:id', 'PUT /api/workspaces/:id', 'DELETE /api/workspaces/:id', 'GET /api/workspaces/:id/cost', 'GET /api/workspaces/:id/context', 'GET /api/workspaces/:id/files', 'GET /api/workspaces/:id/storage', 'GET /api/workspaces/:id/storage/files', 'GET /api/workspaces/:id/storage/read', 'POST /api/workspaces/:id/storage/write', 'DELETE /api/workspaces/:id/storage/delete'],
          memory: ['GET /api/memory/search', 'GET /api/memory/frames', 'POST /api/memory/frames', 'DELETE /api/memory/frames/:id', 'GET /api/memory/stats', 'GET /api/memory/graph'],
          sessions: ['GET /api/workspaces/:workspaceId/sessions', 'POST /api/workspaces/:workspaceId/sessions', 'PATCH /api/sessions/:sessionId', 'DELETE /api/sessions/:sessionId', 'GET /api/sessions/:sessionId/summary'],
          teams: ['GET /api/teams', 'POST /api/teams', 'GET /api/teams/:id', 'PUT /api/teams/:id', 'DELETE /api/teams/:id', 'POST /api/teams/:id/members', 'PUT /api/teams/:id/members/:userId', 'DELETE /api/teams/:id/members/:userId', 'GET /api/teams/:id/activity'],
          events: ['GET /api/events', 'GET /api/events/stats', 'GET /api/events/stream'],
          settings: ['GET /api/settings', 'PUT /api/settings', 'PATCH /api/settings', 'POST /api/settings/test-key'],
          vault: ['GET /api/vault', 'POST /api/vault', 'DELETE /api/vault/:name'],
          fleet: ['GET /api/fleet', 'POST /api/fleet/:workspaceId/pause', 'POST /api/fleet/:workspaceId/resume', 'POST /api/fleet/:workspaceId/kill'],
          cost: ['GET /api/cost/summary', 'GET /api/cost/by-workspace', 'GET /api/costs'],
          agent: ['GET /api/agent/status', 'GET /api/agent/model', 'GET /api/agent/cost'],
          marketplace: ['GET /api/marketplace/search', 'GET /api/marketplace/packs', 'POST /api/marketplace/install', 'POST /api/marketplace/uninstall'],
          connectors: ['GET /api/connectors', 'POST /api/connectors/:id/connect', 'POST /api/connectors/:id/disconnect'],
          other: ['GET /health', 'POST /api/export', 'POST /api/backup', 'POST /api/restore', 'GET /api/cron', 'POST /api/ingest', 'GET /api/personas', 'GET /api/workspace-templates'],
        },
      };
    }

    // Dynamic route listing
    const grouped: Record<string, string[]> = {};
    for (const r of routes) {
      if (!r.url.startsWith('/api/') && r.url !== '/health') continue;
      const category = r.url.split('/')[2] ?? 'other';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(`${r.method} ${r.url}`);
    }

    return {
      openapi: '3.0.0',
      info: { title: 'Waggle API', version: '1.0.0', description: 'Workspace-native AI agent platform' },
      endpointCount: routes.filter(r => r.url.startsWith('/api/')).length,
      categories: grouped,
    };
  });

  // Embedding provider status + reprobe endpoints
  server.get('/api/embedding/status', async () => {
    return embeddingProvider.getStatus();
  });

  server.post('/api/embedding/reprobe', async () => {
    // Re-read API keys from Vault (user may have just added one)
    try {
      const voyageEntry = vault.get('voyage-api-key');
      if (voyageEntry?.value) embeddingConfig.voyage = { apiKey: voyageEntry.value };
    } catch { /* skip */ }
    try {
      const openaiEntry = vault.get('openai');
      if (openaiEntry?.value) embeddingConfig.openai = { apiKey: openaiEntry.value };
    } catch { /* skip */ }
    return embeddingProvider.reprobe();
  });

  // Health check — truthful, not optimistic
  server.get('/health', async () => {
    const llm = { ...server.agentState.llmProvider };

    // P0-3: If provider is anthropic-proxy and claims healthy, validate the key actually works
    if (llm.provider === 'anthropic-proxy' && llm.health === 'healthy') {
      const keyValid = await validateAnthropicKey();
      if (!keyValid) {
        llm.health = 'degraded';
        llm.detail = 'Built-in Anthropic proxy (API key invalid or expired — update in Settings > API Keys)';
        // Also update the cached provider status so chat route picks it up
        server.agentState.llmProvider.health = 'degraded';
        server.agentState.llmProvider.detail = llm.detail;
      }
    }
    const dbHealthy = (() => {
      try {
        multiMind.personal.getDatabase().prepare('SELECT 1').get();
        return true;
      } catch {
        return false;
      }
    })();

    const overallStatus = llm.health === 'healthy' && dbHealthy
      ? 'ok'
      : llm.health === 'unavailable' || !dbHealthy
        ? 'unavailable'
        : 'degraded';

    // Memory stats — frame count + mind file size
    const memoryStats = (() => {
      try {
        const db = multiMind.personal.getDatabase();
        const row = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number } | undefined;
        const frameCount = row?.cnt ?? 0;

        // Get mind file size from the known personal mind path
        let mindSizeBytes = 0;
        try {
          const stat = fs.statSync(personalPath);
          mindSizeBytes = stat.size;
        } catch { /* file may not exist yet */ }

        // Embedding coverage — frames with vectors vs total frames
        let embeddingCoverage = 0;
        try {
          const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number };
          const vecRow = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames_vec').get() as { cnt: number } | undefined;
          const vecCount = vecRow?.cnt ?? 0;
          if (totalRow.cnt > 0) {
            embeddingCoverage = Math.round((vecCount / totalRow.cnt) * 100);
          }
        } catch { /* vec table may not exist */ }

        const embeddingProviderStatus = server.embeddingProvider?.getStatus?.() ?? null;
        return { frameCount, mindSizeBytes, embeddingCoverage, embeddingProvider: embeddingProviderStatus };
      } catch {
        return { frameCount: 0, mindSizeBytes: 0, embeddingCoverage: 0, embeddingProvider: null };
      }
    })();

    // Service health — watchdog and notification SSE status
    const serviceHealth = {
      watchdogRunning: scheduler.isRunning(),
      notificationSSEActive: eventBus.listenerCount('notification') > 0,
    };

    return {
      status: overallStatus,
      mode: 'local',
      timestamp: new Date().toISOString(),
      llm: {
        provider: llm.provider,
        health: llm.health,
        detail: llm.detail,
        checkedAt: llm.checkedAt,
        reachable: !offlineManager.state.offline,
        lastCheck: new Date().toISOString(),
      },
      database: { healthy: dbHealthy },
      memoryStats,
      serviceHealth,
      defaultModel: server.agentState.currentModel,
      offline: offlineManager.state,
      wsToken: server.agentState.wsSessionToken,
    };
  });

  // Cleanup on close
  server.addHook('onClose', async () => {
    // Stop cron scheduler
    scheduler.stop();
    offlineManager.stop();
    clearInterval(auditCleanupTimer);

    // Stop MCP servers
    await mcpRuntime.stopAll().catch(() => {});

    // Stop weaver timers
    for (const t of weaverTimers) clearInterval(t);
    for (const [, ww] of workspaceWeavers) {
      for (const t of ww.timers) clearInterval(t);
    }
    workspaceWeavers.clear();

    // Close all workspace sessions (new concurrent model)
    sessionManager.closeAll();

    // Close all cached workspace minds (legacy)
    for (const [, wsDb] of workspaceMindCache) {
      try { wsDb.close(); } catch { /* already closed */ }
    }
    workspaceMindCache.clear();
    multiMind.close();

    // Close audit DB, teams DB, and telemetry
    closeAuditDb();
    closeTeamsDb();
    try { telemetry.close(); } catch { /* already closed */ }

    // Close marketplace DB
    if (marketplaceDb) {
      try { marketplaceDb.close(); } catch { /* already closed */ }
    }
  });

  // ── Start Teams server if PostgreSQL is configured (TEAMS tier) ──
  // Skip in test environment to avoid port conflicts and addHook-after-listen errors
  if (process.env.DATABASE_URL && !process.env.VITEST && process.env.NODE_ENV !== 'test') {
    const teamsPort = parseInt(process.env.TEAMS_SERVER_PORT ?? '3101', 10);
    import('../index.js').then(({ buildServer }) => {
      buildServer().then(teamsServer => {
        teamsServer.listen({ port: teamsPort, host: '127.0.0.1' }, (err) => {
          if (err) {
            log.info(`[teams-server] Failed to start: ${err.message}`);
          } else {
            log.info(`[teams-server] Running at http://127.0.0.1:${teamsPort}`);
          }
        });
        server.addHook('onClose', async () => { await teamsServer.close(); });
      }).catch(err => log.info(`[teams-server] Build failed: ${(err as Error).message}`));
    }).catch(() => { /* Teams server optional — non-blocking */ });
  }

  return server;
}
