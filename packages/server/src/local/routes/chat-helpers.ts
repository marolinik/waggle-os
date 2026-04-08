/**
 * chat-helpers.ts — Pure helper functions and constants for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * These functions have ZERO dependencies on server state.
 */

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
    if (/\b(429|500|502|503)\b/.test(msg)) return true;
    if (msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('econnaborted')) return true;
    if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
    if (msg.includes('overloaded') || msg.includes('capacity')) return true;
  }
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503) return true;
  return false;
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

/** Patterns indicating the user or agent discussed recurring/scheduled work */
const RECURRING_PATTERNS = /\b(every\s+day|daily|weekly|every\s+week|each\s+morning|every\s+morning|regularly|recurring|scheduled?|every\s+month|monthly)\b/i;

/**
 * Check whether the agent response should get a scheduling suggestion appended.
 * Returns true when the response mentions recurring work AND no cron/schedule
 * tool was already invoked this turn.
 *
 * Exported for testing.
 */
export function shouldSuggestSchedule(responseText: string, toolsUsed: string[]): boolean {
  if (!responseText) return false;
  if (toolsUsed.some(t => t.includes('schedule') || t.includes('cron'))) return false;
  return RECURRING_PATTERNS.test(responseText);
}

export const SCHEDULE_SUGGESTION = '\n\n💡 *Want this to run automatically? Use /schedule or ask me to set up a recurring task.*';

/** System prompt prefix injected for ambiguous messages */
export const AMBIGUITY_PROMPT = `IMPORTANT: The user's message is very brief and may be vague. Ask ONE specific clarifying question before taking any action. Do not generate documents, run tools, or take action without first understanding what the user wants. Start your response with a question.\n\n`;

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
    default:
      return `Using ${name}...`;
  }
}
