import {
  CANONICAL_VERIFIER_REPORT,
  VERIFIER_BLOCKER_CHECK_PAIRS,
  VERIFIER_NEXT_CHECK_KEYS,
  VERIFIER_REPORT_CLOSE,
  VERIFIER_REPORT_OPEN,
  VERIFIER_TOP_LEVEL_KEYS,
} from './verifier-contract';

export const ACCEPTANCE_PERSONA_IDS = [
  'general-purpose',
  'researcher',
  'writer',
  'project-manager',
  'executive-assistant',
  'finance-owner',
  'coder',
  'data-engineer',
  'verifier',
  'coordinator',
] as const;

export type AcceptancePersonaId = typeof ACCEPTANCE_PERSONA_IDS[number];

interface BaseResponseRule {
  id: string;
  description: string;
  points: number;
}

export type PersonaResponseRule =
  | (BaseResponseRule & { kind: 'pattern'; pattern: RegExp })
  | (BaseResponseRule & { kind: 'allPatterns'; patterns: readonly RegExp[] })
  | (BaseResponseRule & { kind: 'notPattern'; pattern: RegExp })
  | (BaseResponseRule & { kind: 'verifierContract' })
  | (BaseResponseRule & { kind: 'maxWords'; maxWords: number })
  | (BaseResponseRule & {
      kind: 'primaryUrls';
      minimum: number;
      allowedDomains: readonly string[];
    })
  | (BaseResponseRule & { kind: 'codeValidation'; language: 'python' });

export interface PersonaAcceptanceCase {
  id: AcceptancePersonaId;
  label: string;
  prompt: string;
  /** Every acceptance prompt is intentionally advisory/read-only. */
  readOnly: true;
  maxDurationMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** At least one successful tool must match every listed pattern. */
  requiredToolPatterns: readonly RegExp[];
  responseRules: readonly PersonaResponseRule[];
}

const primaryResearchDomains = [
  'sqlite.org',
  'sqlite.ai',
  'postgresql.org',
  'github.com/sqliteai/sqlite-vector',
  'github.com/asg017/sqlite-vec',
  'github.com/pgvector/pgvector',
] as const;

const runwayAssertionPrefix = String.raw`(?<!incorrect )(?<!wrong )\b(?:formula|runway(?:\s*\(months\))?)\b(?:(?!\b(?:do\s+not|don't|not|never|avoid|cannot|can't|incorrect|wrong)\b)[\s\S]){0,180}`;
const runwayAssertionSuffix = String.raw`(?![^.\r\n]{0,60}\b(?:incorrect|wrong)\b)`;
const runwayFormulaPattern = new RegExp([
  `${runwayAssertionPrefix}${String.raw`40[,.]?000\s*(?:/|divided by)\s*10[,.]?000`}${runwayAssertionSuffix}`,
  `${runwayAssertionPrefix}${String.raw`cash(?:\s+balance)?\s*(?:/|divided by)\s*(?:(?:net\s+)?monthly\s+burn|monthly\s+net\s+burn|net\s+burn|burn)`}${runwayAssertionSuffix}`,
  `${runwayAssertionPrefix}${String.raw`\\frac\s*\{\s*\\text\s*\{\s*cash(?:\s+balance)?\s*\}\s*\}\s*\{\s*\\text\s*\{\s*(?:(?:net\s+)?monthly\s+burn|monthly\s+net\s+burn)\s*\}\s*\}`}${runwayAssertionSuffix}`,
  `${runwayAssertionPrefix}${String.raw`\\frac\s*\{\s*\\?\$?\s*40(?:\{,\}|\\,|,)?000(?:\{\.\}0{1,2}|\.0{1,2})?\s*\}\s*\{\s*\\?\$?\s*10(?:\{,\}|\\,|,)?000(?:\{\.\}0{1,2}|\.0{1,2})?\s*\}`}${runwayAssertionSuffix}`,
].join('|'), 'i');

const positiveFailureVerb = String.raw`(?<!not )(?<!cannot )(?<!can't )(?<!never )(?<!no longer )\b(?:(?:still\s+)?(?:show(?:s|ing)?|have|report(?:s|ing)?|return(?:s|ing)?|produce(?:s|ing)?)|remain(?:s|ing)?)\s+(?:two|2)\s+failures?\b`;
const windowsBrowserFailuresPattern = new RegExp([
  `${String.raw`\bbrowser tests?\b[^.\r\n]{0,80}\bWindows\b[^.\r\n]{0,50}`}${positiveFailureVerb}`,
  `${String.raw`\bbrowser tests?\b[^.\r\n]{0,60}`}${positiveFailureVerb}${String.raw`[^.\r\n]{0,60}\bWindows\b`}`,
  String.raw`\bbrowser tests?\b[^.\r\n]{0,30}\b(?:two|2)\s+failures?\b[^.\r\n]{0,20}\b(?:remain|persist|exist)\b[^.\r\n]{0,60}\bWindows\b`,
  String.raw`(?<!not )(?<!no longer )\b(?:two|2)\s+browser test failures?\s+(?:still\s+)?(?:persist|remain|exist)\b[^.\r\n]{0,60}\bWindows\b`,
].join('|'), 'i');
const positiveRecommendationLead = String.raw`(?:(?<!cannot )(?<!can't )(?<!not )\b(?:recommend(?:ation|ed)?)\b(?:(?!\b(?:not|never|cannot|can't|avoid|against)\b)[\s\S]){0,80}|(?:^|[\r\n])[ \t]*(?:[-*#>]+[ \t]*)?(?:\*\*)?|(?:^|[.!?]\s+|[\r\n])[ \t]*(?:[-*#>]+[ \t]*)?(?:we|you|the team)[ \t]+should[ \t]+)`;
const delayRecommendationPattern = new RegExp(`${positiveRecommendationLead}${String.raw`\bdelay(?:ing)?\s+(?:the\s+)?release\b[\s\S]{0,240}\b(?:until|once)\b[\s\S]{0,180}(?:gaps?|failures?|smart router|cloud credentials)`}`, 'im');
const positiveRunwayCalculationPrefix = String.raw`(?:^|[.!?\r\n])(?:(?!\b(?:do\s+not|don't|not|never|avoid|cannot|can't|distrust|reject|false|incorrect|wrong)\b)[^.\r\n]){0,120}\bcalculation\b(?:(?!\b(?:do\s+not|don't|not|never|avoid|cannot|can't|distrust|reject|false|incorrect|wrong)\b)[^.\r\n]){0,160}`;
const positiveRunwayCalculation = String.raw`\$?\s*40[,.]?000(?:\.0{1,2})?\s*(?:\/|\u00f7|divided by)\s*\$?\s*10[,.]?000(?:\.0{1,2})?\s*=\s*(?:\*\*)?4(?:\.0+)?\s+months?(?:\*\*)?`;
const positiveRunwayCalculationSuffix = String.raw`(?![^.\r\n]{0,80}\b(?:incorrect|wrong|false|(?:is\s+)?not(?:\s+actually)?\s+(?:(?:the\s+)?runway|correct|accurate|valid)|cannot\s+be\s+trusted)\b)`;
const positiveRunwayPattern = new RegExp([
  String.raw`\brunway\b(?:(?!\b(?:not|never|cannot|can't|incorrect|wrong|isn't|isn’t|no\s+longer)\b)[^.\r\n]){0,50}\b4(?:\.0+)?\s+months?\b`,
  String.raw`(?<!not )(?<!isn't )(?<!isn’t )\b4(?:\.0+)?\s+months?\s+(?:of\s+)?runway\b`,
  `${positiveRunwayCalculationPrefix}${positiveRunwayCalculation}${positiveRunwayCalculationSuffix}`,
].join('|'), 'i');
const positiveActionLead = String.raw`(?:(?:^|[.!?]\s+|[\r\n])[ \t]*(?:\d+[.)]|[-*])?[ \t]*(?:\*\*)?(?:(?:we|you|the team)[ \t]+should[ \t]+)?|\b(?:actions?|recommend(?:ation|ed)?)\b(?:(?!\b(?:not|never|cannot|can't|avoid|against)\b)[^.\r\n]){0,80})`;
const positiveActionSuffix = String.raw`(?![^.\r\n]{0,80}\b(?:cannot|can't|do not|don't|must not|should not|never|avoid|impossible|not (?:advisable|feasible|possible|recommended))\b)`;
const costActionPattern = new RegExp(`${positiveActionLead}${String.raw`\b(?:reduce|cut|lower)\b[^.\r\n]{0,60}(?:costs?|burn)`}${positiveActionSuffix}`, 'im');
const cashActionPattern = new RegExp(`${positiveActionLead}${String.raw`\b(?:(?:increase|generate|grow|close|raise)\b[^.\r\n]{0,80}(?:revenue|customers?|funding|cash inflows?)|(?:create|add)\b[ \t]+near[- ]term[ \t]+(?:revenue|cash inflows?)|(?:pull forward|accelerate|improve|speed up)\b[^.\r\n]{0,80}(?:cash inflows?|payments?|collections?|receivables?))`}${positiveActionSuffix}`, 'im');

const verifierPairInstructions = VERIFIER_BLOCKER_CHECK_PAIRS
  .map(([blocker, [operation, target, passCondition]]) => (
    `${blocker} => ${JSON.stringify({ operation, target, passCondition })}`
  ))
  .join('; ');

const verifierAcceptancePrompt = [
  'A teammate claims the product is production-ready because the web build passed.',
  `Return exactly one ${VERIFIER_REPORT_OPEN}...${VERIFIER_REPORT_CLOSE} JSON envelope and no text before or after it.`,
  `Use schemaVersion ${CANONICAL_VERIFIER_REPORT.schemaVersion}, scenarioId ${JSON.stringify(CANONICAL_VERIFIER_REPORT.scenarioId)}, evidenceScope ${JSON.stringify(CANONICAL_VERIFIER_REPORT.evidenceScope)}, facts exactly ${JSON.stringify(CANONICAL_VERIFIER_REPORT.facts)}, unsupportedClaims exactly ${JSON.stringify(CANONICAL_VERIFIER_REPORT.unsupportedClaims)}, verdict ${JSON.stringify(CANONICAL_VERIFIER_REPORT.verdict)}, and releaseDecision ${JSON.stringify(CANONICAL_VERIFIER_REPORT.releaseDecision)}.`,
  `Use exactly these top-level keys and no others: ${VERIFIER_TOP_LEVEL_KEYS.join(', ')}. Each nextChecks object has exactly these keys and no others: ${VERIFIER_NEXT_CHECK_KEYS.join(', ')}. Spell all keys literally; do not escape or duplicate keys.`,
  `Include one or more unique blocker/check pairs and no unmatched blockers or checks: ${verifierPairInstructions}.`,
  'Put selected blocker ids in blockerCodes and their paired check objects in nextChecks. Do not create or edit files.',
].join(' ');

export const PERSONA_CASES: readonly PersonaAcceptanceCase[] = [
  {
    id: 'general-purpose',
    label: 'Prioritization under ambiguity',
    prompt: 'I have three priorities this week: close one customer, repair onboarding friction, and investigate a production memory bug. Choose the order, justify it in one concise plan, and identify the first action for today. Do not ask clarifying questions; make reasonable assumptions.',
    readOnly: true,
    maxDurationMs: 45_000,
    maxInputTokens: 15_000,
    maxOutputTokens: 2_500,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'all-priorities', description: 'Addresses all three supplied priorities', kind: 'allPatterns', patterns: [/customer/i, /onboarding/i, /memory (?:bug|issue)/i], points: 10 },
      { id: 'ordered-plan', description: 'Provides an explicit order', kind: 'pattern', pattern: /(?:priority order|\b1[.)]|\bfirst\b[\s\S]*\bsecond\b)/i, points: 10 },
      {
        id: 'justification',
        description: 'Links each priority to a relevant decision basis',
        kind: 'allPatterns',
        patterns: [
          /(?:memory (?:bug|issue)[\s\S]{0,220}(?:risk|reliab(?:ility|le)|stabil(?:ity|ize)|outage|trust|blast radius)|(?:risk|reliab(?:ility|le)|stabil(?:ity|ize)|outage|trust|blast radius)[\s\S]{0,220}memory (?:bug|issue))/i,
          /(?:(?:customer|deal)[\s\S]{0,220}(?:revenue|pipeline|cash|commercial|near[- ]term|closable|proof points?|de-risk|signature|close date|high(?:est)?[- ]value|time[- ]sensitive|external momentum|deal urgency|urgency|momentum)|(?:revenue|pipeline|cash|commercial|near[- ]term|closable|proof points?|de-risk|signature|close date|high(?:est)?[- ]value|time[- ]sensitive|external momentum|deal urgency|urgency|momentum)[\s\S]{0,220}(?:customer|deal))/i,
          /(?:onboarding[\s\S]{0,220}(?:conversion|retention|activation|drop[- ]?off|sales drag|high leverage|less urgent|not urgent|structural|future throughput|support load|reliab(?:ility|le)|friction|crash|retry|user experience)|(?:conversion|retention|activation|drop[- ]?off|sales drag|high leverage|less urgent|not urgent|structural|future throughput|support load|reliab(?:ility|le)|friction|crash|retry|user experience)[\s\S]{0,220}onboarding)/i,
        ],
        points: 10,
      },
      { id: 'first-action', description: 'Names the first action for today', kind: 'pattern', pattern: /(?:first action|today(?:'s)? action|start today|begin today|\btoday\s*:)/i, points: 10 },
      { id: 'no-followup', description: 'Does not end by reopening clarification', kind: 'notPattern', pattern: /\?\s*$/, points: 10 },
    ],
  },
  {
    id: 'researcher',
    label: 'Primary-source technical comparison',
    prompt: 'Use current primary sources to compare SQLite vector search with PostgreSQL plus pgvector for a single-user desktop AI memory store. Give a decision table and a recommendation. Cite source URLs, distinguish facts from inference, and do not claim a benchmark you did not find.',
    readOnly: true,
    maxDurationMs: 120_000,
    maxInputTokens: 60_000,
    maxOutputTokens: 6_000,
    requiredToolPatterns: [/(?:search|fetch|browse)/i],
    responseRules: [
      { id: 'primary-sources', description: 'Cites at least two distinct primary-source URLs', kind: 'primaryUrls', minimum: 2, allowedDomains: primaryResearchDomains, points: 10 },
      { id: 'decision-table', description: 'Includes a comparison or decision table', kind: 'pattern', pattern: /(?:decision table|\|\s*(?:criterion|dimension|factor|consideration)\s*\|)/i, points: 10 },
      { id: 'recommendation', description: 'Makes a recommendation for the stated desktop use case', kind: 'pattern', pattern: /recommend(?:ation|ed)?/i, points: 10 },
      {
        id: 'fact-inference',
        description: 'Separates sourced facts from inference',
        kind: 'allPatterns',
        patterns: [
          /(?:(?:^|\n)#{1,6}\s*(?:key\s+)?facts?\b|\*\*[^*\r\n]{0,80}\bfacts?(?:\s*\/\s*inference)?\b[^*\r\n]{0,80}\*\*|\(\s*facts?(?:\s*\/\s*inference)?\b[^)]{0,200}\)|\bfacts?\s*(?:\/\s*inference\s*)?[:)])/im,
          /(?:(?:^|\n)#{1,6}\s*(?:key\s+)?inferences?\b|\*\*[^*\r\n]{0,80}\binferences?(?:\s*\/\s*fact)?\b[^*\r\n]{0,80}\*\*|\(\s*inferences?(?:\s*\/\s*fact)?\b[^)]{0,200}\)|\binferences?\s*(?:\/\s*fact\s*)?[:)])/im,
        ],
        points: 10,
      },
      { id: 'source-quality', description: 'Avoids known secondary AI-synthesized sources', kind: 'notPattern', pattern: /(?:grokipedia|deepwiki)/i, points: 10 },
    ],
  },
  {
    id: 'writer',
    label: 'Fact-preserving executive rewrite',
    prompt: 'Rewrite this into a crisp executive memo of at most 120 words. Preserve the facts and add no new claims: We planned to ship Friday. API tests pass. Browser tests still have two failures on Windows. The smart router has not been exercised without cloud credentials. Recommendation: delay release until those gaps are closed.',
    readOnly: true,
    maxDurationMs: 30_000,
    maxInputTokens: 12_000,
    maxOutputTokens: 1_500,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'word-limit', description: 'Stays within 120 words', kind: 'maxWords', maxWords: 120, points: 10 },
      { id: 'release-facts', description: 'Preserves Friday, passing API tests, and two Windows browser-test failures', kind: 'allPatterns', patterns: [/Friday/i, /API tests?\s*(?::\s*)?(?:are\s+)?pass(?:ed|ing)?\b/i, windowsBrowserFailuresPattern], points: 10 },
      { id: 'router-fact', description: 'Preserves the unexercised smart-router/cloud-credentials fact', kind: 'allPatterns', patterns: [/smart router/i, /not (?:(?:yet|been|fully|thoroughly)\s+)*(?:exercised|tested|validated)/i, /cloud credentials/i], points: 10 },
      { id: 'recommendation', description: 'Preserves a positive delay recommendation and its condition', kind: 'pattern', pattern: delayRecommendationPattern, points: 10 },
      { id: 'no-new-claims', description: 'Avoids known invented risk and schedule claims', kind: 'notPattern', pattern: /(?:production-equivalent|unacceptable (?:post-release )?incident risk|short hold|not a scope change|revised ship date)/i, points: 10 },
    ],
  },
  {
    id: 'project-manager',
    label: 'Evidence-bounded release plan',
    prompt: 'Turn this release goal into milestones, dependencies, owners by role, risks, and exit criteria: production-ready solo installation with no Docker dependency, local models and proxy included, a functioning smart router, and verified Windows behavior. Do not create or edit anything.',
    readOnly: true,
    maxDurationMs: 45_000,
    maxInputTokens: 18_000,
    maxOutputTokens: 3_500,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'milestones', description: 'Defines milestones', kind: 'pattern', pattern: /milestones?/i, points: 10 },
      { id: 'dependencies', description: 'Maps dependencies', kind: 'pattern', pattern: /dependenc(?:y|ies)/i, points: 10 },
      { id: 'owners', description: 'Assigns owners by role', kind: 'allPatterns', patterns: [/owners?/i, /role/i], points: 10 },
      { id: 'risks-exit', description: 'Includes risks and exit criteria', kind: 'allPatterns', patterns: [/risks?/i, /exit criteria/i], points: 10 },
      { id: 'no-invented-schedule', description: 'Does not invent a calendar schedule', kind: 'notPattern', pattern: /(?:week\s*\d+|\d+[ -]?week effort|target date:)/i, points: 10 },
    ],
  },
  {
    id: 'executive-assistant',
    label: 'Launch-readiness agenda',
    prompt: 'Draft a 30-minute launch-readiness meeting agenda with time blocks, desired decisions, and a short pre-read checklist. Participants are product, engineering, QA, and support. Do not create a calendar event and do not ask follow-up questions.',
    readOnly: true,
    maxDurationMs: 30_000,
    maxInputTokens: 12_000,
    maxOutputTokens: 2_000,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'duration-blocks', description: 'Uses time blocks for a 30-minute meeting', kind: 'allPatterns', patterns: [/30[- ]minute/i, /(?:\d{1,2}:\d{2}|\d+\s*(?:min|minutes))/i], points: 10 },
      { id: 'decisions', description: 'Names desired decisions', kind: 'pattern', pattern: /desired decisions?|decision(?:s| owner)/i, points: 10 },
      { id: 'preread', description: 'Provides a pre-read checklist', kind: 'allPatterns', patterns: [/pre-read/i, /(?:checklist|\[[ x]\])/i], points: 10 },
      { id: 'participants', description: 'Covers all four participant groups', kind: 'allPatterns', patterns: [/product/i, /engineering/i, /\bQA\b/i, /support/i], points: 10 },
      { id: 'no-followup', description: 'Does not ask a follow-up or offer an action', kind: 'notPattern', pattern: /\?\s*$/, points: 10 },
    ],
  },
  {
    id: 'finance-owner',
    label: 'Runway calculation and action',
    prompt: 'Cash is 40000 dollars, monthly burn is 10000 dollars, and revenue is zero. Calculate runway in months, state the formula, name the biggest assumption, and give two actions that improve runway. Do not create files or schedules.',
    readOnly: true,
    maxDurationMs: 30_000,
    maxInputTokens: 12_000,
    maxOutputTokens: 2_000,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'runway', description: 'Positively calculates four months of runway', kind: 'pattern', pattern: positiveRunwayPattern, points: 10 },
      { id: 'formula', description: 'States cash divided by monthly net burn', kind: 'pattern', pattern: runwayFormulaPattern, points: 10 },
      { id: 'assumption', description: 'Names the constant-burn/no-revenue assumption', kind: 'allPatterns', patterns: [/assumption/i, /(?:burn.*constant|no (?:new )?revenue|revenue remains zero)/i], points: 10 },
      { id: 'two-actions', description: 'Gives positive cost and revenue or cash-inflow actions', kind: 'allPatterns', patterns: [costActionPattern, cashActionPattern], points: 10 },
      { id: 'no-false-impact', description: 'Avoids false dollar-to-month claims and schedule CTAs', kind: 'notPattern', pattern: /(?:each dollar saved.*(?:one|1).*month|\/schedule|calendar event)/i, points: 10 },
    ],
  },
  {
    id: 'coder',
    label: 'Workspace-bounded inspection',
    prompt: 'Inspect only this current virtual workspace and report exactly what files exist before recommending one next engineering step. Do not create or edit files. Do not inspect parent directories or any repository outside this workspace. Do not claim inspection unless a tool succeeds.',
    readOnly: true,
    maxDurationMs: 45_000,
    maxInputTokens: 20_000,
    maxOutputTokens: 2_500,
    requiredToolPatterns: [/(?:search_files|list_workspace_files|read_file)/i],
    responseRules: [
      { id: 'workspace-scope', description: 'Reports on the current workspace', kind: 'pattern', pattern: /workspace/i, points: 10 },
      { id: 'empty-result', description: 'Accurately reports the fresh virtual workspace as empty', kind: 'pattern', pattern: /(?:\b(?:current|fresh|virtual) workspace (?:is|was) empty\b|\bno files? (?:exist|(?:were )?found|(?:are )?present)\b)/i, points: 10 },
      { id: 'next-step', description: 'Recommends one next engineering step', kind: 'pattern', pattern: /(?:next (?:engineering )?step|recommended next step)/i, points: 10 },
      { id: 'bounded-claim', description: 'Does not claim parent or external repository contents', kind: 'notPattern', pattern: /(?:parent director(?:y|ies)|outside (?:this|the) workspace|repository contains|package\.json)/i, points: 10 },
      { id: 'concise', description: 'Keeps an empty-workspace report concise', kind: 'maxWords', maxWords: 300, points: 10 },
    ],
  },
  {
    id: 'data-engineer',
    label: 'Idempotent ETL design',
    prompt: 'Design an idempotent ETL from newline-delimited JSON events into SQLite. Include schema, deduplication key, transaction strategy, retry behavior, and a compact Python example. The example must be syntactically valid and include all imports. Do not write files or execute code; provide the example as text only.',
    readOnly: true,
    maxDurationMs: 60_000,
    maxInputTokens: 25_000,
    maxOutputTokens: 4_500,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'schema', description: 'Includes a concrete SQLite schema', kind: 'pattern', pattern: /CREATE\s+TABLE/i, points: 10 },
      { id: 'deduplication', description: 'Defines a deduplication key or constraint', kind: 'pattern', pattern: /(?:dedup(?:lication)? key|PRIMARY KEY|UNIQUE\s*\()/i, points: 10 },
      { id: 'transaction', description: 'Defines transaction boundaries', kind: 'pattern', pattern: /(?:BEGIN\b|transaction)/i, points: 10 },
      { id: 'retry', description: 'Defines retry/backoff behavior', kind: 'pattern', pattern: /(?:retry|backoff|busy_timeout)/i, points: 10 },
      { id: 'python-valid', description: 'Provides syntactically valid Python with imports', kind: 'codeValidation', language: 'python', points: 10 },
    ],
  },
  {
    id: 'verifier',
    label: 'Typed evidence-only production verdict',
    prompt: verifierAcceptancePrompt,
    readOnly: true,
    maxDurationMs: 30_000,
    maxInputTokens: 12_000,
    maxOutputTokens: 2_500,
    requiredToolPatterns: [],
    responseRules: [
      {
        id: 'verifier-contract',
        description: 'Emits one strict, internally consistent, evidence-bounded VerifierReportV1 contract',
        kind: 'verifierContract',
        points: 50,
      },
    ],
  },
  {
    id: 'coordinator',
    label: 'Two-lane review decomposition',
    prompt: 'Decompose a production-readiness review into one researcher lane and one coder lane. Specify each lane objective, inputs, deliverables, dependencies, merge criteria, and what the coordinator must verify before accepting either result. Do not create or edit files and do not launch agents.',
    readOnly: true,
    maxDurationMs: 45_000,
    maxInputTokens: 18_000,
    maxOutputTokens: 3_000,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'two-lanes', description: 'Defines researcher and coder lanes', kind: 'allPatterns', patterns: [/researcher lane/i, /coder lane/i], points: 10 },
      { id: 'lane-contracts', description: 'Provides objectives, inputs, and deliverables', kind: 'allPatterns', patterns: [/objectives?/i, /inputs?/i, /deliverables?/i], points: 10 },
      { id: 'dependencies', description: 'Defines dependencies', kind: 'pattern', pattern: /dependenc(?:y|ies)/i, points: 10 },
      { id: 'merge', description: 'Defines merge criteria', kind: 'pattern', pattern: /merge criteria/i, points: 10 },
      { id: 'acceptance', description: 'Defines coordinator verification before acceptance', kind: 'allPatterns', patterns: [/coordinator/i, /verif(?:y|ication)|accept/i], points: 5 },
      { id: 'no-generic-inventions', description: 'Avoids unrelated compliance and deployment inventions', kind: 'notPattern', pattern: /(?:SOC\s*2|HIPAA|Helm chart)/i, points: 5 },
    ],
  },
] as const;

export function parsePersonaRepeats(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.min(parsed, 10);
}

export interface PersonaRunMode {
  gating: boolean;
  repeats: number;
}

/** Acceptance is always 10 x 3. Smaller runs require an explicit debug label. */
export function resolvePersonaRunMode(
  nonGatingDebugRaw: string | undefined,
  repeatsRaw: string | undefined,
): PersonaRunMode {
  const nonGatingDebug = nonGatingDebugRaw === '1';
  if (repeatsRaw !== undefined && !nonGatingDebug) {
    throw new Error(
      'WAGGLE_PERSONA_REPEATS is allowed only in non-gating debug mode with WAGGLE_PERSONA_NON_GATING_DEBUG=1; acceptance is locked to 3 repeats.',
    );
  }
  return {
    gating: !nonGatingDebug,
    repeats: nonGatingDebug ? parsePersonaRepeats(repeatsRaw) : 3,
  };
}
