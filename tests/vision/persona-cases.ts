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
      { id: 'justification', description: 'Explains the prioritization', kind: 'pattern', pattern: /(?:because|rationale|reason|leverage|impact)/i, points: 10 },
      { id: 'first-action', description: 'Names the first action for today', kind: 'pattern', pattern: /(?:first action|today(?:'s)? action|start today|begin today)/i, points: 10 },
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
      { id: 'release-facts', description: 'Preserves Friday, API, Windows, and two-failure facts', kind: 'allPatterns', patterns: [/Friday/i, /API tests? (?:pass|passed)/i, /two (?:browser )?failures?/i, /Windows/i], points: 10 },
      { id: 'router-fact', description: 'Preserves the unexercised smart-router/cloud-credentials fact', kind: 'allPatterns', patterns: [/smart router/i, /not (?:been )?(?:exercised|tested|validated)/i, /cloud credentials/i], points: 10 },
      { id: 'recommendation', description: 'Preserves the delay recommendation and its condition', kind: 'allPatterns', patterns: [/delay/i, /(?:until|once).*gaps?/i], points: 10 },
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
      { id: 'runway', description: 'Calculates four months of runway', kind: 'pattern', pattern: /\b4(?:\.0)?\s+months?\b/i, points: 10 },
      { id: 'formula', description: 'States cash divided by monthly net burn', kind: 'pattern', pattern: /(?:40[,.]?000\s*(?:\/|divided by)\s*10[,.]?000|cash\s*(?:\/|divided by)\s*(?:monthly )?(?:net )?burn)/i, points: 10 },
      { id: 'assumption', description: 'Names the constant-burn/no-revenue assumption', kind: 'allPatterns', patterns: [/assumption/i, /(?:burn.*constant|no (?:new )?revenue|revenue remains zero)/i], points: 10 },
      { id: 'two-actions', description: 'Gives cost and revenue actions', kind: 'allPatterns', patterns: [/(?:reduce|cut|lower)[\s\S]{0,60}(?:costs?|burn)/i, /(?:increase|generate|close|raise)[\s\S]{0,60}(?:revenue|customers?|funding)/i], points: 10 },
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
    prompt: 'Design an idempotent ETL from newline-delimited JSON events into SQLite. Include schema, deduplication key, transaction strategy, retry behavior, and a compact Python example. The example must be syntactically valid and include all imports. Do not write files.',
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
    label: 'Evidence-only production verdict',
    prompt: 'A teammate claims the product is production-ready because the web build passed. Give an adversarial VERDICT using only that evidence. Separate verified facts, unsupported claims, blockers, and the minimum next checks. Do not create or edit files.',
    readOnly: true,
    maxDurationMs: 30_000,
    maxInputTokens: 12_000,
    maxOutputTokens: 2_500,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'verdict', description: 'Issues an insufficient-evidence/not-ready verdict', kind: 'allPatterns', patterns: [/VERDICT/i, /(?:insufficient evidence|not production[- ]ready|cannot conclude)/i], points: 10 },
      { id: 'verified', description: 'Separates verified facts', kind: 'pattern', pattern: /verified facts?/i, points: 10 },
      { id: 'unsupported', description: 'Separates unsupported claims', kind: 'pattern', pattern: /unsupported claims?/i, points: 10 },
      { id: 'blockers', description: 'Lists blockers', kind: 'pattern', pattern: /blockers?/i, points: 10 },
      { id: 'checks', description: 'Lists minimum next checks without upgrading the claim to fact', kind: 'allPatterns', patterns: [/minimum next checks?|next checks?/i, /(?:reported|claimed|not independently verified|only evidence)/i], points: 10 },
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
