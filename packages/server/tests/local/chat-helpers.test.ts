/**
 * Chat Helpers & Chat Context — Pure Function Tests
 *
 * Covers:
 *   chat-helpers.ts: isRegulatedContent, isRetryableError, shouldSuggestSchedule, describeToolUse
 *   chat-context.ts: summarizeDroppedContext
 */

import { describe, it, expect } from 'vitest';
import {
  actionableMemoryDirectiveText,
  allowsAutomaticRecall,
  allowsConversationHistory,
  allowsPostResponseDecoration,
  buildTurnMessageWindow,
  canUseBudgetModelWithoutCloudEgress,
  classifyExplicitTurnMutationPolicy,
  filterToolsByTurnMutationPolicy,
  isAmbiguousMessage,
  isExplicitToolFreeAdvisoryRequest,
  isRegulatedContent,
  isRetryableError,
  primeMemoryDirectiveClassifier,
  resolveExplicitMemoryReadDirective,
  resolveTurnPersistencePermissions,
  selectAdvisoryMaxOutputTokens,
  shouldSuggestSchedule,
  describeToolUse,
  type TurnMutationPolicy,
} from '../../src/local/routes/chat-helpers.js';
import { isExplicitMemoryRecallRequest } from '../../src/local/routes/chat.js';
import { summarizeDroppedContext } from '../../src/local/routes/chat-context.js';
import { PERSONA_CASES } from '../../../../tests/vision/persona-cases.js';

const DEFAULT_TURN_POLICY: TurnMutationPolicy = {
  denyAllMutations: false,
  denyMemoryRead: false,
  denyConversationHistory: false,
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

describe('isAmbiguousMessage', () => {
  it('treats workspace catch-up starters as actionable continuity requests', () => {
    for (const message of [
      'Catch me up on this workspace',
      'Where did we leave off?',
      'Get me up to speed on this workspace',
    ]) {
      expect(isAmbiguousMessage(message), message).toBe(false);
    }
  });
});

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

  it('prohibits persisted-memory reads without disabling unrelated requested actions', () => {
    for (const [message, expected] of [
      ['Do not search memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true })],
      ['Without searching memory, tell me what we discussed.', expectedPolicy({ denyMemoryRead: true })],
      ['Explain what we decided without using memory.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Do not use memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Do not use our previous decisions; create a fresh plan.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not search or recall persistent memory; keep this chat context.', expectedPolicy({ denyMemoryRead: true })],
      ['Without consulting my saved memories, continue from this conversation.', expectedPolicy({ denyMemoryRead: true })],
      ['Use no memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Ignore our previous decisions and create a fresh plan.', expectedPolicy({ denyMemoryRead: true })],
      ['Disregard prior context and start from scratch.', expectedPolicy({ denyMemoryRead: true })],
      ['Avoid using memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Refrain from using saved memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['You must not use memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['You cannot use memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Memory access is forbidden. Explain what we decided.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Memory search is not allowed. Explain what we decided.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not look at memory. Explain what we decided.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not query the memory store.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not read the memory database.', expectedPolicy({ denyMemoryRead: true })],
      ['Answer without memory.', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['Answer without any memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Continue with no memory.', expectedPolicy({ denyMemoryRead: true })],
      ['No memory access for this turn.', expectedPolicy({ denyMemoryRead: true })],
      ["You mustn't use memory.", expectedPolicy({ denyMemoryRead: true })],
      ["You shouldn't use memory.", expectedPolicy({ denyMemoryRead: true })],
      ['You can not use memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Memory must not be used.', expectedPolicy({ denyMemoryRead: true })],
      ['Saved memory should not be accessed.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not inspect memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not browse memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not load memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not reference memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not refer to previous conversations.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not pull from memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not fetch from memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Under no circumstances should you use my saved memory.', expectedPolicy({ denyMemoryRead: true })],
      ['You are not permitted to search memory.', expectedPolicy({ denyMemoryRead: true })],
      ['You are not allowed to access memory.', expectedPolicy({ denyMemoryRead: true })],
      ['I do not consent to memory access.', expectedPolicy({ denyMemoryRead: true })],
      ['I do not consent to you searching memory.', expectedPolicy({ denyMemoryRead: true })],
      ['I do not want you to use memory for this answer.', expectedPolicy({ denyMemoryRead: true })],
      ['I would prefer that you not consult previous conversations.', expectedPolicy({ denyMemoryRead: true })],
      ['I revoke permission to use my saved memory.', expectedPolicy({ denyMemoryRead: true })],
      ['I deny permission to use memory.', expectedPolicy({ denyMemoryRead: true })],
      ["I don't give you permission to use saved memory.", expectedPolicy({ denyMemoryRead: true })],
      ['I refuse consent to memory access.', expectedPolicy({ denyMemoryRead: true })],
      ['/marketplace installed - do not use memory', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['/marketplace installed -- do not use memory', expectedPolicy({ denyMemoryRead: true, denyMemoryPersistence: true })],
      ['You lack permission to search memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Memory access is denied for this turn.', expectedPolicy({ denyMemoryRead: true })],
      ['Access to memory is denied.', expectedPolicy({ denyMemoryRead: true })],
      ['Memory access is not permitted.', expectedPolicy({ denyMemoryRead: true })],
      ['Memory store access is denied.', expectedPolicy({ denyMemoryRead: true })],
      ['It is prohibited to search memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Memory is not to be used for this answer.', expectedPolicy({ denyMemoryRead: true })],
      ['Please answer as if you had no saved memory.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not use anything you remember about me for this answer.', expectedPolicy({ denyMemoryRead: true })],
      ['Answer without relying on anything you remember about me.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not use anything from previous chats.', expectedPolicy({ denyMemoryRead: true })],
      ['Forget everything you know about me for this answer.', expectedPolicy({ denyMemoryRead: true })],
      ['Follow this constraint exactly: "Do not search memory." Answer from scratch.', expectedPolicy({ denyMemoryRead: true })],
      ['Follow this constraint exactly: «Do not search memory.» Answer from scratch.', expectedPolicy({ denyMemoryRead: true })],
      ["Follow this constraint exactly: 'Do not search memory.' Answer from scratch.", expectedPolicy({ denyMemoryRead: true })],
      ['Follow this constraint exactly: ‘Do not search memory.’ Answer from scratch.', expectedPolicy({ denyMemoryRead: true })],
      ['Follow this constraint exactly: `Do not search memory.` Answer from scratch.', expectedPolicy({ denyMemoryRead: true })],
      ['Follow this constraint exactly: ‹Do not search memory.› Answer from scratch.', expectedPolicy({ denyMemoryRead: true })],
      ['Do not use working memory from prior sessions.', expectedPolicy({ denyMemoryRead: true })],
    ] as const) {
      const policy = classifyExplicitTurnMutationPolicy(message);
      expect(policy, message).toEqual(expected);
      expect(allowsAutomaticRecall(policy), message).toBe(false);
      expect(allowsConversationHistory(policy), message).toBe(true);
      expect(filterToolsByTurnMutationPolicy(
        ['search_memory', 'save_memory', 'read_file'].map(name => ({ name })),
        policy,
      ).map(tool => tool.name), message).toEqual(['read_file']);
    }
  });

  it('fails closed for opaque external tools while retaining non-memory local reads', () => {
    const policy = classifyExplicitTurnMutationPolicy(
      'Do not use saved memory. Inspect the current workspace and search the web.',
    );
    const tools = [
      'search_memory', 'search_all_workspaces', 'query_knowledge', 'get_identity',
      'get_awareness', 'read_other_workspace', 'save_memory', 'add_task',
      'correct_knowledge', 'read_file', 'web_search', 'mcp_external_read',
      'agent_insights',
    ].map(name => ({ name }));
    const filtered = filterToolsByTurnMutationPolicy(
      tools,
      policy,
      new Set(['mcp_external_read']),
    ).map(tool => tool.name);

    expect(filtered).toEqual(['read_file', 'web_search']);
    expect(resolveTurnPersistencePermissions({
      policy,
      isAutomatedTurn: false,
      personaIsReadOnly: false,
    })).toEqual({
      allowMemoryPersistence: false,
      allowDerivedPersistence: false,
    });
  });

  it('lets a later explicit persisted-memory read override an earlier read prohibition', () => {
    const message = 'Do not search memory; instead, search memory for our approved launch decision.';
    const policy = classifyExplicitTurnMutationPolicy(message);
    expect(policy).toEqual(expectedPolicy());
    expect(allowsAutomaticRecall(policy)).toBe(true);
  });

  it('resolves ordered memory-read directives and ignores quoted or code examples', () => {
    expect(resolveExplicitMemoryReadDirective(
      'Search my memory, but do not use memory.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not use memory, but search my saved memory for launch notes.',
    )).toBe('allow');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory, but please search my saved memory for launch notes.',
    )).toBe('allow');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search the web, use my saved memory instead.',
    )).toBe('allow');
    expect(isExplicitMemoryRecallRequest(
      'Do not search the web, use my saved memory instead.',
    )).toBe(true);
    expect(resolveExplicitMemoryReadDirective(
      'Do not search the web, and do not use my saved memory.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search the web, do not use my saved memory.',
    )).toBe('deny');
    expect(isExplicitMemoryRecallRequest(
      'Do not search the web, do not use my saved memory.',
    )).toBe(false);
    expect(resolveExplicitMemoryReadDirective(
      'Do not search the web — use my saved memory instead.',
    )).toBe('allow');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search the web–use my saved memory instead.',
    )).toBe('allow');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search the web—do not use my saved memory.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Use, when helpful, my saved memory.',
    )).toBe('allow');
    for (const availableMemoryRequest of [
      'Use my saved memory if available.',
      'Use my saved memory when relevant.',
      'Use my saved memory provided that it is available.',
      'Use my saved memory if available and only when relevant.',
      'Use my saved memory if available; then summarize the answer.',
      'Use my saved memory if available. When you answer, be concise.',
      'Use my saved memory if available. If you find nothing, say UNKNOWN.',
      'Use my saved memory if available; if there is no reliable result, reply UNKNOWN.',
      'Use Waggle memory if available: what did I ask you to remember in another session?',
      'Use Waggle memory if available: what exact project codename did I ask you to remember in another session?',
      'Use Waggle memory if available: when did we choose the codename in another session?',
      'Use Waggle memory if available: after which meeting did we choose the codename?',
      'Use Waggle memory if available: when did we approve the budget in another session?',
      'Use Waggle memory if available: after which meeting did we approve the budget?',
      'Use Waggle memory if available: when exactly did we approve the budget in another session?',
      'Use Waggle memory if available: after exactly which meeting did we approve the budget?',
      'Use Waggle memory if available: when, exactly, did we approve the budget?',
      'Use my saved memory if available. When the command finishes, summarize the output.',
      'Use my saved memory if available. If the command fails, report the error.',
      'Use my saved memory if available. After the build command runs, summarize the logs.',
      'Use my saved memory if available. Once the reviewer approves the patch, merge it.',
      'Use my saved memory if available. When file permissions allow it, read config.json.',
      'Use my saved memory if available. When I approve the patch, merge it.',
      'Use my saved memory if available. After I approve the draft, publish it.',
      'Use my saved memory if available. Once the user approves the invoice, send it.',
      'Use my saved memory if available. Once I approve memory.ts, merge it.',
      'Use my saved memory if available. Once I authorize memory.json, publish it.',
      'Use my saved memory if available. Once I permit it.js, ship it.',
      'Use my saved memory if available. Once I enable that.docx, open it.',
      'Use my saved memory if available. When I say go, launch the build.',
      'Use my saved memory if available. Once I sign off on the release, publish it.',
      'Use my saved memory if it might be helpful.',
      'Use my saved memory if you can access it.',
      'Would you mind using my saved memory if available?',
      'Use my saved memory if available. Only on my command, deploy the app.',
      'Use my saved memory if you need it.',
      'Use my saved memory when it would help.',
      'Use my saved memory provided it helps answer accurately.',
      'Use my saved memory if possible.',
      'Use my saved memory if accessible.',
      'Use my saved memory if any exist.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(availableMemoryRequest), availableMemoryRequest).toBe('allow');
      expect(classifyExplicitTurnMutationPolicy(availableMemoryRequest).denyMemoryRead, availableMemoryRequest).toBe(false);
    }
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory, but explain why someone might search memory.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory, but explain how to search memory safely.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory; search memory only after I explicitly approve.',
    )).toBe('deny');
    for (const deferredOverride of [
      'Do not search memory, but search memory, only if I approve.',
      'Do not search memory, but search memory (only if I approve).',
      'Do not search memory, but search memory unless I approve.',
      'Do not search memory, but search memory later.',
      'Do not use memory, but use memory provided that I ask later.',
      'Do not use memory, but use memory as soon as I explicitly ask later.',
      'Use my saved memory if available and only if I approve.',
      'Use my saved memory when relevant, but only after I explicitly approve.',
      'Use my saved memory if available, but only after I consent.',
      'Use my saved memory when relevant, but only with my permission.',
      'Use my saved memory if available, but only after I give permission.',
      'Use my saved memory if available, but only once permission is granted.',
      'Use my saved memory if available, but only after I opt in.',
      'Use my saved memory if available, but only when I say yes.',
      'Use my saved memory if available, provided I later agree.',
      'Use my saved memory if available, but only after explicit permission is granted.',
      'Use my saved memory if available; only after I approve.',
      'Use my saved memory if available. Only after I approve.',
      'Use my saved memory if available, but only after I allow it.',
      'Use my saved memory if available, but only after I confirm.',
      'Use my saved memory if available, but only after I enable memory access.',
      'Use my saved memory if available, but only after the user consents.',
      'Use my saved memory if available, but only after my go-ahead.',
      'Use my saved memory if available, but only after I grant access.',
      'Use my saved memory if available, but only after I have reviewed the summary and explicitly consent.',
      'Use my saved memory if available, but wait until I approve.',
      'Use my saved memory if available, but only use it after I approve.',
      'Use my saved memory if available; do not access it until I approve.',
      'Use my saved memory if available; wait for my approval before using it.',
      'Use my saved memory if available, subject to my approval.',
      'Use my saved memory if available, pending my approval.',
      'Use my saved memory if available, contingent on my permission.',
      'Use my saved memory if available, but not before I approve.',
      'Use my saved memory if available, but defer using it until I approve.',
      'Use my saved memory if available, but not without my permission.',
      'Use my saved memory if available, but use it solely after I approve.',
      'Use my saved memory if available, but ask me first.',
      'Use my saved memory if available, but get my approval first.',
      'Use my saved memory if available, but check with me first.',
      'Use my saved memory if available, but only on my command.',
      'Use my saved memory if available, but only after you ask me.',
      'Use my saved memory if available, but only if I tell you to.',
      'Use my saved memory if available, but only after I say so.',
      'Use my saved memory if available, but first ask me.',
      'Use my saved memory if available, but ask me before using it.',
      'Use my saved memory if available, but get my approval before using it.',
      'Use my saved memory if available, but please ask me first.',
      'Use my saved memory if available, but could you ask me first.',
      'Use my saved memory if available, but could you please ask me first.',
      'Use my saved memory if available, but you must ask me first.',
      'Use my saved memory if available, but wait for me to approve first.',
      'Use my saved memory if available, but wait until I give you the go-ahead.',
      'Use my saved memory if available, but only after I approve it.',
      'Use my saved memory if available, but only after I consent to it.',
      'Use my saved memory if available, but only after I authorize it.',
      'Use my saved memory if available, but only after I permit it.',
      'Use my saved memory if available, but only after I approve memory access.',
      'Use my saved memory if available, but only after I approve its use.',
      'Use my saved memory if available, but only after I approve using it.',
      'Use my saved memory if available, but only after I give you permission.',
      'Use my saved memory if available, but only after I grant you permission.',
      'Use my saved memory if available, but only after I give approval for memory use.',
      'Use my saved memory if available, but only after I grant permission to use it.',
      'Use my saved memory if available, but only after I provide consent.',
      'Use my saved memory if available, but only after I authorize access.',
      'Use my saved memory if available, but only once permission from me is granted.',
      'Use my saved memory if available, but only after I have approved it.',
      "Use my saved memory if available, but only after I've approved it.",
      'Use my saved memory if available, but only after I say go.',
      'Use my saved memory if available, but wait until I tell you it is okay.',
      'Use my saved memory if available, but not unless I approve it.',
      'Use my saved memory if available, but do not proceed with memory until I approve it.',
      'Use my saved memory if available, but only after I tell you to proceed.',
      'Use my saved memory if available, but only after I give consent to you.',
      'Use my saved memory if available, but only after I give permission to you.',
      'Use my saved memory if available, but only after permission from me.',
      'Use my saved memory if available, but only after I sign off.',
      'Use my saved memory if available, but only after I sign off on it.',
      'Use my saved memory if available. First, ask me.',
      'Use my saved memory if available. Do not use it unless I approve.',
      'Use my saved memory if available. Before using it, ask me.',
      'Use my saved memory if available. Before you use it, ask me.',
      'Use my saved memory if available. Ask for my permission first.',
      'Use my saved memory if available. Obtain my approval first.',
      'Use my saved memory if available. Seek my consent first.',
      'Use my saved memory if available. Do not use it without my approval.',
      'Use my saved memory if available. Never use it before I consent.',
      'Use my saved memory if available. Wait for me to say it is okay.',
      'Use my saved memory if available. Use it only after I grant you access.',
      'Use my saved memory if available. Use it only after I say it is okay.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(deferredOverride), deferredOverride).toBe('deny');
    }
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory; search memory is the action you must avoid.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory.\n~~~text\nbut search memory for launch notes\n~~~',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory. Explain ``but search memory for launch notes``.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory.\n    but search memory for launch notes',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory.\n> ~~~text\n> but search memory for launch notes\n> ~~~',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Do not search memory. Explain «but search memory for launch notes».',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'Explain "Do not use memory." and `search my memory`.',
    )).toBe('unspecified');
    expect(resolveExplicitMemoryReadDirective(
      'Explain this example:\n```text\nDo not search memory.\n```',
    )).toBe('unspecified');
    for (const technicalConstraint of [
      'Do not use memory-intensive algorithms.',
      'Do not use an in-memory database.',
      'Explain the memory usage and memory leak.',
      'Do not use shared memory; use message passing.',
      'Do not read memory pressure metrics.',
      'Do not use memory foam in this prototype.',
      'Do not use virtual memory for this benchmark.',
      'Avoid memory bandwidth bottlenecks.',
      'Benchmark the memory database architecture.',
      'Compare memory store benchmarks.',
      'Search prior history of SQLite.',
      'Use current primary sources to compare SQLite vector search with PostgreSQL plus pgvector for a single-user desktop AI memory store.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(technicalConstraint), technicalConstraint)
        .toBe('unspecified');
      expect(classifyExplicitTurnMutationPolicy(technicalConstraint), technicalConstraint)
        .toEqual(expectedPolicy());
    }
  });

  it('does not broaden unrelated object-scoped or quoted constraints', () => {
    for (const message of [
      'Do not create a calendar event; remember this preference.',
      'Explain why the phrase "do not create or edit anything" is ambiguous.',
      'Explain "Do not search memory." Then explain what we decided.',
      'Explain `Do not search memory.` Then explain what we decided.',
      'Do not hesitate to use my saved memory.',
      'Do not search the web, use my saved memory instead.',
      'The documentation says:\n> Do not use saved history.\nNow answer normally.',
      'Compare agents with and without conversation history.',
      'Write a design for a chatbot without conversation history.',
      'Write a design for a chatbot without using conversation history.',
      'Compare agents that ignore conversation history by design.',
      'Do not use browser history in this session; inspect the page DOM only.',
      'Do not use Git history in this conversation; inspect the working tree only.',
      'Do not use SQL history in this chat; inspect the current query only.',
      'Do not use PowerShell command-line history in this session.',
      'Do not use database migration history in this session.',
      'Do not use deployment history in this conversation.',
      'Do not use test execution history in this session.',
      'Do not use package installation history in this conversation.',
      'Do not use API request history in this session.',
      'Does the policy mean you must not use conversation history?',
      'Explain why the policy says agents must not use conversation history.',
      'Explain whether access to conversation history is denied.',
      'Tell me whether conversation history is not to be used by default.',
      'Explain what it means when conversation history access is forbidden.',
      'Does saying I withdraw consent to use conversation history revoke it?',
      'Draft a sentence saying I withdraw consent to use conversation history.',
      'Explain what it means to withhold consent to use conversation history.',
      'Explain why authorization to use conversation history is denied.',
      'Explain what it means not to give consent for use of conversation history.',
      '/research Explain why agents must not use conversation history.',
      '/research Explain the phrase do not use conversation history.',
      '/research Explain why users do not use conversation history.',
      'Do not use user login history in this session.',
      'Do not use billing transaction history in this conversation.',
      'Do not use document revision history in this session.',
      'Do not use agent run history in this conversation.',
      'Conversation history must not be used. However, use conversation history now.',
      'Do not use conversation history. However, use it now.',
      'Do not use conversation history. Actually, use it now.',
      'Follow this constraint exactly: «Do not use conversation history.» Then use it.',
      'Do not use conversation history. Yet use it now.',
      'Do not use conversation history. I changed my mind: use it now.',
      'Do not use conversation history. No, use it now.',
      'Do not use conversation history. Wait, use it now.',
      'Do not use conversation history. Hold on, use it now.',
      'Do not use conversation history. Never mind, use it now.',
      'Do not use conversation history. Strike that, use it now.',
      'Do not use conversation history. Change of plan: use it now.',
      'Do not use conversation history. New rule: «Use it.»',
      'Do not use conversation history. Treat this as an instruction: «Use it.»',
      'Do not use conversation history. Apply this rule: «Use it.»',
      'Apply this rule: «Do not use conversation history.» Then apply this rule: «Use it.»',
      'Do not use conversation history. I take that back; use it now.',
      'Do not use conversation history. Rather, use it now.',
      'Do not use conversation history. Forget that; use it.',
      'Do not use conversation history—actually, use it now.',
      'Do not use conversation history. Correction: use it now.',
      'Do not use conversation history. Use conversation history now.',
      'This is the new rule we are discussing: «Do not use conversation history.»',
      'Compare the new rule: «Do not use conversation history.» with the old one.',
      '/research explain why users say do not use conversation history',
      '/research draft wording: do not use conversation history',
      'Discuss the sentence: do not use conversation history.',
      'The phrase do not use conversation history is ambiguous.',
      'Translate: «Do not use conversation history.»',
      'Translate into French: do not use conversation history.',
      'Explain why we should follow this rule: «Do not use conversation history.»',
      'Explain the policy: conversation history must be excluded.',
      'Explain the rule: do not use conversation history.',
      'Example: do not use conversation history.',
    ]) {
      expect(classifyExplicitTurnMutationPolicy(message), message).toEqual(expectedPolicy());
    }
  });

  it('does not promote descriptive memory-policy text into an explicit recall request', () => {
    for (const message of [
      '/research Explain the phrase do not use conversation history.',
      '/research Explain why users do not use conversation history.',
      'ONYX Explain the phrase do not use conversation history.',
      'Explain why users should not use conversation history.',
      'Draft this sentence: I never gave consent to use conversation history.',
      'Draft this sentence: There is no consent to use conversation history.',
      'Quote this statement: You lack my consent to use conversation history.',
      'This is the new rule we are discussing: «Do not use conversation history.»',
      'Compare the new rule: «Do not use conversation history.» with the old one.',
      '/research explain why users say do not use conversation history',
      '/research draft wording: do not use conversation history',
      'Discuss the sentence: do not use conversation history.',
      'The phrase do not use conversation history is ambiguous.',
      'Translate: «Do not use conversation history.»',
      'Translate into French: do not use conversation history.',
      'Explain why we should follow this rule: «Do not use conversation history.»',
      'Explain the policy: conversation history must be excluded.',
      'Explain the rule: do not use conversation history.',
      'Example: do not use conversation history.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(message), message).toBe('unspecified');
      expect(isExplicitMemoryRecallRequest(message), message).toBe(false);
    }
  });

  it('does not treat attributed unquoted policy text as the user\'s own directive', () => {
    for (const message of [
      'Alice said: do not use conversation history. Explain her statement.',
      'Alice said: do not use saved memory. Explain her statement.',
      'Alice said — search my saved memory for the codename. Explain her request.',
      'Alice said, use my saved memory if available.',
      'The report states: memory access is denied. Summarize the report.',
      'According to Alice: what did I ask you to remember in another session? Explain that.',
      "Alice's request: use my saved memory if available. Critique it.",
    ]) {
      expect(resolveExplicitMemoryReadDirective(message), message).toBe('unspecified');
      expect(isExplicitMemoryRecallRequest(message), message).toBe(false);
      expect(classifyExplicitTurnMutationPolicy(message), message).toEqual(expectedPolicy());
    }
    expect(resolveExplicitMemoryReadDirective(
      'I said: do not use saved memory.',
    )).toBe('deny');
    expect(resolveExplicitMemoryReadDirective(
      'The policy: do not use conversation history.',
    )).toBe('deny');
  });

  it('preserves a direct user denial after an attributed unquoted clause', () => {
    for (const message of [
      'Alice said: do not use conversation history, but I say: do not use saved memory.',
      'Alice said: do not use conversation history, but I insist: do not use saved memory.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(message), message).toBe('deny');
    }

    for (const message of [
      'The report states: memory access is denied, but my instruction is: do not use conversation history.',
      'The report states: memory access is denied, but my explicit instruction is: do not use conversation history.',
    ]) {
      expect(classifyExplicitTurnMutationPolicy(message).denyConversationHistory, message).toBe(true);
    }
  });

  it('treats explicit double-negations as persisted-memory read permission', () => {
    for (const message of [
      'Do not ignore memory.',
      'Do not disregard previous decisions.',
      'Never ignore my saved memory.',
      'Do not ever ignore my saved memory.',
      'Do not ignore conversation history.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(message), message).toBe('allow');
      expect(classifyExplicitTurnMutationPolicy(message), message).toEqual(expectedPolicy());
    }
  });

  it('keeps persisted-memory and conversation-history directives independent in both orders', () => {
    const memoryDeniedHistoryAllowed = classifyExplicitTurnMutationPolicy(
      'Do not use my saved memory; use conversation history.',
    );
    expect(memoryDeniedHistoryAllowed).toEqual(expectedPolicy({
      denyMemoryRead: true,
      denyMemoryPersistence: true,
    }));
    expect(allowsConversationHistory(memoryDeniedHistoryAllowed)).toBe(true);

    const historyDeniedMemoryAllowed = classifyExplicitTurnMutationPolicy(
      'Do not use conversation history; use my saved memory.',
    );
    expect(historyDeniedMemoryAllowed).toEqual(expectedPolicy({
      denyConversationHistory: true,
      denyMemoryPersistence: true,
    }));
    expect(allowsAutomaticRecall(historyDeniedMemoryAllowed)).toBe(true);
    expect(allowsConversationHistory(historyDeniedMemoryAllowed)).toBe(false);

    expect(classifyExplicitTurnMutationPolicy(
      'Use my saved memory. Actually, do not.',
    )).toEqual(expectedPolicy({
      denyMemoryRead: true,
    }));
    expect(classifyExplicitTurnMutationPolicy(
      'Use conversation history. Actually, do not.',
    )).toEqual(expectedPolicy({
      denyConversationHistory: true,
      denyMemoryPersistence: true,
    }));
  });

  it('keeps saved session history out only when that history is explicitly denied', () => {
    const genericMemoryOptOut = classifyExplicitTurnMutationPolicy(
      'Continue from this conversation without consulting my saved memories.',
    );
    expect(allowsConversationHistory(genericMemoryOptOut)).toBe(true);

    const savedHistoryOptOut = classifyExplicitTurnMutationPolicy(
      'Do not use saved history. Answer from scratch.',
    );
    expect(savedHistoryOptOut.denyMemoryRead).toBe(false);
    expect(allowsConversationHistory(savedHistoryOptOut)).toBe(false);

    for (const priorChatOptOut of [
      'Do not use prior history of this chat.',
      'Do not use previous history of this conversation.',
      'Do not use earlier history of the session.',
      "Do not use this chat's prior history.",
      "Do not use this conversation's previous history.",
      "Do not use the session's earlier history.",
      'Do not use the prior history from this chat.',
      'Do not use prior chat history.',
      'Do not use history from earlier in this chat.',
      'Do not use the history in this conversation.',
      'Do not use anything said earlier in this chat.',
      'Answer without the conversation so far.',
      'Start fresh without prior messages in this chat.',
      'Ignore the conversation so far and answer fresh.',
      'Disregard anything said earlier in this chat.',
      'Do not rely on the conversation so far.',
      'Never search prior messages in this chat.',
      'Do not draw from anything said earlier in this chat.',
      'Access to conversation history is denied for this turn.',
      'Conversation history must not be used for this answer.',
      'Policy: do not use conversation history.',
      'Rule: do not use conversation history.',
      'I revoke permission to use conversation history.',
      'I deny permission to use prior messages in this chat.',
      'I refuse consent to using conversation history.',
      'I do not consent to using conversation history.',
      'Conversation history access is forbidden for this turn.',
      'It is forbidden to use conversation history for this answer.',
      'Avoid using conversation history for this answer.',
      'Refrain from using conversation history for this answer.',
      'Use no conversation history for this answer.',
      'I do not want you to use conversation history for this answer.',
      'I would prefer that you not consult prior messages in this chat.',
      'With no conversation history, answer from scratch.',
      'No conversation history access for this turn.',
      'Answer as if you had no conversation history.',
      'Use conversation history. However, conversation history must not be used.',
      'I withdraw consent to use conversation history.',
      'Consent to use conversation history is withdrawn.',
      'Permission to use conversation history is revoked.',
      'You do not have permission to use conversation history.',
      'No access to conversation history for this turn.',
      'Conversation history cannot be used for this answer.',
      'Do not take previous messages in this chat into account.',
      'Answer independently of previous turns.',
      'Use conversation history. However, do not use it.',
      'Use conversation history. Actually, do not use it.',
      'Use conversation history. On second thought, do not use it.',
      'TOPAZ Do not use saved history.',
      'I withdraw my consent for you to use conversation history.',
      'I no longer consent to use conversation history.',
      'I withdraw authorization to use conversation history.',
      'I revoke authorization to use conversation history.',
      'I decline consent to use conversation history.',
      'I opt out of using conversation history.',
      'Consent to use conversation history has been revoked.',
      'Permission to use conversation history has been withdrawn.',
      'You are no longer authorized to use conversation history.',
      'I do not authorize you to use conversation history.',
      'I do not permit you to use conversation history.',
      'You do not have my consent to use conversation history.',
      'I have not authorized you to use conversation history.',
      'I cancel my consent to use conversation history.',
      'I remove permission to use conversation history.',
      'I disallow use of conversation history.',
      'I prohibit you from using conversation history.',
      'I forbid you to use conversation history.',
      'Do not use prior context from this chat.',
      'Do not use the transcript of this conversation.',
      'Do not use what we covered earlier in this chat.',
      'I hereby withdraw consent for use of conversation history.',
      'I withdraw consent to your use of conversation history.',
      'I withhold consent to use conversation history.',
      'I withhold authorization to use conversation history.',
      'I deny consent to use conversation history.',
      'I object to the use of conversation history.',
      'I refuse permission to use conversation history.',
      'I refuse authorization to use conversation history.',
      'Authorization to use conversation history is denied.',
      'I withdraw consent for access to conversation history.',
      'I no longer authorize you to use conversation history.',
      'I no longer permit you to use conversation history.',
      'You have no permission to use conversation history.',
      'You have no authorization to use conversation history.',
      'Do not use the chat transcript so far.',
      'Do not use the conversation transcript so far.',
      'Do not use transcripts from this conversation.',
      'Do not use the preceding messages in this chat.',
      'Do not use the preceding turns in this session.',
      'Do not use the preceding exchanges in this conversation.',
      'Do not use the messages earlier in this chat.',
      'Do not use turns from earlier in this session.',
      'Do not use the exchanges before in this conversation.',
      'Do not use the chat log.',
      "Do not use this conversation's transcript.",
      'Do not use our discussion so far.',
      'Do not use this thread so far.',
      'Do not use what we mentioned earlier in this chat.',
      'Do not use what we talked about earlier in this chat.',
      'Do not use above messages.',
      'Use conversation history. Yet do not use it.',
      'Use conversation history. Nevertheless, do not use it.',
      'Use conversation history. Correction: do not use it.',
      'Use conversation history. Scratch that; do not use it.',
      'AB Do not use conversation history.',
      'Use conversation history. Follow this constraint exactly: «Do not use it.»',
      'Follow this constraint exactly: "Do not use conversation history." Answer from scratch.',
      'Follow this rule: "Do not use conversation history."',
      'Follow this policy: "Do not use conversation history."',
      'Obey this rule: "Do not use conversation history."',
      'Apply this rule: "Do not use conversation history."',
      'Enforce this policy: "Do not use conversation history."',
      'Obey this instruction: `Do not use saved history.` Then answer.',
      '/research ATLAS Do not use saved history.',
      'Exclude conversation history from this answer.',
      'Keep conversation history out of this answer.',
      'Omit prior messages from this chat.',
      'Do not consider prior messages in this chat.',
      'Use conversation history; however exclude it from this answer.',
      'Use conversation history, except do not use it for this answer.',
      'Use conversation history, but ignore it for this response.',
      'Leave prior chat messages out of the answer.',
      'I do not give consent for use of conversation history.',
      'I never gave you consent to use conversation history.',
      'Set aside the conversation so far.',
      'Do not take earlier turns into consideration.',
      'Do not factor in previous messages.',
      'Use conversation history. No, do not use it.',
      'Use conversation history. Wait, do not use it.',
      'Use conversation history. Ignore that; do not use it.',
      'Use conversation history. Change of plan: do not use it.',
      'I did not give you consent to use conversation history.',
      "I haven't given you permission to access conversation history.",
      'Consent to use conversation history was never given.',
      'No consent was granted to use conversation history.',
      'Authorization to use conversation history was never granted.',
      'You were never authorized to use conversation history.',
      'I have never consented to use conversation history.',
      'There is no consent to use conversation history.',
      'Consent for using conversation history has never been provided.',
      'You lack my consent to use conversation history.',
      'Put aside the conversation so far.',
      "Don't base your answer on previous messages.",
      'Do not use the messages above.',
      'Use conversation history. Hold on, do not use it.',
      'Use conversation history. Never mind, do not use it.',
      'Use conversation history. Strike that, do not use it.',
      'Use conversation history. Scratch that. Answer without it.',
      'Use conversation history. New rule: «Do not use it.»',
      'Use conversation history. Treat this as an instruction: «Do not use it.»',
      '/research ATLAS please do not use saved history',
      '/research --mode deep ATLAS Do not use saved history',
      '/research ATLAS Keep prior messages out of this answer',
      'Authorization to access conversation history was withheld.',
      'The prior messages are to be excluded from this answer.',
      'Previous turns must be omitted from this answer.',
      'Prior messages should be kept out of this answer.',
      'For this answer, do not use conversation history.',
      'For now, do not use conversation history.',
      'On this turn, do not use conversation history.',
      'If possible, do not use conversation history.',
      'Unless I explicitly approve it, do not use conversation history.',
      'Until I explicitly approve, do not use conversation history.',
      'Use conversation history only if I explicitly approve.',
      'Only use conversation history after I approve.',
      'Use conversation history. I take that back; do not use it.',
      'Use conversation history. Disregard that; do not use it.',
      'Use conversation history. Rather, do not use it.',
      '/research quantum computing please do not use saved history',
      '/research quantum computing -- do not use saved history',
      '/investigate AI safety do not use conversation history',
      '/draft executive memo please do not use saved history',
      'At this time, do not use conversation history.',
      'For this task, do not use conversation history.',
      'In this response, do not consult saved history.',
      'Use conversation history provided I explicitly approve it.',
      'Unless and until I approve, do not use conversation history.',
      'Use conversation history only upon my explicit approval.',
      'Only use conversation history with my explicit approval.',
      'Conversation history is to remain excluded from this answer.',
      'Previous turns shall be omitted from this answer.',
      'Prior messages are excluded from this answer.',
      'Keep previous turns outside this answer.',
      'I have not provided consent for you to use conversation history.',
      'No authorization exists for access to conversation history.',
      'Permission to access conversation history is absent.',
      'You are without my authorization to access conversation history.',
      'Use conversation history. Cancel that request and answer without it.',
      'Use conversation history; correction—do not use it.',
      '/research write a report and please do not use conversation history',
      '/research draft an outline please do not use saved history',
      '/research compare options but do not use conversation history',
      '/research quote sources but do not use conversation history',
      '/investigate describe the issue but do not use prior messages',
      'Answer without reference to prior messages.',
      'Please do not use prior conversation context.',
      'Do not carry context forward from earlier turns.',
      'Do not incorporate anything from previous messages.',
      'For this answer do not use conversation history.',
      'Please, do not use conversation history.',
      'Can you please not use conversation history.',
      '/research Explain quantum computing please do not use saved history',
      'I never authorized you to use conversation history.',
      'Use conversation history. I retract that; do not use it.',
    ]) {
      expect(resolveExplicitMemoryReadDirective(priorChatOptOut), priorChatOptOut).toBe('deny');
      expect(classifyExplicitTurnMutationPolicy(priorChatOptOut), priorChatOptOut).toEqual(
        expectedPolicy({ denyConversationHistory: true, denyMemoryPersistence: true }),
      );
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
    for (const prompt of [
      'Design a complete ETL in Python with all imports. Do not write files or execute code.',
      'Design a complete ETL using Python with all imports. Do not write files or execute code.',
      'Provide a complete runnable example in Python with all imports. Do not write files or execute code.',
      'Draft a response in Serbian. Do not write files or launch agents.',
      'Outline a plan from first principles. Do not edit files or launch agents.',
      'Write a concise plan in the response. Do not write files or execute code.',
      'Generate a runnable Node.js script with all imports. Do not write files or execute code.',
      'Design a React.js component. Do not write files or execute code.',
      'Explain node.js module resolution. Do not write files or execute code.',
      'Explain "Node.js" module resolution. Do not write files or execute code.',
      'Prepare a summary using Serbian. Do not write files or execute code.',
      'Prepare a summary using Markdown. Do not write files or execute code.',
      'Explain why external sources can be unreliable. Do not write files or execute code.',
      'Design a policy for evaluating external sources. Do not write files or execute code.',
      'Explain what a Jira issue is. Do not write files or execute code.',
      'Design a generic Jira issue template. Do not write files or execute code.',
      'Design a GitHub project structure from first principles. Do not write files or execute code.',
      'Explain the tradeoffs of using external sources. Do not write files or execute code.',
      'Explain why decisions based on external evidence can be risky. Do not write files or execute code.',
      'Compare "Vue.js" and "React.js" architectures. Do not write files or execute code.',
      'Explain Node.js file system APIs. Do not write files or execute code.',
      'Explain how to summarize external sources. Do not write files or execute code.',
      'Explain how to review a Jira issue. Do not write files or execute code.',
    ]) {
      expect(isExplicitToolFreeAdvisoryRequest(
        prompt,
        classifyExplicitTurnMutationPolicy(prompt),
      ), prompt).toBe(true);
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
      'Prepare a summary using Acme CRM. Do not write files or execute code.',
      'Prepare a summary from Acme records. Do not write files or execute code.',
      'Prepare a summary using Workday. Do not write files or execute code.',
      'Prepare a summary using SAP. Do not write files or execute code.',
      'Summarize Jira issue. Do not write files or launch agents.',
      'Prepare a summary from external sources. Do not write files or launch agents.',
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
      'Review my calendar. Do not write files or launch agents.',
      'Summarize the current Jira issue. Do not write files or launch agents.',
      'Check git status. Do not write files or execute code.',
      'Summarize git status. Do not write files or execute code.',
      'Explain git diff. Do not write files or execute code.',
      'Continue and summarize the above. Do not write files or execute code.',
      'Outline the review. Do not edit files or launch agents: inspect this workspace first.',
      'Design the migration. Do not write files or execute code, yet search my saved memory.',
      'Now outline this plan. Do not edit files or launch agents.',
      'Outline the plan we discussed. Do not edit files or launch agents.',
      'Outline the plan from before. Do not edit files or launch agents.',
      'Summarize the current Salesforce account. Do not write files or execute code.',
      'Summarize the current HubSpot deal. Do not write files or execute code.',
      'Summarize the current GitHub pull request. Do not write files or execute code.',
      'Summarize the current Airtable base. Do not write files or execute code.',
      'Design a plan and once done create a Jira ticket. Do not write files or launch agents.',
      'Summarize Dockerfile. Do not write files or execute code.',
      'Summarize "Makefile". Do not write files or execute code.',
      'Explain .gitignore. Do not write files or execute code.',
      'Summarize the contents of "node.js". Do not write files or execute code.',
      'Summarize the contents of react.js. Do not write files or execute code.',
      'Summarize current Jira tickets. Do not write files or execute code.',
      'Summarize the open Linear tasks. Do not write files or execute code.',
      'Summarize current Salesforce accounts. Do not write files or execute code.',
      'Summarize current HubSpot deals. Do not write files or execute code.',
      'Summarize current Airtable records. Do not write files or execute code.',
      'Summarize current GitHub pull requests. Do not write files or execute code.',
      'Explain the file "node.js". Do not write files or execute code.',
      'Explain "node.js" file contents. Do not write files or execute code.',
      'Explain Node.js, then summarize package.json. Do not write files or execute code.',
      'Compare "Node.js" runtimes, then summarize "config.json". Do not write files or execute code.',
      'Read package.json and explain Node.js. Do not write files or execute code.',
      'Explain Node.js using package.json. Do not write files or execute code.',
      'Summarize external sources. Do not write files or launch agents.',
      'Design a recommendation based on web data. Do not write files or execute code.',
    ]) {
      expect(isExplicitToolFreeAdvisoryRequest(
        prompt,
        classifyExplicitTurnMutationPolicy(prompt),
      ), prompt).toBe(false);
    }
  });

  it('caps advisory output from answer-length intent rather than unrelated adjectives', () => {
    expect(selectAdvisoryMaxOutputTokens(canonicalPrompt('data-engineer'))).toBe(4_500);
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
      'Explain why complete Python examples should include all imports.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Give a concise answer that includes a complete Python example with all imports.',
    )).toBe(2_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a concise answer with a complete Python example and all imports.',
    )).toBe(2_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports in exactly 1200 tokens.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Design a complete Python example with all imports, exactly 1200 tokens.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports in exactly 800 words.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Rust example with all imports.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a runnable Go implementation with all imports.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete runnable example in Python with all imports.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Generate a runnable Node.js script with all imports.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Show a syntactically valid C# program with all required imports.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports in exactly 1200 tokens. Do not write files or execute code.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports, limited to 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports, no more than 700 words.',
    )).toBe(1_050);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports in exactly 5 tokens.',
    )).toBe(256);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports in exactly 100000 tokens.',
    )).toBe(12_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Give a concise answer with a complete Python example in exactly 1200 tokens.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete implementation plan.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example that does not need to be complete.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a runnable Python script that writes at most 512 tokens to its response buffer.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example for analyzing a 5000-word report.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports, not limited to 1200 tokens.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports, not capped at 900 tokens.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example that does not need to include all imports.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example that does not need all imports.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example, not a complete one.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example without all imports.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example without including all imports.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a non-runnable Python example.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a Python example that is not fully runnable.',
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      "Provide a Python example that needn't be complete.",
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      "Provide a Python example that needn't include all imports.",
    )).toBe(3_000);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports and a 1200-token limit.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example in exactly 1200 tokens, please.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example in at most 900 tokens, including comments.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example in exactly 1200 tokens, if possible.',
    )).toBe(1_200);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example in at most 900 tokens, including type annotations.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example no longer than 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports and a 512-token limit in its response buffer.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports and a 512-token limit per request.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports and a 512-token limit for every generated chunk.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a complete Python script that summarizes each report in exactly 1200 words.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Build a complete Python program that returns output in exactly 1200 tokens.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example for a model response buffer capped at 512 tokens.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example under 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example using at most 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with all imports no more than 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example. Keep the answer under 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example with a maximum of 900 tokens.',
    )).toBe(900);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a runnable Python example using at most 512 tokens of model context per request.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example under 512 tokens of context for each chunk.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a runnable Python script with all imports, no more than 512 tokens in its response buffer.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a runnable Python example using at most 512 tokens of prompt context per request.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a runnable Python example using at most 512 tokens in the context window.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example under 512 tokens per chunk.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a runnable Python script with all imports, no more than 512 tokens in each API response.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Write a runnable Python script with all imports, no more than 512 tokens for every response.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example under 512 tokens or fewer per request.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example under 512 tokens in total per request.',
    )).toBe(4_500);
    expect(selectAdvisoryMaxOutputTokens(
      'Provide a complete Python example under 900 tokens; include tests.',
    )).toBe(900);
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

  it('keeps maximum-size directive classification within a bounded latency', () => {
    const filler = 'x'.repeat(49_800);
    const messages = [
      `${filler}\nDo not use conversation history.`,
      `${filler}\nApply this rule: «Do not use saved memory.»`,
      `${filler}\nDo not use conversation history — actually, use it.`,
    ];
    primeMemoryDirectiveClassifier();
    const startedAt = performance.now();
    const policies = messages.map(message => classifyExplicitTurnMutationPolicy(message));
    const elapsedMs = performance.now() - startedAt;

    expect(policies[0]?.denyConversationHistory).toBe(true);
    expect(policies[1]?.denyMemoryRead).toBe(true);
    expect(policies[2]?.denyConversationHistory).toBe(false);
    expect(elapsedMs).toBeLessThan(1_000);

    const attributedTranscript = Array.from(
      { length: 200 },
      (_, index) => `alice said: search my saved memory for attributed item ${index} ${'x'.repeat(180)}`,
    ).join('\n');
    expect(actionableMemoryDirectiveText(attributedTranscript).length).toBeLessThan(1_000);
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
