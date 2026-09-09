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

  it('preserves success claims supplied by a closed-world rewrite request', () => {
    const request = 'Rewrite this and preserve the facts: API tests pass. Browser tests have two failures.';
    const response = 'API tests are passing. Browser tests still have two failures.';
    expect(assertsUnverifiedCompletion(response, [], request)).toBe(false);
  });

  it('does not mistake future exit criteria for completed verification', () => {
    const response = [
      'Exit criteria:',
      '- All tests pass.',
      '- The build succeeds.',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(false);
  });

  it('does not mistake a pass-condition table for completed verification', () => {
    const response = [
      '## Minimum next checks (evidence-only)',
      '| Check | Pass condition |',
      '|---|---|',
      '| Verify the cited CI build | Build passes for the release commit |',
      '**VERDICT: FAIL** - Production readiness is not established.',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [], 'Give an evidence-only production verdict.')).toBe(false);
  });

  it('still fires on an unsupported status claim inside a table', () => {
    const response = [
      '## Next checks',
      '| Component | Current status | Pass condition |',
      '|---|---|---|',
      '| Web build | All tests pass | Build passes for the release commit |',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(true);
  });

  it('does not let planning text in an adjacent cell hide a status claim', () => {
    const response = [
      '| Current status | Required follow-up |',
      '|---|---|',
      '| All tests pass | Must rerun on Windows |',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(true);
  });

  it('maps escaped Markdown pipes to the correct status column', () => {
    const response = [
      '| Detail \\| notes | Pass condition | Current status |',
      '|---|---|---|',
      '| Matrix | Must be green | All tests pass |',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(true);
  });

  it('recognizes pass-condition tables without outer pipes', () => {
    const response = [
      'Check | Pass condition',
      '--- | ---',
      'Verify the cited CI build | Build passes for the release commit',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(false);
  });

  it('stops planning context at adjacent table boundaries', () => {
    const response = [
      'Check | Pass condition',
      '--- | ---',
      'Verify the cited CI build | Build passes for the release commit',
      '',
      'Component | Current status',
      '--- | ---',
      'Web build | All tests pass',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(true);
  });

  it('stops list planning context at the nearest section heading', () => {
    const response = [
      '## Next checks',
      '- Run CI on Windows.',
      '',
      '## Current status',
      '- All tests pass.',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(true);
  });

  it('still recognizes a success phrase as prospective inside next checks', () => {
    const response = [
      '## Next checks',
      '- All tests pass.',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(false);
  });

  it('does not treat a previous bullet as the current planning header', () => {
    const response = [
      '## Current status',
      '- Next checks are documented separately.',
      '- All tests pass.',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(true);
  });

  it('inherits planning context through nested Markdown sections', () => {
    const response = [
      '## Next checks',
      '### Windows',
      '- All tests pass.',
    ].join('\n');
    expect(assertsUnverifiedCompletion(response, [])).toBe(false);
  });

  it('still fires on an unsupported claim when the user did not supply it', () => {
    expect(assertsUnverifiedCompletion(
      'All tests pass and the build succeeds.',
      [],
      'Fix the failing tests.',
    )).toBe(true);
  });

  it('does not let narrative use of "after" hide an unsupported completion claim', () => {
    expect(assertsUnverifiedCompletion(
      'After the fix, all tests pass.',
      [],
      'Fix the failing tests.',
    )).toBe(true);
  });

  it('accepts an honestly attributed user claim without upgrading it', () => {
    expect(assertsUnverifiedCompletion(
      'You reported that all tests pass; I have not independently verified that claim.',
      [],
      'All tests pass.',
    )).toBe(false);
  });

  it('does not turn a negated relative clause into a verified-completion claim', () => {
    const response = [
      'The workspace search returned no files.',
      'These names are path metadata, not file contents I verified, and they do not constitute evidence about the project.',
    ].join('\n');

    expect(assertsUnverifiedCompletion(response, ['search_files'])).toBe(false);
    expect(assertsUnverifiedCompletion(
      'I verified everything works correctly.',
      ['search_files'],
    )).toBe(true);
    expect(assertsUnverifiedCompletion(
      'I did not run tests, but I verified everything works correctly.',
      ['search_files'],
    )).toBe(true);
    expect(assertsUnverifiedCompletion(
      'These are not files I verified. All tests pass.',
      ['search_files'],
    )).toBe(true);
    for (const honestNegation of [
      'This is not the actual source code I verified.',
      'This is not the actual project evidence I verified.',
    ]) {
      expect(assertsUnverifiedCompletion(honestNegation, ['search_files']), honestNegation).toBe(false);
    }
    for (const unsupportedClaim of [
      'That is not the only behavior I verified.',
      'This is not just what I verified.',
      'This is not all I have verified.',
      'I did not run tests before I verified the change.',
      'I did not inspect it before I verified the change.',
      'This is not the code I verified works correctly.',
      'This is not the result I verified passes.',
      'This is not the actual evidence I verified proves the fix.',
      'This is not the file I verified, which works correctly.',
      'This is not the actual evidence I verified, proving the fix.',
      'This is not the result I verified: passing on Windows.',
      'This is not the source code I verified—functioning correctly in production.',
      'These are not files I verified, and they do not fail; the fix is proven.',
      'These are not results I verified, and they are not broken; the release is ready.',
      'These names are not file contents I verified, and they do not merely look correct—they are proven.',
    ]) {
      expect(assertsUnverifiedCompletion(unsupportedClaim, ['search_files']), unsupportedClaim).toBe(true);
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
