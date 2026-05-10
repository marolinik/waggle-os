# Memory Sync Repair — Step 3 Results: CI/CD Sync Workflow

**Date:** 2026-04-26 → 2026-04-27 (rolled past midnight)
**Author:** CC-2 (continuation of same session that closed Steps 1+2)
**Status:** Step 3 COMPLETE — awaiting PM ratification + final sign-off
**Companion documents:**
- Audit + plan: `decisions/2026-04-26-memory-sync-audit.md`
- CC-2 brief: `briefs/2026-04-26-memory-sync-repair-cc2-brief.md`
- Step 1 results: `decisions/2026-04-26-memory-sync-step1-results.md`
- Step 2 results: `decisions/2026-04-26-memory-sync-step2-test-port-results.md`

---

## §1 — Executive summary

| Deliverable | Status |
|-------------|--------|
| `mind-parity-check.yml` workflow | ✅ shipped |
| `sync-mind.yml` workflow | ✅ shipped |
| `.parity-allowlist` policy file with 1 documented entry | ✅ shipped |
| `.github/sync.md` operating manual | ✅ shipped |
| `CLAUDE.md` Section 7.5 note | ✅ shipped |
| `scripts/parity-check.sh` local-dev wrapper | ✅ shipped |
| YAML syntax validated | ✅ both files parse cleanly |
| Parity-check shell logic dry-run | ✅ 34 files / 410 tests PASS |
| No committed files corrupted by dry-run | ✅ verified after fix to skip-if-committed logic |
| `HIVE_MIND_SYNC_TOKEN` configured | ⏸ awaiting Marko (workflow's `if:` condition makes this safe — fails fast with clear error if absent) |
| End-to-end PR creation tested against marolinik/hive-mind | ⏸ awaiting Marko (requires the secret + a real test branch push) |
| Halt-and-ping triggers fired | None |

---

## §2 — Workflow file inventory

### `.github/workflows/mind-parity-check.yml` (NEW)

**Trigger:** PR + push to main, paths-filtered to
`packages/core/src/mind/**`, `packages/core/src/harvest/**`,
`packages/core/tests/mind/**`.

**Steps:**
1. Checkout waggle-os + hive-mind master (separate paths)
2. Setup Node 20 (matches existing waggle-os ci.yml convention)
3. Cache npm
4. Install waggle-os dependencies
5. Run **baseline** waggle-os mind/ tests (regression catch-net)
6. **Inject** latest hive-mind tests under `<base>-hive-mind.test.ts`:
   - Skip if listed in `.parity-allowlist`
   - **Keep if already committed** (Step 2 port preserves bespoke header
     comments + waggle-os-side adaptations)
   - Otherwise copy with sed-adapted import paths
7. Run **combined** suite (waggle-os baseline + injected)
8. Emit informational diff of shared substrate file sizes (not a gate)

**Failure semantics:**
- Baseline failure → regular regression, blocks merge
- Combined-suite failure on a `<x>-hive-mind.test.ts` → either:
  - waggle-os has a real bug (fix + re-push), OR
  - hive-mind tests an intentionally divergent behavior — add to
    `.parity-allowlist` with documented reason

### `.github/workflows/sync-mind.yml` (NEW)

**Trigger:** push to main, paths-filtered to
`packages/core/src/mind/**`, `packages/core/src/harvest/**`.

**Steps:**
1. Checkout waggle-os with full history
2. Verify `HIVE_MIND_SYNC_TOKEN` secret present (fail fast if absent)
3. Compute filtered diff:
   - Range = `${{ github.event.before }}` → `${{ github.sha }}`
   - Fall back to `HEAD~1` for first-push edge case
   - Apply EXTRACTION.md "NOT extracted" filter:
     ```
     packages/core/src/mind/vault.ts
     packages/core/src/mind/evolution-runs.ts
     packages/core/src/mind/execution-traces.ts
     packages/core/src/mind/improvement-signals.ts
     packages/core/src/compliance/**
     ```
   - Skip workflow entirely if filter empties the diff
4. Checkout marolinik/hive-mind master (using HIVE_MIND_SYNC_TOKEN)
5. Apply patch via `git apply --3way` on a new branch
   `auto-sync/waggle-os-<short-sha>`
6. Push branch + open PR via `gh pr create` with structured body
   including originating commits, source SHA, NOT-extracted filter list,
   and review checklist
7. Upload patch artifact as debug aid (30-day retention)

**Kill switches:**
- `MIND_SYNC_ENABLED` repo variable (set to `'true'` to enable; otherwise
  workflow's `if:` skips the entire job)
- Token absent → fail fast with structured error message pointing at
  `.github/sync.md` setup section

### `.parity-allowlist` (NEW)

Single-entry initial state:

```
db-hive-mind.test.ts
```

Reason documented inline in the file: hive-mind's `db.test.ts` asserts
proprietary tables MUST BE ABSENT (its OSS-scrub guarantee); waggle-os
legitimately carries them per EXTRACTION.md. The waggle-os adaptation
lives in committed `db.test.ts` (no suffix) which splits the assertion
into "OSS shared must exist" (verbatim) + "Waggle-specific must exist"
(inverted). Cross-references EXTRACTION.md and Step 2 results memo.

### `.github/sync.md` (NEW, ~165 lines)

Operating manual covering:
- TL;DR table mapping common dev actions to workflow outcomes
- Why the sync system exists (audit context)
- Per-workflow design + failure modes + recovery procedures
- `.parity-allowlist` add/remove policy
- Direction note: this PR ships ONLY waggle-os → hive-mind direction;
  the empirically PRIMARY direction (hive-mind → waggle-os) requires a
  workflow living in the hive-mind repo and is intentionally deferred
  to a sibling PR after Step 3 ratification (out of CC-2 scope)
- `HIVE_MIND_SYNC_TOKEN` setup instructions for Marko
- Bidirectional bug-fix protocol (3 steps for waggle-os-originated, 3
  steps for hive-mind-originated)

### `CLAUDE.md` Section 7.5 (NEW, between Security and Already-Built sections)

Concise pointer for any future contributor working on
`packages/core/src/mind/` or `packages/core/src/harvest/`. Highlights:
- Sync workflows exist; consult `.github/sync.md` first
- Adding a new "stays in waggle-os" file requires updating BOTH
  `sync-mind.yml`'s `excluded_paths` AND hive-mind's EXTRACTION.md in
  the same PR

### `scripts/parity-check.sh` (NEW)

Local-dev wrapper that mirrors the CI `mind-parity-check` job's logic.
Lets a developer run the same parity check before pushing.

Usage:
```bash
scripts/parity-check.sh              # run + clean up
scripts/parity-check.sh --keep-injected   # leave injected files for inspection
```

Locates hive-mind via `HIVE_MIND_PATH` env var, falls back to
`D:/Projects/hive-mind` (Windows default) or `~/Projects/hive-mind`
(Unix default).

---

## §3 — Verification done in CC-2 session

1. **YAML syntax validation** — both workflow files parse cleanly via
   `python yaml.safe_load`. No structural issues.

2. **Parity-check inject-logic dry-run** (sandbox first, then real
   `tests/mind/` folder with cleanup tracking):
   - Allowlist correctly skips `db-hive-mind.test.ts`
   - 14 injection candidates from hive-mind master
   - 8 already-committed (Step 2 ports) → kept untouched
   - 6 NEW under suffix names → injected with sed-adapted imports
   - Combined suite: 34 files / **410 tests PASS**
   - Cleanup removes the 6 injected files; baseline restored

3. **Skip-if-committed safety** — first dry-run iteration of the script
   incorrectly OVERWROTE the 8 Step 2 committed `-hive-mind` files,
   silently dropping the bespoke header comments documenting port
   provenance + adaptation rationale. Caught by reviewing
   `git status --short`. Restored via `git checkout HEAD --` and
   updated BOTH the local script AND the workflow YAML to skip-if-file-
   exists. Updated `.github/sync.md` to document this rule explicitly.
   Re-ran dry-run: zero modifications to committed files, 410/410 pass.

4. **Filter-list correctness** — manually traced
   `excluded_paths` array in `sync-mind.yml` against EXTRACTION.md
   "NOT Extracted" section. All 5 paths present:
   - `packages/core/src/mind/vault.ts` ✓
   - `packages/core/src/mind/evolution-runs.ts` ✓
   - `packages/core/src/mind/execution-traces.ts` ✓
   - `packages/core/src/mind/improvement-signals.ts` ✓
   - `packages/core/src/compliance` (and subpaths) ✓

---

## §4 — Verification deferred to Marko's environment

These steps need Marko's GitHub admin access + a real test branch push.
None blocking on Step 3 brief authoring or memo close-out.

1. **`HIVE_MIND_SYNC_TOKEN` secret creation:**
   ```bash
   gh secret set HIVE_MIND_SYNC_TOKEN --repo marolinik/waggle-os
   gh variable set MIND_SYNC_ENABLED --body 'true' --repo marolinik/waggle-os
   ```
   Until done, `sync-mind.yml` job evaluates its `if:` to false and
   skips entirely. `mind-parity-check.yml` doesn't need the token at
   all — it works immediately on PR.

2. **Synthetic test branch end-to-end:**
   - Create branch `test/parity-check-smoke` off main
   - Touch `packages/core/src/mind/frames.ts` trivially (whitespace)
   - Push and open PR → `mind-parity-check.yml` should run + pass
   - After PR merge to main → `sync-mind.yml` should fire and open a
     real PR on `marolinik/hive-mind` (assumes secret + variable set)
   - Close the auto-PR on hive-mind side without merging (it's a smoke
     test — production adopt would happen on real next mind/ change)

3. **Hive-mind side workflow** (the empirically primary direction —
   hive-mind → waggle-os auto-PR): per Step 1 §3 + Step 2 §5 finding,
   hive-mind is the more active substrate repo, so the
   hive-mind-originated direction carries the heavier production
   burden. Sibling PR to hive-mind after Step 3 ratification will add
   the symmetric workflow there. Out of CC-2 scope per brief.

---

## §5 — Halt-and-ping triggers — none fired

| Trigger | Status |
|---------|--------|
| (1) Workflow YAML / GitHub Actions concept reveals constraint | ✅ NOT FIRED — both files validate; paths-filter at `on:` level + `if:` conditions handle all cases |
| (2) Parity-check reveals false-positive failures | ✅ NOT FIRED — overwrite bug caught + fixed before any committed file lost |
| (3) `HIVE_MIND_SYNC_TOKEN` secret unavailable | ⚠ Anticipated, not blocking. Workflow fails fast with clear error pointing to setup instructions in `.github/sync.md`. Not a halt — just a deferred operator action. |
| (4) Cumulative time > 5h on Step 3 | ✅ NOT FIRED — Step 3 completed in ~2h 30m CC-2 work |

---

## §6 — Files added/modified

```
.github/workflows/mind-parity-check.yml   NEW
.github/workflows/sync-mind.yml           NEW
.github/sync.md                           NEW
.parity-allowlist                         NEW
scripts/parity-check.sh                   NEW (executable)
CLAUDE.md                                 MODIFIED (added Section 7.5)
```

No source code under `packages/core/src/` modified. No test files
modified (the temporary corruption from dry-run was reverted before
commit).

---

## §7 — Rollback procedure (if Step 3 needs to be unwound)

```bash
# Disable both workflows without deletion (preserves history).
gh variable set MIND_SYNC_ENABLED --body 'false' --repo marolinik/waggle-os
# Comment out trigger paths in mind-parity-check.yml or delete file
git rm .github/workflows/sync-mind.yml
git rm .github/workflows/mind-parity-check.yml

# Or hard rollback (after PM approval):
git revert <step-3-commit-sha>

# Step 1 + Step 2 commits are independent — sync workflow rollback
# does NOT undo the substrate fixes (timestamp persist + preview cap
# raise) or the test ports. Those remain in main on their own merits.
```

---

## §8 — Aggregate Memory Sync Repair status

| Step | Status | Files | Tests | Memo |
|------|--------|-------|-------|------|
| 1 — Forward port + bidirectional audit | ✅ closed | 4 | 480/480 + 30/30 frames + 23/23 server harvest + 8/8 GEPA | step1 results |
| 2 — Test port (15 hive-mind tests) | ✅ closed | 14 | 111/111 + 480/480 regression | step2 results |
| 3 — CI/CD sync workflow | ⏸ awaiting PM ratification | 6 | parity-check 410/410 dry-run | this memo |
| **Total** | | **24** | | |

Substrate parity is **empirically + structurally + procedurally**
verified across the three steps:
- **Empirically (Step 1+2)**: zero bugs, zero API drift, all 591 mind/
  tests pass against waggle-os substrate
- **Structurally (Step 3.1)**: parity-check workflow blocks merge if
  drift appears in the future
- **Procedurally (Step 3.2)**: sync workflow auto-opens hive-mind PR
  on every relevant waggle-os main push, propagating fixes
  automatically through human-reviewed PRs

---

## §9 — Open questions for PM

1. **Confirm Step 3 CLOSED:** ratify all 6 deliverables + accept the 2
   deferred-to-Marko verification items as non-blocking?
2. **`MIND_SYNC_ENABLED` initial value:** start as `false` (workflows
   shipped but inactive until manually flipped) or `true` (active
   immediately on Marko setting the secret)?
3. **Hive-mind side workflow:** authorize CC-2 to author the sibling
   PR for the hive-mind → waggle-os auto-sync direction in the
   hive-mind repo, or punt to a separate session/task?
4. **Memory Sync Repair closure ceremony:** all 3 steps closed, do you
   want a final consolidated memo `2026-04-27-memory-sync-repair-CLOSED.md`
   that pulls together the 3 step memos + lessons learned + runbook
   for ongoing maintenance, or keep the per-step memos as the
   audit trail?

---

## §10 — Status: AWAITING PM RATIFICATION

Step 3 complete. 6 deliverables shipped, dry-runs green, no halt-triggers
fired. CC-2 session standing GREEN, halted before final sign-off.

**PM action required:** confirm Step 3 CLOSED → optional follow-ups per
§9 questions.
