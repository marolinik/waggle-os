# Waggle v1.2 — TEAM-START-AUTHORIZATION (proposal for the team operating model)

> **English translation** of [TEAM-START-AUTHORIZATION.md](TEAM-START-AUTHORIZATION.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)** — new document (H-04; section TSA-09 from H-01).

Changes in 1.2.1: H-04 — the whole act (roles, founder decisions, today/after table, TSA-01..TSA-10, replacements of norms, decision record); H-01 — TSA-09 (handoff channel and remote) and the field for `<ODOBRENI_TIMSKI_REMOTE>` in §6; H-05 — safe test profile (BTP) in §3 and TSA-02 item 3, TSA-05 item 2; H-06 — backlog ID INT-05 (TSA-06), link between confirmations and gates in `backlog-gates.csv` (§6), doc-only PR from TSA-06 in TSA-01 item 5; H-09 — Release owner and step K (§1, §2, TSA-01 item 7), F3-SRC (§1); H-12 — TSA-09 as a start gate for T0 (§6). · Final review (H-01/H-04): §3 rows "Reading the package and code" and "Clone for work" aligned with 00 §2 — until the TSA-09 decision no clone at all, not even a read-only clone of the public repo; only a copy of the package verified against the manifest and `git ls-remote` are allowed. · Final review (H-04): TSA-04 "Replaces" and the §5 row TSA-04 supplemented with the 05 §5.3 row "Live installation data" (team machine). · Final review (H-02): TSA-09 populating the team repo and Variant B check the SHA of the 1.2.1 closure commit from manifest §1 (after D-3), not `planning_package_sha` `2758f4e5`.

> **Status: NOT APPROVED — PROPOSAL.** This act permits nothing until the founder confirms it in writing, in whole or item by item (§6). An unconfirmed item does not apply, and for it the existing rules of [00 §2](00-START-HERE.en.md), [01 §0](01-ONBOARDING-DEV-ENV.en.md), [02](02-WORKING-AGREEMENT.en.md) and the [SAFE checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) apply. Confirmation of this act is **not** approval of the delivery plan (implementation GO), does not ratify RAT-01..RAT-09, does not grant ODB-01/ODB-02, does not decide DQ-01..DQ-09 and does not reopen D-01..D-18.

For whom: the founder (decision), the future tech lead and the team (execution). Names are not invented: every "UNFILLED" field is filled in by the person in the "Who fills in" column.

## 0. Basis

- The founder's instruction for the final closure (30.09.2026, H-04): "The rules protecting my computer must not require every developer to have my nine worktrees, two stashes and personal paths. Every replacement of an existing norm must be stated explicitly; a proposed delegation does not apply before confirmation."
- Following that instruction, revision 1.2.1 reformulated the protections of the founder's machine as prohibitions concerning that machine (TSA-03 A). This grants no new permission.
- Independent review of 30.09.2026, H-04; disposition: [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md).

## 1. Roles

One person may hold several roles ([02 §1](02-WORKING-AGREEMENT.en.md)), with two restrictions: nobody approves or merges their own PR, and the second reviewer from TSA-01 item 4 is neither the author nor the first reviewer of the same PR.

| Role | Responsibility | Name | Who fills in |
|---|---|---|---|
| Accountable tech lead (ESK-01) | Executes the plan; holds `integration/waggle-next`; performs merges into it per TSA-01; assigns DP-0.14 roles (ESK-03); first recipient of escalations ([05 §5.2](05-RISKS-DECISIONS-ESCALATION.en.md)); confirms the actual schedule against the team composition; declares the F3-SRC freeze ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), step 1) | UNFILLED | founder |
| Merge deputy | Performs merges under the same conditions when the tech lead is the PR author or absent | UNFILLED | founder, on the tech lead's proposal |
| Reviewers (owners of DP-0.14 roles) | Human approval of PRs in their area; hotspot merge owners ([02 §3](02-WORKING-AGREEMENT.en.md)) | table in [02 §1](02-WORKING-AGREEMENT.en.md): UNFILLED | tech lead proposes, founder confirms (ESK-03) |
| Second reviewer for security and migrations | Second human approval for PRs from TSA-01 item 4 | UNFILLED (recommendation: two people, for availability) | founder |
| Release owner | W0-PR0 (CI), W8-PR1/PR2, receipt manifest, records of CI budget and reruns (TSA-08), freeze preparation, F3a and F3b qualification and the RP-04 check ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)). Does not sign, tag or publish; performs step K only if the founder delegates it to them by name in the written approval of K (Delivery §5.1), while public GO and publication remain the founder's decision | UNFILLED | founder |
| Escalation channel and expected founder response time (ESK-02) | — | UNFILLED | founder |
| Founder | §2 | Marko Marković | — |

## 2. What remains the founder's decision

- Approval of the delivery plan ([00 §6](00-START-HERE.en.md) (a)) and confirmation of the items of this act.
- Scope: G1/G2/G3, exit criteria, RAT-01..RAT-09, ODB-02, DQ-01..DQ-09.
- Money: every run with a real account or a paid API (ODB-01, DQ-04), CI budget (TSA-08), machines and VMs.
- Business and licensing decisions: Stripe and prices (DQ-01, DQ-03), LICENSE/NOTICE (DQ-02), copyleft or unknown license.
- Handoff channel, remote, access and repo visibility (TSA-09, DP-0.13).
- Merge into `main`, tag `v*`, signing, attestation, publication and public GO (DP-0.11, DP-0.12). The only foreseen path to a signed candidate is the controlled step K with the founder's written approval ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)).
- GitHub repo/org settings, Actions variables and secrets.
- Everything that touches the founder's machine (TSA-03).
- An exception to a security objective BC-nn (TSA-10) and every change to the SAFE checklist.
- Review of `release.yml` and `scripts/certify-*` ([02 §7](02-WORKING-AGREEMENT.en.md)).

The founder does not approve individual technical phases or PRs, except for the rows that TSA-01 item 5 explicitly lists.

## 3. What is allowed today, after confirmation of the act and after approval of the plan

The "After …" columns apply only to items the founder has confirmed (§6). For an unconfirmed item the "Today" column applies.

| Action | Today (before decisions) | After confirmation of the item of this act, before plan approval | After approval of the delivery plan |
|---|---|---|---|
| Reading the package and code, read-only git | Yes, within the scope of [00 §2](00-START-HERE.en.md): until the TSA-09 decision only a copy of the package verified against the manifest and `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`; code only in a checkout from the approved channel ([01 §0.1](01-ONBOARDING-DEV-ENV.en.md)) | Yes | Yes |
| Preparing the machine outside the repo | Yes | Yes | Yes |
| Clone for work | No (TSA-09); not even a read-only clone of the public repo | Only an isolated onboarding clone (TSA-02) | Clone from `<ODOBRENI_TIMSKI_REMOTE>` and worktrees from `integration/waggle-next` |
| `npm ci`, `npm run build:packages`, 4 gates, root suite | No, nowhere | Only in the onboarding clone (TSA-02); the root suite, until W0-PR20 is merged, only in the BTP (checklist "Safe test profile (BTP)") | In your own worktree ([01 §0.2](01-ONBOARDING-DEV-ENV.en.md)); the root suite, until W0-PR20 is merged, only in the BTP (checklist "Safe test profile (BTP)") |
| Sidecar/web/E2E, hook/launch/canary, repro scripts | No | No | Only in the safe test profile (BTP; [01 §9.0](01-ONBOARDING-DEV-ENV.en.md); checklist "Safe test profile (BTP)") |
| Branch, commit, push, PR | No | No | Only on `<ODOBRENI_TIMSKI_REMOTE>`, per [02](02-WORKING-AGREEMENT.en.md) and the checklist |
| Baseline fixture worktree | No | No | Only for W0-PR19 (TSA-05) |
| Removing your own finished worktree | No | No | TSA-04 |
| Review and merge into `integration/waggle-next` | No | No | TSA-01 |
| CI rerun | No | No | TSA-08, only after W0-PR0 |
| Team work on the founder's machine | No | No | No (TSA-03 B) |
| Run with a real account or a paid API | No | No | Only with ODB-01/DQ-04 for that run (DP-0.10) |
| Merge into `main`, tag, signing, publication, repo settings and visibility | No | No | No (§2) |

"Checklist" in the table is [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md); its item "Safe test profile (BTP)" is authoritative for the test profile, and this table only follows it.

## 4. Rules

Each rule states the norm it changes and what applies until confirmation. The founder's decision is recorded in §6.

### TSA-01 — Review and merge into `integration/waggle-next`

1. Every PR has at least one human approval from the role owner for that area ([02 §1](02-WORKING-AGREEMENT.en.md)). The author does not approve their own PR.
2. A PR that touches a hotspot ([02 §3](02-WORKING-AGREEMENT.en.md)) also has the approval of the hotspot merge owner; if that owner is the author, another named reviewer approves. For `chat.ts` + `chat-*.ts` the Chat owner and the Harness owner approve (DP-0.14 "Harness/Chat owner" = two roles, 02 §1). One person may hold both roles but may not be the author.
3. AI reviewers are pre-review only ([02 §7](02-WORKING-AGREEMENT.en.md)). AI does not approve and does not merge.
4. A second human approval, from the second reviewer for security and migrations, is mandatory for: every MIG-00..MIG-09 mutation and migration step; `packages/hive-mind-core/src/**`; the security/approval boundary (approvals, permissions, trust, `injection-scanner.ts`, vault and secret handling); resolution of dataDir, paths and env isolation (e.g. `packages/server/src/local/service.ts`, `routes/documents.ts`, `routes/pins.ts`, `packages/agent/src/external-process-env.ts`); hook/launcher code that writes to the configuration of external clients; `.github/workflows/*` and `scripts/certify-*`.
5. Founder review remains only for `release.yml` and `scripts/certify-*` (Delivery §2 W8; 02 §7) and for the doc-only PR that changes `AGENTS.md`/`CLAUDE.md` (INT-05, TSA-06). RAT/DQ/ODB merge blocks (Delivery §6, §6.1) are founder gates, not review.
6. The merge is performed by the tech lead or the named deputy (§1), with a merge commit ([02 §2.5](02-WORKING-AGREEMENT.en.md)), only once items 1–5, the Definition of Done ([02 §9](02-WORKING-AGREEMENT.en.md)) and the whole SAFE checklist are satisfied. Nobody merges their own PR.
7. No merge into `main` (BC-01). The only foreseen movement of `main` is a fast-forward in the controlled step K, with the founder's written approval ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)); that is not an authorization from this act.

**Replaces:** the 02 §7 paragraph "Who approves and who merges into `integration/waggle-next`: UNKNOWN" and questions (k) and (m) in [00 §6](00-START-HERE.en.md); the assumption in [Delivery §4.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), row "Human review (founder; ~3 PR/day UNKNOWN)", that the founder reviews every PR serially (capacity is re-estimated by the tech lead against the team). Supplements the 02 §7 row "Migration PR … two human approvals" with the list from item 4.
**Until confirmation:** nobody has merge authority (02 §7).

### TSA-02 — Own clone and isolated onboarding before implementation

After confirmation, but before plan approval, a team member may, on a team machine (TSA-03):
1. make a fresh clone from `<ODOBRENI_TIMSKI_REMOTE>` or from the snapshot (TSA-09, Variant B) and run `git checkout --detach 2af0904df01ca3d374cc78ba95b60dc579dd6a7a`. If the founder decides that `integration/waggle-next` is created from the package commit (00 §6 (h)), that commit is also allowed, provided that `git diff --name-only 2af0904df01ca3d374cc78ba95b60dc579dd6a7a HEAD` lists only `docs/…`;
2. run `npm ci`, `npm run build:packages`, `npm run typecheck:server-tests`, `npm run lint` and `npm run test -- --run --maxWorkers=<N>` and measure `N` ([01 §6.2](01-ONBOARDING-DEV-ENV.en.md), §13 item 1);
3. conditions: Node `22.23.2`; root `.env` without real keys ([01 §8](01-ONBOARDING-DEV-ENV.en.md), DP-0.10); the machine holds no provider keys, tokens or accounts of the founder; `WAGGLE_SIGNAL_EMIT=0`; no installed Waggle runs on the machine, or a snapshot of `~/.waggle` before and after stays the same ([01 §9.5](01-ONBOARDING-DEV-ENV.en.md)). `npm ci` and 6 package-install tests go to the npm registry ([01 §6.3](01-ONBOARDING-DEV-ENV.en.md)); on a team machine this is accepted. The root suite (`npm run test`) runs only in the BTP (a dedicated test account on the team machine is sufficient), because server tests at `2af0904d` create `~/.waggle/security-cache` in the real home ([01 §9.5](01-ONBOARDING-DEV-ENV.en.md) row 4);
4. may not: branch, commit, push, PR; sidecar, web, E2E; hook/launch/canary; repro scripts; paid calls; work in someone else's tree or on the founder's machine;
5. output: an onboarding record to the tech lead (command, Node version, SHA, summary, exit code; format [02 §14](02-WORKING-AGREEMENT.en.md)), without writing to the repo. The onboarding clone is single-use: before plan approval it does not become a working clone for a PR, and its owner deletes it when done.

**Replaces:** for your own fresh clone on a team machine and only for the actions from item 2: the rule "`npm ci`, build, gates, tests and repro scripts before approval: nowhere" ([00 §2](00-START-HERE.en.md)), the part "and in a separate fresh clone on your own machine" in [01 §0](01-ONBOARDING-DEV-ENV.en.md) ("Gate"), [02 §0](02-WORKING-AGREEMENT.en.md) (first paragraph) and [04 §13 item 7](04-CODEBASE-MAP.en.md). Answer to question (o) in 00 §6. Repro scripts remain prohibited until plan approval.
**Until confirmation:** no, nowhere.
**Runtime:** a result of the gates on a team machine does not exist yet; the first evidence is the output from item 5.

### TSA-03 — Working host and the founder's machine

**Part A — applied in revision 1.2.1 per the founder's instruction (§0); grants no permissions.**
- Team machines have no obligation to hold the founder's worktrees, stashes or personal paths. On a team machine the checklist item on worktrees reads: the listing of `git worktree list` and `git stash list` is captured at the start and at the end of the session, and no entry that does not belong to the session author has been removed or changed. Your own entry is removed only per TSA-04; until TSA-04 is confirmed it is not removed.
- On the founder's machine these prohibitions apply: its 9 worktrees (DP-0.02), the docs worktree `D:/Projects/waggle-v12-handoff` (branch `docs/waggle-v1.2-planning`, the 10th entry in `git worktree list` on 30.09.2026) and `stash@{0}`/`stash@{1}` (DP-0.03) are not deleted, checked out, pruned or applied. The installed application, `~/.waggle`, `~/.claude`, `~/.codex`, the Hermes home, HKCU keys and the founder's personal provider keys are not touched ([05 §5.3](05-RISKS-DECISIONS-ESCALATION.en.md), "Live installation data"). The founder's personal paths in DP-0.02 and in the checklist describe that machine and are not an instruction for the team.

**Part B — PROPOSAL.** The team works exclusively on its own machines or on dedicated VMs and accounts without the founder's data and accounts. The founder's machine is not a team host. Receipt, installer and packaged tests still go only to a dedicated VM or a disposable Windows account (checklist; DP-0.11).

**Replaces:** A: the mandatory reading of DP-0.02, DP-0.03 and the checklist ("Baseline", "Before every PR" item 1) on all hosts; 02 §2.2; 01 §3.1; the PR template. B: question (c) in 00 §6 and the recipe "On the founder's machine the same `worktree add` …" in [01 §3.2](01-ONBOARDING-DEV-ENV.en.md).
**Until confirmation of B:** team work does not start on any host before plan approval; if someone works on the founder's machine, the prohibitions from part A apply.

### TSA-04 — Cleanup of your own finished worktrees

After confirmation, on a team machine, the owner may remove their own `<wave-id>/*` worktree or the baseline worktree from TSA-05 only when all five conditions hold:
1. The PR is merged into `integration/waggle-next`: `git -C <klon> fetch origin`, then `git -C <klon> merge-base --is-ancestor <grana> origin/integration/waggle-next` → exit 0. For the TSA-05 worktree: W0-PR19 is merged.
2. No local changes: `git -C <worktree> status --porcelain` is empty (and without untracked files). No unpushed commits: `git -C <worktree> log --oneline origin/<grana>..HEAD` is empty; the detached TSA-05 worktree has no commits.
3. No stash from that branch (`git stash list`) and no process runs from that worktree (sidecar, vitest, node holding a `.node` file).
4. Removal: `git -C <klon> worktree remove <putanja>` **without `--force`**. If git refuses, work stops and goes to the tech lead. The local branch is deleted only with `git branch -d <grana>` (never `-D`). Remote branches are not deleted without the tech lead.
5. `git worktree prune` only if `git worktree prune --dry-run -v` lists exclusively your own entries.

The owner may also delete their own scratch dataDir (`<scratch>/data-<agent>`), never `~/.waggle`. Never removed: a worktree or stash of the founder, the docs worktree, someone else's worktree, or the integration worktree without a tech lead decision.
**Replaces:** for your own entries on a team machine, the part of the checklist "Before every PR" item 1 "no existing entry is deleted"; the paragraph "May your own `<wave-id>/*` worktree be removed … UNKNOWN" in [01 §3.3](01-ONBOARDING-DEV-ENV.en.md); the "prunable" row in 01 §12 (team machine); [05 §5.3](05-RISKS-DECISIONS-ESCALATION.en.md) row "Live installation data" (team machine).
**Until confirmation:** no entry is removed, not even your own.

### TSA-05 — Baseline fixture worktree (W0-PR19 only)

After confirmation and plan approval, the author of W0-PR19 may create, in their own team clone, one detached worktree on the code baseline:

```powershell
git -C <klon> worktree add --detach <koren>\wt\w0-pr19-baseline 2af0904df01ca3d374cc78ba95b60dc579dd6a7a
```

1. In it there is no branch, commit or push.
2. The generator script is copied from the `w0/<tema>` branch of W0-PR19 as an untracked file. In the worktree `npm ci` and `npm run build:packages` are run, and the generator runs in the BTP (checklist "Safe test profile (BTP)"), with the isolated env from the checklist ("Env isolation", "External writes disabled").
3. Two generations produce the same SHA-256 or a documented time normalization ([Delivery §2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), W0-PR19).
4. The golden tar and SHA-256 are copied into the W0-PR19 worktree and committed there. The PR description records the baseline SHA, the command, the Node version and both SHA-256 values.
5. After W0-PR19 is merged, the generator copy is deleted and the worktree is removed per TSA-04. The tech lead may decide to keep it until F1 for regeneration.

**Replaces:** one exception to the word "exclusively" in the checklist "Before every PR" item 1 and to DP-0.05; "Exception W0-PR19" in [02 §2.4](02-WORKING-AGREEMENT.en.md); question (b) in 00 §6; the "SAFE-IMPLEMENTATION-CHECKLIST.md" row in [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md); gate 3 in [03 §6](03-BACKLOG.en.md).
**Until confirmation:** the worktree is not created. The memory lane starts from W0-PR10 and W0-PR11, and W0-PR6 and W0-PR18 wait (03 §6).

### TSA-06 — PR size (replacement of the "5 files per phase" rule)

**Replaced norm:** `AGENTS.md` §4 "Pre-Work Protocol": "**Phased execution:** Max 5 files per phase. Complete → verify → await approval → next phase." (`AGENTS.md:403` at `2af0904d`; likewise `CLAUDE.md:441`). In the package it is quoted in [02 §0](02-WORKING-AGREEMENT.en.md) (the first "Known conflict"), [02 §4](02-WORKING-AGREEMENT.en.md) ("Execution guideline") and question (j) in 00 §6. It is a limit of earlier agent sessions with the founder, not a team review rule.

New rule for team work on `integration/waggle-next` and `<wave-id>/*`:
1. The unit of review is one PR ID from Delivery §2 ([02 §4](02-WORKING-AGREEMENT.en.md)). A PR may touch all files that its plan row lists, and the number of files is not a limit. W0-PR9 (7 source files) and W0-PR12 (6 files) are allowed.
2. Size target: up to about 400 changed lines of production code, excluding tests, fixtures, generated files, the lockfile and documentation. Above about 800 lines the author proposes a technical split or writes a justification in the PR description. The tech lead decides, without the founder.
3. A split preserves traceability: a suffix following the plan pattern (`W0-PR9a`, `W0-PR9b`); each part carries the finding ID, the AT part and RED→GREEN evidence; the last part closes the AT; the split is reported by a docs PR to the plan ([02 §4](02-WORKING-AGREEMENT.en.md)). PRs are merged together only by a tech lead decision.
4. A "phase" for people and AI agents is a logical step within a PR (a commit or a series of commits) after which the gates are run ([02 §6.2](02-WORKING-AGREEMENT.en.md)). No founder approval is awaited between phases. The human author of the PR is accountable for an AI agent's work.
5. The rest of `AGENTS.md` §4 (removing dead code in a separate commit before a structural refactor of a file >300 LOC) and §3.3 (surgical changes) apply.

**Alignment of repo files:** after confirmation, a separate doc-only PR changes `AGENTS.md` §4 and §3.8 and `CLAUDE.md` §4 and §3.8 so that for team work they point to this act. The founder approves the PR, as owner of those contracts; in the backlog this is the integration doc-only job INT-05 ([03-BACKLOG](03-BACKLOG.en.md), [backlog.csv](backlog.en.csv)). Until that PR is merged, the conflict `AGENTS.md §4` ↔ `TSA-06` is resolved per TSA-10 item 2.
**Until confirmation:** the interim rule from 02 §0 applies: at most 5 files per phase, and W0-PR9 and W0-PR12 do not start.

### TSA-07 — Hotspot integration test

1. "The same hotspot" means the same row of the table in [02 §3](02-WORKING-AGREEMENT.en.md) (DP-0.14).
2. When PR B is merged on the same working day after PR A on the same hotspot, the integration test has two parts: (a) the four gates ([02 §6.2](02-WORKING-AGREEMENT.en.md)) and the supplementary checks ([02 §6.3](02-WORKING-AGREEMENT.en.md)) pass on the PR B branch after merging the current HEAD of `integration/waggle-next`, which already contains PR A; (b) at least one named test exercises the changes of both PRs together on that hotspot (existing or new, in PR B).
3. The author of PR B runs the test. The hotspot merge owner signs off the result; if that owner is the author of PR B, the second reviewer signs off (TSA-01 item 2). The PR B description states the test, the command, the SHA of `integration/waggle-next` containing PR A, the output and the exit code.
4. After W0-PR0, CI on the PR B merge commit must be green. If it is red, there are no further merges on that hotspot until it is fixed ([02 §14](02-WORKING-AGREEMENT.en.md)).
5. The same applies to the G2 hotspot integration tests budgeted in Delivery §4.1 (W1-PR4/PR8/PR9 × W3-PR2 × W4-PR1).

**Replaces:** in 02 §3 "Integration test: UNKNOWN" and the PROPOSAL definition (adopted together with items 1 and 4); in 02 §10 the item "what an "integration test" is". Supplements DP-0.14 and the checklist item "Hotspot files".
**Until confirmation:** a second PR on the same row of the hotspot table is not merged on the same day (02 §3).

### TSA-08 — Non-production CI rerun within the approved budget

After confirmation, and only once CI exists (after W0-PR0):
1. Only `gh run rerun <run-id> --failed` (or "Re-run failed jobs" in the GitHub UI) is allowed, for runs of the `ci.yml` and `tauri-build-pr.yml` workflows triggered by a push or pull request on `integration/**` or `<wave-id>/*` branches in `<ODOBRENI_TIMSKI_REMOTE>`. At `2af0904d` those two workflows use neither `secrets.*` nor `environment:`, and `tauri-build-pr.yml:139` skips signing.
2. The cause must be infrastructural and recorded: an Actions budget annotation (rerun only after the budget renews), a runner cancellation, a network timeout in the install step, or a known flaky test with a TD row in [TECH-DEBT.md](../TECH-DEBT.md). A test that is red because of code is not rerun.
3. At most 2 reruns per PR head SHA. Each is recorded in the PR: run ID, reason, duration.
4. The rerun is performed by the Release owner or the tech lead; the author requests it in the PR.
5. Budget: UNFILLED Actions minutes per month, on the account that pays for `<ODOBRENI_TIMSKI_REMOTE>` (filled in by the founder). The Release owner keeps the records. When the budget is exhausted, reruns stop and the matter is escalated to the founder.
6. Never: `workflow_dispatch` or `gh workflow run`; a rerun of `release.yml`, `deploy-www.yml`, `sync-mind.yml`, `mind-parity-check.yml`, `installer-smoke.yml`, `hive-mind-cli-cross-platform.yml` or any job with `environment:` or `secrets.*`; changes to Actions variables, secrets or settings (BC-06).

**Replaces:** only for the rerun from item 1: the word "rerun" in the checklist ("Absolute prohibitions", the item on GitHub settings) and in DP-0.11 ("nor manual triggering of workflows"); [01 §3.1](01-ONBOARDING-DEV-ENV.en.md) (git prohibitions), §11.8 and the row "CI job failed in 3–4 s" in §12; the sentence in [02 §14](02-WORKING-AGREEMENT.en.md) "Red CI is not bypassed by a manual rerun"; the "Release" row in [05 §5.3](05-RISKS-DECISIONS-ESCALATION.en.md); the PR template item on reruns.
**Until confirmation:** a rerun is an owner action (checklist, DP-0.11).

### TSA-09 — Handoff channel and remote (H-01) — PROPOSAL, NOT APPROVED

Status: the proposal awaits the founder's confirmation. Before confirmation, no permission from the "After approval" column applies.

| Item | Today (before approval) | After the founder's approval (PROPOSAL) | Who decides |
|---|---|---|---|
| Public branch `docs/waggle-v1.2-planning` = `2758f4e5` | Stays as it is; not deleted, not rewritten, visibility not changed | The founder records whether public availability is intended. Recommendation: treat `2758f4e5` as already published (removing the branch does not recall copies already fetched) and do not rely on withdrawal | Founder |
| Handoff channel to the team | None is approved; the public branch is not a handoff channel | **Variant A (recommendation):** private team repo = `<ODOBRENI_TIMSKI_REMOTE>`. **Variant B:** private snapshot (git bundle with SHA-256) only for reading and assessment before the start | Founder |
| Populating the team repo | — | The founder, with a separate approval of that push: `git -C D:/Projects/waggle-v12-handoff push <ODOBRENI_TIMSKI_REMOTE> 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:refs/heads/main` and `git -C D:/Projects/waggle-v12-handoff push <ODOBRENI_TIMSKI_REMOTE> <closure_sha>:refs/heads/docs/waggle-v1.2-planning` (URL, without adding a remote; `<closure_sha>` = the approved docs-only 1.2.1 closure commit recorded in manifest §1 after D-3; not `planning_package_sha` `2758f4e5`, which lacks the H-01..H-12 corrections) | Founder |
| Access | — | Read for named team members; write on `integration/waggle-next` and `<wave-id>/*` for the tech lead and developers; admin and repo settings (branch protection) only the founder. Names: UNKNOWN | Founder |
| Team clone and push | No clone for work, no push anywhere | Clone only from `<ODOBRENI_TIMSKI_REMOTE>`; before every push `git remote get-url --push origin` = `<ODOBRENI_TIMSKI_REMOTE>` (01 §3.2) | Tech lead enforces |
| Push to the public `origin` | Prohibited | Still prohibited for internal documentation and team branches. Moving code to the public repo (merge into `main`, tag, signing, publication) is a separate founder-gated step (H-09); `release.yml:46` runs only in `marolinik/waggle-os` | Founder |
| `fc0a7b3f` and the closure commit | Local; no bare `git push` in `D:/Projects/waggle-v12-handoff` (the branch tracks the public `origin`) | Go only to `<ODOBRENI_TIMSKI_REMOTE>`, after a repeated secret scan over the new diff | Founder |
| CI and cost | — | CI in a private repo consumes the owner account's Actions minutes; the limit goes into the budget of this act (H-04) | Founder |

Variant B, commands (founder only, after the decision; local reading of history, without writing to the repo):
    git -C D:/Projects/waggle-v12-handoff bundle create D:\handover\waggle-v12-<planning_sha8>.bundle docs/waggle-v1.2-planning
    Get-FileHash D:\handover\waggle-v12-<planning_sha8>.bundle -Algorithm SHA256
Team (read-only check of the snapshot):
    git bundle verify waggle-v12-<planning_sha8>.bundle
    git clone -b docs/waggle-v1.2-planning waggle-v12-<planning_sha8>.bundle D:\waggle\waggle-read
    git -C D:\waggle\waggle-read rev-parse HEAD                     # = SHA of the 1.2.1 closure commit from manifest §1 (after D-3)
    git -C D:\waggle\waggle-read merge-base --is-ancestor 2af0904df01ca3d374cc78ba95b60dc579dd6a7a HEAD   # exit 0
    git -C D:\waggle\waggle-read diff --name-only 2af0904df01ca3d374cc78ba95b60dc579dd6a7a HEAD   # only docs/…
Before creating the bundle, the founder checks that the branch points to the SHA of the 1.2.1 closure commit from manifest §1 (after D-3), not to `2758f4e5`. The snapshot has no remote to push to and does not replace Variant A for development.

### TSA-10 — Document hierarchy and security objectives

Hierarchy for team work on v1.2:
1. Valid explicit written decisions of the founder: D-01..D-18 ([brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md)), written decisions on DQ/RAT/ODB/ESK items and confirmed items of this act (by TSA ID).
2. Approved contracts and ADRs: PRD/FRD contracts and ADRs after ratification (RAT-nn). An ADR draft before ratification is a PROPOSAL and does not stand above level 3.
3. Aligned plan and working agreement: [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) (§0 DP-0.01..DP-0.16), [SAFE checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md), [02](02-WORKING-AGREEMENT.en.md), the other handoff documents (00, 01, 03, 04, 05) and the backlog.
4. Earlier instructions — `AGENTS.md`, `CLAUDE.md` and older `docs/` — apply in full, except where a higher level replaces them **explicitly and by ID**. `AGENTS.md:6` ("this file wins") does not apply only for points replaced in that way: `AGENTS.md` §4 "Phased execution" (TSA-06) and the personal paths in `AGENTS.md`/`CLAUDE.md` §3.8 (item 5 below). `AGENTS.md` §3.1–§3.6, §7 and §7.5 apply.

Rules:
1. Security objectives BC-01..BC-07 are not switched off by a generic priority rule, not even by the level 1 rule. Only a written founder decision that names the BC ID, the specific action, the scope and the deadline changes them.
2. A higher level wins only when it explicitly names the norm it replaces (document and ID or section). Otherwise the stricter norm applies ([02 §0](02-WORKING-AGREEMENT.en.md), item 1).
3. A conflict that item 2 does not resolve stops work on that point. It is recorded with both IDs (e.g. `AGENTS.md §4` ↔ `TSA-06`) and escalated ([02 §10](02-WORKING-AGREEMENT.en.md); [05 §5.5](05-RISKS-DECISIONS-ESCALATION.en.md)).
4. After the decision, the affected repo and package files are aligned by a doc-only PR in the same arc ([02 §10](02-WORKING-AGREEMENT.en.md), item 4). A note in another document is not a resolution.
5. Session state (`AGENTS.md`/`CLAUDE.md` §3.8): the team does not write to the founder's personal paths (`~/.claude`, `~/.Codex` and the memory paths inside them). State, open failures and the next step go in the PR description or an issue on `<ODOBRENI_TIMSKI_REMOTE>`. "Never hide failures" and verification before writing (`npm run build:packages`, [02 §6.2](02-WORKING-AGREEMENT.en.md)) apply.

| ID | Security objective | Source |
|---|---|---|
| BC-01 | No merge into `main`, force-push, `git tag v*`, release, signing, attestation or publication without a founder decision for the specific action | DP-0.11, DP-0.12; checklist |
| BC-02 | The founder's machine (worktrees, stashes, installed application, `~/.waggle`, personal auth state, personal keys) is not an operational target | DP-0.02, DP-0.03, DP-0.11; TSA-03 |
| BC-03 | No run with a real account or a paid API without ODB-01/DQ-04 for that run, a cap and an isolated place of execution | DP-0.10; checklist |
| BC-04 | Isolated runtime and external writes disabled; no test touches `~/.waggle` or the configuration of real clients | DP-0.08, DP-0.10; checklist |
| BC-05 | Migrations only on copies, with a snapshot and a rollback test per class; rollback does not revive what was erased or revoked | DP-0.09; DIR-21 |
| BC-06 | No change to repo visibility, license/NOTICE, Stripe/billing, GitHub repo/org settings, Actions variables or secrets | DP-0.11, DP-0.13; checklist |
| BC-07 | No push of internal documentation or team branches to the public `origin` | DP-0.11 (H-01); checklist |

**Replaces:** "Order of precedence: UNKNOWN" in [02 §0](02-WORKING-AGREEMENT.en.md) and the sentence in the introduction of 02 "Which source wins … UNKNOWN"; question (j) in 00 §6 (together with TSA-06).
**Until confirmation:** the interim rule from 02 §0 applies (the stricter norm; every conflict stops work and goes to the founder).

## 5. Overview of replacements of existing norms

| Norm and where it lives | What changes | Rule | Applies from |
|---|---|---|---|
| `AGENTS.md:403` / `CLAUDE.md:441` "Max 5 files per phase … await approval" (quoted in 02 §0 and §4, 00 §6 (j)) | For team work replaced by the PR size rule | TSA-06 | confirmation of TSA-06 |
| `AGENTS.md`/`CLAUDE.md` §3.8 (the founder's personal handoff paths) | Does not apply to the team; state goes to PR/issue | TSA-10 item 5 | confirmation of TSA-10 |
| `AGENTS.md:6` "this file wins" | Does not apply to points replaced by ID | TSA-10 | confirmation of TSA-10 |
| DP-0.02, DP-0.03; checklist "Baseline" and "Before every PR" item 1; 01 §3.1; 02 §2.2; PR template | Obligation of all hosts → prohibition concerning the founder's machine; a team machine checks other people's entries | TSA-03 A | revision 1.2.1 (founder's instruction) |
| 00 §6 (c); 01 §3.2 "On the founder's machine …" | The team does not work on the founder's machine | TSA-03 B | confirmation of TSA-03 B |
| 01 §3.3 "removal … UNKNOWN"; checklist item 1 (own entries); 05 §5.3 row "Live installation data" (team machine) | Cleanup rule | TSA-04 | confirmation of TSA-04 |
| DP-0.05; checklist item 1 "exclusively"; 02 §2.4; 00 §6 (b) | One baseline fixture worktree | TSA-05 | confirmation of TSA-05 |
| 00 §2, 01 §0, 02 §0, 04 §13 item 7 ("nowhere, not even in a fresh clone"); 00 §6 (o) | Isolated onboarding | TSA-02 | confirmation of TSA-02 |
| DP-0.11 and checklist ("rerun"); 01 §11.8, §12; 02 §14; 05 §5.3 | Non-production rerun | TSA-08 | confirmation of TSA-08 |
| DP-0.14, checklist "Hotspot files"; 02 §3 "integration test UNKNOWN" | Definition of the test | TSA-07 | confirmation of TSA-07 |
| 02 §7 "Who approves and merges UNKNOWN"; 00 §6 (k), (m); Delivery §4.2 "Human review (founder)" | Review and merge model | TSA-01 | confirmation of TSA-01 |
| 02 §0 "Order of precedence UNKNOWN"; 00 §6 (j) | Hierarchy and BC-01..BC-07 | TSA-10 | confirmation of TSA-10 |
| 01 §3.2 clone/push to the public `origin` | Approved team remote | TSA-09 | founder decision (H-01) |

## 6. Founder decision

It is recorded in this file by a doc-only change approved by the founder. An oral confirmation applies only once it is in writing ([05 §5.0](05-RISKS-DECISIONS-ESCALATION.en.md)).

Confirmation of an item closes the corresponding gate in [backlog-gates.csv](backlog-gates.en.csv): TSA-06, TSA-09 and TSA-10 the gates of the same name, and TSA-01 the gate `MERGE-AUTH`. Recording a gate in the backlog is not a confirmation. TSA-09 is one of the start gates that determine T0 ([Delivery §4.4.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)); the founder may close them with the same pre-start act.

| Item | Decision (approved / rejected / approved with change) | Change | Date |
|---|---|---|---|
| TSA-01 Review and merge | UNFILLED | UNFILLED | UNFILLED |
| TSA-02 Isolated onboarding | UNFILLED | UNFILLED | UNFILLED |
| TSA-03 B The team does not work on the founder's machine | UNFILLED | UNFILLED | UNFILLED |
| TSA-04 Cleanup of own worktrees | UNFILLED | UNFILLED | UNFILLED |
| TSA-05 Baseline fixture worktree | UNFILLED | UNFILLED | UNFILLED |
| TSA-06 PR size | UNFILLED | UNFILLED | UNFILLED |
| TSA-07 Hotspot integration test | UNFILLED | UNFILLED | UNFILLED |
| TSA-08 CI rerun (and the budget in item 5) | UNFILLED | UNFILLED | UNFILLED |
| TSA-09 Handoff channel and remote | UNFILLED | UNFILLED | UNFILLED |
| `<ODOBRENI_TIMSKI_REMOTE>` (URL, with TSA-09) | UNFILLED | — | UNFILLED |
| TSA-10 Hierarchy and BC-01..BC-07 | UNFILLED | UNFILLED | UNFILLED |
| Names from §1 (ESK-01..ESK-03, deputy, second reviewer, Release owner) | UNFILLED | — | UNFILLED |

Founder's signature: UNFILLED.

## Sources

[00 §2, §6](00-START-HERE.en.md) · [01 §0, §3, §6, §9, §11.8, §12, §13](01-ONBOARDING-DEV-ENV.en.md) · [02 §0–§4, §6, §7, §10, §14](02-WORKING-AGREEMENT.en.md) · [03 §6](03-BACKLOG.en.md) · [backlog-gates.csv](backlog-gates.en.csv) · [04 §13](04-CODEBASE-MAP.en.md) · [05 §5](05-RISKS-DECISIONS-ESCALATION.en.md) · [Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) §0, §2 W0/W8, §4.1, §4.2, §4.4.1, §5.1, §6, §6.1 · [SAFE checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) · [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md) · [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md) · repo at `2af0904d` (read-only): `AGENTS.md:6`, `:382-392`, `:403`; `CLAUDE.md:441`; `.github/workflows/ci.yml:3-6`, `tauri-build-pr.yml:139`, `deploy-www.yml`, `sync-mind.yml`, `release.yml:46,2059`; `git worktree list` and `git stash list` on the founder's machine (read-only, 30.09.2026).
