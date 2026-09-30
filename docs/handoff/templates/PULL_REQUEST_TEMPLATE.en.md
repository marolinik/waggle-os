> **English translation** of [PULL_REQUEST_TEMPLATE.md](PULL_REQUEST_TEMPLATE.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

<!--
PROPOSAL for the Waggle v1.2 PR template (docs/handoff/templates/PULL_REQUEST_TEMPLATE.md).
NOT installed in .github/. The existing .github/PULL_REQUEST_TEMPLATE.md stays until the
replacement is done in a separate reviewed PR (docs/handoff/02-WORKING-AGREEMENT.md §16).
Sources: docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md ("PR description"), Delivery plan §0 and §2,
docs/handoff/02-WORKING-AGREEMENT.md §8/§9 (DoR/DoD).
Target branch: integration/waggle-next — NEVER main.
Every claim in the description carries a label: DECISION / CONFIRMED AT REVISION / AUDIT FINDING — TO VERIFY /
PARTIAL/UNWIRED / PROPOSAL / DEFERRED / UNKNOWN.
Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)
Changes in 1.2.1: H-01 — push only to <ODOBRENI_TIMSKI_REMOTE>; H-02 — DOCX hashes in the package manifest;
H-04 — worktree/stash check per TSA-03 A, TSA-04, TSA-05, hotspot test TSA-07, re-run TSA-08
(proposals NOT APPROVED); H-05 — safe test profile (BTP); H-06 — merge gates from backlog.csv.
-->

## Identity

- **PR ID from the plan:** <!-- e.g. W0-PR1; split = suffix a/b + link to the doc PR -->
- **Wave / milestone:** <!-- e.g. W0 / G1 -->
- **Branch:** `<wave-id>/<tema>` → `integration/waggle-next`
- **Finding ID:** <!-- F-HARN/F-EVO/F-DUR/F-HM/F-CAP/F-UXM/F-TK/F-REL-nn or MIG/TM/DP ID; or "no finding — reason" -->
- **AT ID / named FRD test:** <!-- the part of the AT that FRD §15 ("Wave (authoritative …)") assigns to this PR; e.g. AT-01, FRD-05.8, Disposition OD-10; or "none — reason" -->
- **Role (owner) / name:** <!-- e.g. Harness owner / … -->
- **Hotspot files and merge owner:** <!-- DP-0.14 table; "none" if there are none -->
- **Merge gates (backlog.csv `merge_gates`):** <!-- every item from the ticket's merge_gates with status and closure evidence (link to the decision, merge SHA of the prerequisite ticket); "none" only if the field is empty apart from MERGE-AUTH -->

## What and why

<!-- Briefly. Tie it to the Delivery plan §2 row (content, files at 2af0904d). Every claim with a status label. -->

## RED → GREEN evidence

- **RED test (name and file):**
- **RED commit:** <!-- SHA -->
- **Command:** <!-- exact command -->
- **RED output** (fails on `2af0904d` or on the HEAD of the integration branch before the change):

```text
<zalepiti izlaz koji pada>
```

- **GREEN commit:** <!-- SHA -->
- **GREEN output:**

```text
<zalepiti izlaz koji prolazi>
```

- [ ] The finding was AUDIT FINDING — TO VERIFY and RED reproduced it. If it was not reproduced: stop per 02-WORKING-AGREEMENT §10; this PR is not merged.

## Rewritten / removed tests

| Test (file:line) | What it pinned | Why it was rewritten | Does the plan list it (Delivery §2 row) |
|---|---|---|---|
| | | | |

<!-- "none" if there are none. Characterization tests are not changed to make a behavior change pass. -->

## Gates (Node 22.23.2)

- [ ] `node -v` = `v22.23.2`
- [ ] `npm run build:packages`
- [ ] `npm run typecheck:server-tests`
- [ ] `npm run lint`
- [ ] `npm run test -- --run --maxWorkers=6`
- Additional checks by touched surface (02-WORKING-AGREEMENT §6.3):
  - [ ] `apps/web/**` → `npm run typecheck:web` and `npm run test -w apps/web`
  - [ ] `app/**` → `npx tsc -p app/tsconfig.json`
  - [ ] `routes/chat*.ts` → coverage ratchet as in `ci.yml` (94/94/87/98)
  - [ ] E2E smoke → `npm run test:e2e:smoke`, only with an isolated E2E env
  - [ ] not applicable
- **CI:** <!-- link to a green run, OR "CI on integration/** does not exist yet (before W0-PR0) — local output below" -->

```text
<pre W0-PR0: zalepiti rezime svake komande, sa brojem testova i exit kodom>
```

## Affected receipts

- [ ] **I** installer
- [ ] **R** router (smart-router primary, compact-tool-context, budget, fallback)
- [ ] **P** persona
- [ ] **A** auth canaries
- [ ] **C** crash-injection
- [ ] none — reason:

Rationale (which covered surface changes: chat/persona/memory/routing/provider/tool-context/installer):

## Migration / rollback

- [ ] No schema and no data mutation.
- [ ] Migration: MIG ID ___ · class: [ ] A [ ] B
  - [ ] Runs on a copy of an isolated dataDir; snapshot + `manifest.json` (MIG-00.3) before apply
  - [ ] Dry-run report attached
  - [ ] Idempotent (second pass = no-op)
  - [ ] Rollback test per class (G1: Class A against the W0-PR19 golden fixture; from G2: Class B with `erased_subjects` and `revocations.json`)
  - [ ] Rollback does not resurrect erased/revoked data (DIR-21)
  - [ ] SQLite CHECK change = table-rebuild, not `ALTER`
- PR rollback: <!-- e.g. revert individually; what the revert does NOT restore -->

## SAFE-IMPLEMENTATION checklist (everything must be "yes")

Source: [`docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`](../../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md). A single "no" stops the PR.

**Before every PR**
- [ ] Own worktree from `integration/waggle-next` (only for W0-PR19 and after TSA-05 is confirmed: a detached baseline worktree at `2af0904d`). No one else's entry in `git worktree list`/`git stash list` removed or changed; on the founder's machine its 10 worktree entries and 2 stashes untouched. Own entry removed only per TSA-04.
- [ ] Branch `<wave-id>/<tema>` with an allowed prefix. The target is `integration/waggle-next`, not `main`.
- [ ] Env isolation per the checklist (`WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `PORT≠3100`, `WAGGLE_DESKTOP_PORT_FALLBACK` unset, `HIVE_MIND_DATA_DIR`, E2E env, `HOME`/`USERPROFILE`/`HERMES_HOME` for hook tests). Nothing touches `~/.waggle`.
- [ ] Safe test profile (BTP) for sidecar/web/E2E, hook/launch/canary and the root suite until W0-PR20 is merged (checklist "Safe test profile (BTP)"); snapshot of `~/.waggle` and the clients before/after identical. A scratch profile is not a sandbox.
- [ ] External writes disabled (`WAGGLE_SIGNAL_EMIT=0`; no channel tokens, Stripe keys, `DATABASE_URL`/`CLERK_SECRET_KEY`; `VITE_POSTHOG_KEY`/`VITE_CLERK_*`/`VITE_WAGGLE_ENABLE_CLERK` unset; `apps/web/.env.local` not copied).
- [ ] No run with a real account or a paid API without ODB-01/DQ-04 approval for that run, a dedicated VM and a cap.
- [ ] Node 22.23.2. No `npm install`/`npm ci` while dev servers hold `.node` files.
- [ ] RED test written and failing before GREEN. Wrong pins rewritten in this PR.
- [ ] Migration (if any) per DP-0.09 (section above).
- [ ] Installer/packaged tests (if any) only on a dedicated VM or a disposable Windows account. No script refusal bypassed.
- [ ] No Fusion/council/5-hats/agent-fusion surface (DECISION D-16).
- [ ] Gates green locally before review. Source not changed while the suite was running.
- [ ] Hotspot merge via the owner. No second merge of the same hotspot (the same row of the table in 02 §3) today without an integration test (TSA-07: test, command, SHA of the integration branch with the previous PR, output and exit code stated in this PR).
- [ ] For a change in `packages/hive-mind-core/src/{mind,harvest}/**`: recorded for the `scripts/oss-drift-baseline.json` review.
- [ ] The branch has been integrated with `integration/waggle-next` within the last 24 h (merge after push, no force-push).

**Absolute prohibitions (I confirm the PR does not violate them)**
- [ ] No merge into `main`, no force-push, no `git tag v*` and no tag push.
- [ ] The branch has been pushed only to `<ODOBRENI_TIMSKI_REMOTE>`, never to the public `origin` (`git remote get-url --push origin` checked; checklist, H-01).
- [ ] `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` is not defined. No release, publication, attestation or local signing.
- [ ] No change to repo visibility, license/NOTICE text (before DQ-02), Stripe/billing or www pricing (before DQ-01/DQ-03).
- [ ] No replacement of the installed application on the founder's machine and no installation of unverified binary or MCP code from tests.
- [ ] No changes to GitHub repo/org settings and no manual triggering of workflows. Re-run only per TSA-08 (after confirmation), recorded in this PR (run ID, reason).
- [ ] `release.yml` not touched (unless this is a W8 PR with founder review).

## Ledger and documentation

- [ ] `docs/TECH-DEBT.md`: new/discovered debt recorded before merge · closed row given status + SHA · wrong row corrected · "not applicable"
- [ ] Docs updated for changed behavior, commands or configuration · "not applicable"
- [ ] PRD/FRD or `00-START-HERE` `.md` change: DOCX re-exported and hashes updated in `docs/plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md` §3 in a doc-only PR · "not applicable"
- [ ] No `// TODO` without an ID

## Finding against the plan

- [ ] None.
- [ ] Yes: <!-- link to the record; escalation status (role owner / tech lead / founder); the PR is not merged until the decision is recorded in a doc-only PR -->

## Review

- **AI pre-review:** <!-- tool; summary of findings; each point "fixed" or "rejected, because…". AI approval does not count. -->
- **Human approval (mandatory):** <!-- role owner; hotspot owner; second reviewer for migration / hive-mind-core / security boundary; founder for release.yml/scripts/certify-* -->
- [ ] Nothing in the description is claimed as "works E2E" without an executed test on an isolated sidecar.
