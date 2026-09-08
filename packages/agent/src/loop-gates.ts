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
 * One-shot flags + preserved-answer state for the two completion gates.
 * Created once per `runAgentLoop` invocation; threaded through subsequent
 * `maybeFireCompletionGate` calls so each gate fires AT MOST ONCE per run.
 */
export interface GateState {
  /** True after one atomic structured-draft repair has been attempted. */
  completionIntegrityRepairUsed: boolean;
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

const STRUCTURED_DRAFT_REQUEST = /\b(?:draft|create|prepare|produce|write|build)\b[\s\S]{0,160}\b(?:agenda|plan|memo|report|brief|checklist|schedule|table|outline)\b/i;
const OPENING_METADATA_FIELD = /^\s*(?:title|duration|participants?|audience|purpose|date|owner|prepared\s+(?:for|by))\s*:/i;
const MARKDOWN_HEADING = /^#{1,6}\s+\S/;
const EXACT_OUTPUT_CONTRACT = /^\s*(?:please[,\t ]+)?(?:reply|respond|return|output|print|say|provide|give)(?:[\t ]+with)?[\t ]+exactly[\t ]+(?:(?:these|the[\t ]+following)[\t ]+(?:tokens?|words?|characters?|text|string|sequence|payload|content|output)|this[\t ]+(?:text|string|payload|content|output))(?<qualifier>[^:"'“”‘’\r\n]{0,240}):[\t ]*(?<payload>\S(?:[^\r\n]*\S)?)\s*$/i;
const EXACT_OUTPUT_QUALIFIER = /^[\t ]*(?:(?:in[\t ]+(?:this|the|that|provided)[\t ]+order|separated[\t ]+by[\t ]+(?:one[\t ]+space|spaces?|commas?|newlines?))[\t ]*,?[\t ]*)*(?:and[\t ]+)?nothing[\t ]+else[.!]?[\t ]*$/i;
const MAX_EXACT_OUTPUT_CHARS = 2_048;
const MAX_EXACT_OUTPUT_TOKENS = 256;
const RAW_TOOL_CALL_MARKUP = /\[\/?TOOL_CALL\]|<\s*tool_call\b|\{\s*tool\s*=>|```(?:json|tool)?\s*\{[^`]*"tool"/is;
const TAGGED_JSON_ENVELOPE_CONTRACT = /\b(?:return|respond|output|provide)\s+exactly\s+one\s+<([a-z][\w-]*)>\s*\.\.\.\s*<\/\1>\s+JSON\s+envelope\s+and\s+no\s+text\s+before\s+or\s+after(?:\s+it)?/i;
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
  return { open: `<${tag}>`, close: `</${tag}>` };
}

function taggedJsonEnvelopeMismatch(userRequest: string, content: string): boolean {
  const envelope = requiredTaggedJsonEnvelope(userRequest);
  if (!envelope) return false;
  const normalized = normalizeExactOutput(content);
  return !normalized.startsWith(`${envelope.open}\n`)
    || !normalized.endsWith(`\n${envelope.close}`);
}

function safeTaggedJsonEnvelopeSuffix(userRequest: string, content: string): string | undefined {
  const envelope = requiredTaggedJsonEnvelope(userRequest);
  const normalized = normalizeExactOutput(content);
  if (!envelope
    || content !== normalized
    || !normalized.startsWith(`${envelope.open}\n`)
    || normalized.includes(envelope.close)
    || RAW_TOOL_CALL_MARKUP.test(normalized)) {
    return undefined;
  }
  const payload = normalized.slice(envelope.open.length + 1);
  try {
    JSON.parse(payload);
  } catch {
    return undefined;
  }
  return `\n${envelope.close}`;
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
  const blocks = content.match(/(?:^|\n)\s*(?:[-*]\s*)?(?:\d{1,3}\s*[–—-]\s*)?\d{1,3}\s*(?:min(?:ute)?s?)\b/gim);
  return (blocks?.length ?? 0) >= 2;
}

function missingStructuredDraftComponents(userRequest: string, content: string): string[] {
  if (!STRUCTURED_DRAFT_REQUEST.test(userRequest) || explicitlyScopesDraftToOpening(userRequest)) return [];
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
  const requested = components.filter(component => component.requested.test(userRequest));
  if (requested.length < 3) return [];
  return requested.filter(component => !component.present(content)).map(component => component.label);
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
  const structuredDraftIncomplete = missingDraftComponents.length >= 2
    && endsAfterOpeningScaffold(content);
  const danglingLeadInIncomplete = finishReason === 'stop'
    && endsAfterDanglingLeadIn(content);
  const literalSuffix = exactOutputIncomplete && atomicRepairAvailable
    ? safeExactOutputSuffix(userRequest, content)
    : undefined;
  const taggedEnvelopeSuffix = taggedEnvelopeIncomplete && atomicRepairAvailable
    ? safeTaggedJsonEnvelopeSuffix(userRequest, content)
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
  if ((exactOutputIncomplete && literalSuffix === undefined)
    || (taggedEnvelopeIncomplete && taggedEnvelopeSuffix === undefined)
    || malformedMarkdownTable
    || structuredDraftIncomplete
    || danglingLeadInIncomplete) {
    const reason = exactOutputIncomplete
      ? 'explicit exact-output contract was not completed'
      : taggedEnvelopeIncomplete
        ? 'explicit tagged JSON envelope was not completed'
        : malformedMarkdownTable
          ? 'Markdown table has inconsistent column counts'
      : structuredDraftIncomplete
        ? 'structured draft ended after its opening scaffold'
        : 'answer ended after an unfinished lead-in';
    if (state.completionIntegrityRepairUsed || !atomicRepairAvailable) {
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
      : structuredDraftIncomplete
        ? [
          '# Internal completion-integrity correction',
          'The prior candidate stopped after its opening metadata scaffold and was not shown to the user.',
          `Redraft the answer from the beginning and include every explicit requirement, especially: ${missingDraftComponents.join(', ')}.`,
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
      contentChars: content.length,
    });
    return {
      fired: true,
      atomicRepair: true,
      state: { ...state, completionIntegrityRepairUsed: true },
    };
  }

  // ── D3 verification-before-completion gate ──
  if (
    enableVerification &&
    !state.verificationCorrectionUsed &&
    assertsUnverifiedCompletion(`${content}${contentSuffix ?? ''}`, toolsUsed, userRequest)
  ) {
    if (!availableToolNames.some(isVerificationToolName)) {
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
    const acceptedContent = `${content}${contentSuffix ?? ''}`;
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
        state: {
          ...nextState,
          skillDistillationUsed: true,
          preservedAnswerForDistillation: acceptedContent,
        },
      };
    }
  }

  // No gate fired — caller can accept completion.
  return { fired: false, state: nextState, contentSuffix };
}
