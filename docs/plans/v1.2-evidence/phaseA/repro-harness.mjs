// Read-only repro against the BUILT dist of D:/Projects/waggle-os @ 2af0904df01ca3d374cc78ba95b60dc579dd6a7a.
// Nothing under the repo is written; this script only imports compiled modules.
// Run from the scratchpad: node repro-harness.mjs
const DIST = 'file:///D:/Projects/waggle-os/packages/agent/dist/';
const results = [];
function rec(id, pass, detail) { results.push({ id, pass, detail }); }

const wh = await import(DIST + 'workflow-harness.js');
const bh = await import(DIST + 'builtin-harnesses.js');
const vg = await import(DIST + 'verification-gate.js');
const htb = await import(DIST + 'harness-trace-bridge.js');

const { createHarnessRun, advancePhase, harnessEvents } = wh;
const { researchVerifyHarness, codeReviewFixHarness, getHarnessById } = bh;

const out = (phaseId, content, toolCalls = [], extra = {}) => ({
  phaseId, content, toolCalls, artifacts: [], durationMs: 1234, tokens: { input: 10, output: 5 }, ...extra,
});

// ── F-HARN-01: shouldSkipVerify default (WAGGLE_AUTO_VERIFY unset) ──────────
{
  delete process.env.WAGGLE_AUTO_VERIFY;
  let s = createHarnessRun(researchVerifyHarness);
  s = await advancePhase(s, researchVerifyHarness, out('gather', 'found', [
    { tool: 'search_memory', args: {}, result: 'a' }, { tool: 'recall_memory', args: {}, result: 'b' },
  ]));
  s = await advancePhase(s, researchVerifyHarness, out('synthesize', '## A\n## B\n## C'));
  rec('F-HARN-01a unset->verify skipped, run completed',
    s.completed === true && s.phaseStatuses.get('verify') === 'skipped',
    `completed=${s.completed} verify=${s.phaseStatuses.get('verify')} currentPhase=${s.currentPhase}`);

  process.env.WAGGLE_AUTO_VERIFY = '0';
  let s0 = createHarnessRun(researchVerifyHarness);
  s0 = await advancePhase(s0, researchVerifyHarness, out('gather', 'found', [
    { tool: 'search_memory', args: {}, result: 'a' }, { tool: 'recall_memory', args: {}, result: 'b' },
  ]));
  s0 = await advancePhase(s0, researchVerifyHarness, out('synthesize', '## A\n## B\n## C'));
  rec('F-HARN-01b WAGGLE_AUTO_VERIFY=0 -> still skipped', s0.phaseStatuses.get('verify') === 'skipped',
    `verify=${s0.phaseStatuses.get('verify')}`);

  process.env.WAGGLE_AUTO_VERIFY = '1';
  let s1 = createHarnessRun(researchVerifyHarness);
  s1 = await advancePhase(s1, researchVerifyHarness, out('gather', 'found', [
    { tool: 'search_memory', args: {}, result: 'a' }, { tool: 'recall_memory', args: {}, result: 'b' },
  ]));
  s1 = await advancePhase(s1, researchVerifyHarness, out('synthesize', '## A\n## B\n## C'));
  rec('F-HARN-01c WAGGLE_AUTO_VERIFY=1 -> verify active', s1.completed === false && s1.phaseStatuses.get('verify') === 'active',
    `completed=${s1.completed} verify=${s1.phaseStatuses.get('verify')}`);
  // summary text says Completed although verify was skipped
  const summary = wh.getRunSummary(s, researchVerifyHarness);
  rec('F-HARN-01d summary says "Completed" with verify SKIP', /\*\*Status:\*\* Completed/.test(summary) && /\| Verify \| SKIP \|/.test(summary),
    summary.split('\n').filter(l => /Status|Verify/.test(l)).join(' || '));
}

// ── F-HARN-02: VERDICT gate accepts FAIL and CONDITIONAL ────────────────────
{
  process.env.WAGGLE_AUTO_VERIFY = '1';
  const verifyGate = researchVerifyHarness.phases.find(p => p.id === 'verify').gates[0];
  const fail = await verifyGate.validate(out('verify', 'VERDICT: FAIL — the synthesis contradicts both sources.'));
  const cond = await verifyGate.validate(out('verify', 'VERDICT: CONDITIONAL — one claim unsupported.'));
  const pass = await verifyGate.validate(out('verify', 'VERDICT: PASS'));
  const none = await verifyGate.validate(out('verify', 'Everything looks fine.'));
  rec('F-HARN-02a VERDICT: FAIL passes gate', fail.passed === true, fail.reason);
  rec('F-HARN-02b VERDICT: CONDITIONAL passes gate identically to PASS', cond.passed === true && pass.passed === true, `${cond.reason} / ${pass.reason}`);
  rec('F-HARN-02c missing VERDICT fails gate (retry path works)', none.passed === false, none.reason);

  // whole-run: FAIL verdict completes the harness
  let s = createHarnessRun(researchVerifyHarness);
  s = await advancePhase(s, researchVerifyHarness, out('gather', 'x', [
    { tool: 'search_memory', args: {}, result: 'a' }, { tool: 'recall_memory', args: {}, result: 'b' },
  ]));
  s = await advancePhase(s, researchVerifyHarness, out('synthesize', '## A\n## B\n## C'));
  s = await advancePhase(s, researchVerifyHarness, out('verify', 'VERDICT: FAIL'));
  rec('F-HARN-02d run with VERDICT: FAIL -> completed=true, aborted=false', s.completed === true && s.aborted === false,
    `completed=${s.completed} aborted=${s.aborted} verify=${s.phaseStatuses.get('verify')}`);
}

// ── F-HARN-03: bash-as-test gate ignores command and exit code ─────────────
{
  const verifyGate = codeReviewFixHarness.phases.find(p => p.id === 'verify').gates[0];
  const echo = await verifyGate.validate(out('verify', 'ran it', [{ tool: 'bash', args: { command: 'echo hi' }, result: 'hi' }]));
  const failing = await verifyGate.validate(out('verify', 'ran tests', [{ tool: 'bash', args: { command: 'npm test' }, result: 'Exit code: 1\nFAIL 12 tests failed' }]));
  const nameOnly = await verifyGate.validate(out('verify', 'x', [{ tool: 'my_bash_like_tool', args: {}, result: '' }]));
  rec('F-HARN-03a bash echo hi passes "test/typecheck" gate', echo.passed === true, echo.reason);
  rec('F-HARN-03b bash with "Exit code: 1 ... FAIL" passes gate', failing.passed === true, failing.reason);
  rec('F-HARN-03c substring match: tool named my_bash_like_tool passes', nameOnly.passed === true, nameOnly.reason);
}

// ── F-HARN-04: run_harness counted as verification tool (D3) ────────────────
{
  const isV = vg.isVerificationToolName('run_harness');
  const gateOff = vg.assertsUnverifiedCompletion('All tests pass and the build is green.', ['run_harness']);
  const gateOn = vg.assertsUnverifiedCompletion('All tests pass and the build is green.', ['read_file']);
  const bashOff = vg.assertsUnverifiedCompletion('All tests pass and the build is green.', ['bash']);
  rec('F-HARN-04a isVerificationToolName(run_harness) === true', isV === true, String(isV));
  rec('F-HARN-04b D3 does NOT fire after run_harness + "all tests pass"', gateOff === false && gateOn === true, `withRunHarness=${gateOff} withReadFile=${gateOn}`);
  rec('F-HARN-04c D3 does NOT fire after any bash (exit code unknown to gate)', bashOff === false, String(bashOff));
}

// ── F-HARN-05: budget stop enableVerification:false (mechanism-level) ───────
{
  let lg;
  try { lg = await import(DIST + 'loop-gates.js'); } catch (e) { rec('F-HARN-05 import loop-gates', false, String(e)); }
  if (lg) {
    const state = lg.initialGateState ? lg.initialGateState() : {
      verificationCorrectionUsed: false, skillDistillationUsed: false, explicitEvidenceRepairUsed: false,
      completionIntegrityRepairUsed: false, completionIntegrityRepairAttempts: 0, preservedAnswerForDistillation: undefined,
    };
    const mk = (enableVerification) => lg.maybeFireCompletionGate({
      content: 'Done. All tests pass and the build is green.',
      toolsUsed: [], availableToolNames: ['bash'], messages: [{ role: 'system', content: 'sys' }],
      userRequest: 'fix the bug', finishReason: 'stop', state, enableVerification, enableSkillDistillation: false,
    });
    const off = await mk(false);
    const on = await mk(true);
    rec('F-HARN-05a enableVerification:false -> D3 silent (fired=false, no disclosure)', off.fired === false && !off.contentSuffix && !off.rejectIncompleteReason,
      JSON.stringify({ fired: off.fired, suffix: off.contentSuffix, reject: off.rejectIncompleteReason }));
    rec('F-HARN-05b same input with default -> D3 fires', on.fired === true, JSON.stringify({ fired: on.fired }));
    const noTool = await lg.maybeFireCompletionGate({
      content: 'Done. All tests pass and the build is green.', toolsUsed: [], availableToolNames: [],
      messages: [{ role: 'system', content: 'sys' }], userRequest: 'fix the bug', finishReason: 'stop', state,
      enableVerification: true, enableSkillDistillation: false,
    });
    rec('F-HARN-05c default + no verification tool available -> disclosure suffix exists (no extra turn needed)',
      noTool.fired === false && typeof noTool.contentSuffix === 'string' && noTool.contentSuffix.includes('EVIDENCE-ONLY'),
      JSON.stringify({ fired: noTool.fired, suffix: (noTool.contentSuffix ?? '').slice(0, 60) }));
  }
}

// ── F-HARN-06: HarnessTraceBridge constants + null context ──────────────────
{
  const calls = { start: [], tool: [], artifact: [], finalize: [] };
  const recorder = {
    start: (i) => { calls.start.push(i); return { id: calls.start.length }; },
    recordToolCall: (h, c) => calls.tool.push(c),
    recordArtifact: (h, a) => calls.artifact.push(a),
    finalize: (h, o) => calls.finalize.push(o),
  };
  const { EventEmitter } = await import('node:events');
  const em = new EventEmitter();
  const bridge = new htb.HarnessTraceBridge({ recorder, events: em }); // no context, like packages/server/src/local/index.ts:612
  bridge.start();
  em.emit('harness:phase:complete', {
    harnessId: 'research-verify', phaseId: 'synthesize', phaseName: 'Synthesize', phaseInstruction: 'inst',
    output: out('synthesize', '## A', [{ tool: 'bash', args: { command: 'npm test' }, result: 'Exit code: 1\nFAIL' }], { durationMs: 9876 }),
    gateResults: [{ name: 'g', passed: true, reason: 'r' }],
  });
  const t = calls.tool[0]; const f = calls.finalize[0]; const st = calls.start[0];
  rec('F-HARN-06a phase:complete -> outcome "verified"', f?.outcome === 'verified', String(f?.outcome));
  rec('F-HARN-06b tool record ok:true durationMs:0 despite failing result text', t?.ok === true && t?.durationMs === 0, JSON.stringify({ ok: t?.ok, durationMs: t?.durationMs, result: t?.result }));
  rec('F-HARN-06c PhaseOutput.durationMs (9876) not forwarded anywhere in trace', !JSON.stringify(f).includes('9876') && !JSON.stringify(st).includes('9876'), 'finalize/start payload lacks 9876');
  rec('F-HARN-06d default boot wiring -> sessionId/personaId/workspaceId/model all null', st.sessionId === null && st.personaId === null && st.workspaceId === null && st.model === null, JSON.stringify(st));
  bridge.stop();
}

// ── F-HARN-07 / AT-06: global harnessEvents without runId ──────────────────
{
  const seen = [];
  const l = (ev) => seen.push(ev);
  harnessEvents.on('harness:phase:complete', l);
  const h = getHarnessById('document-draft');
  let a = createHarnessRun(h); let b = createHarnessRun(h);
  a = await advancePhase(a, h, out('context', 'ctx A', [{ tool: 'search_memory', args: {}, result: 'A' }]));
  b = await advancePhase(b, h, out('context', 'ctx B', [{ tool: 'search_memory', args: {}, result: 'B' }]));
  harnessEvents.off('harness:phase:complete', l);
  const keys = Object.keys(seen[0] ?? {});
  const hasRunId = keys.some(k => /run|session|workspace/i.test(k));
  rec('F-HARN-07a two concurrent runs emit on one global emitter; payload keys lack run/session/workspace id',
    seen.length === 2 && !hasRunId, `keys=${keys.join(',')}`);
  rec('F-HARN-07b events of run A and run B indistinguishable by identity fields',
    seen[0].harnessId === seen[1].harnessId && seen[0].phaseId === seen[1].phaseId, `both harnessId=${seen[0].harnessId} phaseId=${seen[0].phaseId}`);
}

// ── F-HARN-08: run_harness tool — model-supplied evidence (workflow-tools.js) ──
{
  let wt;
  try { wt = await import(DIST + 'workflow-tools.js'); } catch (e) { rec('F-HARN-08 import workflow-tools', false, String(e).slice(0, 200)); }
  if (wt) {
    process.env.WAGGLE_AUTO_VERIFY = '1';
    wt.__resetActiveHarnessRunsForTests?.();
    const tools = wt.createWorkflowTools({ availableTools: [], maxDepth: 0, maxWorkers: 0,
      aiClient: { generateText: async () => ({ text: '', tokens: { input: 0, output: 0 } }) },
      workerFactory: async () => ({ async run() { return { content: '', toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 } }; } }) });
    const run = tools.find(t => t.name === 'run_harness');
    const start = await run.execute({ harness_id: 'code-review-fix' });
    const runId = start.match(/\*\*run_id:\*\*\s*`([^`]+)`/)[1];
    // Model claims tool calls that never happened; the tool accepts them as evidence.
    const claim = (tc) => ({ content: 'done', tool_calls: tc, artifacts: [], duration_ms: 1, tokens: { input: 1, output: 1 } });
    await run.execute({ harness_id: 'code-review-fix', run_id: runId, phase_output: claim([{ tool: 'read_file', args: {}, result: 'x' }]) });
    await run.execute({ harness_id: 'code-review-fix', run_id: runId, phase_output: { ...claim([]), content: 'Critical: nothing' } });
    await run.execute({ harness_id: 'code-review-fix', run_id: runId, phase_output: claim([{ tool: 'edit_file', args: {}, result: 'x' }]) });
    const fin = await run.execute({ harness_id: 'code-review-fix', run_id: runId, phase_output: claim([{ tool: 'bash', args: { command: 'echo ok' }, result: 'ok' }]) });
    rec('F-HARN-08a run_harness completes code-review-fix on self-reported tool_calls incl. bash echo', /\*\*Status:\*\* Completed/.test(fin), fin.split('\n').find(l => /Status/.test(l)));
    rec('F-HARN-08b run_id exists at tool layer but is not in harness events (see 07a)', typeof runId === 'string' && runId.length > 0, runId);
  }
}

// ── Print ──
let fails = 0;
for (const r of results) { if (!r.pass) fails++; console.log(`${r.pass ? 'REPRO-OK ' : 'REPRO-NO '} ${r.id}\n    ${r.detail}`); }
console.log(`\n${results.length - fails}/${results.length} repro assertions hold on 2af0904d`);
