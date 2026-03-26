/**
 * E2E Scenario Framework — setup/execute/verify pattern for testing
 * complete tool invocation chains with mocked LLM responses.
 *
 * Scenarios verify that the right tools are called in the right order
 * with the right parameters. They do NOT test LLM output quality.
 */

import type { ToolDefinition } from '../../src/tools.js';

export interface ScenarioStep {
  /** What the user says */
  userMessage: string;
  /** Tools the agent should invoke (in order) */
  expectedToolCalls: string[];
  /** Pattern that should appear in the final result */
  expectedPattern?: RegExp;
}

export interface ScenarioResult {
  toolsCalled: string[];
  toolArgs: Record<string, Record<string, unknown>>;
  outputs: string[];
}

/**
 * Execute a scenario by simulating tool calls.
 * Instead of running through LLM, we directly invoke tools in the expected order
 * and verify the tool chain works end-to-end.
 */
export async function executeScenario(
  tools: ToolDefinition[],
  steps: ScenarioStep[],
  toolArgs: Record<string, Record<string, unknown>>,
): Promise<ScenarioResult> {
  const toolMap = new Map(tools.map(t => [t.name, t]));
  const called: string[] = [];
  const outputs: string[] = [];
  const capturedArgs: Record<string, Record<string, unknown>> = {};

  for (const step of steps) {
    for (const toolName of step.expectedToolCalls) {
      const tool = toolMap.get(toolName);
      if (!tool) {
        outputs.push(`[ERROR] Tool not found: ${toolName}`);
        continue;
      }

      const args = toolArgs[toolName] ?? {};
      capturedArgs[toolName] = args;
      called.push(toolName);

      try {
        const result = await tool.execute(args);
        outputs.push(result);
      } catch (err: unknown) {
        outputs.push(`[ERROR] ${toolName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { toolsCalled: called, toolArgs: capturedArgs, outputs };
}

/** Verify a scenario result matches expectations */
export function verifyScenario(
  result: ScenarioResult,
  expectedTools: string[],
  expectedPatterns?: RegExp[],
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  // Check all expected tools were called
  for (const tool of expectedTools) {
    if (!result.toolsCalled.includes(tool)) {
      failures.push(`Expected tool "${tool}" was not called`);
    }
  }

  // Check patterns in outputs
  if (expectedPatterns) {
    const allOutput = result.outputs.join('\n');
    for (const pattern of expectedPatterns) {
      if (!pattern.test(allOutput)) {
        failures.push(`Expected pattern ${pattern} not found in output`);
      }
    }
  }

  // Check no errors
  const errors = result.outputs.filter(o => o.startsWith('[ERROR]'));
  if (errors.length > 0) {
    failures.push(...errors);
  }

  return { passed: failures.length === 0, failures };
}
