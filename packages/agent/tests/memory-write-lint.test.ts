import { describe, it, expect } from 'vitest';
import { lintMemoryWrite } from '../src/memory-write-lint.js';

describe('memory-write-lint', () => {
  // ── Capability-failure symptoms MUST be caught ───────────────
  describe('capability_symptom (blocked)', () => {
    const symptoms: string[] = [
      'The Slack connector failed to authenticate.',
      'GitHub integration is broken.',
      'The web search tool keeps timing out.',
      'The Notion MCP server is unavailable.',
      'The email connector does not work.',
      "Can't connect to the Jira API.",
      'The calendar skill returns an error when I try to book.',
      'The PDF export tool failed again today.',
      'The database connector is not available right now.',
      'The Playwright browser tool cannot launch on this machine.',
      'Failed to connect to Salesforce.',
      "The Stripe integration isn't working.",
      // Bare "is down" still fires — only "down for maintenance" is exempt.
      'The Notion MCP server is down right now.',
    ];

    for (const content of symptoms) {
      it(`flags: "${content}"`, () => {
        const result = lintMemoryWrite(content);
        expect(result.verdict).toBe('capability_symptom');
        expect(result.capability).toBeTruthy();
        expect(result.reason).toBeTruthy();
      });
    }

    it('extracts a descriptive capability name', () => {
      expect(lintMemoryWrite('The web search tool keeps timing out.').capability).toBe('web search tool');
      expect(lintMemoryWrite('The Notion MCP server is unavailable.').capability).toBe('Notion MCP server');
      expect(lintMemoryWrite('Failed to connect to Salesforce.').capability).toBe('Salesforce');
    });
  });

  // ── Legitimate memories MUST pass ────────────────────────────
  describe('allow (passes)', () => {
    const legit: string[] = [
      'User prefers Slack over email for notifications.',
      'User likes the Notion connector for note-taking.',
      "User's favorite programming language is Rust.",
      'The Q3 deadline is March 15.',
      'Meeting with Acme scheduled for Tuesday.',
      'The project uses the GitHub API for CI.',
      'User cannot attend the Monday standup.',
      'The report failed to impress the client.',
      "User's API key is stored in the vault.",
      'The Slack tool works great for the team.',
      // ── F2 regression: a bare "cannot/can't" next to a capability noun is
      //    NOT a broken-capability symptom. Preferences and dependence facts
      //    (both legitimate memories) must pass.
      "User's main tool is Figma; cannot stand Sketch.",           // preference
      "User can't work without their Jira integration.",           // dependence (positive)
      'Our API is down for maintenance this weekend.',             // planned status, not broken
      "User loves the Notion integration but can't stand its mobile app.", // preference
      "User can't imagine working without the Slack connector.",   // dependence (positive)
      'The reporting tool cannot be beaten for speed.',            // praise
    ];

    for (const content of legit) {
      it(`allows: "${content}"`, () => {
        expect(lintMemoryWrite(content).verdict).toBe('allow');
      });
    }
  });

  // ── Edge cases ───────────────────────────────────────────────
  describe('edge cases', () => {
    it('allows empty / whitespace / non-string content', () => {
      expect(lintMemoryWrite('').verdict).toBe('allow');
      expect(lintMemoryWrite('   ').verdict).toBe('allow');
      // @ts-expect-error deliberately passing a non-string to test the guard
      expect(lintMemoryWrite(null).verdict).toBe('allow');
    });

    it('does not combine a capability noun and failure verb from different sentences', () => {
      // "cannot" and "tool" co-occur in the content but in unrelated sentences.
      const content = 'The user cannot make it on Friday. The reporting tool is very helpful.';
      expect(lintMemoryWrite(content).verdict).toBe('allow');
    });

    it('catches a symptom embedded in a longer multi-sentence memory', () => {
      const content =
        'Discussed the roadmap with the team. The Slack connector failed to send messages. Follow up next week.';
      const result = lintMemoryWrite(content);
      expect(result.verdict).toBe('capability_symptom');
    });

    it('allows a tool preference even when phrased with contrast', () => {
      expect(lintMemoryWrite('User prefers the Linear integration to Jira.').verdict).toBe('allow');
    });

    it('ignores the (currently unused) type argument without throwing', () => {
      expect(lintMemoryWrite('User prefers dark mode.', 'preference').verdict).toBe('allow');
      expect(lintMemoryWrite('The GitHub connector is broken.', 'fact').verdict).toBe('capability_symptom');
    });
  });
});
