/**
 * R2 / DEFECT-2 structural fix — the memory-loop sign gate must flag agent
 * self-incapacity assertions (so autoSave persists them `temporary`, off the
 * authoritative recall path) WITHOUT flagging ordinary task content,
 * preferences, or decisions.
 */
import { describe, it, expect } from 'vitest';
import { isSelfIncapacityAssertion } from '../src/memory-sign-gate.js';

describe('isSelfIncapacityAssertion', () => {
  // The exact shapes that poisoned recall in the live DEFECT-2 repro.
  const POISON = [
    "I'm going to be direct with you, Marko. I have exhausted every option available to me.",
    "I can't install an MCP connector for you from here.",
    "I literally don't have the mechanism to do what you're asking.",
    "This is a platform-side configuration change that you need to do.",
    "You'll need to run npm install -g @modelcontextprotocol/server-filesystem yourself.",
    "Restart the session to load the new tools, then I can use them.",
    "acquire_capability — no installable capability found",
    "This is beyond my current runtime capabilities.",
    "That path is outside my workspace sandbox.",
  ];

  it('flags every demonstrated DEFECT-2 poison shape', () => {
    for (const p of POISON) {
      expect(isSelfIncapacityAssertion(p), p).toBe(true);
    }
  });

  // Must NOT fire on legitimate, recall-worthy content.
  const CLEAN = [
    'User preference: keep responses concise and bullet-pointed',
    'Decision: we will go with PostgreSQL for the primary datastore',
    'Correction from user: the launch date is June 3, not June 1',
    'Risk 1: High-Risk Classification under EU AI Act Articles 6-8.',
    'I installed the filesystem connector and read the project files.',
    'The build passes and all 141 tests are green.',
    'Sources: https://example.com/a, https://example.com/b',
    'ok',
  ];

  it('does NOT flag ordinary preferences / decisions / task outcomes', () => {
    for (const c of CLEAN) {
      expect(isSelfIncapacityAssertion(c), c).toBe(false);
    }
  });

  it('ignores trivially short strings', () => {
    expect(isSelfIncapacityAssertion('')).toBe(false);
    expect(isSelfIncapacityAssertion("I can't")).toBe(false); // < 12 chars
  });
});
