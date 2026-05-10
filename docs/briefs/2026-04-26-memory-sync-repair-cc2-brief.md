# Memory Sync Repair — CC-2 Paste-Ready Brief

**Date:** 2026-04-26
**Authority:** PM (Marko ratifikovao 2026-04-26 — sve 3 step-a + paralelna CC-2 sesija)
**Companion document:** `decisions/2026-04-26-memory-sync-audit.md` (full audit + diagnostic context)
**Sequencing:** Step 1 → Step 2 → Step 3 (sequential, halt-and-ping nakon svakog)
**Parallel constraint:** Independent od CC-1 agent fix sprint Phase 1.x; no shared code paths, no merge conflict expected

---

## §1 — Goal

Sync repair između `D:\Projects\waggle-os\packages\core\src\mind\` (production substrate, used by Tauri desktop) i `D:\Projects\hive-mind\packages\core\src\mind\` (Apache-2.0 release artifact, npm publishable). Trenutno divergent — bug fixes idu u oba pravca bez automated sync.

**Final state target:**
1. Bug fixes back-portovani u oba pravca (no production bugs unfixed)
2. Tests u oba repoa (production code coverage matches release artifact coverage)
3. CI/CD sync workflow (parity check + auto-PR creation) — divergence ne raste organički

---

## §2 — Step 1: Back-port hive-mind bug fixes u waggle-os (1-3h work)

### 2.1 — Cherry-pick targets (binding)

Two fixes from hive-mind:

**Fix A — `9ec75e6` Stage 0 root cause:**
```
fix(harvest-local): persist item.timestamp to memory_frames.created_at (Stage 0 root cause)
```

Action: `git -C D:\Projects\hive-mind show 9ec75e6` to read patch. Apply equivalent change u waggle-os/packages/core/src/mind/ + harvest pipeline. NOTE: hive-mind paths su `packages/core/src/mind/` ali file content nije identical sa waggle-os; cherry-pick će biti **manual application of fix logic, ne raw git cherry-pick** jer su file SHAs different.

**Fix B — `0bbdf7a` content preview cap:**
```
fix(harvest-local): raise content preview cap 2000 → 10000 chars (Stage 0 Task 0.5)
```

Action: identičan pattern. Read hive-mind patch, apply equivalent change u waggle-os. Verify cap je sad 10000.

### 2.2 — Bidirectional audit (waggle-os → hive-mind candidates)

Three waggle-os commits koji potencijalno treba u hive-mind:

**Candidate 1 — `63ef881`:**
```
fix(frames): findDuplicate must use JS trim, not SQLite trim
```

Action: read waggle-os patch. Compare against hive-mind `packages/core/src/mind/frames.ts`. If hive-mind has identical bug pattern, port fix to hive-mind. If hive-mind code is different (e.g., already uses JS trim, or refactored differently), document and skip.

**Candidate 2 — `803c6f6`:**
```
fix(memory-mcp): harvest_import / ingest_source dedup detection uses frame id, not timestamp
```

Action: read waggle-os patch. Compare against hive-mind `packages/mcp-server/src/tools/harvest.ts` (or equivalent). If bug exists, port. If already fixed or N/A, document.

**Candidate 3 — `b8ffe8e`:**
```
fix(agent,core): Day-1-PM correctness cluster from orchestrator review
```

Action: this is a multi-file fix. Filter to changes touching `packages/core/src/mind/` only. If any mind/ changes exist, audit each whether they apply to hive-mind. Agent-side changes (`packages/agent/`) are explicitly Waggle-only per EXTRACTION.md, do not port.

### 2.3 — Step 1 acceptance criteria

- [ ] Both Fix A + Fix B applied to waggle-os, compile clean (`tsc --noEmit`)
- [ ] Existing waggle-os tests pass (no regression)
- [ ] Both fixes have explicit commit message referencing source hive-mind SHA: e.g., `fix(harvest): port hive-mind 9ec75e6 (Stage 0 root cause: timestamp persist)`
- [ ] Three Candidates 1-3 audited; each has explicit Y/N decision in commit body or PM-Waggle-OS decisions/ memo
- [ ] If any Candidate ports to hive-mind, separate hive-mind commit + PR opened
- [ ] PM ratification halt before Step 2 kickoff

---

## §3 — Step 2: Port hive-mind tests u waggle-os (4-8h work)

### 3.1 — Test files to port

From `D:\Projects\hive-mind\packages\core\src\mind\` (15 test files):
- awareness.test.ts
- concept-tracker.test.ts
- db.test.ts
- embedding-provider.test.ts
- entity-normalizer.test.ts
- frames.test.ts
- identity.test.ts
- inprocess-embedder.test.ts
- knowledge.test.ts
- litellm-embedder.test.ts
- ontology.test.ts
- reconcile.test.ts
- scoring.test.ts
- search.test.ts
- sessions.test.ts

### 3.2 — Test placement convention

Verify existing waggle-os test placement convention:
- Check `D:\Projects\waggle-os\packages\core\src\` for existing `*.test.ts` files
- Check `D:\Projects\waggle-os\tests\` or `D:\Projects\waggle-os\packages\core\tests\` for separate test folder convention
- Check `vitest.config.ts` and `package.json` test scripts u waggle-os/packages/core/ za include/exclude patterns

Port tests to convention. Default: adjacent `*.test.ts` files in same directory as source.

### 3.3 — Run + classify

```
cd D:\Projects\waggle-os\packages\core
npm test -- --reporter=verbose
```

Per failed test, classify:

- **PASS**: API match, test validno za waggle-os production code
- **FAIL — bug u waggle-os**: identify, fix, document. If fix exists in hive-mind, cherry-pick same way as Step 1.
- **FAIL — API mismatch**: waggle-os ima Waggle-specific extension koja menja signature/behavior. Two sub-options:
  - (i) Test ne primenjuje se na waggle-os; document u test file kao `.skip()` sa komentarom + PM-Waggle-OS memo entry
  - (ii) Test treba prilagoditi Waggle-specific extension sa adapter wrapper; document u memo + reach out PM ako adapter scope > 30 minuta
- **FAIL — test depends on hive-mind-only utility**: dependency missing u waggle-os (npm import not available). Either install dep, or skip + document.

### 3.4 — Step 2 acceptance criteria

- [ ] All 15 test files ported to waggle-os (or explicitly skipped sa documented reason)
- [ ] Per-test outcome documented u summary table (PASS / FAIL bug / FAIL extension / FAIL dependency)
- [ ] Bug fixes from FAIL → bug applied to waggle-os
- [ ] Summary report posted to `D:\Projects\PM-Waggle-OS\decisions\2026-04-26-memory-sync-step2-test-port-results.md`
- [ ] PM ratification halt before Step 3 kickoff

---

## §4 — Step 3: CI/CD sync workflow (3-5h work)

### 4.1 — Workflow A: `mind-parity-check`

File: `D:\Projects\waggle-os\.github\workflows\ci.yml` (extend existing) — add new job:

```yaml
mind-parity-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        path: waggle-os
    - uses: actions/checkout@v4
      with:
        repository: marolinik/hive-mind
        path: hive-mind
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - name: Copy hive-mind tests to waggle-os
      run: |
        cp hive-mind/packages/core/src/mind/*.test.ts waggle-os/packages/core/src/mind/ || true
    - name: Install + run tests
      run: |
        cd waggle-os
        npm install
        npm test --workspace=@waggle/core -- --testPathPattern='packages/core/src/mind'
    - name: Compare critical files (informational)
      run: |
        for f in frames.ts search.ts knowledge.ts schema.ts; do
          if ! diff -q waggle-os/packages/core/src/mind/$f hive-mind/packages/core/src/mind/$f > /dev/null 2>&1; then
            echo "DIFF: $f"
          fi
        done
```

Trigger: PR + push na main, paths-filter ako touch-uje `packages/core/src/mind/` ili `packages/core/src/harvest/`.

Pass criteria: hive-mind tests pass na waggle-os codebase. Failing tests = block merge unless explicitly allowlisted (.parity-allowlist file in repo root sa documented reason per allowed test).

### 4.2 — Workflow B: `mind-sync-pr`

New file: `D:\Projects\waggle-os\.github\workflows\sync-mind.yml`:

```yaml
name: Sync Mind to hive-mind
on:
  push:
    branches: [main]
    paths:
      - 'packages/core/src/mind/**'
      - 'packages/core/src/harvest/**'
      - '!packages/core/src/mind/vault.ts'
      - '!packages/core/src/mind/evolution-runs.ts'
      - '!packages/core/src/mind/execution-traces.ts'
      - '!packages/core/src/mind/improvement-signals.ts'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Generate diff for hive-mind
        run: |
          # extract changes from this push (excluding NOT-extracted files per EXTRACTION.md)
          # ... script to generate filtered patch
      - name: Open PR to hive-mind
        # use github API or gh CLI to open PR with filtered diff
```

Filter list (NOT-extracted, must be excluded from sync):
- `packages/core/src/mind/vault.ts`
- `packages/core/src/mind/evolution-runs.ts`
- `packages/core/src/mind/execution-traces.ts`
- `packages/core/src/mind/improvement-signals.ts`
- `packages/core/src/compliance/**`
- (any other files marked "NOT extracted" in `D:\Projects\hive-mind\EXTRACTION.md`)

PR review: manual u hive-mind. PR title format: `auto-sync from waggle-os@{sha}: {original commit subject}`.

PR creation requires `HIVE_MIND_SYNC_TOKEN` repository secret (GitHub PAT sa repo write access to marolinik/hive-mind).

### 4.3 — Step 3 acceptance criteria

- [ ] Both workflows committed u waggle-os/.github/workflows/
- [ ] `mind-parity-check` test run on synthetic test branch (touch a mind/ file, verify CI runs hive-mind tests against the change)
- [ ] `mind-sync-pr` test run on synthetic test branch (touch a mind/ file, push to main, verify auto-PR opens u hive-mind)
- [ ] `HIVE_MIND_SYNC_TOKEN` secret configured u waggle-os repo settings (Marko handles secret creation; CC-2 cannot)
- [ ] Documentation u waggle-os/.github/README.md ili separate sync.md: how sync works, how to add to allowlist, how to handle bidirectional bug fixes
- [ ] `D:\Projects\PM-Waggle-OS\decisions\2026-04-26-memory-sync-step3-cicd-results.md` summary report
- [ ] PM ratification + final sign-off

---

## §5 — Halt-and-ping triggers (binding)

1. **Step 1 cherry-pick reveals fix doesn't apply cleanly** (file structure changed dramatically): halt + ping PM + document specific deviation
2. **Step 2 reveals >5 tests FAIL — bug u waggle-os** (bigger than back-port can handle quickly): halt + ping PM, scope decision (cherry-pick all, defer some, refactor)
3. **Step 2 reveals API mismatch on critical files** (frames.ts, search.ts, knowledge.ts): halt + ping PM, decide whether Waggle-specific extension is intended or accidental drift
4. **Step 3 secret token not available**: halt + ping PM, Marko provides via `gh secret set` or repo settings
5. **Cumulative time exceeds 16h** (Step 1 + 2 + 3): halt + ping PM, scope re-evaluation

---

## §6 — Cost ceiling

No API spend (this is local code work + GitHub API calls for PR creation only).
GitHub Actions minutes (free tier sufficient for this volume).

Estimated total time: 8-15h CC-2 work + ~30 min PM review per step (3 PM halts).

---

## §7 — What NOT to do (hard rules)

- **DO NOT** apply hive-mind code wholesale to waggle-os (would lose Waggle-specific extensions). Fix-by-fix targeted patches only.
- **DO NOT** apply waggle-os code wholesale to hive-mind (would leak Waggle-specific schema/compliance/tier code into Apache-2.0 release). Filter per EXTRACTION.md "NOT extracted" list always.
- **DO NOT** disable existing waggle-os tests to make hive-mind tests pass. Identify root cause and fix the actual bug or document the legitimate API mismatch.
- **DO NOT** skip Step 1 PM ratification halt to "save time". The 3 candidate audits (63ef881, 803c6f6, b8ffe8e) require PM judgment on whether to port to hive-mind.
- **DO NOT** make this a "rewrite both repos to align" exercise. The 3-step plan is targeted: bug fixes + tests + CI sync. Don't expand scope without PM ratification.

---

## §8 — Cross-references

- `decisions/2026-04-26-memory-sync-audit.md` — full audit + diagnostic context (read first)
- `D:\Projects\hive-mind\EXTRACTION.md` — file-by-file map of what's extracted vs NOT extracted
- Pilot evidence: `decisions/2026-04-26-pilot-verdict-FAIL.md`
- Agent fix sprint plan: `D:\Projects\waggle-os\decisions\2026-04-26-agent-fix-sprint-plan.md` (CC-1 sprint, parallel)
- Sprint plan addendum (Phase 4 acceptance gate): commit `2ad3688` u waggle-os
- Phase 1.1 commit: `4a557cc` u waggle-os
