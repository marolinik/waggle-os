/**
 * Built-in Workflow Harnesses — 3 pre-configured harness definitions.
 *
 * 1. research-verify: Gather → Synthesize → Verify
 * 2. code-review-fix: Understand → Review → Fix → Verify
 * 3. document-draft: Context → Draft → Self-review
 */

import type { WorkflowHarness, PhaseOutput, GateResult } from './workflow-harness.js';

// ── Gate Helpers ────────────────────────────────────────────────

function hasToolCalls(output: PhaseOutput, toolNames: string[], minCount: number): GateResult {
  const matching = output.toolCalls.filter(tc =>
    toolNames.some(name => tc.tool.toLowerCase().includes(name.toLowerCase())),
  );
  return {
    passed: matching.length >= minCount,
    reason: matching.length >= minCount
      ? `Found ${matching.length} matching tool call(s) (required: ${minCount})`
      : `Only ${matching.length} matching tool call(s) found, need at least ${minCount}. Expected tools: ${toolNames.join(', ')}`,
    evidence: matching.map(tc => `${tc.tool}(${JSON.stringify(tc.args).slice(0, 100)})`).join(', '),
  };
}

function hasMinSections(output: PhaseOutput, minSections: number): GateResult {
  // Count distinct sections (## headings, numbered lists, or bullet groups separated by blank lines)
  const headings = (output.content.match(/^#{1,3}\s/gm) ?? []).length;
  const bulletGroups = output.content.split(/\n\n+/).filter(block =>
    block.trim().startsWith('-') || block.trim().startsWith('*') || /^\d+\./.test(block.trim()),
  ).length;
  const sections = Math.max(headings, bulletGroups);

  return {
    passed: sections >= minSections,
    reason: sections >= minSections
      ? `Found ${sections} distinct sections (required: ${minSections})`
      : `Only ${sections} distinct sections found, need at least ${minSections}`,
    evidence: `${headings} headings, ${bulletGroups} bullet groups`,
  };
}

function hasPattern(output: PhaseOutput, pattern: RegExp, description: string): GateResult {
  const match = pattern.test(output.content);
  return {
    passed: match,
    reason: match
      ? `Output contains ${description}`
      : `Output missing ${description}`,
  };
}

function hasMinLength(output: PhaseOutput, minChars: number): GateResult {
  const len = output.content.length;
  return {
    passed: len >= minChars,
    reason: len >= minChars
      ? `Output is ${len} chars (required: ${minChars})`
      : `Output is only ${len} chars, need at least ${minChars}`,
  };
}

function hasSpecificImprovement(output: PhaseOutput): GateResult {
  // Check if the review identifies at least one specific improvement
  const improvementPatterns = [
    /should|could|consider|improve|missing|add|change|fix|update|revise|clarify|expand/i,
    /issue|problem|gap|inconsisten|contradict|unclear|vague|incomplete/i,
    /recommend|suggest|better|instead|alternatively/i,
  ];

  const lines = output.content.split('\n').filter(l => l.trim().length > 10);
  const improvementLines = lines.filter(line =>
    improvementPatterns.some(p => p.test(line)),
  );

  // Reject generic "looks good" responses
  const isGenericApproval = /^(looks good|no issues|all good|perfect|great|lgtm)/i.test(output.content.trim());

  const passed = improvementLines.length >= 1 && !isGenericApproval;
  return {
    passed,
    reason: passed
      ? `Found ${improvementLines.length} specific improvement(s)`
      : isGenericApproval
        ? 'Review is generic approval — must identify at least 1 specific improvement'
        : 'No specific improvements identified',
    evidence: improvementLines.slice(0, 3).join(' | '),
  };
}

// ── Harness Definitions ─────────────────────────────────────────

/** Research → Synthesize → Verify */
export const researchVerifyHarness: WorkflowHarness = {
  id: 'research-verify',
  name: 'Research & Verify',
  triggerPatterns: [
    /\b(?:research|investigate|find out|look into|analyze)\b.*\b(?:and|then)\b.*\b(?:verify|check|validate|confirm)\b/i,
    /\b(?:deep dive|thorough|comprehensive)\b.*\b(?:research|analysis|investigation)\b/i,
  ],
  phases: [
    {
      id: 'gather',
      name: 'Gather',
      instruction: 'Search memory and available sources to collect relevant information. Use search_memory, recall_memory, or web_search to gather at least 2 distinct sources of information. Focus on breadth first — collect raw data before organizing.',
      gates: [{
        name: 'At least 2 search/recall tool calls',
        validate: async (output) => hasToolCalls(output, ['search_memory', 'recall_memory', 'web_search', 'search_entities'], 2),
      }],
      maxRetries: 1,
    },
    {
      id: 'synthesize',
      name: 'Synthesize',
      instruction: 'Organize findings into a structured summary. Create clear sections covering different aspects of the research. Include citations or references to sources where possible.',
      gates: [{
        name: 'At least 3 distinct sections in output',
        validate: async (output) => hasMinSections(output, 3),
      }],
      maxRetries: 1,
    },
    {
      id: 'verify',
      name: 'Verify',
      instruction: 'Review the synthesized findings for accuracy. Check claims against sources. Identify any contradictions, unsupported claims, or gaps. Output MUST include a "VERDICT:" line with your assessment (PASS, CONDITIONAL, or FAIL) followed by reasoning.',
      gates: [{
        name: 'Output contains VERDICT: assessment',
        validate: async (output) => hasPattern(output, /VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i, 'VERDICT: assessment'),
      }],
      maxRetries: 1,
    },
  ],
  aggregation: 'concatenate',
};

/** Understand → Review → Fix → Verify */
export const codeReviewFixHarness: WorkflowHarness = {
  id: 'code-review-fix',
  name: 'Code Review & Fix',
  triggerPatterns: [
    /\b(?:review|audit|check)\b.*\b(?:code|implementation|changes)\b.*\b(?:fix|resolve|address)\b/i,
    /\b(?:find|identify)\b.*\b(?:bugs?|issues?|problems?)\b.*\b(?:fix|resolve)\b/i,
  ],
  phases: [
    {
      id: 'understand',
      name: 'Understand',
      instruction: 'Read the code to understand the change and its context. Use read_file to examine the relevant files. Understand what the code does before evaluating it.',
      gates: [{
        name: 'At least 1 read_file tool call',
        validate: async (output) => hasToolCalls(output, ['read_file', 'Read'], 1),
      }],
      maxRetries: 1,
    },
    {
      id: 'review',
      name: 'Review',
      instruction: 'Identify issues with severity ratings. Categorize each issue as Critical, Warning, or Info. Be specific about what is wrong and why.',
      gates: [{
        name: 'Output contains structured issue list',
        validate: async (output) => hasPattern(output, /(?:Critical|Warning|Info|HIGH|MEDIUM|LOW)\b/i, 'severity-rated issues'),
      }],
      maxRetries: 1,
    },
    {
      id: 'fix',
      name: 'Fix',
      instruction: 'Apply fixes for the identified issues. Use write_file or edit_file to make changes. Address Critical issues first, then Warnings.',
      gates: [{
        name: 'At least 1 write/edit tool call',
        validate: async (output) => hasToolCalls(output, ['write_file', 'edit_file', 'Write', 'Edit'], 1),
      }],
      maxRetries: 2,
    },
    {
      id: 'verify',
      name: 'Verify',
      instruction: 'Run tests or type checking to verify the fixes. Use bash to run test commands (npm test, tsc --noEmit, etc.) and confirm the fixes work.',
      gates: [{
        name: 'At least 1 test/typecheck command',
        validate: async (output) => hasToolCalls(output, ['bash', 'Bash', 'run_command'], 1),
      }],
      maxRetries: 1,
    },
  ],
  aggregation: 'last',
};

/** Context → Draft → Self-review */
export const documentDraftHarness: WorkflowHarness = {
  id: 'document-draft',
  name: 'Document Draft',
  triggerPatterns: [
    /\b(?:write|draft|create|compose)\b.*\b(?:document|doc|report|spec|proposal|brief|memo)\b/i,
    /\b(?:document|write up|put together)\b.*\b(?:findings|analysis|results|plan)\b/i,
  ],
  phases: [
    {
      id: 'context',
      name: 'Context',
      instruction: 'Gather requirements and prior context from memory. Use search_memory to find relevant background information, previous decisions, and any existing work on this topic.',
      gates: [{
        name: 'At least 1 memory search',
        validate: async (output) => hasToolCalls(output, ['search_memory', 'recall_memory', 'search_entities'], 1),
      }],
      maxRetries: 1,
    },
    {
      id: 'draft',
      name: 'Draft',
      instruction: 'Produce the document based on gathered context. Write comprehensive content that addresses all requirements. The draft should be substantial (500+ characters) or written to a file.',
      gates: [{
        name: 'Substantial output or file written',
        validate: async (output) => {
          const hasFile = output.toolCalls.some(tc =>
            ['write_file', 'Write', 'generate_docx', 'generate_pptx'].some(t =>
              tc.tool.toLowerCase().includes(t.toLowerCase()),
            ),
          );
          if (hasFile) return { passed: true, reason: 'Document written to file' };
          return hasMinLength(output, 500);
        },
      }],
      maxRetries: 1,
    },
    {
      id: 'self-review',
      name: 'Self-Review',
      instruction: 'Re-read your draft critically. Identify specific gaps, inconsistencies, missing sections, or areas that need improvement. Do NOT just say "looks good" — find at least one concrete improvement.',
      gates: [{
        name: 'Identifies at least 1 specific improvement',
        validate: async (output) => hasSpecificImprovement(output),
      }],
      maxRetries: 2,
    },
  ],
  aggregation: 'concatenate',
};

// ── Registry ────────────────────────────────────────────────────

/** All built-in harnesses. */
export const BUILTIN_HARNESSES: WorkflowHarness[] = [
  researchVerifyHarness,
  codeReviewFixHarness,
  documentDraftHarness,
];

/** Find a harness by ID. */
export function getHarnessById(id: string): WorkflowHarness | undefined {
  return BUILTIN_HARNESSES.find(h => h.id === id);
}

/** Find harnesses whose trigger patterns match the given task. */
export function matchHarness(task: string): WorkflowHarness | undefined {
  return BUILTIN_HARNESSES.find(h =>
    h.triggerPatterns.some(p => p.test(task)),
  );
}
