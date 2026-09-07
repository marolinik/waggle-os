import type { TaskShapeType } from './task-shape.js';

export interface ToolContextBudget {
  /** Hard cap applied before any single tool result enters model history. */
  maxSingleResultChars: number;
  /** Most recent results retained at the single-result cap. */
  recentResultCount: number;
  /** Per-result excerpt cap for older successful results. */
  historicalResultChars: number;
}

export interface AgentRunBudgetPolicy {
  /** Total model calls, including one reserved final synthesis call. */
  maxTurns: number;
  /** Evidence/tool rounds allowed before synthesis is forced. */
  maxToolRounds: number;
  /** Cumulative provider-reported input + output token ceiling. */
  maxTokenBudget: number;
  /** Headroom reserved for the final synthesis request and response. */
  synthesisReserveTokens: number;
  toolContextBudget: ToolContextBudget;
}

export interface AgentRunBudgetInput {
  taskShape: TaskShapeType;
  complexity: 'simple' | 'moderate' | 'complex';
  selectedToolNames: readonly string[];
}

interface ToolContextMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

const DOCUMENT_TOOLS = new Set([
  'generate_docx',
  'generate_pdf',
  'generate_pptx',
  'generate_xlsx',
  'write_file',
  'multi_edit',
]);

const RESEARCH_SHAPES = new Set<TaskShapeType>(['research', 'compare']);

/**
 * Evidence-backed per-turn policy. Research reserves enough room for a final
 * synthesis while staying inside the live acceptance envelope; write-heavy and
 * complex execution workflows retain a larger bounded envelope.
 */
export function selectAgentRunBudget(input: AgentRunBudgetInput): AgentRunBudgetPolicy {
  const hasTools = input.selectedToolNames.length > 0;
  if (!hasTools) {
    return {
      maxTurns: 3,
      maxToolRounds: 2,
      maxTokenBudget: 40_000,
      synthesisReserveTokens: 8_000,
      toolContextBudget: {
        maxSingleResultChars: 4_000,
        recentResultCount: 2,
        historicalResultChars: 500,
      },
    };
  }

  if (RESEARCH_SHAPES.has(input.taskShape)) {
    return {
      maxTurns: 5,
      maxToolRounds: 4,
      maxTokenBudget: 56_000,
      synthesisReserveTokens: 13_000,
      toolContextBudget: {
        maxSingleResultChars: 3_000,
        recentResultCount: 1,
        historicalResultChars: 900,
      },
    };
  }

  const isDocumentWorkflow = input.taskShape === 'draft'
    && input.selectedToolNames.some(name => DOCUMENT_TOOLS.has(name));
  const isLongWorkflow = isDocumentWorkflow
    || ((input.taskShape === 'plan-execute' || input.taskShape === 'mixed')
      && input.complexity === 'complex');

  if (isLongWorkflow) {
    return {
      maxTurns: 17,
      maxToolRounds: 16,
      maxTokenBudget: 160_000,
      synthesisReserveTokens: 24_000,
      toolContextBudget: {
        maxSingleResultChars: 12_000,
        recentResultCount: 3,
        historicalResultChars: 1_200,
      },
    };
  }

  if (input.complexity === 'simple') {
    return {
      maxTurns: 5,
      maxToolRounds: 4,
      maxTokenBudget: 48_000,
      synthesisReserveTokens: 10_000,
      toolContextBudget: {
        maxSingleResultChars: 4_000,
        recentResultCount: 2,
        historicalResultChars: 600,
      },
    };
  }

  return {
    maxTurns: 9,
    maxToolRounds: 8,
    maxTokenBudget: 80_000,
    synthesisReserveTokens: 14_000,
    toolContextBudget: {
      maxSingleResultChars: 8_000,
      recentResultCount: 2,
      historicalResultChars: 750,
    },
  };
}

function excerpt(content: string, maxChars: number, label: string): string {
  if (content.length <= maxChars) return content;
  const marker = `\n...[${label}]...\n`;
  if (maxChars <= marker.length + 2) return content.slice(0, maxChars);
  const available = maxChars - marker.length;
  const headChars = Math.ceil(available * 0.65);
  const tailChars = available - headChars;
  return content.slice(0, headChars) + marker + content.slice(-tailChars);
}

function isErrorResult(content: string): boolean {
  return /(?:^|\n)\s*(?:error|failed|failure|fatal)\b|not found|timed? out|permission denied/i.test(content);
}

/** Hard-cap a newly executed tool result before it is appended to model history. */
export function capToolResultForModel(content: string, maxChars: number): string {
  return excerpt(content, maxChars, 'tool result truncated; beginning and end preserved');
}

/**
 * Build the request-only message view. Conversation structure and tool-call IDs
 * are retained; recent results and all errors stay intact (within the hard cap),
 * while older successful results become bounded head/tail source excerpts.
 *
 * `sealedUpTo` is the count of leading messages already sent to the model earlier in
 * this run. They are returned byte-identical, so each request keeps a stable prefix
 * and the server-side KV cache stays valid across tool rounds.
 */
export function compactToolContextForModel<T extends ToolContextMessage>(
  messages: readonly T[],
  budget: ToolContextBudget,
  sealedUpTo = 0,
): T[] {
  const toolIndexes = messages
    .map((message, index) => message.role === 'tool' ? index : -1)
    .filter(index => index >= 0);
  const recentIndexes = new Set(toolIndexes.slice(-budget.recentResultCount));

  return messages.map((message, index) => {
    if (message.role !== 'tool' || typeof message.content !== 'string') return { ...message };
    // A message already sent earlier in this run is SEALED. Re-excerpting it would
    // change bytes the server has already cached and invalidate the KV prefix from
    // that point onward on every tool round.
    if (index < sealedUpTo) return { ...message };
    const capped = capToolResultForModel(message.content, budget.maxSingleResultChars);
    if (recentIndexes.has(index) || isErrorResult(capped)) {
      return { ...message, content: capped };
    }
    return {
      ...message,
      content: excerpt(capped, budget.historicalResultChars, 'historical tool excerpt; beginning and end preserved'),
    };
  });
}
