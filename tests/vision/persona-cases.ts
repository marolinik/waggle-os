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
  | (BaseResponseRule & { kind: 'dependencyMap' })
  | (BaseResponseRule & { kind: 'timedAgenda'; durationMinutes: number; minimumBlocks: number })
  | (BaseResponseRule & { kind: 'agendaDecisions' })
  | (BaseResponseRule & { kind: 'runwayResult' })
  | (BaseResponseRule & { kind: 'runwayFormula' })
  | (BaseResponseRule & { kind: 'runwayAssumption' })
  | (BaseResponseRule & { kind: 'runwayActions'; patterns: readonly RegExp[] })
  | (BaseResponseRule & { kind: 'writerReleaseFacts'; patterns: readonly RegExp[] })
  | (BaseResponseRule & { kind: 'writerRouterFact' })
  | (BaseResponseRule & { kind: 'writerDelayRecommendation' })
  | (BaseResponseRule & { kind: 'emptyWorkspaceResult' })
  | (BaseResponseRule & { kind: 'boundedWorkspaceClaims' })
  | (BaseResponseRule & {
      kind: 'prioritizationJustification';
      criteria: readonly {
        topic: RegExp;
        basis: RegExp;
        basisFamilies?: readonly RegExp[];
      }[];
    })
  | (BaseResponseRule & { kind: 'allPatterns'; patterns: readonly RegExp[] })
  | (BaseResponseRule & { kind: 'notPattern'; pattern: RegExp })
  | (BaseResponseRule & { kind: 'verifierContract' })
  | (BaseResponseRule & { kind: 'maxWords'; maxWords: number })
  | (BaseResponseRule & {
      kind: 'primaryEvidence';
      minimum: number;
      allowedDomains: readonly string[];
      requiredSourceGroups?: readonly (readonly string[])[];
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

const sqlitePrimaryResearchDomains = [
  'sqlite.org',
  'sqlite.ai',
  'github.com/sqliteai/sqlite-vector',
  'raw.githubusercontent.com/sqliteai/sqlite-vector',
  'github.com/asg017/sqlite-vec',
  'raw.githubusercontent.com/asg017/sqlite-vec',
] as const;

const postgresPrimaryResearchDomains = [
  'postgresql.org',
  'github.com/pgvector/pgvector',
  'raw.githubusercontent.com/pgvector/pgvector',
] as const;

const primaryResearchDomains = [
  ...sqlitePrimaryResearchDomains,
  ...postgresPrimaryResearchDomains,
] as const;

const affirmedFactClause = String.raw`(?<!not true that )(?<!not true that the )(?<!not true that \*\*)(?<!not true that __)(?<!not true that \*)(?<!not true that _)(?<!false that )(?<!false that the )(?<!false that \*\*)(?<!false that __)(?<!false that \*)(?<!false that _)`;
const affirmedBrowserTests = `${affirmedFactClause}${String.raw`\bbrowser[- ]test(?:s|ing)\b`}`;
const positiveFailureVerb = String.raw`(?<!not )(?<!cannot )(?<!can't )(?<!don't )(?<!doesn't )(?<!didn't )(?<!aren't )(?<!isn't )(?<!never )(?<!no longer )\b(?:currently\s+show(?:s|ing)?\s+(?:two|2)\s+remaining\s+failures?|(?:(?:still\s+)?(?:show(?:s|ing)?|have|report(?:s|ing)?|return(?:s|ing)?|produce(?:s|ing)?|retain(?:s|ed|ing)?)|remain(?:s|ing)?)\s+(?:two|2)\s+failures?)\b`;
const windowsBrowserFailuresPattern = new RegExp([
  `${affirmedBrowserTests}${String.raw`\s*:\s*(?:still\s+)?(?:two|2)\s+(?:unresolved\s+|open\s+)?failures?\s+on\s+Windows\b(?![^.\r\n]{0,80}\b(?:(?:were|are|have been)\s+)?(?:fixed|resolved|closed)\b)`}`,
  `${String.raw`(?<!could )(?<!can )(?<!may )(?<!might )`}${affirmedBrowserTests}${String.raw`(?![^.\r\n]*\?)[ \t]+(?:currently[ \t]+|still[ \t]+)?(?:show(?:s|ing)?|is[ \t]+showing|report(?:s|ing)?|has|found)\s+(?:two|2)\s+(?:unresolved|open)\s+failures?\b(?![^.\r\n]{0,80}\b(?:incorrect|wrong|false|resolved|untrue|not[ \t]+true|disputed)\b)[^.\r\n]{0,60}\bWindows\b`}`,
  `${affirmedBrowserTests}${String.raw`[^.\r\n]{0,80}\bWindows\b[^.\r\n]{0,50}`}${positiveFailureVerb}`,
  `${affirmedBrowserTests}${String.raw`[^.\r\n]{0,60}`}${positiveFailureVerb}${String.raw`[^.\r\n]{0,60}\bWindows\b`}`,
  `${affirmedBrowserTests}${String.raw`[^.\r\n]{0,30}\b(?:two|2)\s+failures?\b[^.\r\n]{0,20}\b(?:remain|persist|exist)\b[^.\r\n]{0,60}\bWindows\b`}`,
  `${affirmedBrowserTests}${String.raw`[^.\r\n]{0,30}\b(?:have|exhibit)\s+(?:two|2)\s+failures?\b[^.\r\n]{0,60}\bWindows\b`}`,
  `${affirmedBrowserTests}${String.raw`[^.\r\n]{0,80}\bremain(?:s|ing)?\b[^.\r\n]{0,60}\bfail(?:ure|ing)\b[^.\r\n]{0,80}\b(?:two|2)\s+(?:specific\s+)?(?:issues?|failures?)\b[^.\r\n]{0,60}\bpersist(?:s|ing)?\b[^.\r\n]{0,40}\bWindows\b`}`,
  `${affirmedFactClause}${String.raw`(?<!not )(?<!no longer )\b(?:two|2)\s+browser[- ]test failures?\s+(?:still\s+)?(?:persist|remain|exist)\b[^.\r\n]{0,60}\bWindows\b`}`,
].join('|'), 'i');
const positiveActionLead = String.raw`(?:(?:^|[.!?]\s+|[\r\n])[ \t]*(?:(?:\d+[.)]|[-*])[ \t]*|\|[ \t]*\d+[ \t]*\|[ \t]*)?(?:\[[ xX]\][ \t]*)?(?:\*\*)?(?:(?:(?:cost reduction|cash inflow|revenue growth)(?:\*\*)?[ \t]*:[ \t]*(?:\*\*)?[ \t]*)|(?:(?:we|you|the team)[ \t]+should[ \t]+))?|\b(?:actions?|recommend(?:ation|ed)?)\b(?:(?!\b(?:not|never|cannot|can't|avoid|against)\b)[^.\r\n]){0,80})`;
const positiveActionSuffix = String.raw`(?![^.\r\n]{0,80}(?:\?|\b(?:cannot|can't|do not|don't|must not|should not|never|impossible|merely reported|no longer recommend(?:ed|ing)?|(?:not|(?:is|are|was|were)n['’]t)[ \t]+(?:(?:an?|the|this|that|my|your|our|their|his|her|its)[ \t]+)?recommendations?|decid(?:e[sd]?|ing) against|not (?:advisable|feasible|possible|recommended))\b))`;
const nonActionRunwayArtifact = String.raw`(?:report|memo|briefing|presentation|deck|document|summary|analysis|forecast|plan|dashboard|statement|workshop|meeting|review|session|discussion|assessment|study)`;
const directFundingAction = String.raw`(?:secure|obtain|arrange)\b[ \t]+(?:(?:an?|additional|new|short[- ]term|near[- ]term|emergency|external|temporary|working[- ]capital)\b[ \t]+){0,3}(?:bridge[ \t]+loan|financing|funding|(?:line|facility)[ \t]+of[ \t]+credit)(?![ \t]+${nonActionRunwayArtifact}\b)`;
const costActionPattern = new RegExp(`${positiveActionLead}${String.raw`(?:\b(?:(?:audit\s+and\s+)?(?:reduce|cut|lower|renegotiate))\b[^.\r\n]{0,60}(?:costs?|expenses?|burn)|\b(?:enact|implement|adopt)\b(?![^.\r\n]{0,50}\b(?:no|not|never|without|avoid|against)\b)[^.\r\n]{0,100}\bcost[- ]reduction\s+measures?\b)`}${positiveActionSuffix}`, 'im');
const cashActionPattern = new RegExp(`${positiveActionLead}${String.raw`\b(?:(?:increase|generate|grow|close|raise|start[ \t]+generating)\b[^.\r\n]{0,80}(?:revenue(?![ \t]+(?:loss(?:es)?|forecast|report|projection|model|analysis|plan|statement|dashboard)\b)|customers?(?![ \t]+(?:(?:acquisition\s+)?(?:costs?|expenses?)|complaints?|churn|loss(?:es)?)\b)|funding(?![ \t]+(?:costs?|fees?|burden)\b)|cash(?![ \t]+(?:burn|outflows?|loss(?:es)?|forecast|report|projection|model|analysis|plan|statement|dashboard)\b)(?:[ \t]+inflows?)?)|pre[- ]?sell\b[^.\r\n]{0,80}(?:services?|products?|subscriptions?|contracts?)|${directFundingAction}|secure\b[^.\r\n]{0,60}\bcash inflows?\b|(?:create|add)\b[ \t]+near[- ]term[ \t]+(?:revenue|cash inflows?)|(?:pull forward|improve|speed up)\b[^.\r\n]{0,80}(?:cash inflows?|payments?|collections?|receivables?)|accelerate\b(?:[ \t]+time[- ]to[- ]revenue\b|[^.\r\n]{0,80}(?:cash inflows?|payments?|collections?|receivables?)))`}${positiveActionSuffix}`, 'im');
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
    prompt: 'I have three priorities for the week: close one customer, repair onboarding friction, and investigate a production memory bug. Recommend their order, justify the order in one concise plan, and name the first action for today. Do not use tools or ask clarifying questions; make reasonable assumptions.',
    readOnly: true,
    maxDurationMs: 45_000,
    maxInputTokens: 15_000,
    maxOutputTokens: 2_500,
    requiredToolPatterns: [],
    responseRules: [
      { id: 'all-priorities', description: 'Addresses all three supplied priorities', kind: 'allPatterns', patterns: [/customer/i, /onboarding/i, /memory (?:bug|issue)/i], points: 10 },
      { id: 'ordered-plan', description: 'Provides an explicit order', kind: 'pattern', pattern: /(?:priority order|\b1[.)]|\bfirst\b[\s\S]*\bsecond\b|\|[^\r\n|]+\|\s*(?:\*\*)?1st(?:\*\*)?\s*\|[\s\S]*\|[^\r\n|]+\|\s*(?:\*\*)?2nd(?:\*\*)?\s*\|[\s\S]*\|[^\r\n|]+\|\s*(?:\*\*)?3rd(?:\*\*)?\s*\||(?:^|[\r\n])\s*(?:\*\*)?(?:recommended\s+)?order(?:\*\*)?\s*:\s*[^\r\n]*(?:\u2192|->|=>)[^\r\n]*(?:\u2192|->|=>))/im, points: 10 },
      {
        id: 'justification',
        description: 'Links each priority to a relevant decision basis',
        kind: 'prioritizationJustification',
        criteria: [
          {
            topic: /\b(?:(?:production(?: memory)?|memory) (?:bugs?|issues?)|production defect|memory leak|the bug)\b/i,
            basis: /(?:\b(?:live|active) in production\b[^.!?\r\n]{0,220}\b(?:may|might|could|would)\b(?:(?![.!?\r\n]|\b(?:not|never|no|without|lacks?|cannot|fails?|unlikely)\b).){0,140}\b(?:degrad(?:e[ds]?|ation)|outage)\b(?:(?![.!?\r\n]|\b(?:not|never|no|without|lacks?|cannot|fails?|unlikely)\b).){0,180}\bcompounding (?:downside )?risk if delayed\b|\b(?:risk|churn|data loss|instabil(?:ity|ities)|reliab(?:ility|le)|stabil(?:ity|ize)|stable|outage|trust|blast radius|unbounded downside|compounding|degrad(?:e[ds]?|ation)|crash(?:es|ed|ing)?)\b)/i,
            basisFamilies: [
              /\b(?:data loss|instabil(?:ity|ities)|reliab(?:ility|le)|stabil(?:ity|ize)|stable|trust)\b/i,
              /\b(?:outage|degrad(?:e[ds]?|ation)|crash(?:es|ed|ing)?)\b/i,
              /\b(?:risk|churn|blast radius|unbounded downside|compounding)\b/i,
            ],
          },
          {
            topic: /\b(?:customer|deal|sale)s?\b/i,
            basis: /(?:\b(?:revenue|pipeline|cash|commercial|near[- ]term|short[- ]cycle|closable|proof points?|de-risk|signature|close date|deadline|immediate (?:payoff|value)|high(?:est)?[- ](?:value|leverage)|time[- ](?:sensitive|boxed)|sales timing|decision (?:clock|point)|external momentum|deal urgency|urgency|momentum)\b|\b(?:procurement|legal|sign[- ]?off)\b[^.!?\r\n]{0,140}\b(?:long(?:est)?\s+(?:real\s+)?timeline|long(?:er)?\s+(?:lead|cycle)\s*time)\b)/i,
            basisFamilies: [
              /\b(?:revenue|cash|commercial|near[- ]term|immediate (?:payoff|value)|high(?:est)?[- ](?:value|leverage))\b/i,
              /\b(?:pipeline|short[- ]cycle|closable|proof points?|de-risk|signature|close date|deadline|time[- ](?:sensitive|boxed)|sales timing|decision (?:clock|point)|external momentum|deal urgency|urgency|momentum)\b/i,
              /\b(?:procurement|legal|sign[- ]?off)\b[^.!?\r\n]{0,140}\b(?:long(?:est)?\s+(?:real\s+)?timeline|long(?:er)?\s+(?:lead|cycle)\s*time)\b/i,
            ],
          },
          {
            topic: /\bonboarding\b/i,
            basis: /\b(?:conversion|retention|activation|drop[- ]?off|sales drag|high(?:est)? leverage|less urgent|least urgent|not urgent|structural|systemic fix|process problem|requires? (?:diagnosis|product\/design coordination|coordination and validation)|better inputs|future throughput|support load|reliab(?:ility|le)|friction|crash|retry|user experience|growth|long[- ]term ROI|rarely time[- ]boxed|compounds? over time)\b/i,
            basisFamilies: [
              /\b(?:conversion|activation|drop[- ]?off|sales drag|growth)\b/i,
              /\b(?:retention|support load|friction|retry|user experience)\b/i,
              /\b(?:reliab(?:ility|le)|crash)\b/i,
              /\b(?:high(?:est)? leverage|less urgent|least urgent|not urgent|structural|systemic fix|process problem|requires? (?:diagnosis|product\/design coordination|coordination and validation)|better inputs|future throughput|long[- ]term ROI|rarely time[- ]boxed|compounds? over time)\b/i,
            ],
          },
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
      {
        id: 'primary-sources',
        description: 'Cites and fetches primary evidence for both sides of the comparison',
        kind: 'primaryEvidence',
        minimum: 2,
        allowedDomains: primaryResearchDomains,
        requiredSourceGroups: [sqlitePrimaryResearchDomains, postgresPrimaryResearchDomains],
        points: 10,
      },
      { id: 'decision-table', description: 'Includes a comparison or decision table', kind: 'pattern', pattern: /(?:decision table|\|\s*(?:criterion|dimension|factor|consideration)\s*\|)/i, points: 10 },
      { id: 'recommendation', description: 'Makes a recommendation for the stated desktop use case', kind: 'pattern', pattern: /recommend(?:ation|ed)?/i, points: 10 },
      {
        id: 'fact-inference',
        description: 'Separates sourced facts from inference',
        kind: 'allPatterns',
        patterns: [
          /(?:(?:^|\n)#{1,6}\s*(?:key\s+|established\s+)?facts?\b(?=[ \t]*(?::|$)|[ \t]+(?:from|based[ \t]+on|verified|confirmed|sourced)\b)|(?:^|\n)#{1,6}[ \t]*(?:what(?:'s| is)[ \t]+)?(?:verified|confirmed|sourced)\b|\*\*(?:what(?:'s| is)\s+)?(?:verified|confirmed|sourced)\b[^*\r\n]{0,80}\*\*|\*\*(?:key\s+|established\s+)?facts?\b(?=[ \t]*(?::|\*\*)|[ \t]+(?:from|based[ \t]+on|verified|confirmed|sourced|supporting[ \t]+(?:this|the)[ \t]+(?:recommendation|comparison|decision))\b)[^*\r\n]{0,80}\*\*|\(\s*facts?\b(?=[ \t]*(?::|\))|[ \t]+(?:from|based[ \t]+on|verified|confirmed|sourced)\b)[^)]{0,200}\)|\(\s*facts?\s*,\s*\[(?![^\]\r\n]{0,80}\b(?:not(?:\s+(?:yet|independently))?\s+(?:verified|confirmed|sourced)|never\s+sourced|no\s+(?:facts?|source|evidence)|unverified|unavailable|missing|unknown|unsourced|unconfirmed|none|opinion)\b)[^\]\r\n]+\]\(https?:\/\/[^)\s]+\)\s*\)|(?:^|[|(\r\n.])[ \t]*(?:[-*+][ \t]+)?facts?(?:[ \t]*\/\s*inference\s*)?(?:[ \t]*[:)]|[ \t]+(?:[\u2013\u2014-]|(?:for|from)\b))(?![^\r\n|]{0,80}\b(?:not(?:\s+(?:yet|independently))?\s+(?:verified|confirmed|sourced)|never\s+sourced|no\s+(?:facts?|source|evidence)|unverified|unavailable|missing|unknown|unsourced|unconfirmed|none)\b)|(?:^|[|\r\n.])[ \t]*(?:[-*+][ \t]+)?(?:\*\*)?facts?[ \t]*\((?![^\r\n)]{0,80}\b(?:inferences?|not|never|no|unverified|unavailable|missing|unknown|unsourced|unconfirmed)\b)[^\r\n)]{1,80}\))/im,
          /(?:(?:^|\n)#{1,6}\s*(?:key\s+)?inferences?\b|\*\*[^*\r\n]{0,80}\binferences?(?:\s*\/\s*fact)?\b[^*\r\n]{0,80}\*\*|\(\s*inferences?(?:\s*\/\s*fact)?\b[^)]{0,200}\)|\binferences?\s*(?:\/\s*fact\s*)?[:)]|(?:^|[|\r\n.])[ \t]*(?:[-*+][ \t]+)?(?:\*\*)?inferences?[ \t]*\((?![^\r\n)]{0,80}\bfacts?\b)[^\r\n)]{1,80}\))/im,
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
      { id: 'release-facts', description: 'Preserves Friday, passing API tests, and two Windows browser-test failures', kind: 'writerReleaseFacts', patterns: [/Friday/i, /API tests?\b\s*(?:(?:\*\*|__)\s*)?:?\s*(?:(?:\*\*|__)\s*)?(?:(?:are\s+)?(?:all\s+)?(?:currently\s+)?pass(?:ed|ing)?|have\s+(?:currently\s+)?passed)\b/i, windowsBrowserFailuresPattern], points: 10 },
      { id: 'router-fact', description: 'Preserves the unexercised smart-router/cloud-credentials fact', kind: 'writerRouterFact', points: 10 },
      { id: 'recommendation', description: 'Preserves a positive delay recommendation and its condition', kind: 'writerDelayRecommendation', points: 10 },
      { id: 'no-new-claims', description: 'Avoids known invented risk and schedule claims', kind: 'notPattern', pattern: /(?:production-equivalent|unacceptable (?:post-release )?incident risk|short hold|not a scope change|revised ship date|\bunverified\s+risk\b|\brisk\s+to\s+(?:release\s+)?stability\b|\bensure(?:s|d|ing)?\s+(?:platform\s+)?stability\b|\bacross\s+all\s+environments\b)/i, points: 10 },
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
      { id: 'dependencies', description: 'Maps dependencies', kind: 'dependencyMap', points: 10 },
      { id: 'owners', description: 'Assigns owners by role', kind: 'allPatterns', patterns: [/owners?/i, /(?:\brole\b|(?:^|\n)\s*(?:[-*]\s+)?(?:\*{0,2}|_{0,2})(?:M\d+\s+)?Owner(?:\*{0,2}|_{0,2})\s*:)/im], points: 10 },
      { id: 'risks-exit', description: 'Includes risks and exit criteria', kind: 'allPatterns', patterns: [/risks?/i, /exit criteria/i], points: 10 },
      {
        id: 'no-invented-requirements',
        description: 'Does not invent calendar, platform-count, startup-time, or soak requirements',
        kind: 'notPattern',
        pattern: /(?:week\s*\d+|\d+[ -]?week effort|target date:|(?:at least\s+)?(?:three|3)\s+(?:recent\s+)?Windows versions?|(?:start|startup|launch)\w*[^.\r\n]{0,30}(?:within|under|<)\s*\d+\s*(?:seconds?|secs?|s)\b|\b\d+[ -]?hour\s+(?:stability\s+)?soak)/i,
        points: 10,
      },
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
      { id: 'duration-blocks', description: 'Uses time blocks for a 30-minute meeting', kind: 'timedAgenda', durationMinutes: 30, minimumBlocks: 2, points: 10 },
      { id: 'decisions', description: 'Names desired decisions', kind: 'agendaDecisions', points: 10 },
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
      { id: 'runway', description: 'Positively calculates four months of runway', kind: 'runwayResult', points: 10 },
      { id: 'formula', description: 'States cash divided by monthly net burn', kind: 'runwayFormula', points: 10 },
      { id: 'assumption', description: 'Names the constant-burn/no-revenue assumption', kind: 'runwayAssumption', points: 10 },
      { id: 'two-actions', description: 'Gives positive cost and revenue or cash-inflow actions', kind: 'runwayActions', patterns: [costActionPattern, cashActionPattern], points: 10 },
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
      { id: 'empty-result', description: 'Accurately reports the fresh virtual workspace as empty', kind: 'emptyWorkspaceResult', points: 10 },
      { id: 'next-step', description: 'Recommends one next engineering step', kind: 'pattern', pattern: /(?:next (?:engineering )?step|recommended next step)/i, points: 10 },
      { id: 'bounded-claim', description: 'Does not claim parent or external repository contents', kind: 'boundedWorkspaceClaims', points: 10 },
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
      {
        id: 'two-lanes',
        description: 'Defines researcher and coder lanes',
        kind: 'allPatterns',
        patterns: [
          /(?:\bresearcher\s+lane\b|^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?lane\s+(?:\d+|[A-Z])\s*[-\u2013\u2014:]\s*researcher(?:[ \t]+\([^\r\n)]+\))?[ \t]*(?:\*\*)?[ \t]*:?[ \t]*$|^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?lane\s+(?:\d+|[A-Z])\s*[-\u2013\u2014:]\s*(?![^\r\n]{0,80}\bnot\s+(?:a\s+)?researcher\b)[^\r\n()]{1,80}\(researcher\)[ \t]*(?:\*\*)?[ \t]*$|^[ \t]*#{1,6}[ \t]+(?:\*\*)?lane\s+(?:\d+|[A-Z])\s*[-\u2013\u2014:]\s*researcher(?:[ \t]+\([^\r\n)]+\))?[ \t]*(?:\*\*)?[ \t]*[-\u2013\u2014:][ \t]+(?!not\b)\S[^\r\n]*$)/im,
          /(?:\bcoder\s+lane\b|^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?lane\s+(?:\d+|[A-Z])\s*[-\u2013\u2014:]\s*coder(?:[ \t]+\([^\r\n)]+\))?[ \t]*(?:\*\*)?[ \t]*:?[ \t]*$|^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?lane\s+(?:\d+|[A-Z])\s*[-\u2013\u2014:]\s*(?![^\r\n]{0,80}\bnot\s+(?:a\s+)?coder\b)[^\r\n()]{1,80}\(coder\)[ \t]*(?:\*\*)?[ \t]*$|^[ \t]*#{1,6}[ \t]+(?:\*\*)?lane\s+(?:\d+|[A-Z])\s*[-\u2013\u2014:]\s*coder(?:[ \t]+\([^\r\n)]+\))?[ \t]*(?:\*\*)?[ \t]*[-\u2013\u2014:][ \t]+(?!not\b)\S[^\r\n]*$)/im,
        ],
        points: 10,
      },
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
