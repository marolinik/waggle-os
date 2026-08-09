import type { ToolDefinition } from './tools.js';

const CODE_TOOLS = new Set([
  'bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content',
  'git_status', 'git_diff', 'git_log', 'git_commit',
]);

const RESEARCH_TOOLS = new Set([
  'web_search', 'web_fetch', 'search_memory', 'get_identity', 'get_awareness',
  'query_knowledge', 'read_file', 'search_files', 'search_content',
  // Connector discovery is research-flavored — the agent needs it when
  // the user asks what integrations exist or how to plug in a service.
  'find_connector', 'list_connector_categories',
]);

export type ToolContext = 'general' | 'code' | 'research';

export interface ToolFilterConfig {
  enabled_tools?: string[];
  disabled_tools?: string[];
}

export function filterToolsForContext(
  tools: ToolDefinition[],
  context: ToolContext,
  config?: ToolFilterConfig,
): ToolDefinition[] {
  let filtered: ToolDefinition[];

  if (config?.enabled_tools) {
    const allowed = new Set(config.enabled_tools);
    filtered = tools.filter(t => allowed.has(t.name));
  } else if (context === 'code') {
    filtered = tools.filter(t => CODE_TOOLS.has(t.name));
  } else if (context === 'research') {
    filtered = tools.filter(t => RESEARCH_TOOLS.has(t.name));
  } else {
    filtered = [...tools];
  }

  if (config?.disabled_tools) {
    const disabled = new Set(config.disabled_tools);
    filtered = filtered.filter(t => !disabled.has(t.name));
  }

  return filtered;
}

/**
 * Dynamic availability filter — runs each tool's checkAvailability function
 * and excludes tools that return false.
 *
 * Tools without checkAvailability are always included.
 * Catches exceptions in checkAvailability (treats as unavailable).
 */
export function filterAvailableTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(t => {
    if (!t.checkAvailability) return true;
    try {
      return t.checkAvailability();
    } catch {
      return false; // Broken check = unavailable
    }
  });
}

/**
 * PM-6: Filter tools to only those that work offline (no LLM needed).
 * Returns tools where offlineCapable is explicitly true.
 */
export function filterOfflineTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(t => t.offlineCapable === true);
}

/**
 * PM-6: Get the list of tool names that are offline-capable.
 */
export function getOfflineCapableToolNames(tools: ToolDefinition[]): string[] {
  return tools.filter(t => t.offlineCapable === true).map(t => t.name);
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
  /** External tools matched by semantic retrieval for this turn. */
  retrievedToolNames?: readonly string[];
  maxTools?: number;
  maxSchemaChars?: number;
  /** Keep a bounded authorized pool for delegated tasks with terse instructions. */
  fallbackToEligible?: boolean;
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

const ACTION_PATTERN = /\b(use|using|call|invoke|create|build|draft|write|read|edit|modify|make|generate|export|download|analy[sz]e|research|investigate|find|search|look up|run|execute|fix|debug|test|validate|verify|inspect|review|prepare|plan|schedule|remind|send|post|commit|push|pull|merge|delegate|coordinate|orchestrate|browse|navigate|open|click|fill|remember|recall|save|calculate|model|transform|query|design|implement|compile|lint|refactor|summarize|check)\b/i;
const CONTINUATION_PATTERN = /\b(continue|proceed|do it|go ahead|yes,? please|next step|same again|retry|try again|carry on)\b/i;
const NEGATED_TOOL_VERB_SOURCE = String.raw`(?:use|using|call|calling|invoke|invoking|create|creating|write|writing|edit|editing|read|reading|browse|browsing|search|searching|schedule|scheduling|send|sending|post|posting|commit|committing|push|pushing|delete|deleting|remove|removing|run|running|execute|executing)`;
const NEGATED_TOOL_NOUN_SOURCE = String.raw`(?:calculator(?:\s+(?:tool|plugin))?|tools?|files?|documents?|artifacts?|workbooks?|spreadsheets?|xlsx|code|python|scripts?)`;
const POSITIVE_TOOL_CLAUSE_RESUME_SOURCE = String.raw`(?:\b(?:but|however|instead|then)\b|\band\s+(?=(?:please\s+)?${ACTION_PATTERN.source}))`;
const NEGATED_TOOL_CLAUSE_PATTERN = new RegExp(
  String.raw`\b(?:(?:(?:do\s+not|don't|don’t|never)\s+|without\s+)${NEGATED_TOOL_VERB_SOURCE}\b|without\s+(?:(?:the\s+)?use\s+of\s+)?(?:(?:an?|the|any)\s+)?${NEGATED_TOOL_NOUN_SOURCE}\b)(?:(?!${POSITIVE_TOOL_CLAUSE_RESUME_SOURCE})[^.;!?\r\n])*`,
  'giu',
);
const DIRECT_CALCULATION_PATTERN = /\b(?:calculate|compute)\b/i;
const CALCULATION_RELATION_PATTERN = /\b(?:divided by|multiplied by|plus|minus|times|sum of|difference between|ratio of|percent(?:age)? of)\b/i;
const RESEARCH_INTENT_PATTERN = /\b(research|investigate|find information|source|sources|citation|cite|current|latest|docs?|documentation|web|internet|online|benchmark)\b/i;
const EXPLICIT_CALCULATION_CAPABILITY_PATTERN = /\b(?:create|build|draft|write|read|edit|modify|make|generate|export|download|analy[sz]e|research|investigate|find|search|look up|run|execute|fix|debug|test|validate|verify|inspect|review|prepare|plan|schedule|remind|send|post|commit|push|pull|merge|delegate|coordinate|orchestrate|browse|navigate|open|click|fill|remember|recall|save|transform|query|design|implement|compile|lint|refactor|summarize|check|use|call|invoke|file|spreadsheet|workbook|xlsx|calculator|python|code|script|memory|database|web|internet|slack|email|calendar|connector|plugin|mcp)\b/i;
const EXPLICIT_CALCULATION_TOOL_PATTERN = /\b(?:file|spreadsheet|workbook|xlsx|calculator|python|code|script)\b/i;
const IMPLICIT_CALCULATION_TOOL_NAMES = new Set(['calculator', 'run_code', 'generate_xlsx']);

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
    pattern: RESEARCH_INTENT_PATTERN,
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

function positiveIntentText(value: string): string {
  return value.replace(NEGATED_TOOL_CLAUSE_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function isNegatedExecutionTool(tool: ToolDefinition, negatedClauses: readonly string[]): boolean {
  const name = tool.name.toLowerCase();
  return negatedClauses.some(clause => {
    const codeExecution = /\b(?:code|python|script)\b/i.test(clause)
      && /^(?:run_code|bash|cli_execute)$/.test(name);
    const calculator = /\bcalculator\b/i.test(clause) && /calculator/.test(name);
    return codeExecution || calculator;
  });
}

function hasInlineCalculationOperands(value: string): boolean {
  if (!DIRECT_CALCULATION_PATTERN.test(value)) return false;
  const operands = Array.from(
    value.matchAll(/(?:^|[^\p{L}\p{N}])([-+]?\d[\d,.]*)/gu),
    match => match[1].replace(/[,.]+$/, '').replace(/,/g, ''),
  );
  if (operands.length < 2) return false;
  if (CALCULATION_RELATION_PATTERN.test(value)) return true;
  return operands.some(operand => !/^(?:18|19|20|21)\d{2}$/.test(operand));
}

function isSelfContainedCalculation(value: string): boolean {
  if (!hasInlineCalculationOperands(value)) return false;
  if (RESEARCH_INTENT_PATTERN.test(value)) return false;
  if (EXPLICIT_CALCULATION_CAPABILITY_PATTERN.test(value)) return false;
  return true;
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

interface ToolSelectionMetadata {
  name: string;
  description: string;
  parametersJson: string;
  normalizedName: string;
  nameTokens: ReadonlySet<string>;
  metadataTokens: ReadonlySet<string>;
}

const TOOL_SELECTION_METADATA = new WeakMap<ToolDefinition, ToolSelectionMetadata>();

function selectionMetadata(tool: ToolDefinition): ToolSelectionMetadata {
  const cached = TOOL_SELECTION_METADATA.get(tool);
  const parametersJson = JSON.stringify(tool.parameters);
  if (cached
    && cached.name === tool.name
    && cached.description === tool.description
    && cached.parametersJson === parametersJson) {
    return cached;
  }

  const normalizedName = tool.name.toLowerCase();
  const metadata: ToolSelectionMetadata = {
    name: tool.name,
    description: tool.description,
    parametersJson,
    normalizedName,
    nameTokens: tokensOf(normalizedName),
    metadataTokens: tokensOf(`${tool.description} ${parametersJson}`),
  };
  TOOL_SELECTION_METADATA.set(tool, metadata);
  return metadata;
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

  const rawMessage = options.message.toLowerCase();
  const negatedClauses = [...rawMessage.matchAll(NEGATED_TOOL_CLAUSE_PATTERN)].map(match => match[0]);
  const message = positiveIntentText(rawMessage);
  const messageTokens = tokensOf(message);
  const isContinuation = CONTINUATION_PATTERN.test(message);
  const isAction = ACTION_PATTERN.test(message) || isContinuation;
  const matchedIntents = isAction
    ? INTENT_BUNDLES.filter(bundle => bundle.pattern.test(message))
    : [];
  const preferred = new Set(options.preferredToolNames ?? []);
  const mandatory = new Set(options.mandatoryToolNames ?? []);
  const external = new Set(options.externalToolNames ?? []);
  const retrieved = new Set(options.retrievedToolNames ?? []);
  const recent = new Set(Array.from(new Set(options.recentToolNames ?? [])).slice(-4));
  const suppressImplicitCalculationTools = hasInlineCalculationOperands(message)
    && !EXPLICIT_CALCULATION_TOOL_PATTERN.test(message);

  if (mandatory.size === 0 && isSelfContainedCalculation(message)) {
    return {
      tools: [],
      schemaChars: 2,
      omittedCount: deduplicated.length,
    };
  }

  const historyTokens = tokensOf(
    (options.recentMessages ?? []).slice(-4).map(entry => entry.content).join(' '),
  );

  const ranked: Array<{ tool: ToolDefinition; index: number; score: number }> = [];
  for (const { tool, index } of deduplicated) {
    if (!mandatory.has(tool.name) && isNegatedExecutionTool(tool, negatedClauses)) continue;
    if (suppressImplicitCalculationTools
      && IMPLICIT_CALCULATION_TOOL_NAMES.has(tool.name)
      && !mandatory.has(tool.name)) {
      continue;
    }
    const { normalizedName, nameTokens, metadataTokens } = selectionMetadata(tool);
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
    if (isAction && retrieved.has(tool.name)) {
      score += 500;
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

    if (external.has(tool.name)) {
      const explicitExternal = exactName
        || currentNameOverlap > 0
        || mandatory.has(tool.name)
        || (isAction && retrieved.has(tool.name))
        || (isContinuation && recent.has(tool.name));
      if (!explicitExternal) relevant = false;
    }

    if (!relevant) continue;
    if (preferred.has(tool.name)) score += 1;
    ranked.push({ tool, index, score });
  }

  if (ranked.length === 0 && options.fallbackToEligible) {
    for (const { tool, index } of deduplicated) {
      if (external.has(tool.name)) continue;
      if (suppressImplicitCalculationTools
        && IMPLICIT_CALCULATION_TOOL_NAMES.has(tool.name)
        && !mandatory.has(tool.name)) {
        continue;
      }
      ranked.push({ tool, index, score: preferred.has(tool.name) ? 1 : 0 });
    }
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
