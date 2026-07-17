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

export interface TurnMutationPolicy {
  denyAllMutations: boolean;
  denyMemoryPersistence: boolean;
}

function withoutQuotedText(text: string): string {
  return text
    .replace(/"[^"\r\n]*"/g, ' ')
    .replace(/(?<![\p{L}\p{M}\p{N}_])'(?:[^'\r\n]|(?<=[\p{L}\p{M}\p{N}_])'(?=[\p{L}\p{M}\p{N}_]))*'(?![\p{L}\p{M}\p{N}_])/gu, ' ')
    .replace(/“[^”\r\n]*”/g, ' ')
    .replace(/‘(?:[^’\r\n]|(?<=[\p{L}\p{M}\p{N}_])’(?=[\p{L}\p{M}\p{N}_]))*’/gu, ' ');
}

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

  return {
    denyAllMutations: broadDenial,
    denyMemoryPersistence: broadDenial || memoryDenial,
  };
}

/** Patterns indicating the user or agent discussed recurring/scheduled work */
const RECURRING_PATTERNS = /\b(every\s+day|daily|weekly|every\s+week|each\s+morning|every\s+morning|regularly|recurring|scheduled?|every\s+month|monthly)\b/i;

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
