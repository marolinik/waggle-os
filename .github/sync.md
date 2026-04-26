# Memory Substrate Sync — `waggle-os` ↔ `hive-mind`

This document is the operating manual for the two GitHub Actions workflows
that keep `packages/core/src/mind/` and `packages/core/src/harvest/` in
sync with the OSS release artifact at
[`marolinik/hive-mind`](https://github.com/marolinik/hive-mind).

> **Audience:** anyone modifying files under `packages/core/src/mind/` or
> `packages/core/src/harvest/`. If you only touch `packages/agent/`,
> `packages/server/`, `apps/web/`, etc., none of this applies — those
> paths are explicitly Waggle-only per
> [`hive-mind/EXTRACTION.md`](https://github.com/marolinik/hive-mind/blob/master/EXTRACTION.md).

---

## TL;DR

| What you did | What happens |
|--------------|--------------|
| Modify `packages/core/src/mind/foo.ts` and open a PR | `mind-parity-check` runs hive-mind's tests against your change. Failure blocks merge unless allowlisted. |
| Merge the PR to `main` | `sync-mind-to-hive-mind` opens a PR on `marolinik/hive-mind` with the filtered diff. Manual review there before merge. |
| Want to skip a parity test that's intentionally divergent | Add the basename to `.parity-allowlist` with a comment explaining why. |
| Modify `packages/core/src/mind/vault.ts` (NOT-extracted) | Sync workflow filters this out automatically — nothing leaks to hive-mind. |

---

## Why this exists

Both repos carry their own copy of `packages/core/src/mind/` and
`packages/core/src/harvest/`. The audit at
`PM-Waggle-OS/decisions/2026-04-26-memory-sync-audit.md` documented the
status quo before this workflow shipped:

- No automated sync existed; bug fixes flowed in both directions ad-hoc.
- Two production bug fixes that landed in hive-mind never made it back
  to waggle-os until the manual Step 1 backport (commits `89c1004` +
  `fed4a20`).
- The OSS release artifact and the production substrate had silently
  drifted in 2/19 mind/ files.

The two workflows below close that gap. Their goal is **detection +
human-reviewed propagation**, never automatic merge.

---

## Workflow 1 — `mind-parity-check.yml`

**File:** `.github/workflows/mind-parity-check.yml`
**Trigger:** PR or push to `main` that touches `packages/core/src/mind/`,
`packages/core/src/harvest/`, or `packages/core/tests/mind/`.
**Outcome:** test-pass = ✅ block-clear; test-fail = ❌ merge blocked.

### What it does, step by step

1. Checks out **both** repos — waggle-os in `./waggle-os/`, hive-mind
   master in `./hive-mind/`.
2. Runs the **waggle-os baseline** mind/ test suite. This is the
   committed Step 2 ports plus all pre-existing waggle-os mind/ tests.
   If this fails, the PR is rejected on a regular regression — same as
   any other failing test.
3. **Injects** the latest hive-mind tests into the waggle-os checkout
   under `<basename>-hive-mind.test.ts` filenames, with import paths
   adapted via `sed` from `./*.js` to `../../src/mind/*.js`. Three rules
   govern what gets injected:
   - **`.parity-allowlist`**: filenames listed here are skipped entirely.
   - **Already-committed `-hive-mind` file**: kept as-is. The committed
     version (typically a Step 2 port with bespoke header comments
     documenting provenance and adaptation rationale) is what the parity
     check exercises — overwriting it with the latest hive-mind verbatim
     content would silently drop those headers and any waggle-os-side
     adaptations.
   - **No collision**: copy hive-mind file as `<basename>-hive-mind.test.ts`
     into `tests/mind/`, sed the imports.
4. Runs the **combined suite** (waggle-os baseline + injected
   hive-mind tests). If hive-mind has added new test cases since the
   last Step 2 port, they'll surface here. Failure here means waggle-os
   has accidentally diverged from hive-mind's surface contract.
5. Emits an **informational diff** of shared substrate file sizes —
   not a gate, just visibility.

### When it fails

| Failure mode | What it means | What to do |
|--------------|---------------|------------|
| Baseline waggle-os mind/ tests fail | Regular regression | Fix your change |
| `<x>-hive-mind.test.ts` (suffixed) fails | hive-mind tests a behavior waggle-os doesn't honor any more | Decide: (a) accept and fix waggle-os to match hive-mind, OR (b) document intentional divergence and add to `.parity-allowlist` |
| Test fails because of import-path adaptation drift | hive-mind reorganized imports | Update the `sed` rules in `mind-parity-check.yml` |
| `db-hive-mind.test.ts` fails (always — see allowlist) | The proprietary-tables-must-be-absent assertion mismatches Waggle's schema | This is in `.parity-allowlist` already; if you removed it, restore it |

### `.parity-allowlist` policy

The file at the repo root lists test basenames whose verbatim hive-mind
copy is intentionally skipped during the parity check.

```
# Comment describing why this entry exists
file-name.test.ts
```

**Adding an entry** requires a comment line directly above with the
divergence rationale and at least one cross-reference (EXTRACTION.md
section, PM-Waggle-OS memo, or related PR).

**Removing an entry** is allowed only when the divergence is resolved
— either hive-mind upstream changed or waggle-os adopted the upstream
behavior. Re-running parity check should pass without the entry first.

The current single entry is `db-hive-mind.test.ts` because hive-mind's
`db.test.ts` asserts proprietary tables (ai_interactions,
execution_traces, evolution_runs, improvement_signals, install_audit)
MUST BE ABSENT — its OSS-scrub guarantee. Waggle-os carries those
tables legitimately. The waggle-os adaptation lives in committed
`db.test.ts` (no suffix) which splits the original assertion into "OSS
shared must exist" (verbatim from hive-mind) + "Waggle-specific must
exist" (inverted). See
`PM-Waggle-OS/decisions/2026-04-26-memory-sync-step2-test-port-results.md`.

---

## Workflow 2 — `sync-mind.yml`

**File:** `.github/workflows/sync-mind.yml`
**Trigger:** push to `main` that touches `packages/core/src/mind/` or
`packages/core/src/harvest/`.
**Outcome:** opens a PR on `marolinik/hive-mind` with the filtered
diff. **Never auto-merges.** The PR sits for manual review on the
hive-mind side.

### Direction note (binding)

This workflow implements ONLY the **waggle-os → hive-mind** direction.
The empirically primary direction (**hive-mind → waggle-os**) requires
a workflow living **inside the hive-mind repo**, which is out of scope
for the waggle-os Step 3 PR. It will be added via a sibling PR to
hive-mind once Step 3 here is ratified by PM. The current Memory Sync
Repair audit shows hive-mind is the more active substrate repo (ahead
in 2/5 audit dimensions, +14 organic test files), so the
hive-mind-side workflow carries the heavier production burden.

### Filter list — NOT-extracted paths

The workflow excludes these paths from the patch — leaking them into
hive-mind would put Waggle-specific code into the Apache-2.0 release
artifact:

```
packages/core/src/mind/vault.ts
packages/core/src/mind/evolution-runs.ts
packages/core/src/mind/execution-traces.ts
packages/core/src/mind/improvement-signals.ts
packages/core/src/compliance/**
```

This list mirrors the "NOT Extracted" section of
[`hive-mind/EXTRACTION.md`](https://github.com/marolinik/hive-mind/blob/master/EXTRACTION.md).
**If you add a new NOT-extracted file, update the workflow's
`excluded_paths` array AND EXTRACTION.md in the same PR** — otherwise
the file will leak on the next mind/ push.

### Setup — `HIVE_MIND_SYNC_TOKEN`

This workflow needs a fine-grained PAT scoped to `marolinik/hive-mind`
with `pull_request: write` + `contents: write` permissions. Marko
configures it via:

```bash
gh secret set HIVE_MIND_SYNC_TOKEN --repo marolinik/waggle-os
gh variable set MIND_SYNC_ENABLED --body 'true' --repo marolinik/waggle-os
```

The `MIND_SYNC_ENABLED` repository variable is the kill switch — set
it to `false` to disable the workflow entirely without removing the
secret. The workflow's `if:` condition checks this before running.

If `HIVE_MIND_SYNC_TOKEN` is unset, the workflow fails fast with a
clear error rather than silently skipping.

### When the patch doesn't apply

`git apply --3way` falls back to a 3-way merge when the index
mismatch is small. If even that fails, the workflow exits with an
error pointing to the source SHA. Manual reconciliation:

1. Check out hive-mind master locally.
2. `git apply` the patch from the workflow run's
   `sync-patch-<sha>` artifact.
3. Resolve conflicts; commit on a branch named
   `auto-sync/waggle-os-<short-sha>`.
4. Open the PR by hand following the same body template.

This is rare in practice because hive-mind's mind/ files are mostly
verbatim extractions of waggle-os's — any genuine conflict means
hive-mind has its own change at the same lines, which is exactly the
case the human review is supposed to catch.

---

## Bidirectional bug fix protocol

When you find a bug whose fix should go into BOTH repos:

1. Fix it in waggle-os first (production-impacted).
2. Merge to waggle-os main → `sync-mind.yml` auto-opens a hive-mind PR.
3. Review and merge the hive-mind PR.
4. Confirm the next `mind-parity-check` on waggle-os main is green —
   that closes the loop.

When the bug originates in hive-mind (e.g. an upstream contributor
reports it):

1. Wait for the hive-mind PR (or open it yourself).
2. After it merges, the eventual hive-mind→waggle-os auto-PR (when
   that workflow ships) will pick it up.
3. Until then, manual cherry-pick to waggle-os, identical to Step 1
   of the original sync repair (see Step 1 results memo at
   `PM-Waggle-OS/decisions/2026-04-26-memory-sync-step1-results.md`
   for the canonical pattern: commit message references hive-mind SHA
   verbatim).

---

## Cross-references

- Audit + 3-step plan: `PM-Waggle-OS/decisions/2026-04-26-memory-sync-audit.md`
- Step 1 results (forward-port + bidirectional audit): `PM-Waggle-OS/decisions/2026-04-26-memory-sync-step1-results.md`
- Step 2 results (test port): `PM-Waggle-OS/decisions/2026-04-26-memory-sync-step2-test-port-results.md`
- Step 3 results (this workflow): `PM-Waggle-OS/decisions/2026-04-26-memory-sync-step3-cicd-results.md`
- EXTRACTION.md: `D:\Projects\hive-mind\EXTRACTION.md` (or [GitHub link](https://github.com/marolinik/hive-mind/blob/master/EXTRACTION.md))
