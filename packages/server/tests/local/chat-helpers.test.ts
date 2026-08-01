/**
 * Chat Helpers & Chat Context — Pure Function Tests
 *
 * Covers:
 *   chat-helpers.ts: isRegulatedContent, isRetryableError, shouldSuggestSchedule, describeToolUse
 *   chat-context.ts: summarizeDroppedContext
 */

import { describe, it, expect } from 'vitest';
import {
  allowsAutomaticRecall,
  allowsPostResponseDecoration,
  buildTurnMessageWindow,
  canUseBudgetModelWithoutCloudEgress,
  classifyExplicitTurnMutationPolicy,
  filterToolsByTurnMutationPolicy,
  isExplicitToolFreeAdvisoryRequest,
  isRegulatedContent,
  isRetryableError,
  resolveTurnPersistencePermissions,
  selectAdvisoryMaxOutputTokens,
  shouldSuggestSchedule,
  describeToolUse,
  type TurnMutationPolicy,
} from '../../src/local/routes/chat-helpers.js';
import { summarizeDroppedContext } from '../../src/local/routes/chat-context.js';
import { PERSONA_CASES } from '../../../../tests/vision/persona-cases.js';

const DEFAULT_TURN_POLICY: TurnMutationPolicy = {
  denyAllMutations: false,
  denyMemoryPersistence: false,
  denyFileWrites: false,
  denyCodeExecution: false,
  denyAgentLaunch: false,
  contextScope: 'default',
};

function expectedPolicy(overrides: Partial<TurnMutationPolicy> = {}): TurnMutationPolicy {
  return { ...DEFAULT_TURN_POLICY, ...overrides };
}

function canonicalPrompt(id: 'coder' | 'data-engineer' | 'verifier' | 'coordinator'): string {
  const acceptanceCase = PERSONA_CASES.find(item => item.id === id);
  if (!acceptanceCase) throw new Error(`Missing canonical persona case: ${id}`);
  return acceptanceCase.prompt;
}

// ─── isRegulatedContent ──────────────────────────────────────────────

describe('isRegulatedContent', () => {
  // ── Happy path: detected regulated content ────────────────────────

  it('returns true for hr-manager content with >= 2 domain keywords', () => {
    expect(isRegulatedContent('Update the onboarding policy for new hires', 'hr-manager')).toBe(true);
  });

  it('returns true for legal-professional content with >= 2 domain keywords', () => {
    expect(isRegulatedContent('Review the contract clause about liability', 'legal-professional')).toBe(true);
  });

  it('returns true for finance-owner content with >= 2 domain keywords', () => {
    expect(isRegulatedContent('The budget forecast for Q3 looks promising', 'finance-owner')).toBe(true);
  });

  // ── Threshold boundary: exactly 2 keywords ────────────────────────

  it('returns true when content has exactly 2 matching keywords', () => {
    expect(isRegulatedContent('Check compliance and leave records', 'hr-manager')).toBe(true);
  });

  // ── Below threshold: only 1 keyword ───────────────────────────────

  it('returns false for hr-manager content with only 1 keyword', () => {
    expect(isRegulatedContent('Can you update the policy?', 'hr-manager')).toBe(false);
  });

  it('returns false for legal-professional content with only 1 keyword', () => {
    expect(isRegulatedContent('Send me the contract', 'legal-professional')).toBe(false);
  });

  it('returns false for finance-owner content with only 1 keyword', () => {
    expect(isRegulatedContent('What is the current budget?', 'finance-owner')).toBe(false);
  });

  // ── Unknown persona ───────────────────────────────────────────────

  it('returns false for an unknown persona id', () => {
    expect(isRegulatedContent('policy employment termination onboarding compliance', 'researcher')).toBe(false);
  });

  it('returns false for empty persona id', () => {
    expect(isRegulatedContent('policy employment', '')).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('returns false for empty content', () => {
    expect(isRegulatedContent('', 'hr-manager')).toBe(false);
  });

  it('is case-insensitive when matching keywords', () => {
    expect(isRegulatedContent('POLICY and EMPLOYMENT matters', 'hr-manager')).toBe(true);
  });

  it('detects keywords embedded in longer words (substring match)', () => {
    // "compliance" contains "compliance", "compensation" contains "compensation"
    expect(isRegulatedContent('noncompliance and overcompensation', 'hr-manager')).toBe(true);
  });

  it('returns true for finance-owner with "cash flow" as a keyword', () => {
    expect(isRegulatedContent('The cash flow and revenue numbers are solid', 'finance-owner')).toBe(true);
  });
});

// ─── isRetryableError ────────────────────────────────────────────────

describe('isRetryableError', () => {
  // ── Error instances with status codes in message ──────────────────

  it('returns true for Error with 429 in message', () => {
    expect(isRetryableError(new Error('Request failed with status 429'))).toBe(true);
  });

  it('returns true for Error with 500 in message', () => {
    expect(isRetryableError(new Error('Server error 500'))).toBe(true);
  });

  it('returns true for Error with 502 in message', () => {
    expect(isRetryableError(new Error('Bad gateway 502'))).toBe(true);
  });

  it('returns true for Error with 503 in message', () => {
    expect(isRetryableError(new Error('Service unavailable 503'))).toBe(true);
  });

  it('returns true for Error with 504 in message', () => {
    expect(isRetryableError(new Error('Gateway timeout 504'))).toBe(true);
  });

  // ── Network errors ────────────────────────────────────────────────

  it('returns true for ETIMEDOUT error', () => {
    expect(isRetryableError(new Error('connect ETIMEDOUT 1.2.3.4:443'))).toBe(true);
  });

  it('returns true for ECONNREFUSED error', () => {
    expect(isRetryableError(new Error('connect ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
  });

  it('returns true for ECONNABORTED error', () => {
    expect(isRetryableError(new Error('ECONNABORTED: request timed out'))).toBe(true);
  });

  it('returns true after the agent loop exhausts network retries', () => {
    expect(isRetryableError(new Error(
      'Could not reach the model endpoint after 3 attempts (fetch failed).',
    ))).toBe(true);
  });

  // ── Rate limit / capacity messages ────────────────────────────────

  it('returns true for "rate limit" message', () => {
    expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('returns true for "too many requests" message', () => {
    expect(isRetryableError(new Error('Too many requests, slow down'))).toBe(true);
  });

  it('returns true for "overloaded" message', () => {
    expect(isRetryableError(new Error('Model is overloaded'))).toBe(true);
  });

  it('returns true for "capacity" message', () => {
    expect(isRetryableError(new Error('No capacity available'))).toBe(true);
  });

  // ── Objects with status property (non-Error) ──────────────────────

  it('returns true for plain object with status 429', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('returns true for plain object with status 500', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
  });

  it('returns true for plain object with status 502', () => {
    expect(isRetryableError({ status: 502 })).toBe(true);
  });

  it('returns true for plain object with status 503', () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('returns true for plain object with status 504', () => {
    expect(isRetryableError({ status: 504 })).toBe(true);
  });

  // ── Non-retryable cases ───────────────────────────────────────────

  it('returns false for Error with 400 in message', () => {
    expect(isRetryableError(new Error('Bad request 400'))).toBe(false);
  });

  it('returns false for Error with 404 in message', () => {
    expect(isRetryableError(new Error('Not found 404'))).toBe(false);
  });

  it('returns false for Error with generic message', () => {
    expect(isRetryableError(new Error('Something went wrong'))).toBe(false);
  });

  it('returns false for plain object with status 400', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
  });

  it('returns false for plain object with status 404', () => {
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('returns false for null', () => {
    expect(isRetryableError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRetryableError('429 error')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRetryableError(429)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isRetryableError({})).toBe(false);
  });

  it('does not treat 4290 as 429 (word boundary)', () => {
    expect(isRetryableError(new Error('Error code 4290'))).toBe(false);
  });
});

// ─── shouldSuggestSchedule ───────────────────────────────────────────

describe('classifyExplicitTurnMutationPolicy', () => {
  it('denies tools and memory for the canonical broad no-change instruction', () => {
    expect(classifyExplicitTurnMutationPolicy(
      'Turn this goal into milestones and exit criteria. Do not create or edit anything.',
    )).toEqual(expectedPolicy({
      denyAllMutations: true,
      denyMemoryPersistence: true,
      denyFileWrites: true,
      denyCodeExecution: true,
      denyAgentLaunch: true,
    }));
  });

  it('recognizes equivalent broad read-only instructions', () => {
    for (const message of [
      'Inspect this in read-only mode; make no changes.',
      'Review the proposal without making any changes.',
      'Summarize it, but do not take any actions.',
    ]) {
      expect(classifyExplicitTurnMutationPolicy(message), message).toEqual(expectedPolicy({
        denyAllMutations: true,
        denyMemoryPersistence: true,
        denyFileWrites: true,
        denyCodeExecution: true,
        denyAgentLaunch: true,
      }));
    }
  });

  it('can prohibit memory without disabling unrelated requested actions', () => {
    expect(classifyExplicitTurnMutationPolicy('Write the report, but do not save this to memory.'))
      .toEqual(expectedPolicy({ denyMemoryPersistence: true }));
  });

  it('does not broaden unrelated object-scoped or quoted constraints', () => {
    for (const message of [
      'Do not create a calendar event; remember this preference.',
      'Explain why the phrase "do not create or edit anything" is ambiguous.',
    ]) {
      expect(classifyExplicitTurnMutationPolicy(message), message).toEqual(expectedPolicy());
    }
  });

  it('treats a file-scoped prohibition granularly instead of denying every action', () => {
    expect(classifyExplicitTurnMutationPolicy('Do not create files or schedules.'))
      .toEqual(expectedPolicy({ denyFileWrites: true }));
  });

  it('lets a broad denial win over a conflicting memory request', () => {
    expect(classifyExplicitTurnMutationPolicy(
      'Remember this preference, but do not create or edit anything.',
    )).toEqual(expectedPolicy({
      denyAllMutations: true,
      denyMemoryPersistence: true,
      denyFileWrites: true,
      denyCodeExecution: true,
      denyAgentLaunch: true,
    }));
  });

  it('keeps paired contractions actionable instead of treating them as quoted text', () => {
    expect(classifyExplicitTurnMutationPolicy(
      "Don't create or edit anything because it's unnecessary.",
    )).toEqual(expectedPolicy({
      denyAllMutations: true,
      denyMemoryPersistence: true,
      denyFileWrites: true,
      denyCodeExecution: true,
      denyAgentLaunch: true,
    }));
    expect(classifyExplicitTurnMutationPolicy(
      'Don’t create or edit anything.',
    )).toEqual(expectedPolicy({
      denyAllMutations: true,
      denyMemoryPersistence: true,
      denyFileWrites: true,
      denyCodeExecution: true,
      denyAgentLaunch: true,
    }));
  });

  it('ignores quoted prohibitions even when the quote contains a contraction', () => {
    expect(classifyExplicitTurnMutationPolicy(
      "Rewrite: 'Don't create or edit anything.'",
    )).toEqual(expectedPolicy());
    expect(classifyExplicitTurnMutationPolicy(
      'Rewrite: ‘Don’t create or edit anything.’',
    )).toEqual(expectedPolicy());
    expect(classifyExplicitTurnMutationPolicy(
      'Explain “Do not write files or execute code.”',
    )).toEqual(expectedPolicy());
    expect(classifyExplicitTurnMutationPolicy(
      'Discuss “Inspect only this current virtual workspace.”',
    )).toEqual(expectedPolicy());
    expect(classifyExplicitTurnMutationPolicy(
      'Explain “Return exactly one JSON envelope with evidenceScope supplied_only and no text before or after.”',
    )).toEqual(expectedPolicy());
  });

  it('classifies the four canonical persona constraints without broadening them', () => {
    const coder = classifyExplicitTurnMutationPolicy(canonicalPrompt('coder'));
    expect(coder).toEqual(expectedPolicy({
      denyFileWrites: true,
      contextScope: 'workspace-only',
    }));
    expect(allowsAutomaticRecall(coder)).toBe(false);

    const dataEngineer = classifyExplicitTurnMutationPolicy(canonicalPrompt('data-engineer'));
    expect(dataEngineer).toEqual(expectedPolicy({
      denyFileWrites: true,
      denyCodeExecution: true,
    }));
    expect(allowsAutomaticRecall(dataEngineer)).toBe(true);

    const verifier = classifyExplicitTurnMutationPolicy(canonicalPrompt('verifier'));
    expect(verifier).toEqual(expectedPolicy({
      denyFileWrites: true,
      contextScope: 'supplied-only',
    }));
    expect(allowsAutomaticRecall(verifier)).toBe(false);

    const coordinator = classifyExplicitTurnMutationPolicy(canonicalPrompt('coordinator'));
    expect(coordinator).toEqual(expectedPolicy({
      denyFileWrites: true,
      denyAgentLaunch: true,
    }));
    expect(allowsAutomaticRecall(coordinator)).toBe(true);
  });

  it('recognizes self-contained advisory turns without swallowing explicit evidence requests', () => {
    for (const id of ['data-engineer', 'coordinator'] as const) {
      const prompt = canonicalPrompt(id);
      expect(isExplicitToolFreeAdvisoryRequest(
        prompt,
        classifyExplicitTurnMutationPolicy(prompt),
      ), id).toBe(true);
    }

    const coderPrompt = canonicalPrompt('coder');
    expect(isExplicitToolFreeAdvisoryRequest(
      coderPrompt,
      classifyExplicitTurnMutationPolicy(coderPrompt),
    )).toBe(false);

    for (const prompt of [
      'Design the migration using the files in this current workspace. Do not write files or execute code.',
      'Outline two review lanes after searching my saved memory. Do not edit files or launch agents.',
      'Design a current deployment recommendation from the latest online documentation. Do not write files or execute code.',
      'Design a migration and cite official sources. Do not write files or execute code.',
      'Decompose this review based on our previous discussion. Do not edit files or launch agents.',
      'Design a migration with web_search. Do not write files or execute code.',
      'Summarize the text above. Do not write files or execute code.',
      'Okay, outline that plan. Do not edit files or launch agents.',
      'Now decompose it. Do not edit files or launch agents.',
      'Now summarize them. Do not write files or execute code.',
      'Decompose those into lanes. Do not edit files or launch agents.',
      'Outline the remaining work. Do not edit files or launch agents.',
      'Explain package.json. Do not write files or execute code.',
      'Summarize "README.md". Do not write files or execute code.',
      'Prepare a summary from Slack. Do not write files or execute code.',
      'Summarize the attached PDF. Do not write files or execute code.',
      'Summarize the document I attached. Do not write files or execute code.',
      'Prepare a summary using Salesforce. Do not write files or execute code.',
      'Prepare a summary from salesforce. Do not write files or execute code.',
      'Prepare a summary from hubspot. Do not write files or execute code.',
      'Summarize records in airtable. Do not write files or execute code.',
      'Summarize my inbox. Do not write files or execute code.',
      'Prepare an agenda from my calendar. Do not write files or execute code.',
      'Summarize the open tasks in Linear. Do not write files or execute code.',
      'Draft an email based on the record in Salesforce. Do not write files or execute code.',
      'Draft a response based on the customer email below. Do not write files or execute code.',
      'Summarize the repository architecture. Do not write files or execute code.',
      'Explain the codebase structure. Do not write files or execute code.',
      "Summarize today's AI news. Do not write files or execute code.",
      'Explain the current weather in Belgrade. Do not write files or execute code.',
      'Send an email to Alice. Do not write files or launch agents.',
      'Draft and send an email to Alice. Do not write files or launch agents.',
      'Draft and email Alice a response. Do not write files or launch agents.',
      'Schedule a meeting tomorrow. Do not write files or launch agents.',
      'Prepare and schedule a meeting tomorrow. Do not write files or launch agents.',
      'Post the update to Slack. Do not write files or launch agents.',
      'Draft a response and post it to Slack. Do not write files or launch agents.',
      'Prepare and upload the report. Do not write files or launch agents.',
      'Draft and share the update. Do not write files or launch agents.',
      'Draft and message Alice. Do not write files or launch agents.',
      'Draft a response, email Alice. Do not write files or launch agents.',
      'Prepare the report; upload to Drive. Do not write files or launch agents.',
      'Draft the update: post it to Slack. Do not write files or launch agents.',
      'Draft the response \u2014 email Alice. Do not write files or launch agents.',
      'Design a plan, create a Jira ticket. Do not write files or launch agents.',
      'Delete the calendar event. Do not write files or launch agents.',
      'Design a plan and create a Jira ticket. Do not write files or launch agents.',
      'Outline the review. Do not edit files or launch agents, but inspect this workspace.',
      'Design the migration. Do not write files or execute code; search my saved memory first.',
      'Design the migration without editing files or running code, using the attached schema.',
      'Outline a plan without editing files or running code based on the current repository.',
      'Do not edit files or launch agents, inspect this workspace first and outline the result.',
      'Outline the review. Do not edit files or launch agents, then search my saved memory.',
    ]) {
      expect(isExplicitToolFreeAdvisoryRequest(
        prompt,
        classifyExplicitTurnMutationPolicy(prompt),
      ), prompt).toBe(false);
    }
  });

  it('caps advisory output from answer-length intent rather than unrelated adjectives', () => {
    expect(selectAdvisoryMaxOutputTokens(canonicalPrompt('data-engineer'))).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(canonicalPrompt('coordinator'))).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens('Give a concise answer about the migration.')).toBe(2_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Explain the limits of a 256-token context window in detail. Do not write files or execute code.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Explain the limitations of a model with a 256 token output limit in detail.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Explain a model configured for at most 512 tokens in detail.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens('Give an answer of at most 500 words.')).toBe(750);
    expect(selectAdvisoryMaxOutputTokens('Summarize in at most 120 words.')).toBe(256);
    expect(selectAdvisoryMaxOutputTokens('Write no fewer than 5000 words.')).toBe(7_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Explain why a 5000-word report is difficult to review in detail.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Outline how to summarize a 5000-word guide without losing structure.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Explain a 256-token response buffer thoroughly.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Explain how an API should write at most 512 tokens to its response buffer.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Write about why a 5000-word report is difficult to review.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a detailed 5000-token guide to compact cameras. Do not write files or execute code.',
    )).toBe(5_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Could you write a 5000-word report? Do not write files or execute code.',
    )).toBe(7_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Please can you draft a 5000-token guide? Do not write files or execute code.',
    )).toBe(5_000);
  });

  it('filters the canonical policies before downstream tool selection', () => {
    const tools = [
      'read_file', 'search_files', 'search_content', 'git_status', 'git_diff', 'git_log',
      'lsp_diagnostics', 'write_file', 'edit_file', 'multi_edit', 'generate_xlsx',
      'bash', 'run_code', 'cli_execute', 'kill_task', 'search_memory', 'query_knowledge',
      'spawn_agent', 'compose_workflow', 'orchestrate_workflow', 'execute_step', 'run_harness',
      'mcp_sqlite_query',
    ].map(name => ({ name }));
    const external = new Set(['mcp_sqlite_query']);

    const coderNames = filterToolsByTurnMutationPolicy(
      tools,
      classifyExplicitTurnMutationPolicy(canonicalPrompt('coder')),
      external,
    ).map(tool => tool.name);
    expect(coderNames).toEqual([
      'read_file', 'search_files', 'search_content',
    ]);

    const dataEngineerNames = filterToolsByTurnMutationPolicy(
      tools,
      classifyExplicitTurnMutationPolicy(canonicalPrompt('data-engineer')),
      external,
    ).map(tool => tool.name);
    for (const denied of [
      'write_file', 'edit_file', 'multi_edit', 'generate_xlsx', 'bash', 'run_code',
      'cli_execute', 'kill_task', 'spawn_agent', 'orchestrate_workflow', 'execute_step',
      'run_harness', 'mcp_sqlite_query',
    ]) {
      expect(dataEngineerNames, denied).not.toContain(denied);
    }
    expect(dataEngineerNames).toContain('read_file');
    expect(dataEngineerNames).toContain('search_memory');

    const coordinatorNames = filterToolsByTurnMutationPolicy(
      tools,
      classifyExplicitTurnMutationPolicy(canonicalPrompt('coordinator')),
      external,
    ).map(tool => tool.name);
    for (const denied of [
      'write_file', 'edit_file', 'multi_edit', 'generate_xlsx', 'spawn_agent',
      'compose_workflow', 'orchestrate_workflow', 'execute_step', 'run_harness',
      'mcp_sqlite_query',
    ]) {
      expect(coordinatorNames, denied).not.toContain(denied);
    }

    expect(filterToolsByTurnMutationPolicy(
      tools,
      classifyExplicitTurnMutationPolicy(canonicalPrompt('verifier')),
      external,
    )).toEqual([]);
  });

  it('treats execution and delegation as indirect file-write paths', () => {
    const tools = [
      'read_file', 'search_files', 'search_content', 'write_file', 'bash', 'run_code',
      'cli_execute', 'execute_step', 'spawn_agent', 'compose_workflow',
      'orchestrate_workflow', 'run_harness',
    ].map(name => ({ name }));
    const filteredNames = filterToolsByTurnMutationPolicy(
      tools,
      classifyExplicitTurnMutationPolicy('Do not write files.'),
    ).map(tool => tool.name);

    expect(filteredNames).toEqual(['read_file', 'search_files', 'search_content']);
  });

  it('removes prior-chat evidence from both bounded canonical turns', () => {
    const history = [
      { role: 'user', content: 'Prior user claim that must not become evidence.' },
      { role: 'assistant', content: 'Prior assistant conclusion that must not become evidence.' },
      { role: 'user', content: 'Current request as originally persisted.' },
    ];

    for (const id of ['coder', 'verifier'] as const) {
      const currentPrompt = canonicalPrompt(id);
      expect(buildTurnMessageWindow(
        history,
        currentPrompt,
        classifyExplicitTurnMutationPolicy(currentPrompt),
      ), id).toEqual([{ role: 'user', content: currentPrompt }]);
    }

    const unboundedPrompt = canonicalPrompt('data-engineer');
    expect(buildTurnMessageWindow(
      history,
      unboundedPrompt,
      classifyExplicitTurnMutationPolicy(unboundedPrompt),
    )).toEqual(history);
  });

  it('suppresses learned state and response decorations for bounded or persona-read-only turns', () => {
    for (const id of ['coder', 'verifier'] as const) {
      const policy = classifyExplicitTurnMutationPolicy(canonicalPrompt(id));
      expect(resolveTurnPersistencePermissions({
        policy,
        isAutomatedTurn: false,
        personaIsReadOnly: false,
      }), id).toEqual({
        allowMemoryPersistence: false,
        allowDerivedPersistence: false,
      });
      expect(allowsPostResponseDecoration(policy), id).toBe(false);
    }
    const verifierPrompt = canonicalPrompt('verifier');
    expect(shouldSuggestSchedule('Repeat this verification weekly.', [], verifierPrompt)).toBe(true);
    expect(allowsPostResponseDecoration(
      classifyExplicitTurnMutationPolicy(verifierPrompt),
    )).toBe(false);

    expect(resolveTurnPersistencePermissions({
      policy: expectedPolicy(),
      isAutomatedTurn: false,
      personaIsReadOnly: true,
    })).toEqual({
      allowMemoryPersistence: false,
      allowDerivedPersistence: false,
    });
    expect(resolveTurnPersistencePermissions({
      policy: expectedPolicy(),
      isAutomatedTurn: false,
      personaIsReadOnly: false,
      closedWorldRewrite: true,
    })).toEqual({
      allowMemoryPersistence: false,
      allowDerivedPersistence: false,
    });
    expect(allowsPostResponseDecoration(expectedPolicy(), true)).toBe(false);
    expect(resolveTurnPersistencePermissions({
      policy: expectedPolicy({ denyMemoryPersistence: true }),
      isAutomatedTurn: false,
      personaIsReadOnly: false,
    })).toEqual({
      allowMemoryPersistence: false,
      allowDerivedPersistence: false,
    });
    expect(resolveTurnPersistencePermissions({
      policy: expectedPolicy(),
      isAutomatedTurn: false,
      personaIsReadOnly: false,
    })).toEqual({
      allowMemoryPersistence: true,
      allowDerivedPersistence: true,
    });
  });
});

describe('canUseBudgetModelWithoutCloudEgress', () => {
  it('blocks an implicit local-to-cloud budget route', () => {
    expect(canUseBudgetModelWithoutCloudEgress(
      'ollama/private-local-model',
      'openrouter/cloud-budget-model',
    )).toBe(false);
  });

  it('allows local-to-local budget routing', () => {
    expect(canUseBudgetModelWithoutCloudEgress(
      'ollama/private-local-model',
      'ollama/local-budget-model',
    )).toBe(true);
  });

  it('blocks Ollama cloud aliases from being treated as local budget models', () => {
    expect(canUseBudgetModelWithoutCloudEgress(
      'ollama/private-local-model',
      'ollama/minimax-m2.7:cloud',
    )).toBe(false);
  });

  it('allows cloud-primary routing because history is already cloud-eligible', () => {
    expect(canUseBudgetModelWithoutCloudEgress(
      'anthropic/claude-sonnet',
      'openrouter/cloud-budget-model',
    )).toBe(true);
  });
});

describe('shouldSuggestSchedule', () => {
  // ── Positive: recurring patterns in text, no scheduling tools ─────

  it('returns true when response mentions "every day" and no schedule tool used', () => {
    expect(shouldSuggestSchedule('I can check this every day for you.', [], '')).toBe(true);
  });

  it('returns true for "daily" pattern', () => {
    expect(shouldSuggestSchedule('This task runs daily.', [], '')).toBe(true);
  });

  it('returns true for "weekly" pattern', () => {
    expect(shouldSuggestSchedule('I recommend a weekly review.', [], '')).toBe(true);
  });

  it('returns true for "every week" pattern', () => {
    expect(shouldSuggestSchedule('Let me do this every week.', [], '')).toBe(true);
  });

  it('returns true for "each morning" pattern', () => {
    expect(shouldSuggestSchedule('We can run reports each morning.', [], '')).toBe(true);
  });

  it('returns true for "every morning" pattern', () => {
    expect(shouldSuggestSchedule('I will check every morning.', [], '')).toBe(true);
  });

  it('returns true for "regularly" pattern', () => {
    expect(shouldSuggestSchedule('This should be done regularly.', [], '')).toBe(true);
  });

  it('returns true for "recurring" pattern', () => {
    expect(shouldSuggestSchedule('This is a recurring task.', [], '')).toBe(true);
  });

  it('does not treat a one-time scheduled action as recurring work', () => {
    expect(shouldSuggestSchedule('The meeting is already scheduled for then.', [], '')).toBe(false);
    expect(shouldSuggestSchedule('Monitor the issue and schedule a fix.', [], '')).toBe(false);
  });

  it('returns true for "every month" pattern', () => {
    expect(shouldSuggestSchedule('We generate reports every month.', [], '')).toBe(true);
  });

  it('returns true for "monthly" pattern', () => {
    expect(shouldSuggestSchedule('The monthly review is due.', [], '')).toBe(true);
  });

  // ── Negative: scheduling tool already used ────────────────────────

  it('returns false when a schedule tool was already used', () => {
    expect(shouldSuggestSchedule('Run this daily.', ['schedule_task'], '')).toBe(false);
  });

  it('returns false when a cron tool was already used', () => {
    expect(shouldSuggestSchedule('This runs every week.', ['create_cron'], '')).toBe(false);
  });

  it('returns false when tool name contains "schedule" anywhere', () => {
    expect(shouldSuggestSchedule('Do this weekly.', ['my_schedule_helper'], '')).toBe(false);
  });

  // ── Negative: no recurring patterns ───────────────────────────────

  it('returns false when response has no recurring patterns', () => {
    expect(shouldSuggestSchedule('Here is the report you asked for.', [], '')).toBe(false);
  });

  it('returns false for empty response text', () => {
    expect(shouldSuggestSchedule('', [], '')).toBe(false);
  });

  // ── Case insensitivity ────────────────────────────────────────────

  it('matches patterns case-insensitively', () => {
    expect(shouldSuggestSchedule('Run DAILY checks.', [], '')).toBe(true);
  });

  it('honors explicit schedule prohibitions, including the Finance live prompt', () => {
    const response = 'Runway equals cash divided by net monthly burn.';
    for (const message of [
      'Do not create files or schedules.',
      "Don't suggest a recurring task.",
      'No schedules, just answer the question.',
      'No scheduling, just answer the question.',
      'No schedule suggestions, just answer the question.',
      'Answer without creating a calendar event.',
      'Do not suggest /schedule.',
      'Do not recommend /schedule.',
      'Do not append /schedule.',
      'Do not include /schedule.',
      'Answer without recommending /schedule.',
      'Answer without appending /schedule.',
      "Don't suggest /schedule because it's irrelevant.",
      'Don’t suggest /schedule.',
    ]) {
      expect(shouldSuggestSchedule(response, [], message), message).toBe(false);
    }
  });

  it('does not mistake descriptive or double-negated schedule text for a prohibition', () => {
    const response = 'A monthly review would help.';
    for (const message of [
      "Don't forget to create a weekly schedule.",
      'Do not avoid scheduling the monthly review.',
      'Do not cancel the existing schedule.',
      'There are no schedules yet.',
      'Rewrite: "Do not create schedules."',
      "Rewrite: 'Do not suggest /schedule.'",
      "Rewrite: 'Don't suggest /schedule.'",
      'Rewrite: ‘Don’t suggest /schedule and do not append /schedule.’',
    ]) {
      expect(shouldSuggestSchedule(response, [], message), message).toBe(true);
    }
  });
});

// ─── describeToolUse ─────────────────────────────────────────────────

describe('describeToolUse', () => {
  // ── Known tool names ──────────────────────────────────────────────

  it('describes web_search with query', () => {
    expect(describeToolUse('web_search', { query: 'typescript generics' })).toBe(
      'Searching the web for "typescript generics"...',
    );
  });

  it('describes web_fetch with url', () => {
    expect(describeToolUse('web_fetch', { url: 'https://example.com' })).toBe(
      'Reading web page: https://example.com...',
    );
  });

  it('describes search_memory with query', () => {
    expect(describeToolUse('search_memory', { query: 'project goals' })).toBe(
      'Searching memory for "project goals"...',
    );
  });

  it('describes save_memory', () => {
    expect(describeToolUse('save_memory', {})).toBe('Saving to memory...');
  });

  it('describes get_identity', () => {
    expect(describeToolUse('get_identity', {})).toBe('Checking identity...');
  });

  it('describes get_awareness', () => {
    expect(describeToolUse('get_awareness', {})).toBe('Checking current awareness state...');
  });

  it('describes query_knowledge', () => {
    expect(describeToolUse('query_knowledge', {})).toBe('Querying knowledge graph...');
  });

  it('describes add_task with title', () => {
    expect(describeToolUse('add_task', { title: 'Fix bug' })).toBe('Adding task: "Fix bug"...');
  });

  it('describes correct_knowledge', () => {
    expect(describeToolUse('correct_knowledge', {})).toBe('Updating knowledge graph...');
  });

  it('describes bash with command (truncated to 80 chars)', () => {
    const longCmd = 'a'.repeat(100);
    const result = describeToolUse('bash', { command: longCmd });
    expect(result).toBe(`Running command: ${'a'.repeat(80)}...`);
  });

  it('describes bash with short command', () => {
    expect(describeToolUse('bash', { command: 'ls -la' })).toBe('Running command: ls -la...');
  });

  it('describes read_file with path', () => {
    expect(describeToolUse('read_file', { path: '/src/index.ts' })).toBe('Reading file: /src/index.ts...');
  });

  it('describes write_file with path', () => {
    expect(describeToolUse('write_file', { path: '/out/bundle.js' })).toBe('Writing file: /out/bundle.js...');
  });

  it('describes edit_file with path', () => {
    expect(describeToolUse('edit_file', { path: 'config.json' })).toBe('Editing file: config.json...');
  });

  it('describes search_files with pattern', () => {
    expect(describeToolUse('search_files', { pattern: '*.ts' })).toBe('Searching for files matching "*.ts"...');
  });

  it('describes search_content with pattern', () => {
    expect(describeToolUse('search_content', { pattern: 'TODO' })).toBe('Searching file contents for "TODO"...');
  });

  it('describes git_status', () => {
    expect(describeToolUse('git_status', {})).toBe('Checking git status...');
  });

  it('describes git_diff', () => {
    expect(describeToolUse('git_diff', {})).toBe('Checking git diff...');
  });

  it('describes git_log', () => {
    expect(describeToolUse('git_log', {})).toBe('Checking git log...');
  });

  it('describes git_commit', () => {
    expect(describeToolUse('git_commit', {})).toBe('Creating git commit...');
  });

  it('describes create_plan with title', () => {
    expect(describeToolUse('create_plan', { title: 'Sprint 5' })).toBe('Creating plan: "Sprint 5"...');
  });

  it('describes add_plan_step', () => {
    expect(describeToolUse('add_plan_step', {})).toBe('Adding plan step...');
  });

  it('describes execute_step', () => {
    expect(describeToolUse('execute_step', {})).toBe('Executing plan step...');
  });

  it('describes show_plan', () => {
    expect(describeToolUse('show_plan', {})).toBe('Showing current plan...');
  });

  it('describes generate_docx with path', () => {
    expect(describeToolUse('generate_docx', { path: 'report.docx' })).toBe('Generating document: report.docx...');
  });

  it('describes list_skills', () => {
    expect(describeToolUse('list_skills', {})).toBe('Checking installed skills...');
  });

  it('describes create_skill with name', () => {
    expect(describeToolUse('create_skill', { name: 'data-cleaner' })).toBe('Creating skill: data-cleaner...');
  });

  it('describes delete_skill with name', () => {
    expect(describeToolUse('delete_skill', { name: 'old-skill' })).toBe('Deleting skill: old-skill...');
  });

  it('describes read_skill with name', () => {
    expect(describeToolUse('read_skill', { name: 'summarizer' })).toBe('Reading skill: summarizer...');
  });

  it('describes search_skills with query', () => {
    expect(describeToolUse('search_skills', { query: 'writing' })).toBe('Searching for skills: "writing"...');
  });

  it('describes suggest_skill', () => {
    expect(describeToolUse('suggest_skill', {})).toBe('Looking for relevant skills...');
  });

  it('describes acquire_capability with need', () => {
    expect(describeToolUse('acquire_capability', { need: 'PDF generation' })).toBe(
      'Searching for capabilities: "PDF generation"...',
    );
  });

  it('describes install_capability with name', () => {
    expect(describeToolUse('install_capability', { name: 'pdf-gen' })).toBe('Installing capability: pdf-gen...');
  });

  it('describes compose_workflow', () => {
    expect(describeToolUse('compose_workflow', {})).toBe('Analyzing task and composing workflow plan...');
  });

  it('describes spawn_agent with name and role', () => {
    expect(describeToolUse('spawn_agent', { name: 'worker-1', role: 'researcher' })).toBe(
      'Spawning sub-agent "worker-1" (researcher)...',
    );
  });

  it('describes list_agents', () => {
    expect(describeToolUse('list_agents', {})).toBe('Checking sub-agents...');
  });

  it('describes get_agent_result', () => {
    expect(describeToolUse('get_agent_result', {})).toBe('Getting sub-agent result...');
  });

  // ── Default fallback ──────────────────────────────────────────────

  it('falls back to "Using <name>..." for unknown tools', () => {
    expect(describeToolUse('custom_tool', { foo: 'bar' })).toBe('Using custom_tool...');
  });

  // P7/D15 Track A review #4: gated tools that used to hit the generic default.
  it('describes git mutations specifically', () => {
    expect(describeToolUse('git_push', {})).toBe('Pushing commits to the remote...');
    expect(describeToolUse('git_merge', {})).toBe('Merging branches...');
    expect(describeToolUse('git_pr', {})).toBe('Opening a pull request...');
  });

  it('describes a connector action as "<action> via <id>"', () => {
    expect(describeToolUse('connector_jira_create_issue', {})).toBe('create issue via jira...');
    expect(describeToolUse('connector_gmail_send_email', {})).toBe('send email via gmail...');
  });

  it('describes cross-workspace reads with the target workspace', () => {
    expect(describeToolUse('read_other_workspace', { target_workspace_id: 'ws-7' })).toBe(
      'Accessing another workspace: ws-7...',
    );
  });

  // ── Missing input fields ──────────────────────────────────────────

  it('handles missing query in web_search gracefully', () => {
    expect(describeToolUse('web_search', {})).toBe('Searching the web for ""...');
  });

  it('handles missing path in read_file gracefully', () => {
    expect(describeToolUse('read_file', {})).toBe('Reading file: ...');
  });

  it('handles missing command in bash gracefully', () => {
    expect(describeToolUse('bash', {})).toBe('Running command: ...');
  });
});

// ─── summarizeDroppedContext ──────────────────────────────────────────

describe('summarizeDroppedContext', () => {
  // ── Empty / minimal input ─────────────────────────────────────────

  it('returns a fallback message for an empty array', () => {
    const result = summarizeDroppedContext([]);
    expect(result).toContain('0 messages');
  });

  it('returns a fallback for messages with content shorter than 10 chars', () => {
    const result = summarizeDroppedContext([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hey' },
    ]);
    // Both messages are < 10 chars so nothing is extracted
    expect(result).toContain('2 messages');
  });

  // ── Decision extraction ───────────────────────────────────────────

  it('extracts decisions from messages containing decision keywords', () => {
    const messages = [
      { role: 'assistant', content: 'We decided to use React for the frontend. It offers the best DX.' },
      { role: 'user', content: 'Sounds good, let us proceed with that plan forward.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Decisions made');
    expect(result).toContain('We decided to use React for the frontend');
  });

  it('extracts decisions with "agreed" keyword', () => {
    const messages = [
      { role: 'assistant', content: 'We agreed on the new database schema for production deployment.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Decisions made');
  });

  it('extracts decisions with "chose" keyword', () => {
    const messages = [
      { role: 'user', content: 'We chose PostgreSQL over MySQL for better JSON support in our system.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Decisions made');
  });

  it('extracts decisions with "selected" keyword', () => {
    const messages = [
      { role: 'assistant', content: 'The team selected the monorepo approach for better code sharing between packages.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Decisions made');
  });

  it('extracts decisions with "went with" keyword', () => {
    const messages = [
      { role: 'user', content: 'We went with Tailwind CSS instead of styled-components for this project.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Decisions made');
  });

  it('limits decisions to 5 entries', () => {
    const messages = Array.from({ length: 8 }, (_, i) => ({
      role: 'assistant',
      content: `We decided on option ${i + 1} for the architecture design of module ${i + 1}.`,
    }));
    const result = summarizeDroppedContext(messages);
    // Should contain "Decisions made" but capped at 5
    const decisionLine = result.split('\n').find(l => l.startsWith('Decisions made'));
    expect(decisionLine).toBeDefined();
    // Count pipe separators: 5 items = 4 pipes
    const pipeCount = (decisionLine!.match(/\|/g) || []).length;
    expect(pipeCount).toBe(4);
  });

  // ── User request extraction ───────────────────────────────────────

  it('extracts user request summaries (first line of user messages)', () => {
    const messages = [
      { role: 'user', content: 'Please review the deployment pipeline configuration\nIt has been failing intermittently.' },
      { role: 'assistant', content: 'Sure, let me look into the deployment pipeline for you.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Topics discussed');
    expect(result).toContain('Please review the deployment pipeline configuration');
  });

  it('skips user messages with first line shorter than 16 chars', () => {
    const messages = [
      { role: 'user', content: 'Short message' }, // 13 chars - too short
      { role: 'user', content: 'This is a longer user request that should be included in the summary output.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Topics discussed');
    expect(result).not.toContain('Short message');
  });

  it('skips user messages with first line longer than 149 chars', () => {
    const longLine = 'A'.repeat(150);
    const messages = [
      { role: 'user', content: longLine },
    ];
    const result = summarizeDroppedContext(messages);
    // Should fall back since the one user message is too long
    expect(result).toContain('1 messages');
  });

  it('shows conversation arc with ellipsis for many user requests', () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: 'user',
      content: `User request number ${i + 1} about a specific topic`,
    }));
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Topics discussed');
    expect(result).toContain('...');
  });

  it('shows all requests when there are 4 or fewer', () => {
    const messages = [
      { role: 'user', content: 'First request about the API endpoint design' },
      { role: 'user', content: 'Second request about database schema updates' },
      { role: 'user', content: 'Third request about testing the integration layer' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Topics discussed');
    expect(result).not.toContain('...');
  });

  // ── Combined output ───────────────────────────────────────────────

  it('includes both decisions and topics when both are present', () => {
    const messages = [
      { role: 'user', content: 'Can you set up the auth module for the application?' },
      { role: 'assistant', content: 'We decided to use JWT tokens with Clerk for authentication in this project.' },
    ];
    const result = summarizeDroppedContext(messages);
    expect(result).toContain('Decisions made');
    expect(result).toContain('Topics discussed');
  });

  // ── Ignores assistant messages for user requests ──────────────────

  it('does not include assistant messages in user requests', () => {
    const messages = [
      { role: 'assistant', content: 'Here is the full analysis of your deployment system and its configuration.' },
    ];
    const result = summarizeDroppedContext(messages);
    // No user messages, no decisions -> fallback
    expect(result).toContain('1 messages');
  });

  // ── Decision sentence length bounds ───────────────────────────────

  it('skips decision sentences that are too short (<= 10 chars)', () => {
    const messages = [
      { role: 'assistant', content: 'Decided.\nThe rest of the context is here for padding so message passes length check.' },
    ];
    const result = summarizeDroppedContext(messages);
    // "Decided" is only 7 chars as first sentence, should be skipped
    // No other decisions or user requests -> fallback
    expect(result).toContain('1 messages');
  });

  it('skips decision sentences that are too long (>= 200 chars)', () => {
    const longSentence = 'We decided on ' + 'a'.repeat(200) + '. Another sentence.';
    const messages = [
      { role: 'assistant', content: longSentence },
    ];
    const result = summarizeDroppedContext(messages);
    // First sentence is > 200 chars, should be skipped
    expect(result).not.toContain('Decisions made');
  });
});
