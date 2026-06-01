/**
 * Vision-harness JUDGE phase (Option C hybrid) — run via the Workflow tool:
 *   Workflow({ scriptPath: "tests/vision/judge-workflow.mjs", args: { captures: [...] } })
 *
 * Each capture is graded for MEANING by an independent vision-judge subagent
 * (it Reads the PNG — that IS the vision step), then a JS reducer cross-checks
 * the vision verdict against the objective console signal the capture phase
 * recorded: a vision-PASS that carries a real console error is downgraded to
 * FAIL (the "objective floor" so a plausible-looking screenshot can't pass).
 *
 * args.captures: [{ png, expectation, surface?, theme?, consoleErrors?[] }]
 *   png         absolute or repo-relative path to the screenshot
 *   expectation one-line description of what the surface SHOULD show
 *   consoleErrors objective signal from the capture driver (page.on('console'))
 *
 * Produces tests/vision/artifacts/vision-report.md + returns a summary.
 * Capture phase: tests/vision/capture.spec.ts (writes PNG + sidecar JSON).
 */

export const meta = {
  name: 'vision-e2e-judge',
  description: 'Grade captured Waggle screenshots for meaning via per-screenshot vision-judge agents + objective-signal reducer',
  phases: [
    { title: 'Judge', detail: 'one vision-judge subagent per screenshot' },
    { title: 'Report', detail: 'reduce verdicts + objective signals into one report' },
  ],
}

const dim = {
  type: 'object',
  required: ['pass', 'note'],
  additionalProperties: false,
  properties: { pass: { type: 'boolean' }, note: { type: 'string', description: 'cite what you SEE' } },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'confidence', 'dimensions'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'WARN'] },
    confidence: { type: 'number', description: '0-1 confidence in the overall verdict' },
    dimensions: {
      type: 'object',
      required: ['renders_correctly', 'no_error_state', 'flow_completes', 'theme_legible'],
      additionalProperties: false,
      properties: {
        renders_correctly: dim,
        no_error_state: dim,
        flow_completes: dim,
        theme_legible: dim,
      },
    },
  },
}

// args may arrive as a structured object OR a JSON string (depending on how
// the Workflow caller passes it) — accept both.
let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch { parsedArgs = {} }
}
const captures = Array.isArray(parsedArgs?.captures) ? parsedArgs.captures : []
if (captures.length === 0) {
  log('No captures supplied. Pass args.captures = [{png, expectation, consoleErrors}].')
  return { error: 'no-captures', pass: 0, fail: 0, warn: 0 }
}

log(`Judging ${captures.length} captured surface(s) for meaning...`)

phase('Judge')

const VISION_DIMS = ['renders_correctly', 'no_error_state', 'flow_completes', 'theme_legible']

const judged = await parallel(
  captures.map((c) => () =>
    agent(
      `You are a meticulous UI QA reviewer grading a single screenshot of the Waggle OS desktop app.

Use the Read tool to VIEW the screenshot at this path, then judge what you actually see:
${c.png}

This surface is expected to show:
${c.expectation}

Grade each rubric dimension as pass=true/false with a one-line note citing what you SEE (not what you assume):
- renders_correctly: content is laid out and visible — NOT blank, half-rendered, overlapping, or a bare skeleton.
- no_error_state: no red error banner, no "Something went wrong", no stack trace, no infinite spinner, no empty white void where the app should be.
- flow_completes: the expected end-state described above is actually visible on screen.
- theme_legible: adequate text/background contrast — no dark-text-on-dark or white-text-on-white, nothing illegible.

Set verdict=FAIL if any dimension fails and you are confident (>=0.7). verdict=WARN if you are unsure (0.4-0.7). verdict=PASS only if all four clearly hold. confidence = your certainty in that overall verdict.

(An empty/clean "no data yet" state with clear UI chrome is a PASS for renders/no_error — judge whether the SHELL is healthy, not whether data exists.)

Return ONLY the structured verdict.`,
      { label: `judge:${c.surface || c.theme || c.png}`, phase: 'Judge', schema: VERDICT_SCHEMA },
    ).then((v) => ({
      surface: c.surface || c.png,
      png: c.png,
      consoleErrors: Array.isArray(c.consoleErrors) ? c.consoleErrors : [],
      vision: v,
    })),
  ),
)

// ── Reducer (objective floor): vision-PASS + real console error → FAIL ──
const graded = judged.filter(Boolean).map((g) => {
  const v = g.vision || {}
  const dims = v.dimensions || {}
  const visionFailed = VISION_DIMS.some((d) => dims[d] && dims[d].pass === false)
  const hardSignal = g.consoleErrors.length > 0
  let verdict = v.verdict || (visionFailed ? 'FAIL' : 'PASS')
  let downgraded = false
  if (verdict === 'PASS' && hardSignal) {
    verdict = 'FAIL'
    downgraded = true
  }
  return {
    surface: g.surface,
    png: g.png,
    verdict,
    confidence: typeof v.confidence === 'number' ? v.confidence : 0,
    downgradedByConsole: downgraded,
    failingDimensions: VISION_DIMS.filter((d) => dims[d] && dims[d].pass === false),
    notes: Object.fromEntries(VISION_DIMS.map((d) => [d, dims[d] ? dims[d].note : ''])),
    consoleErrors: g.consoleErrors,
  }
})

const pass = graded.filter((g) => g.verdict === 'PASS').length
const fail = graded.filter((g) => g.verdict === 'FAIL').length
const warn = graded.filter((g) => g.verdict === 'WARN').length
log(`Verdicts: ${pass} PASS / ${fail} FAIL / ${warn} WARN`)

phase('Report')

const REPORT_SCHEMA = {
  type: 'object',
  required: ['pass', 'fail', 'warn', 'reportPath'],
  additionalProperties: true,
  properties: {
    pass: { type: 'number' },
    fail: { type: 'number' },
    warn: { type: 'number' },
    reportPath: { type: 'string' },
  },
}

const report = await agent(
  `Write a vision-E2E verdict report (Markdown) to the repo-relative path:
tests/vision/artifacts/vision-report.md

Use the Write tool. Base it ONLY on this graded data (already reduced — verdicts with downgradedByConsole=true were vision-PASS but had a real console error, so the objective floor flipped them to FAIL):

${JSON.stringify({ summary: { pass, fail, warn, total: graded.length }, graded }, null, 2)}

The report must contain:
1. A "# Vision-E2E Report" heading + one-line summary: "${pass} PASS / ${fail} FAIL / ${warn} WARN of ${graded.length} surfaces".
2. A results table: Surface | Verdict | Confidence | Failing dimensions | Console errors | Downgraded?.
3. A "## Failures & Warnings" section — for every FAIL/WARN, the surface, the evidence PNG path, the failing dimensions with the judge's notes, and any console errors. (If none, write "All surfaces passed.")
4. A "## How this was graded" footer: each screenshot judged for meaning by an independent vision agent; a vision-PASS carrying a real console error is downgraded to FAIL (objective floor).

Then return { pass, fail, warn, reportPath: "tests/vision/artifacts/vision-report.md" }.`,
  { label: 'report', phase: 'Report', schema: REPORT_SCHEMA },
)

return { summary: { pass, fail, warn, total: graded.length }, graded, report }
