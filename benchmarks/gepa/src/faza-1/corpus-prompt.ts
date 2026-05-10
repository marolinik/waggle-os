/**
 * GEPA Faza 1 — Opus 4.7 oracle prompt for synthesizing one H3 corpus instance.
 *
 * Per Amendment 1 Ask A Option C sub-ask 4 (instance generation methodology):
 *   "Opus 4.7 generates task scaffold (persona + scenario + 6-7 source document specs);
 *    PM does NOT review each instance pre-NULL-baseline. Instead: CC-2 spot-audits
 *    5 random instances pre NULL-baseline kick (3% sample)."
 *
 * The oracle is instructed to produce a JSON object that maps directly onto
 * the CorpusInstance shape (minus computed fields like materialsConcat, charCount).
 */

import { type StratificationCell, type CorpusInstance, TASK_FAMILY_DESCRIPTORS } from './corpus.js';

/** Persona descriptor — short label + role context for prompt template. */
const PERSONA_DESCRIPTORS: Record<string, { label: string; roleContext: string }> = {
  p1_founder_ceo: {
    label: 'Founder/CEO',
    roleContext: 'company founder + chief executive; focused on growth, fundraising, vision',
  },
  p2_cfo: {
    label: 'CFO',
    roleContext: 'chief financial officer; focused on burn, runway, capital efficiency',
  },
  p3_coo: {
    label: 'COO',
    roleContext: 'chief operating officer; focused on operational efficiency, hiring, process',
  },
  p4_vp_finance: {
    label: 'VP Finance',
    roleContext: 'reports to CFO; focused on FP&A, financial reporting, budget management',
  },
  p5_independent_director: {
    label: 'Independent Director',
    roleContext: 'board-level oversight; focused on governance, strategic risk, executive accountability',
  },
};

/** Company-stage descriptor — narrative framing for Opus to ground each instance. */
const COMPANY_STAGE_DESCRIPTORS: Record<string, { label: string; financial: string; pressure: string }> = {
  stage_a_series_b_growth_burning: {
    label: 'Series B growth-stage, burning capital',
    financial: 'recently raised Series B ~$30M; burning $1-1.5M/month; 12-18 months runway; ARR $10-20M',
    pressure: 'investor pressure to demonstrate capital efficiency; competitive displacement risk; talent retention concerns',
  },
  stage_b_post_profitable_consolidation: {
    label: 'Post-profitable, consolidation phase',
    financial: 'reached profitability 2-4 quarters ago; $40-80M ARR; 15-25% operating margin; 24+ months runway',
    pressure: 'Wall Street scrutiny on growth deceleration; M&A integration challenges; complacency risk',
  },
};

export interface BuildCorpusInstancePromptInputs {
  cell: StratificationCell;
  instanceId: string;
  /** Domain anchor — ensures all 50 instances stay in NorthLane CFO synthesis territory. */
  domainAnchor?: string;
}

/** Build the Opus 4.7 generation prompt for one stratification cell. */
export function buildCorpusInstancePrompt(inputs: BuildCorpusInstancePromptInputs): string {
  const { cell, instanceId } = inputs;
  const familyDesc = TASK_FAMILY_DESCRIPTORS[cell.family];
  const personaDesc = PERSONA_DESCRIPTORS[cell.persona];
  const stageDesc = COMPANY_STAGE_DESCRIPTORS[cell.stage];

  return `You are generating one synthesis-task instance for a benchmark corpus.

The corpus targets B2B SaaS knowledge work in the spirit of "NorthLane CFO" pilot tasks: a complex business situation requiring multi-document synthesis to produce a structured business deliverable (memo, action plan, decision recommendation).

## Stratification cell for this instance
- Instance ID: \`${instanceId}\`
- Task family: \`${cell.family}\` — ${familyDesc.label}
- Task family description: ${familyDesc.label.replace(/_/g, ' ')}; mirror pattern: ${familyDesc.mirrorPilotTask ?? 'NEW family (no pilot mirror)'}
- Persona: \`${cell.persona}\` — ${personaDesc.label} (${personaDesc.roleContext})
- Company stage: \`${cell.stage}\` — ${stageDesc.label}
  - Financial state: ${stageDesc.financial}
  - Pressure dynamics: ${stageDesc.pressure}

## Required output (JSON object only, no prose, no code fences)

\`\`\`json
{
  "personaText": "Persona: <2-3 sentence persona description grounding the model in role + company>\\n\\nScenario: <2-4 sentence scenario hook setting up why this synthesis is needed now>",
  "sourceDocuments": [
    { "title": "DOC 1 — <Doc name>", "body": "<markdown content, 600-1200 chars>" },
    { "title": "DOC 2 — <Doc name>", "body": "<...>" },
    ...
    (exactly ${familyDesc.docsPerInstance} docs total)
  ],
  "question": "<open-ended question, 100-400 chars, that requires synthesizing across multiple docs to answer>"
}
\`\`\`

## Generation constraints (binding)

1. **Domain anchor:** All ${familyDesc.docsPerInstance} source documents must be plausible artifacts a ${personaDesc.label} would receive in a B2B SaaS company at the ${stageDesc.label} phase.

2. **Document diversity:** Each doc should be a different artifact type (P&L summary, pipeline review, churn analysis, eng velocity report, marketing dashboard, board notes, competitor intel, customer interview notes, OKR report, runway model, etc.). No two docs should be the same artifact type.

3. **Synthesis requirement:** The question must be answerable ONLY by triangulating across multiple docs. A single-doc answer should be insufficient. Specifically, the question should require:
   - Identifying tradeoffs across docs
   - Synthesizing competing positions
   - Producing a structured deliverable (memo, action plan, or recommendation with justification)

4. **Persona consistency:** The persona's role + company-stage pressures must be evident in BOTH the scenario framing AND the question phrasing. A founder-CEO question reads differently than an independent-director question.

5. **Doc body realism:** Use realistic numbers (revenue figures, percentages, dates). Cite specific people by role title (e.g., "VP Sales", not "John Smith"). Include both hard data + qualitative commentary in each doc.

6. **JSON format:** Output ONLY a single valid JSON object. No prose before or after. No code fence markers. The first character must be \`{\` and the last character must be \`}\`.

## Output begins below
`;
}
