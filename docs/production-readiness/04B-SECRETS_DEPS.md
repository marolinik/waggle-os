# 04B — Secret Scanning & Dependency Audit

**Auditor:** Claude Opus 4.6 (automated)
**Date:** 2026-03-20
**Scope:** Full codebase secret scan, git history review, npm dependency audit, .gitignore assessment
**Mode:** READ-ONLY

---

## Executive Summary

| Category | Risk Level | Finding Count |
|----------|-----------|---------------|
| Leaked Secrets (current branch) | LOW | 0 real leaks in working tree |
| Leaked Secrets (git history) | **CRITICAL** | 1 full API key in git history |
| `.env` on disk | MEDIUM | Real keys present, correctly gitignored |
| Dependency CVEs | MODERATE | 5 vulnerabilities (1 high, 4 moderate) |
| `.gitignore` coverage | LOW | Good coverage, minor gaps |

**Overall Risk: HIGH** — due to the unresolved API key in git history that requires history rewriting to fully remediate.

---

## 1. Secret Scan Results

### SEC-001: Anthropic API Key in Git History (CRITICAL)

- **Status:** CRITICAL — key remains in git history
- **Key:** `sk-ant-***REDACTED*** (revoked 2026-03-20)`
- **Location:** `UAT/artifacts/api-test-results.md` line 133
- **Commits containing full key:**
  - `c29d75f` (branch: `phase6-capability-truth` + worktree branches)
  - `563d093` (branch: `phase6-capability-truth`)
- **Current branch status:** REDACTED on `phase8-wave-8f-ui-ux` (shows `sk-ant-***REDACTED***`)
- **Remote status:** Remote `origin/phase8-wave-8f-ui-ux` has the redacted version
- **Redaction commit:** `bffcd34` was an EMPTY commit (no file changes). The actual redaction happened via a separate commit on the current branch (`563d093`), but the old branch `phase6-capability-truth` still contains commit `c29d75f` with the full key.
- **GitHub exposure:** The `phase6-capability-truth` branch was NOT pushed to remote (no tracking branch), so the full key is NOT on GitHub. However, any `git push --all` or force-push of that branch would expose it.
- **Action required:**
  1. **IMMEDIATE:** Verify the API key has been revoked in the Anthropic dashboard (commit message says "must be revoked")
  2. **SHORT-TERM:** Delete the `phase6-capability-truth` branch and all `worktree-agent-*` branches locally
  3. **LONG-TERM:** Run `git filter-repo` or BFG Repo-Cleaner to purge the key from all history, then force-push

### SEC-002: .env File on Disk with Real Credentials (MEDIUM)

- **File:** `D:\Projects\MS Claw\waggle-poc\.env`
- **Contents include:**
  - `ANTHROPIC_API_KEY=sk-ant-***REDACTED***` (same key as SEC-001, revoked)
  - `DATABASE_URL=postgres://waggle:waggle_dev@localhost:5434/waggle` (local dev)
  - `REDIS_URL=redis://localhost:6381` (local dev)
  - `CLERK_SECRET_KEY=sk_test_6k3SoMR...` (Clerk test key)
  - `CLERK_PUBLISHABLE_KEY=pk_test_c3Rpcn...` (Clerk test key)
  - `LITELLM_MASTER_KEY=sk-waggle-dev` (local dev placeholder)
- **Git status:** NOT tracked (`.gitignore` covers `.env` and `.env.*`)
- **Risk:** Low for source control, but the file should use the revoked/rotated key after SEC-001 remediation

### SEC-003: Hardcoded Local Dev Database Credentials (LOW)

- **Pattern:** `postgres://waggle:waggle_dev@localhost:5434/waggle` hardcoded as fallback in 6 files
- **Files:**
  - `packages/server/src/config.ts`
  - `packages/server/src/db/migrate.ts`
  - `packages/server/drizzle.config.ts`
  - `packages/worker/src/index.ts`
  - `packages/worker/tests/job-processor.test.ts`
  - `packages/server/tests/db/schema.test.ts`
- **Assessment:** These are local development defaults with a weak password (`waggle_dev`). Standard practice for local Docker dev environments. Production uses `DATABASE_URL` env var from Render/Docker secrets.
- **Recommendation:** Consider removing hardcoded fallbacks from non-test production code (`config.ts`, `migrate.ts`, `worker/src/index.ts`) and failing explicitly if `DATABASE_URL` is not set.

### SEC-004: Test Fixture API Keys (OK — No Action)

All other `sk-ant-` matches are in:
- **Test files** (`.test.ts`): `sk-ant-test-key`, `sk-ant-secret-key-123`, `sk-ant-key-1`, `sk-ant-123` — mock values
- **Documentation** (`.md`): `sk-ant-your-key-here`, `sk-ant-...` — placeholder examples
- **UI code** (`.tsx`): `sk-ant-...` — placeholder text in input fields
- **Settings utils** (`.ts`): `sk-ant-` prefix string for validation

**Verdict:** All are legitimate test fixtures, placeholders, or validation logic. No real keys.

### SEC-005: No Other Secret Types Found (OK)

Scanned for and confirmed absent:
- OpenAI keys (`sk-` + 20+ alphanumeric): Only test fixtures found
- Private keys (`-----BEGIN.*PRIVATE KEY-----`): None
- GitHub tokens (`ghp_`, `github_pat_`): None
- JWTs (`eyJ` + 50+ chars): Only in playwright-report (bundled asset, not a real token)
- Base64-encoded secrets: None found outside expected contexts

---

## 2. Git History Findings

### Recent Commits (last 20)

```
d7b493d fix: remove aggressive text truncation from tool cards and results
1545bb8 fix: workspace home + chat area — proper Tailwind layout, spacing, scroll
7787daa fix: proper markdown rendering + spacing in chat messages
f5d40ca fix: eliminate all hardcoded gray/blue colors — unified Direction D palette
2d860b3 fix: final inline style cleanup — SessionTimeline, KGViewer
066909e feat: Phase 10 UI rewrite — Tailwind adoption across all views + components
bffcd34 security: redact leaked Anthropic API key from UAT artifacts  *** EMPTY COMMIT ***
97889f3 feat: V1 Production Launch — Phase 9 complete (47 slices, 7 waves)
74345d7 feat(ux): dark/light mode toggle in sidebar
...
```

### .env File History

- `.env.example` was committed in the initial scaffold commit (`3667732`). It contains only placeholder values (`sk-ant-...`, `sk_test_...`) — safe.
- No `.env` file was ever committed (confirmed via `git ls-files`).

### Deleted Sensitive Files

- No `.key`, `.pem`, `.p12`, or `.env` files were ever deleted from git history.

### Key History Issue

- Commit `bffcd34` ("security: redact leaked Anthropic API key from UAT artifacts") is an **empty commit** — it contains no file changes. The commit message claims redaction but no actual redaction was performed in that commit. The redaction was done separately on a different branch lineage (commit `563d093` on the current branch has the safe version, while commit `c29d75f` on `phase6-capability-truth` still has the full key).

---

## 3. Dependency Audit

### npm audit Summary

| Severity | Count | Fix Available |
|----------|-------|---------------|
| Critical | 0 | — |
| High | 1 | No fix available |
| Moderate | 4 | Breaking change required |
| Low | 0 | — |
| **Total** | **5** | |

**Total dependencies:** 688 (329 prod, 255 dev, 232 optional)

### CVE Details

#### HIGH: xlsx (all versions) — No Fix Available

- **Advisory:** [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) — Prototype Pollution
- **Advisory:** [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) — ReDoS
- **Used in:** `packages/server/src/local/routes/ingest.ts` (file upload/processing)
- **Dep declaration:** `packages/server/package.json` → `"xlsx": "^0.18.5"`
- **Risk assessment:** MODERATE — xlsx is used for processing user-uploaded spreadsheet files. The prototype pollution vulnerability could be exploited via crafted `.xlsx` files. Since this processes user input, it represents a real attack surface.
- **Recommendation:** Replace `xlsx` with `SheetJS CE` (`xlsx` is the community edition and has no maintainer fix) or migrate to an alternative like `exceljs` which is actively maintained.

#### MODERATE: esbuild <= 0.24.2 (via drizzle-kit)

- **Advisory:** [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — Dev server request hijacking
- **Chain:** `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild`
- **Risk assessment:** LOW — esbuild vulnerability only affects development servers, not production. This is a transitive dependency of `drizzle-kit` (a dev/migration tool).
- **Fix:** Upgrade `drizzle-kit` to latest (currently `^0.31.0`, latest `0.31.10` — but fix requires major version bump)

### Notably Outdated Packages

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `@clerk/fastify` | 2.6.28 | 3.1.3 | Major version behind — potential security fixes |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.1 | Major version behind |
| `vite` | 6.4.1 | 8.0.1 | Major version behind |
| `@anthropic-ai/sdk` | 0.78.0 | 0.80.0 | Minor version behind |
| `mcp-guardian` | 1.9.0 | 2.4.0 | Major version behind — security tool |
| `cron-parser` | 4.9.0 | 5.5.0 | Major version behind |

### Node.js Requirement

- **Specified:** `"node": ">=20.0.0"` in root `package.json`
- **Assessment:** Node 20 is the current LTS (Active LTS until 2026-10). Appropriate for production.

---

## 4. .gitignore Assessment

### Current Coverage

| Pattern | Status | Notes |
|---------|--------|-------|
| `node_modules/` | COVERED | |
| `.env` | COVERED | |
| `.env.*` | COVERED | Catches `.env.local`, `.env.production`, etc. |
| `*.mind` | COVERED | SQLite brain files |
| `*.db` | COVERED | Generic database files |
| `dist/` | COVERED | Build output |
| `coverage/` | COVERED | Test coverage |
| `*.tsbuildinfo` | COVERED | TypeScript incremental build |
| `app/src-tauri/target/` | COVERED | Rust build artifacts |
| `app/src-tauri/gen/` | COVERED | Tauri generated files |
| `app/src-tauri/resources/` | COVERED | Bundled runtimes |

### Missing / Recommended Additions

| Pattern | Risk | Recommendation |
|---------|------|----------------|
| `.vault-key` | LOW | Add `*.vault-key` or `.vault-key` — the vault key file is generated in the user's home dir, not the repo, but defense-in-depth |
| `vault.json` | LOW | Add `vault.json` — same reasoning as above |
| `*.pem` / `*.key` / `*.p12` | LOW | Add certificate/key file patterns for defense-in-depth |
| `*.log` | LOW | Log files could contain sensitive data |
| `.DS_Store` | TRIVIAL | macOS metadata files |
| `Thumbs.db` | TRIVIAL | Windows metadata files |

### Unusual Patterns in .gitignore

- `*.png` and `*.jpeg` are gitignored — this is unusual and means screenshots/images cannot be committed. Likely intentional to keep repo size small, but could be surprising.
- `*.ps1` is gitignored — PowerShell scripts cannot be committed. May be intentional to avoid platform-specific scripts in the repo.
- `docs/plans/` is gitignored — planning docs are excluded from the repo.

---

## 5. Overall Risk Assessment

### CRITICAL Issues (must fix before production)

1. **SEC-001:** Full Anthropic API key in git history. Even though the remote branch has the redacted version, the key exists in local branch history and could be pushed. The key MUST be confirmed revoked at the Anthropic dashboard. Local branches containing the key should be deleted. If the repo is ever made public or history is pushed, `git filter-repo` must be run first.

### HIGH Issues (should fix before production)

2. **xlsx dependency:** Known prototype pollution and ReDoS vulnerabilities with no available fix. Since it processes user-uploaded files, this is a real attack vector. Replace with `exceljs` or another maintained alternative.

### MEDIUM Issues (fix before or shortly after launch)

3. **SEC-003:** Hardcoded dev database fallback credentials in production source files. Should fail explicitly if `DATABASE_URL` is not set rather than falling back to dev credentials.
4. **@clerk/fastify major version behind:** Authentication library should be kept current for security patches.
5. **mcp-guardian major version behind:** Security-related library should be current.

### LOW Issues (address in regular maintenance)

6. **`.gitignore` gaps:** Add `.vault-key`, `vault.json`, `*.pem`, `*.key`, `*.log` patterns for defense-in-depth.
7. **Empty redaction commit:** `bffcd34` should be noted in project records as a no-op; the actual redaction was done on a different branch lineage.
8. **Other outdated packages:** Vite, `@vitejs/plugin-react`, `cron-parser` are major versions behind but not security-critical.

---

## Remediation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Verify Anthropic API key revoked | 5 min | Eliminates active credential risk |
| P0 | Delete local branches with leaked key | 5 min | Reduces exposure surface |
| P1 | Replace `xlsx` with `exceljs` | 1-2 hours | Eliminates prototype pollution CVE |
| P1 | Run `git filter-repo` to purge key from history | 30 min | Permanent remediation |
| P2 | Remove hardcoded DB credential fallbacks | 30 min | Defense-in-depth |
| P2 | Update `@clerk/fastify` to v3 | 1-2 hours | Security currency |
| P3 | Enhance `.gitignore` | 5 min | Defense-in-depth |
| P3 | Update remaining outdated deps | 2-4 hours | Maintenance hygiene |
