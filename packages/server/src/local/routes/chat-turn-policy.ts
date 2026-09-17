/**
 * Conversational Turn Policy — the application business rules that decide what a
 * single chat turn is allowed to do: whether the user explicitly asked for a
 * gated action, which tools survive the conversational narrowing, and which
 * memory reads the turn has earned.
 *
 * Phase 5 (clean-architecture) of the technical-debt journey moved these rules
 * out of `routes/chat.ts`. They were always pure, but living inside the Fastify
 * plugin module meant every consumer — and every test — loaded the delivery
 * mechanism and the persistence package along with them. This module imports no
 * framework, no persistence and no `node:` I/O, and
 * `tests/local/chat-turn-policy-boundary.test.ts` fails if that stops being true.
 *
 * `routes/chat.ts` re-exports every symbol below, so existing callers and the
 * pins that cover them are unaffected by the move.
 */
import { READONLY_TOOLS } from '@waggle/agent/permissions';
import { isBoundedSingleFileRoundTrip } from '@waggle/agent/tool-filter';
import type { AgentLoopConfig, AutonomyLevel } from '@waggle/agent';
import type { GoalAncestry } from '@waggle/shared';
import {
  actionableMemoryDirectiveText,
  allowsConversationHistory,
  allowsPersistedMemoryRead,
  classifyExplicitTurnMutationPolicy,
  filterToolsByTurnMutationPolicy,
  isExclusiveSuppliedOnlyResponseRequest,
  isRegulatedContent,
  resolveExplicitPersistedMemoryReadDirective,
  type TurnMutationPolicy,
} from './chat-helpers.js';

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
export const EXPLICIT_READ_ONLY_TOOL_NAMES = new Set([...READONLY_TOOLS, 'read_skill']);

const PLAN_AUTHORING_TOOL_NAMES = new Set(['create_plan', 'add_plan_step']);
export const DECISION_MATRIX_TOOL_SEQUENCE = ['read_skill', 'calculate_decision_matrix'] as const;

const EXPLICIT_GATED_ACTION_VERB_SOURCE = String.raw`(?:write|read|edit|modify|create|generate|regenerate|export|download|commit|push|pull|merge|branch|run|execute|install|delete|remove|inspect|explore|review|analy[sz]e|fix|debug|test|validate|verify|check|build|compile|typecheck|lint|refactor|implement|draft|prepare|schedule|send|email|publish|upload|delegate|coordinate|orchestrate|browse|navigate|open|click|fill|query|calculate|compute)`;
const AMBIGUOUS_GATED_ACTION_VERB_SOURCE = String.raw`(?:message|share|post|update)`;
const NEGATABLE_CAPABILITY_VERB_SOURCE = String.raw`(?:${EXPLICIT_GATED_ACTION_VERB_SOURCE}|${AMBIGUOUS_GATED_ACTION_VERB_SOURCE}|use|call|invoke|search|research|investigate|try|retry)`;
const PRESENTATION_SIDE_EFFECT_PATTERN = new RegExp(
  String.raw`\b(?:${NEGATABLE_CAPABILITY_VERB_SOURCE}|persist|store|remember|launch)\b`,
  'i',
);
const CAPABILITY_GERUND_SOURCE = String.raw`(?:writing|reading|editing|modifying|creating|generating|regenerating|exporting|downloading|committing|pushing|pulling|merging|branching|running|executing|installing|deleting|removing|inspecting|exploring|reviewing|analy[sz]ing|fixing|debugging|testing|validating|verifying|checking|building|compiling|typechecking|linting|refactoring|implementing|drafting|preparing|scheduling|sending|emailing|messaging|sharing|publishing|uploading|updating|posting|delegating|coordinating|orchestrating|browsing|navigating|opening|clicking|filling|querying|calculating|computing|using|calling|invoking|searching|researching|investigating|trying|retrying)`;
const NEGATABLE_CAPABILITY_NOUN_SOURCE = String.raw`(?:calculator(?:\s+(?:tool|plugin))?|tools?|files?|documents?|artifacts?|workbooks?|spreadsheets?|xlsx|code|python|shell|browser|web|internet)`;
const NEGATED_CAPABILITY_RESUME_SOURCE = String.raw`(?:\b(?:but|however|yet|instead|then)\b|[:\u2013\u2014]\s*(?=(?:please\s+)?${NEGATABLE_CAPABILITY_VERB_SOURCE}\b))`;
const WITHOUT_CAPABILITY_RESUME_SOURCE = String.raw`(?:${NEGATED_CAPABILITY_RESUME_SOURCE}|\band\s+(?=${NEGATABLE_CAPABILITY_VERB_SOURCE}\b))`;
const NEGATED_CAPABILITY_TAIL_SOURCE = String.raw`(?:(?!${NEGATED_CAPABILITY_RESUME_SOURCE})[^,.;!?\r\n])*(?=${NEGATED_CAPABILITY_RESUME_SOURCE}|[,.;!?\r\n]|$)`;
const DIRECT_NEGATED_CAPABILITY_TAIL_SOURCE = String.raw`(?:(?!${NEGATED_CAPABILITY_RESUME_SOURCE})[^.;!?\r\n])*(?=${NEGATED_CAPABILITY_RESUME_SOURCE}|[.;!?\r\n]|$)`;
const WITHOUT_CAPABILITY_TAIL_SOURCE = String.raw`(?:(?!${WITHOUT_CAPABILITY_RESUME_SOURCE})[^,.;!?\r\n])*(?=${WITHOUT_CAPABILITY_RESUME_SOURCE}|[,.;!?\r\n]|$)`;
const EXPLICIT_GATED_ACTION_PATTERN = new RegExp(String.raw`\b${EXPLICIT_GATED_ACTION_VERB_SOURCE}\b`, 'i');
const RETRY_GATED_ACTION_PATTERN = /^\s*(?:(?:ok(?:ay)?|yes)[,\s]+)?(?:(?:please\s+)|(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?))?(?:try\s+(?:now|again)|retry|same\s+again)\b/i;
const DIRECT_CAPABILITY_LEAD_SOURCE = String.raw`(?:(?:please(?:,\s*|\s+))|(?:(?:can|could|would|will)\s+you\s+(?:please(?:,\s*|\s+))?(?:(?:be\s+able\s+to\s+)|(?:help\s+(?:me|us)\s+(?:to\s+)?)))|(?:(?:can|could|would|will)\s+(?:you|we)\s+(?:please(?:,\s*|\s+))?)|(?:i\s+(?:need|want|would\s+like)\s+you\s+to\s+)|(?:(?:please(?:,\s*|\s+))?go\s+ahead\s+and\s+)|(?:let(?:['\u2019]s|\s+us)\s+))?`;
const DIRECT_CAPABILITY_ACTION_PATTERN = new RegExp(
  String.raw`^\s*${DIRECT_CAPABILITY_LEAD_SOURCE}${NEGATABLE_CAPABILITY_VERB_SOURCE}\b`,
  'i',
);
const READ_ONLY_REPOSITORY_DISCOVERY_PATTERN = /(?:^|[.;:!?\r\n]\s*|\b(?:and|but|then)\s+)(?:(?:please(?:,\s*|\s+))|(?:(?:can|could|would|will)\s+(?:you|we)\s+(?:please(?:,\s*|\s+))?)|(?:i\s+(?:need|want)\s+you\s+to\s+)|(?:let(?:['\u2019]s|\s+us)\s+))?(?:(?:use|using)\s+(?:the\s+)?(?:available\s+)?tools?\s+to\s+)?(?:(?:explore|examine|understand|look\s+(?:through|at))\b[^.;!?\r\n]*\b(?:repo(?:sitory)?|codebase|code|project|workspace)\b|inspect\b[^.;!?\r\n]*\b(?:repo(?:sitory)?|codebase|workspace)\b)/i;
const REPOSITORY_EXECUTION_OR_MUTATION_PATTERN = /(?:^|[.;:!?\r\n]\s*|\b(?:and|but|then)\s+)(?:(?:please(?:,\s*|\s+))|(?:(?:can|could|would|will)\s+(?:you|we)\s+(?:please(?:,\s*|\s+))?)|(?:i\s+(?:need|want)\s+you\s+to\s+)|(?:let(?:['\u2019]s|\s+us)\s+))?(?:run|execute|test|fix|debug|edit|modify|write|create|implement|compile|lint|refactor|commit|push|pull|merge|delete|remove)\b|\b(?:use|using)\s+(?:bash|terminal|shell)\b/i;
const REPOSITORY_MUTATION_OR_EXECUTION_SIGNAL = /\b(?:run|execute|test|fix|debug|edit|modify|write|create|generate|implement|compile|lint|refactor|commit|push|pull|merge|delete|remove|delegate|launch|send|publish|upload|install)\b/i;
const REPOSITORY_DISCOVERY_TOOL_NAMES = new Set([
  'read_file', 'search_files', 'search_content',
  'git_status', 'git_diff', 'git_log',
]);

function isReadOnlyRepositoryDiscoveryRequest(message: string): boolean {
  const actionableMessage = stripNegatedCapabilityClauses(message);
  return READ_ONLY_REPOSITORY_DISCOVERY_PATTERN.test(actionableMessage)
    && !REPOSITORY_EXECUTION_OR_MUTATION_PATTERN.test(actionableMessage)
    && !REPOSITORY_MUTATION_OR_EXECUTION_SIGNAL.test(actionableMessage);
}
const NEGATED_CAPABILITY_DIRECTIVE_SOURCE = String.raw`(?:do\s+not|don['\u2019]t|(?:do\s+not|don['\u2019]t)\s+want\s+to|never|must\s+not|mustn['\u2019]t|should\s+not|shouldn['\u2019]t|may\s+not|might\s+not|cannot|can\s+not|can['\u2019]t|will\s+not|won['\u2019]t|would\s+not|wouldn['\u2019]t|(?:am|are|is|['\u2019](?:m|re|s))\s+not(?:\s+(?:ready(?:\s+to)?|able\s+to|allowed\s+to|going\s+to))?|(?:aren['\u2019]t|isn['\u2019]t)\s+(?:ready(?:\s+to)?|able\s+to|allowed\s+to|going\s+to)|there\s+(?:is|['\u2019]s)\s+no\s+need\s+to|not(?:\s+(?:ready(?:\s+to)?|able\s+to|allowed\s+to|going\s+to))?)`;
const DIRECT_NEGATED_CAPABILITY_PATTERN = new RegExp(
  String.raw`\b${NEGATED_CAPABILITY_DIRECTIVE_SOURCE}\s+${NEGATABLE_CAPABILITY_VERB_SOURCE}\b${DIRECT_NEGATED_CAPABILITY_TAIL_SOURCE}`,
  'gi',
);
const WITHOUT_CAPABILITY_PATTERN = new RegExp(
  String.raw`\bwithout\s+(?:${CAPABILITY_GERUND_SOURCE}\b|(?:the\s+)?use\s+of\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}\b|(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}\b)${WITHOUT_CAPABILITY_TAIL_SOURCE}`,
  'gi',
);
const POST_VERBAL_NEGATIVE_CAPABILITY_COUNT_SOURCE = String.raw`(?:(?:no(?!\s+more\s+than\b)|zero|0|not\s+(?:one|a\s+single|any))\s+|(?:none|neither)(?:\s+of)?\s+(?:the\s+)?)`;
const POST_VERBAL_NEGATED_CAPABILITY_PATTERN = new RegExp(
  String.raw`\b(?:(?:run|execute|test)\s+(?:${POST_VERBAL_NEGATIVE_CAPABILITY_COUNT_SOURCE}(?:tests?|commands?|scripts?|tasks?|checks?)\b|nothing(?!\s+but\b)|neither\b[^.;!?\r\n]*\bnor\b[^.;!?\r\n]*\b(?:tests?|commands?|scripts?|tasks?|checks?)\b)|(?:edit|modify|write|create|delete|remove)\s+(?:${POST_VERBAL_NEGATIVE_CAPABILITY_COUNT_SOURCE}(?:files?|documents?|artifacts?|changes?)\b|nothing(?!\s+but\b)|neither\b[^.;!?\r\n]*\bnor\b[^.;!?\r\n]*\b(?:files?|documents?|artifacts?|changes?)\b)|(?:commit|push|pull|merge)\s+(?:${POST_VERBAL_NEGATIVE_CAPABILITY_COUNT_SOURCE}(?:changes?|commits?|branches?|files?)\b|nothing(?!\s+but\b)|neither\b[^.;!?\r\n]*\bnor\b[^.;!?\r\n]*\b(?:changes?|commits?|branches?|files?)\b))[^.;!?\r\n]*`,
  'gi',
);
const NOMINAL_NEGATED_CAPABILITY_PATTERN = new RegExp(
  String.raw`\b(?:no\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}|avoid\s+(?:${CAPABILITY_GERUND_SOURCE}\b(?:\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE})?|(?:the\s+)?use\s+of\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}|(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE})|not\s+(?:${CAPABILITY_GERUND_SOURCE}\b(?:\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE})?|(?:the\s+)?use\s+of\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE})|refrain\s+from\s+(?:${CAPABILITY_GERUND_SOURCE}\b(?:\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE})?|(?:the\s+)?use\s+of\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE})|(?:using\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}|(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}(?:\s+use)?)\s+(?:is|remains)\s+(?:prohibited|forbidden|disallowed|not\s+(?:allowed|needed|required|necessary)))\b${NEGATED_CAPABILITY_TAIL_SOURCE}`,
  'gi',
);
const NO_NEED_CAPABILITY_PATTERN = new RegExp(
  String.raw`\b(?:(?:there\s+is|there['\u2019]s)\s+no\s+need|(?:you\s+)?(?:do\s+not|don['\u2019]t)\s+need)\s+to\s+(?:use|call|invoke)\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}\b${NEGATED_CAPABILITY_TAIL_SOURCE}`,
  'gi',
);
const NOT_IN_CAPABILITY_PATTERN = new RegExp(
  String.raw`\bnot\s+(?:in|to|as)\s+(?:a\s+|the\s+|any\s+)?${NEGATABLE_CAPABILITY_NOUN_SOURCE}\b${NEGATED_CAPABILITY_TAIL_SOURCE}`,
  'gi',
);
const AMBIGUOUS_GATED_ACTION_PATTERN = new RegExp(
  String.raw`(?:^|[.;:!?\r\n][ \t]*|\b(?:and|then|please|to)\s+)(?:[-+*][ \t]+|\d+[.)][ \t]+)?(?:please\s+)?(?:(?:share|post|update)\s+(?:(?:the|this|that|it|a|an|my|our|your)\b|(?:result|report|file|document|dashboard|record)\b)|message\s+(?:(?:the|this|that|a|my|our|your)\b|(?:me|us|him|her|them|team|finance)\b))`,
  'i',
);

const QUOTED_TOOL_DIRECTIVE_PATTERN = /"[^"\r\n]*"|“[^”\r\n]*”|«[^»\r\n]*»|'[^'\r\n]*'/g;
const EXPLICIT_NAMED_TOOL_ACTION_SOURCE = String.raw`(?:^|[.!?]\s+)(?:(?:before|after)\b[^,.;!?\r\n]{0,40},\s*)?(?:(?:(?:can|could|would)\s+you(?:\s+please)?|please|then)\s+)?(?:use|call|invoke|run)\s+(?:(?:the|a|an|installed)\s+)*(?:tool\s+)?(?<name>[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b`;
const PRIOR_TOOL_DIRECTIVE_REFERENCE_SOURCE = String.raw`(?:it|(?:that|this)(?:\s+(?:instruction|directive|request|command|sequence))?|(?:(?:the|my|your|our)\s+)?(?:(?:previous|preceding|above|earlier|prior)\s+)?(?:instruction|directive|request|command|sequence))`;
const AFFIRMED_TOOL_DIRECTIVE_SOURCE = String.raw`(?:(?:you\s+)?(?:do\s+not|don['\u2019]t|never|must\s+not|mustn['\u2019]t|should\s+not|shouldn['\u2019]t))\s+(?:ignore|skip|disregard)\s+${PRIOR_TOOL_DIRECTIVE_REFERENCE_SOURCE}`;
const AFFIRMED_TOOL_DIRECTIVE_PATTERN = new RegExp(
  String.raw`\b${AFFIRMED_TOOL_DIRECTIVE_SOURCE}\b`,
  'gi',
);
const AFFIRMED_TOOL_DIRECTIVE_PREFIX_PATTERN = new RegExp(
  String.raw`^${AFFIRMED_TOOL_DIRECTIVE_SOURCE}\b[.!?;]?\s*`,
  'i',
);
const CANCELLED_PRIOR_TOOL_DIRECTIVE_PATTERN = new RegExp(
  String.raw`\b(?:skip|ignore|disregard)\s+${PRIOR_TOOL_DIRECTIVE_REFERENCE_SOURCE}\b`,
  'i',
);

function hasMetaToolDirectivePrefix(prefix: string): boolean {
  return prefix.split(/[.!?;\r\n]+/).some((rawClause) => {
    const clause = rawClause.trim();
    if (!clause) return false;
    const explicitMeta = /^(?:suppose|imagine|pretend)\b[^.!?;]*\b(?:someone|a\s+user|this|an?\s+(?:example|quote|instruction|directive|prompt))\b/i.test(clause)
      || /^(?:here\s+(?:is|['\u2019]s)|this\s+is|the\s+following\s+is|what\s+follows\s+is)\b[^.!?;]*\b(?:example|quote|quoted|quotation|data|hypothetical|instruction|directive|prompt)\b/i.test(clause)
      || /\bhypothetical\s+(?:user|instruction|directive|prompt)\b[^.!?;]*\b(?:says|said)\b/i.test(clause)
      || /\bnot\s+an?\s+instruction\b/i.test(clause);
    if (explicitMeta) return true;
    if (/\b(?:review|compare|evaluate|score|rank|analy[sz]e)\b[^.!?;]*\b(?:using|with)\s+(?:the\s+)?decision[- ]matrix\b/i.test(clause)) return false;
    return /^(?:review|explain|analy[sz]e|discuss)\s+(?:this|the\s+following|that)\s+(?:example|quote|text|directive)\b/i.test(clause);
  });
}

function hasCancelledToolDirectiveSuffix(suffix: string): boolean {
  const withoutAffirmedExecution = suffix.replace(
    AFFIRMED_TOOL_DIRECTIVE_PATTERN,
    'affirm execution',
  );
  return /\b(?:do\s+not|don['\u2019]t|never|must\s+not|mustn['\u2019]t|should\s+not|shouldn['\u2019]t|cannot|can['\u2019]t|i\s+don['\u2019]t\s+want\s+you\s+to|you\s+are\s+not\s+to)\b[^.!?;]{0,100}\b(?:execute|run|invoke|call|use|proceed|follow|perform)\b/i.test(withoutAffirmedExecution)
    || /(?:^|[.!?;\r\n]\s*)(?:(?:actually|please)[,\s]+)?(?:stop|cancel|retract|abort|halt)\b/i.test(withoutAffirmedExecution)
    || /\b(?:changed\s+my\s+mind|scratch\s+that|take\s+that\s+back)\b/i.test(withoutAffirmedExecution)
    || CANCELLED_PRIOR_TOOL_DIRECTIVE_PATTERN.test(withoutAffirmedExecution)
    || /\b(?:it|that|this|(?:the\s+)?(?:preceding|above|text|directive|request|command))\b[^.!?;]{0,80}\bnot\s+an?\s+instruction\b/i.test(withoutAffirmedExecution)
    || /\btreat\b[^.!?;]{0,80}\b(?:it|that|this|preceding|above)\b[^.!?;]{0,80}\bas\b[^.!?;]{0,40}\b(?:data|example|hypothetical|quote)\b/i.test(withoutAffirmedExecution);
}

function hasCancelledPriorRequest(text: string): boolean {
  const withoutAffirmedExecution = text.replace(AFFIRMED_TOOL_DIRECTIVE_PATTERN, 'affirm execution');
  return CANCELLED_PRIOR_TOOL_DIRECTIVE_PATTERN.test(withoutAffirmedExecution)
    || /(?:^|[.!?;\r\n]\s*)(?:(?:actually|please)[,\s]+)?(?:stop|cancel|retract|abort|halt)\b/i.test(withoutAffirmedExecution)
    || /\b(?:changed\s+my\s+mind|scratch\s+that|take\s+that\s+back)\b/i.test(withoutAffirmedExecution);
}

function hasNegatedDecisionToolAction(text: string): boolean {
  const nominalTarget = String.raw`(?:calculator(?:\s+use)?|calculations?(?:\s+use)?|skills?(?:\s+use)?|tools?(?:\s+use)?|decision[- ]matrix(?:\s+use)?)`;
  if (new RegExp(String.raw`\bno\s+${nominalTarget}\b`, 'i').test(text)
    || new RegExp(String.raw`\b${nominalTarget}\s+(?:is|are)\s+(?:forbidden|disallowed|not\s+(?:allowed|permitted))\b`, 'i').test(text)) {
    return true;
  }
  const normalized = text.replace(
    /\b(?:do\s+not|don['\u2019]t|never|must\s+not|mustn['\u2019]t|should\s+not|shouldn['\u2019]t|cannot|can['\u2019]t|you\s+are\s+not\s+to)\s+(?:compare|evaluate|score|rank|choose|decide|calculate)\b(?:(?!\b(?:and|or|but|nor)\b)[^.!?;]){0,80}\b(?:manually|by\s+hand|yourself|from\s+memory|by\s+(?:(?!\b(?:and|or|but|nor)\b)[^.!?;,]){1,40}\balone)\b\s*(?=[.!?;]|$)/gi,
    'use the verified calculator',
  );
  return /\b(?:do\s+not|don['\u2019]t|never|must\s+not|mustn['\u2019]t|should\s+not|shouldn['\u2019]t|cannot|can['\u2019]t|you\s+are\s+not\s+to)\b[^.!?;]{0,100}\b(?:compare|evaluate|score|rank|choose|decide|calculate|read|execute|run|invoke|call)\b/i.test(normalized)
    || /\b(?:avoid|refrain\s+from)\b[^.!?;]{0,80}\b(?:comparing|evaluating|scoring|ranking|choosing|deciding|calculating|reading|executing|running|invoking|calling|using\b[^.!?;]{0,50}\b(?:tools?|skills?|decision[- ]matrix|calculator|read_skill))\b/i.test(normalized)
    || /\bwithout\b[^.!?;]{0,80}\b(?:comparing|evaluating|scoring|ranking|choosing|deciding|calculating|reading|executing|running|invoking|calling)\b/i.test(normalized)
    || /\bwithout\b[^.!?;]{0,80}\b(?:using|calling|invoking|running)\b[^.!?;]{0,50}\b(?:tools?|skills?|decision[- ]matrix|calculator|read_skill)\b/i.test(normalized)
    || /\bwithout\s+(?:the\s+|any\s+)?(?:tools?|skills?|decision[- ]matrix|calculator|read_skill)\b/i.test(normalized)
    || /\b(?:do\s+not|don['\u2019]t|never|must\s+not|should\s+not|cannot|can['\u2019]t)\b[^.!?;]{0,80}\buse\b[^.!?;]{0,50}\b(?:decision[- ]matrix|tools?|skills?|read_skill)\b/i.test(normalized);
}

function isMetaDecisionContentRequest(message: string): boolean {
  if (/```|~~~/.test(message)) return true;
  const normalized = message.replace(QUOTED_TOOL_DIRECTIVE_PATTERN, ' ').trim();
  return /^(?:please\s+)?(?:summari[sz]e|review|analy[sz]e|explain|translate|extract|paraphrase|critique|edit|rewrite|classify)\b[^.!?;\r\n]{0,100}\b(?:this|that|the\s+following|an?\s+)?(?:text|message|sentence|phrase|prompt|document|data|content|passage|readme|copy|guide|example|instructions?|tutorial)\b/i.test(normalized)
    || /\b(?:write|draft|create|recommend|suggest|improve|review|summari[sz]e|explain|analy[sz]e)\b[^.!?;\r\n]{0,100}\b(?:copy|guide|article|document|text|prompt|template|instructions?|tutorial)\b/i.test(normalized);
}

interface ExplicitReadSkillDirective {
  skillName: string | null;
  exactName: boolean;
  prefix: string;
  suffix: string;
}

function parseExplicitReadSkillDirective(message: string): ExplicitReadSkillDirective | null {
  const actionable = message.replace(QUOTED_TOOL_DIRECTIVE_PATTERN, ' ');
  const matches = Array.from(actionable.matchAll(new RegExp(EXPLICIT_NAMED_TOOL_ACTION_SOURCE, 'gi')));
  if (matches.length !== 1 || matches[0].groups?.name?.toLowerCase() !== 'read_skill') return null;

  const directiveEnd = (matches[0].index ?? 0) + matches[0][0].length;
  const directiveRemainder = actionable.slice(directiveEnd);
  const sentenceTerminatorOffset = directiveRemainder.search(/[.!?\r\n]/);
  const directiveSentenceEnd = sentenceTerminatorOffset === -1
    ? actionable.length
    : directiveEnd + sentenceTerminatorOffset + 1;
  const directivePrefix = actionable.slice(0, matches[0].index ?? 0).trim();
  const directiveSuffix = actionable.slice(directiveSentenceEnd).trim();
  if (hasMetaToolDirectivePrefix(directivePrefix)
    || hasCancelledToolDirectiveSuffix(directiveSuffix)) return null;

  const sentenceTail = directiveRemainder.split(/[.!?\r\n]/, 1)[0].trim();
  if (sentenceTail === '' || /^(?:exactly\s+once|once)$/i.test(sentenceTail)) {
    return { skillName: null, exactName: false, prefix: directivePrefix, suffix: directiveSuffix };
  }
  const named = sentenceTail.match(
    /^(?:with|using)\s+(?:the\s+)?(?<exact>exact\s+)?name\s+(?<skillName>[a-z0-9][\w.-]*)$/i,
  );
  return named?.groups?.skillName
    ? {
        skillName: named.groups.skillName.toLowerCase(),
        exactName: Boolean(named.groups.exact),
        prefix: directivePrefix,
        suffix: directiveSuffix,
      }
    : null;
}

function isExplicitReadSkillDirective(message: string): boolean {
  return parseExplicitReadSkillDirective(message) !== null;
}

export function isExplicitDecisionMatrixSkillDirective(message: string): boolean {
  const directive = parseExplicitReadSkillDirective(message);
  if (directive?.skillName !== 'decision-matrix' || !directive.exactName) return false;
  if (hasNegatedDecisionToolAction(directive.prefix)
    || hasNegatedDecisionToolAction(directive.suffix)) return false;
  const positivePrefixTask = /\b(?:compare|evaluate|score|rank|choose|decide|calculate)\b[^.!?;]*(?:\bdecision[- ]matrix\b|\b(?:option|criterion|criteria|weight|scores?|cost|benefit|risk|time)\b)/i.test(directive.prefix);

  const positiveSuffix = directive.suffix.replace(
    AFFIRMED_TOOL_DIRECTIVE_PREFIX_PATTERN,
    '',
  );
  const presentationOnlySuffix = positiveSuffix !== ''
    && positiveSuffix.split(/[.!?;\r\n]+/).every((rawClause) => {
      const clause = rawClause.trim();
      if (!clause) return true;
      const lead = clause.match(/^(?:include|show|return|format|present|summari[sz]e|explain|keep|make)\b/i);
      return Boolean(lead)
        && !PRESENTATION_SIDE_EFFECT_PATTERN.test(clause.slice(lead?.[0].length ?? 0));
    });
  return (positivePrefixTask && (positiveSuffix === '' || presentationOnlySuffix))
    || /^(?:compare|evaluate|score|rank|choose|decide|calculate)\b/i.test(positiveSuffix)
    || /^ignore\s+(?:ties|equal\s+scores?|missing\s+values?)\b[^.!?;]*\b(?:rank|compare|score|choose|decide)\b/i.test(positiveSuffix)
    || /^wait\s+for\s+(?:the\s+)?calculator\s+result\b[^.!?;]*(?:before\s+(?:answering|recommending))?/i.test(positiveSuffix);
}

export function isDecisionMatrixSkillRequest(message: string): boolean {
  if (isExplicitDecisionMatrixSkillDirective(message)) return true;

  const actionable = message.replace(QUOTED_TOOL_DIRECTIVE_PATTERN, ' ').trim();
  if (!actionable
    || isExclusiveSuppliedOnlyResponseRequest(message)
    || hasMetaToolDirectivePrefix(actionable)
    || isMetaDecisionContentRequest(message)
    || hasCancelledPriorRequest(actionable)
    || /(?:^|[.!?;\r\n]\s*)(?:(?:actually|please)[,\s]+)?(?:stop|cancel|retract|abort|halt)\b/i.test(actionable)
    || /\b(?:changed\s+my\s+mind|scratch\s+that|take\s+that\s+back)\b/i.test(actionable)
    || hasNegatedDecisionToolAction(actionable)) return false;

  const asksForDecision = /\b(?:help\s+(?:me\s+)?(?:decide|choose)|make\s+(?:me\s+)?(?:a\s+)?(?:reliable\s+)?(?:weighted\s+)?decision|compare|evaluate|score|rank|choose|decide|recommend)\b/i.test(actionable);
  const namesWeightedMethod = /\b(?:weighted\s+(?:decision|comparison|scor(?:e|ing)|ranking)|decision[- ]matrix)\b/i.test(actionable);
  const suppliesCriteria = /\bcriteri(?:on|a)\b/i.test(actionable);
  const suppliesWeights = /\bweights?\b/i.test(actionable);
  const suppliesScores = /\bscores?\b/i.test(actionable);
  const optionNames = new Set(
    Array.from(actionable.matchAll(/\boption\s+([a-z0-9][\w-]*)\b/gi), match => match[1].toLowerCase()),
  );
  const suppliesTwoOptions = optionNames.size >= 2
    || /\bbetween\s+[^.!?;,]{1,60}\s+and\s+[^.!?;,]{1,60}/i.test(actionable)
    || /\b(?:compare|evaluate|score|rank)\s+[^.!?;,]{1,60}?\s+(?:and|vs\.?|versus|against)\s+[^.!?;,]{1,60}?(?=\s+(?:with|using|on|across|based)\b|[.!?;,]|$)/i.test(actionable);
  const suppliedNumbers = actionable.match(/(?<![\w.])[-+]?\d[\d,.]*(?:\.\d+)?%?/g) ?? [];

  return asksForDecision
    && namesWeightedMethod
    && suppliesCriteria
    && suppliesWeights
    && suppliesScores
    && suppliesTwoOptions
    && suppliedNumbers.length >= 4;
}

function stripNamedToolActionSentences(message: string): string {
  const matches = Array.from(message.matchAll(new RegExp(EXPLICIT_NAMED_TOOL_ACTION_SOURCE, 'gi')));
  if (matches.length === 0) return message;
  const ranges = matches.map((match) => {
    const matchStart = match.index ?? 0;
    const verbOffset = match[0].search(/\b(?:use|call|invoke|run)\b/i);
    const actionStart = matchStart + Math.max(0, verbOffset);
    const priorBoundary = Math.max(
      message.lastIndexOf('.', actionStart - 1),
      message.lastIndexOf('!', actionStart - 1),
      message.lastIndexOf('?', actionStart - 1),
      message.lastIndexOf('\n', actionStart - 1),
      message.lastIndexOf('\r', actionStart - 1),
    );
    const nextBoundaries = ['.', '!', '?', '\n', '\r']
      .map(boundary => message.indexOf(boundary, actionStart))
      .filter(index => index >= 0);
    const nextBoundary = nextBoundaries.length > 0 ? Math.min(...nextBoundaries) + 1 : message.length;
    return { start: priorBoundary + 1, end: nextBoundary };
  });
  let cursor = 0;
  let stripped = '';
  for (const range of ranges) {
    if (range.start > cursor) stripped += message.slice(cursor, range.start);
    stripped += ' ';
    cursor = Math.max(cursor, range.end);
  }
  return stripped + message.slice(cursor);
}

function stripNegatedCapabilityClauses(message: string): string {
  return message
    .replace(DIRECT_NEGATED_CAPABILITY_PATTERN, ' ')
    .replace(WITHOUT_CAPABILITY_PATTERN, ' ')
    .replace(POST_VERBAL_NEGATED_CAPABILITY_PATTERN, ' ')
    .replace(NOMINAL_NEGATED_CAPABILITY_PATTERN, ' ')
    .replace(NO_NEED_CAPABILITY_PATTERN, ' ')
    .replace(NOT_IN_CAPABILITY_PATTERN, ' ');
}

function hasExplicitGatedToolIntent(message: string): boolean {
  const withoutQuotedNamedToolExamples = message.replace(
    QUOTED_TOOL_DIRECTIVE_PATTERN,
    quoted => new RegExp(EXPLICIT_NAMED_TOOL_ACTION_SOURCE, 'i').test(quoted.slice(1, -1)) ? ' ' : quoted,
  );
  const genericIntentMessage = stripNamedToolActionSentences(withoutQuotedNamedToolExamples);
  const actionVerbIntentMessage = genericIntentMessage.replace(
    /\b(?:this|that|the|an?|my|our|your)\s+emails?\b/gi,
    ' ',
  );
  return EXPLICIT_GATED_ACTION_PATTERN.test(actionVerbIntentMessage)
    || RETRY_GATED_ACTION_PATTERN.test(genericIntentMessage)
    || AMBIGUOUS_GATED_ACTION_PATTERN.test(genericIntentMessage)
    || isExplicitReadSkillDirective(message)
    || /\b(file|docx|document|artifact|workbook|spreadsheet|xlsx|terminal|shell|bash|command|calculator|cross-workspace|other workspace)\b/i.test(genericIntentMessage)
    || /\b(?:use|using|call|invoke|run)\s+(?:(?:the|a|an)\s+)?(?:calculator|python|code|spreadsheet|workbook|xlsx)\b/i.test(genericIntentMessage)
    || /\b(?:use|using|call|invoke|run)\s+(?:the\s+)?[a-z][\w.:-]*(?:\s+[a-z][\w.:-]*){0,2}\s+(?:tool|plugin|mcp)\b/i.test(genericIntentMessage)
    || /\b(search|research|investigate)\b[^.?!]*\b(file|code|repo(?:sitory)?|sql|etl|pipeline)\b/i.test(genericIntentMessage)
    || /\bsave\s+(this|that|it)\s+(as|to|in)\b/i.test(genericIntentMessage)
    || isExplicitPlanAuthoringRequest(genericIntentMessage);
}

export function isExplicitGatedToolRequest(message: string): boolean {
  if (classifyExplicitTurnMutationPolicy(message).denyAllMutations) return false;
  if (isExclusiveSuppliedOnlyResponseRequest(message)) return false;
  const memoryActionable = actionableMemoryDirectiveText(message);
  if (memoryActionable !== message) {
    const remainder = memoryActionable.replace(/^[\s?.!,;:—–-]+/, '').trim();
    if (remainder === ''
      || /^(?:please\s+)?(?:explain|translate|quote|repeat|paraphrase|summari[sz]e|analy[sz]e|review)\b[^.;!?\r\n]{0,100}(?:[.!?]\s*)?$/i.test(remainder)) {
      return false;
    }
  }
  const actionableMessage = stripNegatedCapabilityClauses(message);
  if (isInlineTextOnlyDraftRequest(actionableMessage)) return false;
  if (isInlineSelfContainedCalculationRequest(actionableMessage)) return false;
  return hasExplicitGatedToolIntent(actionableMessage);
}

const BUILT_IN_ARTIFACT_GENERATOR_REQUESTS: ReadonlyArray<{
  toolName: string;
  pattern: RegExp;
}> = [
  { toolName: 'generate_docx', pattern: /\b(?:docx|word\s+document)\b/i },
  { toolName: 'generate_pdf', pattern: /\bpdf\b/i },
  { toolName: 'generate_xlsx', pattern: /\b(?:xlsx|excel\s+(?:file|workbook|spreadsheet)|spreadsheet)\b/i },
  { toolName: 'generate_pptx', pattern: /\b(?:pptx|powerpoint|slide\s+deck|presentation)\b/i },
];

export function requestedBuiltInArtifactToolNames(message: string): string[] {
  return BUILT_IN_ARTIFACT_GENERATOR_REQUESTS
    .filter(({ pattern }) => pattern.test(message))
    .map(({ toolName }) => toolName);
}

export function shouldRequireCapabilityAcquisitionTools(
  message: string,
  availableTools: readonly { name: string }[] = [],
): boolean {
  if (isBoundedSingleFileRoundTrip(message)) return false;
  const actionableMessage = stripNegatedCapabilityClauses(message);
  if (RETRY_GATED_ACTION_PATTERN.test(actionableMessage)) return false;
  if (!DIRECT_CAPABILITY_ACTION_PATTERN.test(actionableMessage)) return false;
  if (/\bexplor(?:e|ing)\b/i.test(actionableMessage)) return false;
  if (isReadOnlyRepositoryDiscoveryRequest(actionableMessage)) {
    return false;
  }
  const availableToolNames = new Set(availableTools.map(tool => tool.name));
  if (BUILT_IN_ARTIFACT_GENERATOR_REQUESTS.some(({ toolName, pattern }) => (
    availableToolNames.has(toolName) && pattern.test(actionableMessage)
  ))) {
    return false;
  }
  return isExplicitGatedToolRequest(message);
}

function isInlineSelfContainedCalculationRequest(message: string): boolean {
  if (!/\b(?:calculate|compute)\b/i.test(message)) return false;
  const suppliedNumbers = message.match(/(?<![\w.])[-+]?\d[\d,.]*(?:\.\d+)?%?/g) ?? [];
  if (suppliedNumbers.length < 2) return false;
  return !hasExplicitGatedToolIntent(message.replace(/\b(?:calculate|compute)\b/gi, ' '));
}

function isInlineTextOnlyDraftRequest(message: string): boolean {
  if (!/\b(?:draft|prepare|write)\b/i.test(message) || isExplicitPlanAuthoringRequest(message)) {
    return false;
  }
  const affirmativeRequest = message.replace(
    /\b(?:do not|don't|never|without)\b[^.?!]*(?:[.?!]|$)/gi,
    ' ',
  );
  return !/\b(?:file|docx|pdf|document|artifact|export|download|code|bug|repo(?:sitory)?|terminal|shell|bash|command|test suite|database|sql|etl|pipeline|previous|prior|saved|memory|notes?|schedule|calendar|send|post|delegate|agent|browser|website|url|calculate|calculator|compute)\b/i.test(affirmativeRequest);
}

function isExplicitPlanAuthoringRequest(message: string): boolean {
  return /\/plan\b/i.test(message)
    || /\b(?:create|make|build|draft|prepare|write|generate|develop|set up)\b[^.?!\r\n]{0,100}\bplan\b/i.test(message)
    || /\bplan(?:ning)?\s+(?:this|that|the|a|an|my|our|your)\b/i.test(message);
}

function hasExplicitPersistedMemoryRecallSignal(message: string): boolean {
  if (resolveExplicitPersistedMemoryReadDirective(message) === 'allow') return true;
  const actionableMessage = actionableMemoryDirectiveText(message);
  const directRecall = /\b(?:what do you know about me|what have you saved|what memor(?:y|ies) have you saved(?: about me)?|what do you remember about (?:me|us|my|our))\b/i.test(actionableMessage)
    || /\bwhat do you remember\s*[?.!,;:]?\s*$/i.test(actionableMessage)
    || /\b(?:recall|remember|do you remember)\s+(?:(?:what|when|where|who|which|whether|how)\s+(?:I|we|you)\b|(?:me|us|my|our|your|saved|previous|prior)\b)/i.test(actionableMessage)
    || /\bwhat\b[^.?!\r\n]{0,120}\b(?:did\s+)?(?:I|we)\b[^.?!\r\n]{0,80}\b(?:ask(?:ed)?|tell|told)\s+you\s+to\s+remember\b[^.?!\r\n]{0,80}\b(?:another|other|previous|prior|earlier)\s+(?:session|chat|conversation|thread)\b/i.test(actionableMessage);
  const explicitMemoryLookup = /\b(?:search|find|look\s+(?:up|in)|show|list|open|inspect|retrieve)\s+(?:me\s+)?(?:(?:in|inside|within)\s+)?(?:(?:my|our|your|the|saved|previous|prior)\s+)?memor(?:y|ies)\b(?=\s*(?:$|[?.!,;:]|\b(?:for|about|from|containing|regarding)\b))/i;
  const ownedContextLookup = /\b(?:search|find|look up|recall|retrieve)\s+(?:(?:my|our)\s+saved\s+|(?:saved|previous|prior)\s+)(?:[\w'-]+\s+){0,3}(?:notes?|preferences?|decisions?|history|context)\b(?=\s*(?:$|[?.!,;:]|\b(?:for|about|from|on|containing|regarding)\b))/i;
  return directRecall
    || explicitMemoryLookup.test(actionableMessage)
    || ownedContextLookup.test(actionableMessage);
}

export function isExplicitMemoryRecallRequest(message: string): boolean {
  if (!allowsPersistedMemoryRead(classifyExplicitTurnMutationPolicy(message))) return false;
  const ownedPriorContext = /\b(?:our|my)\s+(?:(?:(?:previous|prior|earlier|agreed)\s+)?(?:decisions?|agreements?|plans?|choices?|conclusions?|discussion)|(?:previous|prior|earlier|agreed)\s+context)\b/i.test(message)
    || /\b(?:the\s+)?agreed\s+(?:plan|decision|approach|scope|next steps?)\b/i.test(message)
    || /\bwhat\s+(?:we|I)\s+(?:decided|agreed|discussed|chose|selected)\b/i.test(message);
  return hasExplicitPersistedMemoryRecallSignal(message) || ownedPriorContext;
}

const CURRENT_CONVERSATION_ONLY_REFERENCE_PATTERN = /\b(?:(?:(?:my|the|your|our)\s+)?(?:previous|last|preceding|above)\s+(?:message|turn|reply)|(?:message|turn|reply)\s+above|what\s+(?:did\s+)?(?:I|we|you)\s+(?:just\s+)?(?:say|said|write|wrote|mention|mentioned|share|shared)|(?:this|our|the)\s+(?:chat|conversation|discussion|thread)\s+so\s+far|earlier\s+in\s+(?:this|our|the)\s+(?:chat|conversation|discussion|thread)|(?:(?:our|the|this)\s+)?earlier\s+discussion\s+in\s+(?:this|our|the)\s+(?:chat|conversation|thread))\b/i;
const DESCRIPTIVE_CONVERSATION_REFERENCE_PATTERN = /^\s*(?:explain|define|translate|quote|discuss|compare)\b[^.?!\r\n]{0,100}\b(?:phrase|wording|sentence|expression|term|policy|rule)\b/i;
const PERSISTED_CONVERSATION_REFERENCE_PATTERN = /\b(?:(?:previous|prior|earlier|last|past|another|other)\s+(?:chats?|sessions?|conversations?|threads?|workspaces?)|(?:saved|stored|persistent|personal|workspace)\s+(?:memor(?:y|ies)|notes?|preferences?|decisions?|context|history))\b/i;
const OWNED_PERSISTED_CONTEXT_REFERENCE_PATTERN = /\b(?:(?:our|my)\s+(?:(?:(?:previous|prior|earlier|agreed)\s+)?(?:decisions?|agreements?|plans?|choices?|conclusions?|context)|(?:previous|prior|agreed)\s+discussions?)|(?:the\s+)?agreed\s+(?:plan|decision|approach|scope|next steps?))\b/i;
const BROAD_CURRENT_CONVERSATION_REFERENCE_PATTERN = /\b(?:any|all|every|multiple|several)\s+(?:previous|prior|earlier|preceding|above)\s+(?:messages?|turns?|replies?)\b/i;
const QUOTED_CONVERSATION_REFERENCE_PATTERN = /"[^"\r\n]*"|“[^”\r\n]*”|«[^»\r\n]*»/g;

/**
 * Identify an unambiguous request for evidence already present in this
 * session. Persisted memory cannot improve these turns and can contaminate a
 * bounded scalar answer with similarly named facts from another session.
 */
export function isCurrentConversationOnlyReferenceRequest(message: string): boolean {
  const policy = classifyExplicitTurnMutationPolicy(message);
  if (!allowsConversationHistory(policy)) return false;
  const normalizedReferenceText = message.replace(/_/g, ' ');
  if (DESCRIPTIVE_CONVERSATION_REFERENCE_PATTERN.test(message)) return false;
  if (PERSISTED_CONVERSATION_REFERENCE_PATTERN.test(normalizedReferenceText)) return false;
  if (OWNED_PERSISTED_CONTEXT_REFERENCE_PATTERN.test(normalizedReferenceText)) return false;
  if (BROAD_CURRENT_CONVERSATION_REFERENCE_PATTERN.test(normalizedReferenceText)) return false;
  if (hasExplicitPersistedMemoryRecallSignal(message)) return false;
  return CURRENT_CONVERSATION_ONLY_REFERENCE_PATTERN.test(
    message.replace(QUOTED_CONVERSATION_REFERENCE_PATTERN, ' '),
  );
}

export function shouldUsePersistedMemoryForTurn(message: string): boolean {
  return isExplicitMemoryRecallRequest(message)
    && !isCurrentConversationOnlyReferenceRequest(message);
}

const NATURAL_BOUNDED_EXACT_CODENAME_LOOKUP = /^(?:please\s+)?use\s+(?:(?:waggle|my\s+saved|our\s+saved|workspace)\s+)?memory\s+if\s+available\s*:\s*what\s+exact\s+project\s+codename\s+did\s+(?:I|we)\s+(?:ask|tell)\s+you\s+to\s+remember\s+in\s+(?:another|previous|prior|earlier)\s+(?:session|chat|conversation|thread)\s*\?\s*(?:please\s+)?(?:reply|respond|return|answer)\s+(?:with\s+)?(?:only|just)\s+(?:the\s+)?codename(?:\s*;\s*if\s+there\s+is\s+no\s+reliable\s+memory\s*,?\s*(?:please\s+)?(?:reply|respond|return|answer)\s+UNKNOWN)?[.!]?\s*$/i;

export function isBoundedExactPersistedMemoryLookup(message: string): boolean {
  const request = message.trim();
  const actionable = request.replace(QUOTED_TOOL_DIRECTIVE_PATTERN, ' ').trim();
  const quotedOnlyRecall = actionable !== request
    && !hasExplicitPersistedMemoryRecallSignal(actionable);
  const directLookup = /^(?:please\s+)?(?:search|look\s+(?:in|through))\s+(?:my\s+)?(?:saved\s+|persisted\s+)?memory\b/i.test(actionable)
    || NATURAL_BOUNDED_EXACT_CODENAME_LOOKUP.test(actionable);
  if (!shouldUsePersistedMemoryForTurn(request)
    || request.length > 280
    || /[\r\n`]/.test(request)
    || quotedOnlyRecall
    || !directLookup
    || !parseBoundedExactMemoryRequest(request)
    || hasMetaToolDirectivePrefix(actionable)
    || isMetaDecisionContentRequest(request)
    || hasCancelledPriorRequest(actionable)
    || /\b(?:password|passcode|one[- ]time\s+(?:password|code)|otp|token|api[_ -]?key|credential|private\s+key|secret)\b/i.test(request)) return false;

  const asksForExactScalar = /\b(?:what|which)\s+(?:(?:is|was|are|were)\s+)?(?:the\s+)?exact\s+(?:project\s+)?(?:codename|name|label|identifier|project[_ -]?code|date|number|value|choice|option)\b/i.test(request)
    || /\b(?:repeat|return|give\s+me|tell\s+me)\s+(?:the\s+)?exact\s+(?:codename|name|label|identifier|project[_ -]?code|date|number|value|choice|option)\b/i.test(request);
  const requestsOnlyScalar = /\b(?:reply|respond|return|answer)\s+(?:with\s+)?(?:only|just)\s+(?:the\s+|that\s+)?(?:codename|name|label|identifier|project[_ -]?code|date|number|value|choice|option)\b/i.test(request);
  return asksForExactScalar && requestsOnlyScalar;
}

export function isExplicitMemorySaveRequest(message: string): boolean {
  return /\b(remember this|remember that|remember:|save (this|that|it) (to|in) memory|store (this|that|it)|keep this in mind|make a note)\b/i.test(message);
}

export function isExplicitExternalResearchRequest(message: string): boolean {
  return /https?:\/\//i.test(message)
    || /\b(web|internet|online|current|latest|news|recent|source|sources|citation|cite|docs?|documentation|pricing|benchmark|research|look up|find out|dig into|study|survey|external)\b/i.test(message);
}

export function shouldNarrowToolsForConversationalTurn(
  message: string,
  autonomyLevel: AutonomyLevel,
): boolean {
  if (classifyExplicitTurnMutationPolicy(message).denyAllMutations) return true;
  return autonomyLevel === 'normal' && !isExplicitGatedToolRequest(message);
}

export function resolveExplicitReadOnlyToolChoice(
  message: string,
  tools: readonly { name: string }[],
): string | undefined {
  if (tools.some(tool => tool.name === 'read_skill') && isExplicitReadSkillDirective(message)) {
    return 'read_skill';
  }
  const readOnly = new Set(READONLY_TOOLS);
  const candidates = Array.from(new Set(tools.map(tool => tool.name)))
    // read_file requires a path. It is handled by the bounded parser below so
    // a forced call can never leave the model to invent which file to read.
    .filter(name => readOnly.has(name) && name !== 'read_file');
  const mentioned = candidates.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?=$|[^a-z0-9_])`, 'i').test(message);
  });
  if (mentioned.length !== 1) return undefined;

  const escaped = mentioned[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const directive = new RegExp(
    `^\\s*(?:(?:you\\s+)?must\\s+|please\\s+)?(?:call|use|invoke|run)\\s+(?:the\\s+)?(?:tool\\s+)?${escaped}`
      + `(?:\\s+exactly\\s+once|\\s+once)?`
      + `(?:\\s*,?\\s*then\\s+(?:answer|respond)(?:\\s+(?:the\\s+)?(?:question|request))?)?`
      + `[.!]?\\s*$`,
    'i',
  );
  return directive.test(message) ? mentioned[0] : undefined;
}

const BOUNDED_EXACT_MEMORY_TOPIC_STOPWORDS = new Set([
  'about', 'choose', 'chose', 'decision', 'exact', 'memory',
  'saved', 'search', 'what', 'which', 'with', 'only', 'reply', 'respond', 'return',
  'codename', 'name', 'label', 'identifier', 'project', 'code', 'date', 'number',
  'value', 'choice', 'option',
]);

export interface BoundedExactMemoryRequest {
  fieldPattern: string;
  query: string;
  topicTerms: string[];
  strictCodenameToken?: boolean;
  fallback?: 'UNKNOWN';
}

export function parseBoundedExactMemoryRequest(message: string): BoundedExactMemoryRequest | null {
  const naturalCodenameLookup = NATURAL_BOUNDED_EXACT_CODENAME_LOOKUP.test(message.trim());
  const field = naturalCodenameLookup
    ? 'codename'
    : message.match(/\bexact\s+(codename|name|label|identifier|project[_ -]?code|date|number|value|choice|option)\b/i)?.[1];
  if (!field) return null;
  const explicitTopic = message.match(
    /\b(?:search|look\s+(?:in|through))\s+(?:my\s+)?(?:saved\s+|persisted\s+)?memory\s+(?:for|about)\s+([^.!?]{3,160})/i,
  )?.[1]?.replace(/^(?:our|the|my)\s+/i, '').trim();
  const topic = naturalCodenameLookup ? 'project codename' : explicitTopic;
  if (!topic) return null;
  const topicTerms = naturalCodenameLookup
    ? ['project', 'codename']
    : Array.from(new Set(
      (topic.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [])
        .filter(term => !BOUNDED_EXACT_MEMORY_TOPIC_STOPWORDS.has(term)),
    ));
  if (topicTerms.length === 0) return null;
  return {
    fieldPattern: field.toLowerCase() === 'project code'
      || field.toLowerCase() === 'project_code'
      ? String.raw`project[_ -]?code`
      : field.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    query: topic,
    topicTerms,
    ...(naturalCodenameLookup ? { strictCodenameToken: true } : {}),
    ...(naturalCodenameLookup && /\b(?:reply|respond|return|answer)\s+UNKNOWN\b/i.test(message)
      ? { fallback: 'UNKNOWN' as const }
      : {}),
  };
}

export function filterGatedToolsForConversationalTurn<T extends { name: string }>(
  tools: T[],
  message: string,
  autonomyLevel: AutonomyLevel,
  mutationPolicy: TurnMutationPolicy = classifyExplicitTurnMutationPolicy(message),
  externalToolNames: ReadonlySet<string> = new Set<string>(),
): T[] {
  let eligibleTools = filterToolsByTurnMutationPolicy(
    tools,
    mutationPolicy,
    externalToolNames,
  );
  if (autonomyLevel === 'normal' && !isExplicitPlanAuthoringRequest(message)) {
    eligibleTools = eligibleTools.filter(tool => !PLAN_AUTHORING_TOOL_NAMES.has(tool.name));
  }
  if (mutationPolicy.denyAllMutations) {
    return eligibleTools.filter(tool => EXPLICIT_READ_ONLY_TOOL_NAMES.has(tool.name));
  }
  if (autonomyLevel === 'normal' && isReadOnlyRepositoryDiscoveryRequest(message)) {
    return eligibleTools.filter(tool => REPOSITORY_DISCOVERY_TOOL_NAMES.has(tool.name));
  }
  if (!shouldNarrowToolsForConversationalTurn(message, autonomyLevel)) return eligibleTools;
  const allowMemorySearch = shouldUsePersistedMemoryForTurn(message);
  const allowMemorySave = isExplicitMemorySaveRequest(message);
  const allowExternalResearch = isExplicitExternalResearchRequest(message);
  eligibleTools = eligibleTools.filter((tool) => {
    if (CONVERSATIONAL_GATED_TOOL_NAMES.has(tool.name)) return false;
    if (tool.name === 'search_memory' && !allowMemorySearch) return false;
    if (tool.name === 'save_memory' && !allowMemorySave) return false;
    if ((tool.name === 'web_search' || tool.name === 'web_fetch') && !allowExternalResearch) return false;
    return tool.name === 'search_memory'
      || tool.name === 'save_memory'
      || tool.name === 'web_search'
      || tool.name === 'web_fetch';
  });
  return eligibleTools;
}

type PluginToolProvider = NonNullable<AgentLoopConfig['pluginTools']>;

export function filterPluginToolsForConversationalTurn(
  provider: PluginToolProvider,
  message: string,
  autonomyLevel: AutonomyLevel,
  onWithheld?: (count: number) => void,
  mutationPolicy: TurnMutationPolicy = classifyExplicitTurnMutationPolicy(message),
): PluginToolProvider {
  const readOnlyRepositoryDiscovery = autonomyLevel === 'normal'
    && isReadOnlyRepositoryDiscoveryRequest(message);
  if (!mutationPolicy.denyAllMutations
    && !mutationPolicy.denyMemoryRead
    && !mutationPolicy.denyMemoryPersistence
    && !mutationPolicy.denyFileWrites
    && !mutationPolicy.denyCodeExecution
    && !mutationPolicy.denyAgentLaunch
    && mutationPolicy.contextScope === 'default'
    && !shouldNarrowToolsForConversationalTurn(message, autonomyLevel)
    && !readOnlyRepositoryDiscovery) return provider;

  return {
    getAllTools: () => {
      const pluginTools = provider.getAllTools();
      // Plugin capabilities are external and may mutate remote state. On a
      // conversational turn there is no safe static allowlist for arbitrary
      // plugin names, so defer all of them until the user requests an action.
      const pluginNames = new Set(pluginTools.map(tool => tool.name));
      const policyFiltered = filterToolsByTurnMutationPolicy(
        pluginTools,
        mutationPolicy,
        pluginNames,
      );
      const filtered = shouldNarrowToolsForConversationalTurn(message, autonomyLevel)
        || readOnlyRepositoryDiscovery
        ? []
        : policyFiltered;
      if (filtered.length !== pluginTools.length) {
        onWithheld?.(pluginTools.length - filtered.length);
      }
      return filtered;
    },
  };
}

export function conversationalToolPolicyPrompt(
  message: string,
  autonomyLevel: AutonomyLevel,
  selectedToolCount: number,
): string {
  if (!shouldNarrowToolsForConversationalTurn(message, autonomyLevel)) return '';
  if (selectedToolCount === 0) {
    return `\n\n# Current Turn Tool Policy\nNo executable tools are available in this turn. Answer the user directly in plain text. Never emit tool-call syntax, tool names as control tokens, or a request to run an absent tool. Do not mention this policy or claim that a tool was used.`;
  }
  return `\n\n# Current Turn Tool Policy\nThis is a normal conversational turn. Some action, inspection, plugin, planning, and external research tools may be intentionally hidden until the user asks for a concrete action or lookup. Do not mention this policy. Do not infer or tell the user that a capability is missing because a tool is absent on this turn. If the user asks what Waggle can do, answer at the product level and offer one concrete next step.`;
}

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

export function hasRegulatedDisclaimer(content: string, personaId: string): boolean {
  const normalized = content.toLowerCase();
  const recommendationLead = '(?:^|[.!?;\\r\\n]\\s*|,\\s*|[-*]\\s+)(?:(?:please|you should|you may want to|(?:i|we) recommend (?:that )?you)\\s+)?';
  const hasAdvisorReferral = (advisor: string): boolean => (
    new RegExp(`${recommendationLead}consult\\s+(?:(?:with\\s+)?(?:your|a|an|the)\\s+)?${advisor}\\b(?!['’]s\\b)`).test(normalized)
    || new RegExp(`${recommendationLead}(?:verify|check|confirm|review|discuss)(?:\\s+(?:this|it|these|those|the (?:figures?|analysis|advice|decision|matter|plan)))?\\s+with\\s+(?:(?:your|a|an|the)\\s+)?${advisor}\\b(?!['’]s\\b)`).test(normalized)
  );

  if (personaId === 'finance-owner') {
    return /\bnot (?:financial(?: or investment)?|investment(?: or financial)?) advice\b/.test(normalized)
      || hasAdvisorReferral('(?:licensed\\s+)?(?:accountant|financial advisor)');
  }
  if (personaId === 'hr-manager' || personaId === 'legal-professional') {
    return normalized.includes('not legal advice')
      || /\b(?:does not|will not|not intended to) create (?:an? )?attorney-client relationship\b/.test(normalized)
      || hasAdvisorReferral('(?:(?:licensed\\s+)?attorney|legal team)');
  }
  return false;
}

/**
 * The professional disclaimer a reply earns, per regulated persona. These are
 * the user-visible half of the rule, so they are data the policy owns rather
 * than strings the route happens to hold.
 */
const REGULATED_DISCLAIMER_MAP: Record<string, string> = {
  'hr-manager': '\n\n---\n*This is general HR guidance, not legal advice. Consult your legal team for binding decisions.*',
  'legal-professional': '\n\n---\n*This is AI-assisted legal analysis, not legal advice. This does not create an attorney-client relationship. Consult a licensed attorney for binding legal guidance.*',
  'finance-owner': '\n\n---\n*Financial figures are estimates based on available data. Verify with your accountant or financial advisor before making decisions.*',
};

/**
 * What to append to a reply for its persona, or `''` when nothing is owed.
 * Three conditions, in the order the route applied them: the persona must be
 * one of the regulated three, the reply must be substantive in that domain, and
 * it must not already carry a disclaimer of its own.
 */
export function regulatedDisclaimerSuffix(
  content: string,
  personaId: string | null | undefined,
): string {
  if (!personaId) return '';
  const disclaimer = REGULATED_DISCLAIMER_MAP[personaId];
  if (!disclaimer) return '';
  if (!isRegulatedContent(content, personaId)) return '';
  if (hasRegulatedDisclaimer(content, personaId)) return '';
  return disclaimer;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 300_000;

export interface ApprovalTimeoutPolicy {
  timeoutMs: number;
  action: 'deny' | 'hold';
}

export function resolveApprovalTimeoutPolicy(env: NodeJS.ProcessEnv = process.env): ApprovalTimeoutPolicy {
  const configuredTimeout = Number(env.WAGGLE_APPROVAL_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.floor(configuredTimeout)
    : DEFAULT_APPROVAL_TIMEOUT_MS;
  const action = env.WAGGLE_APPROVAL_TIMEOUT_ACTION?.trim().toLowerCase() === 'hold' ? 'hold' : 'deny';
  return { timeoutMs, action };
}
