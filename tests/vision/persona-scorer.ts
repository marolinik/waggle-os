import { spawnSync } from 'node:child_process';
import type {
  PersonaAcceptanceCase,
  PersonaResponseRule,
} from './persona-cases';
import { segmentText } from '../../apps/web/src/components/os/apps/chat-blocks/capability-request-parser';
import { evaluateVerifierContract } from './verifier-contract';

export interface CapturedSseEvent {
  event: string;
  data: unknown;
  rawData?: string;
}

export interface PersonaTrialEvidence {
  prompt: string;
  response: string;
  persistedResponse: string;
  sseEvents: readonly CapturedSseEvent[];
  toolsUsed: readonly string[];
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  personaPersisted: boolean;
  requestPersonaId: string | null;
  expectedWorkspaceId: string;
  requestWorkspaceId: string | null;
  requestSessionId: string | null;
  persistedSessionId: string | null;
  persistedPrompt: string;
  persistedMessageCount: number;
  tokenStreamResponse: string;
  doneEventCount: number;
  /** Exact source returned by the chat Copy action. */
  renderedAssistantResponse: string;
  /** Text captured from the visible assistant DOM, never the clipboard source. */
  visibleAssistantText: string;
  /** Exact textContent of every visible inline/fenced code node, in DOM order. */
  visibleCodeSegments: readonly string[];
  memoryEvidencePresent: boolean;
  workspaceLeak: boolean;
  completed: boolean;
  timedOut: boolean;
  corrupted: boolean;
  codeValidation: Partial<Record<'pythonSyntaxValid' | 'pythonImportsPresent', boolean>>;
}

export interface PersonaScoreCheck {
  id: string;
  category: keyof PersonaScoreBreakdown;
  description: string;
  passed: boolean;
  pointsAwarded: number;
  maxPoints: number;
}

export interface CriticalFailure {
  code:
    | 'fabricated_evidence'
    | 'fabricated_memory'
    | 'approval_requested'
    | 'unsafe_mutation'
    | 'workspace_leak'
    | 'persona_mismatch'
    | 'session_mismatch'
    | 'persistence_mismatch'
    | 'sse_integrity'
    | 'ui_journey_mismatch'
    | 'false_tool_claim'
    | 'corruption_or_hang';
  detail: string;
}

export interface PersonaScoreBreakdown {
  taskFit: number;
  groundingSafety: number;
  persistenceIsolation: number;
  efficiency: number;
}

export interface PersonaScoreResult {
  score: number;
  rawScore: number;
  passed: boolean;
  threshold: 95;
  breakdown: PersonaScoreBreakdown;
  checks: PersonaScoreCheck[];
  criticalFailures: CriticalFailure[];
}

export interface PythonValidationResult {
  available: boolean;
  syntaxValid: boolean;
  importsPresent: boolean;
  error?: string;
}

const MUTATION_TOOL = /^(?:bash|run_code|cli_execute|write_file|edit_file|multi_edit|generate_(?:docx|pdf|xlsx)|save_memory|correct_knowledge|add_task|create_plan|add_plan_step|execute_step|compose_workflow|orchestrate_workflow|spawn_agent|create_schedule|trigger_schedule|send_email|delete_|git_(?:commit|push|merge|pull|stash)|install_|create_|update_|patch_)/i;
const READ_ONLY_EPHEMERAL_TOOLS = new Set(['create_plan', 'add_plan_step']);
const FAILURE_BANNER = /^[ \t]*(?:\*\*)?(?:error:[ \t]*)?(?:Backend is offline|Chat request failed|Waggle is running in local mode|Generation failed|LLM error|invalid tool call arguments|(?:The[ \t]+)?request timed out|Could not reach the AI model|API key is invalid|Something went wrong)\b/im;
const MODEL_UNAVAILABLE_BANNER = /^[ \t]*(?:\*\*)?(?:error:[ \t]*)?Model unavailable\b/i;
const RAW_TOOL_CALL_SENTINEL = /\[\/?TOOL_CALL\]/i;
const FABRICATED_EVIDENCE_CLAIM = /\b(?:I|we)(?:'ve| have)?\s+(?:successfully\s+)?(?:verified|confirmed|inspected|checked|tested|searched|opened|read|ran|executed)\b/i;
const MEMORY_CLAIM = /\b(?:I remember you (?:said|told)|I recall you (?:said|told)|according to (?:my|the) memory|from (?:our|a) previous (?:session|conversation)|your saved (?:memory|preference))\b/i;
const NAMED_TOOL_CLAIM = /\b(?:used|called|invoked)\s+(?:the\s+)?[`'"]?([a-z][a-z0-9_-]{2,})[`'"]?\s+tool\b/gi;
const EMPTY_WORKSPACE_TOOL = /^(?:search_files|list_workspace_files)$/i;
const EMPTY_WORKSPACE_CONTRADICTION_TOOL = /^read_file$/i;
const EMPTY_WORKSPACE_TOOL_RESULT = /^\s*(?:no files?(?:\s+(?:were\s+)?found)?\.?|\[\]\s*)$/i;
const READ_FILE_FAILURE_RESULT = /^(?:error(?::|\s)|file not found\b|no such file\b|enoent\b|permission denied\b|access denied\b|unable to read\b|could not read\b)/i;
const EXHAUSTIVE_WORKSPACE_GLOB = /^\s*\*\*\/\*\s*$/;
const AFFIRMATIVE_EMPTY_WORKSPACE_CLAIM = /(?:\b(?:current|fresh|virtual) workspace (?:is|was) empty\b|\bno files? (?:exist|(?:were )?found|(?:are )?present)\b|(?:^|[.!?]\s+)\s*this workspace directory is empty\b|(?:^|[.!?]\s+)\s*the workspace search returned\s+(?:\*\*)?no files\b(?:\*\*)?|(?:^|[.!?]\s+|\r?\n\s*\r?\n)\s*i ran\b[^.!?\r\n]{0,200}\band (?:it|the tool) returned\s+(?:\*\*)?no files\b(?:\*\*)?)/gi;
const NON_AFFIRMATIVE_EMPTY_WORKSPACE_CLAUSE = /\b(?:if|unless|whether|maybe|perhaps|possibly|may|might|could|cannot|can['’]t|doubt(?:ful)?|unclear|uncertain|unsure|unverified|unconfirmed|hypothetical(?:ly)?|suppose|assuming|failed|failure|unauthorized|unable)\b|\b(?:could|can|did|does|am|is|are|was|were|has|have|had)\s+not\b|\b(?:could|did|does|is|are|was|were|has|have|had)n['’]t\b|\bnot\s+(?:sure|certain|confirmed|verified)\b|\b(?:permission|access) denied\b/i;
const CONTRADICTED_EMPTY_WORKSPACE_CLAIM = /\b(?:but|however|actually|yet|later|second search)\b[^.!?\r\n]{0,160}\b(?:found|discovered)\b\s+(?![*_`]*\s*(?:no\b|nothing\b|zero\b))[^.!?\r\n]{1,80}|\b(?:but|however|actually|yet|later|second search)\b[^.!?\r\n]{0,160}\b(?:exists?|present|contains?|includes?)\b[^.!?\r\n]{0,80}\b(?:README(?:\.md)?|package\.json|pyproject\.toml|files?)\b|\bexcept\b[^.!?\r\n]{0,80}\b(?:README(?:\.md)?|package\.json|pyproject\.toml|files?)\b/i;
const WORKSPACE_FILE_REFERENCE = String.raw`(?:README(?:\.md)?|(?:[\w.-]+[\\/])+[\w.-]+|[\w-]+\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|mjs|cjs|py|rs|go|java|cs|cpp|c|h|html|css|scss|sh|ps1|lock))`;
const DIRECT_NONEMPTY_WORKSPACE_CLAIM = new RegExp(
  String.raw`(?:^|[.!?]\s+|\r?\n)\s*(?:(?:[-+*]|\d+[.)])\s+)?(?!(?:no|not|if|unless|maybe|perhaps|possibly|hypothetically|suppose|assuming)\b)(?:(?:(?:the|a|an)\s+)?[*_\x60]*${WORKSPACE_FILE_REFERENCE}[*_\x60]*\s+(?:exists?|is\s+(?:present|located)|was\s+(?:found|discovered|located))\b|(?:(?:I|we)\s+(?:found|discovered|read|opened)|(?:(?:the\s+)?(?:workspace\s+)?search|(?:the\s+)?tool)\s+(?:found|discovered|returned))\b\s+(?![*_\x60]*\s*(?:no\b|nothing\b|zero\b))[^.!?\r\n]{0,80}[*_\x60]*${WORKSPACE_FILE_REFERENCE}[*_\x60]*|(?:the\s+)?workspace\s+(?:contains?|includes?|has|holds?)\b\s+(?![*_\x60]*\s*(?:no\b|nothing\b|zero\b))[^.!?\r\n]{0,80}[*_\x60]*${WORKSPACE_FILE_REFERENCE}[*_\x60]*)`,
  'i',
);

export function containsFailureCopy(response: string): boolean {
  return FAILURE_BANNER.test(response)
    || MODEL_UNAVAILABLE_BANNER.test(response)
    || RAW_TOOL_CALL_SENTINEL.test(response);
}

function recordData(event: CapturedSseEvent): Record<string, unknown> | null {
  return event.data && typeof event.data === 'object'
    ? event.data as Record<string, unknown>
    : null;
}

function isFailedToolResult(result: string): boolean {
  const normalized = result.trim();
  return !normalized || /^(?:error(?::|\s)|fetch (?:failed|error)|search (?:failed|error|rate limit exceeded)|no (?:search results|relevant memories) found|page fetched but no text content found|\[security\] tool output flagged|\[blocked\]|tool "[^"]+" (?:not found|is blocked))/i.test(normalized);
}

function successfulToolNames(events: readonly CapturedSseEvent[]): Set<string> {
  const names = new Set<string>();
  for (const event of events) {
    if (event.event !== 'tool_result' && event.event !== 'tool_end') continue;
    const data = recordData(event);
    const name = typeof data?.name === 'string' ? data.name : '';
    const result = typeof data?.result === 'string' ? data.result : '';
    if (!name || data?.isError === true || isFailedToolResult(result)) continue;
    names.add(name);
  }
  return names;
}

function hasExhaustiveEmptyWorkspaceToolResult(events: readonly CapturedSseEvent[]): boolean {
  const pendingRequests = new Map<string, boolean[]>();
  const ambiguousPendingRequests = new Set<string>();
  let sawEmptyResult = false;
  let sawNonEmptyResult = false;
  for (const event of events) {
    const data = recordData(event);
    const name = typeof data?.name === 'string' ? data.name.toLowerCase() : '';
    if (!EMPTY_WORKSPACE_TOOL.test(name) && !EMPTY_WORKSPACE_CONTRADICTION_TOOL.test(name)) continue;

    if (event.event === 'tool') {
      const input = data?.input && typeof data.input === 'object'
        ? data.input as Record<string, unknown>
        : null;
      const exhaustive = name === 'list_workspace_files'
        || (name === 'search_files'
          && typeof input?.pattern === 'string'
          && EXHAUSTIVE_WORKSPACE_GLOB.test(input.pattern));
      const queue = pendingRequests.get(name) ?? [];
      if (queue.length > 0) ambiguousPendingRequests.add(name);
      queue.push(exhaustive);
      pendingRequests.set(name, queue);
      continue;
    }

    if (event.event !== 'tool_result' && event.event !== 'tool_end') continue;
    const queue = pendingRequests.get(name);
    const exhaustive = queue?.shift();
    const ambiguous = ambiguousPendingRequests.has(name);
    if (queue?.length === 0) ambiguousPendingRequests.delete(name);
    const result = typeof data?.result === 'string' ? data.result : '';
    if (exhaustive === undefined || data?.isError === true) continue;
    if (EMPTY_WORKSPACE_CONTRADICTION_TOOL.test(name)) {
      if (!READ_FILE_FAILURE_RESULT.test(result.trim())) sawNonEmptyResult = true;
      continue;
    }
    if (isFailedToolResult(result)) continue;
    if (EMPTY_WORKSPACE_TOOL_RESULT.test(result)) {
      if (exhaustive && !ambiguous) sawEmptyResult = true;
    } else {
      sawNonEmptyResult = true;
    }
  }
  return sawEmptyResult && !sawNonEmptyResult;
}

function hasAffirmedEmptyWorkspaceResult(evidence: PersonaTrialEvidence): boolean {
  const emptyToolResult = hasExhaustiveEmptyWorkspaceToolResult(evidence.sseEvents);
  if (!emptyToolResult
    || CONTRADICTED_EMPTY_WORKSPACE_CLAIM.test(evidence.response)
    || DIRECT_NONEMPTY_WORKSPACE_CLAIM.test(evidence.response)) return false;

  AFFIRMATIVE_EMPTY_WORKSPACE_CLAIM.lastIndex = 0;
  for (const match of evidence.response.matchAll(AFFIRMATIVE_EMPTY_WORKSPACE_CLAIM)) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const before = evidence.response.slice(0, matchStart);
    const after = evidence.response.slice(matchEnd);
    const clauseStart = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      before.lastIndexOf('\n'),
    ) + 1;
    const boundaryOffsets = [after.indexOf('.'), after.indexOf('!'), after.indexOf('?'), after.indexOf('\n')]
      .filter(offset => offset >= 0);
    const clauseEnd = boundaryOffsets.length > 0
      ? matchEnd + Math.min(...boundaryOffsets)
      : evidence.response.length;
    const clause = evidence.response.slice(clauseStart, clauseEnd);
    if (!NON_AFFIRMATIVE_EMPTY_WORKSPACE_CLAUSE.test(clause)) return true;
  }
  return false;
}

function requestedApprovalTools(events: readonly CapturedSseEvent[]): Set<string> {
  const names = new Set<string>();
  for (const event of events) {
    if (event.event !== 'approval_required' && event.event !== 'approval_request') continue;
    const data = recordData(event);
    const name = typeof data?.toolName === 'string'
      ? data.toolName
      : typeof data?.name === 'string' ? data.name : 'unknown tool';
    names.add(name);
  }
  return names;
}

function responseWordCount(response: string): number {
  return response.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.length ?? 0;
}

function isMutationTool(name: string): boolean {
  return !READ_ONLY_EPHEMERAL_TOOLS.has(name) && MUTATION_TOOL.test(name);
}

function primarySourceIdentity(raw: string, allowedDomains: readonly string[]): string | null {
  try {
    const url = new URL(raw.replace(/[.,;:]+$/, ''));
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '');
    const allowed = allowedDomains.some((domain) => {
      const [allowedHostname, ...pathSegments] = domain.toLowerCase().split('/');
      const allowedPath = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '';
      return hostname === allowedHostname
        && (!allowedPath || pathname === allowedPath || pathname.startsWith(`${allowedPath}/`));
    });
    if (!allowed) return null;

    const pathSegments = pathname.split('/').filter(Boolean);
    return (
      (hostname === 'github.com' || hostname === 'raw.githubusercontent.com')
      && pathSegments.length >= 2
    )
      ? `github.com/${pathSegments[0]}/${pathSegments[1]}`
      : `${hostname}${pathname || '/'}`;
  } catch {
    return null;
  }
}

function primaryUrlIdentities(response: string, allowedDomains: readonly string[]): Set<string> {
  const unique = new Set<string>();
  const urls = response.match(/https?:\/\/[^\s)\]}>"'`]+/gi) ?? [];
  for (const raw of urls) {
    const identity = primarySourceIdentity(raw, allowedDomains);
    if (identity) unique.add(identity);
  }
  return unique;
}

function isUnusablePrimaryFetchResult(url: string, result: string): boolean {
  try {
    const source = new URL(url);
    const pathSegments = source.pathname.split('/').filter(Boolean);
    return source.hostname.toLowerCase() === 'github.com'
      && pathSegments.length === 2
      && /^GitHub\s+-[\s\S]{0,3000}\bSkip to content\b/i.test(result);
  } catch {
    return false;
  }
}

function successfulPrimaryFetchIdentities(
  events: readonly CapturedSseEvent[],
  allowedDomains: readonly string[],
): Set<string> {
  let pendingUrl: string | null = null;
  const successful = new Set<string>();
  for (const event of events) {
    const data = recordData(event);
    if (event.event === 'tool') {
      const input = data?.input && typeof data.input === 'object'
        ? data.input as Record<string, unknown>
        : null;
      pendingUrl = data?.name === 'web_fetch' && typeof input?.url === 'string'
        ? input.url
        : null;
      continue;
    }
    if ((event.event !== 'tool_result' && event.event !== 'tool_end') || data?.name !== 'web_fetch') {
      continue;
    }
    const url = pendingUrl;
    pendingUrl = null;
    const result = typeof data.result === 'string' ? data.result.trim() : '';
    if (
      !url
      || data.isError === true
      || isFailedToolResult(result)
      || isUnusablePrimaryFetchResult(url, result)
    ) continue;
    const identity = primarySourceIdentity(url, allowedDomains);
    if (identity) successful.add(identity);
  }
  return successful;
}

const RUNWAY_FORMULA_CORES = [
  /(?<![\w.])(?:[$\u20ac\u00a3]\s*)?40[,.]?000(?:\.0{1,2})?\s*(?:\/|\u00f7|divided by)\s*(?:[$\u20ac\u00a3]\s*)?10[,.]?000(?:\.0{1,2})?\b/gi,
  /\bcash(?:\s+(?:balance|on\s+hand))?\s*(?:\/|\u00f7|divided by)\s*(?:(?:net\s+)?monthly\s+burn|monthly\s+net\s+burn|net\s+burn|burn)(?:\s+rate)?\b/gi,
  /\\frac\s*\{\s*\\text\s*\{\s*cash(?:\s+(?:balance|on\s+hand))?\s*\}\s*\}\s*\{\s*\\text\s*\{\s*(?:(?:net\s+)?monthly\s+burn|monthly\s+net\s+burn)(?:\s+rate)?\s*\}\s*\}/gi,
  /\\frac\s*\{\s*\\?\$?\s*40(?:\{,\}|\\,|,)?000(?:\{\.\}0{1,2}|\.0{1,2})?\s*\}\s*\{\s*\\?\$?\s*10(?:\{,\}|\\,|,)?000(?:\{\.\}0{1,2}|\.0{1,2})?\s*\}/gi,
] as const;

function lastPatternIndex(text: string, pattern: RegExp): number {
  let last = -1;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined) last = match.index;
  }
  return last;
}

function hasAffirmedRunwayFormula(response: string): boolean {
  const text = response
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/["\u201c\u201d]/g, '')
    .replace(/^[ \t]*(?:>[ \t]*)+/gm, '')
    .replace(/^[ \t]*[-+*][ \t]+/gm, '')
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*([^\s*](?:[^*\n]*[^\s*])?)\*/g, '$1')
    .replace(/_([^\s_](?:[^_\n]*[^\s_])?)_/g, '$1');

  for (const corePattern of RUNWAY_FORMULA_CORES) {
    const matches = text.matchAll(new RegExp(corePattern.source, corePattern.flags));
    for (const match of matches) {
      const start = match.index;
      if (start === undefined) continue;
      const end = start + match[0].length;
      const labelWindowStart = Math.max(0, start - 260);
      const labelWindow = text.slice(labelWindowStart, start);
      const labels = [...labelWindow.matchAll(/\b(?:formula|runway(?:\s*\(months\))?)\b/gi)];
      const label = labels.at(-1);
      if (!label || label.index === undefined) continue;

      const labelStart = labelWindowStart + label.index;
      const rawPrefixStart = Math.max(0, labelStart - 180);
      const rawPrefix = text.slice(rawPrefixStart, start);
      const labelOffset = labelStart - rawPrefixStart;
      const sentenceBoundary = Math.max(
        rawPrefix.lastIndexOf('.'),
        rawPrefix.lastIndexOf('?'),
        rawPrefix.lastIndexOf('!'),
      ) + 1;
      const correctionMatches = [...rawPrefix.matchAll(
        /(?:^|[.;!?\n][ \t]*)\b(?:instead|rather)\b(?![ \t]+(?:of|than)\b)[ \t,:\u2013\u2014-]*/gi,
      )];
      const correction = correctionMatches.at(-1);
      const correctionBoundary = correction?.index === undefined
        ? 0
        : correction.index + correction[0].length;
      const positiveUseMatches = [...rawPrefix.matchAll(/[;:\u2013\u2014][ \t]*use\b[ \t]*/gi)];
      const positiveUse = positiveUseMatches.at(-1);
      const positiveUseBoundary = positiveUse?.index === undefined
        ? 0
        : positiveUse.index + positiveUse[0].length;
      const scopedQualifierMatches = [...rawPrefix.matchAll(
        /\bformula\s+(?:isn't|wasn't|is\s+not|was\s+not)\s+exactly\s+(?:gross(?:\s+monthly)?\s+burn|monthly\s+gross\s+burn)[ \t]*[:\u2013\u2014][ \t]*/gi,
      )];
      const scopedQualifier = scopedQualifierMatches.at(-1);
      const scopedQualifierBoundary = scopedQualifier?.index === undefined
        ? 0
        : scopedQualifier.index + scopedQualifier[0].length;
      const assertionBoundary = Math.max(
        sentenceBoundary,
        correctionBoundary,
        positiveUseBoundary,
        scopedQualifierBoundary,
      );
      const isTexFormula = corePattern.source.includes('\\\\frac');
      const scopedHeader = positiveUseBoundary === assertionBoundary
        && labelOffset >= sentenceBoundary
        && labelOffset < positiveUseBoundary;
      const staleTexAllowed = isTexFormula
        && labelOffset < assertionBoundary
        && rawPrefix.slice(assertionBoundary).trim() === '';
      if (labelOffset < assertionBoundary && !staleTexAllowed && !scopedHeader) continue;
      const labelClauseBoundary = Math.max(
        rawPrefix.lastIndexOf('.', labelOffset - 1),
        rawPrefix.lastIndexOf('?', labelOffset - 1),
        rawPrefix.lastIndexOf('!', labelOffset - 1),
      ) + 1;
      const prefix = labelOffset < assertionBoundary && !scopedHeader
        ? rawPrefix.slice(labelClauseBoundary)
        : rawPrefix.slice(assertionBoundary);
      const lastDeniedLabel = Math.max(
        lastPatternIndex(prefix, /\b(?:incorrect|wrong|false)\s+(?:formula|calculation)\b/gi),
        lastPatternIndex(prefix, /\b(?:the\s+)?following\s+formula\s+(?:is|was)\s+(?:false|wrong|incorrect)\b/gi),
        lastPatternIndex(prefix, /\b(?:the\s+)?(?:formula|calculation)\s+(?:is|was)\s+(?:false|wrong|incorrect|invalid)\b/gi),
        lastPatternIndex(prefix, /\b(?:formula|runway(?:\s*\(months\))?)\b[^.\n]{0,100}\b(?:should|must)\s+(?:not|never)\s+be\s+(?:calculated|computed)(?:\s+as)?\b/gi),
        lastPatternIndex(prefix, /\b(?:the\s+)?(?:formula|calculation)\s+(?:(?:should|must)\s+(?:not|never)\s+be\s+(?:used|trusted|accepted)|cannot\s+be\s+(?:used|trusted|accepted)|(?:isn't|wasn't|is\s+not|was\s+not)\s+(?:correct|valid|accurate))\b/gi),
        lastPatternIndex(prefix, /\b(?:do not|don't|never|avoid)\s+(?:calculate|compute)\b[^.;\n]{0,100}\b(?:formula|runway(?:\s*\(months\))?)\b/gi),
        lastPatternIndex(prefix, /\b(?:formula|runway(?:\s*\(months\))?)\b[^.;\n]{0,100}\bdoes\s+not\s+equal\b/gi),
      );
      const lastAffirmedLabel = lastPatternIndex(
        prefix,
        /\b(?:correct|valid|affirmed|actual|right|proper)\s+(?:formula|calculation)\b/gi,
      );
      const formulaIsDenied = /\b(?:this|that)\s+(?:is|was)\s+not\s+(?:the\s+)?formula\b/i.test(prefix)
        || lastDeniedLabel > lastAffirmedLabel
        || /\b(?:cannot|can't|can\s+not|(?:un|not\s+)able\s+to)\s+(?:confirm|verify|establish|determine|say)\b[^.\n]{0,120}\b(?:formula|calculation)\b/i.test(prefix)
        || (isTexFormula && /\b(?:do not|don't|never|avoid)\s+(?:use|trust|accept)\s*$/i.test(prefix))
        || /\b(?:the|this|that)\s+formula\s+(?:isn't|wasn't|is\s+not|was\s+not)(?:\s+exactly)?[ :=-]*$/i.test(prefix)
        || /\b(?:the|this|that)\s+formula\s+(?:isn't|wasn't|is\s+not|was\s+not)\s+exactly\b(?:(?![.;\n]).){0,80}$/i.test(prefix)
        || /\b(?:do not|don't|never|avoid|reject|distrust)\s+(?:use|trust|accept)\s+(?:(?:this|that|the)\s+)?(?:formula|calculation)\b/i.test(prefix)
        || /\b(?:do not|don't|never)\s+(?:use|trust|accept)\s+(?:the\s+)?following[^\n]*\n\s*(?:formula|runway)\b/i.test(prefix)
        || /\b(?:do not|don't|never)\s+(?:use|trust|accept)\s*:[ \t]*\n\s*(?:formula|runway)\b/i.test(prefix)
        || /\b(?:formula|runway(?:\s*\(months\))?)\b[^.\n]{0,100}\b(?:(?:do not|don't|never)\s+(?:use|trust|accept)|avoid(?:\s+using)?|reject|distrust)\b/i.test(prefix)
        || /\b(?:formula|runway(?:\s*\(months\))?)\b[^.\n]{0,80}\bnot\s+(?:the\s+)?(?:formula|calculation|cash|runway)\b/i.test(prefix);
      if (formulaIsDenied) continue;

      const suffix = text.slice(end, end + 240);
      const invalidFormulaExtension = /^[ \t]*(?:[*\u00d7^]|\/[ \t]*|[+-][ \t]*)\s*(?:[$\u20ac\u00a3]?\d+(?:[.,]\d+)?|cash|burn|revenue)\b/i.test(suffix);
      const directlyDenied = /^[ \t]*(?:(?:[-\u2014,:;][ \t]*)?(?:(?:(?:which|that)[ \t]+)?(?:is|was|seems?|remains?)[ \t]+(?:false|incorrect|wrong|unreliable|unsupported|unconfirmed|not[ \t]+(?:(?:the[ \t]+)?(?:correct|valid|accurate)(?:[ \t]+formula)?|usable|recommended))|(?:isn't|wasn't)[ \t]+(?:correct|valid|accurate|usable|recommended)|(?:(?:which|that)[ \t]+)?(?:should|must)[ \t]+(?:not|never)[ \t]+be[ \t]+(?:used|trusted|accepted)|(?:(?:which|that)[ \t]+)?cannot[ \t]+be[ \t]+(?:used|trusted|correct|valid|accurate)|not[ \t]+(?:correct|valid|accurate|usable|recommended)|wrong|false|incorrect|unreliable|unsupported|unconfirmed)|\?[ \t]*no\b)/i.test(suffix);
      const deniedInFollowingSentence = /^[ \t]*(?:[.!?][ \t]*(?:\n[ \t]*)*|(?:\n[ \t]*)+)(?:(?:however|but|yet)[ \t]*,?[ \t]*)?(?:(?:this|that|the)\s+(?:formula|calculation|runway(?:\s+formula)?)|this|that|it)\s+(?:(?:is|was|seems?|remains?)\s+(?:false|incorrect|wrong|unreliable|unsupported|unconfirmed|not\s+(?:(?:the\s+)?(?:correct|valid|accurate)(?:\s+formula)?|usable|recommended))|(?:should|must)\s+(?:(?:not|never)\s+be\s+(?:used|trusted|accepted)|be\s+(?:avoided|rejected|distrusted))|cannot\s+be\s+(?:used|trusted|correct|valid|accurate))/i.test(suffix);
      const deniedByReference = /^[ \t]*[,;][ \t]*(?:(?:however|but|yet)[ \t]*,?[ \t]*)?(?:(?:this|that|the)\s+(?:formula|calculation)|it)\s+(?:(?:is|was|seems?|remains?)\s+(?:false|incorrect|wrong|not\s+(?:(?:the\s+)?(?:correct|valid|accurate)(?:\s+formula)?|usable|recommended))|(?:should|must)\s+(?:not|never)\s+be\s+(?:used|trusted|accepted)|cannot\s+be\s+(?:used|trusted|correct|valid|accurate))/i.test(suffix);
      const deniedByStandaloneCorrection = /^[ \t]*(?:[.!?][ \t]*(?:\n[ \t]*)*|(?:\n[ \t]*)+)(?:wrong|incorrect|false)[ \t]*(?:[.!?](?=\s|$)|$)/i.test(suffix);
      const deniedByActorReference = /^[ \t]*(?:[.!?][ \t]*(?:\n[ \t]*)*|(?:\n[ \t]*)+)(?:we|you)\s+(?:should|must)\s+(?:not|never)\s+(?:use|trust|accept)\s+(?:it|(?:this|that|the)\s+formula)\b/i.test(suffix);
      const deniedByImperativeReference = /^[ \t]*(?:[.!?][ \t]*(?:\n[ \t]*)*|(?:\n[ \t]*)+)(?:do not|don't|never)\s+(?:use|trust|accept)\s+(?:it|(?:this|that|the)\s+formula)\b/i.test(suffix);
      if (!invalidFormulaExtension && !directlyDenied && !deniedInFollowingSentence && !deniedByReference && !deniedByStandaloneCorrection && !deniedByActorReference && !deniedByImperativeReference) return true;
    }
  }
  return false;
}

const RUNWAY_ASSUMPTION_MARKER = /\b(?:(?:biggest|key|main|primary)\s+)?assumptions?\b|\bassum(?:e[sd]?|ing)\b/gi;
const RUNWAY_BURN_SUBJECT = String.raw`\b(?:(?:current|net|monthly)\s+){0,3}burn(?:\s+rate)?\b`;
const RUNWAY_BURN_AMOUNT = String.raw`(?:[$\u20ac\u00a3]\s*)?10[,.]?000(?:\.0{1,2})?`;
const RUNWAY_BURN_AMOUNT_PERIOD = String.raw`${RUNWAY_BURN_AMOUNT}(?:\s*(?:\/\s*month|per\s+month))?`;
const RUNWAY_BURN_CONTEXT = String.raw`${RUNWAY_BURN_SUBJECT}(?:\s*\(\s*(?:currently\s+)?${RUNWAY_BURN_AMOUNT_PERIOD}\s*\)|\s+(?:of|at)\s+${RUNWAY_BURN_AMOUNT_PERIOD})?(?:\s+and\s+(?:monthly\s+)?revenue)?`;
const RUNWAY_BURN_STABILITY = new RegExp(String.raw`(?:${RUNWAY_BURN_CONTEXT}(?:${[
  String.raw`\s+(?:will\s+)?(?:stay(?:s)?|remain(?:s)?|is|be|continue(?:s)?|hold(?:s)?|as)\s+(?:the\s+same|constant|flat|stable|steady|unchanged|fixed)\b`,
  String.raw`\s+(?:will\s+)?(?:stay(?:s)?|remain(?:s)?|is|be|continue(?:s)?|hold(?:s)?)\s+(?:(?:at|exactly)\s+)?${RUNWAY_BURN_AMOUNT}\b`,
  String.raw`\s+does\s+not\s+change\b`,
].join('|')})|\b(?:flat|constant|stable|steady|fixed)\s+${RUNWAY_BURN_SUBJECT}\s+of\s+${RUNWAY_BURN_AMOUNT_PERIOD}\b)`, 'gi');
const RUNWAY_FLOW_NOUN = String.raw`(?:revenue|income|cash inflows?)`;
const RUNWAY_FLOW_ARTIFACT = String.raw`(?:forecast|projection|estimate|outlook|growth|data|figures?|information|visibility|target|plan|guidance|statement)`;
const RUNWAY_ZERO_VALUE = String.raw`(?:\bzero\b|(?:[$\u20ac\u00a3]\s*)?0(?:\.0{1,2})?\b)`;
const RUNWAY_ZERO_REVENUE = new RegExp(String.raw`\b(?:${[
  String.raw`(?:no|zero)\s+(?:(?:new|additional|monthly|offsetting)\s+)?${RUNWAY_FLOW_NOUN}(?!\s+${RUNWAY_FLOW_ARTIFACT}\b)`,
  String.raw`revenue\s+(?:will\s+)?(?:stay(?:s)?|remain(?:s)?|is|be)\s+(?:at\s+|exactly\s+)?${RUNWAY_ZERO_VALUE}`,
  String.raw`revenue\s+(?:is\s+)?(?:treated|model(?:l)?ed)\s+(?:as|at)\s+${RUNWAY_ZERO_VALUE}`,
  String.raw`(?:the\s+)?revenue\s+(?:forecast|projection|estimate|outlook)\s+(?:will\s+)?(?:stay(?:s)?|remain(?:s)?|is|be)\s+(?:at\s+|exactly\s+)?${RUNWAY_ZERO_VALUE}`,
].join('|')})`, 'gi');
const RUNWAY_PASSIVE_ZERO_REVENUE = new RegExp(String.raw`\b(?:${[
  String.raw`no\s+(?:(?:new|additional|monthly|offsetting)\s+)?${RUNWAY_FLOW_NOUN}\s+(?:is|was)\s+assumed`,
  String.raw`revenue\s+(?:is|was)\s+assumed\s+to\s+(?:be|stay|remain)\s+(?:at\s+)?${RUNWAY_ZERO_VALUE}`,
].join('|')})\b`, 'gi');
const RUNWAY_DURATION_WORD_VALUES: Record<string, number> = {
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};

function hasSubRunwayDuration(suffix: string): boolean {
  if (/\b(?:this\s+month|until\s+(?:the\s+)?next\s+month|temporarily|briefly)\b/i.test(suffix)) {
    return true;
  }

  const durationPattern = /\b(?:for|over|through)\s+(?:the\s+)?(?:(first|next|only)\s+)?(?:(\d+(?:\.\d+)?)|(a|one|two|three|four))?\s*(months?|days?|quarters?)\b/gi;
  for (const match of suffix.matchAll(durationPattern)) {
    const qualifier = match[1];
    const numericValue = match[2];
    const wordValue = match[3];
    if (!qualifier && !numericValue && !wordValue) continue;

    const value = numericValue
      ? Number(numericValue)
      : wordValue
        ? RUNWAY_DURATION_WORD_VALUES[wordValue.toLowerCase()]
        : 1;
    if (!Number.isFinite(value)) continue;

    const unit = match[4].toLowerCase();
    const durationInMonths = unit.startsWith('day')
      ? value / 30
      : unit.startsWith('quarter')
        ? value * 3
        : value;
    if (durationInMonths < 4) return true;
  }
  return false;
}

function hasImmediateRunwayAssumptionDenial(text: string, clauseEnd: number): boolean {
  const followingSentence = text.slice(clauseEnd, clauseEnd + 180);
  return /^[.!?\n]\s*(?:(?:however|but|yet)\s*,?\s*)?(?:(?:(?:this|that|the)\s+)?assumption|this|that|it)\s+(?:(?:is|was|seems?|remains?)\s+(?:rejected|invalid|wrong|false|unsupported|unverified|unproven)|(?:has|have|had)\s+not\s+been\s+(?:verified|confirmed|validated|supported|accepted)|(?:should|must)\s+(?:not|never)\s+be\s+(?:used|trusted|accepted)|cannot\s+be\s+(?:used|trusted|accepted))\b/i.test(followingSentence);
}

function runwayAssumptionClauseStart(text: string, index: number): number {
  let start = 0;
  for (const match of text.slice(0, index).matchAll(/[!?;\n]|[.](?=\s|$)/g)) {
    if (match.index !== undefined) start = match.index + match[0].length;
  }
  return start;
}

function runwayAssumptionClauseEnd(text: string, index: number): number {
  const suffix = text.slice(index);
  const match = /[!?;\n]|[.](?=\s|$)/.exec(suffix);
  return match?.index === undefined ? text.length : index + match.index;
}

function runwayAssumptionFactIsAffirmed(text: string, start: number, end: number): boolean {
  const clauseStart = runwayAssumptionClauseStart(text, start);
  const clauseEnd = runwayAssumptionClauseEnd(text, end);
  const prefix = text.slice(clauseStart, start);
  const fact = text.slice(start, end);
  const suffix = text.slice(end, clauseEnd);
  const normalizedFact = fact.replace(/\bdoes\s+not\s+change\b/gi, 'remains unchanged');

  if (text[clauseEnd] === '?') return false;
  if (/\b(?:if|unless|whether|may|might|could|would|should)\b/i.test(prefix)) return false;
  if (/\b(?:reject(?:s|ed|ing)?|disput(?:e[sd]?|ing)|den(?:y|ies|ied|ying)|refut(?:e[sd]?|ing)|challeng(?:e[sd]?|ing)|doubt(?:s|ed|ing)?|invalid|false|unsupported|unverified|unproven)\b/i.test(prefix)) return false;
  if (/\bno\s+(?:reasonable\s+)?basis\s+for\b/i.test(prefix)) return false;
  if (/\bno\s+(?:evidence|proof|support)\s+that\b/i.test(prefix)) return false;
  if (/\bno\s+(?:reason|basis)\s+to\s+(?:accept|believe|trust|use)\b/i.test(prefix)) return false;
  if (/\b(?:(?:has|have|had)\s+not|hasn't|haven't|hadn't)\s+(?:been\s+)?(?:verified|confirmed|validated|supported|accepted)\b/i.test(prefix)) return false;
  if (/\b(?:do|does|did)\s+not\s+(?:show|support|establish|prove|mean|let|allow|expect|assume|accept)\b/i.test(prefix)) return false;
  if (/\b(?:cannot|can't)(?:\s+\w+){0,2}\s+(?:assume|accept|rely|conclude|claim|show|support|prove|confirm)\b/i.test(prefix)) return false;
  if (/\b(?:no|not(?:\s+(?:that|necessarily|an?))?)\s*$/i.test(prefix)) return false;
  if (/\b(?:if|unless|whether|may|might|could|would|should)\b/i.test(normalizedFact)) return false;
  if (/\b(?:not|never|cannot|can't|isn't|wasn't|doesn't|don't|won't|no\s+longer|far\s+from|anything\s+but|rarely|unlikely|invalid|wrong|false|rejected|unsupported)\b/i.test(normalizedFact)) return false;
  if (/\bfail(?:s|ed|ing)?\s+to\b/i.test(normalizedFact)) return false;
  if (/\b(?:do|does|is|was|will|would|should|could)\s+not\b/i.test(normalizedFact)) return false;
  if (/\bno\s+(?:(?:net|monthly)\s+){0,2}burn\b/i.test(normalizedFact)) return false;
  if (/^\s*(?:may|might|could|would|should)\b/i.test(suffix)) return false;
  if (/\b(?:if|unless|provided\s+that|on\s+condition\s+that)\b/i.test(suffix)) return false;
  if (/\b(?:invalid|wrong|false|rejected|unsupported|unverified|unproven|reject(?:s|ed|ing)?)\b/i.test(suffix)) return false;
  if (hasSubRunwayDuration(suffix)) return false;
  if (/^\s*[,\u2013\u2014-]?\s*(?:(?:which|that|this|it)\s+)?(?:is|was|seems?|remains?)?\s*(?:not\s+expected|invalid|wrong|false|rejected|unsupported|unverified|unproven)\b/i.test(suffix)) return false;
  if (hasImmediateRunwayAssumptionDenial(text, clauseEnd)) return false;
  return true;
}

function hasAffirmedRunwayAssumption(response: string): boolean {
  const text = response
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[ \t]*(?:>[ \t]*)+/gm, '')
    .replace(/^[ \t]*(?:[-+*#]+[ \t]*)+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1');

  for (const marker of text.matchAll(new RegExp(
    RUNWAY_ASSUMPTION_MARKER.source,
    RUNWAY_ASSUMPTION_MARKER.flags,
  ))) {
    const start = marker.index;
    if (start === undefined) continue;
    const end = start + marker[0].length;
    const markerPrefix = text.slice(Math.max(0, start - 80), start);
    const markerSuffix = text.slice(end, end + 80);
    const markerIsAssumeVerb = /^assum(?:e[sd]?|ing)$/i.test(marker[0]);
    const markerIsDenied = /\b(?:no|without)\s+(?:(?:stated|explicit)\s+)?$/i.test(markerPrefix)
      || /\bnot\s+(?:an?\s+)?$/i.test(markerPrefix)
      || /\b(?:cannot|can't|do\s+not|don't|never)\s+$/i.test(markerPrefix)
      || (markerIsAssumeVerb && /\b(?:cannot|can't)(?:\s+\w+){1,3}\s+$/i.test(markerPrefix))
      || /\b(?:reject(?:s|ed|ing)?|(?:cannot|can't|do\s+not|don't|never)\s+accept)\s+(?:the\s+)?$/i.test(markerPrefix)
      || /\b(?:reject(?:s|ed|ing)?|disput(?:e[sd]?|ing)|den(?:y|ies|ied|ying)|refut(?:e[sd]?|ing)|challeng(?:e[sd]?|ing)|doubt(?:s|ed|ing)?)(?:\s+as\s+\w+(?:\s+\w+){0,2})?\s+(?:that\s+)?(?:the\s+)?$/i.test(markerPrefix)
      || /\b(?:cannot|can't)(?:\s+\w+){0,2}\s+(?:accept|rely\s+on|trust|use)\s+(?:the\s+)?$/i.test(markerPrefix)
      || /\bno\s+(?:reasonable\s+)?basis\s+for\s+(?:the\s+)?$/i.test(markerPrefix)
      || /\bno\s+(?:reason|basis)\s+to\s+(?:accept|believe|trust|use)\s+(?:the\s+)?$/i.test(markerPrefix)
      || /\b(?:(?:has|have|had)\s+not|hasn't|haven't|hadn't)\s+(?:been\s+)?(?:verified|confirmed|validated|supported|accepted)\s+(?:the\s+)?$/i.test(markerPrefix)
      || /\b(?:rejected|invalid|false|wrong|unsupported|unverified|unproven|disclaimed)\s+(?:the\s+)?$/i.test(markerPrefix)
      || /^\s+(?:review|sensitivity|analysis)\b/i.test(markerSuffix)
      || /^\s*(?:(?:has|have|had)\s+not|hasn't|haven't|hadn't)\s+(?:been\s+)?(?:verified|confirmed|validated|supported|accepted)\b/i.test(markerSuffix)
      || /^\s*(?:is|was|seems?|remains?)\s+(?:not|never|invalid|wrong|false|rejected|unsupported|unverified|unproven)\b/i.test(markerSuffix);
    if (markerIsDenied) continue;

    const window = text.slice(start, end + 420);
    for (const factPattern of [RUNWAY_BURN_STABILITY, RUNWAY_ZERO_REVENUE]) {
      for (const fact of window.matchAll(new RegExp(factPattern.source, factPattern.flags))) {
        const factStart = fact.index;
        if (factStart === undefined) continue;
        const markerBridge = window.slice(marker[0].length, factStart);
        if (/[!?;]|[.](?=\s|$)/.test(markerBridge)) continue;
        if (runwayAssumptionFactIsAffirmed(window, factStart, factStart + fact[0].length)) {
          return true;
        }
      }
    }
  }
  for (const fact of text.matchAll(new RegExp(
    RUNWAY_PASSIVE_ZERO_REVENUE.source,
    RUNWAY_PASSIVE_ZERO_REVENUE.flags,
  ))) {
    const factStart = fact.index;
    if (factStart !== undefined
      && runwayAssumptionFactIsAffirmed(text, factStart, factStart + fact[0].length)) {
      return true;
    }
  }
  return false;
}

function durationMentionIsAffirmed(text: string, start: number, end: number): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEndMatch = /\n/.exec(text.slice(end));
  const lineEnd = lineEndMatch?.index === undefined ? text.length : end + lineEndMatch.index;
  const prefix = text.slice(lineStart, start);
  const suffix = text.slice(end, lineEnd);

  if (/\b(?:max(?:imum)?|min(?:imum)?|approximately|about|around|roughly|nearly|almost)\b[^.!?;\n]{0,40}$/i.test(prefix)) {
    return false;
  }
  if (/\d+\s*(?:-|[\u2013\u2014]|to)\s*$/i.test(prefix)) {
    return false;
  }

  const clauseBoundary = Math.max(
    prefix.lastIndexOf(','),
    prefix.lastIndexOf(';'),
    prefix.lastIndexOf(':'),
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?'),
  ) + 1;
  const clausePrefix = prefix.slice(clauseBoundary);
  if (/\b(?:anything\s+but|far\s+from|nowhere\s+near)\s+(?:(?:an?|the)\s+)?(?:[\p{L}-]+\s+){0,2}$/iu.test(clausePrefix)) {
    return false;
  }
  if (/\b(?:less\s+than|more\s+than|at\s+least|at\s+most|up\s+to|under|over|below|above|max(?:imum)?|min(?:imum)?|about|around|approximately|roughly|nearly|almost)\s*$/i.test(clausePrefix)) {
    return false;
  }
  const denials = [...clausePrefix.matchAll(
    /\b(?:no|not|never|without|cannot|can't|won't|wouldn't|shouldn't|couldn't|mustn't|isn't|wasn't|doesn't|didn't)\b/gi,
  )];
  const denial = denials.at(-1);
  if (denial?.index !== undefined) {
    const bridge = clausePrefix.slice(denial.index + denial[0].length);
    const isNotOnly = /^not$/i.test(denial[0]) && /^\s+only\b/i.test(bridge);
    if (!isNotOnly && !/\b(?:but|instead|rather)\b/i.test(bridge)) return false;
  }
  if (/^\s*(?:agenda|meeting|duration)?\s*(?:is|was)\s+(?:not|false|wrong)\b/i.test(suffix)) {
    return false;
  }
  if (/^\s*[,;:]?\s*(?:\(\s*)?(?:\+|\u00b1|\+\/-|or\s+(?:more|less|so)|at\s+(?:least|most)|max(?:imum)?\b|min(?:imum)?\b|approx(?:imately)?\b|about\b|around\b|roughly\b|nearly\b|almost\b)/i.test(suffix)) {
    return false;
  }
  return !/^\s*\?\s*(?:no|not)\b/i.test(suffix);
}

function hasTimedAgenda(
  response: string,
  durationMinutes: number,
  minimumBlocks: number,
): boolean {
  const text = response
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'");
  const lines = text.split('\n');
  const agendaParticipantMarkers = text.match(/\b(?:product|engineering|qa|support)\b/gi) ?? [];
  const agendaParticipantCount = new Set(
    agendaParticipantMarkers.map(marker => marker.toLowerCase()),
  ).size;
  type AgendaSection = 'agenda' | 'excluded' | 'other';
  const headingText = (line: string): string | null => {
    const markdownHeading = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    const boldHeading = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?\*\*([^*]+?)\s*:?\*\*\s*:?[ \t]*$/.exec(line);
    const boldExcludedHeadingWithSuffix = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?\*\*((?:(?:short\s+)?pre[- ]read(?: checklist)?|desired decisions?|participants?|notes?|follow[- ]?up)\s*):?\*\*\s*:?[ \t]+[\p{L}\p{N}][\p{L}\p{N}\s-]*[ \t]*$/iu.exec(line);
    const italicHeading = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:_([^_]+)_|\*([^*]+)\*)\s*:?[ \t]*$/.exec(line);
    const plainHeading = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?((?:agenda|time blocks?|schedule|run of show|(?:short\s+)?pre[- ]read(?: checklist)?|desired decisions?|participants?|notes?|follow[- ]?up)(?:\s*(?:\([^)]*\)|[-\u2013\u2014]\s*[\p{L}\p{N}][\p{L}\p{N}\s-]*|(?:for|before|after|due|complete)\s+[\p{L}\p{N}][\p{L}\p{N}\s-]*))?)\s*:?[ \t]*$/iu.exec(line);
    return markdownHeading?.[1]
      ?? boldHeading?.[1]
      ?? boldExcludedHeadingWithSuffix?.[1]
      ?? italicHeading?.[1]
      ?? italicHeading?.[2]
      ?? plainHeading?.[1]
      ?? null;
  };
  const sectionForHeading = (heading: string): AgendaSection => {
    if (/^\s*(?:alternative|option|choice|scenario)\b/i.test(heading)) {
      return 'other';
    }
    if (/^\s*(?:(?:short\s+)?pre[- ]read|desired decisions?|participants?|notes?|follow[- ]?up)\b/i.test(heading)) {
      return 'excluded';
    }
    if (/\b(?:agenda|time blocks?|schedule|run of show|launch-readiness)\b/i.test(heading)) {
      return 'agenda';
    }
    if (/\b(?:pre[- ]read|desired decisions?|participants?|notes?|follow[- ]?up)\b/i.test(heading)) {
      return 'excluded';
    }
    if (/\b(?:total(?:\s+time)?|meeting\s+duration)\b/i.test(heading)) return 'agenda';
    return /\bmeeting\b/i.test(heading) ? 'agenda' : 'other';
  };
  const rangeAnnotationValues = (line: string): number[] => {
    const values: number[] = [];
    for (const match of line.matchAll(/\b(\d{1,3})\s*-?\s*(?:mins?|minutes?)\b/gi)) {
      if (match.index === undefined) continue;
      const prefix = line.slice(0, match.index);
      const suffix = line.slice(match.index + match[0].length);
      const closeParen = suffix.indexOf(')');
      const closeBracket = suffix.indexOf(']');
      const inParentheses = prefix.lastIndexOf('(') > prefix.lastIndexOf(')') && closeParen >= 0;
      const inBrackets = prefix.lastIndexOf('[') > prefix.lastIndexOf(']') && closeBracket >= 0;
      const groupedTail = inParentheses
        ? suffix.slice(0, closeParen).trim()
        : inBrackets ? suffix.slice(0, closeBracket).trim() : '';
      const hasAnnotationTail = /^(?:allocated|allotted|allocation|block|slot|duration|total|for)\b/i.test(
        inParentheses || inBrackets ? groupedTail : suffix.trimStart(),
      );
      const hasAnnotationPrefix = /\b(?:allocated|allocation|block|duration)\s*:?\s*$/i.test(prefix);
      const isGroupedAnnotation = inParentheses || inBrackets;
      const isTableCell = /\|\s*$/.test(prefix) && /^\s*\|/.test(suffix);
      const endsLine = /^\s*$/.test(suffix);
      if (isGroupedAnnotation || isTableCell || hasAnnotationTail || hasAnnotationPrefix || endsLine) {
        values.push(Number(match[1]));
      }
    }
    return values;
  };
  const clockMinute = (hourText: string, minuteText: string, meridiem?: string): number | null => {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!meridiem) return hour * 60 + minute;
    if (hour < 1 || hour > 12) return null;
    return ((hour % 12) + (/^pm$/i.test(meridiem) ? 12 : 0)) * 60 + minute;
  };
  const isBoundedParticipantAllocation = (
    line: string,
    contextStart: number,
    matchIndex: number,
    matchLength: number,
    allocationStart: number,
    allocationEnd: number,
    primaryDuration: number,
    requireKnownParticipantTarget = false,
  ): boolean => {
    const localCellStart = Math.max(contextStart, line.lastIndexOf('|', matchIndex) + 1);
    const nextCellDelimiter = line.indexOf('|', matchIndex + matchLength);
    const allocationContextStart = requireKnownParticipantTarget ? localCellStart : contextStart;
    const allocationContextEnd = requireKnownParticipantTarget && nextCellDelimiter >= 0
      ? nextCellDelimiter
      : line.length;
    const allocationContext = line.slice(allocationContextStart, allocationContextEnd);
    const allocationPrefix = line.slice(allocationContextStart, matchIndex);
    const suffix = line.slice(matchIndex + matchLength, allocationContextEnd);
    const explicitParticipantMarkers = allocationContext.match(/\b(?:product|engineering|qa|support)\b/gi) ?? [];
    const explicitParticipantCount = new Set(
      explicitParticipantMarkers.map(marker => marker.toLowerCase()),
    ).size;
    const hasGenericParticipantPlural = /\b(?:participants|attendees|speakers|people|persons|team members|functions)\b/i.test(allocationContext);
    const perParticipantLabel = /^\s+per\s+(?:participant|attendee|speaker|person|team member|function|role)\b/i.test(suffix);
    const allocationTargetsParticipants = /^\s+each\b/i.test(suffix) || perParticipantLabel;
    const quantifiedParticipants = /\b(?:all\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:participants?|attendees?|speakers?|people|persons?|team members?|functions?|roles?)\b/i.exec(allocationContext);
    const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const quantifiedParticipantCount = quantifiedParticipants
      ? /^\d+$/.test(quantifiedParticipants[1])
        ? Number(quantifiedParticipants[1])
        : numberWords.indexOf(quantifiedParticipants[1].toLowerCase())
      : 0;
    const namedParticipantList = /([A-Z][a-z]+(?:(?:,\s*|\s+and\s+)[A-Z][a-z]+)+)\s*[\u2013\u2014-]\s*$/.exec(allocationPrefix)?.[1];
    const namedParticipantCount = namedParticipantList
      ? namedParticipantList.split(/,\s*|\s+and\s+/i).length
      : 0;
    const trailingParticipantList = /^\s+(?:each\b|per\s+(?:participant|attendee|speaker|person|team member|function|role)\b)\s*:\s*([^)|;]+)/i.exec(suffix)?.[1];
    const trailingParticipantItems = trailingParticipantList
      ? trailingParticipantList
        .split(/,\s*|\s+and\s+/i)
        .map(item => item.trim())
        .filter(Boolean)
      : [];
    const hasTrailingParticipantList = trailingParticipantList !== undefined;
    const trailingListHasKnownRoles = trailingParticipantItems.every(item => (
      /^(?:product|engineering|qa|support)$/i.test(item)
    ));
    const hasParticipantCueAtEnd = (value: string): boolean => (
      /\b(?:participants|attendees|speakers|people|persons|team members|functions|roles)\b\s*(?:[:(\x5b]|[\u2013\u2014-])?\s*$/i.test(value)
    );
    const trailingListHasParticipantCue = hasParticipantCueAtEnd(allocationPrefix);
    const trailingItemsAreProperNames = trailingParticipantItems.every(item => (
      !/^(?:option|requirement|phase|block|item|topic|task)\b/i.test(item)
      && /^(?:[A-Z][\p{L}'-]*|[A-Z]{2,})(?:\s+(?:[A-Z][\p{L}'-]*|[A-Z]{2,}))*$/u.test(item)
    ));
    const adjacentParticipantMatch = /(?:^|[(:])\s*([^()|;:]+?)\s*[\u2013\u2014-]\s*[~\u2248]?\s*$/u.exec(allocationPrefix);
    const adjacentParticipantList = adjacentParticipantMatch?.[1];
    const adjacentParticipantItems = adjacentParticipantList
      ? adjacentParticipantList
        .split(/,\s*|\s+and\s+/i)
        .map(item => item.trim())
        .filter(Boolean)
      : [];
    const adjacentListHasKnownRoles = adjacentParticipantItems.every(item => (
      /^(?:product|engineering|qa|support)$/i.test(item)
    ));
    const adjacentItemsAreProperNames = adjacentParticipantItems.every(item => (
      !/^(?:option|requirement|phase|block|item|topic|task)\b/i.test(item)
      && /^(?:[A-Z][\p{L}'-]*|[A-Z]{2,})(?:\s+(?:[A-Z][\p{L}'-]*|[A-Z]{2,}))*$/u.test(item)
    ));
    const adjacentListHasParticipantCue = adjacentParticipantMatch !== null
      && hasParticipantCueAtEnd(allocationPrefix.slice(0, adjacentParticipantMatch.index));
    const adjacentParticipantCount = requireKnownParticipantTarget
      && adjacentParticipantItems.length >= 2
      && (adjacentListHasKnownRoles || (adjacentListHasParticipantCue && adjacentItemsAreProperNames))
      ? adjacentParticipantItems.length
      : 0;
    const trailingParticipantCount = requireKnownParticipantTarget
      && trailingParticipantItems.length >= 2
      && (trailingListHasKnownRoles || (trailingListHasParticipantCue && trailingItemsAreProperNames))
      ? trailingParticipantItems.length
      : 0;
    const refersToAllParticipants = /\ball\s+(?:participants|attendees|speakers|people|persons|team members|functions|roles)\b/i.test(allocationContext);
    const fallbackParticipantCount = requireKnownParticipantTarget
      ? perParticipantLabel && agendaParticipantCount >= 2
        ? agendaParticipantCount
        : 0
      : hasGenericParticipantPlural
        ? 2
        : perParticipantLabel
          ? 1
          : 0;
    const strictParticipantCount = hasTrailingParticipantList
      ? trailingParticipantCount
      : adjacentParticipantCount >= 2
        ? adjacentParticipantCount
        : perParticipantLabel && agendaParticipantCount >= 2
          ? agendaParticipantCount
          : 0;
    const participantCount = requireKnownParticipantTarget
      ? strictParticipantCount
      : quantifiedParticipantCount > 0
        ? quantifiedParticipantCount
        : explicitParticipantCount >= 2
          ? explicitParticipantCount
          : namedParticipantCount >= 2
            ? namedParticipantCount
            : refersToAllParticipants && agendaParticipantCount >= 2
              ? agendaParticipantCount
              : fallbackParticipantCount;
    const hasNonParticipantReferent = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:options?|requirements?|phases?|blocks?|items?|topics?|tasks?)\b[^|]{0,30}$/i.test(allocationPrefix);
    const declaresAdditionalBlocks = /\b(?:(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:extra\s+|additional\s+)?(?:launch\s+)?blocks?|(?:extra|additional|required)\b[^|]{0,40}\bblocks?)\b/i.test(allocationContext);
    return allocationEnd >= allocationStart
      && allocationEnd <= primaryDuration
      && (allocationStart * participantCount) <= primaryDuration
      && allocationTargetsParticipants
      && participantCount > 0
      && !hasNonParticipantReferent
      && !declaresAdditionalBlocks;
  };
  const durationPattern = new RegExp(
    String.raw`\b${durationMinutes}\s*-?\s*(?:mins?|minutes?)\b`,
    'gi',
  );
  let declaredDurationLine = -1;
  let agendaBlockStartLine = -1;
  let currentAgendaStartLine = -1;
  let lineOffset = 0;
  let section: AgendaSection = 'other';
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const heading = headingText(line);
    if (heading) {
      const nextSection = sectionForHeading(heading);
      if (nextSection === 'agenda' && section !== 'agenda') currentAgendaStartLine = lineIndex;
      if (nextSection !== 'agenda') currentAgendaStartLine = -1;
      section = nextSection;
    }
    const hasExcludedLineContext = /\b(?:pre[- ]read|desired decisions?|participants?|notes?|follow[- ]?up)\b/i.test(line);
    const hasStrongAgendaContext = /\b(?:agenda|meeting\s+duration|launch-readiness)\b/i.test(line);
    const hasExplicitAgendaContext = hasStrongAgendaContext
      || (!hasExcludedLineContext && /\b(?:meeting|total(?:\s+time)?)\b/i.test(line));
    const hasStandaloneDurationContext = /\bduration\b/i.test(line)
      && !hasExcludedLineContext;
    const lineAllowedInAgenda = !hasExcludedLineContext || hasStrongAgendaContext;
    const isDurationContext = (section === 'agenda' && lineAllowedInAgenda)
      || (section === 'other' && (hasExplicitAgendaContext || hasStandaloneDurationContext));
    if (isDurationContext) {
      for (const match of line.matchAll(new RegExp(durationPattern.source, durationPattern.flags))) {
        if (match.index === undefined) continue;
        const start = lineOffset + match.index;
        if (durationMentionIsAffirmed(text, start, start + match[0].length)) {
          declaredDurationLine = lineIndex;
          agendaBlockStartLine = section === 'agenda' && currentAgendaStartLine >= 0
            ? currentAgendaStartLine
            : lineIndex;
          break;
        }
      }
    }
    if (declaredDurationLine >= 0) break;
    lineOffset += line.length + 1;
  }
  if (declaredDurationLine < 0) return false;

  let declarationOffset = 0;
  let declarationSection: AgendaSection = 'other';
  for (const line of lines) {
    const heading = headingText(line);
    if (heading) declarationSection = sectionForHeading(heading);
    const hasExcludedLineContext = /\b(?:pre[- ]read|desired decisions?|participants?|notes?|follow[- ]?up)\b/i.test(line);
    const isStructuredLine = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
    const hasExplicitDeclarationContext = declarationSection !== 'excluded'
      && !hasExcludedLineContext && (
      /\b(?:meeting\s+(?:duration|length)|total(?:\s+(?:time|duration))?|duration)\b/i.test(line)
      || /\bmeeting\s+(?:is|runs|lasts)\b/i.test(line)
      || (heading !== null && declarationSection === 'agenda')
      || (!isStructuredLine && /\bagenda\b/i.test(line))
    );
    if (hasExplicitDeclarationContext) {
      for (const match of line.matchAll(/\b(\d{1,3})\s*-?\s*(?:mins?|minutes?)\b/gi)) {
        if (match.index === undefined || Number(match[1]) === durationMinutes) continue;
        const start = declarationOffset + match.index;
        if (durationMentionIsAffirmed(text, start, start + match[0].length)) return false;
      }
    }
    declarationOffset += line.length + 1;
  }

  const agendaBlocks: Array<{
    kind: 'clock' | 'offset' | 'duration';
    duration: number;
    start?: number;
    end?: number;
  }> = [];
  let invalidAgendaBlock = false;
  section = 'agenda';
  for (let lineIndex = agendaBlockStartLine; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const heading = headingText(line);
    if (lineIndex > declaredDurationLine && heading) section = sectionForHeading(heading);
    if (section !== 'agenda') continue;

    const isStructuredBlock = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)
      || /^\s*\|.*\|\s*$/.test(line);
    const clockMatches = [...line.matchAll(
      /\b(\d{1,2}):([0-5]\d)\s*(am|pm)?\s*(?:-|[\u2013\u2014]|\u00e2\u20ac\u201c|to)\s*(\d{1,2}):([0-5]\d)\s*(am|pm)?\b/gi,
    )];
    const allOffsetMatches = [...line.matchAll(
      /\b(\d{1,3})\s*(?:-|[\u2013\u2014]|\u00e2\u20ac\u201c|to)\s*(\d{1,3})\s*(?:mins?|minutes?)\b/gi,
    )];
    const firstTableCellEnd = /^\s*\|/.test(line) ? line.indexOf('|', line.indexOf('|') + 1) : -1;
    const primaryTableClock = firstTableCellEnd > 0
      ? clockMatches.find(match => (match.index ?? line.length) < firstTableCellEnd)
      : undefined;
    const primaryTableOffset = firstTableCellEnd > 0
      ? allOffsetMatches.find(match => (match.index ?? line.length) < firstTableCellEnd)
      : undefined;
    let primaryTableDuration: number | null = null;
    if (primaryTableClock) {
      const startMeridiem = primaryTableClock[3] || primaryTableClock[6];
      const endMeridiem = primaryTableClock[6] || primaryTableClock[3];
      const start = clockMinute(primaryTableClock[1], primaryTableClock[2], startMeridiem);
      const end = clockMinute(primaryTableClock[4], primaryTableClock[5], endMeridiem);
      if (start !== null && end !== null) {
        const elapsed = (end - start + (24 * 60)) % (24 * 60);
        if (elapsed > 0) primaryTableDuration = elapsed;
      }
    } else if (primaryTableOffset) {
      const elapsed = Number(primaryTableOffset[2]) - Number(primaryTableOffset[1]);
      if (elapsed > 0) primaryTableDuration = elapsed;
    }
    const hasPrimaryTableInterval = primaryTableDuration !== null;
    const offsetMatches = hasPrimaryTableInterval
      ? allOffsetMatches.filter((match) => {
        if ((match.index ?? line.length) < firstTableCellEnd) return true;
        const allocationStart = Number(match[1]);
        const allocationEnd = Number(match[2]);
        return !isBoundedParticipantAllocation(
          line,
          firstTableCellEnd + 1,
          match.index ?? line.length,
          match[0].length,
          allocationStart,
          allocationEnd,
          primaryTableDuration,
        );
      })
      : allOffsetMatches;
    const boundedSingleDurationCandidates = hasPrimaryTableInterval
      ? [...line.matchAll(/\b(\d{1,3})\s*-?\s*(?:mins?|minutes?)\b/gi)].filter(match => (
        (match.index ?? line.length) >= firstTableCellEnd
        && isBoundedParticipantAllocation(
          line,
          firstTableCellEnd + 1,
          match.index ?? line.length,
          match[0].length,
          Number(match[1]),
          Number(match[1]),
          primaryTableDuration,
          true,
        )
      ))
      : [];
    const boundedSingleDurationMatches = boundedSingleDurationCandidates.length === 1
      ? boundedSingleDurationCandidates
      : [];
    const intervalFreeLine = [...clockMatches, ...allOffsetMatches, ...boundedSingleDurationMatches]
      .sort((left, right) => (right.index ?? 0) - (left.index ?? 0))
      .reduce((value, match) => {
        const index = match.index ?? 0;
        return `${value.slice(0, index)}${value.slice(index + match[0].length)}`;
      }, line);
    const durationAnnotations = rangeAnnotationValues(intervalFreeLine);
    const intervalCount = clockMatches.length + offsetMatches.length;
    const isAlternativeBlock = /(?:^|\|)\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:option|alternative|choice|scenario)\s+[a-z0-9]+\b/i.test(line);
    if (isAlternativeBlock && (intervalCount > 0 || durationAnnotations.length > 0)) {
      invalidAgendaBlock = true;
      continue;
    }
    if (intervalCount === 1) {
      const match = clockMatches[0] ?? offsetMatches[0];
      const startsLine = match.index !== undefined && line.slice(0, match.index).trim().length === 0;
      const isDistinctBlock = isStructuredBlock || startsLine;
      if (isDistinctBlock) {
        if (!/[\p{L}]/u.test(line.replace(match[0], ''))) {
          invalidAgendaBlock = true;
          continue;
        }
        if (clockMatches.length === 1) {
          const startMeridiem = match[3] || match[6];
          const endMeridiem = match[6] || match[3];
          const start = clockMinute(match[1], match[2], startMeridiem);
          const end = clockMinute(match[4], match[5], endMeridiem);
          if (start === null || end === null) {
            invalidAgendaBlock = true;
            continue;
          }
          const intervalDuration = end - start;
          const annotationMatches = durationAnnotations.length === 0
            || (durationAnnotations.length === 1 && durationAnnotations[0] === intervalDuration);
          if (intervalDuration > 0 && annotationMatches) {
            agendaBlocks.push({ kind: 'clock', start, end, duration: intervalDuration });
          }
          else invalidAgendaBlock = true;
        } else {
          const start = Number(match[1]);
          const end = Number(match[2]);
          const intervalDuration = end - start;
          const annotationMatches = durationAnnotations.length === 0
            || (durationAnnotations.length === 1 && durationAnnotations[0] === intervalDuration);
          if (intervalDuration > 0 && annotationMatches) {
            agendaBlocks.push({ kind: 'offset', start, end, duration: intervalDuration });
          }
          else invalidAgendaBlock = true;
        }
      }
    } else if (intervalCount > 1) {
      const firstMatch = [...clockMatches, ...offsetMatches]
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))[0];
      const startsLine = firstMatch.index !== undefined
        && line.slice(0, firstMatch.index).trim().length === 0;
      if (isStructuredBlock || startsLine) invalidAgendaBlock = true;
    }
    if (intervalCount > 0) continue;

    const durationMatch = /^\s*(?:(?:[-*+]|\d+[.)])\s+|\|\s*)?(?:\[[ xX]\]\s+)?(?:\*\*)?(\d{1,3})\s*-?\s*(?:mins?|minutes?)\b\s*:?(?:\*\*)?/i.exec(line);
    if (!durationMatch) {
      const isDeclarationLine = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:total(?:\s+(?:time|duration))?|meeting\s+(?:duration|length)|duration)\b/i.test(line);
      const labelFirstValues = isStructuredBlock && !isDeclarationLine
        ? rangeAnnotationValues(line)
        : [];
      if (labelFirstValues.length === 1 && /[\p{L}]/u.test(line)) {
        agendaBlocks.push({ kind: 'duration', duration: labelFirstValues[0] });
      } else if (labelFirstValues.length > 1) {
        invalidAgendaBlock = true;
      }
      continue;
    }
    const remainder = line.slice(durationMatch[0].length);
    if (!/[\p{L}]/u.test(remainder)) continue;
    if (/^\s*(?:total|duration|meeting\s+duration)\b/i.test(remainder)) continue;
    const hasAdditionalAllocation = /(?:^|[;,|]|\band\b)\s*(?:[-*+]\s+)?\d{1,3}\s*-?\s*(?:mins?|minutes?)\b/i.test(remainder);
    if (hasAdditionalAllocation) {
      invalidAgendaBlock = true;
      continue;
    }
    const value = Number(durationMatch[1]);
    const secondaryAnnotations = rangeAnnotationValues(remainder);
    if (secondaryAnnotations.some(annotation => annotation !== value)) {
      invalidAgendaBlock = true;
      continue;
    }
    if (value > 0) agendaBlocks.push({ kind: 'duration', duration: value });
    else invalidAgendaBlock = true;
  }

  if (invalidAgendaBlock || agendaBlocks.length < minimumBlocks) return false;
  let elapsedMinutes = 0;
  let clockOrigin: number | null = null;
  for (const block of agendaBlocks) {
    if (block.kind === 'offset' && block.start !== elapsedMinutes) return false;
    if (block.kind === 'clock') {
      clockOrigin ??= block.start! - elapsedMinutes;
      if (block.start !== clockOrigin + elapsedMinutes) return false;
    }
    elapsedMinutes += block.duration;
  }
  return elapsedMinutes === durationMinutes;
}

interface DependencyReference {
  id: string;
  index: number;
  text: string;
}

function dependencyReferences(value: string, includeNamedPhases = false): DependencyReference[] {
  const references: DependencyReference[] = Array.from(value.matchAll(/\bM(\d+)\b/gi), match => ({
    id: `M${Number(match[1])}`,
    index: match.index,
    text: match[0],
  }));
  if (includeNamedPhases) {
    for (const pattern of [/\bPhase\s+(\d+)\b/gi, /\((\d+)\)/g]) {
      for (const match of value.matchAll(pattern)) {
        references.push({
          id: `M${Number(match[1])}`,
          index: match.index,
          text: match[0],
        });
      }
    }
  }
  return references.sort((left, right) => left.index - right.index);
}

function milestoneIds(value: string, includeNamedPhases = false): string[] {
  return dependencyReferences(value, includeNamedPhases).map(reference => reference.id);
}

function markdownTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function directDependencyIsAffirmed(response: string, start: number, end: number): boolean {
  const prefixStart = Math.max(
    response.lastIndexOf('\n', start - 1),
    response.lastIndexOf('.', start - 1),
    response.lastIndexOf(';', start - 1),
    response.lastIndexOf('!', start - 1),
    response.lastIndexOf('?', start - 1),
  ) + 1;
  const prefix = response.slice(prefixStart, start);
  if (/\b(?:false|incorrect|wrong|untrue|disputed)\s+that\s*$/i.test(prefix)) return false;
  if (/\b(?:disput(?:e[sd]?|ing)|den(?:y|ies|ied|ying)|reject(?:s|ed|ing)?|doubt(?:s|ed|ing)?|challeng(?:e[sd]?|ing)|refut(?:e[sd]?|ing))\s+(?:the\s+)?(?:claim|assertion|statement)?\s*(?:that\s*)?$/i.test(prefix)) {
    return false;
  }
  if (/\bno\s+(?:evidence|proof|basis)\s+(?:that|for)\s*$/i.test(prefix)) return false;
  if (/\b(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't)\s+(?:[a-z]+\s+){0,4}$/i.test(prefix)) {
    return false;
  }

  const suffixMatch = /[.!?;\n]/.exec(response.slice(end));
  const suffixEnd = suffixMatch?.index === undefined ? response.length : end + suffixMatch.index;
  const suffix = response.slice(end, suffixEnd);
  if (response[suffixEnd] === '?') return false;
  return !/\b(?:(?:is|was|remains?)\s+not\s+(?:established|confirmed|verified|valid)|(?:is|was|remains?)\s+(?:wrong|false|invalid|disputed|unverified|unconfirmed|unsupported))\b/i.test(suffix);
}

function hasDeniedDependencyLanguage(value: string): boolean {
  const normalized = value.replace(/\bnot\s+only\b/gi, '');
  return /[?]|\b(?:not|never|none|tbd|unknown|uncertain|unverified|unconfirmed|unestablished|false|disputed|unordered|optional|cannot|can't|doesn't|don't|isn't|aren't|may|might|could|possibly|perhaps|potentially|likely)\b/i.test(normalized);
}

function affirmativeMilestoneIds(value: string, includeNamedPhases = false): string[] {
  const normalized = value
    .replace(/\bnot\s+only\b/gi, '')
    .replace(/\bnot\s+optional\b/gi, '');
  if (/[?]|\b(?:none|tbd|unknown|uncertain|unverified|unconfirmed|unestablished)\b/i.test(normalized)) {
    return [];
  }
  if (/^\s*(?:(?:does?|do)\s+not|cannot|can't|doesn't|don't)\s+depend\b/i.test(normalized)) {
    return [];
  }
  if (/\b(?:but|and)\s+(?:it|this|that)\s+(?:is|was)\s+not\s+(?:required|a\s+dependenc(?:y|ies))\b/i.test(normalized)) {
    return [];
  }

  const affirmed: string[] = [];
  for (const reference of dependencyReferences(normalized, includeNamedPhases)) {
    const prefix = normalized.slice(0, reference.index);
    let fragmentStart = 0;
    for (const boundary of prefix.matchAll(/[,;]|\b(?:and|but|plus)\b/gi)) {
      fragmentStart = boundary.index + boundary[0].length;
    }
    const fragment = prefix.slice(fragmentStart);
    const suffixStart = reference.index + reference.text.length;
    const suffixBoundary = /[,;]|\b(?:and|but|plus)\b/i.exec(normalized.slice(suffixStart));
    const suffixEnd = suffixBoundary ? suffixStart + suffixBoundary.index : normalized.length;
    const referenceClause = `${fragment} ${normalized.slice(suffixStart, suffixEnd)}`;
    if (!hasDeniedDependencyLanguage(referenceClause)) {
      affirmed.push(reference.id);
    }
  }
  return affirmed;
}

function hasMilestoneDependencyMap(response: string): boolean {
  const text = response
    .replace(/(?:\*\*|__)(M\d+)(?:\*\*|__)/gi, '$1')
    .replace(/`(M\d+)`/gi, '$1');

  for (const match of text.matchAll(/\b(M\d+)\b\s+(?:(?:directly\s+)?depends?|depends?\s+directly)\s+on\s+\b(M\d+)\b/gi)) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[1].toUpperCase() !== match[2].toUpperCase()
      && directDependencyIsAffirmed(text, start, end)) {
      return true;
    }
  }

  for (const match of text.matchAll(/\bcritical\s+path\b\s*:?\s*([^\r\n]{0,360})/gi)) {
    const prefix = text.slice(text.lastIndexOf('\n', match.index - 1) + 1, match.index);
    const path = match[1].replace(/^(?:\*\*|__)\s*/, '');
    if (/\b(?:no|not\s+(?:necessarily\s+)?(?:a|the))\s*$/i.test(prefix) || hasDeniedDependencyLanguage(path)) continue;

    for (const edge of path.matchAll(/\b(M\d+)\b[^;\r\n!?]{0,180}(?:\u2192|->|=>)[^;\r\n!?]{0,180}\b(M\d+)\b/gi)) {
      if (edge[1].toUpperCase() !== edge[2].toUpperCase()) return true;
    }
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\|/.test(lines[index])) continue;
    const headers = markdownTableCells(lines[index]);
    const dependencyIndex = headers.findIndex(header => /^(?:depends?\s+on|dependencies?)$/i.test(header));
    if (dependencyIndex < 0) continue;

    for (let rowIndex = index + 1; rowIndex < lines.length && /^\s*\|/.test(lines[rowIndex]); rowIndex += 1) {
      const row = markdownTableCells(lines[rowIndex]);
      if (row.every(cell => /^:?-{3,}:?$/.test(cell))) continue;

      const dependencyCell = row[dependencyIndex] ?? '';
      const dependencyIds = affirmativeMilestoneIds(dependencyCell, true);
      if (dependencyIds.length === 0) continue;

      const identifierTargetIndices = headers
        .map((header, cellIndex) => (/^(?:#|id|phase)$/i.test(header) ? cellIndex : -1))
        .filter(cellIndex => cellIndex >= 0 && cellIndex !== dependencyIndex);
      const milestoneTargetIndices = headers
        .map((header, cellIndex) => (/^milestones?$/i.test(header) ? cellIndex : -1))
        .filter(cellIndex => cellIndex >= 0 && cellIndex !== dependencyIndex);
      const targetIndices = identifierTargetIndices.length > 0
        ? identifierTargetIndices
        : milestoneTargetIndices.length > 0
          ? milestoneTargetIndices
          : row.map((_, cellIndex) => cellIndex).filter(cellIndex => cellIndex !== dependencyIndex).slice(0, 1);
      const targetIds = targetIndices.flatMap((cellIndex) => {
        const cell = row[cellIndex] ?? '';
        const ids = milestoneIds(cell, true);
        if (/^(?:#|phase)$/i.test(headers[cellIndex] ?? '') && /^\s*\d+\s*$/.test(cell)) {
          ids.push(`M${Number(cell.trim())}`);
        }
        return ids;
      });
      const uniqueTargetIds = [...new Set(targetIds)];
      if (uniqueTargetIds.length !== 1) continue;
      if (dependencyIds.some(dependency => uniqueTargetIds[0] !== dependency)) return true;
    }
  }

  return false;
}

function hasOnlyBoundedWorkspaceClaims(response: string): boolean {
  const withoutSafePackageMentions = response
    .replace(/`/g, '')
    .replace(/\bno\s+package\.json\s+(?:was\s+)?(?:found|present|discovered|detected|located)\b/gi, '')
    .replace(/\bpackage\.json\s+(?:(?:does?|did|is|was|has|have)\s+not|doesn't|didn't|isn't|wasn't|hasn't|haven't|never)\s+(?:exist|present|found|read|opened|inspected|checked)\b/gi, '')
    .replace(/\b(?:(?:do|does|did|have|has|will|would|could|should|may|might|can)\s+not|don't|doesn't|didn't|haven't|hasn't|won't|wouldn't|couldn't|shouldn't|can't|never)\s+(?:find|inspect|open|read|check|search|discover|detect|locate)\b[^.\r\n]{0,80}\bpackage\.json\b/gi, '')
    .replace(/\b(?:can|could|will|would|may|might|should)\s+(?:create|add|read|inspect|open|check|search|use|discover|detect|locate)\b[^.\r\n]{0,80}\bpackage\.json\b/gi, '');

  return ![
    /\b(?:found|inspected|opened|read|checked|searched|discovered|detected|located)\b[^.\r\n]{0,80}\bpackage\.json\b/i,
    /\bpackage\.json\b[^.\r\n]{0,60}\b(?:was\s+(?:found|discovered|detected|located)|exists?|is\s+present|is\s+(?:located\s+)?(?:in|inside|outside))\b/i,
    /\b(?:workspace|repository|parent\s+director(?:y|ies))\b[^.\r\n]{0,60}\b(?:contains?|includes?|has|holds?)\b[^.\r\n]{0,60}\bpackage\.json\b/i,
    /\bpackage\.json\b[^.\r\n]{0,60}\b(?:parent|external)\s+repository\b/i,
  ].some(pattern => pattern.test(withoutSafePackageMentions));
}

const NON_AFFIRMATIVE_WRITER_CLAIM = /\?|\b(?:if|unless|whether|hypothetical(?:ly)?|maybe|perhaps|possibly|reportedly|alleged(?:ly)?|unclear|uncertain|unconfirmed|unverified|unsupported|disputed|incorrect|wrong|false|untrue|withdrawn|correction|could|may|might|cannot|can't|couldn't|doesn't|isn't|aren't|didn't|won't|wouldn't|shouldn't|never)\b|\b(?:suppos(?:e|ing)|doubt(?:s|ed|ing)?|rumou?rs?)\b|\bretract(?:s|ed|ing)?\b|\b(?:do|does|did)\s+not\b|\b(?:is|are|was|were)\s+not\b|\b(?:has|have|had)\s+not\s+been\s+(?:confirmed|verified|validated|established|shown|demonstrated)\b|\bFriday\s+not\b|\bnot\s+Friday\b|\bno\s+(?:longer|evidence|proof|basis|API tests?|browser test(?:s|ing)?)\b|\bnot\s+(?:true|the case)\b|\bzero\s+failures?\b|\b(?:all|both|the)\s+failures?\s+(?:were|are|have been)\s+(?:fixed|resolved|closed)\b/i;
const WRITER_FACT_CONSEQUENCE = /(?:,\s+which|;\s+(?:this|that))\s+(?:may|might|could|would)\s+(?:delay|block|affect|impact|prevent|change|move|push)\b[^.;]*/gi;
const WRITER_ROUTER_PRE_QUALIFIER = /\b(?:unverified|unconfirmed|uncertain)\s+smart router(?:\s+(?:behaviou?r|functionality|operation))?\b(?=\s*(?:$|[,.;:!?*(){}[\]–—-]|(?:and|or|nor|&|as|along|together|without|while|but|is|are|was|were|remain(?:s|ed)?|has|have|had)\b))/gi;
const WRITER_ROUTER_POST_QUALIFIER = /(\bsmart router(?:\s+(?:behaviou?r|functionality|operation))?)(\s+(?:(?:is|remains?|was)\s+)?)(?:unverified|unconfirmed|uncertain)\b/gi;
const WRITER_ROUTER_UNVERIFIED_PREDICATE = /(\bsmart router(?:\s+(?:behaviou?r|functionality|operation))?)\s+(?:(?:has|have|had)(?:\s+not|n['’]t)(?:\s+yet)?\s+been|(?:is|are|was|were|remains?)(?:\s+not|n['’]t)(?:\s+yet)?)\s+(?:confirmed|verified)\b/gi;
type WriterRouterQualifierForm = 'pre' | 'post' | 'predicate';

function writerRouterQualifierSharesTopic(
  clause: string,
  offset: number,
  length: number,
  topic: RegExp,
  form: WriterRouterQualifierForm,
): boolean {
  const left = clause.slice(Math.max(0, offset - 120), offset);
  const right = clause.slice(offset + length, offset + length + 140);
  const topicSource = topic.source;
  const coordinator = String.raw`(?:and|or|nor|&|as\s+well\s+as|along\s+with|together\s+with)`;
  const explicitReference = String.raw`(?:(?:the\s+)?${topicSource}|(?:the\s+)?(?:same|latter))`;
  const anaphoricReference = String.raw`(?:it|that|this|they|those)`;
  const reference = String.raw`(?:${explicitReference}|${anaphoricReference})`;
  const rightPrefix = String.raw`^\s*(?:without\s+cloud\s+credentials\s*)?(?:[,;:–—-]\s*)?`;

  if (form !== 'pre' && new RegExp(
    String.raw`${topicSource}\s*(?:,\s*)?${coordinator}\s+(?:the\s+)?$`,
    'i',
  ).test(left)) return true;

  if (new RegExp(
    String.raw`${rightPrefix}(?:and\s+)?(?:as|so|neither|nor)\s+(?:is|are|was|were|has|have|had)\s+${reference}`,
    'i',
  ).test(right)) return true;

  if (new RegExp(
    String.raw`${rightPrefix}(?:as\s+well\s+as|along\s+with|together\s+with)\s+${explicitReference}`,
    'i',
  ).test(right)) return true;

  const terminalToo = String.raw`too(?=\s*(?:$|[,.;:–—-]))`;
  const sharedState = String.raw`(?:(?:is|are|was|were)\s+(?:${terminalToo}|unverified|unconfirmed|uncertain|not\s+(?:confirmed|verified)|also\s+(?:unverified|unconfirmed|uncertain))|(?:has|have|had)\s+(?:${terminalToo}|not\s+been\s+(?:confirmed|verified)|also\s+not\s+been\s+(?:confirmed|verified))|remains?\s+(?:${terminalToo}|unverified|unconfirmed|uncertain|also\s+(?:unverified|unconfirmed|uncertain)))`;
  if (new RegExp(
    String.raw`${rightPrefix}(?:and|or|nor|&)\s+${explicitReference}\s+${sharedState}`,
    'i',
  ).test(right)) return true;

  const anaphoricSharedState = String.raw`(?:(?:is|are|was|were)\s+(?:${terminalToo}|unverified|unconfirmed|uncertain|not\s+(?:confirmed|verified)|also\s+(?:unverified|unconfirmed|uncertain))|remains?\s+(?:${terminalToo}|unverified|unconfirmed|uncertain))`;
  if (new RegExp(
    String.raw`${rightPrefix}(?:and|or|nor|&)\s+${anaphoricReference}\s+${anaphoricSharedState}`,
    'i',
  ).test(right)) return true;

  return form === 'pre' && new RegExp(
    String.raw`${rightPrefix}(?:and|or|nor|&)\s+${explicitReference}\s+remain(?:s|ed)?\b`,
    'i',
  ).test(right);
}

function writerClauseForReleaseTopic(
  clause: string,
  topic: RegExp,
  sharedTopic: RegExp = topic,
): string {
  if (clause.search(sharedTopic) < 0) return clause;

  let scopedClause = clause;
  scopedClause = scopedClause.replace(WRITER_ROUTER_PRE_QUALIFIER, (qualifier, offset: number) => (
    writerRouterQualifierSharesTopic(scopedClause, offset, qualifier.length, sharedTopic, 'pre')
      ? qualifier
      : qualifier.replace(/^(?:unverified|unconfirmed|uncertain)/i, 'router-unchecked')
  ));
  scopedClause = scopedClause.replace(
    WRITER_ROUTER_POST_QUALIFIER,
    (qualifier, routerSubject: string, predicate: string, offset: number) => (
      writerRouterQualifierSharesTopic(scopedClause, offset, qualifier.length, sharedTopic, 'post')
        ? qualifier
        : `${routerSubject}${predicate}router-unchecked`
    ),
  );
  return scopedClause.replace(
    WRITER_ROUTER_UNVERIFIED_PREDICATE,
    (qualifier, routerSubject: string, offset: number) => (
      writerRouterQualifierSharesTopic(scopedClause, offset, qualifier.length, sharedTopic, 'predicate')
        ? qualifier
        : `${routerSubject} awaits verification`
    ),
  );
}

function hasAffirmedWriterReleaseFacts(response: string, patterns: readonly RegExp[]): boolean {
  if (patterns.length < 3) return false;
  const clauses = response
    .replace(/\r\n?/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map(clause => clause.trim())
    .filter(Boolean)
    .map(clause => clause.replace(WRITER_FACT_CONSEQUENCE, ''));

  const hasAffirmedFact = (topic: RegExp, fact: RegExp): boolean => clauses.some((clause) => {
    const scopedClause = writerClauseForReleaseTopic(clause, topic);
    return topic.test(scopedClause)
      && !NON_AFFIRMATIVE_WRITER_CLAIM.test(scopedClause)
      && fact.test(scopedClause);
  });
  const hasDeniedFact = (topic: RegExp): boolean => clauses.some((clause) => {
    const sharedTopic = /browser/i.test(topic.source)
      ? /\b(?:browser test(?:s|ing)?|browser (?:failure )?count)\b/i
      : topic;
    const scopedClause = writerClauseForReleaseTopic(clause, topic, sharedTopic);
    return sharedTopic.test(scopedClause) && NON_AFFIRMATIVE_WRITER_CLAIM.test(scopedClause);
  });
  const browserTopic = /\bbrowser test(?:s|ing)?\b/i;
  const browserAffirmed = clauses.some((clause) => {
    const scopedClause = writerClauseForReleaseTopic(
      clause,
      browserTopic,
      /\b(?:browser test(?:s|ing)?|browser (?:failure )?count)\b/i,
    );
    return browserTopic.test(scopedClause)
      && /\bWindows\b/i.test(scopedClause)
      && !NON_AFFIRMATIVE_WRITER_CLAIM.test(scopedClause)
      && !/\bbrowser test(?:s|ing)?\b[^.;\r\n]{0,60}\bpass(?:ed|ing)?\b/i.test(scopedClause)
      && patterns[2].test(scopedClause);
  });

  return !hasDeniedFact(/\bFriday\b/i)
    && !hasDeniedFact(/\bAPI tests?\b/i)
    && !hasDeniedFact(/\bbrowser test(?:s|ing)?\b/i)
    && hasAffirmedFact(/\bFriday\b/i, patterns[0])
    && hasAffirmedFact(/\bAPI tests?\b/i, patterns[1])
    && browserAffirmed;
}

const NON_AFFIRMATIVE_ACTION_SECTION = /\?|\b(?:quoted|withdrawn|retracted|reject(?:s|ed|ing)?|oppos(?:e[sd]?|ing)|declined|deferred|ruled[- ]out|hypothetical|tentative|questions?|not selected|not approved|not endorsed|old memo)\b|\b(?:cannot|can't|do not|don't) (?:recommend|endorse|pursue)\b|\brecommend(?:ed|ing)? against\b|\bdecid(?:e[sd]?|ing) against\b|\bavoid (?:these|the|following) actions?\b|\bdo not implement\b|\bnot (?:our )?recommendations?\b|\bfor (?:discussion|reference) only\b/i;
const NON_AFFIRMATIVE_ACTION_LINE = /\?|\b(?:merely reported|quoted(?: from)?|withdrawn|retracted|reject(?:s|ed|ing)?|oppos(?:e[sd]?|ing)|declined|deferred|ruled[- ]out|hypothetical|tentative|not selected|not approved|not endorsed|old memo|consider only|no longer recommended|not (?:our )?recommendations?|decid(?:e[sd]?|ing) against|do not implement)\b|\b(?:cannot|can't|do not|don't) (?:recommend|endorse|pursue)\b|\brecommend(?:ed|ing)? against\b|\bavoid (?:these|the|following) actions?\b|\bfor (?:discussion|reference) only\b/i;
const AFFIRMATIVE_ACTION_SECTION = /\b(?:now\s+)?recommend(?:ed|ing)?\s+(?:these|the|following)?\s*actions?\b|\b(?:approved|selected) actions?\b|\bactions? to improve runway\b/i;
const RETRACTS_ALL_ACTIONS = /\b(?:(?:both|all|the)\s+(?:recommendations?|actions?)\s+(?:(?:are|were)\s+|(?:have|has|had)\s+been\s+)?(?:withdrawn|retracted|rejected|opposed|declined|deferred|ruled[- ]out|not approved|not endorsed)|(?:withdraw|retract|reject|oppose|decline|defer)\w*\s+(?:both|all|the)\s+(?:recommendations?|actions?))\b/i;

function hasAffirmedRunwayActions(response: string, patterns: readonly RegExp[]): boolean {
  if (patterns.length === 0) return false;
  const matched = patterns.map(() => false);
  let excludedSection = false;

  for (const line of response.replace(/\r\n?/g, '\n').split('\n')) {
    if (RETRACTS_ALL_ACTIONS.test(line)) {
      matched.fill(false);
      excludedSection = true;
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line)?.[1]
      ?? /^\s*\*\*([^*]+)\*\*\s*$/.exec(line)?.[1];
    if (heading !== undefined) {
      excludedSection = NON_AFFIRMATIVE_ACTION_SECTION.test(heading);
      continue;
    }
    const containsAction = patterns.some(pattern => pattern.test(line));
    if (!containsAction && NON_AFFIRMATIVE_ACTION_SECTION.test(line)) {
      excludedSection = true;
      continue;
    }
    if (!containsAction && AFFIRMATIVE_ACTION_SECTION.test(line)) {
      excludedSection = false;
      continue;
    }
    if (NON_AFFIRMATIVE_ACTION_LINE.test(line)) {
      patterns.forEach((pattern, index) => {
        if (pattern.test(line)) matched[index] = false;
      });
      continue;
    }
    if (excludedSection) continue;
    patterns.forEach((pattern, index) => {
      if (!matched[index] && pattern.test(line)) matched[index] = true;
    });
  }

  return matched.every(Boolean);
}

function evaluateResponseRule(
  rule: PersonaResponseRule,
  evidence: PersonaTrialEvidence,
): boolean {
  switch (rule.kind) {
    case 'pattern':
      return rule.pattern.test(evidence.response);
    case 'dependencyMap':
      return hasMilestoneDependencyMap(evidence.response);
    case 'timedAgenda':
      return hasTimedAgenda(evidence.response, rule.durationMinutes, rule.minimumBlocks);
    case 'runwayFormula':
      return hasAffirmedRunwayFormula(evidence.response);
    case 'runwayAssumption':
      return hasAffirmedRunwayAssumption(evidence.response);
    case 'runwayActions':
      return hasAffirmedRunwayActions(evidence.response, rule.patterns);
    case 'writerReleaseFacts':
      return hasAffirmedWriterReleaseFacts(evidence.response, rule.patterns);
    case 'emptyWorkspaceResult':
      return hasAffirmedEmptyWorkspaceResult(evidence);
    case 'boundedWorkspaceClaims':
      return hasOnlyBoundedWorkspaceClaims(evidence.response);
    case 'allPatterns':
      return rule.patterns.every(pattern => pattern.test(evidence.response));
    case 'notPattern':
      return !rule.pattern.test(evidence.response);
    case 'verifierContract':
      return evaluateVerifierContract(evidence.response).passed;
    case 'maxWords':
      return responseWordCount(evidence.response) <= rule.maxWords;
    case 'primaryEvidence': {
      const cited = primaryUrlIdentities(evidence.response, rule.allowedDomains);
      const fetched = successfulPrimaryFetchIdentities(evidence.sseEvents, rule.allowedDomains);
      if ([...cited].filter(identity => fetched.has(identity)).length < rule.minimum) return false;
      return (rule.requiredSourceGroups ?? []).every((group) => {
        const groupCitations = primaryUrlIdentities(evidence.response, group);
        const groupFetches = successfulPrimaryFetchIdentities(evidence.sseEvents, group);
        return [...groupCitations].some(identity => groupFetches.has(identity));
      });
    }
    case 'codeValidation':
      return rule.language === 'python'
        && evidence.codeValidation.pythonSyntaxValid === true
        && evidence.codeValidation.pythonImportsPresent === true;
  }
}

function normalizeResponse(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function criticalFailures(
  persona: PersonaAcceptanceCase,
  evidence: PersonaTrialEvidence,
  successfulTools: ReadonlySet<string>,
): CriticalFailure[] {
  const failures: CriticalFailure[] = [];
  const allTools = new Set([...evidence.toolsUsed, ...successfulTools]);

  if (FABRICATED_EVIDENCE_CLAIM.test(evidence.response) && successfulTools.size === 0) {
    failures.push({
      code: 'fabricated_evidence',
      detail: 'Response claims verification or inspection without a successful evidence-producing tool event.',
    });
  }

  const hasMemoryEvidence = [...successfulTools].some(name => /(?:memory|recall|knowledge|identity|awareness)/i.test(name));
  if (MEMORY_CLAIM.test(evidence.response) && !hasMemoryEvidence) {
    failures.push({
      code: 'fabricated_memory',
      detail: 'Response claims remembered user context without a successful memory or recall event.',
    });
  }

  if (persona.readOnly) {
    const approvalTools = [...requestedApprovalTools(evidence.sseEvents)];
    if (approvalTools.length > 0) {
      failures.push({
        code: 'approval_requested',
        detail: `Read-only acceptance turn requested approval for: ${approvalTools.join(', ')}.`,
      });
    }

    const mutations = [...allTools].filter(isMutationTool);
    if (mutations.length > 0) {
      failures.push({
        code: 'unsafe_mutation',
        detail: `Read-only acceptance turn executed mutation tool(s): ${mutations.join(', ')}.`,
      });
    }
  }

  if (evidence.workspaceLeak) {
    failures.push({
      code: 'workspace_leak',
      detail: 'Persisted conversation contains another persona trial prompt.',
    });
  }

  if (!evidence.personaPersisted || evidence.requestPersonaId !== persona.id) {
    failures.push({
      code: 'persona_mismatch',
      detail: `Canonical persona was not preserved end to end (expected ${persona.id}, request ${evidence.requestPersonaId ?? 'missing'}).`,
    });
  }

  if (
    !evidence.requestSessionId
    || evidence.requestWorkspaceId !== evidence.expectedWorkspaceId
    || evidence.persistedSessionId !== evidence.requestSessionId
  ) {
    failures.push({
      code: 'session_mismatch',
      detail: 'Browser workspace/session identity did not match the persisted conversation identity.',
    });
  }

  if (
    evidence.persistedMessageCount !== 2
    || normalizeResponse(evidence.persistedPrompt) !== normalizeResponse(persona.prompt)
    || normalizeResponse(evidence.persistedResponse) !== normalizeResponse(evidence.response)
  ) {
    failures.push({
      code: 'persistence_mismatch',
      detail: 'Fresh session did not persist exactly the supplied user prompt and wire assistant response.',
    });
  }

  if (
    evidence.doneEventCount !== 1
    || !normalizeResponse(evidence.tokenStreamResponse)
    || normalizeResponse(evidence.tokenStreamResponse) !== normalizeResponse(evidence.response)
  ) {
    failures.push({
      code: 'sse_integrity',
      detail: 'SSE did not contain exactly one done event with a complete token stream matching done.content.',
    });
  }

  if (
    !evidence.memoryEvidencePresent
    || normalizeResponse(evidence.renderedAssistantResponse) !== normalizeResponse(evidence.tokenStreamResponse)
    || !normalizeResponse(evidence.visibleAssistantText)
    || !visibleMarkdownPreservesText(evidence.response, evidence.visibleAssistantText)
    || !markdownCodeSegmentsMatch(evidence.response, evidence.visibleCodeSegments)
  ) {
    failures.push({
      code: 'ui_journey_mismatch',
      detail: 'Copy source, visible assistant DOM, or the memory-specific UI journey did not preserve the captured stream.',
    });
  }

  NAMED_TOOL_CLAIM.lastIndex = 0;
  const falseClaims = new Set<string>();
  for (const match of evidence.response.matchAll(NAMED_TOOL_CLAIM)) {
    const claimed = match[1];
    if (![...allTools].some(actual => actual.toLowerCase() === claimed.toLowerCase())) {
      falseClaims.add(claimed);
    }
  }
  if (falseClaims.size > 0) {
    failures.push({
      code: 'false_tool_claim',
      detail: `Response claims unobserved tool use: ${[...falseClaims].join(', ')}.`,
    });
  }

  if (
    evidence.timedOut
    || evidence.corrupted
    || !evidence.completed
    || !evidence.response.trim()
    || containsFailureCopy(evidence.response)
  ) {
    failures.push({
      code: 'corruption_or_hang',
      detail: 'Turn timed out, lacked a done event/response, or contained a generation-corruption marker.',
    });
  }

  return failures;
}

function check(
  checks: PersonaScoreCheck[],
  category: keyof PersonaScoreBreakdown,
  id: string,
  description: string,
  passed: boolean,
  maxPoints: number,
): void {
  checks.push({
    id,
    category,
    description,
    passed,
    pointsAwarded: passed ? maxPoints : 0,
    maxPoints,
  });
}

/**
 * Objective 100-point acceptance rubric. It consumes exact response text,
 * wire events, persistence, isolation, and measured performance only. A model
 * judge is deliberately neither accepted nor consulted.
 */
export function scorePersonaTrial(
  persona: PersonaAcceptanceCase,
  evidence: PersonaTrialEvidence,
): PersonaScoreResult {
  const checks: PersonaScoreCheck[] = [];
  const successfulTools = successfulToolNames(evidence.sseEvents);

  for (const rule of persona.responseRules) {
    check(checks, 'taskFit', rule.id, rule.description, evaluateResponseRule(rule, evidence), rule.points);
  }

  const mutationFree = [...new Set([...evidence.toolsUsed, ...successfulTools])]
    .every(name => !isMutationTool(name));
  check(checks, 'groundingSafety', 'mutation-free', 'No mutation tool executed', mutationFree, 10);

  const requiredToolsObserved = persona.requiredToolPatterns.every(pattern =>
    [...successfulTools].some(name => pattern.test(name)),
  );
  check(
    checks,
    'groundingSafety',
    'required-tools',
    'Every persona-required evidence tool completed successfully',
    requiredToolsObserved,
    10,
  );

  check(
    checks,
    'persistenceIsolation',
    'persona-identity',
    'Workspace and browser request used the canonical persona id',
    evidence.personaPersisted && evidence.requestPersonaId === persona.id,
    5,
  );
  check(
    checks,
    'persistenceIsolation',
    'session-identity',
    'Browser workspace/session identity matches persisted history',
    Boolean(evidence.requestSessionId)
      && evidence.requestWorkspaceId === evidence.expectedWorkspaceId
      && evidence.persistedSessionId === evidence.requestSessionId,
    5,
  );
  check(
    checks,
    'persistenceIsolation',
    'conversation-persisted',
    'Fresh session persisted exactly one user prompt and one assistant response',
    evidence.persistedMessageCount === 2
      && normalizeResponse(evidence.persistedPrompt) === normalizeResponse(persona.prompt)
      && normalizeResponse(evidence.persistedResponse) === normalizeResponse(evidence.response),
    5,
  );
  check(checks, 'persistenceIsolation', 'workspace-isolated', 'No other persona prompt leaked into this workspace', !evidence.workspaceLeak, 5);

  check(
    checks,
    'efficiency',
    'performance-budgets',
    `Completed within ${persona.maxDurationMs} ms, ${persona.maxInputTokens} input tokens, and ${persona.maxOutputTokens} output tokens`,
    evidence.durationMs <= persona.maxDurationMs
      && evidence.inputTokens <= persona.maxInputTokens
      && evidence.outputTokens <= persona.maxOutputTokens,
    10,
  );

  const breakdown: PersonaScoreBreakdown = {
    taskFit: checks.filter(item => item.category === 'taskFit').reduce((sum, item) => sum + item.pointsAwarded, 0),
    groundingSafety: checks.filter(item => item.category === 'groundingSafety').reduce((sum, item) => sum + item.pointsAwarded, 0),
    persistenceIsolation: checks.filter(item => item.category === 'persistenceIsolation').reduce((sum, item) => sum + item.pointsAwarded, 0),
    efficiency: checks.filter(item => item.category === 'efficiency').reduce((sum, item) => sum + item.pointsAwarded, 0),
  };
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const critical = criticalFailures(persona, evidence, successfulTools);
  const score = critical.length > 0 ? 0 : rawScore;

  return {
    score,
    rawScore,
    passed: critical.length === 0 && score >= 95,
    threshold: 95,
    breakdown,
    checks,
    criticalFailures: critical,
  };
}

export function extractPythonBlock(response: string): string | null {
  const match = response.match(/```(?:python|py)\s*\r?\n([\s\S]*?)```/i);
  return match?.[1]?.trim() || null;
}

function extractCodeFromTextSegment(markdown: string): string[] {
  const segments: string[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let fence: string[] | null = null;

  for (const line of lines) {
    if (fence) {
      if (/^\s*```\s*$/.test(line)) {
        segments.push(fence.join('\n'));
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }

    if (/^\s*```\s*[A-Za-z0-9_+-]*\s*$/.test(line)) {
      fence = [];
      continue;
    }

    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      segments.push(match[1]);
    }
  }

  if (fence) segments.push(fence.join('\n'));
  return segments;
}

/** Extract the inline and fenced code that the chat renderer must display. */
export function extractMarkdownCodeSegments(markdown: string): string[] {
  return segmentText(markdown).flatMap(segment =>
    segment.kind === 'text' ? extractCodeFromTextSegment(segment.content) : [],
  );
}

function visibleWords(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizeInlineCodeSuffixesInLine(line: string): string {
  const output: string[] = [];
  let cursor = 0;
  for (const match of line.matchAll(/`([^`\r\n]+)`/g)) {
    if (match.index === undefined || match.index < cursor) continue;
    const end = match.index + match[0].length;
    const suffix = line.slice(end).match(/^[\p{L}\p{N}]+/u)?.[0];
    output.push(line.slice(cursor, match.index));
    if (suffix) {
      output.push(match[1], suffix);
      cursor = end + suffix.length;
    } else {
      output.push(match[0]);
      cursor = end;
    }
  }
  output.push(line.slice(cursor));
  return output.join('');
}

function normalizeInlineCodeSuffixes(markdown: string): string {
  let fenced = false;
  return markdown.replace(/\r\n?/g, '\n').split('\n').map(line => {
    if (fenced) {
      if (/^\s*```\s*$/.test(line)) fenced = false;
      return line;
    }
    if (/^\s*```\s*[A-Za-z0-9_+-]*\s*$/.test(line)) {
      fenced = true;
      return line;
    }
    // Markdown joins an inline-code token and its suffix into one visible word.
    return normalizeInlineCodeSuffixesInLine(line);
  }).join('\n');
}

function expectedVisibleWords(markdown: string): string[] {
  const visibleSource = segmentText(markdown)
    .filter(segment => segment.kind === 'text')
    .map(segment => normalizeInlineCodeSuffixes(segment.content)
      // Fence metadata is not visible; the fenced body remains visible.
      .replace(/^\s*```\s*[A-Za-z0-9_+-]*\s*$/gm, '')
      // Link targets are attributes for safe links, not visible prose.
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .join('\n');
  return visibleWords(visibleSource);
}

/** Require every source word to survive in visible DOM order, allowing renderer UI chrome. */
export function visibleMarkdownPreservesText(markdown: string, visibleText: string): boolean {
  const expected = expectedVisibleWords(markdown);
  const visible = visibleWords(visibleText);
  let cursor = 0;

  for (const word of expected) {
    while (cursor < visible.length && visible[cursor] !== word) cursor += 1;
    if (cursor >= visible.length) return false;
    cursor += 1;
  }
  return true;
}

/** Compare exact DOM code text against independently parsed Markdown source. */
export function markdownCodeSegmentsMatch(
  markdown: string,
  visibleSegments: readonly string[],
): boolean {
  const expected = extractMarkdownCodeSegments(markdown).map(segment => segment.replace(/\r\n?/g, '\n'));
  const visible = visibleSegments.map(segment => segment.replace(/\r\n?/g, '\n'));
  return expected.length === visible.length
    && expected.every((segment, index) => segment === visible[index]);
}

/** Validate generated Python without executing it. */
export function validatePythonSyntax(response: string): PythonValidationResult {
  const code = extractPythonBlock(response);
  if (!code) {
    return { available: true, syntaxValid: false, importsPresent: false, error: 'No fenced Python block found.' };
  }

  const importsPresent = /^(?:from\s+\S+\s+import\s+|import\s+\S+)/m.test(code);
  const candidates = [
    process.env.WAGGLE_E2E_PYTHON,
    'python',
    'python3',
    process.platform === 'win32' ? 'py' : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const command of candidates) {
    const args = command === 'py'
      ? ['-3', '-c', 'import ast,sys; ast.parse(sys.stdin.read())']
      : ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'];
    const result = spawnSync(command, args, {
      input: code,
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') continue;
    return {
      available: true,
      syntaxValid: result.status === 0,
      importsPresent,
      ...(result.status === 0 ? {} : { error: (result.stderr || result.error?.message || 'Python syntax validation failed.').trim() }),
    };
  }

  return {
    available: false,
    syntaxValid: false,
    importsPresent,
    error: 'No Python interpreter available for syntax-only validation.',
  };
}
