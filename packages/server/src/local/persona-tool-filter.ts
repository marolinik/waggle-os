/**
 * Per-turn persona tool policy for the local chat route.
 *
 * Extracted from routes/chat.ts so the closed-learning-loop guarantee is
 * unit-testable: the persona-filter block in chat.ts is gated on
 * `!hasCustomRunner`, and test harnesses inject a custom runner — so a route
 * test cannot reach it. Lifting the policy here lets us assert the behavior
 * directly (and lock it against regression at the exact break point).
 */

import { READONLY_TOOLS, type ToolDefinition, type AgentPersona } from '@waggle/agent';

/**
 * Tools that survive a persona's allowlist regardless of what the persona
 * declares — memory, discovery, planning, and (critically) the skill
 * read+write tools.
 *
 * The closed-learning-loop (skill-distillation + behavioral-spec) nudges the
 * model to call `create_skill` after a successful multi-tool workflow. If
 * `create_skill` is stripped by the persona allowlist the loop half-fires:
 * `search_skills` succeeds but authoring fails with tool-not-found, so the
 * agent can never distil a workflow into a reusable skill. Keeping the
 * write-side skill tools here is the single lever that fixes every persona.
 * Read-only personas re-block the write-side via READ_ONLY_WRITE_TOOLS below.
 */
export const ALWAYS_AVAILABLE_TOOLS: ReadonlySet<string> = new Set([
  'search_memory', 'save_memory', 'get_identity', 'get_awareness', 'query_knowledge',
  'add_task', 'correct_knowledge', 'list_skills', 'search_skills', 'suggest_skill',
  'acquire_capability', 'install_capability',
  // Write-side skill tools — required for the self-evolving loop to close.
  'create_skill', 'read_skill', 'delete_skill',
  'compose_workflow', 'create_plan', 'add_plan_step', 'execute_step', 'show_plan',
]);

/**
 * Write tools stripped for read-only personas (planner / verifier), even when
 * they would otherwise be always-available. `read_skill` is a read and stays.
 *
 * NOTE (SEC): this denylist is retained for documentation + back-compat only.
 * The read-only strip below is now an ALLOWLIST (READ_ONLY_ALLOWED_TOOLS): a
 * denylist silently leaks any write tool not enumerated here (add_task,
 * create_plan, add_plan_step, compose_workflow, execute_step … did leak), and
 * every future write tool would leak too. "No write tools ever" only holds when
 * we allow known reads and drop everything else.
 */
export const READ_ONLY_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'write_file', 'edit_file', 'git_commit', 'git_push', 'git_merge',
  'save_memory', 'correct_knowledge', 'generate_docx', 'install_capability',
  'spawn_agent', 'execute_step', 'bash',
  // Skill authoring is a write — read-only personas must not create/delete skills.
  'create_skill', 'delete_skill',
]);

/**
 * The ONLY tools a read-only persona (planner / verifier) may keep. Anything
 * not in this set is stripped — so a new write tool cannot silently leak into a
 * "no writes ever" persona. Built from the canonical READONLY_TOOLS set in
 * @waggle/agent plus `read_skill` (reading a skill is a read).
 */
export const READ_ONLY_ALLOWED_TOOLS: ReadonlySet<string> = new Set<string>([
  ...READONLY_TOOLS,
  'read_skill',
  // Plan authoring is read-only-safe: create_plan / add_plan_step only build an
  // in-memory Plan object in a closure (plan-tools.ts — no db/fs/persistence),
  // exactly like show_plan (already in READONLY_TOOLS). Keeping them here lets
  // the isReadOnly `planner` persona actually author plans — its whole purpose —
  // while the genuine writes it disallows (execute_step, write_file, save_memory,
  // add_task, compose_workflow) remain stripped.
  'create_plan', 'add_plan_step',
]);

/**
 * Apply a persona's tool policy:
 *   1. Allowlist — declared tools + always-available (only when the persona
 *      declares any tools; an empty `tools` array means "no narrowing").
 *   2. Denylist — `disallowedTools` wins over the allowlist AND always-available.
 *   3. Read-only strip — read-only personas keep ONLY known read tools
 *      (allowlist intersect); every write tool is dropped.
 *
 * Pure: returns a filtered copy, never mutates the input array.
 */
export function applyPersonaToolFilter(
  tools: ToolDefinition[],
  persona: AgentPersona,
): ToolDefinition[] {
  let out = tools;

  if (persona.tools.length > 0) {
    const allowed = new Set([...persona.tools, ...ALWAYS_AVAILABLE_TOOLS]);
    out = out.filter(t => allowed.has(t.name));
  }

  if (persona.disallowedTools?.length) {
    const denied = new Set(persona.disallowedTools);
    out = out.filter(t => !denied.has(t.name));
  }

  if (persona.isReadOnly) {
    // Allowlist, not denylist: a read-only persona keeps only enumerated reads,
    // so unlisted writes (add_task, create_plan, compose_workflow, …) and any
    // future write tool are stripped rather than silently leaking.
    out = out.filter(t => READ_ONLY_ALLOWED_TOOLS.has(t.name));
  }

  return out;
}

/**
 * Persona policy for MCP tools (steal #6 — the first time MCP tools enter the
 * pool). Unlike built-ins, MCP tool names (`mcp_<server>_<tool>`) are dynamic
 * and never appear in a persona's static `tools` allowlist — so running them
 * through the allowlist above would strip every MCP tool for any persona that
 * declares an allowlist. Instead MCP tools bypass the allowlist but still honor
 * the two safety rails:
 *   - `disallowedTools` (explicit denylist) is enforced.
 *   - read-only personas (planner / verifier) get NO MCP tools — external MCP
 *     actions are unknown-capability, so they're dropped wholesale, matching the
 *     "no write tools ever" allowlist philosophy for READ_ONLY_ALLOWED_TOOLS.
 *
 * Pure: returns a filtered copy, never mutates the input array.
 */
export function filterMcpToolsForPersona(
  tools: ToolDefinition[],
  persona: AgentPersona,
): ToolDefinition[] {
  if (persona.isReadOnly) return [];
  if (persona.disallowedTools?.length) {
    const denied = new Set(persona.disallowedTools);
    return tools.filter(t => !denied.has(t.name));
  }
  return tools;
}

export const DEFAULT_TURN_TOOL_LIMIT = 14;
export const DEFAULT_TURN_SCHEMA_CHAR_LIMIT = 8_000;

export interface TurnToolSelectionOptions {
  message: string;
  recentMessages?: readonly { role: string; content: string }[];
  preferredToolNames?: readonly string[];
  recentToolNames?: readonly string[];
  mandatoryToolNames?: readonly string[];
  externalToolNames?: readonly string[];
  maxTools?: number;
  maxSchemaChars?: number;
}

export interface TurnToolSelectionResult {
  tools: ToolDefinition[];
  schemaChars: number;
  omittedCount: number;
}

interface IntentBundle {
  pattern: RegExp;
  tools: readonly string[];
}

const ACTION_PATTERN = /\b(create|build|draft|write|read|edit|modify|make|generate|export|download|analy[sz]e|research|investigate|find|search|look up|run|execute|fix|debug|test|validate|verify|inspect|review|prepare|plan|schedule|remind|send|post|commit|push|pull|merge|delegate|coordinate|orchestrate|browse|navigate|open|click|fill|remember|recall|save|calculate|model|transform|query|design|implement|compile|lint|refactor|summarize|check)\b/i;
const CONTINUATION_PATTERN = /\b(continue|proceed|do it|go ahead|yes,? please|next step|same again|retry|try again|carry on)\b/i;

const INTENT_BUNDLES: readonly IntentBundle[] = [
  {
    pattern: /\b(code|repo(?:sitory)?|bug|fix|debug|test|build|compile|typecheck|lint|refactor|implement(?:ation)?|typescript|javascript|sql|etl|pipeline|diagnostic|verif(?:y|ication)|verdict)\b/i,
    tools: [
      'search_files', 'search_content', 'read_file', 'bash', 'run_code',
      'lsp_diagnostics', 'git_diff', 'git_status', 'edit_file', 'multi_edit',
      'write_file', 'lsp_definition', 'lsp_references', 'lsp_hover',
    ],
  },
  {
    pattern: /\b(research|investigate|source|sources|citation|cite|current|latest|docs?|documentation|web|internet|online|benchmark)\b/i,
    tools: [
      'search_memory', 'perplexity_search', 'tavily_search', 'brave_search',
      'web_search', 'web_fetch', 'read_file', 'query_knowledge',
    ],
  },
  {
    pattern: /\b(spreadsheet|excel|xlsx|workbook|runway|budget|cash flow|financial model|sensitivity)\b/i,
    tools: ['generate_xlsx', 'read_file', 'search_memory', 'run_code'],
  },
  {
    pattern: /\b(memo|report|brief|proposal|article|docx|word|document|draft|write|export)\b/i,
    tools: ['search_memory', 'read_file', 'generate_docx', 'write_file', 'edit_file', 'generate_pdf'],
  },
  {
    pattern: /\b(plan|roadmap|steps?|dependencies|milestones?|project|timeline)\b/i,
    tools: ['create_plan', 'add_plan_step', 'show_plan', 'execute_step', 'compose_workflow'],
  },
  {
    pattern: /\b(schedule|calendar|remind|recurring|cron|appointment|meeting time)\b/i,
    tools: ['create_schedule', 'list_schedules', 'delete_schedule', 'trigger_schedule'],
  },
  {
    pattern: /\b(agent|delegate|parallel|coordinator|coordinate|workflow|orchestrate|specialist|worker|synthesi[sz]e)\b/i,
    tools: [
      'spawn_agent', 'list_agents', 'get_agent_result', 'compose_workflow',
      'orchestrate_workflow', 'list_harnesses', 'run_harness',
    ],
  },
  {
    pattern: /\b(git|commit|branch|stash|push|pull|merge|diff|pr|repository history)\b/i,
    tools: [
      'git_status', 'git_diff', 'git_log', 'git_branch', 'git_stash',
      'git_pull', 'git_commit', 'git_push', 'git_merge', 'git_pr',
    ],
  },
  {
    pattern: /\b(browser|page|website|navigate|screenshot|click|form|fill|dom)\b/i,
    tools: [
      'browser_navigate', 'browser_snapshot', 'browser_screenshot',
      'browser_click', 'browser_fill', 'browser_evaluate',
    ],
  },
  {
    pattern: /\b(remember|recall|previous|prior notes?|saved memory|what did we|what do you remember|decision history)\b/i,
    tools: ['search_memory', 'search_all_workspaces', 'query_knowledge', 'get_identity', 'get_awareness', 'save_memory'],
  },
  {
    pattern: /\b(connector|integration|slack|notion|github|gitlab|postgres|email|gmail|outlook|calendar)\b/i,
    tools: ['find_connector', 'list_connector_categories'],
  },
];

const TOKEN_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'for', 'from',
  'give', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our',
  'please', 'that', 'the', 'their', 'this', 'to', 'use', 'what', 'when', 'where',
  'which', 'with', 'you', 'your', 'tool', 'tools', 'plugin', 'mcp', 'function',
  'input', 'object', 'properties', 'property', 'required', 'string', 'task',
]);

function tokensOf(value: string): Set<string> {
  const tokens = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(tokens.filter(token => token.length > 1 && !TOKEN_STOPWORDS.has(token)));
}

function overlapCount(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function toOpenAiTool(tool: ToolDefinition): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: {},
        ...tool.parameters,
      },
    },
  };
}

/** Exact serialized character count for the schema array sent by agent-loop. */
export function measureOpenAiToolSchemaChars(tools: readonly ToolDefinition[]): number {
  return JSON.stringify(tools.map(toOpenAiTool)).length;
}

/**
 * Deterministically select the smallest useful subset of an already-authorized
 * tool pool. This function can only subtract: it never creates or restores a
 * tool removed by persona, availability, schedule, or governance policy.
 */
export function selectToolsForTurn(
  eligibleTools: readonly ToolDefinition[],
  options: TurnToolSelectionOptions,
): TurnToolSelectionResult {
  const maxTools = Number.isFinite(options.maxTools)
    ? Math.max(0, Math.floor(options.maxTools ?? DEFAULT_TURN_TOOL_LIMIT))
    : DEFAULT_TURN_TOOL_LIMIT;
  const maxSchemaChars = Number.isFinite(options.maxSchemaChars)
    ? Math.max(2, Math.floor(options.maxSchemaChars ?? DEFAULT_TURN_SCHEMA_CHAR_LIMIT))
    : DEFAULT_TURN_SCHEMA_CHAR_LIMIT;

  const deduplicated: Array<{ tool: ToolDefinition; index: number }> = [];
  const seenNames = new Set<string>();
  for (let index = 0; index < eligibleTools.length; index += 1) {
    const candidate = eligibleTools[index];
    if (seenNames.has(candidate.name)) continue;
    seenNames.add(candidate.name);
    deduplicated.push({ tool: candidate, index });
  }

  const message = options.message.toLowerCase();
  const messageTokens = tokensOf(message);
  const isContinuation = CONTINUATION_PATTERN.test(message);
  const isAction = ACTION_PATTERN.test(message) || isContinuation;
  const matchedIntents = isAction
    ? INTENT_BUNDLES.filter(bundle => bundle.pattern.test(message))
    : [];
  const preferred = new Set(options.preferredToolNames ?? []);
  const mandatory = new Set(options.mandatoryToolNames ?? []);
  const external = new Set(options.externalToolNames ?? []);
  const recent = new Set(Array.from(new Set(options.recentToolNames ?? [])).slice(-4));
  const historyTokens = tokensOf(
    (options.recentMessages ?? []).slice(-4).map(entry => entry.content).join(' '),
  );

  const ranked: Array<{ tool: ToolDefinition; index: number; score: number }> = [];
  for (const { tool, index } of deduplicated) {
    const normalizedName = tool.name.toLowerCase();
    const nameTokens = tokensOf(normalizedName);
    const metadataTokens = tokensOf(`${tool.description} ${JSON.stringify(tool.parameters)}`);
    const exactName = message.includes(normalizedName);
    const currentNameOverlap = isAction ? overlapCount(messageTokens, nameTokens) : 0;
    const currentMetadataOverlap = isAction ? overlapCount(messageTokens, metadataTokens) : 0;
    const historyNameOverlap = isAction ? overlapCount(historyTokens, nameTokens) : 0;
    const historyMetadataOverlap = isAction ? overlapCount(historyTokens, metadataTokens) : 0;

    let score = 0;
    let relevant = false;
    if (exactName) {
      score += 10_000;
      relevant = true;
    }
    if (mandatory.has(tool.name)) {
      score += 9_000;
      relevant = true;
    }
    for (const bundle of matchedIntents) {
      const bundleIndex = bundle.tools.indexOf(tool.name);
      if (bundleIndex >= 0) {
        score += 1_000 - bundleIndex;
        relevant = true;
      }
    }
    if (currentNameOverlap > 0) {
      score += currentNameOverlap * 200;
      relevant = true;
    }
    if (currentMetadataOverlap > 0) {
      score += currentMetadataOverlap * 20;
      relevant = true;
    }
    if (isAction && recent.has(tool.name)) {
      score += 150;
      relevant = true;
    }
    if (historyNameOverlap > 0) {
      score += historyNameOverlap * 50;
      relevant = true;
    }
    if (historyMetadataOverlap > 0) {
      score += historyMetadataOverlap * 5;
      relevant = true;
    }

    // External plugin/MCP schemas are unknown-capability actions. Description
    // overlap alone is not enough to expose them: require an explicit name/name
    // token match, a mandatory eligible tool, or recent continuation.
    if (external.has(tool.name)) {
      const explicitExternal = exactName
        || currentNameOverlap > 0
        || mandatory.has(tool.name)
        || (isContinuation && recent.has(tool.name));
      if (!explicitExternal) relevant = false;
    }

    if (!relevant) continue;
    if (preferred.has(tool.name)) score += 1;
    ranked.push({ tool, index, score });
  }

  ranked.sort((left, right) => right.score - left.score || left.index - right.index);

  const selected: ToolDefinition[] = [];
  let schemaChars = 2;
  for (const candidate of ranked) {
    if (selected.length >= maxTools) break;
    const encodedLength = JSON.stringify(toOpenAiTool(candidate.tool)).length;
    const projected = selected.length === 0
      ? 2 + encodedLength
      : schemaChars + 1 + encodedLength;
    if (projected > maxSchemaChars) continue;
    selected.push(candidate.tool);
    schemaChars = projected;
  }

  return {
    tools: selected,
    schemaChars,
    omittedCount: eligibleTools.length - selected.length,
  };
}
