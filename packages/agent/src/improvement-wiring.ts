/**
 * Improvement Wiring — processes each interaction for improvement signals.
 *
 * Bridges the gap between the chat route (which has raw messages) and the
 * existing correction-detector / improvement-detector / capability-acquisition
 * modules. Call processInteractionForImprovement after every agent response
 * to detect corrections, capability gaps, and recurring workflow patterns.
 */

import { detectCorrection, type DetectedCorrection } from './correction-detector.js';
import { detectTaskShape, type TaskShape } from './task-shape.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ImprovementWiringParams {
  userMessage: string;
  agentResponse: string;
  toolsUsed: string[];
  workspaceId: string;
  sessionId: string;
}

export interface ImprovementWiringResult {
  wasCorrection: boolean;
  correctionDetail?: string;
  capabilityGap?: string;
  workflowPattern?: string;
}

// ── Well-known tool names (built-in tools the agent can use) ───────────

const KNOWN_TOOL_NAMES = new Set([
  'web_search', 'web_fetch', 'search_memory', 'save_memory',
  'get_identity', 'get_awareness', 'query_knowledge', 'add_task',
  'correct_knowledge', 'bash', 'read_file', 'write_file', 'edit_file',
  'search_files', 'search_content', 'git_status', 'git_diff', 'git_log',
  'git_commit', 'generate_docx', 'create_plan', 'add_plan_step',
  'execute_step', 'show_plan', 'list_skills', 'create_skill',
  'delete_skill', 'read_skill', 'search_skills', 'suggest_skill',
  'acquire_capability', 'install_capability', 'compose_workflow',
  'orchestrate_workflow', 'spawn_agent', 'list_agents', 'get_agent_result',
]);

// ── Capability gap detection patterns ──────────────────────────────────

/**
 * Patterns in user messages that suggest the user wants a tool/capability
 * the agent doesn't have. These are request-like phrases paired with
 * tool/domain keywords.
 */
const GAP_REQUEST_PATTERNS: Array<{ pattern: RegExp; domain: string }> = [
  { pattern: /\bcan you (?:send|post|publish|push) (?:to|on|via) (\w+)/i, domain: 'integration' },
  { pattern: /\bconnect (?:to|with) (\w+)/i, domain: 'connector' },
  { pattern: /\buse (\w+) (?:api|tool|service)/i, domain: 'integration' },
  { pattern: /\b(?:read|open|parse|convert) (?:this |the |a )?(\w+) file/i, domain: 'file_format' },
  { pattern: /\brun (?:this |the |a )?(\w+) (?:test|check|scan|lint)/i, domain: 'tooling' },
];

/**
 * Detect if the agent response itself indicates a tool was missing.
 * The agent often says things like "I don't have a tool for X" or
 * "Tool 'X' not found".
 */
const TOOL_NOT_FOUND_PATTERNS: RegExp[] = [
  /Tool "(.+?)" not found/,
  /I don't have (?:a |the )?(?:tool|capability|ability) (?:for|to) (.+?)(?:\.|$)/i,
  /no (?:tool|capability) available for (.+?)(?:\.|$)/i,
];

// ── Workflow pattern detection ─────────────────────────────────────────

/**
 * Multi-step request indicators — the user is asking for a sequence of actions.
 */
const MULTI_STEP_PATTERNS: RegExp[] = [
  /\bthen\b.*\bthen\b/i,                      // "do X, then Y, then Z"
  /\bfirst\b.*\bthen\b/i,                     // "first do X, then Y"
  /\bstep\s*\d+/i,                            // "step 1, step 2"
  /\b(?:and then|after that|next|finally)\b/i, // sequence words
];

// ── Main function ──────────────────────────────────────────────────────

/**
 * Process an interaction for improvement signals.
 *
 * This is the main entry point called after every agent response.
 * It analyzes the user message and agent response to detect:
 *   1. Corrections (using the existing correction-detector)
 *   2. Capability gaps (tools requested but not available)
 *   3. Workflow patterns (recurring multi-step sequences)
 *
 * Returns structured signals for storage and display.
 */
export function processInteractionForImprovement(
  params: ImprovementWiringParams,
): ImprovementWiringResult {
  const { userMessage, agentResponse, toolsUsed } = params;

  const result: ImprovementWiringResult = {
    wasCorrection: false,
  };

  // 1. Run correction detector on userMessage
  const correction = detectCorrection(userMessage);
  if (correction) {
    result.wasCorrection = true;
    result.correctionDetail = correction.detail;
  }

  // 2. Check for capability gaps
  const gap = detectCapabilityGap(userMessage, agentResponse, toolsUsed);
  if (gap) {
    result.capabilityGap = gap;
  }

  // 3. Check for workflow patterns (repeated multi-step sequences)
  const pattern = detectWorkflowPattern(userMessage);
  if (pattern) {
    result.workflowPattern = pattern;
  }

  return result;
}

// ── Internal helpers ───────────────────────────────────────────────────

/**
 * Detect capability gaps from the interaction.
 * Checks:
 *   - Agent response mentions a tool not found
 *   - User message requests a tool/integration not in the known set
 */
function detectCapabilityGap(
  userMessage: string,
  agentResponse: string,
  toolsUsed: string[],
): string | undefined {
  // Check agent response for explicit tool-not-found messages
  for (const pattern of TOOL_NOT_FOUND_PATTERNS) {
    const match = agentResponse.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Check user message for requests that imply missing capabilities
  for (const { pattern } of GAP_REQUEST_PATTERNS) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      const requested = match[1].toLowerCase();
      // Only flag as a gap if no tool was actually used for this domain
      if (toolsUsed.length === 0 || !toolsUsed.some(t => t.includes(requested))) {
        return requested;
      }
    }
  }

  return undefined;
}

/**
 * Detect recurring workflow patterns from the user message.
 * Uses task-shape detection to identify the structural pattern,
 * and checks for multi-step indicators.
 */
function detectWorkflowPattern(userMessage: string): string | undefined {
  // Only flag multi-step requests as workflow patterns
  const isMultiStep = MULTI_STEP_PATTERNS.some(p => p.test(userMessage));
  if (!isMultiStep) return undefined;

  // Use task-shape detector to identify the pattern type
  const shape = detectTaskShape(userMessage);
  if (shape.confidence >= 0.3) {
    return shape.type;
  }

  return undefined;
}
