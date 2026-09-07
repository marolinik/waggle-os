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

const WORKSPACE_CATCH_UP_PATTERN = /\b(?:catch me up|get me up to speed|where did we leave off|where were we|what matters here now)\b/i;

/** Explicit continuity requests are actionable even when they are short. */
export function isWorkspaceCatchUpRequest(text: string): boolean {
  return WORKSPACE_CATCH_UP_PATTERN.test(text.trim());
}

/**
 * Detect whether a user message is too brief/vague to act on confidently.
 * Returns true when the message is short and lacks clear intent signals.
 *
 * Exported for testing.
 */
export function isAmbiguousMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  if (isWorkspaceCatchUpRequest(trimmed)) return false;

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
  denyMemoryRead: boolean;
  denyConversationHistory: boolean;
  denyMemoryPersistence: boolean;
  denyFileWrites: boolean;
  denyCodeExecution: boolean;
  denyAgentLaunch: boolean;
  contextScope: TurnContextScope;
}

const CONVERSATION_HISTORY_SOURCE = String.raw`(?:` +
  String.raw`(?:saved|stored)\s+(?:(?:chat|session|conversation)\s+)?history` +
  String.raw`|(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)\s+history` +
  String.raw`|(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)['’]s\s+(?:previous|prior|earlier)\s+history` +
  String.raw`|(?:previous|prior|earlier)\s+(?:chat|session|conversation)\s+history` +
  String.raw`|(?:previous|prior|earlier)\s+(?:chat|session|conversation)\s+(?:context|messages?|turns?|exchanges?|logs?|transcripts?)` +
  String.raw`|(?:(?:previous|prior|earlier)|(?:this|the|my|our|your))\s+history\s+(?:of|from|in)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)` +
  String.raw`|history\s+from\s+(?:earlier|before)\s+in\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)` +
  String.raw`|(?:anything|what)\s+(?:(?:I|we|you)\s+)?(?:said|discussed|covered|wrote|shared|mentioned|talked\s+about)\s+(?:earlier|before)\s+(?:in|during)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)` +
  String.raw`|(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation|discussion|thread)\s+so\s+far` +
  String.raw`|(?:(?:the|these|my|our|your)\s+)?(?:previous|prior|earlier|preceding|above)\s+(?:messages?|turns?|exchanges?)(?:\s+(?:in|from)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation))?` +
  String.raw`|(?:(?:the|these|my|our|your)\s+)?(?:messages?|turns?|exchanges?)\s+(?:above|previously)` +
  String.raw`|(?:(?:the|these|my|our|your)\s+)?(?:messages?|turns?|exchanges?)\s+(?:from\s+)?(?:earlier|before)\s+(?:in|from)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)` +
  String.raw`|(?:previous|prior|earlier)\s+context\s+(?:of|from|in)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)` +
  String.raw`|(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)\s+(?:logs?|transcripts?)(?:\s+so\s+far)?` +
  String.raw`|(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)['’]s\s+transcripts?` +
  String.raw`|(?:(?:this|the|my|our|your)\s+)?transcripts?\s+(?:of|from)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)` +
  String.raw`)`;

const TURN_REVISION_MARKER_SOURCE = String.raw`(?:but|however|except(?:\s+that)?|instead|then|yet|nevertheless|actually|rather|no|wait|hold\s+on|never\s+mind|correction|scratch\s+that|strike\s+that|ignore\s+that|disregard\s+that|forget\s+that|cancel\s+that\s+request|(?:I\s+)?retract\s+that|I\s+take\s+that\s+back|change\s+of\s+plan|new\s+(?:rule|instruction|constraint|policy)|treat\s+this\s+as\s+(?:an?\s+)?(?:rule|instruction|constraint|policy)|on\s+second\s+thought|I\s+changed\s+my\s+mind)`;
const TURN_REVISION_CONTEXT_SOURCE = String.raw`(?:${TURN_REVISION_MARKER_SOURCE}|(?:follow|obey|apply|enforce)\b[^.;!?\r\n]{0,80}\b(?:constraint|rule|policy|instruction)(?:\s+(?:exactly|strictly))?)`;
const TURN_REVISION_SEPARATOR_SOURCE = String.raw`[\s,;:.!?—–-]*(?:and\s+)?`;
const TURN_DIRECTIVE_SCOPE_PREFIX_SOURCE = String.raw`(?:(?:(?:at\s+this\s+time|for\s+(?:this\s+(?:answer|response|reply|turn|task|request)|now)|in\s+this\s+(?:answer|response|reply|turn)|on\s+this\s+turn|if\s+possible)\s*,?\s*|(?:unless|until)\b[^,.;!?\r\n]{0,80}\s*,\s*))?`;
const TURN_DIRECTIVE_START_SOURCE = String.raw`(?:^|[.;!?:—–\r\n]\s*|,\s*(?=${TURN_REVISION_MARKER_SOURCE}\b)|^\/[A-Za-z0-9_-]{1,32}\s+(?:[A-Z][A-Z0-9_-]{1,31}\s+)?(?=(?:do\s+not|don['’]t|never)\b))` +
  TURN_DIRECTIVE_SCOPE_PREFIX_SOURCE +
  String.raw`(?:${TURN_REVISION_MARKER_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE})?` +
  String.raw`(?:(?:please|kindly|now)\b[\s,]*)*` +
  String.raw`(?:(?:(?:can|could|would|will)\s+you\s+)|(?:(?:I|we)\s+(?:want|need|would\s+like)\s+you\s+to\s+))?`;
const TURN_RESPONSE_ACTION_SOURCE = String.raw`(?:answer|respond|reply|explain|tell|summarize|continue|proceed|start(?:\s+(?:over|fresh))?|begin(?:\s+(?:again|fresh))?)`;
const MEMORY_READ_ACTION_SOURCE = String.raw`(?:search|query|read|check|use|access|consult|retrieve|recall|inspect|browse|load|reference|refer\s+to|look\s+(?:up|at|in)|draw\s+from|rely\s+on|pull\s+from|fetch\s+from)`;
const MEMORY_READ_ACTION_GERUND_SOURCE = String.raw`(?:searching|querying|reading|checking|using|accessing|consulting|retrieving|recalling|inspecting|browsing|loading|referencing|referring\s+to|looking\s+(?:up|at|in)|drawing\s+from|relying\s+on|pulling\s+from|fetching\s+from)`;
const MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE = String.raw`(?:to\s+(?:${MEMORY_READ_ACTION_SOURCE}|${MEMORY_READ_ACTION_GERUND_SOURCE})|to\s+(?:(?:my|our|your|the)\s+)?(?:use|access|search|recall)\s+of|to\s+(?=${CONVERSATION_HISTORY_SOURCE}\b|(?:(?:my|our|your|the|any)\s+)?(?:(?:saved|stored|persistent|personal|workspace)\s+)?memor(?:y|ies)\b)|for\s+(?:(?:you\s+)?to\s+${MEMORY_READ_ACTION_SOURCE}|${MEMORY_READ_ACTION_GERUND_SOURCE}|(?:the\s+)?(?:(?:use|search|recall)\s+of|access\s+(?:of|to))))`;
const MEMORY_READ_PROHIBITION_SOURCE = String.raw`(?:do not|don['’]t|never|(?:can|could|would|will)\s+you\s+(?:please\s+)?not|under\s+no\s+circumstances(?:\s+(?:should|may|must)\s+you)?|(?:you\s+)?(?:must|should|may)\s+not|(?:you\s+)?(?:mustn['’]t|shouldn['’]t)|(?:you\s+)?(?:cannot|can['’]t|can\s+not)|(?:you\s+)?(?:are\s+)?not\s+(?:permitted|allowed|authorized)\s+to|(?:you\s+)?lack(?:s)?\s+permission\s+to)`;
const REMEMBERED_PERSONAL_CONTEXT_SOURCE = String.raw`(?:anything|everything|what)\s+(?:you\s+)?(?:know|remember)\s+about\s+(?:me|us)`;
const PRIOR_CONVERSATION_SOURCE = String.raw`(?<!chat['’]s\s)(?<!session['’]s\s)(?<!conversation['’]s\s)(?:(?:my|our|your|the|any)\s+)?(?:previous|prior|earlier)\s+(?:(?:chats?|sessions?|conversations?|discussions?)(?!\s+(?:history|context|messages?|turns?|exchanges?|logs?|transcripts?))|history(?!\s+(?:of|from|in)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)\b)|context(?!\s+(?:of|from|in)\s+(?:(?:this|the|my|our|your)\s+)?(?:chat|session|conversation)\b))`;
const PERSISTED_MEMORY_SOURCE = String.raw`(?:(?:(?:my|our|your|the|any)\s+)?(?:(?:saved|stored|persistent|personal|workspace)\s+)?(?<!in-)memor(?:y(?:\s+(?:store|database))?|ies)(?![- ](?:usage|leaks?|intensive|mapped|mapping|allocation|management|safety))|search_memory|${PRIOR_CONVERSATION_SOURCE}|${REMEMBERED_PERSONAL_CONTEXT_SOURCE}|(?:(?:my|our|your|the|any)\s+)?(?:saved|previous|prior|earlier|agreed)\s+(?:notes?|decisions?|agreements?|plans?|choices?|conclusions?))`;
const ALL_MEMORY_READ_SOURCE = String.raw`(?:${PERSISTED_MEMORY_SOURCE}|${CONVERSATION_HISTORY_SOURCE})`;
const COMMAND_WRAPPED_MEMORY_DIRECTIVE_SOURCE = String.raw`(?:(?:please|kindly|now)\s+)*(?:${MEMORY_READ_PROHIBITION_SOURCE}\b|(?:ignore|disregard|exclude|omit|keep|leave)\b|(?:set|put)\s+aside\b)`;

function withoutQuotedText(text: string): string {
  return text
    .replace(/(?:^|\r?\n)[ \t]*(?:>[ \t]*)?([`~])\1{2,}[^\r\n]*(?:\r?\n|$)[\s\S]*?(?:^|\r?\n)[ \t]*(?:>[ \t]*)?\1{3,}[^\r\n]*(?=\r?\n|$)/gm, ' ')
    .replace(/(?:^|\r?\n)[ \t]*>[^\r\n]*/g, ' ')
    .replace(/(?:^|\r?\n)(?: {4,}|\t)[^\r\n]*/g, ' ')
    .replace(/(`+)[^`\r\n]*\1/g, ' ')
    .replace(/"[^"\r\n]*"/g, ' ')
    .replace(/(?<![\p{L}\p{M}\p{N}_])'(?:[^'\r\n]|(?<=[\p{L}\p{M}\p{N}_])'(?=[\p{L}\p{M}\p{N}_]))*'(?![\p{L}\p{M}\p{N}_])/gu, ' ')
    .replace(/“[^”\r\n]*”/g, ' ')
    .replace(/‘(?:[^’\r\n]|(?<=[\p{L}\p{M}\p{N}_])’(?=[\p{L}\p{M}\p{N}_]))*’/gu, ' ')
    .replace(/«[^»\r\n]*»/g, ' ')
    .replace(/‹[^›\r\n]*›/g, ' ');
}

function exposeOperativeQuotedDirectives(text: string): string {
  const pattern = /(?:(?:^|[.;!?\r\n]\s*)(?:then\s+)?(?:(?:please|kindly)\s+)?(?:(?:(?:follow|obey|apply|enforce)\b[^.;!?\r\n]{0,80}\b(?:constraint|rule|policy|instruction)|treat\s+this\s+as\s+(?:an?\s+)?(?:rule|instruction|constraint|policy))\b|new\s+(?:rule|instruction|constraint|policy)\s*(?:is\s+)?[:=-]))[^"“«'‘`‹\r\n]{0,30}(?:"([^"\r\n]+)"|“([^”\r\n]+)”|«([^»\r\n]+)»|'([^'\r\n]+)'|‘([^’\r\n]+)’|`([^`\r\n]+)`|‹([^›\r\n]+)›)/gi;
  let exposed = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = exposed.replace(pattern, (match, ...groups) => {
      const directive = groups.slice(0, 7).find(
        group => typeof group === 'string' && group.length > 0,
      );
      if (typeof directive !== 'string') return match;

      const directiveIndex = match.indexOf(directive);
      if (directiveIndex <= 0) return match;
      return `${match.slice(0, directiveIndex - 1)}${directive}`;
    });
    if (next === exposed) return exposed;
    exposed = next;
  }
  return exposed;
}

function isSafeSlashCommandEnvelope(prefix: string): boolean {
  const normalized = prefix.trim();
  const tokens = normalized.split(/\s+/);
  if (!/^\/[A-Za-z0-9_-]{1,32}$/.test(tokens.shift() ?? '')) return false;

  let metadataOnly = true;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-' || token === '--') continue;
    if (/^(?:installed|install|sync)$/i.test(token)) continue;
    if (/^[A-Z][A-Z0-9_-]{1,31}$/.test(token)) continue;
    if (/^--[A-Za-z0-9_-]+=[^\s]+$/.test(token)) continue;
    if (/^--[A-Za-z0-9_-]+$/.test(token)) {
      const value = tokens[index + 1];
      if (value && value !== '-' && value !== '--' && !value.startsWith('--')) index += 1;
      continue;
    }
    metadataOnly = false;
    break;
  }
  if (metadataOnly) return true;

  const commandArguments = normalized.replace(/^\/[A-Za-z0-9_-]{1,32}\s*/, '');
  const descriptiveTarget = /^(?:draft|write|quote|repeat|explain|describe|define|discuss|analy[sz]e|compare)\b[^.;!?\r\n]{0,100}\b(?:sentence|phrase|statement|example|wording|text|policy|rule)\b/i.test(commandArguments);
  const reportedPolicy = /^(?:explain|describe|discuss|analy[sz]e|compare)\b[^.;!?\r\n]{0,100}\b(?:why|whether|what\s+it\s+means)\b[^.;!?\r\n]{0,100}\b(?:users?|agents?|people|someone|we|they)\b[^.;!?\r\n]{0,40}\b(?:say|says|said|saying|follow|obey|apply|enforce)\b/i.test(commandArguments);
  return !descriptiveTarget && !reportedPolicy;
}

function normalizeMemoryDirectiveBoundaries(text: string): string {
  return text
    .replace(
      new RegExp(
        String.raw`^(\/[A-Za-z0-9_-]{1,32}\b[^\r\n]{0,160}?)\s+(?=${COMMAND_WRAPPED_MEMORY_DIRECTIVE_SOURCE})`,
        'i',
      ),
      (match, prefix: string) => isSafeSlashCommandEnvelope(prefix) ? `${prefix}. ` : match,
    )
    .replace(/^(?!DO\b)([A-Z][A-Z0-9_-]{1,31})\s+/, '$1. ');
}

function withoutTechnicalMemoryTerms(text: string): string {
  return text
    .replace(/\b(?:shared|virtual|physical|system|heap|stack|gpu|cpu|ram|process|computer|device)\s+memory\b/gi, ' ')
    .replace(/\bworking\s+memory\b(?![^.;!?\r\n]{0,48}\b(?:from|across)\s+(?:prior|previous|earlier)\s+(?:sessions?|chats?|conversations?))/gi, ' ')
    .replace(/\bin[- ]memory\s+(?:databases?|stores?)\b/gi, ' ')
    .replace(/\b(?:(?:single[- ]user|desktop|ai)\s+){1,3}memory\s+(?:databases?|stores?)\b/gi, ' ')
    .replace(/\b(?:(?:browser|browsing|navigation|web|git|commit|repository|repo|sql|query|database|file|shell|command|command[- ]line|terminal|search|powershell|migration|deployment|build|release|audit|version[- ]control|test|execution|package|installation|api|request)\s+){1,3}history\b(?:\s+(?:of|from|in)\s+(?:(?:this|the)\s+)?(?:chat|session|conversation))?/gi, ' ')
    .replace(/\b(?:previous|prior|earlier)\s+history\s+of\s+(?!\s*(?:(?:my|our|your)\b|(?:(?:this|the)\s+)?(?:chat|session|conversation)\b))[^,.;!?\r\n]{1,80}/gi, ' ')
    .replace(/\bmemory\s+(?:databases?|stores?)\s+(?:architectures?|benchmarks?|designs?|engines?|implementations?|performance)\b/gi, ' ')
    .replace(/\bmemory(?:[- ](?:pressure|foam|bandwidth|footprint|metrics?|usage|leaks?|intensive|mapped|mapping|allocation|management|safety|ordering|layout|model|pool))\b/gi, ' ');
}

const ATTRIBUTED_REPORTED_MEMORY_POLICY_CLAUSE_PATTERNS = Object.freeze([
  /(^|[.;!?\r\n]\s*)(?!(?:I|We|You)\s)\p{L}[\p{L}\p{M}'’-]+(?:\s+\p{L}[\p{L}\p{M}'’-]+){0,2}\s+(?:said|says|asked|asks|requested|requests|stated|states|reported|reports|wrote|writes|noted|notes|claimed|claims|told|tells)(?:\s+(?:me|us))?\s*(?::|[,—–-])\s*[^.;!?\r\n]*/giu,
  /(^|[.;!?\r\n]\s*)(?:the\s+)?(?:report|document|documentation|article|email|message|transcript|example|author|speaker|customer|client|reviewer)\s+(?:said|says|asked|asks|requested|requests|stated|states|reported|reports|wrote|writes|noted|notes|claimed|claims|reads)\s*(?::|[,—–-])\s*[^.;!?\r\n]*/gi,
  /(^|[.;!?\r\n]\s*)(?:according\s+to|per)\s+\p{L}[\p{L}\p{M}'’-]+(?:\s+\p{L}[\p{L}\p{M}'’-]+){0,2}\s*:\s*[^.;!?\r\n]*/giu,
  /(^|[.;!?\r\n]\s*)(?!(?:I|We|You|My|Our)\b)\p{L}[\p{L}\p{M}’-]+(?:\s+\p{L}[\p{L}\p{M}’-]+){0,2}['’]s\s+(?:request|instruction|question|statement|prompt)\s*:\s*[^.;!?\r\n]*/giu,
]);
const ATTRIBUTED_REPORTED_MEMORY_POLICY_VERBS = new Set([
  'said', 'says', 'asked', 'asks', 'requested', 'requests',
  'stated', 'states', 'reported', 'reports', 'wrote', 'writes',
  'noted', 'notes', 'claimed', 'claims', 'reads',
  'request', 'instruction', 'question', 'statement', 'prompt',
]);
const DESCRIPTIVE_MEMORY_CONTENT_CLAUSE = /(^|[.;!?\r\n]\s*)(?:(?:can|could|would|will)\s+you\s+)?(?:(?:please|kindly)\s+)?(?:quote|translate|repeat|paraphrase|explain|analy[sz]e|review|summari[sz]e|rewrite|classify|critique|edit|proofread|evaluate|discuss|correct(?:\s+the\s+grammar)?|answer\s+whether\b[^:;!?\r\n]{0,80})\b(?:\s+(?:briefly|concisely|verbatim|exactly|literally|carefully))?(?:\s+(?:this|that|the\s+following)\s+(?:question|statement|sentence|phrase|prompt|request))?\s*:\s*(?=[^.;!?\r\n]{0,180}\b(?:remember|memor(?:y|ies)|(?:previous|prior|another|other|earlier)\s+(?:session|chat|conversation|thread))\b)[^.;!?\r\n]*/gi;
const DIRECT_USER_POLICY_CONTINUATION_AFTER_COMMA = /,(?=\s*(?:but|however|instead|yet|actually|rather|and(?:\s+now)?)\b[\s,]*(?:(?:I|we)\b|(?:my|our)\b)[^,.;!?\r\n]{0,80}:)/giu;

function hasAttributedReportedMemoryPolicyMarker(text: string): boolean {
  if (/\b(?:said|says|asked|asks|requested|requests|told|tells)(?:\s+(?:me|us))?\s*(?::|[,—–-])/i.test(text)) return true;
  if (/\b(?:according\s+to|per)\s+\p{L}[\p{L}\p{M}'’-]*(?:\s+\p{L}[\p{L}\p{M}'’-]*){0,2}\s*:/iu.test(text)) return true;
  for (let colonIndex = text.indexOf(':'); colonIndex >= 0; colonIndex = text.indexOf(':', colonIndex + 1)) {
    let wordEnd = colonIndex;
    while (wordEnd > 0 && /\s/u.test(text[wordEnd - 1]!)) wordEnd -= 1;
    let wordStart = wordEnd;
    while (wordStart > 0) {
      const code = text.charCodeAt(wordStart - 1);
      if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) break;
      wordStart -= 1;
    }
    if (ATTRIBUTED_REPORTED_MEMORY_POLICY_VERBS.has(
      text.slice(wordStart, wordEnd).toLowerCase(),
    )) return true;
  }
  return false;
}

function withoutAttributedReportedMemoryPolicyClauses(text: string): string {
  if (!hasAttributedReportedMemoryPolicyMarker(text)) return text;
  DIRECT_USER_POLICY_CONTINUATION_AFTER_COMMA.lastIndex = 0;
  const textWithDirectUserBoundaries = text.replace(
    DIRECT_USER_POLICY_CONTINUATION_AFTER_COMMA,
    ';',
  );
  DIRECT_USER_POLICY_CONTINUATION_AFTER_COMMA.lastIndex = 0;
  return ATTRIBUTED_REPORTED_MEMORY_POLICY_CLAUSE_PATTERNS.reduce((result, pattern) => {
    pattern.lastIndex = 0;
    const next = result.replace(pattern, (_match, boundary: string) => `${boundary} `);
    pattern.lastIndex = 0;
    return next;
  }, textWithDirectUserBoundaries);
}

export function actionableMemoryDirectiveText(message: string): string {
  return withoutTechnicalMemoryTerms(normalizeMemoryDirectiveBoundaries(
    withoutAttributedReportedMemoryPolicyClauses(withoutQuotedText(
      exposeOperativeQuotedDirectives(message),
    )).replace(DESCRIPTIVE_MEMORY_CONTENT_CLAUSE, '$1 '),
  ));
}

function isDescriptiveMemoryPolicyExample(text: string, matchIndex: number): boolean {
  const clauseStart = Math.max(
    text.lastIndexOf('.', matchIndex - 1),
    text.lastIndexOf(';', matchIndex - 1),
    text.lastIndexOf('!', matchIndex - 1),
    text.lastIndexOf('?', matchIndex - 1),
    text.lastIndexOf('—', matchIndex - 1),
    text.lastIndexOf('–', matchIndex - 1),
    text.lastIndexOf('\n', matchIndex - 1),
    text.lastIndexOf('\r', matchIndex - 1),
  ) + 1;
  const prefix = text.slice(clauseStart, matchIndex).trim();
  if (/^(?:the\s+)?(?:policy|rule)$/i.test(prefix) && text[matchIndex] === ':') {
    return false;
  }
  const revisionTail = prefix.match(new RegExp(
    String.raw`(?:^|,\s*)${TURN_REVISION_MARKER_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE}([\s\S]*)$`,
    'i',
  ));
  const descriptivePrefix = revisionTail?.[1]?.trim() || prefix;
  const descriptiveBodyPrefix = descriptivePrefix.replace(
    /^(?:(?:\/[A-Za-z0-9_-]{1,32}|[A-Z][A-Z0-9_-]{1,31})\s+)*/,
    '',
  );
  return new RegExp(
    String.raw`^(?:(?:(?:please|kindly)\s+)?(?:draft|write|quote|repeat|explain|describe|define|discuss|analy[sz]e|compare)\b[^.;!?\r\n]{0,100}\b(?:sentence|phrase|statement|example|wording|text|policy|rule)\b|translate\b|(?:explain|describe|discuss|analy[sz]e|compare)\b[^.;!?\r\n]{0,100}\b(?:why|whether|what\s+it\s+means)\b|(?:the\s+)?(?:sentence|phrase|statement|example|wording|text|policy|rule)\b|example\b)`,
    'i',
  ).test(descriptiveBodyPrefix);
}

function buildNegativeMemoryAuthorizationPatterns(memorySource: string, flags: string): RegExp[] {
  const authorization = String.raw`(?:consent|permission|authorization)`;
  const negativeAuxiliary = String.raw`(?:(?:do|did|have|had)\s+not|don['’]t|didn['’]t|haven['’]t|hadn['’]t|never|(?:have|had)\s+never)`;
  const passiveNegative = String.raw`(?:(?:was|were)\s+(?:never|not)\s+|(?:has|have)\s+(?:never|not)\s+been\s+)`;

  return [
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+${negativeAuxiliary}\s+(?:give|grant|provide|gave|granted|provided|given)\s+(?:you\s+)?(?:(?:my|our)\s+)?${authorization}\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:(?:have|had)\s+)?never\s+(?:consented|agreed)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}you\s+(?:(?:are|were)\s+(?:not|never)|(?:have|had)\s+(?:not|never)\s+been|(?:haven['’]t|hadn['’]t)\s+been)\s+(?:authorized|permitted|allowed)\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:my|our)\s+)?${authorization}\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b[^.;!?\r\n]{0,30}\b${passiveNegative}(?:given|granted|provided)\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}no\s+${authorization}\s+(?:(?:was|were)\s+|(?:has|have)\s+been\s+)(?:given|granted|provided)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:my|our)\s+)?${authorization}\s+${passiveNegative}(?:given|granted|provided)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:there\s+(?:is|was)|there['’]s)\s+no\s+(?:(?:my|our|your|the)\s+)?${authorization}\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}you\s+lack\s+(?:(?:my|our|the)\s+)?${authorization}\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+${negativeAuxiliary}\s+(?:authorize|authorized|permit|permitted|allow|allowed)\s+(?:you\s+)?to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}no\s+${authorization}\s+(?:exists|is\s+available)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:my|our)\s+)?${authorization}\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b[^.;!?\r\n]{0,24}\b(?:is|remains)\s+absent\b`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}you\s+(?:are|remain)\s+without\s+(?:(?:my|our|the)\s+)?${authorization}\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      flags,
    ),
  ];
}

function buildDeferredMemoryReadPatterns(memorySource: string, flags: string): RegExp[] {
  const benignAvailability = String.raw`(?:(?:that\s+)?(?:(?:it|that|they|memory)\s+(?:(?:is|are)|(?:might|may|could|can|would)\s+be)\s+)?(?:available|accessible|possible|relevant|helpful|useful|needed|appropriate)\b|(?:it|that|memory)\s+(?:(?:might|may|could|can|would)\s+help|helps?\b[^.;!?\r\n]{0,40}\banswer\b)|you\s+(?:(?:can|could|may)\s+(?:access|use|find|retrieve)|(?:need|want))\s+(?:it|that|memory)\b|any\s+(?:memor(?:y|ies)\s+)?exist\b)`;
  const condition = String.raw`(?:(?:only\s+)?(?:if|when|once|after|upon)|provided(?:\s+that)?|only\s+with)\b`;
  const deferredCondition = String.raw`${condition}(?!\s+${benignAvailability})`;
  const benignCondition = String.raw`(?:if|when|provided(?:\s+that)?)\b\s+${benignAvailability}`;
  const authorizationNoun = String.raw`(?:approval|consent|permission|authorization)`;
  const memoryAuthorizationObject = String.raw`(?:it|that|its\s+use|using\s+(?:it|that)|memory(?:\s+(?:access|use))?|access)`;
  const delegatedMemoryAuthorization = String.raw`you\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b\s+${memoryAuthorizationObject}`;
  const authorizationPurpose = String.raw`(?:\s+(?:for\s+memory\s+use|to\s+${MEMORY_READ_ACTION_SOURCE}\b\s+${memoryAuthorizationObject}))?`;
  const userAuthorizationVerb = String.raw`(?:approv(?:e|es|ed)(?:\s+${memoryAuthorizationObject})?|consent(?:s|ed)?(?:\s+to\s+${memoryAuthorizationObject})?|authori[sz](?:e|es|ed)(?:\s+(?:${memoryAuthorizationObject}|${delegatedMemoryAuthorization}))?|permit(?:s|ted)?(?:\s+(?:${memoryAuthorizationObject}|${delegatedMemoryAuthorization}))?|allow(?:s|ed)?(?:\s+(?:${memoryAuthorizationObject}|${delegatedMemoryAuthorization}))?|agree(?:s|d)?|opt(?:s|ed)?\s+in|say(?:s|ing)?\s+(?:(?:it\s+is\s+)?(?:okay|ok|fine)|yes|so|go)|(?:tell|tells|told|telling)\s+you\s+(?:(?:it\s+is\s+)?(?:okay|ok|fine|allowed)|to\s+proceed)|(?:give|gives|gave|giving|grant|grants|granted|granting)\s+(?:you\s+)?(?:(?:the\s+)?go[- ]ahead|${authorizationNoun}|access)(?:\s+to\s+you)?${authorizationPurpose}|provide(?:s|d|ing)?\s+${authorizationNoun}|sign(?:s|ed|ing)?\s+off(?:\s+on\s+${memoryAuthorizationObject})?|grant(?:s|ed|ing)?\s+access|confirm(?:s|ed|ing)?|enable(?:s|d|ing)?(?:\s+${memoryAuthorizationObject})?)`;
  const directUserAuthorization = String.raw`(?:I|we)\s+(?:(?:have|had)\s+)?(?:(?:explicitly|later)\s+)?${userAuthorizationVerb}`;
  const reviewedUserAuthorization = String.raw`(?:I|we)\s+(?:have|had)\s+[^.;!?\r\n]{0,60}\s+and\s+(?:explicitly\s+)?${userAuthorizationVerb}`;
  const contractedUserAuthorization = String.raw`(?:I|we)['’]ve\s+(?:explicitly\s+)?${userAuthorizationVerb}`;
  const ownedAuthorization = String.raw`(?:(?:my|our|the\s+user['’]s)\s+(?:${authorizationNoun}|go[- ]ahead)|${authorizationNoun}\s+from\s+(?:me|us)|(?:explicit\s+)?${authorizationNoun}(?:\s+from\s+(?:me|us))?\s+(?:(?:is|has\s+been)\s+)?(?:given|granted|provided))`;
  const authorizationSignal = String.raw`(?:${reviewedUserAuthorization}|${directUserAuthorization}|${contractedUserAuthorization}|(?:me|us)\s+to\s+${userAuthorizationVerb}|the\s+user\s+${userAuthorizationVerb}|${ownedAuthorization}|ask(?:s|ed|ing)?\s+(?:me|us)|(?:tell|tells|told|telling)\s+you\s+to)`;
  const memoryReference = String.raw`(?:it|that|(?:(?:my|our|your|the|saved|stored|persistent|personal|workspace)\s+)?memor(?:y|ies))`;
  const questionLeadModifier = String.raw`(?:(?:exactly|precisely|specifically|roughly|approximately|actually|really|historically|then|ever|in\s+fact)\b[\s,]*){0,3}`;
  const questionLead = String.raw`${questionLeadModifier}(?:did|do|does|was|were|is|are|has|have|had|what|which|who|where|why|how)\b`;
  const authorizationClauseEnd = String.raw`(?=\s*(?:(?:[;.!?](?=\s|$))|$))`;
  const activationCondition = String.raw`${condition}(?![\s,]+${questionLead})[^.;!?\r\n]{0,120}\b${authorizationSignal}\b${authorizationClauseEnd}`;
  const controlledRead = String.raw`(?:(?:only|solely)\s+${MEMORY_READ_ACTION_SOURCE}\b\s+${memoryReference}\b|${MEMORY_READ_ACTION_SOURCE}\b\s+(?:it|that)\s+(?:only|solely)|${MEMORY_READ_ACTION_SOURCE}\b\s+${memoryReference}\b\s+(?:only|solely))`;
  const deferredRead = String.raw`(?:defer|delay|postpone)\b\s+(?:${MEMORY_READ_ACTION_GERUND_SOURCE}\b\s+${memoryReference}\b|(?:the\s+)?(?:use|access)\s+of\s+${memoryReference}\b)`;
  const authorizationCheckPrefix = String.raw`(?:(?:(?:could|would|can|will)\s+you|you\s+(?:must|should|need\s+to|have\s+to))\s+)?(?:(?:please|kindly)\s+)?`;
  const authorizationCheck = String.raw`${authorizationCheckPrefix}(?:(?:ask|check\s+with|confirm\s+with)\s+(?:me|us)|(?:ask\s+for|obtain|seek|get)\b[^.;!?\r\n]{0,40}\b(?:approval|consent|permission|authorization|go[- ]ahead))`;
  const memoryUseAfterCheck = String.raw`before\s+${MEMORY_READ_ACTION_GERUND_SOURCE}\b\s+(?:it|that|memory)\b`;
  const authorizationCheckFirst = String.raw`(?:first[\s,]+${authorizationCheck}\b|${authorizationCheck}\b[^.;!?\r\n]{0,24}\b(?:first|${memoryUseAfterCheck})\b)`;
  const checkBeforeMemoryUse = String.raw`before\s+(?:(?:you\s+)?${MEMORY_READ_ACTION_SOURCE}\b\s+${memoryReference}\b|${MEMORY_READ_ACTION_GERUND_SOURCE}\b\s+${memoryReference}\b)[^.;!?\r\n]{0,32}\b(?:${authorizationCheck}|${authorizationSignal})\b`;
  const activationDeferral = String.raw`(?:${activationCondition}|(?:wait|hold)\b[^.;!?\r\n]{0,100}\b(?:until|for)\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b|${controlledRead}[^.;!?\r\n]{0,40}\b(?:after|when|once|upon)\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b|${MEMORY_READ_PROHIBITION_SOURCE}\b\s+(?:${MEMORY_READ_ACTION_SOURCE}\b\s+${memoryReference}\b|proceed\b[^.;!?\r\n]{0,24}\bmemory\b)[^.;!?\r\n]{0,40}\b(?:until|unless|before|without)\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b|(?:subject\s+to|pending|contingent\s+on)\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b|not\s+(?:before|without|unless)\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b|${deferredRead}[^.;!?\r\n]{0,60}\buntil\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b|${authorizationCheckFirst}|${checkBeforeMemoryUse}|only\s+(?:on|at)\s+(?:(?:my|our|the\s+user['’]s)\s+command|[^.;!?\r\n]{0,40}\b${authorizationSignal}\b)${authorizationClauseEnd})`;
  const followOnSeparator = String.raw`(?:\s+(?:and|but)\s+|\s*(?:[,;:—–-]\s*|[.!?]\s+)(?:(?:and|but)\s+)?)`;
  const followOnActivationDeferral = String.raw`${followOnSeparator}${activationDeferral}`;
  return [
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b\s+${deferredCondition}`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}only\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b\s+(?:if|when|once|after|upon|with)\b(?!\s+${benignAvailability})`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b\s+${benignCondition}${followOnActivationDeferral}`,
      flags,
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\bmemor(?:y|ies)\b\s+${benignCondition}${followOnSeparator}(?:use|access|read|consult|search|recall)\s+(?:it|that)\s+(?:only|solely)\s+(?:after|when|once|upon)\b[^.;!?\r\n]{0,80}\b${authorizationSignal}\b`,
      flags,
    ),
  ];
}

export type ExplicitMemoryReadDirective = 'unspecified' | 'allow' | 'deny';

interface MemoryReadDirectivePatternProfile {
  includeConversationReferences: boolean;
  denialPatterns: readonly RegExp[];
  positiveDoubleNegationPattern: RegExp;
  directReadPattern: RegExp;
  overridePattern: RegExp;
  pronounOverridePattern: RegExp | null;
  memorySourcePattern: RegExp | null;
}

function collectCachedMatches(pattern: RegExp, text: string): RegExpMatchArray[] {
  pattern.lastIndex = 0;
  const matches = Array.from(text.matchAll(pattern));
  pattern.lastIndex = 0;
  return matches;
}

function testCachedPattern(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  const matched = pattern.test(text);
  pattern.lastIndex = 0;
  return matched;
}

function buildMemoryReadDirectivePatternProfile(
  memorySource: string,
  options: {
    includeConversationReferences: boolean;
    includePersonalContext: boolean;
  },
): Readonly<MemoryReadDirectivePatternProfile> {
  const recallAction = MEMORY_READ_ACTION_SOURCE;
  const recallActionGerund = MEMORY_READ_ACTION_GERUND_SOURCE;
  const directProhibition = MEMORY_READ_PROHIBITION_SOURCE;
  const denialPatterns = [
    new RegExp(
      String.raw`(?:${TURN_DIRECTIVE_START_SOURCE}|,\s*(?:and\s+)?)${directProhibition}\b\s+(?:(?:ever|please)\s+|(?:try|attempt)\s+to\s+)?${recallAction}\b[^,.;!?—–\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}without\b[^.;!?\r\n]{0,80}\b${recallActionGerund}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,100}\bwithout\b[^.;!?\r\n]{0,80}\b${recallActionGerund}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,100}\bwithout(?:\s+any)?\s+(?:reference\s+to\s+)?${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${directProhibition}\s+(?:recall|remember)\b[^.;!?\r\n]{0,80}\b(?:what|when|where|who|which|whether|how)\s+(?:I|we|you)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:avoid|refrain\s+from)\b[^.;!?\r\n]{0,40}\b${recallActionGerund}\b[^.;!?\r\n]{0,60}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${recallAction}\s+no\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:ignore|disregard|(?:set|put)\s+aside|never\s+mind)\b[^.;!?\r\n]{0,40}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:exclude|omit)\b[^.;!?\r\n]{0,60}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${memorySource}\b[^.;!?\r\n]{0,32}\b(?:(?:is|are|was|were)\s+(?:(?:to\s+)?(?:be|remain)\s+)?|(?:must|should|may|shall)\s+(?:be\s+)?)(?:excluded|omitted|kept\b[^.;!?\r\n]{0,16}\bout)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:keep|leave)\b[^.;!?\r\n]{0,60}\b${memorySource}\b[^.;!?\r\n]{0,24}\b(?:out\s+of|outside)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${directProhibition}\b\s+(?:consider|include)\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${directProhibition}\b\s+(?:carry\b[^.;!?\r\n]{0,48}\bforward\b[^.;!?\r\n]{0,48}|incorporate\b[^.;!?\r\n]{0,80})\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+want\s+(?:you\s+)?to\s+${recallAction}\b[^,.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:would\s+)?prefer\s+(?:that\s+)?(?:you\s+)?not\s+${recallAction}\b[^,.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${memorySource}\b(?:\s+(?:access|search|recall|use))?\s+(?:is|are)\s+(?:denied|forbidden|disallowed|prohibited|not\s+(?:allowed|permitted))\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}access\s+to\s+${memorySource}\b\s+(?:is|are)\s+(?:denied|forbidden|disallowed|prohibited|not\s+(?:allowed|permitted))\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:it\s+is\s+)?(?:denied|forbidden|disallowed|prohibited|not\s+(?:allowed|permitted))\s+to\s+${recallAction}\b[^,.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:without(?:\s+any)?|with\s+no)\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,100}\b(?:without(?:\s+any)?|with\s+no)\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}no\s+${memorySource}\s+(?:access|use|search|recall)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${memorySource}\s+(?:access|use|search|recall)\s+(?:is|are)\s+denied\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${memorySource}\b[^.;!?\r\n]{0,40}\b(?:(?:must|should|may)\s+not|(?:cannot|can['’]t|can\s+not)|(?:mustn['’]t|shouldn['’]t))\s+be\s+(?:used|accessed|searched|queried|read|consulted|retrieved|recalled|inspected|loaded|referenced)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${memorySource}\b\s+(?:is|are)\s+not\s+to\s+be\s+(?:used|accessed|searched|queried|read|consulted|retrieved|recalled|inspected|loaded|referenced)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+consent\s+to\b[^.;!?\r\n]{0,60}\b(?:you\s+)?(?:${recallActionGerund}\s+)?${memorySource}\b(?:\s+(?:access|use|search|recall))?`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:hereby\s+)?(?:withdraw|revoke|rescind|decline|cancel|remove)\s+(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b[^.;!?\r\n]{0,20}\b(?:is|are|was|were|has|have)\s+(?:been\s+)?(?:withdrawn|revoked|rescinded|cancelled|canceled|removed|denied|withheld|refused)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+no\s+longer\s+(?:consent|agree)\s+to\s+${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+no\s+longer\s+(?:authorize|permit|allow)\s+(?:you\s+)?to\s+${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+opt\s+out\s+of\s+${recallActionGerund}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}you\s+(?:are|remain)\s+no\s+longer\s+(?:authorized|permitted|allowed)\s+to\s+${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:you\s+)?(?:do\s+not|don['’]t|does\s+not|doesn['’]t)\s+have|you\s+have\s+no)\s+(?:(?:my|our|the)\s+)?(?:consent|permission|authorization)\s+to\s+${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:(?:do\s+not|don['’]t)\s+(?:authorize|permit|allow)|(?:have\s+not|haven['’]t)\s+(?:authorized|permitted|allowed))\s+(?:you\s+)?to\s+${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:disallow|prohibit|forbid)\s+(?:(?:you\s+)?from\s+${recallActionGerund}|(?:the\s+)?(?:use|access|search|recall)\s+of|(?:you\s+)?to\s+${recallAction})\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}no\s+access\s+to\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:deny|withhold)\s+(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+object\s+to\s+(?:(?:you\s+)?${recallActionGerund}|(?:(?:my|our|your|the)\s+)?(?:use|access|search|recall)\s+of)\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+(?:give|grant)\s+(?:you\s+)?permission\s+to\s+${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+(?:give|grant)\s+(?:you\s+)?(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    ...buildNegativeMemoryAuthorizationPatterns(memorySource, 'gi'),
    ...buildDeferredMemoryReadPatterns(memorySource, 'gi'),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+refuse\s+(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\bas\s+if\s+(?:you\s+)?had\s+no\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${directProhibition}\b\s+take\b[^.;!?\r\n]{0,80}\b${memorySource}\b[^.;!?\r\n]{0,40}\binto\s+(?:account|consideration)\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${directProhibition}\b\s+factor\s+in\b[^.;!?\r\n]{0,80}\b${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${directProhibition}\b\s+base\b[^.;!?\r\n]{0,80}\bon\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\bindependently\s+of\s+${memorySource}\b`,
      'gi',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${recallAction}\b[^.;!?\r\n]{0,80}\b${memorySource}\b[\s\S]{0,80}\b${TURN_REVISION_CONTEXT_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE}${directProhibition}\b(?=\s*(?:[.;!?]|$))`,
      'gi',
    ),
    ...(options.includeConversationReferences ? [
      new RegExp(
        String.raw`\b${memorySource}\b[\s\S]{0,120}\b${TURN_REVISION_CONTEXT_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE}(?:(?:please|now)\b[\s,]*){0,2}${directProhibition}\b\s+(?:(?:ever|please)\s+)?${recallAction}\s+(?:it|that)\b`,
        'gi',
      ),
      new RegExp(
        String.raw`\b${memorySource}\b[\s\S]{0,120}\b${TURN_REVISION_CONTEXT_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE}(?:(?:please|now)\b[\s,]*){0,2}(?:(?:exclude|omit|ignore|disregard)\s+(?:it|that)\b|(?:keep|leave)\s+(?:it|that)\b[^.;!?\r\n]{0,16}\bout\b|${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,40}\bwithout\s+(?:it|that)\b)`,
        'gi',
      ),
    ] : []),
    ...(options.includePersonalContext ? [
      new RegExp(
        String.raw`\bforget\s+${REMEMBERED_PERSONAL_CONTEXT_SOURCE}\b[^.;!?\r\n]{0,40}\b(?:for\s+this\s+(?:answer|turn)|right\s+now|today)\b`,
        'gi',
      ),
    ] : []),
  ];
  const positiveDoubleNegation = String.raw`(?:do not|don['’]t|never)\s+(?:ever\s+)?(?:ignore|disregard)\b[^.;!?\r\n]{0,40}\b${memorySource}\b`;
  const explicitRecall = String.raw`(?:${positiveDoubleNegation}|${recallAction}\b(?:(?!\b${recallAction}\b)[^.;!?\r\n]){0,80}\b${memorySource}\b|(?:would|do)\s+you\s+mind\s+${recallActionGerund}\b[^.;!?\r\n]{0,80}\b${memorySource}\b|(?:recall|remember)\b[^.;!?\r\n]{0,80}\b(?:what|when|where|who|which|whether|how)\s+(?:I|we|you)\b)`;

  return Object.freeze({
    includeConversationReferences: options.includeConversationReferences,
    denialPatterns: Object.freeze(denialPatterns),
    positiveDoubleNegationPattern: new RegExp(String.raw`^${positiveDoubleNegation}$`, 'i'),
    directReadPattern: new RegExp(String.raw`\b${explicitRecall}`, 'gi'),
    overridePattern: new RegExp(
      String.raw`\b${TURN_REVISION_CONTEXT_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE}(?:(?:please|now)\b[\s,]*){0,2}${explicitRecall}`,
      'gi',
    ),
    pronounOverridePattern: options.includeConversationReferences
      ? new RegExp(
        String.raw`\b${TURN_REVISION_CONTEXT_SOURCE}\b${TURN_REVISION_SEPARATOR_SOURCE}(?:(?:please|now)\b[\s,]*){0,2}${recallAction}\s+(?:it|that)\b`,
        'gi',
      )
      : null,
    memorySourcePattern: options.includeConversationReferences
      ? new RegExp(memorySource, 'i')
      : null,
  });
}

const ALL_MEMORY_READ_PATTERN_PROFILE = buildMemoryReadDirectivePatternProfile(
  ALL_MEMORY_READ_SOURCE,
  { includeConversationReferences: true, includePersonalContext: true },
);
const PERSISTED_MEMORY_READ_PATTERN_PROFILE = buildMemoryReadDirectivePatternProfile(
  PERSISTED_MEMORY_SOURCE,
  { includeConversationReferences: true, includePersonalContext: true },
);
const CONVERSATION_HISTORY_PATTERN_PROFILE = buildMemoryReadDirectivePatternProfile(
  CONVERSATION_HISTORY_SOURCE,
  { includeConversationReferences: true, includePersonalContext: false },
);
const CONVERSATION_HISTORY_FALLBACK_PATTERNS = Object.freeze([
      new RegExp(
    String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_PROHIBITION_SOURCE}\b\s+(?:(?:ever|please)\s+|(?:try|attempt)\s+to\s+)?${MEMORY_READ_ACTION_SOURCE}\b[^,.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
    'i',
  ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:ignore|disregard|(?:set|put)\s+aside|never\s+mind)\b[^.;!?\r\n]{0,40}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:exclude|omit)\b[^.;!?\r\n]{0,60}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${CONVERSATION_HISTORY_SOURCE}\b[^.;!?\r\n]{0,32}\b(?:(?:is|are|was|were)\s+to\s+be|(?:must|should|may)\s+be)\s+(?:excluded|omitted|kept\b[^.;!?\r\n]{0,16}\bout)\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:keep|leave)\b[^.;!?\r\n]{0,60}\b${CONVERSATION_HISTORY_SOURCE}\b[^.;!?\r\n]{0,24}\bout\s+of\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_PROHIBITION_SOURCE}\b\s+(?:consider|include)\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:avoid|refrain\s+from)\b[^.;!?\r\n]{0,40}\b${MEMORY_READ_ACTION_GERUND_SOURCE}\b[^.;!?\r\n]{0,60}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_ACTION_SOURCE}\s+no\s+${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+(?:give|grant)\s+(?:you\s+)?permission\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+(?:give|grant)\s+(?:you\s+)?(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    ...buildNegativeMemoryAuthorizationPatterns(CONVERSATION_HISTORY_SOURCE, 'i'),
    ...buildDeferredMemoryReadPatterns(CONVERSATION_HISTORY_SOURCE, 'i'),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+want\s+(?:you\s+)?to\s+${MEMORY_READ_ACTION_SOURCE}\b[^,.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:would\s+)?prefer\s+(?:that\s+)?(?:you\s+)?not\s+${MEMORY_READ_ACTION_SOURCE}\b[^,.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}without\b[^.;!?\r\n]{0,80}\b(?:${MEMORY_READ_ACTION_GERUND_SOURCE}\b[^.;!?\r\n]{0,80}\b)?${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,100}\b(?:without(?:\s+any)?|with\s+no)\s+(?:${MEMORY_READ_ACTION_GERUND_SOURCE}\b[^.;!?\r\n]{0,80}\b)?${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}with\s+no\s+${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:access\s+to\s+${CONVERSATION_HISTORY_SOURCE}|${CONVERSATION_HISTORY_SOURCE}(?:\s+(?:access|search|recall|use))?)\s+(?:is|are)\s+(?:denied|forbidden|disallowed|prohibited|not\s+(?:allowed|permitted))\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${CONVERSATION_HISTORY_SOURCE}\b[^.;!?\r\n]{0,40}\b(?:(?:must|should|may)\s+not|(?:cannot|can['’]t|can\s+not)|(?:mustn['’]t|shouldn['’]t))\s+be\s+(?:used|accessed|searched|queried|read|consulted|retrieved|recalled|inspected|loaded|referenced)\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${CONVERSATION_HISTORY_SOURCE}\b\s+(?:is|are)\s+not\s+to\s+be\s+(?:used|accessed|searched|queried|read|consulted|retrieved|recalled|inspected|loaded|referenced)\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:it\s+is\s+)?(?:denied|forbidden|disallowed|prohibited|not\s+(?:allowed|permitted))\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b[^,.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:hereby\s+)?(?:withdraw|revoke|rescind|decline|cancel|remove)\s+(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b[^.;!?\r\n]{0,20}\b(?:is|are|was|were|has|have)\s+(?:been\s+)?(?:withdrawn|revoked|rescinded|cancelled|canceled|removed|denied|withheld|refused)\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+no\s+longer\s+(?:consent|agree)\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+no\s+longer\s+(?:authorize|permit|allow)\s+(?:you\s+)?to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+opt\s+out\s+of\s+${MEMORY_READ_ACTION_GERUND_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}you\s+(?:are|remain)\s+no\s+longer\s+(?:authorized|permitted|allowed)\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:(?:you\s+)?(?:do\s+not|don['’]t|does\s+not|doesn['’]t)\s+have|you\s+have\s+no)\s+(?:(?:my|our|the)\s+)?(?:consent|permission|authorization)\s+to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:(?:do\s+not|don['’]t)\s+(?:authorize|permit|allow)|(?:have\s+not|haven['’]t)\s+(?:authorized|permitted|allowed))\s+(?:you\s+)?to\s+${MEMORY_READ_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:disallow|prohibit|forbid)\s+(?:(?:you\s+)?from\s+${MEMORY_READ_ACTION_GERUND_SOURCE}|(?:the\s+)?(?:use|access|search|recall)\s+of|(?:you\s+)?to\s+${MEMORY_READ_ACTION_SOURCE})\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}no\s+access\s+to\s+${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:deny|withhold)\s+(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+object\s+to\s+(?:(?:you\s+)?${MEMORY_READ_ACTION_GERUND_SOURCE}|(?:(?:my|our|your|the)\s+)?(?:use|access|search|recall)\s+of)\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+(?:do not|don['’]t)\s+consent\s+to\b[^.;!?\r\n]{0,60}\b(?:you\s+)?(?:${MEMORY_READ_ACTION_GERUND_SOURCE}\s+)?${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}(?:I|we)\s+refuse\s+(?:(?:my|our)\s+)?(?:consent|permission|authorization)\s+${MEMORY_READ_AUTHORIZATION_SCOPE_SOURCE}\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}no\s+${CONVERSATION_HISTORY_SOURCE}\s+(?:access|use|search|recall)\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\bas\s+if\s+(?:you\s+)?had\s+no\s+${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_PROHIBITION_SOURCE}\b\s+take\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b[^.;!?\r\n]{0,40}\binto\s+(?:account|consideration)\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_PROHIBITION_SOURCE}\b\s+factor\s+in\b[^.;!?\r\n]{0,80}\b${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${MEMORY_READ_PROHIBITION_SOURCE}\b\s+base\b[^.;!?\r\n]{0,80}\bon\s+${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`${TURN_DIRECTIVE_START_SOURCE}${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,80}\bindependently\s+of\s+${CONVERSATION_HISTORY_SOURCE}\b`,
      'i',
    ),
    new RegExp(
      String.raw`\b${CONVERSATION_HISTORY_SOURCE}\b[\s\S]{0,120}\b${TURN_REVISION_CONTEXT_SOURCE}\b[\s,;:]*(?:(?:please|now)\b[\s,]*){0,2}${MEMORY_READ_PROHIBITION_SOURCE}\b\s+(?:(?:ever|please)\s+)?${MEMORY_READ_ACTION_SOURCE}\s+(?:it|that)\b`,
      'i',
    ),
    new RegExp(
      String.raw`\b${CONVERSATION_HISTORY_SOURCE}\b[\s\S]{0,120}\b${TURN_REVISION_CONTEXT_SOURCE}\b[\s,;:.!?]*(?:(?:please|now)\b[\s,]*){0,2}(?:(?:exclude|omit|ignore|disregard)\s+(?:it|that)\b|(?:keep|leave)\s+(?:it|that)\b[^.;!?\r\n]{0,16}\bout\b|${TURN_RESPONSE_ACTION_SOURCE}\b[^.;!?\r\n]{0,40}\bwithout\s+(?:it|that)\b)`,
      'i',
    ),
]);
const CONVERSATION_HISTORY_SOURCE_PATTERN = new RegExp(CONVERSATION_HISTORY_SOURCE, 'i');
let memoryDirectiveClassifierPrimed = false;

/** Compile immutable directive profiles during server startup, before the first chat turn. */
export function primeMemoryDirectiveClassifier(): void {
  if (memoryDirectiveClassifierPrimed) return;
  memoryDirectiveClassifierPrimed = true;
  classifyExplicitTurnMutationPolicy('Do not use conversation history.');
  classifyExplicitTurnMutationPolicy('Apply this rule: «Do not use saved memory.»');
  classifyExplicitTurnMutationPolicy('Do not use conversation history — actually, use it.');
}

function resolveMemoryReadDirectiveForSource(
  message: string,
  profile: Readonly<MemoryReadDirectivePatternProfile>,
  actionableOverride?: string,
): ExplicitMemoryReadDirective {
  const actionable = actionableOverride ?? actionableMemoryDirectiveText(message);
  const denialMatches = profile.denialPatterns.flatMap(pattern => (
    collectCachedMatches(pattern, actionable)
      .filter(match => !isDescriptiveMemoryPolicyExample(actionable, match.index ?? 0))
  ));
  const latestDenial = Math.max(
    -1,
    ...denialMatches.map(match => match.index ?? -1),
  );
  const directReadMatches = collectCachedMatches(profile.directReadPattern, actionable).filter((match) => {
    const matchIndex = match.index ?? 0;
    if (isDescriptiveMemoryPolicyExample(actionable, matchIndex)) return false;
    const clauseStart = Math.max(
      actionable.lastIndexOf('.', matchIndex - 1),
      actionable.lastIndexOf(';', matchIndex - 1),
      actionable.lastIndexOf('!', matchIndex - 1),
      actionable.lastIndexOf('?', matchIndex - 1),
      actionable.lastIndexOf('—', matchIndex - 1),
      actionable.lastIndexOf('–', matchIndex - 1),
      actionable.lastIndexOf('\n', matchIndex - 1),
      actionable.lastIndexOf('\r', matchIndex - 1),
    ) + 1;
    const prefix = actionable.slice(clauseStart, matchIndex).trim();
    const descriptive = /^(?:(?:\/[A-Za-z0-9_-]{1,32}|[A-Z][A-Z0-9_-]{1,31})\s+)*(?:explain|describe|define|discuss|analy[sz]e|compare|quote)\b/i.test(prefix);
    const negated = /\b(?:do\s+not|don['’]t|never|(?:must|should|may|can)\s+not|mustn['’]t|shouldn['’]t|cannot|can['’]t)\s*$/i.test(prefix)
      || /^(?:do\s+not|don['’]t|never)\b/i.test(match[0]);
    const positiveDoubleNegationMatch = testCachedPattern(
      profile.positiveDoubleNegationPattern,
      match[0],
    );
    const insideDenial = denialMatches.some((denial) => {
      const denialStart = denial.index ?? -1;
      return matchIndex >= denialStart && matchIndex < denialStart + denial[0].length;
    });
    if (insideDenial && !positiveDoubleNegationMatch) return false;
    if (negated && !positiveDoubleNegationMatch) return false;
    return !descriptive;
  });
  const latestDirectRead = Math.max(
    -1,
    ...directReadMatches.map(match => match.index ?? -1),
  );
  if (latestDenial < 0) return latestDirectRead >= 0 ? 'allow' : 'unspecified';

  // A later explicit same-capability instruction wins after a clear resume marker.
  const deferredQualifier = /^\s*(?:[,:(—–-]\s*)*(?:(?:(?:only|solely)\s+)?(?:after|if|when|once|unless|later|upon|with)|provided(?:\s+that)?|as\s+soon\s+as)\b/i;
  const latestOverride = Math.max(
    -1,
    ...collectCachedMatches(profile.overridePattern, actionable)
      .filter(match => {
        const tail = actionable.slice((match.index ?? 0) + match[0].length);
        return !deferredQualifier.test(tail);
      })
      .map(match => match.index ?? -1),
    ...(profile.includeConversationReferences
      && profile.pronounOverridePattern
      && profile.memorySourcePattern
      ? collectCachedMatches(profile.pronounOverridePattern, actionable)
        .filter(match => testCachedPattern(
          profile.memorySourcePattern!,
          actionable.slice(0, match.index ?? 0),
        ))
        .filter(match => {
          const tail = actionable.slice((match.index ?? 0) + match[0].length);
          return !deferredQualifier.test(tail);
        })
        .map(match => match.index ?? -1)
      : []),
  );
  const latestDirectReadMatch = directReadMatches.find(match => match.index === latestDirectRead);
  const latestDirectReadTail = latestDirectReadMatch
    ? actionable.slice((latestDirectReadMatch.index ?? 0) + latestDirectReadMatch[0].length)
    : '';
  const latestStandaloneRead = latestDirectRead > latestDenial
    && !deferredQualifier.test(latestDirectReadTail)
    && /^\s*(?:now\b\s*)?(?:[.;!?]|$)/i.test(latestDirectReadTail)
    ? latestDirectRead
    : -1;
  return Math.max(latestOverride, latestStandaloneRead) > latestDenial ? 'allow' : 'deny';
}

/** Resolve ordered, direct memory-read instructions across every memory surface. */
export function resolveExplicitMemoryReadDirective(message: string): ExplicitMemoryReadDirective {
  return resolveMemoryReadDirectiveForSource(message, ALL_MEMORY_READ_PATTERN_PROFILE);
}

export function resolveExplicitPersistedMemoryReadDirective(message: string): ExplicitMemoryReadDirective {
  return resolveMemoryReadDirectiveForSource(message, PERSISTED_MEMORY_READ_PATTERN_PROFILE);
}

function resolveExplicitConversationHistoryDirective(message: string): ExplicitMemoryReadDirective {
  return resolveMemoryReadDirectiveForSource(message, CONVERSATION_HISTORY_PATTERN_PROFILE);
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

const PERSISTED_MEMORY_ACCESS_TOOL_NAMES = new Set([
  'search_memory',
  'search_all_workspaces',
  'query_knowledge',
  'get_identity',
  'get_awareness',
  'read_other_workspace',
  'save_memory',
  'add_task',
  'correct_knowledge',
  'list_skills',
  'read_skill',
  'search_skills',
  'suggest_skill',
  'acquire_capability',
  'install_capability',
  'create_skill',
  'delete_skill',
  'promote_skill',
  'auto_extract_skills',
  'retire_skills',
  'agent_insights',
  'compose_workflow',
  'list_agents',
  'get_agent_result',
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
  const quoteFreeActionable = withoutTechnicalMemoryTerms(withoutQuotedText(message));
  const actionable = actionableMemoryDirectiveText(message);
  const mutationVerb = '(?:create|edit|modify|write|save|store|delete|remove|change|update|execute|run)';
  const broadDenial = new RegExp(
    `\\b(?:do not|don['’]t|never)\\s+${mutationVerb}`
      + `(?:\\s*(?:,|and|or)\\s*${mutationVerb})*`
      + '\\s+(?:anything(?:\\s+at\\s+all)?|any\\s+changes?)\\b',
    'i',
  ).test(quoteFreeActionable)
    || /\b(?:make|apply|perform)\s+no\s+(?:changes?|edits?|writes?|updates?)\b/i.test(quoteFreeActionable)
    || /\bwithout\s+(?:making|applying|performing)\s+(?:any\s+)?(?:changes?|edits?|updates?)\b/i.test(quoteFreeActionable)
    || /\b(?:do not|don['’]t|never)\s+take\s+any\s+actions?\b/i.test(quoteFreeActionable)
    || /\b(?:work|respond|operate|inspect|review)\s+(?:in\s+)?read[- ]only(?:\s+mode)?\b/i.test(quoteFreeActionable);

  const memoryDenial = /\b(?:do not|don['’]t|never)\s+remember\b/i.test(actionable)
    || /\b(?:do not|don['’]t|never)\s+(?:save|store|persist|write)\b[^.;!?\r\n]{0,60}\b(?:to|in|into)\s+(?:my\s+)?memory\b/i.test(actionable)
    || /\b(?:do not|don['’]t|never)\s+(?:save|store|persist)\s+(?:this|that|it|anything)\b/i.test(actionable);
  const broadMemoryUseDenial = /\b(?:do not|don['’]t|never)\s+use\s+(?:(?:my|our|the)\s+)?(?:(?:saved|stored|persistent|personal|workspace)\s+)?(?<!in-)memor(?:y|ies)\b(?![- ](?:usage|leaks?|intensive|mapped|mapping|allocation|management|safety))/i.test(actionable)
    || /\bwithout\s+(?:using\s+)?(?:(?:my|our|the)\s+)?(?:(?:saved|stored|persistent|personal|workspace)\s+)?(?<!in-)memor(?:y|ies)\b(?![- ](?:usage|leaks?|intensive|mapped|mapping|allocation|management|safety))/i.test(actionable)
    || /\buse\s+no\s+(?:(?:saved|stored|persistent|personal|workspace)\s+)?(?<!in-)memor(?:y|ies)\b(?![- ](?:usage|leaks?|intensive|mapped|mapping|allocation|management|safety))/i.test(actionable)
    || /\b(?:(?:you\s+)?(?:must|should|may)\s+not|(?:you\s+)?(?:cannot|can['’]t))\s+use\s+(?:(?:my|our|the)\s+)?(?:(?:saved|stored|persistent|personal|workspace)\s+)?memor(?:y|ies)\b/i.test(actionable)
    || /\b(?:avoid|refrain\s+from)\s+using\s+(?:(?:my|our|the)\s+)?(?:(?:saved|stored|persistent|personal|workspace)\s+)?memor(?:y|ies)\b/i.test(actionable)
    || /\bmemor(?:y|ies)\s+(?:access|use)\s+(?:is|are)\s+(?:forbidden|disallowed|prohibited|not\s+allowed)\b/i.test(actionable);

  const fileDenial = /\b(?:do not|don['’]t|never)\s+(?:create|edit|modify|write|save|overwrite)(?:\s*(?:,|and|or)\s*(?:create|edit|modify|write|save|overwrite))*\s+(?:any\s+)?(?:files?|documents?|artifacts?)\b/i.test(quoteFreeActionable)
    || /\bwithout\s+(?:creating|editing|modifying|writing|saving|overwriting)\s+(?:any\s+)?(?:files?|documents?|artifacts?)\b/i.test(quoteFreeActionable);
  const codeExecutionDenial = /\b(?:do not|don['’]t|never)\b[^.;!?\r\n]{0,100}\b(?:execute|run)\s+(?:any\s+)?(?:code|commands?|scripts?|shell|bash|python)\b/i.test(quoteFreeActionable)
    || /\bwithout\b[^.;!?\r\n]{0,100}\b(?:executing|running)\s+(?:any\s+)?(?:code|commands?|scripts?|shell|bash|python)\b/i.test(quoteFreeActionable);
  const agentLaunchDenial = /\b(?:do not|don['’]t|never)\b[^.;!?\r\n]{0,100}\b(?:launch|spawn|start|run|delegate)\s+(?:any\s+)?(?:agents?|sub[- ]?agents?|workers?)\b/i.test(quoteFreeActionable)
    || /\bwithout\b[^.;!?\r\n]{0,100}\b(?:launching|spawning|starting|running|delegating)\s+(?:any\s+)?(?:agents?|sub[- ]?agents?|workers?)\b/i.test(quoteFreeActionable);

  const suppliedOnly = isExclusiveSuppliedOnlyResponseRequest(message)
    || /\b(?:use|consider|rely on)\s+only\s+(?:the\s+)?(?:supplied|provided|given|included)\s+(?:evidence|facts?|information|context|content|text|input|materials?)\b/i.test(quoteFreeActionable)
    || /\bonly\s+use\s+(?:the\s+)?(?:supplied|provided|given|included)\s+(?:evidence|facts?|information|context|content|text|input|materials?)\b/i.test(quoteFreeActionable);
  const workspaceOnly = /\b(?:inspect|review|analy[sz]e|search|read)\s+only\s+(?:within\s+)?(?:this|the)\s+(?:current\s+)?(?:virtual\s+)?workspace\b/i.test(quoteFreeActionable);

  const contextScope: TurnContextScope = suppliedOnly
    ? 'supplied-only'
    : workspaceOnly
      ? 'workspace-only'
      : 'default';
  const persistedMemoryReadDirective = resolveMemoryReadDirectiveForSource(
    message,
    PERSISTED_MEMORY_READ_PATTERN_PROFILE,
    actionable,
  );
  const conversationHistoryDirective = resolveMemoryReadDirectiveForSource(
    message,
    CONVERSATION_HISTORY_PATTERN_PROFILE,
    actionable,
  );
  const denyConversationHistory = conversationHistoryDirective === 'unspecified' ? (
    persistedMemoryReadDirective === 'deny' && (
      CONVERSATION_HISTORY_FALLBACK_PATTERNS.some(pattern => (
        testCachedPattern(pattern, actionable)
      ))
      || (persistedMemoryReadDirective === 'deny'
        && testCachedPattern(CONVERSATION_HISTORY_SOURCE_PATTERN, actionable))
    )
  ) : conversationHistoryDirective === 'deny';

  return {
    denyAllMutations: broadDenial,
    denyMemoryRead: persistedMemoryReadDirective === 'deny',
    denyConversationHistory,
    denyMemoryPersistence: broadDenial || memoryDenial || broadMemoryUseDenial || denyConversationHistory,
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

  const explicitToolDenial = /\b(?:do not|don['\u2019]t|never)\s+(?:use|call|invoke|run)\s+(?:any\s+|the\s+)?tools?\b|\bwithout\s+(?:using\s+)?(?:any\s+)?tools?\b/i.test(actionable);
  const explicitlyNonExecuting = explicitToolDenial
    || policy.denyAllMutations
    || (policy.denyFileWrites && (policy.denyCodeExecution || policy.denyAgentLaunch));
  if (!explicitlyNonExecuting) return false;
  const affirmative = actionable.replace(
    /\b(?:do not|don['\u2019]t|never|without)\b[^.?!;:\r\n]*?(?=\s*(?:,\s*(?=(?:but|however|yet|then|using|from|via|inspect|search|browse|read|open|list|scan|query|retrieve|recall|look up|find)\b)|[;:]|\bbut\b|\bhowever\b|\byet\b|\bbased on\b|[.?!]|$))/gi,
    ' ',
  );
  const responseArtifactCreation = /(?:^|[.?!]\s*)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?create\s+(?:(?:a|an|the)\s+)?(?:(?:concise|brief|short|simple|numbered|bulleted|(?:one|two|three|four|five|\d+)-step)\s+){0,3}(?:checklist|outline|summary|plan|agenda|list|table|answer|response|reply)\b/i.test(affirmative);
  if (!responseArtifactCreation
    && !/\b(?:turn|design|decompose|outline|explain|compare|describe|discuss|teach|summari[sz]e|draft|prepare|propose|recommend|map|write|provide|produce|generate|implement)\b/i.test(affirmative)) {
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
  const inlineDefinedCurrentObject = /\b(?:turn|convert|transform)\s+this\s+(?:release\s+)?(?:goal|brief|objective|plan|request)\s+into\b[^:\r\n]{0,200}:\s*\S/i.test(affirmative);
  const createActionCount = affirmative.match(/\bcreate\b/gi)?.length ?? 0;
  const persistentResponseArtifact = /\b(?:checklist|outline|summary|plan|agenda|list|table|answer|response|reply)\b[^.?!\r\n]{0,48}\b(?:(?:as|in|to)\s+)?(?:(?:a|an|the)\s+)?(?:(?:downloadable|markdown|excel|word|powerpoint)\s+){0,2}(?:file|document|spreadsheet|workbook|presentation|slides?|deck|pdf|docx|xlsx|pptx)(?:\s+format)?\b/i.test(affirmative);
  const unsafeCreateAction = createActionCount > 0
    && !(responseArtifactCreation && !persistentResponseArtifact && createActionCount === 1);
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
    || /(?:^|[.?!]\s*|[,;:\u2014]\s*|\b(?:and|then|also|but|however)\s+)(?:(?:please\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?|please\s+)?(?:send|email|message|schedule|post|publish|upload|share|submit|book|delete|remove|update|launch|start|install|export|download|commit|push|merge(?!\s+criteria\b)|deploy)\b/i.test(affirmative)
    || unsafeCreateAction
    || /\b(?:once\s+(?:done|complete)|after(?:wards|\s+that)?)\b[^.?!\r\n]{0,40}\b(?:send|email|message|schedule|post|publish|upload|share|submit|book|create|delete|remove|update|launch|start|install|export|download|commit|push|merge|deploy)\b/i.test(affirmative)
    || /\b(?:that|it|them|these|those|same|rest|remaining|former|latter|above|earlier|previously|continue|continuing)\b/i.test(affirmative)
    || (!inlineDefinedCurrentObject && /\bthis\b/i.test(affirmative))
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

/** Persisted-memory reads are incompatible with explicit source boundaries. */
export function allowsPersistedMemoryRead(policy: TurnMutationPolicy): boolean {
  return policy.contextScope === 'default' && !policy.denyMemoryRead;
}

/** Automatic recall is incompatible with an explicit evidence boundary. */
export function allowsAutomaticRecall(policy: TurnMutationPolicy): boolean {
  return allowsPersistedMemoryRead(policy);
}

/** Prior chat turns are ambient evidence and stay out of bounded requests. */
export function allowsConversationHistory(policy: TurnMutationPolicy): boolean {
  return policy.contextScope === 'default' && !policy.denyConversationHistory;
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
    || options.policy.denyMemoryRead
    || options.policy.denyConversationHistory
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

  const hasGranularRestriction = policy.denyMemoryRead
    || policy.denyFileWrites
    || policy.denyCodeExecution
    || policy.denyAgentLaunch;
  return tools.filter((tool) => {
    if (hasGranularRestriction && externalToolNames.has(tool.name)) return false;
    if (policy.denyMemoryRead && PERSISTED_MEMORY_ACCESS_TOOL_NAMES.has(tool.name)) return false;
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
