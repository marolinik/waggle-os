/**
 * chat-helpers.ts — Pure helper functions and constants for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * These functions have ZERO dependencies on server state.
 */

import { isRemoteOllamaAlias } from '../provider-model-catalog.js';

// ── Regulated Content Detection ────────────────────────────────────────

/** Check whether a response contains substantive regulated content for a given persona domain */
export function isRegulatedContent(content: string, personaId: string): boolean {
  const domainKeywords: Record<string, string[]> = {
    'hr-manager': ['policy', 'employment', 'termination', 'onboarding', 'compliance', 'leave', 'compensation', 'benefits', 'grievance', 'disciplinary'],
    'legal-professional': ['contract', 'clause', 'liability', 'jurisdiction', 'compliance', 'regulation', 'statute', 'litigation', 'agreement', 'indemnity'],
    'finance-owner': ['budget', 'revenue', 'forecast', 'invoice', 'tax', 'profit', 'loss', 'roi', 'valuation', 'investment', 'cash flow'],
  };
  const keywords = domainKeywords[personaId];
  if (!keywords) return false;
  const lower = content.toLowerCase();
  const matches = keywords.filter(kw => lower.includes(kw));
  return matches.length >= 2;
}

// ── Retryable Error Detection (Model Pilot) ───────────────────────────

/** Check if an LLM error is transient and worth retrying with a fallback model. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (/\b(429|500|502|503|504)\b/.test(msg)) return true;
    if (msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('econnaborted')) return true;
    if (msg.includes('could not reach the model endpoint') || msg.includes('fetch failed')) return true;
    if (msg.includes('socket hang up') || msg.includes('network error') || msg.includes('timed out')) return true;
    if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
    if (msg.includes('overloaded') || msg.includes('capacity')) return true;
  }
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  return false;
}

/**
 * A configured local primary is a user privacy boundary. Budget optimization
 * may stay local, but it must never silently move the turn or its history to a
 * cloud model. Explicit model selection and configured failure fallback are
 * separate, user-controlled egress decisions.
 */
export function canUseBudgetModelWithoutCloudEgress(
  primaryModel: string,
  budgetModel: string,
): boolean {
  const primaryIsLocal = isOfflineOllamaModelReference(primaryModel);
  const budgetIsLocal = isOfflineOllamaModelReference(budgetModel);
  return !primaryIsLocal || budgetIsLocal;
}

export function isOfflineOllamaModelReference(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized.startsWith('ollama/')) return false;
  return !isRemoteOllamaAlias(normalized.slice('ollama/'.length));
}

// ── Ambiguity Detection (GAP-006) ──────────────────────────────────────

/** Action verbs that indicate clear user intent (case-insensitive start of message) */
export const ACTION_VERBS = [
  'search', 'find', 'create', 'write', 'read', 'edit', 'delete',
  'show', 'list', 'run', 'execute', 'generate', 'draft', 'plan',
  'research', 'review', 'analyze', 'help',
];
export const ACTION_VERB_PATTERN = new RegExp(`^(${ACTION_VERBS.join('|')})\\b`, 'i');

/**
 * Detect whether a user message is too brief/vague to act on confidently.
 * Returns true when the message is short and lacks clear intent signals.
 *
 * Exported for testing.
 */
export function isAmbiguousMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Must have fewer than 10 words
  const words = trimmed.split(/\s+/);
  if (words.length >= 10) return false;

  // Slash commands are never ambiguous
  if (trimmed.startsWith('/')) return false;

  // Questions are never ambiguous
  if (trimmed.includes('?')) return false;

  // File path patterns (contains "/" or "\" or ".ext")
  if (/[/\\]/.test(trimmed) || /\.\w{1,5}$/.test(trimmed) || /\.\w{1,5}\s/.test(trimmed)) return false;

  // URLs
  if (/https?:\/\//.test(trimmed) || /www\./.test(trimmed)) return false;

  // Starts with a common action verb
  if (ACTION_VERB_PATTERN.test(trimmed)) return false;

  return true;
}

// ── Contextual Cron Suggestion (IMP-004) ──────────────────────────────

export type TurnContextScope = 'default' | 'workspace-only' | 'supplied-only';

export interface TurnMutationPolicy {
  denyAllMutations: boolean;
  denyMemoryPersistence: boolean;
  denyFileWrites: boolean;
  denyCodeExecution: boolean;
  denyAgentLaunch: boolean;
  contextScope: TurnContextScope;
}

function withoutQuotedText(text: string): string {
  return text
    .replace(/"[^"\r\n]*"/g, ' ')
    .replace(/(?<![\p{L}\p{M}\p{N}_])'(?:[^'\r\n]|(?<=[\p{L}\p{M}\p{N}_])'(?=[\p{L}\p{M}\p{N}_]))*'(?![\p{L}\p{M}\p{N}_])/gu, ' ')
    .replace(/“[^”\r\n]*”/g, ' ')
    .replace(/‘(?:[^’\r\n]|(?<=[\p{L}\p{M}\p{N}_])’(?=[\p{L}\p{M}\p{N}_]))*’/gu, ' ');
}

/** Whether a response contract explicitly excludes every source except supplied evidence. */
export function isExclusiveSuppliedOnlyResponseRequest(message: string): boolean {
  const actionable = withoutQuotedText(message);
  const suppliedOnly = /\b(?:use only (?:the )?supplied|only supplied|supplied[_ -]only)\b/i.test(actionable)
    || (/\bevidenceScope\b/i.test(actionable)
      && /\bevidenceScope\s+["“'‘]supplied[_ -]only["”'’]/i.test(message));
  const exclusiveEnvelope = /\b(?:return|emit|respond with)\b[\s\S]{0,240}\b(?:exactly one|one)\b[\s\S]{0,180}\b(?:json|xml|envelope|payload)\b/i.test(actionable);
  const noSurroundingText = /\b(?:no text before or after|nothing (?:before or after|outside|else)|no surrounding (?:text|prose))\b/i.test(actionable);
  return suppliedOnly && exclusiveEnvelope && noSurroundingText;
}

const WORKSPACE_READ_TOOL_NAMES = new Set([
  'read_file',
  'search_files',
  'search_content',
]);

const FILE_WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'multi_edit',
  'generate_docx',
  'generate_xlsx',
  'generate_pptx',
  'generate_pdf',
  'git_branch',
  'git_stash',
  'git_pull',
  'git_commit',
  'git_push',
  'git_merge',
  'git_pr',
  'create_skill',
  'delete_skill',
  'install_capability',
  'acquire_capability',
  'bash',
  'run_code',
  'cli_execute',
  'execute_step',
  'spawn_agent',
  'compose_workflow',
  'orchestrate_workflow',
  'run_harness',
]);

const CODE_EXECUTION_TOOL_NAMES = new Set([
  'bash',
  'run_code',
  'cli_execute',
  'kill_task',
  'spawn_agent',
  'orchestrate_workflow',
  'run_harness',
  'execute_step',
]);

const AGENT_LAUNCH_TOOL_NAMES = new Set([
  'spawn_agent',
  'compose_workflow',
  'orchestrate_workflow',
  'run_harness',
  'execute_step',
]);

/**
 * Detect explicit user constraints that make a turn advisory/read-only.
 * Broad no-change clauses deny every agent mutation; a memory-specific clause
 * only denies durable memory writes. Quoted examples and object-scoped limits
 * such as "do not create a calendar event" are intentionally not broadened.
 */
export function classifyExplicitTurnMutationPolicy(message: string): TurnMutationPolicy {
  const actionable = withoutQuotedText(message);
  const mutationVerb = '(?:create|edit|modify|write|save|store|delete|remove|change|update|execute|run)';
  const broadDenial = new RegExp(
    `\\b(?:do not|don['’]t|never)\\s+${mutationVerb}`
      + `(?:\\s*(?:,|and|or)\\s*${mutationVerb})*`
      + '\\s+(?:anything(?:\\s+at\\s+all)?|any\\s+changes?)\\b',
    'i',
  ).test(actionable)
    || /\b(?:make|apply|perform)\s+no\s+(?:changes?|edits?|writes?|updates?)\b/i.test(actionable)
    || /\bwithout\s+(?:making|applying|performing)\s+(?:any\s+)?(?:changes?|edits?|updates?)\b/i.test(actionable)
    || /\b(?:do not|don['’]t|never)\s+take\s+any\s+actions?\b/i.test(actionable)
    || /\b(?:work|respond|operate|inspect|review)\s+(?:in\s+)?read[- ]only(?:\s+mode)?\b/i.test(actionable);

  const memoryDenial = /\b(?:do not|don['’]t|never)\s+remember\b/i.test(actionable)
    || /\b(?:do not|don['’]t|never)\s+(?:save|store|persist|write)\b[^.;!?\r\n]{0,60}\b(?:to|in|into)\s+(?:my\s+)?memory\b/i.test(actionable)
    || /\b(?:do not|don['’]t|never)\s+(?:save|store|persist)\s+(?:this|that|it|anything)\b/i.test(actionable);

  const fileDenial = /\b(?:do not|don['’]t|never)\s+(?:create|edit|modify|write|save|overwrite)(?:\s*(?:,|and|or)\s*(?:create|edit|modify|write|save|overwrite))*\s+(?:any\s+)?(?:files?|documents?|artifacts?)\b/i.test(actionable)
    || /\bwithout\s+(?:creating|editing|modifying|writing|saving|overwriting)\s+(?:any\s+)?(?:files?|documents?|artifacts?)\b/i.test(actionable);
  const codeExecutionDenial = /\b(?:do not|don['’]t|never)\b[^.;!?\r\n]{0,100}\b(?:execute|run)\s+(?:any\s+)?(?:code|commands?|scripts?|shell|bash|python)\b/i.test(actionable)
    || /\bwithout\b[^.;!?\r\n]{0,100}\b(?:executing|running)\s+(?:any\s+)?(?:code|commands?|scripts?|shell|bash|python)\b/i.test(actionable);
  const agentLaunchDenial = /\b(?:do not|don['’]t|never)\b[^.;!?\r\n]{0,100}\b(?:launch|spawn|start|run|delegate)\s+(?:any\s+)?(?:agents?|sub[- ]?agents?|workers?)\b/i.test(actionable)
    || /\bwithout\b[^.;!?\r\n]{0,100}\b(?:launching|spawning|starting|running|delegating)\s+(?:any\s+)?(?:agents?|sub[- ]?agents?|workers?)\b/i.test(actionable);

  const suppliedOnly = isExclusiveSuppliedOnlyResponseRequest(message)
    || /\b(?:use|consider|rely on)\s+only\s+(?:the\s+)?(?:supplied|provided|given|included)\s+(?:evidence|facts?|information|context|content|text|input|materials?)\b/i.test(actionable)
    || /\bonly\s+use\s+(?:the\s+)?(?:supplied|provided|given|included)\s+(?:evidence|facts?|information|context|content|text|input|materials?)\b/i.test(actionable);
  const workspaceOnly = /\b(?:inspect|review|analy[sz]e|search|read)\s+only\s+(?:within\s+)?(?:this|the)\s+(?:current\s+)?(?:virtual\s+)?workspace\b/i.test(actionable);

  const contextScope: TurnContextScope = suppliedOnly
    ? 'supplied-only'
    : workspaceOnly
      ? 'workspace-only'
      : 'default';

  return {
    denyAllMutations: broadDenial,
    denyMemoryPersistence: broadDenial || memoryDenial,
    denyFileWrites: broadDenial || fileDenial,
    denyCodeExecution: broadDenial || codeExecutionDenial,
    denyAgentLaunch: broadDenial || agentLaunchDenial,
    contextScope,
  };
}

/**
 * Detect a self-contained, explicitly non-executing advisory request. This is
 * intentionally narrower than generic read-only intent: any request for
 * workspace, memory, web, document, or tool evidence remains tool-capable.
 */
export function isExplicitToolFreeAdvisoryRequest(
  message: string,
  policy: TurnMutationPolicy = classifyExplicitTurnMutationPolicy(message),
): boolean {
  if (policy.contextScope !== 'default') return false;
  const actionable = withoutQuotedText(message).trim();
  if (!actionable) return false;

  const explicitlyNonExecuting = policy.denyAllMutations
    || (policy.denyFileWrites && (policy.denyCodeExecution || policy.denyAgentLaunch));
  if (!explicitlyNonExecuting) return false;
  const affirmative = actionable.replace(
    /\b(?:do not|don['\u2019]t|never|without)\b[^.?!;:\r\n]*?(?=\s*(?:,\s*(?=(?:but|however|yet|then|using|from|via|inspect|search|browse|read|open|list|scan|query|retrieve|recall|look up|find)\b)|[;:]|\bbut\b|\bhowever\b|\byet\b|\bbased on\b|[.?!]|$))/gi,
    ' ',
  );
  if (!/\b(?:design|decompose|outline|explain|compare|describe|discuss|teach|summari[sz]e|draft|prepare|propose|recommend|map|write|provide|produce|generate|implement)\b/i.test(affirmative)) {
    return false;
  }

  const technologyNameUsage = /\b(?:explain|design|generate|write|build|implement|discuss|compare|describe|teach)\b[^.?!\r\n]{0,120}[\s"'`](?:node|react|vue|next|nuxt|deno|bun)\.js["'`]?(?=$|[\s"'`,;:.!?])/i.test(message);
  const quotedFilenames = message.match(/["'`](?:[^"'`\r\n\\/]+[\\/])*[^"'`\r\n]+\.[A-Za-z0-9]{1,8}["'`]/gi) ?? [];
  const bareFilenames = message.match(/\b[a-z0-9_-][a-z0-9_.-]*\.[A-Za-z][A-Za-z0-9]{0,7}\b/gi) ?? [];
  const matchedFilenames = [...quotedFilenames, ...bareFilenames];
  const technologyFilenames = new Set(['node.js', 'react.js', 'vue.js', 'next.js', 'nuxt.js', 'deno.js', 'bun.js']);
  const onlyTechnologyFilenames = matchedFilenames.length > 0
    && matchedFilenames.every(name => technologyFilenames.has(name.replace(/^["'`]|["'`]$/g, '').toLowerCase()));
  const technologyFileIntent = /(?:\bfile\b[^.?!\r\n]{0,60}["'`]?(?:node|react|vue|next|nuxt|deno|bun)\.js|(?:node|react|vue|next|nuxt|deno|bun)\.js["'`]?[^.?!\r\n]{0,60}\bfile\b(?!\s+system\b))/i.test(message);
  const filenameEvidence = (matchedFilenames.length > 0
    && (!onlyTechnologyFilenames || !technologyNameUsage || technologyFileIntent))
    || /(?:^|[\s"'`])(?:Dockerfile|Makefile|Jenkinsfile|Procfile|README(?:\.[A-Za-z0-9_-]+)?|\.gitignore|\.gitattributes|\.npmrc|\.nvmrc|\.env(?:\.[A-Za-z0-9_-]+)?)(?=$|[\s"'`,;:.!?])/i.test(message);
  const methodExplanation = /\b(?:explain|describe|outline)\s+how\s+to\b/i.test(affirmative);
  const explicitLookup = /https?:\/\//i.test(affirmative)
    || /\b(?:search|browse|inspect|read|open|list|scan|query|retrieve|recall|look up|find)\b[^.?!\r\n]{0,100}\b(?:workspace|repo(?:sitory)?|codebase|files?|folders?|director(?:y|ies)|memor(?:y|ies)|history|notes?|web|internet|online|sources?|documents?|documentation)\b/i.test(affirmative)
    || /\b(?:current|existing|this|our|my|saved|previous|prior|attached|uploaded)\s+(?:workspace|repo(?:sitory)?|codebase|files?|folders?|director(?:y|ies)|memor(?:y|ies)|history|notes?|documents?|pdfs?|emails?|messages?|spreadsheets?|tickets?|records?|inbox|calendar|tasks?)\b/i.test(affirmative)
    || /\b(?:our|the|a)?\s*(?:previous|prior|earlier)\s+(?:conversation|discussion|messages?|chat)\b/i.test(affirmative)
    || /\b(?:latest|current|recent)\s+(?:online|web|external|release|documentation|docs?|sources?|news|pricing|benchmark)\b/i.test(affirmative)
    || (!methodExplanation && /\b(?:summari[sz]e|review|analy[sz]e|extract)\b[^.?!\r\n]{0,80}\b(?:external|online|web)\s+(?:sources?|documents?|data|evidence)\b/i.test(affirmative))
    || (!methodExplanation && /\b(?:design|recommend|propose|summari[sz]e|review|analy[sz]e|extract|prepare|produce|write|draft|provide)\b[^.?!\r\n]{0,100}\b(?:from|using|based on)\s+(?:the\s+)?(?:external|online|web)\s+(?:sources?|documents?|data|evidence)\b/i.test(affirmative))
    || /\b(?:cite|include|provide|link)\b[^.?!\r\n]{0,60}\b(?:sources?|citations?|references?|links?)\b/i.test(affirmative)
    || /\b(?:text|content|message|details?|information)\s+(?:above|earlier|previously)\b/i.test(affirmative)
    || /\b(?:current|open|existing|this|our|my|the)\s+(?:jira|linear|github|gitlab|salesforce|hubspot|airtable|workday|sap)\s+(?:issues?|tickets?|tasks?|records?|cases?|accounts?|deals?|pull\s+requests?|bases?|repositories|repos?|projects?|workspaces?|messages?|threads?|contacts?|opportunities)\b/i.test(affirmative)
    || (!methodExplanation && /\b(?:summari[sz]e|review|analy[sz]e|extract)\b[^.?!\r\n]{0,80}\b(?:jira|linear|github|gitlab|salesforce|hubspot|airtable|workday|sap)\s+(?:issues?|tickets?|tasks?|records?|cases?|accounts?|deals?|pull\s+requests?|bases?|repositories|repos?|projects?|workspaces?|messages?|threads?|contacts?|opportunities)\b/i.test(affirmative))
    || /\b(?:from|using|via|in)\s+(?:(?:my|our|the|a|an)\s+)?(?:slack|teams|email|outlook|notion|drive|calendar|jira|linear|github|gitlab|salesforce|hubspot|airtable|workday|sap|inbox|database|spreadsheet|document|file|workspace|repo(?:sitory)?)\b/i.test(affirmative)
    || /\b(?:based on|using|from)\s+(?:the\s+)?(?:attached|uploaded|saved|previous|prior)\b/i.test(affirmative)
    || /\b(?:use|call|invoke)\b[^.?!\r\n]{0,80}\b(?:tool|plugin|mcp|connector|calculator)\b/i.test(affirmative)
    || /\b(?:web_search|web_fetch|search_memory|read_file|search_files|search_content|bash|run_code|spawn_agent)\b/i.test(affirmative)
    || /\bgit\s+(?:status|diff|log|show|branch)\b/i.test(affirmative)
    || /(?:^|[.?!]\s*|[,;:\u2014]\s*|\b(?:and|then|also|but|however)\s+)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?(?:send|email|message|schedule|post|publish|upload|share|submit|book|create|delete|remove|update|launch|start|install|export|download|commit|push|merge(?!\s+criteria\b)|deploy)\b/i.test(affirmative)
    || /\b(?:once\s+(?:done|complete)|after(?:wards|\s+that)?)\b[^.?!\r\n]{0,40}\b(?:send|email|message|schedule|post|publish|upload|share|submit|book|create|delete|remove|update|launch|start|install|export|download|commit|push|merge|deploy)\b/i.test(affirmative)
    || /\b(?:that|this|it|them|these|those|same|rest|remaining|former|latter|above|earlier|previously|continue|continuing)\b/i.test(affirmative)
    || /\b(?:we|you)\s+(?:discussed|mentioned|agreed)\b/i.test(affirmative)
    || /\bfrom\s+before\b/i.test(affirmative)
    || /\b(?:attached|uploaded|below)\b/i.test(message)
    || /\b(?:customer|client|internal|external)\s+(?:email|message|thread|ticket|case|record|document|file)\b/i.test(affirmative)
    || /\b(?:using|from|via)\s+(?:the\s+)?[A-Z][A-Za-z0-9_-]*(?:\s+[A-Z][A-Za-z0-9_-]*){0,2}\s+(?:api|crm|database|dataset|records?|tickets?|messages?|inbox|calendar|documents?|files?|workspace|repo(?:sitory)?)\b/i.test(affirmative)
    || /\b(?:repository|repo|codebase|weather|news)\b/i.test(affirmative)
    || filenameEvidence
    || /(?:^|\s)[A-Za-z]:\\[^\s]+|(?:^|\s)\.?(?:\.\/|\.\\)[^\s]+/.test(message);
  return !explicitLookup;
}

const ADVISORY_REQUEST_PREFIX = String.raw`(?:^|[.?!]\s*)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?`;
const ADVISORY_PRODUCE_VERB = String.raw`(?:design|write|draft|prepare|produce|create|build|give|provide|return|generate|implement|include|show|compose)`;
const ADVISORY_SAME_SENTENCE = String.raw`(?:(?![?!]|\.(?:\s|$))[^\r\n])`;
const ADVISORY_CODE_ARTIFACT = String.raw`(?:code(?:\s+(?:example|sample|snippet|implementation))?|example|sample|snippet|script|program|implementation)`;
const ADVISORY_CODE_ARTIFACT_REQUEST = String.raw`${ADVISORY_REQUEST_PREFIX}${ADVISORY_PRODUCE_VERB}(?!\s+(?:about|why|how)\b)${ADVISORY_SAME_SENTENCE}{0,320}\b${ADVISORY_CODE_ARTIFACT}\b(?!\s+(?:plan|strategy|roadmap|guide|overview|approach|proposal)\b)`;
const ADVISORY_LENGTH_QUALIFIER = String.raw`(?:at most|at least|up to|no more than|no fewer than|no longer than|under|exactly|about|approximately|roughly)`;
const ADVISORY_OUTPUT_BOUND_END = String.raw`\b(?=\s*(?:$|[.?!;:](?:\s|$)|,\s*(?:please\b|if\s+possible\b|including\s+(?:comments?|documentation|docstrings?|tests?|examples?|type\s+annotations?)\b)|(?:or\s+(?:fewer|less)|(?:in\s+)?total)\s*(?:$|[.?!;:](?:\s|$))))`;
const COMPLETE_CODE_ARTIFACT = /\b(?:complete|runnable|executable|self-contained|syntactically valid|compil(?:able|es?)|all (?:required )?imports?)\b/i;
const NEGATED_COMPLETE_CODE_ARTIFACT = /\b(?:(?:not(?:\s+(?:necessarily|fully))?|need(?:s)?\s+not|does(?:n't| not)\s+(?:need|have)\s+to|needn['\u2019]t)\s+(?:(?:be\s+)?(?:complete|runnable|executable|self-contained|syntactically valid|compilable)|(?:include|have)\s+all (?:required )?imports?)|does(?:n't| not)\s+need\s+all (?:required )?imports?|not\s+(?:a\s+)?(?:complete|runnable|executable|self-contained|syntactically valid|compilable)(?:\s+one)?|without\s+(?:including\s+)?all (?:required )?imports?|non-(?:runnable|executable|self-contained|compilable))\b/i;
const CODE_ARTIFACT_REQUEST = new RegExp(ADVISORY_CODE_ARTIFACT_REQUEST, 'i');

function matchRequestedArtifactLength(
  message: string,
  unit: 'token' | 'word',
): RegExpMatchArray | null {
  const importTail = String.raw`(?:\s+(?:with|including)\s+all (?:required )?imports?)?`;
  const qualifiedLead = String.raw`(?:\s+(?:in|within)\s+(?:(?:${ADVISORY_LENGTH_QUALIFIER})\s+)?|\s+under\s+|\s+using\s+(?:${ADVISORY_LENGTH_QUALIFIER})\s+|\s+with\s+(?:a\s+)?maximum\s+of\s+|[\s,;:\u2014]+(?:(?:limited\s+to|capped\s+at|${ADVISORY_LENGTH_QUALIFIER})\s+))`;
  const qualifiedBound = message.match(new RegExp(
    String.raw`${ADVISORY_CODE_ARTIFACT_REQUEST}${importTail}${qualifiedLead}(\d{1,6})[ -]?${unit}s?${ADVISORY_OUTPUT_BOUND_END}`,
    'i',
  ));
  if (qualifiedBound) return qualifiedBound;
  return message.match(new RegExp(
    String.raw`${ADVISORY_CODE_ARTIFACT_REQUEST}${importTail}\s+(?:(?:and|with)\s+)?(?:a|an)\s+(\d{1,6})[ -]?${unit}s?\s+limit${ADVISORY_OUTPUT_BOUND_END}`,
    'i',
  ));
}

/** Bound self-contained advisory completions without treating subject adjectives as length intent. */
export function selectAdvisoryMaxOutputTokens(message: string): number {
  const requestedTokens = message.match(/(?:^|[.?!]\s*)(?:keep|limit|cap)\s+(?:the\s+)?(?:answer|response|reply|output)\s+(?:to|at|under|within|below|no more than|at most)\s+(\d{2,5})[ -]?tokens?\b/i)
    ?? message.match(/(?:^|[.?!]\s*)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?(?:write|draft|prepare|produce|create|give|provide|return|generate)\s+(?:(?:a|an|the)\s+)?(?:(?!(?:about|why|how)\b)[A-Za-z][\w-]*\s+){0,3}(\d{2,5})[ -]?token\s+(?:answer|response|reply|summary|report|plan|explanation|guide|output|memo|draft)\b/i)
    ?? message.match(/(?:^|[.?!]\s*)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?(?:answer|respond|reply|summari[sz]e|write|draft|explain|give|provide|return)\s+(?:(?:in)\s+|(?:(?:a|an|the)\s+)?(?:answer|response|reply|summary|report|plan|explanation|guide|output|memo|draft)\s+(?:of\s+)?)?(?:at most|at least|up to|no more than|no fewer than|under|within|exactly|about|approximately|roughly)\s+(\d{2,5})[ -]?tokens?\b/i)
    ?? matchRequestedArtifactLength(message, 'token');
  if (requestedTokens) {
    return Math.min(12_000, Math.max(256, Number.parseInt(requestedTokens[1], 10)));
  }
  const requestedWords = message.match(/(?:^|[.?!]\s*)(?:keep|limit|cap)\s+(?:the\s+)?(?:answer|response|reply|output)\s+(?:to|at|under|within|below|no more than|at most)\s+(\d{2,5})[ -]?words?\b/i)
    ?? message.match(/(?:^|[.?!]\s*)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?(?:write|draft|prepare|produce|create|give|provide|return|generate)\s+(?:(?:a|an|the)\s+)?(?:(?!(?:about|why|how)\b)[A-Za-z][\w-]*\s+){0,3}(\d{2,5})[ -]?word\s+(?:answer|response|reply|summary|report|plan|explanation|guide|output|memo|draft)\b/i)
    ?? message.match(/(?:^|[.?!]\s*)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?(?:answer|respond|reply|summari[sz]e|write|draft|explain|give|provide|return)\s+(?:(?:in)\s+|(?:(?:a|an|the)\s+)?(?:answer|response|reply|summary|report|plan|explanation|guide|output|memo|draft)\s+(?:of\s+)?)?(?:at most|at least|up to|no more than|no fewer than|under|within|exactly|about|approximately|roughly)\s+(\d{2,5})[ -]?words?\b/i)
    ?? matchRequestedArtifactLength(message, 'word');
  if (requestedWords) {
    const tokenEstimate = Math.ceil(Number.parseInt(requestedWords[1], 10) * 1.5);
    return Math.min(12_000, Math.max(256, tokenEstimate));
  }
  const completeCodeArtifact = CODE_ARTIFACT_REQUEST.test(message)
    && COMPLETE_CODE_ARTIFACT.test(message)
    && !NEGATED_COMPLETE_CODE_ARTIFACT.test(message);
  const briefAnswer = /\b(?:compact|concise|brief|short)\s+(?:answer|response|reply|summary|report|plan|explanation|output)\b/i.test(message)
    || /\b(?:answer|respond|reply|summari[sz]e)\b[^.?!\r\n]{0,40}\b(?:briefly|concisely)\b/i.test(message);
  return briefAnswer ? 2_500 : completeCodeArtifact ? 4_500 : 3_000;
}

/** Automatic recall is incompatible with an explicit evidence boundary. */
export function allowsAutomaticRecall(policy: TurnMutationPolicy): boolean {
  return allowsConversationHistory(policy);
}

/** Prior chat turns are ambient evidence and stay out of bounded requests. */
export function allowsConversationHistory(policy: TurnMutationPolicy): boolean {
  return policy.contextScope === 'default';
}

export function buildTurnMessageWindow(
  history: ReadonlyArray<{ role: string; content: string }>,
  currentUserMessage: string,
  policy: TurnMutationPolicy,
): Array<{ role: string; content: string }> {
  return allowsConversationHistory(policy)
    ? [...history]
    : [{ role: 'user', content: currentUserMessage }];
}

export interface TurnPersistencePermissions {
  allowMemoryPersistence: boolean;
  allowDerivedPersistence: boolean;
}

/** Keep learned/derived state out of bounded and persona-read-only turns. */
export function resolveTurnPersistencePermissions(options: {
  policy: TurnMutationPolicy;
  isAutomatedTurn: boolean;
  personaIsReadOnly: boolean;
  closedWorldRewrite?: boolean;
}): TurnPersistencePermissions {
  const readOnlyBoundary = options.isAutomatedTurn
    || options.personaIsReadOnly
    || options.closedWorldRewrite === true
    || options.policy.contextScope !== 'default';
  const allowMemoryPersistence = !readOnlyBoundary
    && !options.policy.denyMemoryPersistence;
  return {
    allowMemoryPersistence,
    allowDerivedPersistence: allowMemoryPersistence
      && !options.policy.denyAllMutations,
  };
}

/** Decorations can invalidate evidence-bounded exact response contracts. */
export function allowsPostResponseDecoration(
  policy: TurnMutationPolicy,
  closedWorldRewrite = false,
): boolean {
  return policy.contextScope === 'default' && !closedWorldRewrite;
}

/**
 * Apply request-scoped capability boundaries before any downstream selector.
 * External tools are withheld for granular restrictions because their effects
 * are not described by the local ToolDefinition metadata.
 */
export function filterToolsByTurnMutationPolicy<T extends { name: string }>(
  tools: T[],
  policy: TurnMutationPolicy,
  externalToolNames: ReadonlySet<string> = new Set<string>(),
): T[] {
  if (policy.contextScope === 'supplied-only') return [];
  if (policy.contextScope === 'workspace-only') {
    return tools.filter(tool => WORKSPACE_READ_TOOL_NAMES.has(tool.name)
      && !externalToolNames.has(tool.name));
  }

  const hasGranularRestriction = policy.denyFileWrites
    || policy.denyCodeExecution
    || policy.denyAgentLaunch;
  return tools.filter((tool) => {
    if (hasGranularRestriction && externalToolNames.has(tool.name)) return false;
    if (policy.denyMemoryPersistence && tool.name === 'save_memory') return false;
    if (policy.denyFileWrites && FILE_WRITE_TOOL_NAMES.has(tool.name)) return false;
    if (policy.denyCodeExecution && CODE_EXECUTION_TOOL_NAMES.has(tool.name)) return false;
    if (policy.denyAgentLaunch && AGENT_LAUNCH_TOOL_NAMES.has(tool.name)) return false;
    return true;
  });
}

/** Patterns indicating the user or agent discussed recurring/scheduled work */
const RECURRING_PATTERNS = /\b(every\s+day|daily|weekly|every\s+week|each\s+morning|every\s+morning|regularly|recurring|every\s+month|monthly)\b/i;

const SCHEDULE_OBJECT = /\b(?:schedules?|scheduling|recurring\s+tasks?|calendar\s+events?)\b|\/schedule\b/i;
const SCHEDULE_ACTION = /^(?:schedule|create|make|add|set\s+up|suggest|recommend|append|include|propose|offer|mention|use)\b/i;
const SCHEDULE_NEGATION_ESCAPE = /^(?:forget|avoid|cancel|remove|delete|stop)\b/i;

function hasExplicitScheduleProhibition(userMessage: string): boolean {
  const actionable = withoutQuotedText(userMessage);
  if (/^\s*no\s+schedule\s+suggestions?\b/i.test(actionable)) {
    return true;
  }
  if (/^\s*no\s+(?:schedules?|scheduling)\b(?:\s*(?:,|$)|[^.;!?\r\n]*\b(?:needed|required|please|just)\b)/i.test(actionable)) {
    return true;
  }
  if (/\bwithout\s+(?:creating|making|adding|setting\s+up|scheduling|suggesting|recommending|appending|including|proposing|offering|mentioning|using)\b[^.;!?\r\n]*\b(?:schedules?|recurring\s+tasks?|calendar\s+events?)\b|\bwithout\s+(?:using|suggesting|recommending|appending|including)\s+\/schedule\b/i.test(actionable)) {
    return true;
  }
  for (const match of actionable.matchAll(/\b(?:do not|don['’]t|never)\s+([^.;!?\r\n]+)/gi)) {
    const remainder = match[1].trim();
    if (SCHEDULE_NEGATION_ESCAPE.test(remainder)) continue;
    if (SCHEDULE_OBJECT.test(remainder) && SCHEDULE_ACTION.test(remainder)) return true;
  }
  return false;
}

/**
 * Check whether the agent response should get a scheduling suggestion appended.
 * Returns true when the response mentions recurring work AND no cron/schedule
 * tool was already invoked this turn.
 *
 * Exported for testing.
 */
export function shouldSuggestSchedule(
  responseText: string,
  toolsUsed: string[],
  userMessage: string,
): boolean {
  if (!responseText) return false;
  if (hasExplicitScheduleProhibition(userMessage)) return false;
  if (toolsUsed.some(t => t.includes('schedule') || t.includes('cron'))) return false;
  return RECURRING_PATTERNS.test(responseText);
}

export const SCHEDULE_SUGGESTION = '\n\n💡 *Want this to run automatically? Use /schedule or ask me to set up a recurring task.*';

/** Shared precedence rule for optional first-turn prompt additions. */
export const USER_RESPONSE_FORMAT_PRECEDENCE = 'A user-specified response syntax or shape is authoritative for presentation. Follow that syntax or shape exactly; do not add greetings, questions, prose, wrappers, labels, or other content outside it. Requested facts, verdicts, fixed values, or claims are not presentation constraints and never override safety, evidence, attribution, read-only, anti-fabrication, tool/action, or confidentiality rules.';

/** System prompt prefix injected for ambiguous messages. */
export const AMBIGUITY_PROMPT = `IMPORTANT: The user's message is very brief and may be vague. ${USER_RESPONSE_FORMAT_PRECEDENCE} If the user specified a response syntax or shape, express any essential clarification only within fields or content it allows. If it cannot represent clarification, emit a format-valid, truthful failure or refusal when possible; if not, the non-presentation rules above win. Otherwise, ask ONE specific clarifying question before taking any action. Do not generate documents, run tools, or take action without first understanding what the user wants. Start the default response with a question.\n\n`;

/** Build first-turn context for a templated workspace without overriding the user's output contract. */
export function buildTemplateWelcomePrompt(template: {
  name: string;
  description?: string;
  starterMemory?: string[];
}): string {
  let prompt = `\n\n# Workspace Template: ${template.name}\nThis workspace uses the "${template.name}" template. ${template.description ?? ''}\n${USER_RESPONSE_FORMAT_PRECEDENCE}\nWhen no response format is specified, greet the user with a warm, template-appropriate welcome that shows you understand their domain. When one is specified, omit the greeting unless the requested payload explicitly requires it.\n`;
  if (template.starterMemory?.length) {
    prompt += '\nStarter context:\n' + template.starterMemory.map((memory) => `- ${memory}`).join('\n') + '\n';
  }
  return prompt;
}

/** Generate a human-readable description of what a tool is doing */
export function describeToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'web_search':
      return `Searching the web for "${input.query ?? ''}"...`;
    case 'web_fetch':
      return `Reading web page: ${input.url ?? ''}...`;
    case 'search_memory':
      return `Searching memory for "${input.query ?? ''}"...`;
    case 'save_memory':
      return `Saving to memory...`;
    case 'get_identity':
      return `Checking identity...`;
    case 'get_awareness':
      return `Checking current awareness state...`;
    case 'query_knowledge':
      return `Querying knowledge graph...`;
    case 'add_task':
      return `Adding task: "${input.title ?? ''}"...`;
    case 'correct_knowledge':
      return `Updating knowledge graph...`;
    case 'bash':
      return `Running command: ${String(input.command ?? '').slice(0, 80)}...`;
    case 'read_file':
      return `Reading file: ${input.path ?? ''}...`;
    case 'write_file':
      return `Writing file: ${input.path ?? ''}...`;
    case 'edit_file':
      return `Editing file: ${input.path ?? ''}...`;
    case 'search_files':
      return `Searching for files matching "${input.pattern ?? ''}"...`;
    case 'search_content':
      return `Searching file contents for "${input.pattern ?? ''}"...`;
    case 'git_status':
      return `Checking git status...`;
    case 'git_diff':
      return `Checking git diff...`;
    case 'git_log':
      return `Checking git log...`;
    case 'git_commit':
      return `Creating git commit...`;
    case 'create_plan':
      return `Creating plan: "${input.title ?? ''}"...`;
    case 'add_plan_step':
      return `Adding plan step...`;
    case 'execute_step':
      return `Executing plan step...`;
    case 'show_plan':
      return `Showing current plan...`;
    case 'generate_docx':
      return `Generating document: ${input.path ?? ''}...`;
    case 'list_skills':
      return 'Checking installed skills...';
    case 'create_skill':
      return `Creating skill: ${input.name ?? ''}...`;
    case 'delete_skill':
      return `Deleting skill: ${input.name ?? ''}...`;
    case 'read_skill':
      return `Reading skill: ${input.name ?? ''}...`;
    case 'search_skills':
      return `Searching for skills: "${input.query ?? ''}"...`;
    case 'suggest_skill':
      return `Looking for relevant skills...`;
    case 'acquire_capability':
      return `Searching for capabilities: "${input.need ?? ''}"...`;
    case 'install_capability':
      return `Installing capability: ${input.name ?? ''}...`;
    case 'compose_workflow':
      return `Analyzing task and composing workflow plan...`;
    case 'orchestrate_workflow':
      return `Running workflow: ${input.template ?? input.inline_template ? 'inline' : ''}...`;
    case 'spawn_agent':
      return `Spawning sub-agent "${input.name ?? ''}" (${input.role ?? ''})...`;
    case 'list_agents':
      return 'Checking sub-agents...';
    case 'get_agent_result':
      return `Getting sub-agent result...`;
    // P7/D15 Track A review #4: gated tools that previously hit the generic
    // "Using <name>" default — git mutations, connector writes, cross-workspace
    // reads — so the A4 approval "description" is specific to the action.
    case 'git_push':
      return `Pushing commits to the remote...`;
    case 'git_merge':
      return `Merging branches...`;
    case 'git_pr':
      return `Opening a pull request...`;
    default:
      if (name.startsWith('connector_')) {
        // connector_<id>_<action> → "<action> via <id>"
        const rest = name.slice('connector_'.length);
        const us = rest.indexOf('_');
        const id = us > 0 ? rest.slice(0, us) : rest;
        const action = us > 0 ? rest.slice(us + 1).replace(/_/g, ' ') : 'action';
        return `${action} via ${id}...`;
      }
      if (name.startsWith('read_other_workspace') || name === 'list_workspace_files') {
        return `Accessing another workspace: ${input.target_workspace_id ?? input.workspaceId ?? ''}...`;
      }
      return `Using ${name}...`;
  }
}
