# Waggle OS → GA: Solo-Dev Operating Manual

**For:** Marko (solo on waggle-os + hive-mind; team reserved for KVARK)
**Date:** 2026-05-29
**Companion docs:** `TRUST-REPORT.md` (empirical state), `PRODUCTION-PLAN.md` (the roadmap)

> This manual is the *how you work* layer. It turns "I'm one person facing 62 findings + GA"
> into "I'm one person orchestrating a fleet that does the 62 findings + GA." The plan tells you
> **what** to ship; this tells you **how to make Claude Code do most of it** safely.

---

## 0. The mental model shift

You are not pair-programming. At GA scale, as a solo founder, **pair-programming is the wrong unit** — it makes you the bottleneck on every line. The unit that matches your situation is **fleet orchestration**: you author a deterministic harness, dozens of agents execute and *check each other*, and you read conclusions, not diffs.

Three primitives do this. You already used all three implicitly this session — the goal is to make them deliberate:

| Primitive | What it is | Your use for GA |
|---|---|---|
| **Workflow** | A JS script that fans out subagents deterministically (loops, pipelines, parallel, adversarial panels). Runs in background, returns structured data. | The engine for every multi-item job: verify N findings, fix N findings, generate N tests, sweep N components. |
| **ultracode** | A *standing opt-in*: when on, author + run a workflow for every substantive task **by default**, and adversarially verify by default. Token cost is not a constraint. | Turn ON for the thorough GA push (you chose 1–2 months / thorough). Turn OFF for chat + trivial edits. |
| **Opus 4.8 (1M ctx)** | Deepest-reasoning model; 1M context holds whole subsystems at once. `/fast` = same model, faster output. | The *reasoning* tier: architecture, security verdicts, synthesis, "is this fix bypassable?". Route mechanical work down. |

**The doctrine that ties them together — verification-first.** Your audits keep self-grading 10/10 while admitting they never tested failure paths (UI 10/10 with "error recovery not exercised"; ~24 findings "unverified"). A fix written *and graded by the same agent* is the single biggest source of false confidence in this project. **Every claim gets independently, adversarially verified by a different agent before it counts as done.** That is exactly the read-only workflow running right now against your 31 commits.

---

## 1. Model routing (don't pay Opus rates for mechanical work)

In a workflow, `agent()` inherits the session model by default — usually correct. Override with `opts.model` **only** when confident a tier fits:

```
Opus 4.8   →  architecture decisions · security verdicts · adversarial verify ·
              synthesis · "should we ship?" · anything where being wrong is expensive
Sonnet 4.6 →  the default fix tier · most route/component/test edits · code review
Haiku 4.5  →  mechanical bulk · rename sweeps · import fixes · "does file X contain Y?" ·
              the 324-hardcoded-color token swap (pattern-substitution, not judgment)
```

In practice: keep the workflow on the inherited model, and push *down* to Haiku for the bulk-mechanical clusters via `opts.model: 'haiku'`. Reserve explicit `opts.model: 'opus'` for verify/synthesis stages if you're running the session on Sonnet.

`/fast` toggles faster Opus output for interactive work — use it when you're steering live; it does not downgrade the model.

---

## 2. The four ready-to-run workflows for the remaining GA work

These are copy-pasteable starting points. They assume `REPO = 'D:/Projects/waggle-os'`. The first one already ran this session — it's your template for the rest.

### 2.1 Independent verification (READ-ONLY) — *the template*
**When:** after any fixing session, before you believe it. Re-run after the concurrent session pushes.
**Why it's safe alongside another session:** `code-reviewer` agents (no write tools), no build/test/install, writes nothing.
**Shape:** one verifier per finding-cluster → adversarial skeptics attack every "fixed" security/billing verdict.
→ See the live script at `…/workflows/scripts/waggle-prod-verification-*.js`. Reuse via `{scriptPath}`.

### 2.2 Fix-execution (WORKTREE-ISOLATED) — *the only safe way to mutate while a session is live*
**When:** to close residual/regressed findings the Trust Report surfaces.
**Key safety:** `isolation: 'worktree'` gives each fixing agent its own git worktree, so parallel fixes never collide — with each other *or* with your other session's tree.

```js
export const meta = {
  name: 'waggle-fix-residuals',
  description: 'Close residual findings on isolated worktrees; each fix self-verifies before returning',
  phases: [{ title: 'Fix' }, { title: 'Verify' }],
}
const REPO = 'D:/Projects/waggle-os'
// residuals = the findings TRUST-REPORT.md marks not_fixed / partial / regressed
const residuals = args?.residuals || []   // pass via Workflow({args:{residuals:[...]}})

const FIX = { type:'object', additionalProperties:false, properties:{
  id:{type:'string'}, changed:{type:'array',items:{type:'string'}},
  summary:{type:'string'}, selfTest:{type:'string'} }, required:['id','summary'] }
const VERDICT = { type:'object', additionalProperties:false, properties:{
  id:{type:'string'}, verdict:{type:'string',enum:['fixed','partial','not_fixed']},
  evidence:{type:'string'} }, required:['id','verdict','evidence'] }

const results = await pipeline(residuals,
  // stage 1: fix on an isolated worktree (Sonnet is fine; push security to Opus)
  (f) => agent(
    `On ${REPO}: implement the prescribed fix for ${f.id} ("${f.prescribed}"). `+
    `Make the SMALLEST correct change. Add/extend a test that fails before and passes after. `+
    `Run only the narrowest relevant vitest file. Return what you changed.`,
    { label:'fix:'+f.id, phase:'Fix', schema:FIX, isolation:'worktree',
      model: /R1-|R2-|R6-|R9-/.test(f.id) ? 'opus' : undefined }),
  // stage 2: a DIFFERENT agent verifies the fix (no worktree; read the diff)
  (fix, f) => agent(
    `Independently verify fix for ${f.id}. Read the changed files; confirm the prescribed `+
    `behavior holds and find any bypass. Be adversarial.`,
    { label:'verify:'+f.id, phase:'Verify', schema:VERDICT, agentType:'code-reviewer' })
    .then(v => ({ ...v, fix })))

return results.filter(Boolean)
```
> You review the returned diffs, then cherry-pick/merge the worktree branches yourself. Agents propose; you commit.

### 2.3 E2E + synthetic-failure generation — *kills the 10/10s structurally*
**When:** to convert the audit's biggest admitted gap ("zero browser E2E; error-recovery untested") into real coverage.
**Shape:** discover the critical user journeys + the untested failure paths → generate a Playwright spec per journey and a failure-injection test per path.

```js
export const meta = { name:'waggle-e2e-synth', description:'Generate Playwright journeys + failure-injection tests for untested paths', phases:[{title:'Discover'},{title:'Generate'}] }
const REPO='D:/Projects/waggle-os'
const SURFACES = { type:'object', additionalProperties:false, properties:{
  journeys:{type:'array',items:{type:'object',additionalProperties:false,
    properties:{name:{type:'string'},steps:{type:'string'},failureModes:{type:'string'}},
    required:['name','steps']}} }, required:['journeys'] }

phase('Discover')
const map = await agent(
  `Read apps/web routing + the 5 personas in docs/ui-ux-audit-2026-05-27/PERSONAS.md. `+
  `List the critical user journeys and, for each, the failure modes NOT covered by tests `+
  `(network drop mid-stream, capability-missing hard error, traversal-rejected, unpaid-tier gate).`,
  { schema:SURFACES, agentType:'code-reviewer' })

phase('Generate')
await parallel(map.journeys.map(j => () =>
  agent(`Write a Playwright spec for journey "${j.name}" (steps: ${j.steps}) AND a `+
    `failure-injection test for: ${j.failureModes}. Match the existing playwright.config.ts `+
    `project layout. Place under tests/e2e/. Return the file content only — DO NOT run it.`,
    { label:'spec:'+j.name, isolation:'worktree', schema:{type:'object',additionalProperties:false,
      properties:{file:{type:'string'},content:{type:'string'}},required:['file','content']} })))
```
> Generation on worktrees → you review specs → land them → run `npm run test:all` yourself once your session owns the tree.

### 2.4 Release-readiness sweep (READ-ONLY) — *the GA launch-line*
**When:** before the GA cut. Verifies the things the audit *didn't* cover because they're not code-findings.

```js
export const meta = { name:'waggle-release-readiness', description:'Read-only check of the GA launch-line: gates, signing, updater, macOS, npx, deploy', phases:[{title:'Check'}] }
const REPO='D:/Projects/waggle-os'
const checks = [
 ['gates','Do all 5 gates give real signal now? root eslint.config present? app/tsconfig points at real TS? build runs tsc? CI targets correct branch?'],
 ['signing-win','Windows code-signing: is there a signing identity/cert wired in tauri.conf + release.yml? Or unsigned (SmartScreen warning)?'],
 ['signing-mac','macOS: Developer ID + notarization configured, or still ad-hoc (Gatekeeper block)? Is the DMG target defined?'],
 ['updater','tauri updater: correct repo slug everywhere, pubkey set (not empty), latest.json reachable?'],
 ['npx','Is the CLI npx-publishable (bin points at built .js, workspace deps resolve)?'],
 ['web-deploy','apps/www + render.yaml/docker-compose.production: is the WEB SaaS deploy path complete (env, Stripe live keys, Clerk prod, CORS for prod origin)?'],
]
phase('Check')
const out = await parallel(checks.map(([k,q]) => () =>
  agent(`READ-ONLY on ${REPO}. ${q} Report status + exact gap + the file to change.`,
    { label:k, schema:{type:'object',additionalProperties:false, properties:{
      area:{type:'string'},status:{type:'string',enum:['ready','partial','missing']},
      gap:{type:'string'},fileToChange:{type:'string'}},required:['area','status','gap']},
      agentType:'code-reviewer' })))
return out.filter(Boolean)
```

---

## 3. ultracode: when to flip it on

ultracode = a standing instruction that says *"author and run a workflow for every substantive task by default; verify adversarially; token cost is not the constraint; quality is."*

- **ON** for the GA push you chose (thorough, 1–2 months, all four dimensions). It makes the fleet-orchestration default instead of something you have to ask for each time.
- **OFF** for conversational turns, trivial mechanical edits, and when you're exploring/steering and want fast single-threaded answers.

A reminder tells the agent which state it's in. Practically: you flip it on when you sit down to *grind a workstream*, off when you're *thinking with* the agent.

---

## 4. The solo cadence (your day)

```
Morning  ── strategic-compact, read overnight workflow results (TRUST-REPORT deltas)
         ── pick ONE workstream (Verification / Security / Release / UX) for the day
Midday   ── author/run the fix-execution workflow for that workstream's residuals (worktrees)
         ── you review returned diffs, land the good ones, re-run verification on what you landed
Evening  ── run a read-only verification or release-readiness sweep on the day's work
         ── /loop a CI/push monitor if you pushed; note tomorrow's residuals
```

Tools that make this sustainable solo:
- **Worktree-per-stream** (you already do this — `waggle-os-gaia2-wt` exists). One worktree per concurrent session so nothing collides. *This is non-negotiable while two sessions are live.*
- **`/loop`** for recurring waits (poll a CI run, watch a deploy) — self-paced, interrupts you only when state changes.
- **`strategic-compact`** between phases so context stays sharp across a multi-week push.
- **Background workflows** — launch, keep steering elsewhere, get notified on completion. You ran one this session and kept talking; that's the pattern.

---

## 5. The two-session sync protocol (active right now)

Two Claude Code sessions are on `waggle-os` simultaneously. Collision rules:

| Rule | Why |
|---|---|
| **Only ONE session mutates the shared working tree** (`D:/Projects/waggle-os`). | The other (this one) is the fixing lane; mine is read-only verify+plan. Two writers on one tree corrupt each other. |
| **Any *additional* mutation goes on a NEW worktree** (`git worktree add`). | Lets a second session execute fixes without touching the live tree. Your own memory rule. |
| **Verification is always read-only** + no build/test/install on the shared tree. | A verifier that runs `npm test` races the fixer's test artifacts. Static read = zero collision. |
| **One designated session pushes** the 31 unpushed commits. | Avoid divergent pushes on `hardening/prod-readiness`. |
| **Deliverable docs live OUTSIDE the repo** until a session owns the tree. | This plan is in `North star/waggle-ga/`; fold into `waggle-os/docs/` during a quiet window. |

**Recommended handoff:** let the fixing session finish + push → this session's Trust Report identifies residuals → a single integration session works residuals on a worktree (workflow 2.2) → merge → re-verify → GA cut.

---

## 6. Guardrails

- **Budget directives:** prefix a turn with `+500k` (etc.) to set a hard token target; workflows scale fan-out to it and stop at the ceiling. Use for "go as deep as N tokens buys."
- **Read-only by default; worktree to write.** Never let an agent Edit a tree another session owns.
- **Agents propose, you dispose.** For anything security/billing/release, you read the diff and commit. The fleet does volume + verification; you keep the final commit bit.
- **Don't trust a green run that doesn't gate.** Until lint + tauri-tsc give real signal, "tests pass" is two-fifths blind. Gate repair is workstream-0.

---

*Next: `TRUST-REPORT.md` lands when the verification workflow completes, then `PRODUCTION-PLAN.md` sequences the 1–2 month GA push across all four workstreams for both web + desktop.*
