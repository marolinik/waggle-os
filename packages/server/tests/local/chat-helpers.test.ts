/**
 * Chat Helpers & Chat Context — Pure Function Tests
 *
 * Covers:
 *   chat-helpers.ts: isRegulatedContent, isRetryableError, shouldSuggestSchedule, describeToolUse
 *   chat-context.ts: summarizeDroppedContext
 */

import { describe, it, expect } from 'vitest';
import {
  isRegulatedContent,
  isRetryableError,
  shouldSuggestSchedule,
  describeToolUse,
} from '../../src/local/routes/chat-helpers.js';
import { summarizeDroppedContext } from '../../src/local/routes/chat-context.js';

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

describe('shouldSuggestSchedule', () => {
  // ── Positive: recurring patterns in text, no scheduling tools ─────

  it('returns true when response mentions "every day" and no schedule tool used', () => {
    expect(shouldSuggestSchedule('I can check this every day for you.', [])).toBe(true);
  });

  it('returns true for "daily" pattern', () => {
    expect(shouldSuggestSchedule('This task runs daily.', [])).toBe(true);
  });

  it('returns true for "weekly" pattern', () => {
    expect(shouldSuggestSchedule('I recommend a weekly review.', [])).toBe(true);
  });

  it('returns true for "every week" pattern', () => {
    expect(shouldSuggestSchedule('Let me do this every week.', [])).toBe(true);
  });

  it('returns true for "each morning" pattern', () => {
    expect(shouldSuggestSchedule('We can run reports each morning.', [])).toBe(true);
  });

  it('returns true for "every morning" pattern', () => {
    expect(shouldSuggestSchedule('I will check every morning.', [])).toBe(true);
  });

  it('returns true for "regularly" pattern', () => {
    expect(shouldSuggestSchedule('This should be done regularly.', [])).toBe(true);
  });

  it('returns true for "recurring" pattern', () => {
    expect(shouldSuggestSchedule('This is a recurring task.', [])).toBe(true);
  });

  it('returns true for "scheduled" pattern', () => {
    expect(shouldSuggestSchedule('The meeting is already scheduled for then.', [])).toBe(true);
  });

  it('returns true for "every month" pattern', () => {
    expect(shouldSuggestSchedule('We generate reports every month.', [])).toBe(true);
  });

  it('returns true for "monthly" pattern', () => {
    expect(shouldSuggestSchedule('The monthly review is due.', [])).toBe(true);
  });

  // ── Negative: scheduling tool already used ────────────────────────

  it('returns false when a schedule tool was already used', () => {
    expect(shouldSuggestSchedule('Run this daily.', ['schedule_task'])).toBe(false);
  });

  it('returns false when a cron tool was already used', () => {
    expect(shouldSuggestSchedule('This runs every week.', ['create_cron'])).toBe(false);
  });

  it('returns false when tool name contains "schedule" anywhere', () => {
    expect(shouldSuggestSchedule('Do this weekly.', ['my_schedule_helper'])).toBe(false);
  });

  // ── Negative: no recurring patterns ───────────────────────────────

  it('returns false when response has no recurring patterns', () => {
    expect(shouldSuggestSchedule('Here is the report you asked for.', [])).toBe(false);
  });

  it('returns false for empty response text', () => {
    expect(shouldSuggestSchedule('', [])).toBe(false);
  });

  // ── Case insensitivity ────────────────────────────────────────────

  it('matches patterns case-insensitively', () => {
    expect(shouldSuggestSchedule('Run DAILY checks.', [])).toBe(true);
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
