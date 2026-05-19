/**
 * D3 — runtime verification-before-completion gate (premium pillar:
 * "not done until verified; reproduce the check"). The behavioral-spec
 * carries the contract as prose (R3/f9be0b4); R6 is direct evidence a
 * model does not reliably obey in-context discipline. Premium D3 needs
 * a STRUCTURAL gate, not more prose: detect a turn that asserts the
 * work is verified/passing while NO verification-class tool was run,
 * and force one corrective turn before completion is accepted.
 *
 * Pure classifier — tuned conservatively (like memory-sign-gate): fire
 * on explicit "it's verified / tests pass / it works" *claims*, never
 * on neutral "done" or honest "I could not verify" non-claims.
 */
import { describe, it, expect } from 'vitest';
import {
  assertsUnverifiedCompletion,
  VERIFICATION_GATE_DIRECTIVE,
} from '../src/verification-gate.js';

describe('assertsUnverifiedCompletion', () => {
  // Asserts verified/passing success BUT no verification-class tool ran.
  const UNVERIFIED: Array<[string, string[]]> = [
    ['All tests pass and the build succeeds.', []],
    ['Done — I verified everything works correctly.', ['read_file', 'edit_file']],
    ['The fix is complete and the suite is green.', ['grep']],
    ['It works now; I ran it and the output is correct.', []],
    ['Everything compiles and all 141 tests are passing.', ['write_file']],
  ];

  it('fires on an unverified completion/success assertion', () => {
    for (const [c, tools] of UNVERIFIED) {
      expect(assertsUnverifiedCompletion(c, tools), c).toBe(true);
    }
  });

  // Must NOT fire — either a verify tool actually ran, or no success claim.
  const OK: Array<[string, string[]]> = [
    ['All tests pass and the build succeeds.', ['run_tests']],     // actually verified
    ['The suite is green.', ['bash']],                              // ran a check
    ['Build succeeds.', ['typecheck']],                             // ran a check
    ['I updated the config as you asked.', []],                     // neutral, no claim
    ['Here is the summary of the architecture you requested.', ['read_file']],
    ["I could not run the tests here — you'll need to run them.", []], // honest non-claim
    ['Done.', []],                                                  // bare ack, no success claim
  ];

  it('does NOT fire when verification ran, or when there is no success claim', () => {
    for (const [c, tools] of OK) {
      expect(assertsUnverifiedCompletion(c, tools), c).toBe(false);
    }
  });

  it('ignores trivially short content', () => {
    expect(assertsUnverifiedCompletion('', [])).toBe(false);
    expect(assertsUnverifiedCompletion('ok', [])).toBe(false);
  });

  it('exposes a corrective directive that demands a real check or an UNVERIFIED label', () => {
    expect(VERIFICATION_GATE_DIRECTIVE.length).toBeGreaterThan(40);
    expect(VERIFICATION_GATE_DIRECTIVE).toMatch(/verif|check|UNVERIFIED/i);
  });
});
