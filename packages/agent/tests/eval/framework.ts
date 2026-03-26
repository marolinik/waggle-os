export interface EvalScenario {
  name: string;
  category: string;
  userMessage: string;
  checks: {
    shouldContain?: string[];
    shouldNotContain?: string[];
    maxLength?: number;
    expectedTools?: string[];
    forbiddenTools?: string[];
  };
}

export interface EvalResult {
  scenario: string;
  passed: boolean;
  failures: string[];
}

export interface MockAgentResponse {
  content: string;
  toolsUsed: string[];
}

export function evaluateScenario(
  scenario: EvalScenario,
  response: MockAgentResponse
): EvalResult {
  const failures: string[] = [];

  if (scenario.checks.shouldContain) {
    for (const term of scenario.checks.shouldContain) {
      if (!response.content.toLowerCase().includes(term.toLowerCase())) {
        failures.push(`Missing expected term: "${term}"`);
      }
    }
  }

  if (scenario.checks.shouldNotContain) {
    for (const term of scenario.checks.shouldNotContain) {
      if (response.content.toLowerCase().includes(term.toLowerCase())) {
        failures.push(`Contains forbidden term: "${term}"`);
      }
    }
  }

  if (scenario.checks.maxLength && response.content.length > scenario.checks.maxLength) {
    failures.push(`Response too long: ${response.content.length} > ${scenario.checks.maxLength}`);
  }

  if (scenario.checks.expectedTools) {
    for (const tool of scenario.checks.expectedTools) {
      if (!response.toolsUsed.includes(tool)) {
        failures.push(`Missing expected tool: "${tool}"`);
      }
    }
  }

  if (scenario.checks.forbiddenTools) {
    for (const tool of scenario.checks.forbiddenTools) {
      if (response.toolsUsed.includes(tool)) {
        failures.push(`Used forbidden tool: "${tool}"`);
      }
    }
  }

  return {
    scenario: scenario.name,
    passed: failures.length === 0,
    failures,
  };
}
