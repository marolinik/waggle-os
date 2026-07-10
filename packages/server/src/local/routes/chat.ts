import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '../logger.js';
const log = createLogger('chat');
import { runAgentLoop, needsConfirmation, needsConfirmationWithAutonomy, classifyGatedToolRisk, CapabilityRouter, analyzeAndRecordCorrection, recordCapabilityGap, lintMemoryWrite, assessTrust, formatTrustSummary, scanForInjection, AGENT_LOOP_REROUTE_PREFIX, extractEntities, IterationBudget, routeMessage, compressConversation, createDefaultCompressionConfig, computeInputTokenBudget, getModelContextWindow, CredentialPool, loadCredentialPool, extractStatusCode, filterAvailableTools, shouldSuggestCapture, planSkillDistillation, TraceRecorder, generateTurnId, logTurnEvent, checkGrounding, type TraceHandle } from '@waggle/agent';
import type { AgentLoopConfig, AgentResponse, Orchestrator, AutonomyLevel } from '@waggle/agent';
import type { WorkspaceSession } from '../workspace-sessions.js';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt } from './workspace-context.js';
import { formatWorkspaceStatePrompt } from '../workspace-state.js';
import { emitNotification } from './notifications.js';
import { emitWaggleSignal } from './waggle-signals.js';
import { emitAuditEvent } from './events.js';
import { getOptimizerService } from '../services/optimizer-service.js';
import { validateOrigin } from '../cors-config.js';
import { listPersonas, composePersonaPrompt, BEHAVIORAL_SPEC, isEnabled, detectTaskShape, type AssembledPrompt } from '@waggle/agent';

/**
 * Persona resolver that includes built-ins AND on-disk custom personas
 * (Faza 1 evolved variants like `claude::gen1-v1`, `qwen-thinking::gen1-v1`,
 * plus user-saved customs in `~/.waggle/personas/`).
 *
 * Previously `getPersona(id)` was used here, which only consulted the static
 * built-in PERSONAS array — `listPersonas()` adds the custom ones from disk
 * via `loadCustomPersonas()`. The deploy comment in evolution-deploy.ts
 * explicitly says "loader picks it up on next listPersonas() call", but
 * the chat consumer was reading the wrong function. See FR #3 in
 * docs/GEPA-SCOPE-AUDIT-2026-04-30.md.
 */
function resolvePersona(id: string) {
  return listPersonas().find(p => p.id === id) ?? null;
}
import { TeamSync, WaggleConfig } from '@waggle/core';

// ── Extracted modules ──────────────────────────────────────────────────
import { isRegulatedContent, isRetryableError, isAmbiguousMessage, shouldSuggestSchedule, SCHEDULE_SUGGESTION, AMBIGUITY_PROMPT, describeToolUse } from './chat-helpers.js';
import { persistMessage, loadSessionMessages, stripTrailingFailedPair } from './chat-persistence.js';
import { MAX_CONTEXT_MESSAGES, applyContextWindow, buildSkillPromptSection } from './chat-context.js';
import { getGovernancePermissions } from './chat-governance.js';
import { applyPersonaToolFilter } from '../persona-tool-filter.js';
import { enqueueHeldAction, isProposableTool } from '../held-action-executor.js';
import { assertSafeSegment } from './validate.js';
import { resolveUsableModel } from '../model-availability.js';
import type { GoalAncestry } from '@waggle/shared';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';

// ── Re-exports for backwards compatibility ─────────────────────────────
// These were originally exported from chat.ts and are consumed by tests and other packages.
export { isAmbiguousMessage, shouldSuggestSchedule } from './chat-helpers.js';
export { MAX_CONTEXT_MESSAGES, applyContextWindow, buildSkillPromptSection } from './chat-context.js';

export type AgentRunner = (config: AgentLoopConfig) => Promise<AgentResponse>;

/**
 * W4A diagnostics — the "MindDB flake". A long chat turn holds a workspace
 * MindDB handle obtained from the process-wide MultiMindCache (LRU, maxOpen:20).
 * If ≥20 OTHER workspaces are touched mid-turn (home-briefing fan-out, weaver
 * timers, cross-workspace tools), the cache evicts + `.close()`s THIS turn's
 * handle, and the post-response DB write-backs below throw better-sqlite3's
 * native "The database connection is not open". Those catches are non-blocking
 * and swallow it silently, which is exactly why the flake is invisible. This
 * predicate lets us surface a structured warn at the failure seam WITHOUT
 * changing behavior (the write still fails soft) so the root cause can be
 * confirmed live. The real fix (pin-aware eviction) lives in the OSS substrate
 * (packages/hive-mind-core/src/multi-mind-cache.ts) and is out of scope here.
 */
function isClosedDbError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /database (connection|handle) is not open|database is closed/i.test(msg);
}

const CONVERSATIONAL_GATED_TOOL_NAMES = new Set([
  'bash',
  'read_file',
  'search_files',
  'search_content',
  'write_file',
  'edit_file',
  'generate_docx',
  'git_status',
  'git_diff',
  'git_log',
  'git_branch',
  'git_stash',
  'git_pull',
  'git_commit',
  'git_push',
  'git_pr',
  'git_merge',
  'get_identity',
  'get_awareness',
  'query_knowledge',
  'add_task',
  'correct_knowledge',
  'list_skills',
  'search_skills',
  'suggest_skill',
  'read_skill',
  'acquire_capability',
  'install_capability',
  'create_skill',
  'delete_skill',
  'create_plan',
  'add_plan_step',
  'execute_step',
  'show_plan',
  'compose_workflow',
  'orchestrate_workflow',
  'spawn_agent',
  'list_agents',
  'get_agent_result',
  'find_connector',
  'list_connector_categories',
  'read_other_workspace',
  'list_workspace_files',
  'read_other_workspace_file',
]);

/**
 * AI-OS #6 — resolve the durable goal-ancestry for a chat turn. `project` is the
 * active workspace name; `goal` is omitted in chat (personas carry no goal — it
 * lights up for agent runs that carry an AgentDef.goal). Returns {} when there
 * is no workspace, so the prompt section self-suppresses.
 */
export function resolveChatAncestry(
  server: { workspaceManager?: { get?: (id: string) => { name?: string } | null | undefined } },
  workspaceId: string | undefined,
): GoalAncestry {
  const name = workspaceId ? server.workspaceManager?.get?.(workspaceId)?.name : undefined;
  return name ? { project: name } : {};
}

export function isExplicitGatedToolRequest(message: string): boolean {
  return /\b(write|edit|modify|create|make|generate|export|download|file|docx|document|artifact|commit|push|pull|merge|branch|terminal|shell|bash|command|run|execute|install|delete|remove|cross-workspace|other workspace)\b/i.test(message)
    || /\bsave\s+(this|that|it)\s+(as|to|in)\b/i.test(message);
}

export function isExplicitMemoryRecallRequest(message: string): boolean {
  return /\b(search|find|look up|recall|memories|saved memory|what do you know about me|what have you saved|what do you remember|do you remember|remember about)\b/i.test(message);
}

export function isExplicitMemorySaveRequest(message: string): boolean {
  return /\b(remember this|remember that|remember:|save (this|that|it) (to|in) memory|store (this|that|it)|keep this in mind|make a note)\b/i.test(message);
}

export function isExplicitExternalResearchRequest(message: string): boolean {
  return /https?:\/\//i.test(message)
    || /\b(web|internet|online|current|latest|today|news|recent|source|sources|citation|cite|docs?|documentation|release|pricing|benchmark|research|investigate|look up|find out|dig into|study|survey|external)\b/i.test(message);
}

export function shouldNarrowToolsForConversationalTurn(
  message: string,
  autonomyLevel: AutonomyLevel,
): boolean {
  return autonomyLevel === 'normal' && !isExplicitGatedToolRequest(message);
}

export function filterGatedToolsForConversationalTurn<T extends { name: string }>(
  tools: T[],
  message: string,
  autonomyLevel: AutonomyLevel,
): T[] {
  if (!shouldNarrowToolsForConversationalTurn(message, autonomyLevel)) return tools;
  const allowMemorySearch = isExplicitMemoryRecallRequest(message);
  const allowMemorySave = isExplicitMemorySaveRequest(message);
  const allowExternalResearch = isExplicitExternalResearchRequest(message);
  return tools.filter((tool) => {
    if (CONVERSATIONAL_GATED_TOOL_NAMES.has(tool.name)) return false;
    if (tool.name === 'search_memory' && !allowMemorySearch) return false;
    if (tool.name === 'save_memory' && !allowMemorySave) return false;
    if ((tool.name === 'web_search' || tool.name === 'web_fetch') && !allowExternalResearch) return false;
    return true;
  });
}

type PluginToolProvider = NonNullable<AgentLoopConfig['pluginTools']>;

export function filterPluginToolsForConversationalTurn(
  provider: PluginToolProvider,
  message: string,
  autonomyLevel: AutonomyLevel,
  onWithheld?: (count: number) => void,
): PluginToolProvider {
  if (!shouldNarrowToolsForConversationalTurn(message, autonomyLevel)) return provider;

  return {
    getAllTools: () => {
      const pluginTools = provider.getAllTools();
      const filtered = filterGatedToolsForConversationalTurn(pluginTools, message, autonomyLevel);
      if (filtered.length !== pluginTools.length) {
        onWithheld?.(pluginTools.length - filtered.length);
      }
      return filtered;
    },
  };
}

function conversationalToolPolicyPrompt(message: string, autonomyLevel: AutonomyLevel): string {
  if (!shouldNarrowToolsForConversationalTurn(message, autonomyLevel)) return '';
  return `\n\n# Current Turn Tool Policy\nThis is a normal conversational turn. Some action, inspection, plugin, planning, and external research tools may be intentionally hidden until the user asks for a concrete action or lookup. Do not mention this policy. Do not infer or tell the user that a capability is missing because a tool is absent on this turn. If the user asks what Waggle can do, answer at the product level and offer one concrete next step.`;
}

// Read once at plugin registration — consistent for the lifetime of the server
const AUTO_APPROVE = process.env.WAGGLE_AUTO_APPROVE === '1' || process.env.WAGGLE_AUTO_APPROVE === 'true';

export const chatRoutes: FastifyPluginAsync = async (server) => {
  // ── Use shared agent state from server ──────────────────────────────
  const {
    orchestrator,
    allTools,
    hookRegistry,
    costTracker,
    skills,
    userSystemPrompt,
    sessionHistories,
  } = server.agentState;
  // Read dynamically — may be updated to built-in proxy at runtime
  const getLitellmUrl = () => server.localConfig.litellmUrl;

  // W2.2: Register pre:memory-write validation hook — flags dramatic claims
  const DRAMATIC_PATTERNS = [
    /\b(shut\s*down|shutting\s*down|closing|dissolv|bankrupt|terminat|fired|laid\s*off|resign)\b/i,
    /\b(cancel|cancelled|abandon|scrap|kill)\s+(the\s+)?(company|project|deal|contract|engagement)\b/i,
    /\b(emergency|urgent|critical|crisis)\b.*\b(immediate|right\s*now|today)\b/i,
  ];
  hookRegistry.on('pre:memory-write', (ctx) => {
    const content = ctx.memoryContent ?? '';

    // Fix the source, not the symptom: block memories that merely record a
    // capability failure ("the Slack connector failed to authenticate"). The
    // agent should fix or flag the capability instead of durably remembering
    // that it is broken — a symptom memory rots the moment the tool is repaired.
    const lint = lintMemoryWrite(content, ctx.memoryType);
    if (lint.verdict === 'capability_symptom') {
      // Route the observation to the improvement-signal path so a recurring gap
      // still surfaces (via acquire_capability), rather than into durable memory.
      // The pre:memory-write ctx carries no workspaceId, so we record on the base
      // orchestrator's (personal) signal store — the least-invasive reachable
      // ImprovementSignalStore. Recording is non-blocking.
      try {
        recordCapabilityGap(orchestrator.getImprovementSignals(), lint.capability ?? 'capability', lint.reason);
      } catch {
        // Non-blocking — a signal-store failure must not swallow the cancel.
      }
      log.info('[memory-validation] Capability-failure symptom blocked from memory:', content.slice(0, 100));
      return {
        cancel: true,
        reason:
          `This looks like a capability failure symptom ("${lint.capability ?? 'a capability'}"), not a durable fact. ` +
          `Don't memorize that a tool/connector is broken — it will rot when the capability is fixed. ` +
          `Instead, fix or flag the capability (e.g. use acquire_capability). The gap has been recorded as an improvement signal.`,
      };
    }

    for (const pattern of DRAMATIC_PATTERNS) {
      if (pattern.test(content)) {
        log.warn('[memory-validation] Dramatic claim detected in save_memory:', content.slice(0, 100));
        // Don't block — but annotate the args so the tool can tag source appropriately
        // Future: could cancel and ask for confirmation
        break;
      }
    }
  });

  // C3: Cache the base system prompt per session to avoid rebuilding on every message
  const systemPromptCache = new Map<string, { prompt: string; workspace: string | undefined; workspaceId: string | undefined; skillCount: number; personaId: string | null; historyLength: number | undefined }>();

  // Profile cache (review Major #4): was fs.readFileSync on every buildSystemPrompt call —
  // blocks the Node event loop on every concurrent SSE request. Load once per mtime change,
  // keyed by file mtime so a profile update flips the cache without a restart.
  let profileCache: { mtimeMs: number; data: Record<string, unknown> | null } | null = null;
  function loadProfile(dataDir: string): Record<string, unknown> | null {
    try {
      const profilePath = path.join(dataDir, 'profile.json');
      if (!fs.existsSync(profilePath)) return null;
      const stat = fs.statSync(profilePath);
      if (profileCache && profileCache.mtimeMs === stat.mtimeMs) return profileCache.data;
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      profileCache = { mtimeMs: stat.mtimeMs, data };
      return data;
    } catch {
      return null;
    }
  }

  // Context compression: track previous summaries per session for iterative compression
  const compressionSummaries = new Map<string, string>();

  // Credential pool: lazily initialized per-provider key pools for round-robin + cooldown
  const credentialPools = new Map<string, CredentialPool>();

  /** Get or create a credential pool for the LLM provider, loading keys from vault. */
  function getCredentialPool(provider: string): CredentialPool | null {
    if (!server.vault) return null;
    if (credentialPools.has(provider)) return credentialPools.get(provider)!;
    const pool = loadCredentialPool(server.vault, provider);
    if (pool.size === 0) return null;
    credentialPools.set(provider, pool);
    return pool;
  }

  // Auto skill capture: track tool sequences per session and dismissed suggestions
  const sessionToolSequences = new Map<string, string[][]>();
  const dismissedCaptureSuggestions = new Set<string>();

  // Build the rich system prompt — behavioral specification, not just tool docs
  // Accepts the caller's orchestrator so per-session orchestrators get their own
  // workspace layers reflected in the prompt (Phase A.1 Option Y migration).
  // Phase A.2: accepts an optional `personaOverride` so different chat windows
  // on the same workspace can run different personas without touching the
  // workspace record.
  function buildSystemPrompt(
    orch: Orchestrator,
    workspacePath?: string,
    sessionId?: string,
    historyLength?: number,
    workspaceId?: string,
    personaOverride?: string,
    /**
     * FR #4: when PROMPT_ASSEMBLER is on, the caller pre-fetches a structured
     * AssembledPrompt via `orch.buildAssembledPrompt(query, persona, opts)`.
     * If provided, its `system` replaces the basic `orch.buildSystemPrompt()`
     * call below — the rest of the wrapper (profile, skills, workspaceNow,
     * behavioralSpec rules, persona) still layers on top because the assembler
     * does not include those. Caching is skipped when assembled is provided
     * because memory recall results vary per turn.
     */
    assembled?: AssembledPrompt | null,
  ): string {
    // Resolve the active persona: per-window override > workspace default.
    const wsConfig = workspaceId ? server.workspaceManager?.get(workspaceId) : null;
    const activePersonaId = personaOverride ?? wsConfig?.personaId ?? null;

    // Check cache: reuse if same session, workspace, workspaceId, skill count, and persona.
    // Skip cache entirely when assembled is provided — it reflects per-turn
    // memory recall + task-shape detection that should not be cached across turns.
    const cacheKey = sessionId ?? 'default';
    if (!assembled) {
      const cached = systemPromptCache.get(cacheKey);
      if (cached && cached.workspace === workspacePath && cached.workspaceId === workspaceId && cached.skillCount === skills.length && cached.personaId === activePersonaId && cached.historyLength === historyLength) {
        return cached.prompt;
      }
    }
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let prompt = '';

    // User's custom system prompt (highest priority — user overrides)
    if (userSystemPrompt) {
      prompt += userSystemPrompt + '\n\n';
    }

    // Orchestrator's built prompt (identity + self-awareness + preloaded context).
    // FR #4: when PromptAssembler is on, swap in the structured assembled prompt
    // — adds Identity + Persona + State + Recent + Memory sections via the
    // sixth-layer assembler. The remaining wrapper layers (profile, skills,
    // workspaceNow, behavioralSpec, persona-via-composePersonaPrompt) still
    // run below because the assembler does not include those.
    // AI-OS #6 — supply the durable "why" (project ← workspace name) before the
    // orchestrator renders its system prompt. Empty ancestry self-suppresses.
    orch.setGoalAncestry(resolveChatAncestry(server, workspaceId));
    prompt += assembled?.system ?? orch.buildSystemPrompt();

    // Inject user profile context (review Major #4: cached by mtime, no sync I/O per turn)
    try {
      const profileData = loadProfile(server.localConfig.dataDir) as Record<string, unknown> & {
        name?: string; role?: string; company?: string; industry?: string;
        communicationStyle?: string; interests?: string[]; language?: string;
        writingStyle?: { analyzed?: boolean; tone?: string; sentenceLength?: string; vocabulary?: string; structure?: string };
        brand?: { analyzed?: boolean; primaryColor?: string; secondaryColor?: string; accentColor?: string; fontHeading?: string; fontBody?: string };
      } | null;
      if (profileData) {
        if (profileData.name || profileData.role || profileData.company) {
          prompt += `\n\n# About the User\n`;
          if (profileData.name) prompt += `- Name: ${profileData.name}\n`;
          if (profileData.role) prompt += `- Role: ${profileData.role}\n`;
          if (profileData.company) prompt += `- Company: ${profileData.company}\n`;
          if (profileData.industry) prompt += `- Industry: ${profileData.industry}\n`;
          if (profileData.communicationStyle) prompt += `- Prefers ${profileData.communicationStyle} responses\n`;
          if (profileData.interests?.length) prompt += `- Interests: ${profileData.interests.join(', ')}\n`;
          const ws = profileData.writingStyle;
          if (ws?.analyzed) {
            prompt += `- Writing style: ${ws.tone} tone, ${ws.sentenceLength} sentences, ${ws.vocabulary} vocabulary, ${ws.structure} structure\n`;
            prompt += `- When drafting content for this user, match their writing style.\n`;
          }
          const b = profileData.brand;
          if (b && (b.analyzed || b.primaryColor !== '#D4A84B')) {
            prompt += `- Brand colors: primary ${b.primaryColor}, secondary ${b.secondaryColor}, accent ${b.accentColor}\n`;
            if (b.fontHeading) prompt += `- Brand fonts: ${b.fontHeading} (headings), ${b.fontBody} (body)\n`;
            prompt += `- When generating documents (docx, pptx, pdf, xlsx), apply these brand styles.\n`;
          }
          if (profileData.language && profileData.language !== 'en') {
            prompt += `- Preferred language: ${profileData.language}\n`;
          }
        }
      }
    } catch { /* profile shape unexpected — continue without */ }

    prompt += `

# Who You Are

You are Waggle — a personal AI orchestrator with persistent memory, knowledge graph, and real-world tools.
You are NOT a chatbot. You are an autonomous agent that thinks, plans, acts, and learns.

You are one orchestrator among many — each user has their own Waggle, fine-tuned to them.
You remember everything important. You build knowledge over time. You get better with every interaction.

## Your Runtime (you already know this — do NOT call bash for date/time)
- Date: ${dateStr}
- Time: ${timeStr}
- Platform: ${process.platform} (${process.arch})
- Shell: ${process.platform === 'win32' ? 'cmd.exe (use /t flag for date, time)' : '/bin/sh'}
- Working directory: ${workspacePath ?? os.homedir()}
${workspacePath
  ? (workspacePath.includes('/files') || workspacePath.includes('\\files')
    ? `- Workspace files: managed storage (${workspacePath})\n- Generated files will appear in managed workspace storage.`
    : `- Workspace linked to: ${workspacePath} (all file operations are relative to this directory)\n- Generated files will appear in: ${workspacePath}`)
  : `- No workspace directory set. Use save_memory to store information instead of files.`}
${process.platform === 'win32' ? '- Windows note: use `date /t` and `time /t` (not bare `date` which prompts for input). Use `dir` instead of `ls`.' : ''}
${sessionId ? `- Session: ${sessionId}` : ''}
${historyLength && historyLength > 0 ? `- This is a continuing conversation (${historyLength} previous messages in context). You can see the full conversation history above.` : '- This is a new conversation. Search memory (search_memory) to recall what happened in previous sessions.'}
${wsConfig?.templateId ? `- Workspace template: ${wsConfig.templateId} — tailor responses to this domain.` : ''}
`;

    // Behavioral rules from the ACTIVE spec — baseline with any deployed
    // self-evolution overrides applied. Falls back to the compiled
    // BEHAVIORAL_SPEC when the server hasn't decorated activeBehavioralSpec
    // (legacy test harness).
    const activeSpec = server.activeBehavioralSpec ?? BEHAVIORAL_SPEC;
    prompt += '\n' + activeSpec.rules;

    // Token monitoring
    const estimatedTokens = Math.ceil(prompt.length / 4);
    log.info(`[Orchestrator] System prompt: ~${estimatedTokens} tokens (behavioral-spec v${activeSpec.version})`);
    if (estimatedTokens > 12000) {
      log.warn(`[Orchestrator] System prompt exceeds 12K tokens (${estimatedTokens}). Consider trimming.`);
    }

    // Behavioral spec (v${BEHAVIORAL_SPEC.version}) extracted to packages/agent/src/behavioral-spec.ts
    // Dead code removed — the old 250-line inline spec lived here

    // Append loaded skills with active integration instructions
    prompt += buildSkillPromptSection(skills);

    // Workspace Now — inject structured context so the agent is grounded on first turn
    if (workspaceId) {
      try {
        const nowBlock = buildWorkspaceNowBlock({
          dataDir: server.localConfig.dataDir,
          workspaceId,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
          cronSchedules: server.cronStore.list(),
        });
        if (nowBlock) {
          // Use structured state prompt when available (richer: open questions, blockers, stale threads)
          if (nowBlock.structuredState) {
            prompt += '\n\n' + formatWorkspaceStatePrompt(nowBlock.structuredState, nowBlock.workspaceName);
          } else {
            prompt += '\n\n' + formatWorkspaceNowPrompt(nowBlock);
          }
        }
      } catch {
        // Non-blocking — if workspace context fails, continue without it
      }
    }

    // W3.3: Inject actionable correction signals — user corrections from prior sessions
    try {
      const signalStore = orch.getImprovementSignals();
      if (signalStore) {
        const actionable = signalStore.getActionable();
        if (actionable.length > 0) {
          prompt += '\n\n# User Corrections (from prior sessions — follow these)\n';
          for (const signal of actionable) {
            prompt += `- ${signal.detail} (observed ${signal.count}x)\n`;
          }
        }
      }
    } catch { /* non-blocking */ }

    // W1.3: Apply active persona instructions (extends, not replaces, core prompt)
    // W7.3: Pass workspace tone to composePersonaPrompt
    const workspaceTone = wsConfig?.tone;
    if (activePersonaId) {
      const persona = resolvePersona(activePersonaId);
      prompt = composePersonaPrompt(prompt, persona, undefined, workspaceTone);
    } else if (workspaceTone) {
      // Even without a persona, apply tone if workspace has one set
      prompt = composePersonaPrompt(prompt, null, undefined, workspaceTone);
    }

    // FR #4: append the assembler's task-shape responseScaffold as a final
    // response-shape note. The scaffold guides the model toward the format
    // the task type calls for ("Cite source. Answer." etc.). Empty when the
    // task shape has low confidence or the tier is frontier.
    if (assembled?.responseScaffold) {
      prompt += '\n\n## Response shape\n' + assembled.responseScaffold;
    }

    // C3: Cache the built prompt — only when there's no per-turn assembler
    // input. Caching an assembled prompt would replay stale memory recall.
    if (!assembled) {
      systemPromptCache.set(cacheKey, { prompt, workspace: workspacePath, workspaceId, skillCount: skills.length, personaId: activePersonaId, historyLength });
    }

    return prompt;
  }

  // POST /api/chat — SSE streaming chat endpoint
  server.post<{
    Body: {
      message: string;
      workspace?: string;
      workspaceId?: string;
      model?: string;
      session?: string;
      workspacePath?: string;
      persona?: string;
      /**
       * Phase B.5: tiered autonomy override. When absent or 'normal', the
       * existing gate applies. 'trusted' or 'yolo' relax the gate per the
       * rules in needsConfirmationWithAutonomy.
       * `expiresAt` is a client-supplied deadline — if set and in the past,
       * the server falls back to 'normal' for safety.
       */
      autonomy?: { level: AutonomyLevel; expiresAt?: number };
      /**
       * F4: set by a client Retry after a failed turn. Drops the previously
       * persisted failed user+assistant pair (RAM + disk) before re-issuing so
       * a reload doesn't show a duplicate.
       */
      retry?: boolean;
      /**
       * Self-evolution: set by the IdleSessionWatcher's loopback review turn.
       * A review turn runs headless — no interactive client watches the SSE
       * stream, so a live approval prompt would auto-deny after the timeout and
       * the proposal would be lost. When true, a gated proposable tool (e.g.
       * create_skill) is HELD for durable human approval in Approvals instead of
       * a live SSE prompt, and any other gated tool is denied. The reviewer can
       * therefore never write to disk without approval.
       */
      proposeHeld?: boolean;
    };
  }>('/api/chat', async (request, reply) => {
    // P0-4: Accept both 'workspace' and 'workspaceId' for backwards compat
    // Phase A.2: `persona` is an optional per-window override — takes precedence
    // over the workspace's default persona for this single request only.
    const {
      message, workspace: _ws, workspaceId: _wsId, model, session,
      workspacePath: explicitWorkspacePath, persona: personaOverride,
      autonomy: autonomyRaw, retry: retryTurn, proposeHeld: proposeHeldTurn,
    } = request.body ?? {};
    const workspace = _ws ?? _wsId;

    // Phase B.5: resolve the effective autonomy level for this request.
    // Expired grants fall back to 'normal' — the client may not have
    // auto-reverted yet on its side, so the server owns the final say.
    let autonomyLevel: AutonomyLevel = 'normal';
    if (autonomyRaw && (autonomyRaw.level === 'trusted' || autonomyRaw.level === 'yolo')) {
      const expiresAt = autonomyRaw.expiresAt;
      if (!expiresAt || expiresAt > Date.now()) {
        autonomyLevel = autonomyRaw.level;
      }
    }

    // H-AUDIT-1: generate per-turn trace ID at the conceptual turn boundary
    // (POST /api/chat entry). Propagated explicitly into agent-loop,
    // orchestrator, retrieval, prompt-assembler, cognify, and each tool
    // call. Every stage logs a structured event tagged with this turnId
    // so the full turn graph is reconstructable from a single correlation
    // key. Also satisfies EU AI Act Art. 14 traceability requirements.
    const turnId = generateTurnId();
    logTurnEvent(turnId, { stage: 'chat.turn.start', workspace, model, messageChars: (message ?? '').length });

    // A2: Resolve workspace directory — use explicit path, workspace config, or virtual storage
    // NEVER fall back to user homedir — use managed storage instead
    let workspacePath = explicitWorkspacePath;
    if (!workspacePath && workspace) {
      const wsConfig = server.workspaceManager?.get(workspace);
      if (wsConfig?.directory && fs.existsSync(wsConfig.directory)) {
        workspacePath = wsConfig.directory; // linked mode
      } else if (workspace !== 'default') {
        // Virtual workspace storage — managed files directory
        workspacePath = path.join(server.localConfig.dataDir, 'workspaces', workspace, 'files');
      }
    }

    // Validation — return standard JSON error before starting SSE.
    // Review Critical #3: ALL validation + auth checks must run BEFORE reply.hijack() —
    // once hijacked, reply.status() / reply.send() become no-ops on the raw socket.
    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }
    // F17: Message size limit — reject payloads over 50KB to prevent abuse
    const MAX_MESSAGE_LENGTH = parseInt(process.env.WAGGLE_MAX_MESSAGE_LENGTH ?? '50000', 10);
    if (message.length > MAX_MESSAGE_LENGTH) {
      return reply.status(400).send({ error: `Message too long (${message.length} chars, max ${MAX_MESSAGE_LENGTH})`, code: 'MESSAGE_TOO_LONG' });
    }

    // R6-001: path-traversal guard on the session-persistence path segments.
    // `workspace` and `session` come straight from the request body and are
    // joined into dataDir/workspaces/<workspace>/sessions/<session>.jsonl by
    // chat-persistence (persistMessage / loadSessionMessages). A crafted
    // "../evil" segment would escape the sessions dir on both write and read.
    // Reuse the shared guard; runs BEFORE reply.hijack() so the thrown
    // {statusCode:400} is converted to a 400 by Fastify's default error handler.
    if (workspace) assertSafeSegment(workspace, 'workspace');
    if (session) assertSafeSegment(session, 'session');

    // Security: scan for prompt injection patterns
    const injectionResult = scanForInjection(message, 'user_input');
    if (injectionResult.score >= 0.7) {
      // High-confidence injection: block entirely.
      // Review Major #3: flags NOT included in the client response — the scanner's
      // internal pattern vocabulary leaks a roadmap for crafting bypassing payloads.
      log.warn(`[security] Prompt injection BLOCKED (score ${injectionResult.score})`, injectionResult.flags);
      return reply.code(400).send({
        error: 'Message blocked by security scanner',
        code: 'INJECTION_DETECTED',
      });
    } else if (injectionResult.score >= 0.3) {
      log.warn(`[security] Potential prompt injection detected (score ${injectionResult.score})`, injectionResult.flags);
    }

    // Review Critical #3: viewer RBAC moved above reply.hijack() — after hijack,
    // reply.status(403) silently no-ops and the client gets HTTP 200 + empty SSE stream.
    if (workspace && workspace !== 'default') {
      const wsConfig = server.workspaceManager?.get(workspace);
      if (wsConfig?.teamId && wsConfig?.teamRole === 'viewer') {
        return reply.status(403).send({
          error: 'Viewers cannot send messages in team workspaces. Ask a team admin to upgrade your role.',
          code: 'VIEWER_READ_ONLY',
        });
      }
    }

    // Review Critical #1: path-traversal guard on workspacePath.
    // A client can supply "../../../../etc" or on Windows "C:\\Windows\\System32".
    // Both the explicit-path and workspace-derived branches must be anchored to dataDir.
    if (workspacePath) {
      const resolved = path.resolve(workspacePath);
      const allowed = path.resolve(server.localConfig.dataDir);
      if (resolved !== allowed && !resolved.startsWith(allowed + path.sep)) {
        log.warn(`[security] Path traversal attempt blocked: ${workspacePath}`);
        return reply.status(400).send({
          error: 'Invalid workspace path',
          code: 'PATH_TRAVERSAL',
        });
      }
      workspacePath = resolved;
    }

    // Hijack the response so Fastify doesn't try to send its own reply.
    // All validation + auth above — safe to commit to SSE from here.
    await reply.hijack();

    // Set SSE headers via raw response (include CORS since hijack bypasses Fastify plugins)
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': validateOrigin(request.headers.origin as string | undefined),
    });

    // Helper to write SSE events
    const sendEvent = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Graceful shutdown: abort agent loop when client disconnects
    const abortController = new AbortController();
    request.raw.on('close', () => {
      abortController.abort();
    });

    // Declare at handler scope so error handler can surface recalled memories (P1-4)
    let recalledContext = '';
    // W4.5: unprefixed recall text handed to the PromptAssembler (fixes
    // double-compute — assembler reuses it instead of re-searching).
    let recallTextForAssembler = '';

    // B1-B7: Rerouted message from slash command processing — scoped to handler
    let reroutedMessage: string | undefined;

    // Review Critical #2: hoist unregisterHook so the outer finally can always clean up.
    // Old code's only cleanup was at the happy-path line ~1125; every exception path leaked
    // the hook into the shared hookRegistry, causing ghost confirmation prompts on every
    // subsequent request with closures pointing at dead sockets.
    let unregisterHook: (() => void) | undefined;

    // H-07 G4: hoist trace recorder/handle so the outer catch can finalize
    // aborted/errored traces with outcome='abandoned'. Without this, a failed
    // turn leaves its row in the 'pending' state and EvalDatasetBuilder skips
    // it, starving the evolution loop of negative examples.
    let traceRecorder: TraceRecorder | null = null;
    let traceHandle: TraceHandle | null = null;
    let traceFinalized = false;

    // #3 (launch-blocker): hoist the resolved orchestrator so the outer catch
    // can persist the raw user turn even when generation fails. Memory capture
    // must not be contingent on LLM success ("remembers everything").
    let activeSessionOrch: Orchestrator | undefined;
    const activeSessionId = session ?? workspace ?? 'default';
    const activeWorkspaceId = workspace ?? 'default';
    let activeHistory: Array<{ role: string; content: string }> | undefined;

    try {
      const hasCustomRunner = !!server.agentRunner;

      // Resolve the agent runner (injectable for tests)
      const agentRunner: AgentRunner = server.agentRunner ?? runAgentLoop;

      // ── Model Pilot: resolve model with fallback chain ──
      const pilotConfig = new WaggleConfig(server.localConfig.dataDir);
      const wsModelConfig = workspace ? server.workspaceManager?.get(workspace)?.model : undefined;
      const primaryModel = model ?? wsModelConfig ?? pilotConfig.getDefaultModel() ?? 'claude-sonnet-4-6';
      const fallbackModel = pilotConfig.getFallbackModel();
      const budgetModel = pilotConfig.getBudgetModel();
      const budgetThreshold = pilotConfig.getBudgetThreshold();

      // Budget check: if daily spend exceeds threshold, use budget model
      let resolvedModel = primaryModel;
      let modelSwitchReason: string | null = null;

      const dailyBudget = pilotConfig.getDailyBudget();
      if (dailyBudget && dailyBudget > 0 && budgetModel) {
        const spent = costTracker.getDailyTotal();
        if (spent / dailyBudget >= budgetThreshold) {
          resolvedModel = budgetModel;
          modelSwitchReason = `Budget ${Math.round(budgetThreshold * 100)}% reached ($${spent.toFixed(2)}/$${dailyBudget.toFixed(2)})`;
        }
      }

      // Smart routing: simple messages → budget model (cost optimization)
      if (!modelSwitchReason && budgetModel) {
        const routing = routeMessage(message, resolvedModel, budgetModel);
        if (routing.reason === 'simple_turn') {
          resolvedModel = routing.model;
          // Smart routing is silent — no toast, no inline message
        }
      }

      // ── Conversation history management (moved before LLM check so echo mode also persists) ──
      resolvedModel = await resolveUsableModel(server, resolvedModel);

      const sessionId = activeSessionId;
      const effectiveWorkspace = activeWorkspaceId;

      // Viewer RBAC moved above reply.hijack() — see review Critical #3 fix at top of handler.

      // Get or create session history — load from disk if not in RAM
      if (!sessionHistories.has(sessionId)) {
        const saved = loadSessionMessages(
          server.localConfig.dataDir, effectiveWorkspace, sessionId
        );
        sessionHistories.set(sessionId, saved);
      }
      const history = sessionHistories.get(sessionId)!;
      activeHistory = history;

      // F4 retry-dedup: a retried turn re-issues the failed user message. Drop
      // the previously persisted failed user+assistant pair (RAM + disk) so a
      // reload doesn't render it duplicated alongside the fresh turn.
      if (retryTurn) {
        const n = history.length;
        if (n >= 2
          && history[n - 1].role === 'assistant'
          && typeof history[n - 1].content === 'string'
          && history[n - 1].content.startsWith(GENERATION_FAILED_PREFIX)
          && history[n - 2].role === 'user') {
          history.splice(n - 2, 2);
        }
        stripTrailingFailedPair(server.localConfig.dataDir, effectiveWorkspace, sessionId);
      }

      // Add user message to history and persist to disk
      history.push({ role: 'user', content: message });
      persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'user', content: message });

      // ── Workspace session (Phase A.1 — Option Y per-session orchestrator) ──
      // Create or reuse a WorkspaceSession so this chat call's orchestrator
      // operates on its own workspace-mind instance, never the shared singleton.
      // Non-workspace chats (no workspace set, or 'default') fall back to the
      // shared orchestrator (personal mind only). Failures are non-fatal and
      // also fall back to the shared orchestrator.
      let sessionOrch: Orchestrator = orchestrator;
      let wsSession: WorkspaceSession | undefined;
      if (!hasCustomRunner && workspace && workspace !== 'default') {
        try {
          const mind = server.agentState.getWorkspaceMindDb(effectiveWorkspace);
          if (mind) {
            wsSession = server.sessionManager.getOrCreate(
              effectiveWorkspace,
              // Pin the shared cache handle for this session's lifetime so a
              // fan-out over many workspaces cannot evict (and close) this mind
              // mid-turn while we hold it across the LLM await.
              () => server.mindCache.acquire(effectiveWorkspace),
              (m) => server.agentState.createSessionOrchestrator(m),
              // Phase B.2: pass effectiveWorkspace as the source workspace ID
              // so cross-workspace read tools scope their grants correctly.
              (m, o) => server.agentState.buildToolsForSession(o, workspacePath ?? effectiveWorkspace, effectiveWorkspace),
              server.workspaceManager?.get(effectiveWorkspace)?.personaId ?? undefined,
              () => server.mindCache.release(effectiveWorkspace),
            );
            sessionOrch = wsSession.orchestrator;
          }
        } catch (err) {
          log.warn(`[session] Failed to create workspace session for "${effectiveWorkspace}": ${(err as Error).message}`);
        }
      }
      // #3 (launch-blocker): expose the resolved orchestrator to the outer
      // catch so a failed generation still persists the raw user turn.
      activeSessionOrch = sessionOrch;

      // Check if LiteLLM is available — if not, use echo mode
      // F2 fix: When using the built-in Anthropic proxy, the /health/liveliness
      // endpoint doesn't exist — so the HTTP probe always fails, dropping into
      // echo mode even when an API key is configured. Instead, trust the
      // provider status that was determined at startup (or updated at runtime).
      let litellmAvailable = hasCustomRunner; // trust injected runners
      if (!hasCustomRunner) {
        const llmStatus = server.agentState.llmProvider;
        if ((llmStatus.provider === 'anthropic-proxy' || llmStatus.provider === 'ollama') && llmStatus.health === 'healthy') {
          // Built-in proxy with a valid API key — skip HTTP probe
          litellmAvailable = true;
        } else {
          try {
            const healthHeaders: Record<string, string> = {};
            const token = server.agentState.wsSessionToken;
            if (token) {
              healthHeaders['Authorization'] = `Bearer ${token}`;
            }
            const healthRes = await fetch(`${getLitellmUrl()}/health/liveliness`, {
              signal: AbortSignal.timeout(3000),
              headers: healthHeaders,
            });
            litellmAvailable = healthRes.ok;
          } catch {
            // LiteLLM not reachable
          }
        }
      }

      // ── Slash command routing (works even in echo mode) ──
      const { commandRegistry } = server.agentState;
      if (commandRegistry.isCommand(message)) {
        // Build a lightweight command context (same as commands.ts route)
        const cmdContext = {
          workspaceId: effectiveWorkspace,
          sessionId,
          searchMemory: async (query: string): Promise<string> => {
            try {
              const recall = await sessionOrch.recallMemory(query);
              if (recall.count === 0) return 'No relevant memories found.';
              const items = (recall.recalled ?? []).slice(0, 5);
              return items.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n');
            } catch {
              return 'Memory search unavailable.';
            }
          },
          getWorkspaceState: async (): Promise<string> => {
            const block = buildWorkspaceNowBlock({
              dataDir: server.localConfig.dataDir,
              workspaceId: effectiveWorkspace,
              wsManager: server.workspaceManager,
              activateWorkspaceMind: server.agentState.activateWorkspaceMind,
              cronSchedules: server.cronStore.list(),
            });
            if (!block) return 'No workspace state available.';
            return formatWorkspaceNowPrompt(block);
          },
          listSkills: (): string[] => {
            return server.agentState.skills.map(s => s.name);
          },
        };
        const cmdResult = await commandRegistry.execute(message, cmdContext);

        // B1-B7: Check if the command wants to be re-processed through the agent loop
        if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && litellmAvailable) {
          // Extract the rewritten message and fall through to agent loop processing
          const rerouted = cmdResult.slice(AGENT_LOOP_REROUTE_PREFIX.length);
          sendEvent('step', { content: `Processing /${message.trim().split(/\s+/)[0].slice(1)} via AI...` });
          // Replace the message in history with the original slash command (already persisted)
          // and process the rewritten message through the agent loop below
          // We achieve this by NOT returning here — the code falls through to the agent loop
          // with the rerouted message replacing the original
          reroutedMessage = rerouted;
        } else if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && !litellmAvailable) {
          const cmdName = message.trim().split(/\s+/)[0];
          const friendlyError = `**${cmdName} requires AI** — This command needs a working LLM connection.\n\nConfigure an API key in Settings > API Keys, then try again.`;
          const words = friendlyError.split(' ');
          for (const word of words) {
            sendEvent('token', { content: word + ' ' });
            await new Promise((r) => setTimeout(r, 10));
          }
          history.push({ role: 'assistant', content: friendlyError });
          persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: friendlyError });
          sendEvent('done', { content: friendlyError, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, toolsUsed: [] });
          raw.end();
          return; // Review Major #5: explicit terminal — don't fall through to agent loop
        } else {
          // Stream the command result as SSE tokens
          const cmdWords = cmdResult.split(' ');
          for (const word of cmdWords) {
            sendEvent('token', { content: word + ' ' });
            await new Promise((r) => setTimeout(r, 10));
          }
          // Persist command result
          history.push({ role: 'assistant', content: cmdResult });
          persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: cmdResult });
          sendEvent('done', {
            content: cmdResult,
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            toolsUsed: [],
          });
          raw.end();
          return; // Review Major #5: explicit terminal — don't fall through to agent loop
        }
      }

      // B1-B7: Check if a slash command requested agent-loop rerouting
      const shouldRunAgentLoop = reroutedMessage || (!commandRegistry.isCommand(message) && litellmAvailable);
      const shouldEchoMode = !reroutedMessage && !commandRegistry.isCommand(message) && !litellmAvailable;

      if (shouldEchoMode) {
        // Echo mode — respond without LLM so the UI is functional
        const echoResponse = `**Waggle is running in local mode** (no LLM proxy connected).\n\nYour message: "${message}"\n\nTo enable AI responses, configure an API key in Settings > API Keys.`;
        const words = echoResponse.split(' ');
        for (const word of words) {
          sendEvent('token', { content: word + ' ' });
          await new Promise((r) => setTimeout(r, 15));
        }
        // Persist echo response so session continuity is maintained
        history.push({ role: 'assistant', content: echoResponse });
        persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: echoResponse });
        sendEvent('done', {
          content: echoResponse,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          toolsUsed: [],
        });
      }

      if (shouldRunAgentLoop) {
        // Use rerouted message if from a slash command, otherwise use original
        const agentMessage = reroutedMessage ?? message;

        // Waggle Dance: emit agent start signal
        emitWaggleSignal({ type: 'agent:started', workspaceId: effectiveWorkspace, content: agentMessage.slice(0, 200) });

        // ── Budget check — warn if workspace is over budget ──
        if (!hasCustomRunner && effectiveWorkspace !== 'default') {
          const wsBudgetConfig = server.workspaceManager?.get(effectiveWorkspace);
          if (wsBudgetConfig?.budget != null && wsBudgetConfig.budget > 0) {
            const wsUsage = costTracker.getWorkspaceCost(effectiveWorkspace);
            if (wsUsage >= wsBudgetConfig.budget) {
              sendEvent('step', { content: `\u26a0\ufe0f Budget limit reached ($${wsUsage.toFixed(2)} / $${wsBudgetConfig.budget.toFixed(2)}). Responses may be limited.` });
            }
          }
        }

        // ── Workspace mind activation ────────────────────────────
        // With the Phase A.1 session migration, the per-session orchestrator
        // created above already has the workspace mind mounted. This legacy
        // shared-orchestrator activation only fires as a fallback when
        // session creation failed (wsSession is undefined) — matches the
        // old behavior for default/personal-only chats and broken workspaces.
        if (!hasCustomRunner && workspace && !wsSession) {
          const activated = server.agentState.activateWorkspaceMind(effectiveWorkspace);
          if (!activated) {
            sendEvent('step', { content: `Warning: could not activate workspace memory for "${effectiveWorkspace}". Using personal memory only.` });
          }
        }

        // ── Automatic memory recall ─────────────────────────────
        if (!hasCustomRunner) {
          try {
            sendEvent('step', { content: 'Recalling relevant memories...' });
            sendEvent('tool', { name: 'auto_recall', input: { query: agentMessage } });
            const recallStart = Date.now();
            const recall = await sessionOrch.recallMemory(agentMessage);
            const recallDuration = Date.now() - recallStart;
            if (recall.count > 0) {
              // Minor #3: scan recalled memory for injection payloads before injecting into prompt
              const recallInjection = scanForInjection(recall.text, 'tool_output');
              if (recallInjection.score >= 0.7) {
                log.warn('[security] Injection detected in recalled memory — dropping context', recallInjection.flags);
                sendEvent('step', { content: 'Recalled memories dropped — suspicious content detected.' });
              } else {
                recalledContext = '\n\n' + recall.text;
                recallTextForAssembler = recall.text;
              }
              // B5: Include content snippets so ToolCard can show what was recalled
              const snippets = (recall.recalled ?? []).slice(0, 3);
              const snippetText = snippets.map(s => `  - ${s}`).join('\n');
              const resultText = `${recall.count} memories recalled:\n${snippetText}`;
              // PR3.5: distinct provenance sources of the recalled memories
              // (raw frame.source values; the FE owns the friendly label map).
              // Review M-4: emit the breakdown ONLY when it covers EVERY recalled
              // frame — a partial breakdown next to "Recalled N memories" would
              // imply all N share these sources. Any 'unknown' (e.g. the rare
              // catch-up lane, which doesn't carry source) suppresses the pill
              // rather than undercount. Never a fabricated source.
              const recalledFrames = recall.recalledFrames ?? [];
              const hasUnknownSource = recalledFrames.some(f => !f.source || f.source === 'unknown');
              const provenanceSources = [...new Set(
                recalledFrames.map(f => f.source).filter((s): s is string => !!s && s !== 'unknown'),
              )];
              const emitProvenance = !hasUnknownSource && provenanceSources.length > 0;
              sendEvent('step', {
                content: `Recalled ${recall.count} relevant memor${recall.count === 1 ? 'y' : 'ies'}.`,
                ...(emitProvenance ? { provenance: { sources: provenanceSources } } : {}),
              });
              sendEvent('tool_result', { name: 'auto_recall', result: resultText, duration: recallDuration, isError: false });
            } else {
              sendEvent('tool_result', { name: 'auto_recall', result: 'No relevant memories found', duration: recallDuration, isError: false });
            }
          } catch {
            // Non-blocking — if recall fails, continue without it
          }
        }

        // Count prior user messages FIRST — needed by both GEPA and ambiguity guards.
        // Q11:A — Mid-conversation follow-ups like "yes", "run it", "LGTM" are valid
        // replies and should NOT be expanded or flagged as vague.
        const priorUserMessages = history.filter((m: { role: string }) => m.role === 'user').length;
        const isFirstUserMessage = priorUserMessages <= 1; // history already includes current message

        // ── GEPA Optimizer: classify + expand vague prompts ──────────
        // Uses @ax-llm/ax with cheapest model (Haiku) to optimize user input
        // before the main LLM call. Non-blocking — falls back gracefully.
        // CRITICAL: Only run on the FIRST user message in a session. Mid-conversation
        // replies ("yes", "the first three", "thats fine") must NOT be expanded —
        // GEPA has no conversation context and will misinterpret them as standalone
        // vague requests, generating phantom instructions the user never intended.
        let gepaExpanded: string | null = null;
        if (!hasCustomRunner && isFirstUserMessage) {
          try {
            const optimizer = await getOptimizerService(server);
            if (optimizer) {
              const result = await optimizer.expandWithChoices(agentMessage);
              if (result.isVague && result.expanded) {
                gepaExpanded = result.expanded;
                sendEvent('step', { content: `GEPA: Expanded prompt for better results` });
                // Send expansion choices to frontend for ask-first mode
                if (result.clarifyingQuestions && result.clarifyingQuestions.length > 0) {
                  sendEvent('gepa_choices', {
                    original: agentMessage,
                    expanded: result.expanded,
                    clarifyingQuestions: result.clarifyingQuestions,
                    intent: result.intent,
                  });
                }
              }
            }
          } catch {
            // Non-blocking — optimizer failure doesn't affect chat
          }
        }

        // Build system prompt (with workspace path awareness + recalled memories)
        // GAP-006: Prepend ambiguity guard when user message is too brief/vague
        const shouldCheckAmbiguity = isFirstUserMessage && !gepaExpanded; // Skip ambiguity check if GEPA already expanded
        const ambiguityPrefix = (!hasCustomRunner && shouldCheckAmbiguity && isAmbiguousMessage(agentMessage)) ? AMBIGUITY_PROMPT : '';

        // M2-7: Track session start on first user message
        if (isFirstUserMessage && server.telemetry) {
          server.telemetry.track('session_start', {
            workspaceId: effectiveWorkspace,
            templateId: server.workspaceManager?.get(effectiveWorkspace)?.templateId ?? null,
          });
        }

        // Template welcome context — inject on first message in a workspace with a template
        let templateContext = '';
        if (!hasCustomRunner && isFirstUserMessage) {
          const wsTemplateId = server.workspaceManager?.get(effectiveWorkspace)?.templateId;
          if (wsTemplateId) {
            const { BUILT_IN_TEMPLATES } = await import('./workspace-templates.js');
            const tpl = BUILT_IN_TEMPLATES?.find?.((t) => t.id === wsTemplateId);
            if (tpl) {
              templateContext = `\n\n# Workspace Template: ${tpl.name}\nThis workspace uses the "${tpl.name}" template. ${tpl.description ?? ''}\nGreet the user with a warm, template-appropriate welcome that shows you understand their domain.\n`;
              if (tpl.starterMemory?.length) {
                templateContext += '\nStarter context:\n' + tpl.starterMemory.map((m: string) => `- ${m}`).join('\n') + '\n';
              }
            }
          }
        }

        // FR #4: pre-fetch a structured AssembledPrompt when PROMPT_ASSEMBLER is on.
        // The assembler runs sixth-layer prompt packaging (Identity + Persona +
        // memory sections + task-shape scaffold). Failures fall back gracefully
        // to the static system prompt — never block a chat turn on assembler errors.
        let assembled: AssembledPrompt | null = null;
        if (!hasCustomRunner && isEnabled('PROMPT_ASSEMBLER')) {
          try {
            const wsConfigForAssembler = effectiveWorkspace ? server.workspaceManager?.get(effectiveWorkspace) : null;
            const personaIdForAssembler = personaOverride ?? wsConfigForAssembler?.personaId ?? null;
            const personaForAssembler = personaIdForAssembler ? resolvePersona(personaIdForAssembler) : null;
            const taskShape = detectTaskShape(agentMessage);
            assembled = await sessionOrch.buildAssembledPrompt(agentMessage, personaForAssembler, { taskShape, turnId, recalledText: recallTextForAssembler });
            log.info(
              `[prompt-assembler] applied turn=${turnId.slice(0, 8)} `
              + `shape=${taskShape.type ?? 'none'} conf=${taskShape.confidence.toFixed(2)} `
              + `tier=${assembled.debug.tier} sections=${assembled.debug.sectionsIncluded.length} `
              + `frames=${assembled.debug.framesUsed} chars=${assembled.debug.totalChars}`
            );
          } catch (err) {
            log.warn(`[prompt-assembler] failed, falling back to static prompt: ${(err as Error).message}`);
            assembled = null;
          }
        }

        // W4.5 (plan bug #9-1, double-inject): when the assembler ran, the
        // recall block is already INSIDE the assembled prompt — appending
        // recalledContext again injected every recalled memory twice.
        const systemPrompt = hasCustomRunner
          ? 'You are a helpful AI assistant.'
          : ambiguityPrefix
            + buildSystemPrompt(sessionOrch, workspacePath, sessionId, history.length, effectiveWorkspace, personaOverride, assembled)
            + templateContext
            + conversationalToolPolicyPrompt(agentMessage, autonomyLevel)
            + (assembled ? '' : recalledContext);

        // Register a per-request pre:tool hook for confirmation gates
        // This fires during the agent loop and pauses until user approves/denies
        const autoApprove = AUTO_APPROVE;
        // Assignment (not declaration) — unregisterHook is declared at outer try scope
        // so the outer finally can always clean up regardless of which path we exit on.
        unregisterHook = hasCustomRunner ? undefined : hookRegistry.on('pre:tool', async (ctx) => {
          if (!ctx.toolName) return;
          const args = (ctx.args ?? {}) as Record<string, unknown>;

          // Phase B.5: autonomy-aware gate. If the user has Trusted or YOLO set
          // for this session, the tool may auto-pass. Critical blacklist still
          // blocks even at YOLO (see isCriticalNeverAutopass).
          if (!needsConfirmationWithAutonomy(ctx.toolName, args, autonomyLevel)) {
            // Surface an audit-visible step when elevated autonomy pre-approved
            // so users can see WHY the tool ran without a prompt.
            if (autonomyLevel !== 'normal' && needsConfirmation(ctx.toolName, args)) {
              sendEvent('step', { content: `\u26a1 ${ctx.toolName} auto-approved (${autonomyLevel})` });
              // Tag the audit input with the autonomy level so forensics can
              // see WHY the tool was auto-approved.
              emitAuditEvent(server, {
                workspaceId: effectiveWorkspace,
                eventType: 'approval_auto',
                toolName: ctx.toolName,
                input: JSON.stringify({ args, _autonomy: autonomyLevel }),
                sessionId,
                approved: true,
              });
            }
            return;
          }

          // Self-evolution review turn: no interactive client is watching this
          // headless loopback stream, so a live approval prompt would auto-deny
          // after the timeout and the reviewer's proposal would vanish. Convert a
          // gated proposable tool (create_skill) into a DURABLE held action that
          // ApprovalsApp shows; deny any other gated tool. This runs before the
          // grant-store shortcut on purpose \u2014 a saved "Always allow" grant must
          // NOT let a headless reviewer write a skill to disk. The trust boundary:
          // the reviewer can never persist a skill without explicit human approval.
          if (proposeHeldTurn) {
            if (isProposableTool(ctx.toolName)) {
              const enq = enqueueHeldAction(server, {
                workspaceId: effectiveWorkspace || null,
                source: `session-reviewer:${sessionId}`,
                tool: ctx.toolName,
                args,
                summary: describeToolUse(ctx.toolName, args),
              });
              sendEvent('step', {
                content: 'refused' in enq
                  ? `\u26a0 ${ctx.toolName} proposal refused (${enq.refused})`
                  : `\ud83d\udccb ${ctx.toolName} held for your approval`,
              });
            } else {
              sendEvent('step', { content: `\u2716 ${ctx.toolName} not permitted for review turns` });
            }
            return { cancel: true, reason: `Review turn: ${ctx.toolName} held for approval` };
          }

          // H3: Auto-approve all tool requests when WAGGLE_AUTO_APPROVE=1 (testing only)
          if (autoApprove) {
            sendEvent('step', { content: `\u2714 ${ctx.toolName} auto-approved (test mode)` });
            return;
          }

          // Phase B.3: check the persistent grant store — if the user previously
          // chose "Always allow" for this (tool, target) combination, skip the
          // approval prompt silently.
          if (server.agentState.approvalGrantStore.has(ctx.toolName, args, effectiveWorkspace || null)) {
            sendEvent('step', { content: `\u2714 ${ctx.toolName} allowed by saved grant` });
            return;
          }

          const requestId = crypto.randomUUID();
          const toolName = ctx.toolName;
          const input = (ctx.args ?? {}) as Record<string, unknown>;

          // P7/D15 A4: enrich EVERY gated approval with risk metadata so the
          // in-chat card (D4(ii), A5) can show a consistent risk badge — not just
          // install_capability. install_capability keeps its richer content-based
          // TrustAssessment; all other gated tools get the canonical
          // classifyGatedToolRisk mapping. `description` is the plain-language
          // "what will happen" line the FE card expects (divergence #10).
          let trustMeta: Record<string, unknown> | undefined;
          if (toolName === 'install_capability') {
            try {
              const skillNameRaw = input.name as string ?? '';
              const source = input.source as string ?? '';
              // Review Minor #1: path.basename strips any directory separators so a model
              // coerced into `name: "../../evil"` cannot escape the starter-skills directory.
              const skillName = path.basename(skillNameRaw);
              // Read starter skill content for trust assessment
              const { getStarterSkillsDir } = await import('@waggle/sdk');
              const starterPath = path.join(getStarterSkillsDir(), `${skillName}.md`);
              const content = fs.existsSync(starterPath) ? fs.readFileSync(starterPath, 'utf-8') : '';
              const trust = assessTrust({ capabilityType: 'skill', source, content });
              trustMeta = {
                riskLevel: trust.riskLevel,
                approvalClass: trust.approvalClass,
                trustSource: trust.trustSource,
                assessmentMode: trust.assessmentMode,
                explanation: trust.explanation,
                permissions: trust.permissions,
                description: describeToolUse(toolName, input),
              };
            } catch { /* content-based assessment failed — fall through to the heuristic */ }
          }
          // Track A review: if the install assessment threw, OR for any non-install
          // gated tool, derive risk heuristically so approvalClass is NEVER absent
          // (an absent approvalClass would let the FE offer "Always allow" on a
          // critical op — fail-open). trustSource is OMITTED here: there is no real
          // provenance signal for a bash/git/connector call, and stamping
          // 'local_user' was a false claim on the trust surface (review #3).
          if (!trustMeta) {
            try {
              const { riskLevel, approvalClass } = classifyGatedToolRisk(toolName, input);
              trustMeta = {
                riskLevel,
                approvalClass,
                assessmentMode: 'heuristic',
                description: describeToolUse(toolName, input),
              };
            } catch { /* enrichment is best-effort — approval still fires */ }
          }

          // Send approval_required SSE event to the client.
          // Phase B.3: includes sourceWorkspaceId so the frontend can send it
          // back verbatim when the user clicks "Always allow" — keeps the grant
          // store scoped correctly.
          sendEvent('approval_required', {
            requestId, toolName, input,
            sourceWorkspaceId: effectiveWorkspace || null,
            ...trustMeta,
          });
            // F2: Audit trail — approval requested
            emitAuditEvent(server, {
              workspaceId: effectiveWorkspace,
              eventType: 'approval_requested',
              toolName,
              input: JSON.stringify(input),
              sessionId,
            });

          // Wait for the client to approve or deny
          const approved = await new Promise<boolean>((resolve) => {
            server.agentState.pendingApprovals.set(requestId, {
              resolve,
              toolName,
              input,
              timestamp: Date.now(),
            });

            // Auto-DENY after 5 minutes if no response — fail safe, not fail open
            setTimeout(() => {
              if (server.agentState.pendingApprovals.has(requestId)) {
                server.agentState.pendingApprovals.delete(requestId);
                log.warn(`[security] Approval timed out for ${toolName} (requestId: ${requestId}) — auto-denied for safety`);
                resolve(false);
              }
            }, 300_000);
          });

          if (!approved) {
            sendEvent('step', { content: `\u2716 ${toolName} denied by user` });
            emitAuditEvent(server, { workspaceId: effectiveWorkspace, eventType: 'approval_denied', toolName, sessionId, approved: false });
            return { cancel: true, reason: `User denied ${toolName}` };
          }
          sendEvent('step', { content: `\u2714 ${toolName} approved` });
            emitAuditEvent(server, { workspaceId: effectiveWorkspace, eventType: 'approval_granted', toolName, sessionId, approved: true });
        });

        // Use workspace-scoped tools if a workspacePath was specified
        let effectiveTools = hasCustomRunner
          ? []
          : workspacePath
            ? server.agentState.buildToolsForWorkspace(workspacePath)
            : allTools;

        // W3.1: Filter tools by persona — non-technical personas get a reduced
        // tool set. The always-available + read-only-write-strip policy lives in
        // persona-tool-filter.ts (extracted so the closed-learning-loop guarantee
        // — create_skill survives the allowlist — is unit-testable; this block is
        // !hasCustomRunner-gated and therefore unreachable from route tests).
        // Resolution order matches buildSystemPrompt (Phase A.2): per-window
        // override > workspace config.
        const wsConfig = effectiveWorkspace ? server.workspaceManager?.get(effectiveWorkspace) : null;
        const activePersonaId = personaOverride ?? wsConfig?.personaId ?? null;
        if (!hasCustomRunner && activePersonaId) {
          const persona = resolvePersona(activePersonaId);
          if (persona) {
            effectiveTools = applyPersonaToolFilter(effectiveTools, persona);
          }
        }

        // Dynamic tool availability — run checkAvailability on each tool
        // SEC: capture the persona + availability filtered tool names BEFORE the
        // conversational-turn narrowing. This is the allowlist a spawned
        // sub-agent / workflow worker is intersected against: the persona and
        // availability restrictions must carry across spawn, but the per-turn
        // conversational narrowing (a UX heuristic) must not shrink a
        // sub-agent's legitimate toolset for its explicit task.
        let spawnAllowedToolNames: ReadonlySet<string> | null = null;
        if (!hasCustomRunner) {
          effectiveTools = filterAvailableTools(effectiveTools);
          spawnAllowedToolNames = new Set(effectiveTools.map(t => t.name));
          const beforeNarrowing = effectiveTools.length;
          effectiveTools = filterGatedToolsForConversationalTurn(effectiveTools, agentMessage, autonomyLevel);
          if (effectiveTools.length !== beforeNarrowing) {
            log.info(`[chat] conversational turn: withheld ${beforeNarrowing - effectiveTools.length} deferred tools until explicitly requested`);
          }
        }
        const pluginTools = hasCustomRunner
          ? undefined
          : filterPluginToolsForConversationalTurn(
            server.agentState.pluginRuntimeManager,
            agentMessage,
            autonomyLevel,
            (count) => log.info(`[chat] conversational turn: withheld ${count} deferred plugin tools until explicitly requested`),
          );

        // Track tool execution times for duration reporting
        const toolStartTimes = new Map<string, number>();
        let toolStartCounter = 0;

        // Build capability router for intelligent tool-not-found handling
        const capabilityRouter = hasCustomRunner ? undefined : new CapabilityRouter({
          toolNames: effectiveTools.map(t => t.name),
          skills: server.agentState.skills,
          plugins: server.agentState.pluginRuntimeManager.getActive().map(p => ({
            name: p.getManifest().name,
            description: p.getManifest().description ?? '',
            skills: p.getContributedSkills(),
          })),
          mcpServers: Object.keys(server.agentState.mcpRuntime.getServerStates()),
          subAgentRoles: ['researcher', 'writer', 'coder', 'analyst', 'reviewer', 'planner'],
          mcpRuntime: server.agentState.mcpRuntime,
        });

        // B1-B7: If this is a rerouted slash command, replace the last user message
        // with the enriched agent prompt so the LLM gets better instructions
        if (reroutedMessage) {
          // The original slash command is already persisted to disk at line 724.
          // For the agent loop, swap in the rerouted message so the LLM sees the
          // enhanced prompt (e.g., "Draft the following. Search memory first...")
          let lastUserIdx = -1;
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') { lastUserIdx = i; break; }
          }
          if (lastUserIdx >= 0) {
            history[lastUserIdx] = { role: 'user', content: reroutedMessage };
          }
        }

        // Apply intelligent context compression — replaces the old sliding window.
        // When conversation exceeds 50% of context window: prune tool results,
        // protect head/tail, LLM-summarize the middle using budget model ($0 cost).
        let windowedMessages: Array<{ role: string; content: string }>;
        if (budgetModel) {
          // §B: size compaction to the actual model window so a local 4k/8k model
          // is not treated as a 128k model. Local (ollama/*) models with an unknown
          // window get a conservative 8k floor; non-local/unknown cloud ids we don't
          // map yet (deepseek/mistral/openrouter/…) keep the prior 128k baseline so
          // they aren't over-compacted.
          const discoveredWindow = getModelContextWindow(resolvedModel);
          const isLocalModel = resolvedModel.trim().toLowerCase().startsWith('ollama/');
          const maxContextTokens = computeInputTokenBudget(0, discoveredWindow, false, {
            conservativeDefault: isLocalModel ? 8192 : 128_000,
          });
          const compressionConfig = createDefaultCompressionConfig({
            budgetModel,
            litellmUrl: getLitellmUrl(),
            litellmApiKey: server.agentState.litellmApiKey,
            maxContextTokens,
          });
          const previousSummary = compressionSummaries.get(sessionId) ?? null;
          const compressionResult = await compressConversation(history, compressionConfig, previousSummary);
          windowedMessages = compressionResult.messages;

          if (compressionResult.compressed) {
            log.info(`[context-compression] Compressed ${compressionResult.originalTokens}→${compressionResult.compressedTokens} tokens (session=${sessionId})`);
            sendEvent('step', { content: `Context compressed: ${compressionResult.originalTokens}→${compressionResult.compressedTokens} tokens` });
            if (compressionResult.summary) {
              compressionSummaries.set(sessionId, compressionResult.summary);
            }
          }
        } else {
          // Fallback to simple sliding window when no budget model is configured
          windowedMessages = applyContextWindow(history);
        }

        // GEPA: if the prompt was expanded, replace the last user message
        // so the LLM sees the optimized version (original stays in disk history)
        if (gepaExpanded) {
          windowedMessages = windowedMessages.map((m, i, arr) => {
            if (i === arr.length - 1 && m.role === 'user') {
              return { ...m, content: `${gepaExpanded}\n\n(Original: "${m.content}")` };
            }
            return m;
          });
        }

        // Governance policies for team workspaces — direct call (no HTTP loopback)
        let governancePolicies: { blockedTools?: string[]; allowedSources?: string[] } | undefined;
        if (wsConfig?.teamId) {
          try {
            governancePolicies = await getGovernancePermissions(
              server.localConfig.dataDir,
              effectiveWorkspace,
              wsConfig.teamRole,
            );
          } catch { /* governance not available — allow all */ }
        }

        // Iteration budget — prevents runaway agent loops
        const iterBudget = new IterationBudget({
          maxIterations: 90,
          freeToolCalls: ['execute_code'],
        });

        // Build agent loop config — with windowed conversation history + hooks
        const agentConfig: AgentLoopConfig = {
          litellmUrl: getLitellmUrl(),
          litellmApiKey: server.agentState.litellmApiKey,
          model: resolvedModel,
          systemPrompt,
          tools: effectiveTools,
          messages: windowedMessages,
          stream: true,
          maxTurns: 200, // Persistent agents need many turns for complex research + document generation
          hooks: hasCustomRunner ? undefined : hookRegistry,
          capabilityRouter,
          governancePolicies,
          pluginTools,
          signal: abortController.signal,
          turnId, // H-AUDIT-1: propagate trace ID into the loop

          onToken: (token: string) => {
            sendEvent('token', { content: token });
          },
          onToolUse: (name: string, input: Record<string, unknown>) => {
            // Send human-readable step description + raw tool event
            const stepText = describeToolUse(name, input);
            sendEvent('step', { content: stepText });
            sendEvent('tool', { name, input });
            // Waggle Dance: emit tool call signal
            emitWaggleSignal({ type: 'tool:called', workspaceId: effectiveWorkspace, content: `${name}(${JSON.stringify(input).slice(0, 100)})` });
            // Track start time for duration calculation
            toolStartTimes.set(name + ':' + toolStartCounter++, Date.now());
            // F2: Audit trail — log tool call
            emitAuditEvent(server, {
              workspaceId: effectiveWorkspace,
              eventType: 'tool_call',
              toolName: name,
              input: JSON.stringify(input),
              sessionId,
              model: resolvedModel,
            });
          },
          onToolResult: (name: string, input: Record<string, unknown>, result: string) => {
            // Calculate duration from the most recent start of this tool
            let duration: number | undefined;
            // Find the latest matching start entry
            for (const [key, startTime] of toolStartTimes) {
              if (key.startsWith(name + ':')) {
                duration = Date.now() - startTime;
                toolStartTimes.delete(key);
                break;
              }
            }

            // Send tool_result SSE event so client can update status + show result
            const isError = result.startsWith('Error:') || result.startsWith('Error ');
            sendEvent('tool_result', { name, result, duration, isError });
            // F2: Audit trail — log tool result (truncated output)
            emitAuditEvent(server, {
              workspaceId: effectiveWorkspace,
              eventType: 'tool_result',
              toolName: name,
              output: result.length > 2000 ? result.slice(0, 2000) + '...[truncated]' : result,
              sessionId,
            });

            // Emit file_created events for file-writing tools
            const fileTools: Record<string, 'write' | 'edit' | 'generate'> = {
              write_file: 'write',
              edit_file: 'edit',
              generate_docx: 'generate',
            };
            const fileAction = fileTools[name];
            if (fileAction && input.path && !result.startsWith('Error')) {
              const filePath = String(input.path);
              sendEvent('file_created', { filePath, fileAction });
            }

            // TeamSync push — after save_memory in team workspace (fire-and-forget)
            if (name === 'save_memory' && workspace && !result.startsWith('Error')) {
              const pushWsConfig = server.workspaceManager?.get(effectiveWorkspace);
              if (pushWsConfig?.teamId) {
                try {
                  const waggleConfig = new WaggleConfig(server.localConfig.dataDir);
                  const teamServer = waggleConfig.getTeamServer();
                  if (teamServer?.token && pushWsConfig.teamServerUrl) {
                    const sync = new TeamSync({
                      teamServerUrl: pushWsConfig.teamServerUrl,
                      teamSlug: pushWsConfig.teamId,
                      authToken: teamServer.token,
                      userId: teamServer.userId ?? 'local-user',
                      displayName: teamServer.displayName ?? 'You',
                    });
                    // Fire-and-forget push — non-blocking
                    sync.pushFrame({
                      id: Date.now(),
                      gop_id: sessionId ?? 'unknown',
                      t: 0,
                      frame_type: 'I',
                      base_frame_id: null,
                      content: typeof result === 'string' ? result.slice(0, 500) : '',
                      importance: 'normal',
                      source: 'agent_inferred',
                      access_count: 0,
                      created_at: new Date().toISOString(),
                      last_accessed: new Date().toISOString(),
                    }).catch(err => log.warn('[waggle] TeamSync push failed:', err.message));
                  }
                } catch { /* TeamSync not available */ }
              }
            }
          },
        };

        // ── Credential pool: resolve API key with round-robin ──
        // Extract provider name from model ID (e.g., "anthropic" from "claude-sonnet-4-6")
        // NOTE: the credential pool injects a *provider* key (e.g. sk-ant-…). That is
        // correct only on the direct-provider path (anthropic-proxy / openai-compat).
        // When routing THROUGH LiteLLM, every request must use the LiteLLM master key —
        // LiteLLM holds the real provider keys internally and validates any *other* key
        // as a virtual key against its DB, returning "No connected db." (no_db_connection)
        // when no DB is attached. So skip the pool entirely on the LiteLLM path.
        const usingLiteLLM = server.agentState.llmProvider?.provider === 'litellm';
        const providerName = resolvedModel.startsWith('claude') ? 'anthropic' : resolvedModel.split('/')[0] ?? 'anthropic';
        const credPool = usingLiteLLM ? undefined : getCredentialPool(providerName);
        const poolKey = credPool?.getKey();
        const effectiveApiKey = poolKey ?? server.agentState.litellmApiKey;

        // ── Start execution trace (self-evolution substrate) ──
        // Lazy-created per request so unit tests with no traceStore decorator
        // (legacy suites) still pass. Assigned to the hoisted outer-scope
        // variables so the outer catch can finalize with outcome='abandoned'
        // on any exception path (H-07 G4 fix).
        traceRecorder = server.traceStore ? new TraceRecorder(server.traceStore) : null;
        traceHandle = traceRecorder
          ? traceRecorder.start({
              sessionId,
              personaId: activePersonaId,
              workspaceId: effectiveWorkspace ?? null,
              model: resolvedModel,
              input: message,
            })
          : null;

        // #4: route locally-selected Ollama models to Ollama's OpenAI-compatible
        // endpoint instead of LiteLLM (graceful degradation / sovereignty story).
        // The sidecar reaches Ollama directly (as it does for embeddings) — no
        // Docker->host hop, no API key. Strip the 'ollama/' routing prefix to the
        // bare tag Ollama expects (e.g. "llama3.2:latest").
        const isOllamaModel = resolvedModel.startsWith('ollama/');
        const ollamaUrl = (process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434') + '/v1';

        const runConfig: typeof agentConfig = {
          ...agentConfig,
          ...(isOllamaModel ? { litellmUrl: ollamaUrl, model: resolvedModel.slice('ollama/'.length) } : {}),
          litellmApiKey: effectiveApiKey,
          ...(traceRecorder && traceHandle
            ? { traceRecording: { recorder: traceRecorder, handle: traceHandle } }
            : {}),
          // AI-OS Phase 3 — skill diffusion. When the D1 closed
          // learning loop fires, broadcast a skill_share signal on
          // the v2 bus so MCP-consuming external tools can adopt
          // the soon-to-be-authored skill. Failures are swallowed
          // upstream (agent-loop wraps in try/catch).
          onSkillDistillationFire: server.signalBus
            ? async ({ patternKey, toolsUsed, directive }) => {
                const signalBus = server.signalBus;
                if (!signalBus) return;
                const now = new Date();
                signalBus.record({
                  id: `skill-share-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
                  teamId: `personal::${effectiveWorkspace ?? 'default'}`,
                  senderId: `agent-loop:${activePersonaId ?? 'agent'}`,
                  type: 'broadcast',
                  subtype: 'skill_share',
                  content: {
                    tool: 'waggle-agent',
                    patternKey,
                    toolsUsed: [...toolsUsed],
                    directive,
                    sessionId,
                    workspaceId: effectiveWorkspace ?? null,
                  },
                  referenceId: null,
                  routing: null,
                  createdAt: now,
                });
              }
            : undefined,
        };

        // SEC: publish the request-scoped security context so sub-agents /
        // workflow workers spawned during this run inherit the SAME approval
        // gate, governance denylist, and persona allowlist as the main loop.
        // Without this, spawned agents ran the full tool pool with no
        // confirmation gate (the sub-agent confirmation-bypass). Cleared in the
        // outer finally so it never leaks into a later run.
        server.agentState.spawnSecurityContext = hasCustomRunner ? null : {
          hooks: hookRegistry,
          blockedTools: governancePolicies?.blockedTools,
          allowedToolNames: spawnAllowedToolNames,
        };

        // ── Run agent with credential pool + fallback chain ──
        let result;
        try {
          result = await agentRunner(runConfig);
          // Report success to credential pool
          if (credPool && poolKey) credPool.reportSuccess(poolKey);
        } catch (primaryErr) {
          // Report error to credential pool and try next key
          const errStatus = extractStatusCode(primaryErr);
          if (credPool && poolKey && errStatus) {
            const keyName = credPool.getNameForKey(poolKey) ?? poolKey;
            const hasMore = credPool.reportError(poolKey, errStatus, (primaryErr as Error).message);
            log.warn(`[credential-pool] Key ${keyName} failed (${errStatus}), cooldown applied. More keys: ${hasMore}`);

            if (hasMore) {
              const nextKey = credPool.getKey();
              if (nextKey) {
                sendEvent('step', { content: `API key rotated — retrying with next credential` });
                result = await agentRunner({ ...runConfig, litellmApiKey: nextKey });
                credPool.reportSuccess(nextKey);
              } else {
                throw primaryErr;
              }
            } else if (isRetryableError(primaryErr) && fallbackModel && resolvedModel !== fallbackModel) {
              // No pool keys left — fall back to different model
              modelSwitchReason = `${resolvedModel} failed (${errStatus}), all keys exhausted`;
              resolvedModel = fallbackModel;
              // #4: the fallback is a LiteLLM/cloud model — reset litellmUrl in
              // case the original was an Ollama model routed to the local endpoint.
              result = await agentRunner({ ...runConfig, model: resolvedModel, litellmUrl: getLitellmUrl() });
            } else {
              throw primaryErr;
            }
          } else if (isRetryableError(primaryErr) && fallbackModel && resolvedModel !== fallbackModel) {
            modelSwitchReason = `${resolvedModel} failed (${(primaryErr as { status?: number }).status ?? 'timeout'})`;
            resolvedModel = fallbackModel;
            // #4: reset litellmUrl — the fallback is a LiteLLM/cloud model even
            // if the original selection was a local Ollama model.
            result = await agentRunner({ ...runConfig, model: resolvedModel, litellmUrl: getLitellmUrl() });
          } else {
            throw primaryErr;
          }
        }

        // Notify client of model switch
        if (modelSwitchReason) {
          sendEvent('model_switch', { model: resolvedModel, reason: modelSwitchReason, primary: primaryModel });
          sendEvent('step', { content: `⬡ Switched to ${resolvedModel} — ${modelSwitchReason}` });
        }

        // Track iteration and inject budget pressure
        iterBudget.tick();
        const budgetPressure = iterBudget.getPressureMessage();
        if (budgetPressure) {
          sendEvent('step', { content: budgetPressure.trim() });
        }

        // Unregister the per-request approval hook. Setting to undefined so the outer
        // finally's defensive cleanup is a no-op on the happy path.
        if (unregisterHook) {
          unregisterHook();
          unregisterHook = undefined;
        }

        // Track cost with the ACTUALLY used model
        costTracker.addUsage(resolvedModel, result.usage.inputTokens, result.usage.outputTokens, effectiveWorkspace);

        // L-17 C3: per-session token accumulation for /api/fleet visibility.
        // costTracker is per-workspace cost; sessionManager holds per-session
        // token totals that persist for the life of the active session.
        server.sessionManager?.addTokens(
          effectiveWorkspace,
          (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
        );

        // ── Finalize the execution trace (self-evolution substrate) ──
        // Default outcome is 'success'; correction-detector may downgrade to
        // 'corrected' on the next turn via traceStore.markCorrected().
        if (traceRecorder && traceHandle) {
          try {
            traceRecorder.finalize(traceHandle, {
              outcome: 'success',
              output: result.content ?? '',
              tokens: {
                input: result.usage.inputTokens,
                output: result.usage.outputTokens,
              },
            });
            traceFinalized = true;
          } catch { /* tracing is best-effort — don't fail the response */ }
        }

        // M8: commit deferred signal markings now that model call succeeded
        if (!hasCustomRunner) sessionOrch.commitSurfacedSignals();

        // ── Post-response memory write-back ──────────────────────
        // If the agent didn't save memory itself, check if the exchange
        // contains save-worthy content and auto-save it.
        if (!hasCustomRunner) {
          const agentAlreadySaved = (result.toolsUsed ?? []).includes('save_memory');
          if (!agentAlreadySaved) {
            try {
              const saved = await sessionOrch.autoSaveFromExchange(message, result.content, {
                // PR3.5 frame↔trace backlink — link auto-saved frames to the
                // turn's execution trace so Memory-Trust can answer "why is this
                // memory here?". Undefined when no trace recorder (legacy/tests).
                traceId: traceHandle ? String(traceHandle.id) : undefined,
              });
              if (saved.length > 0) {
                sendEvent('step', { content: `Auto-saved ${saved.length} memor${saved.length === 1 ? 'y' : 'ies'} from this exchange.` });
              }
            } catch (e) {
              // Non-blocking. W4A: a closed-handle failure here is the signature
              // of the MultiMindCache evicting this turn's mind mid-flight — log
              // it with context so the flake is observable, but still fail soft.
              if (isClosedDbError(e)) {
                log.warn('[waggle][W4A] workspace mind handle closed mid-turn during auto-save', {
                  workspaceId: effectiveWorkspace,
                  sessionId,
                  seam: 'autoSaveFromExchange',
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }
          }
        }

        // ── R1 closed learning loop: deterministic skill distillation ──
        // Hermes parity (premium-harness D1). The runtime — not just the
        // behavioral-spec prose — detects a successful ≥5-tool turn and
        // surfaces the distillation directive, so the agent reliably authors
        // a reusable skill via its own create_skill tool. R2-gated end to
        // end: a refusal / self-incapacity turn yields no plan. The signal
        // is recorded idempotently (skill_promotion) so recurring workflows
        // bubble up through the existing actionable-signal substrate.
        if (!hasCustomRunner) {
          const distillPlan = planSkillDistillation(result.toolsUsed ?? [], result.content ?? '');
          if (distillPlan) {
            sendEvent('step', { content: distillPlan.directive });
            try {
              sessionOrch.getImprovementSignals().record(
                'skill_promotion',
                distillPlan.patternKey,
                distillPlan.directive,
                { sessionId, toolCalls: (result.toolsUsed ?? []).length },
              );
            } catch {
              // Signal recording is best-effort — never fail the response.
            }
          }
        }

        // ── KG auto-extraction (Item 4) ────────────────────────────
        // Extract named entities from the agent response and add them to the
        // knowledge graph of the active workspace mind.
        // Non-blocking — KG enrichment never fails the response.
        if (!hasCustomRunner && result.content && result.content.length > 100) {
          try {
            const knowledge = sessionOrch.getKnowledge();
            const entities = extractEntities(result.content);
            if (entities.length > 0) {
              const now = new Date().toISOString();
              // Cap at 10 entities per turn to avoid KG bloat
              for (const entity of entities.slice(0, 10)) {
                try {
                  knowledge.createEntity(entity.type, entity.name, { confidence: entity.confidence, source: `session:${sessionId}` }, { valid_from: now });
                } catch {
                  // Duplicate or schema error — skip silently
                }
              }
            }
          } catch (e) {
            if (isClosedDbError(e)) {
              log.warn('[waggle][W4A] workspace mind handle closed mid-turn during KG extraction', {
                workspaceId: effectiveWorkspace,
                sessionId,
                seam: 'knowledge.createEntity',
                error: e instanceof Error ? e.message : String(e),
              });
            } else {
              log.info('[waggle] KG extraction error:', e instanceof Error ? e.message : String(e));
            }
          }
        }

        // ── Correction detection ──────────────────────────────────
        // Analyze user message for corrections and record improvement signals.
        // Non-blocking — detection failure shouldn't affect the response.
        if (!hasCustomRunner) {
          try {
            const signalStore = sessionOrch.getImprovementSignals();
            analyzeAndRecordCorrection(signalStore, message);

            // Record capability gaps from tool-not-found events
            const toolNotFoundPattern = /Tool "(.+?)" not found/;
            if (result.content) {
              const match = result.content.match(toolNotFoundPattern);
              if (match) {
                recordCapabilityGap(signalStore, match[1]);
              }
            }
          } catch {
            // Non-blocking
          }
        }

        // ── Auto skill capture — detect repeatable workflow patterns ──
        if (!hasCustomRunner && result.toolsUsed && result.toolsUsed.length > 0) {
          try {
            // Track this session's tool sequence
            if (!sessionToolSequences.has(sessionId)) {
              sessionToolSequences.set(sessionId, []);
            }
            sessionToolSequences.get(sessionId)!.push(result.toolsUsed);

            // Build session history from other sessions' tool sequences
            const otherSessions = [...sessionToolSequences.entries()]
              .filter(([id]) => id !== sessionId)
              .map(([, seqs]) => ({ toolSequence: seqs.flat() }));

            if (otherSessions.length >= 2) {
              const captureResult = shouldSuggestCapture({
                messages: history.map((m, _i) => ({
                  role: m.role,
                  content: m.content,
                  toolsUsed: result.toolsUsed,
                })),
                sessionHistory: otherSessions,
              });

              if (captureResult.suggest && captureResult.pattern) {
                const patternKey = captureResult.pattern.name;
                if (!dismissedCaptureSuggestions.has(patternKey)) {
                  sendEvent('notification', {
                    type: 'workflow_captured',
                    title: captureResult.notification?.title ?? 'Pattern detected',
                    message: captureResult.notification?.message ?? captureResult.reason,
                    pattern: captureResult.pattern,
                  });
                  log.info(`[auto-skill] Suggested capture: ${patternKey}`);
                }
              }
            }
          } catch {
            // Non-blocking — capture detection failure never affects the response
          }
        }

        // Post-processing: append professional disclaimer for regulated personas ONLY when content is substantive
        let finalContent = result.content;
        const REGULATED_DISCLAIMER_MAP: Record<string, string> = {
          'hr-manager': '\n\n---\n*This is general HR guidance, not legal advice. Consult your legal team for binding decisions.*',
          'legal-professional': '\n\n---\n*This is AI-assisted legal analysis, not legal advice. This does not create an attorney-client relationship. Consult a licensed attorney for binding legal guidance.*',
          'finance-owner': '\n\n---\n*Financial figures are estimates based on available data. Verify with your accountant or financial advisor before making decisions.*',
        };
        if (activePersonaId && REGULATED_DISCLAIMER_MAP[activePersonaId] && finalContent) {
          if (isRegulatedContent(finalContent, activePersonaId)) {
            const hasDisclaimer = finalContent.toLowerCase().includes('not legal advice') ||
              finalContent.toLowerCase().includes('attorney-client') ||
              finalContent.toLowerCase().includes('verify with your accountant') ||
              finalContent.toLowerCase().includes('financial advisor') ||
              finalContent.toLowerCase().includes('legal team');
            if (!hasDisclaimer) {
              finalContent += REGULATED_DISCLAIMER_MAP[activePersonaId];
            }
          }
        }

        // IMP-004: Contextual cron suggestion — nudge user about /schedule when response discusses recurring work
        if (!hasCustomRunner && finalContent && shouldSuggestSchedule(finalContent, result.toolsUsed ?? [])) {
          finalContent += SCHEDULE_SUGGESTION;
        }

        // Grounding guard (verification layer): flag quantitative specifics the
        // reply asserts that are NOT in the recalled memory / user message. Prompt
        // instructions don't reliably suppress this confabulation (verified live),
        // so surface high-signal cases honestly rather than let invented numbers
        // read as recalled facts. Deterministic + cheap. count/money trigger an
        // honest hedge note; durations/percents only inform the log signal
        // (noisier — advice timelines like "2 weeks" would false-positive). The
        // nuanced cases (proper nouns, "4 months runway") need the LLM verifier.
        if (!hasCustomRunner && finalContent && recalledContext) {
          const grounding = checkGrounding(finalContent, recalledContext + '\n' + message);
          if (grounding.ungrounded.length > 0) {
            log.info('[grounding] reply asserts specifics absent from recalled memory', {
              score: grounding.score,
              ungrounded: grounding.ungrounded.map((s) => s.text),
            });
          }
          const hedgeWorthy = grounding.ungrounded.filter((s) => s.kind === 'count' || s.kind === 'money');
          if (hedgeWorthy.length > 0 && process.env.WAGGLE_GROUNDING_HEDGE !== '0') {
            const items = hedgeWorthy.map((s) => `"${s.text}"`).join(', ');
            const one = hedgeWorthy.length === 1;
            finalContent += `\n\n---\n*Note: ${items} ${one ? 'is' : 'are'} not in your saved memory — please treat ${one ? 'it' : 'them'} as an assumption, not a recalled fact.*`;
          }
        }

        // Add assistant response to history (maintains context for next turn) and persist
        history.push({ role: 'assistant', content: finalContent });
        persistMessage(server.localConfig.dataDir, effectiveWorkspace, sessionId, { role: 'assistant', content: finalContent });

        // Send the done event with full response + model info + per-message cost
        const messageCost = result.usage
          ? costTracker.calculateCost(result.usage.inputTokens, result.usage.outputTokens, resolvedModel)
          : undefined;
        sendEvent('done', {
          content: finalContent,
          usage: result.usage,
          toolsUsed: result.toolsUsed,
          model: resolvedModel,
          ...(messageCost !== undefined && {
            cost: Math.round(messageCost * 1_000_000) / 1_000_000,
            tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
          }),
        });

        // Waggle Dance: emit agent completion signal
        emitWaggleSignal({
          type: 'agent:completed',
          workspaceId: effectiveWorkspace,
          content: `Completed: ${(result.toolsUsed ?? []).length} tools used, ${result.usage?.outputTokens ?? 0} tokens`,
          metadata: { model: resolvedModel, toolsUsed: result.toolsUsed, cost: messageCost },
        });

        // Enriched so the notification identifies which agent/workspace/task and
        // deep-links to the output (was a generic "Your agent has completed the task").
        const wsName =
          server.agentState.listWorkspaces?.().find((w) => w.id === effectiveWorkspace)?.name ??
          effectiveWorkspace;
        const agentName = personaOverride ? (resolvePersona(personaOverride)?.name ?? 'Agent') : 'Agent';
        const toolCount = (result.toolsUsed ?? []).length;
        emitNotification(server, {
          title: `${agentName} finished in ${wsName}`,
          body: toolCount > 0
            ? `${resolvedModel} · ${toolCount} tool${toolCount === 1 ? '' : 's'} used`
            : `${resolvedModel} · response ready`,
          category: 'agent',
          actionUrl: `/workspaces/${effectiveWorkspace}/chat`,
        });
      }
    } catch (err) {
      // H-07 G4: finalize aborted trace so the evolution dataset builder can
      // mine it as a negative example. Without this the row stays 'pending'
      // and GEPA never sees it — starving the loop of counterexamples.
      if (traceRecorder && traceHandle && !traceFinalized) {
        try {
          const errMsg = err instanceof Error ? err.message : String(err);
          traceRecorder.finalize(traceHandle, {
            outcome: 'abandoned',
            output: '',
            correctionFeedback: errMsg.slice(0, 500),
          });
          traceFinalized = true;
        } catch { /* best-effort */ }
      }
      // Send user-friendly error event — never show raw traces
      let errorMessage: string;
      if (err instanceof Error) {
        // Clean up common error messages for the user
        if (err.message.includes('ECONNREFUSED')) {
          errorMessage = 'Could not reach the AI model. Check that your API key is configured in Settings.';
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          errorMessage = 'API key is invalid or expired. Update it in Settings > API Keys.';
        } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
          errorMessage = 'The request timed out. The model may be overloaded — try again in a moment.';
        } else if (err.message.includes('context_length') || err.message.includes('too many tokens')) {
          errorMessage = 'The conversation is too long for the model. Try clearing the chat and starting fresh.';
        } else {
          errorMessage = err.message;
        }
      } else {
        errorMessage = 'Something went wrong. Try sending your message again.';
      }
      // Send clean error to user — don't leak raw recalled context (contains system prompt instructions)
      sendEvent('error', { message: errorMessage });

      // Persist the assistant-side failure as a real conversation turn. The UI
      // already shows the SSE error while the stream is live, but without this
      // saved message a refresh or /api/history call loses the assistant outcome
      // and the next turn lacks the failure context.
      if (activeHistory && activeWorkspaceId && activeSessionId) {
        const assistantError = `${GENERATION_FAILED_PREFIX}${errorMessage}`;
        try {
          activeHistory.push({ role: 'assistant', content: assistantError });
          persistMessage(server.localConfig.dataDir, activeWorkspaceId, activeSessionId, {
            role: 'assistant',
            content: assistantError,
          });
        } catch (persistErr) {
          log.warn('[chat] assistant error persistence failed:', persistErr instanceof Error ? persistErr.message : String(persistErr));
        }
      }

      // #3 (launch-blocker): memory capture MUST NOT depend on generation
      // success. On the happy path the write-back at ~L1410 captures the
      // exchange; when the model call fails that never runs, so the user's
      // turn would be lost from memory ("remembers everything" broken). Persist
      // the raw turn directly here — NOT via the conservative pattern-write-back
      // (which may extract nothing) — so it's recallable (keyword half of
      // HybridSearch now; embedded on the next cognify/distill pass). The 8-char
      // floor skips trivial acks ("ok", "thanks"). Best-effort: a persistence
      // failure must never mask the original error or break the SSE stream.
      if (activeSessionOrch && message.trim().length >= 8) {
        try {
          const frames = activeSessionOrch.getFrames();
          const sessions = activeSessionOrch.getSessions();
          const active = sessions.getActive();
          const gopId = active.length > 0 ? active[0].gop_id : sessions.create().gop_id;
          const latestI = frames.getLatestIFrame(gopId);
          if (latestI) frames.createPFrame(gopId, message, latestI.id, 'normal', 'user_stated');
          else frames.createIFrame(gopId, message, 'normal', 'user_stated');
          log.info('[chat] persisted raw user turn to memory despite generation failure');
        } catch (persistErr) {
          log.warn('[chat] raw-turn persistence on error path failed:', persistErr instanceof Error ? persistErr.message : String(persistErr));
        }
      }
    } finally {
      // SEC: drop the request-scoped spawn security context. It must not leak
      // into a later run, which could otherwise apply a stale workspace's
      // governance / persona restrictions to a freshly spawned sub-agent.
      server.agentState.spawnSecurityContext = null;
      // Review Critical #2: defensive cleanup for the pre:tool hook. The happy path
      // already unregisters and sets to undefined; this guarantees we never leak the
      // hook into the shared hookRegistry on any exception path.
      if (unregisterHook) {
        try { unregisterHook(); } catch { /* registry already torn down — ignore */ }
      }
      // H-07 G4: defensive trace finalization. Catches SSE-disconnect and any
      // exotic exit path where the outer catch didn't run. Outcome stays
      // 'abandoned' because we don't know if the agent produced a usable
      // output — the correction-detector can upgrade it later if appropriate.
      if (traceRecorder && traceHandle && !traceFinalized) {
        try {
          traceRecorder.finalize(traceHandle, { outcome: 'abandoned', output: '' });
          traceFinalized = true;
        } catch { /* best-effort */ }
      }
    }

    // End the SSE stream
    raw.end();
  });

  // DELETE /api/chat/history — clear session history AND all per-session in-process state.
  // Review Major #6: previously only sessionHistories was evicted. The other Maps
  // (systemPromptCache, compressionSummaries, sessionToolSequences) grew unbounded
  // across the sidecar's lifetime, compounding in heavy-use instances.
  server.delete<{
    Querystring: { session?: string };
  }>('/api/chat/history', async (request, reply) => {
    const sessionId = request.query.session ?? 'default';
    sessionHistories.delete(sessionId);
    systemPromptCache.delete(sessionId);
    compressionSummaries.delete(sessionId);
    sessionToolSequences.delete(sessionId);
    return reply.send({ ok: true, cleared: sessionId });
  });
};
