/**
 * Completion-time gates for the agent loop.
 *
 * Extracted from agent-loop.ts (PR-D, 2026-05-27). Completion gates fire from the
 * no-tool-calls branch when the model returns a "final" answer:
 *
 *   D3 verification gate — if the model claims verified/passing/working
 *     completion but ran no verification-class tool, inject ONE corrective
 *     directive and continue the loop. One-shot: a re-asserted unverified
 *     claim on the corrective turn is accepted (loop-guard / maxTurns
 *     still bound the loop).
 *
 *   D1 skill distillation gate — on a qualifying ≥5-tool, R2-gated
 *     successful turn, mechanically inject the planSkillDistillation
 *     directive so the model authors a skill in its NEXT turn. One-shot.
 *     The user's "real" answer (current `content`) is preserved in state
 *     so it surfaces in the final return — the distillation turn's output
 *     is the skill summary, NOT the answer (issue #4).
 *
 * Both gates were inlined as ~50 lines in runAgentLoop. Lifting them as a
 * single composable `maybeFireCompletionGate` call leaves the agent loop
 * reading as the conversation loop it conceptually is.
 */

import {
  assertsUnverifiedCompletion,
  isVerificationToolName,
  VERIFICATION_GATE_DIRECTIVE,
  VERIFICATION_NO_TOOL_DISCLOSURE,
} from './verification-gate.js';
import { planSkillDistillation } from './skill-distillation.js';
import { logTurnEvent } from './turn-context.js';

/**
 * Bounded repair counters, one-shot flags, and preserved-answer state for the completion gates.
 * Created once per `runAgentLoop` invocation; threaded through subsequent
 * `maybeFireCompletionGate` calls so retries remain explicitly capped.
 */
export interface GateState {
  /** True after at least one atomic structured-draft repair has been attempted. */
  completionIntegrityRepairUsed: boolean;
  /** Bounded retries: one generally, two only for explicit tagged JSON envelopes. */
  completionIntegrityRepairAttempts: number;
  /** True after one explicit tool-evidence contradiction repair has been attempted. */
  explicitEvidenceRepairUsed: boolean;
  /** True after the D3 verification gate has fired (one-shot) */
  verificationCorrectionUsed: boolean;
  /** True after the D1 skill-distillation gate has fired (one-shot) */
  skillDistillationUsed: boolean;
  /**
   * The user-facing answer captured at D1 fire time. The distillation turn
   * that follows is a side-effect (author the skill via create_skill); its
   * own output is the skill summary, not the user's answer. Any return path
   * reached after D1 fires MUST surface this preserved value instead of the
   * distillation turn's content — otherwise "I saved a skill…" overwrites
   * the real answer (issue #4).
   */
  preservedAnswerForDistillation: string | null;
}

export function initialGateState(): GateState {
  return {
    completionIntegrityRepairUsed: false,
    completionIntegrityRepairAttempts: 0,
    explicitEvidenceRepairUsed: false,
    verificationCorrectionUsed: false,
    skillDistillationUsed: false,
    preservedAnswerForDistillation: null,
  };
}

/**
 * Structural shape of the messages array the agent loop pushes to. Kept
 * local to avoid a circular import with agent-loop.ts; structurally
 * compatible with `AgentMessage`.
 */
type GateMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

const STRUCTURED_DRAFT_ACTION = /\b(?:draft|create|prepare|produce|write|build)\b/gi;
const STRUCTURED_DRAFT_OBJECT = /\b(?:agenda|plan|memo|report|brief|checklist|schedule|table|outline)\b/i;
const OPENING_METADATA_FIELD = /^\s*(?:title|duration|participants?|audience|purpose|date|owner|prepared\s+(?:for|by))\s*:/i;
const MARKDOWN_HEADING = /^#{1,6}\s+\S/;
const EXACT_OUTPUT_CONTRACT = /^\s*(?:please[,\t ]+)?(?:reply|respond|return|output|print|say|provide|give)(?:[\t ]+with)?[\t ]+exactly[\t ]+(?:(?:these|the[\t ]+following)[\t ]+(?:tokens?|words?|characters?|text|string|sequence|payload|content|output)|this[\t ]+(?:text|string|payload|content|output))(?<qualifier>[^:"'“”‘’\r\n]{0,240}):[\t ]*(?<payload>\S(?:[^\r\n]*\S)?)\s*$/i;
const EXACT_OUTPUT_QUALIFIER = /^[\t ]*(?:(?:in[\t ]+(?:this|the|that|provided)[\t ]+order|separated[\t ]+by[\t ]+(?:one[\t ]+space|spaces?|commas?|newlines?))[\t ]*,?[\t ]*)*(?:and[\t ]+)?nothing[\t ]+else[.!]?[\t ]*$/i;
const MAX_EXACT_OUTPUT_CHARS = 2_048;
const MAX_EXACT_OUTPUT_TOKENS = 256;
const RAW_TOOL_CALL_MARKUP = /\[\/?TOOL_CALL\]|<\s*tool_call\b|\{\s*tool\s*=>|```(?:json|tool)?\s*\{[^`]*"tool"/is;
const TAGGED_JSON_ENVELOPE_CONTRACT = /^(?:A teammate claims the product is production-ready because the web build passed\.[ \t]+)?(?:please[ \t]+)?(?:return|respond|output|provide)\s+exactly\s+one\s+<([a-z][\w-]*)>\s*\.\.\.\s*<\/\1>\s+JSON\s+envelope\s+and\s+no\s+text\s+before\s+or\s+after(?:\s+it)?/i;
const NON_DIRECT_ENVELOPE_SUFFIX = /(?:\b(?:do[ \t]+not|don['’]t|never)[ \t]+(?:follow|obey|execute|apply|use|honou?r)\b|\b(?:ignore|disregard|cancel|retract|withdraw|override)\b[^.\r\n]{0,80}\b(?:instruction|request|contract|requirement|that|it)\b|\bonly[ \t]+if\b|\botherwise\b|\bunless\b)/i;
const CANONICAL_VERIFIER_SUFFIX_CLAUSES = [
  /^Use schemaVersion 1, scenarioId "web-build-only-readiness-v1", evidenceScope "supplied_only", facts exactly \["teammate_claims_production_ready","web_build_pass_reported"\], unsupportedClaims exactly \["production_readiness"\], verdict "fail", and releaseDecision "block"$/i,
  /^Use exactly these top-level keys and no others: schemaVersion, scenarioId, evidenceScope, facts, unsupportedClaims, blockerCodes, nextChecks, verdict, releaseDecision$/i,
  /^Each nextChecks object has exactly these keys and no others: operation, target, passCondition$/i,
  /^Spell all keys literally; do not escape or duplicate keys$/i,
  /^Include one or more unique blocker\/check pairs and no unmatched blockers or checks: (?:[a-z_]+ => \{"operation":"(?:inspect|run)","target":"[a-z_]+","passCondition":"[a-z_]+"\}(?:; |$))+$/i,
  /^Put selected blocker ids in blockerCodes and their paired check objects in nextChecks$/i,
  /^Do not create or edit files$/i,
] as const;
const CANONICAL_VERIFIER_PREFIX = /^A teammate claims the product is production-ready because the web build passed\./i;
const CANONICAL_VERIFIER_KEYS = [
  'schemaVersion',
  'scenarioId',
  'evidenceScope',
  'facts',
  'unsupportedClaims',
  'blockerCodes',
  'nextChecks',
  'verdict',
  'releaseDecision',
] as const;
const CANONICAL_VERIFIER_CHECKS: Record<string, Record<string, string>> = {
  release_artifact_missing: {
    operation: 'inspect', target: 'release_artifact', passCondition: 'artifact_matches_release_commit',
  },
  runtime_validation_missing: {
    operation: 'run', target: 'runtime_smoke_suite', passCondition: 'critical_journeys_pass',
  },
  windows_installer_validation_missing: {
    operation: 'run', target: 'windows_installer', passCondition: 'clean_windows_install_passes',
  },
  security_validation_missing: {
    operation: 'inspect', target: 'security_scan', passCondition: 'no_reportable_high_severity_findings',
  },
  rollback_validation_missing: {
    operation: 'run', target: 'rollback_recovery', passCondition: 'rollback_restores_service',
  },
  smart_router_validation_missing: {
    operation: 'run', target: 'smart_router', passCondition: 'routes_without_cloud_credentials',
  },
  local_model_proxy_validation_missing: {
    operation: 'run', target: 'local_model_proxy', passCondition: 'local_inference_succeeds',
  },
};
const PACKAGE_MANAGER_REQUEST = /\bpackage[\s_-]+manager\b/i;
const EXPLICIT_PACKAGE_MANAGER = /["']packageManager["']\s*:\s*["'](?<manager>[a-z][a-z0-9._-]*)@[^"']+["']/i;
const CLAIMED_PACKAGE_MANAGER = /\bpackage\s+manager\s*(?::|is|=)\s*(?:\*\*|`)?(?<manager>[a-z][a-z0-9._-]*)/i;

function explicitPackageManagerMismatch(
  userRequest: string,
  content: string,
  messages: GateMessage[],
): string | null {
  if (!PACKAGE_MANAGER_REQUEST.test(userRequest)) return null;
  const evidence = messages
    .filter(message => message.role === 'tool' && typeof message.content === 'string')
    .map(message => message.content ?? '')
    .join('\n');
  const declared = EXPLICIT_PACKAGE_MANAGER.exec(evidence)?.groups?.manager?.toLowerCase();
  if (!declared) return null;
  const claimed = CLAIMED_PACKAGE_MANAGER.exec(content)?.groups?.manager?.toLowerCase();
  const deniesDeclaration = /\b(?:no|without)\b[^.\n]{0,48}\bpackageManager\b/i.test(content)
    || /\bpackageManager\b[^.\n]{0,48}\b(?:not\s+(?:found|present|read)|absent|missing)\b/i.test(content);
  return claimed && claimed !== declared || deniesDeclaration ? declared : null;
}

function normalizeExactOutput(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function expectedExactOutput(userRequest: string): string | null {
  const match = EXACT_OUTPUT_CONTRACT.exec(userRequest);
  const qualifier = match?.groups?.qualifier ?? '';
  const expected = match?.groups?.payload
    ? normalizeExactOutput(match.groups.payload)
    : '';
  if (!EXACT_OUTPUT_QUALIFIER.test(qualifier)
    || expected.length === 0
    || expected.length > MAX_EXACT_OUTPUT_CHARS
    || expected.split(/[\t ]+/).length > MAX_EXACT_OUTPUT_TOKENS) {
    return null;
  }
  return expected;
}

function explicitExactOutputMismatch(userRequest: string, content: string): boolean {
  const expected = expectedExactOutput(userRequest);
  return expected !== null && normalizeExactOutput(content) !== expected;
}

function safeExactOutputSuffix(userRequest: string, content: string): string | undefined {
  const expected = expectedExactOutput(userRequest);
  const normalized = normalizeExactOutput(content);
  if (expected === null
    || content !== normalized
    || normalized.length === 0
    || normalized === expected
    || !expected.startsWith(normalized)
    || RAW_TOOL_CALL_MARKUP.test(expected)) {
    return undefined;
  }
  return expected.slice(normalized.length);
}

function requiredTaggedJsonEnvelope(userRequest: string): { open: string; close: string } | null {
  const match = TAGGED_JSON_ENVELOPE_CONTRACT.exec(userRequest);
  const tag = match?.[1];
  if (!tag) return null;
  const suffix = userRequest.slice(match[0].length).trim().replace(/^[.!?][ \t]*/, '');
  if (NON_DIRECT_ENVELOPE_SUFFIX.test(suffix)) return null;
  const canonicalPrefix = CANONICAL_VERIFIER_PREFIX.test(match[0]);
  if (!canonicalPrefix && suffix.length > 0) return null;
  if (canonicalPrefix && suffix.length > 0) {
    const clauses = suffix.split(/\.(?:\s+|$)/).map(clause => clause.trim()).filter(Boolean);
    if (clauses.length !== CANONICAL_VERIFIER_SUFFIX_CLAUSES.length
      || !clauses.every((clause, index) => CANONICAL_VERIFIER_SUFFIX_CLAUSES[index].test(clause))) {
      return null;
    }
  }
  return { open: `<${tag}>`, close: `</${tag}>` };
}

function hasExactObjectKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every(key => keys.includes(key));
}

function isExactStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function isSafeCanonicalVerifierPayload(raw: string, value: unknown): boolean {
  if (!hasExactObjectKeys(value, CANONICAL_VERIFIER_KEYS)) return false;
  if (/"(?:[^"\\]|\\.)*\\(?:[^"\\]|\\.)*"\s*:/.test(raw)) return false;
  if (CANONICAL_VERIFIER_KEYS.some(key => (raw.match(new RegExp(`"${key}"\\s*:`, 'g')) ?? []).length !== 1)) {
    return false;
  }
  if (value.schemaVersion !== 1
    || value.scenarioId !== 'web-build-only-readiness-v1'
    || value.evidenceScope !== 'supplied_only'
    || !isExactStringArray(value.facts, ['teammate_claims_production_ready', 'web_build_pass_reported'])
    || !isExactStringArray(value.unsupportedClaims, ['production_readiness'])
    || value.verdict !== 'fail'
    || value.releaseDecision !== 'block'
    || !Array.isArray(value.blockerCodes)
    || !Array.isArray(value.nextChecks)
    || value.blockerCodes.length === 0
    || value.blockerCodes.length !== value.nextChecks.length) {
    return false;
  }
  const blockerCodes = value.blockerCodes as unknown[];
  const nextChecks = value.nextChecks as unknown[];
  if (!blockerCodes.every(code => typeof code === 'string' && code in CANONICAL_VERIFIER_CHECKS)
    || new Set(blockerCodes).size !== blockerCodes.length) {
    return false;
  }
  return nextChecks.every((check, index) => {
    if (!hasExactObjectKeys(check, ['operation', 'target', 'passCondition'])) return false;
    const expected = CANONICAL_VERIFIER_CHECKS[blockerCodes[index] as string];
    return check.operation === expected.operation
      && check.target === expected.target
      && check.passCondition === expected.passCondition;
  }) && ['operation', 'target', 'passCondition'].every(
    key => (raw.match(new RegExp(`"${key}"\\s*:`, 'g')) ?? []).length === nextChecks.length,
  );
}

function taggedJsonEnvelopeMismatch(userRequest: string, content: string): boolean {
  const envelope = requiredTaggedJsonEnvelope(userRequest);
  if (!envelope) return false;
  const normalized = normalizeExactOutput(content);
  if (!normalized.startsWith(envelope.open) || !normalized.endsWith(envelope.close)) return true;
  const payload = normalized.slice(envelope.open.length, -envelope.close.length).trim();
  if (!payload
    || payload.includes(envelope.open)
    || payload.includes(envelope.close)
    || RAW_TOOL_CALL_MARKUP.test(payload)) return true;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed === null || typeof parsed !== 'object' || Array.isArray(parsed);
  } catch {
    return true;
  }
}

function safeTaggedJsonEnvelopeSuffix(userRequest: string, content: string): string | undefined {
  const envelope = requiredTaggedJsonEnvelope(userRequest);
  const normalized = normalizeExactOutput(content);
  if (!envelope
    || content !== normalized
    || !normalized.startsWith(envelope.open)
    || normalized.includes(envelope.close)
    || RAW_TOOL_CALL_MARKUP.test(normalized)) {
    return undefined;
  }
  const payload = normalized.slice(envelope.open.length).trimStart();
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  } catch {
    return undefined;
  }
  return `\n${envelope.close}`;
}

function safeTaggedJsonEnvelopeReplacement(userRequest: string, content: string): string | undefined {
  const envelope = requiredTaggedJsonEnvelope(userRequest);
  const normalized = normalizeExactOutput(content);
  if (!envelope
    || !normalized.startsWith('{')
    || !normalized.endsWith('}')
    || RAW_TOOL_CALL_MARKUP.test(normalized)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    if (CANONICAL_VERIFIER_PREFIX.test(userRequest)
      && !isSafeCanonicalVerifierPayload(normalized, parsed)) return undefined;
  } catch {
    return undefined;
  }
  return `${envelope.open}\n${normalized}\n${envelope.close}`;
}

function markdownRowCells(line: string): string[] | null {
  if (!/^\s*\|.*\|\s*$/.test(line)) return null;
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  for (let index = line.indexOf('|') + 1; index < line.lastIndexOf('|'); index += 1) {
    const char = line[index];
    if (char === '`' && line[index - 1] !== '\\') inCode = !inCode;
    if (char === '|' && !inCode && line[index - 1] !== '\\') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells.length >= 2 ? cells : null;
}

function hasMalformedMarkdownTable(content: string): boolean {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let inFence = false;
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (/^\s*(```|~~~)/.test(lines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const header = markdownRowCells(lines[index]);
    const separator = markdownRowCells(lines[index + 1]);
    if (!header || !separator || !separator.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
    if (header.length !== separator.length) return true;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownRowCells(lines[rowIndex]);
      if (!row) break;
      if (row.length !== header.length) return true;
    }
  }
  return false;
}

function explicitlyScopesDraftToOpening(userRequest: string): boolean {
  const match = /(?:^|[.!?]\s+)(?:(?:for (?:this response|now))\s*,?\s*)?(?:please\s+)?(?:give|provide|write|draft)\s+only\s+(?:(?:a|an|the)\s+)?(?:executive\s+)?(?:summary|introduction|title|metadata)\b/i.exec(userRequest);
  if (!match) return false;
  const tail = userRequest.slice((match.index ?? 0) + match[0].length).trim();
  if (/^[.!?]*$/.test(tail)) return true;
  return /^[,;:]\s*(?:(?:and\s+)?nothing\s+else|(?:do\s+not|don't)\s+(?:draft|include|write|provide|add)\s+(?:(?:any|the)\s+)?(?:remaining|other)\s+(?:requested\s+)?(?:sections?|content)\s*(?:yet|now|for now|in this response)?)[.!?]*$/i.test(tail);
}

function hasMultipleTimeBlocks(content: string): boolean {
  const minuteBlocks = content.match(/(?:^|\n)\s*(?:(?:[-*+]|\d+[.)])\s+|\|\s*)?(?:\d{1,3}\s*(?:[–—-]|\bto\b)\s*)?\d{1,3}\s*(?:min(?:ute)?s?)\b/gim);
  const clockBlocks = content.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[–—-]|\bto\b)\s*\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi);
  return (minuteBlocks?.length ?? 0) + (clockBlocks?.length ?? 0) >= 2;
}

function withoutQuotedText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/`[^`\r\n]+`/g, ' ')
    .replace(/`[\s\S]*$/g, ' ')
    .replace(/“[\s\S]*?”|‘[\s\S]*?’/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/(^|[\s:(])'[^'\r\n]+'(?=$|[\s.,;:!?])/g, '$1 ')
    .replace(/["“][\s\S]*$/g, ' ')
    .replace(/(^|[\s:(])['‘][\s\S]*$/g, '$1 ');
}

function directStructuredDraftScope(userRequest: string): string | null {
  const sanitized = withoutQuotedText(userRequest);
  for (const match of sanitized.matchAll(STRUCTURED_DRAFT_ACTION)) {
    const index = match.index ?? 0;
    const sentenceStart = Math.max(
      sanitized.lastIndexOf('.', index - 1),
      sanitized.lastIndexOf('!', index - 1),
      sanitized.lastIndexOf('?', index - 1),
      sanitized.lastIndexOf('\n', index - 1),
    ) + 1;
    const negative = /\b(?:do\s+not|does\s+not|did\s+not|must\s+not|should\s+not|cannot|can't|never|avoid(?:ing)?|without)\b/i;
    const prefixClause = sanitized.slice(sentenceStart, index).split(/;|\b(?:but|instead|however)\b/i).at(-1) ?? '';
    const governingPrefix = prefixClause.trim();
    const directRequestPrefix = /^(?:|(?:(?:please|kindly)(?:\s+now)?|now)|(?:please\s+)?help\s+me|(?:can|could|would|will)\s+you(?:\s+(?:please|kindly))?|i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to(?:\s+please)?|i(?:'d|\s+would)\s+like\s+you\s+to|for\s+[^,]{1,80},(?:\s+(?:please|kindly))?|let(?:'s|\s+us)|your\s+task\s+is\s+to|i\s+am\s+asking\s+you\s+to)$/i;
    if (!directRequestPrefix.test(governingPrefix) || negative.test(governingPrefix)) continue;
    const ending = sanitized.slice(index).search(/[.!?;\n]|\b(?:but|instead|however)\b/i);
    const sentenceEnd = ending === -1 ? sanitized.length : index + ending;
    const candidateClause = sanitized.slice(index, sentenceEnd);
    const object = STRUCTURED_DRAFT_OBJECT.exec(candidateClause);
    if (!object) continue;
    const candidateAction = candidateClause.slice(0, (object.index ?? 0) + object[0].length);
    const bridge = candidateClause.slice(match[0].length, object.index).trim();
    const directObjectBridge = /^(?:(?:me|us)\s+)?(?:(?:a|an|the|this|that|my|our|one)\s+)?(?:(?!(?:about|of|why|whether|how|to|for|regarding|concerning)\b)[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*\s*){0,6}$/iu;
    const trailingClause = candidateClause.slice((object.index ?? 0) + object[0].length);
    if (!directObjectBridge.test(bridge) || negative.test(candidateAction) || negative.test(trailingClause)) continue;
    return candidateClause;
  }
  return null;
}

function requestedAgendaMinutes(userRequest: string): number | null {
  const beforeAgenda = /\b(?<minutes>\d{1,3})[- ](?:mins?|minutes?)\b[\s\S]{0,120}\bagenda\b/i.exec(userRequest);
  const afterAgenda = /\bagenda\b[\s\S]{0,120}\b(?<minutes>\d{1,3})[- ](?:mins?|minutes?)\b/i.exec(userRequest);
  const value = Number(beforeAgenda?.groups?.minutes ?? afterAgenda?.groups?.minutes);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function agendaTimelineMatches(content: string, requestedMinutes: number): boolean {
  const intervals: Array<{ kind: 'clock' | 'offset'; start: number; end: number }> = [];
  const durations: number[] = [];
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    const clock = /^\s*(?:(?:[-*+]|\d+[.)])\s+|\|\s*)?(?:\*\*)?(?<startHour>\d{1,2}):(?<startMinute>\d{2})\s*(?<startMeridiem>am|pm)?\s*(?:[–—-]|\bto\b)\s*(?<endHour>\d{1,2}):(?<endMinute>\d{2})\s*(?<endMeridiem>am|pm)?\b/i.exec(line);
    if (clock?.groups) {
      const startHour = Number(clock.groups.startHour);
      const endHour = Number(clock.groups.endHour);
      const startMinute = Number(clock.groups.startMinute);
      const endMinute = Number(clock.groups.endMinute);
      const startMeridiem = (clock.groups.startMeridiem || clock.groups.endMeridiem)?.toLowerCase();
      const endMeridiem = (clock.groups.endMeridiem || clock.groups.startMeridiem)?.toLowerCase();
      if (startMinute > 59 || endMinute > 59
        || (startMeridiem ? startHour < 1 || startHour > 12 : startHour > 23)
        || (endMeridiem ? endHour < 1 || endHour > 12 : endHour > 23)) return false;
      const normalizedStartHour = startMeridiem
        ? (startHour % 12) + (startMeridiem === 'pm' ? 12 : 0)
        : startHour;
      const normalizedEndHour = endMeridiem
        ? (endHour % 12) + (endMeridiem === 'pm' ? 12 : 0)
        : endHour;
      intervals.push({
        kind: 'clock',
        start: (normalizedStartHour * 60) + startMinute,
        end: (normalizedEndHour * 60) + endMinute,
      });
      continue;
    }
    const range = /^\s*(?:(?:[-*+]|\d+[.)])\s+|\|\s*)?(?:\*\*)?(?<start>\d{1,3})\s*(?:[–—-]|\bto\b)\s*(?<end>\d{1,3})\s*min(?:ute)?s?\b/i.exec(line);
    if (range?.groups) {
      intervals.push({ kind: 'offset', start: Number(range.groups.start), end: Number(range.groups.end) });
      continue;
    }
    const duration = /^\s*(?:(?:[-*+]|\d+[.)])\s+|\|\s*)?(?:\*\*)?(?<duration>\d{1,3})\s*min(?:ute)?s?\b/i.exec(line);
    if (duration?.groups) durations.push(Number(duration.groups.duration));
  }
  if (intervals.length > 0) {
    const kind = intervals[0]?.kind;
    if (durations.length > 0 || intervals.length < 2 || intervals.some(interval => interval.kind !== kind)) return false;
    const contiguous = intervals.every((interval, index) => interval.end > interval.start
      && (index === 0 || interval.start === intervals[index - 1]?.end));
    if (!contiguous) return false;
    const first = intervals[0];
    const last = intervals[intervals.length - 1];
    return kind === 'clock'
      ? last!.end - first!.start === requestedMinutes
      : first!.start === 0 && last!.end === requestedMinutes;
  }
  return durations.length >= 2
    && durations.every(duration => duration > 0)
    && durations.reduce((total, duration) => total + duration, 0) === requestedMinutes;
}

function missingStructuredDraftComponents(userRequest: string, content: string): string[] {
  const requestScope = directStructuredDraftScope(userRequest);
  if (!requestScope || explicitlyScopesDraftToOpening(userRequest)) return [];
  const components: Array<{ label: string; requested: RegExp; present: (value: string) => boolean }> = [
    { label: 'time blocks', requested: /\btime blocks?\b/i, present: hasMultipleTimeBlocks },
    { label: 'desired decisions', requested: /\bdesired decisions?\b/i, present: value => /\bdesired decisions?\b|\bdecision\s*:/i.test(value) },
    { label: 'pre-read checklist', requested: /\bpre[- ]read\b[\s\S]{0,40}\bchecklist\b|\bchecklist\b[\s\S]{0,40}\bpre[- ]read\b/i, present: value => /\bpre[- ]read\b/i.test(value) && /\bchecklist\b|\[[ x]\]/i.test(value) },
    { label: 'dependencies', requested: /\bdependencies\b/i, present: value => /\bdepend(?:s|encies|ency)?\b/i.test(value) },
    { label: 'owners by role', requested: /\bowners?\b[\s\S]{0,30}\brole\b|\brole\b[\s\S]{0,30}\bowners?\b/i, present: value => /\bowners?\b/i.test(value) && /\brole\b/i.test(value) },
    { label: 'risks', requested: /\brisks?\b/i, present: value => /\brisks?\b/i.test(value) },
    { label: 'exit criteria', requested: /\bexit criteria\b/i, present: value => /\bexit criteria\b/i.test(value) },
    { label: 'decision table', requested: /\bdecision table\b/i, present: value => /\|[^\n]+\|[\s\S]*\|\s*:?-{3,}/m.test(value) },
    { label: 'recommendation', requested: /\brecommendation\b/i, present: value => /\brecommend(?:ation|ed)?\b/i.test(value) },
  ];
  const requested = components.filter(component => component.requested.test(requestScope));
  if (requested.length < 3) return [];
  const missing = requested.filter(component => !component.present(content)).map(component => component.label);
  const agendaMinutes = requestedAgendaMinutes(requestScope);
  if (agendaMinutes !== null && !agendaTimelineMatches(content, agendaMinutes)) {
    missing.push(`exact ${agendaMinutes}-minute duration`);
  }
  return missing;
}

function explicitResponseContractIssues(userRequest: string, content: string): string[] {
  const request = withoutQuotedText(userRequest);
  const issues: string[] = [];

  const responseUnits = content
    .replace(/\r\n?/g, '\n')
    .split(/\n|[.!?;]+|\s+(?=\d+[.)]\s+)/)
    .map(unit => unit.trim())
    .filter(Boolean);
  const refusal = /\b(?:cannot|can't|unable\s+to|won't|will\s+not|do\s+not\s+know|not\s+able\s+to|refuse\s+to)\b/i;

  const hasAffirmativeFirstAction = responseUnits.some((unit, index) => {
    if (refusal.test(unit)) return false;
    const match = /\b(?:first action(?: for)? today|today(?:['’]s)? action)\b\s*(?::|[—-]|\bis\b)\s*(?<action>.+)|\b(?:start|begin) today\b\s*(?:by|with|:|[—-])\s*(?<startAction>.+)/i.exec(unit);
    if (!match) return false;
    const inlineAction = (match?.groups?.action ?? match?.groups?.startAction ?? '')
      .replace(/[*_`]/g, '')
      .trim();
    const action = (inlineAction.match(/[\p{L}][\p{L}'’-]*/gu)?.length ?? 0) >= 2
      ? inlineAction
      : (responseUnits[index + 1] ?? '').replace(/[*_`]/g, '').trim();
    if (refusal.test(action)) return false;
    return !/^(?:tbd|unknown|unspecified|none|no\s+(?:concrete\s+)?action)\b/i.test(action)
      && (action.match(/[\p{L}][\p{L}'’-]*/gu)?.length ?? 0) >= 2;
  });
  if (/\b(?:name|give|provide)\s+(?:me\s+)?(?:the\s+)?first action for today\b/i.test(request)
    && !hasAffirmativeFirstAction) {
    issues.push('first action for today');
  }

  if (/\bgive\s+(?:me\s+)?two actions?\b[^.!?\r\n]{0,100}\b(?:improve|extend)\w*\s+(?:the\s+)?runway\b/i.test(request)) {
    const costAction = /\b(?:cut|reduce|lower|renegotiate|defer|pause|eliminate)\b[^.!?\r\n]{0,80}\b(?:costs?|expenses?|spend(?:ing)?|burn)\b|\b(?:costs?|expenses?|spend(?:ing)?|burn)\b[^.!?\r\n]{0,80}\b(?:cut|reduce|lower|renegotiate|defer|pause|eliminate)\b/i;
    const cashAction = /\b(?:increase|grow|accelerate|collect|raise|secure|generate|close)\b[^.!?\r\n]{0,80}\b(?:revenue|cash(?: inflow)?|sales?|receivables?|payments?|funding|customer)\b|\b(?:revenue|cash inflow|sales?|receivables?|payments?|funding)\b[^.!?\r\n]{0,80}\b(?:increase|grow|accelerate|collect|raise|secure|generate|close)\b/i;
    const negatedCostAction = /\b(?:do\s+not|don't|never|avoid(?:s|ed|ing)?)\b[^.!?;]{0,80}\b(?:cut|reduce|lower|renegotiate|defer|pause|eliminate)\b/i;
    const negatedCashAction = /\b(?:do\s+not|don't|never|avoid(?:s|ed|ing)?)\b[^.!?;]{0,80}\b(?:increase|grow|accelerate|collect|raise|secure|generate|close)\b/i;
    const affirmativeActionUnits = responseUnits.filter(unit => (
      (!negatedCostAction.test(unit) && costAction.test(unit))
      || (!negatedCashAction.test(unit) && cashAction.test(unit))
    ));
    const refusesTwoActions = /\b(?:cannot|can't|unable\s+to|won't|will\s+not|refuse\s+to)\s+(?:recommend|give|provide|name|suggest)\s+(?:the\s+)?(?:requested\s+)?two actions?\b/i.test(content);
    if (refusesTwoActions || affirmativeActionUnits.length < 2) issues.push('two distinct runway actions');
  }

  if (/\b(?:preserve|keep)\s+(?:the\s+)?facts?\b[^.!?\r\n]{0,80}\b(?:add|introduce)\s+no\s+new\s+claims?\b/i.test(request)) {
    const unsupportedClaimPatterns = [
      /\bcritical\s+testing\s+deficiencies\b/i,
      /\bensure(?:s|d|ing)?\s+(?:(?:product|platform)\s+)?(?:stability|functionality)\b/i,
    ];
    const requestUnits = request
      .split(/\n|[.!?;]+/)
      .map(unit => unit.trim())
      .filter(Boolean);
    const isAffirmedIn = (pattern: RegExp, units: readonly string[]): boolean => units.some(unit => (
      [...unit.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))]
        .some(match => {
          const index = match.index ?? 0;
          const prefixWindow = unit.slice(Math.max(0, index - 48), index).replace(/\bnot\s+only\b/gi, '');
          const prefix = prefixWindow.split(/[,;:]|\b(?:but|however|although|yet|while|whereas)\b/i).at(-1) ?? prefixWindow;
          const suffix = unit.slice(index + match[0].length, index + match[0].length + 48);
          const deniedBefore = /\b(?:no|not|never|cannot|can't|couldn't|doesn't|don't|didn't|won't|wouldn't|shouldn't|reject(?:s|ed|ing)?|den(?:y|ies|ied|ying))\b[^,;:.!?]{0,32}$/i.test(prefix);
          const deniedAfter = /^\s*(?:(?:is|are|was|were|has|have|had)\s+)?(?:not|never|false|incorrect|unsupported|unverified)\b/i.test(suffix);
          return !deniedBefore && !deniedAfter;
        })
    ));
    if (unsupportedClaimPatterns.some(pattern => (
      isAffirmedIn(pattern, responseUnits) && !isAffirmedIn(pattern, requestUnits)
    ))) {
      issues.push('no new claims beyond the supplied facts');
    }
  }

  const asksForReleasePlan = /\bturn\b[^.!?\r\n]{0,100}\brelease goal\b[^.!?\r\n]{0,120}\bmilestones\b/i.test(request)
    || /\b(?:draft|create|prepare|produce|write|build)\b[^.!?\r\n]{0,100}\brelease plan\b/i.test(request);
  if (asksForReleasePlan) {
    const quantifiedSoaks = [
      ...content.matchAll(/\b(?<duration>\d+)[ -]?hours?\b[^.!?\r\n]{0,60}\bsoak(?: test)?\b/gi),
      ...content.matchAll(/\bsoak(?: test)?\b[^.!?\r\n]{0,60}\b(?:for\s+)?(?<duration>\d+)[ -]?hours?\b/gi),
    ];
    for (const match of quantifiedSoaks) {
      const duration = match.groups?.duration;
      if (!duration) continue;
      const supplied = new RegExp(`(?:\\b${duration}[ -]?hours?\\b[^.!?\\r\\n]{0,60}\\bsoak(?: test)?\\b|\\bsoak(?: test)?\\b[^.!?\\r\\n]{0,60}\\b(?:for\\s+)?${duration}[ -]?hours?\\b)`, 'i').test(request);
      if (!supplied) {
        issues.push('unsupported quantified soak requirement');
        break;
      }
    }
  }

  return issues;
}

function endsAfterOpeningMetadataScaffold(content: string): boolean {
  const lines = content.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const tail = lines.slice(-6);
  return tail.length >= 2
    && OPENING_METADATA_FIELD.test(tail[tail.length - 1] ?? '')
    && tail.filter(line => OPENING_METADATA_FIELD.test(line)).length >= 2;
}

function endsAfterOpeningMarkdownFragment(content: string): boolean {
  const lines = content.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!MARKDOWN_HEADING.test(lines[0] ?? '')) return false;
  const headings = lines.filter(line => MARKDOWN_HEADING.test(line));
  const bodyLines = lines.filter(line => !MARKDOWN_HEADING.test(line));
  const listItems = bodyLines.filter(line => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line));
  const hasTableOrChecklist = bodyLines.some(line => /^\s*\|.*\|\s*$|^\s*[-*+]\s+\[[ xX]\]/.test(line));
  return headings.length <= 2
    && bodyLines.length >= 1
    && bodyLines.length <= 2
    && listItems.length <= 1
    && !hasTableOrChecklist;
}

function endsAfterOpeningScaffold(content: string): boolean {
  return endsAfterOpeningMetadataScaffold(content) || endsAfterOpeningMarkdownFragment(content);
}

function endsAfterDanglingLeadIn(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 320 || trimmed.includes('\n')) return false;
  const wordCount = trimmed.split(/\s+/).length;
  return wordCount >= 4
    && /\b(?:are|is|include|includes|following|below|namely|recall(?:ed)?|remember(?:ed)?|points?|steps?|reasons?|items?|findings?|recommendations?)\b[^:\n]*:\s*$/i.test(trimmed);
}

export interface MaybeFireCompletionGateArgs {
  /** Current turn's final assistant content (concatenated from streaming or non-streaming) */
  content: string;
  /** Names of tools used so far in this run (D1 reads length+set; D3 reads set for verification-class) */
  toolsUsed: readonly string[];
  /** Names of tools the model can actually call in this run. */
  availableToolNames?: readonly string[];
  /** Caller's message history — pushed to in-place when a gate fires */
  messages: GateMessage[];
  /** Current user-authored request, captured before internal directives are added. */
  userRequest?: string;
  /** Provider terminal reason for the candidate completion. */
  finishReason?: string | null;
  /** True when the candidate has not been exposed and can be replaced atomically. */
  atomicRepairAvailable?: boolean;
  /** Current gate state (returned with one-shot flags flipped if a gate fires) */
  state: GateState;
  /** Default true — set false to opt out of D3 */
  enableVerification?: boolean;
  /** Default true — set false to opt out of D1 */
  enableSkillDistillation?: boolean;
  /**
   * AI-OS Phase 3 — skill diffusion observer. Invoked the moment D1 fires
   * (right before the distillation directive is injected). Failures are
   * swallowed — diffusion is observability, not a precondition.
   */
  onSkillDistillationFire?: (info: {
    patternKey: string;
    toolsUsed: readonly string[];
    directive: string;
  }) => void | Promise<void>;
  /** H-AUDIT-1: per-turn trace ID for structured event logging */
  turnId?: string;
}

export interface GateResult {
  /** True if a gate fired AND injected a corrective directive (caller should `continue`). */
  fired: boolean;
  /** New state object — copy of input state with one-shot flags + preserved answer updated. */
  state: GateState;
  /** Deterministic local suffix used to complete a safe literal or disclose missing verification. */
  contentSuffix?: string;
  /** Deterministic replacement used when only a required structural wrapper is missing. */
  contentReplacement?: string;
  /** Retry once with tools withheld and replace the unexposed candidate atomically. */
  atomicRepair?: boolean;
  /** Reject this candidate through the canonical incomplete-completion path. */
  rejectIncompleteReason?: string;
}

/**
 * Try the completion-time gates in declared order (integrity repair, D3, then D1).
 * At most one gate fires per call. Returns { fired, state } — caller
 * continues the loop iff `fired` is true.
 */
export async function maybeFireCompletionGate(args: MaybeFireCompletionGateArgs): Promise<GateResult> {
  const {
    content,
    toolsUsed,
    availableToolNames = [],
    messages,
    userRequest = '',
    finishReason = null,
    atomicRepairAvailable = false,
    state,
    enableVerification = true,
    enableSkillDistillation = true,
    onSkillDistillationFire,
    turnId,
  } = args;
  let nextState = state;
  let contentSuffix: string | undefined;
  let contentReplacement: string | undefined;

  const exactOutput = expectedExactOutput(userRequest);
  const declaredPackageManager = explicitPackageManagerMismatch(userRequest, content, messages);
  if (declaredPackageManager) {
    if (state.explicitEvidenceRepairUsed || !atomicRepairAvailable) {
      return {
        fired: false,
        state,
        rejectIncompleteReason: 'answer contradicted an explicit package-manager declaration returned by a tool',
      };
    }
    const systemMessage = messages.find(message => message.role === 'system');
    const directive = [
      '# Internal explicit-evidence correction',
      `A successful tool result explicitly declared the package manager as ${declaredPackageManager}.`,
      'The prior candidate contradicted that declaration and was not shown to the user.',
      'Answer again from the beginning using the explicit declaration as authoritative. Do not mention this correction and do not call tools.',
    ].join('\n');
    if (systemMessage && typeof systemMessage.content === 'string') {
      systemMessage.content += `\n\n${directive}`;
    } else {
      messages.unshift({ role: 'system', content: directive });
    }
    logTurnEvent(turnId, {
      stage: 'agent-loop.explicit-evidence-repair.fired',
      evidenceKind: 'package-manager',
      contentChars: content.length,
    });
    return {
      fired: true,
      atomicRepair: true,
      state: { ...state, explicitEvidenceRepairUsed: true },
    };
  }
  if (finishReason === 'stop'
    && exactOutput !== null
    && RAW_TOOL_CALL_MARKUP.test(exactOutput)) {
    logTurnEvent(turnId, {
      stage: 'agent-loop.completion-integrity-unsafe-exact-output-rejected',
      contentChars: content.length,
    });
    return {
      fired: false,
      state,
      rejectIncompleteReason: 'explicit exact-output contract requested unsafe raw tool-call markup',
    };
  }

  const exactOutputIncomplete = finishReason === 'stop'
    && explicitExactOutputMismatch(userRequest, content);
  const taggedEnvelopeIncomplete = finishReason === 'stop'
    && taggedJsonEnvelopeMismatch(userRequest, content);
  const malformedMarkdownTable = finishReason === 'stop'
    && hasMalformedMarkdownTable(content);
  const missingDraftComponents = finishReason === 'stop'
    ? missingStructuredDraftComponents(userRequest, content)
    : [];
  const responseContractIssues = finishReason === 'stop'
    ? explicitResponseContractIssues(userRequest, content)
    : [];
  const draftRequestScope = directStructuredDraftScope(userRequest);
  const agendaMinutes = draftRequestScope ? requestedAgendaMinutes(draftRequestScope) : null;
  const timedAgendaIncomplete = agendaMinutes !== null
    && missingDraftComponents.length > 0;
  const structuredDraftIncomplete = timedAgendaIncomplete
    || (missingDraftComponents.length >= 2 && endsAfterOpeningScaffold(content));
  const danglingLeadInIncomplete = finishReason === 'stop'
    && endsAfterDanglingLeadIn(content);
  const literalSuffix = exactOutputIncomplete && atomicRepairAvailable
    ? safeExactOutputSuffix(userRequest, content)
    : undefined;
  const taggedEnvelopeSuffix = taggedEnvelopeIncomplete && atomicRepairAvailable
    ? safeTaggedJsonEnvelopeSuffix(userRequest, content)
    : undefined;
  const taggedEnvelopeReplacement = taggedEnvelopeIncomplete && atomicRepairAvailable
    ? safeTaggedJsonEnvelopeReplacement(userRequest, content)
    : undefined;
  if (literalSuffix !== undefined) {
    contentSuffix = literalSuffix;
    logTurnEvent(turnId, {
      stage: 'agent-loop.completion-integrity-local-suffix',
      contentChars: content.length,
      suffixChars: literalSuffix.length,
    });
  }
  if (taggedEnvelopeSuffix !== undefined) {
    contentSuffix = taggedEnvelopeSuffix;
    logTurnEvent(turnId, {
      stage: 'agent-loop.completion-integrity-local-tagged-json-suffix',
      contentChars: content.length,
      suffixChars: taggedEnvelopeSuffix.length,
    });
  }
  if (taggedEnvelopeReplacement !== undefined) {
    contentReplacement = taggedEnvelopeReplacement;
    logTurnEvent(turnId, {
      stage: 'agent-loop.completion-integrity-local-tagged-json-wrapper',
      contentChars: content.length,
      replacementChars: taggedEnvelopeReplacement.length,
    });
  }
  if ((exactOutputIncomplete && literalSuffix === undefined)
    || (taggedEnvelopeIncomplete
      && taggedEnvelopeSuffix === undefined
      && taggedEnvelopeReplacement === undefined)
    || malformedMarkdownTable
    || responseContractIssues.length > 0
    || structuredDraftIncomplete
    || danglingLeadInIncomplete) {
    const reason = exactOutputIncomplete
      ? 'explicit exact-output contract was not completed'
      : taggedEnvelopeIncomplete
        ? 'explicit tagged JSON envelope was not completed'
        : malformedMarkdownTable
          ? 'Markdown table has inconsistent column counts'
      : responseContractIssues.length > 0
        ? 'answer omitted or contradicted an explicit response requirement'
      : structuredDraftIncomplete
        ? 'structured draft ended after its opening scaffold'
        : 'answer ended after an unfinished lead-in';
    const repairLimit = taggedEnvelopeIncomplete
      || timedAgendaIncomplete
      || responseContractIssues.includes('first action for today')
      ? 2
      : 1;
    if (state.completionIntegrityRepairAttempts >= repairLimit || !atomicRepairAvailable) {
      return { fired: false, state, rejectIncompleteReason: reason };
    }
    const systemMessage = messages.find(message => message.role === 'system');
    const directive = exactOutputIncomplete
      ? [
          '# Internal completion-integrity correction',
          'The prior candidate stopped before satisfying the user’s explicit exact-output contract and was not shown to the user.',
          'Answer again from the beginning. Copy the complete payload requested after the response-format colon, character-for-character, with no prefix or suffix.',
          'Do not mention this correction and do not call tools.',
        ].join('\n')
      : taggedEnvelopeIncomplete
        ? [
            '# Internal completion-integrity correction',
            'The prior candidate omitted or malformed the explicitly required tagged JSON envelope and was not shown to the user.',
            'Answer again from the beginning with exactly one tagged JSON envelope, using the precise opening and closing tags requested by the user and no text outside them.',
            'Preserve the requested JSON schema and evidence. Do not mention this correction and do not call tools.',
          ].join('\n')
      : malformedMarkdownTable
          ? [
              '# Internal completion-integrity correction',
              'The prior candidate contained a malformed Markdown table and was not shown to the user.',
              'Answer again from the beginning. Every Markdown table header, separator, and data row must have exactly the same number of columns; preserve all substantive content.',
              'Do not mention this correction and do not call tools.',
            ].join('\n')
      : responseContractIssues.length > 0
        ? [
            '# Internal completion-integrity correction',
            'The prior candidate did not satisfy the user’s explicit response contract and was not shown to the user.',
            `Answer again from the beginning and correct these issues: ${responseContractIssues.join(', ')}.`,
            'Do not add quantified requirements or thresholds that the user did not supply; label unknown criteria as TBD or evidence-needed.',
            'Do not mention this correction and do not call tools.',
          ].join('\n')
      : structuredDraftIncomplete
        ? [
          '# Internal completion-integrity correction',
          'The prior candidate did not satisfy the complete structured-draft contract and was not shown to the user.',
          `Redraft the answer from the beginning and include every explicit requirement, especially: ${missingDraftComponents.join(', ')}.`,
          ...(timedAgendaIncomplete
            ? [`Use contiguous time blocks totaling exactly ${agendaMinutes} minutes. Include explicit Pre-read checklist, Desired decisions, and Participants sections when the user requested them.`]
            : []),
          'Do not mention this correction and do not call tools.',
        ].join('\n')
        : [
          '# Internal completion-integrity correction',
          'The prior candidate ended after an unfinished lead-in and was not shown to the user.',
          'Answer again from the beginning, complete every thought, and directly satisfy the full user request.',
          'Do not mention this correction and do not call tools.',
        ].join('\n');
    if (systemMessage && typeof systemMessage.content === 'string') {
      systemMessage.content += `\n\n${directive}`;
    } else {
      messages.unshift({ role: 'system', content: directive });
    }
    logTurnEvent(turnId, {
      stage: 'agent-loop.completion-integrity-repair.fired',
      missingComponents: missingDraftComponents,
      responseContractIssues,
      contentChars: content.length,
    });
    return {
      fired: true,
      atomicRepair: true,
      state: {
        ...state,
        completionIntegrityRepairUsed: true,
        completionIntegrityRepairAttempts: state.completionIntegrityRepairAttempts + 1,
      },
    };
  }

  // ── D3 verification-before-completion gate ──
  if (
    enableVerification &&
    !state.verificationCorrectionUsed &&
    assertsUnverifiedCompletion(contentReplacement ?? `${content}${contentSuffix ?? ''}`, toolsUsed, userRequest)
  ) {
    if (!availableToolNames.some(isVerificationToolName)) {
      if (requiredTaggedJsonEnvelope(userRequest)) {
        return {
          fired: false,
          state,
          rejectIncompleteReason: 'explicit tagged JSON envelope contained an unverified completion claim and cannot be amended safely',
        };
      }
      logTurnEvent(turnId, {
        stage: 'agent-loop.verification-gate.disclosed',
        contentChars: content.length,
      });
      contentSuffix = `${contentSuffix ?? ''}${VERIFICATION_NO_TOOL_DISCLOSURE}`;
      nextState = { ...state, verificationCorrectionUsed: true };
    } else {
      const systemMessage = messages.find(message => message.role === 'system');
      const internalDirective = `\n\n# Internal verification correction\n${VERIFICATION_GATE_DIRECTIVE}`;
      if (systemMessage && typeof systemMessage.content === 'string') {
        systemMessage.content += internalDirective;
      } else {
        messages.unshift({ role: 'system', content: internalDirective.trim() });
      }
      logTurnEvent(turnId, { stage: 'agent-loop.verification-gate.fired', contentChars: content.length });
      return {
        fired: true,
        state: { ...state, verificationCorrectionUsed: true },
      };
    }
  }

  // ── D1 Hermes-parity closed learning loop (mechanical closure) ──
  if (enableSkillDistillation && !nextState.skillDistillationUsed) {
    const acceptedContent = contentReplacement ?? `${content}${contentSuffix ?? ''}`;
    const distillPlan = planSkillDistillation(toolsUsed, acceptedContent);
    if (distillPlan) {
      messages.push({ role: 'assistant', content: acceptedContent });
      messages.push({ role: 'user', content: distillPlan.directive });
      logTurnEvent(turnId, { stage: 'agent-loop.skill-distillation.fired', toolCalls: toolsUsed.length });

      // AI-OS Phase 3 — skill diffusion observer. Swallow any error so the
      // distillation loop is never blocked by a diffusion-side failure.
      if (onSkillDistillationFire) {
        try {
          await onSkillDistillationFire({
            patternKey: distillPlan.patternKey,
            toolsUsed: [...toolsUsed],
            directive: distillPlan.directive,
          });
        } catch {
          /* observer failures must never block the loop */
        }
      }

      return {
        fired: true,
        contentSuffix,
        contentReplacement,
        state: {
          ...nextState,
          skillDistillationUsed: true,
          preservedAnswerForDistillation: acceptedContent,
        },
      };
    }
  }

  // No gate fired — caller can accept completion.
  return { fired: false, state: nextState, contentSuffix, contentReplacement };
}
