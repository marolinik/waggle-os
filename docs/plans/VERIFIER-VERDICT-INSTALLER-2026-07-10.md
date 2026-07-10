# Adversarial Verifier Verdict — Installer Arc (Steal #5)

**Date:** 2026-07-10
**Verifier:** adversarial Opus (read-only on code; non-destructive probes only)
**Scope:** 6 commits on `feat/steal-5-installer` over main `b8c65c22`
(`94cc971e` plan · `3715b349` Wave 1 · `ce20af22` liveness fix · `364772ec` Wave 2 CI+docs ·
`31295ad0` CI runner-context fix · `9606414d` exec-bit restore).
**Contract:** `docs/plans/INSTALLER-ARC-2026-07-10.md` (decisions D1-D10).

## VERDICT: APPROVED (with residuals)

No CRITICAL or HIGH findings. The installer's security posture is genuinely strong on the
dimensions that matter most for `curl | bash` software: **no user-controlled value reaches any
shell/eval sink**, the whole script is wrapped in `main()` invoked on the last line (partial
download cannot execute a destructive prefix), idempotency/marker timing is correct, and the CI
smoke job is a real from-scratch Linux E2E that gates regressions (no always-green trap).
Residuals below are 1 MEDIUM + 5 LOW, all non-blocking.

---

## What I tried to break, and what held

### 1. Injection (hostile flag values / wizard answers) — HELD
Traced every user-controlled value (`--dir --port --data-dir --branch --local-source` + the five
`/dev/tty` wizard answers) to every sink:
- `git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"`, `mkdir -p "$INSTALL_DIR"`,
  `cd "$INSTALL_DIR"`, the `tar` pipelines, `bash …/waggle-server.sh start --port "$PORT" --data-dir "$DATA_DIR"`
  — all pass values as **quoted, already-expanded arguments**. Bash does **not** re-parse variable
  *contents* for command substitution or word-into-command splitting, so `--data-dir '$(rm -rf ~)'`
  is stored and used as a literal directory name; the `$( )` never executes.
- The install marker (`write_marker`, install.sh:267-288) is the one place answers cross into a
  file, and it does so exactly per **D6**: `PORT/DATA_DIR/BRANCH` are passed as **environment
  variables** into `node -e` and emitted via `JSON.stringify`; the marker path is `argv[1]`. Zero
  shell interpolation. This is belt-and-suspenders — no other sink evals user input either.
- `verify_runtime` runs a **constant** node script; there is no `eval` anywhere in either file.
Result: **D6 satisfied and exceeded.** No injection path found.

### 2. `curl | bash` semantics — HELD (design strength)
- **Partial-download execution:** all logic lives in functions; the only top-level statements
  before `main` are colour setup, the `trap`, arg-parsing (a no-op when `$@` is empty, as under
  `curl|bash`), and OS detection — all harmless. `main` is literally the **last line** (install.sh:367).
  A truncated download therefore either syntax-errors before running anything, or defines functions
  and hits EOF before `main` — **nothing destructive runs**. Correct pattern.
- **/dev/tty absence (CI/docker):** `ask`/`ask_yesno`/`run_wizard` all guard `[ ! -e /dev/tty ]`
  (and `--yes`) → silently take defaults. Verified.
- **Ctrl-C mid-install:** `trap on_interrupt INT` restores tty (`stty sane`) and aborts; a partial
  dir without a marker is picked up by the resume branch next run.

### 3. Idempotency / resume — HELD
3-way branch (install.sh:324-340) is correct; the marker is written **after** build+verify and
**before** start (install.sh:357), so its presence means "fully built." Failure between clone and
marker → next run resumes (skips clone, re-runs `npm install`+`build:packages`). Re-run with marker
→ `exit 0` with upgrade hint. `write_marker` timestamp-backs-up any existing marker.

### 4. `waggle-server.sh` process management — mostly HELD (see MEDIUM/LOW residuals)
Health-first liveness is the right call. `stop` **refuses to signal** when `/health` responds but no
pidfile exists (won't kill an unidentified process on the port). `read_pid` sanitizes to digits.
Stale pidfile (dead PID, free port) → `start` proceeds correctly. tasklist/taskkill fallbacks are
correct for the msys/Git-Bash native-PID false-negative case.

### 5. Plan-vs-impl drift — D1-D10 all implemented as specified
Verified each decision against code. Only wording drift: D7 says "pure-bash timeout shim," but the
health poll actually depends on `curl`/`wget` (the script comment even states "no pure-bash HTTP").
See MEDIUM-1.

### 6. CI gating — HELD
`installer-smoke.yml` triggers on push/PR touching `install.sh`, `scripts/waggle-server.sh`, or the
workflow; runs `shellcheck` as a **failing** gate, then a real from-scratch install → boot →
assert `/health` 200 → status → stop → **assert port freed**. No `|| true` / `continue-on-error`
on any assertion (the `|| true` / `|| echo 000` occurrences are all in diagnostics/polling, not
masking a gate). **CI run 29096830297 = success, on HEAD commit `9606414d`** (verified via `gh`).
shellcheck therefore passes on both scripts (proven by the green run).

### 7. CLAUDE.md §7 security — HELD
No hardcoded secrets in any scope file (grepped). No `eval`/dynamic-require. Vault untouched.
`.gitattributes` addition (`*.sh text eol=lf`) is clean and does not disturb existing binary pins.

---

## Residuals (non-blocking)

| # | Sev | File:line | Issue | Break scenario / note |
|---|-----|-----------|-------|-----------------------|
| M-1 | MEDIUM | `scripts/waggle-server.sh:82-91,141-149` | Health poll requires `curl` **or** `wget`; neither is checked by `install.sh` preflight. Contradicts D7's "pure-bash timeout shim." | On a minimal box with neither tool (e.g. some Alpine images), `start` spawns a **healthy** sidecar but `http_ok` returns 2, so `wait_for_health` times out at 60s and reports "did not become healthy" + exits 1 — a false failure. Non-security; clear error + log tail, no corruption. curl/wget is present on essentially every VPS/homelab image and is proven on the CI ubuntu runner, so real-world impact is low. Fix options: `/dev/tcp` fallback in `http_ok`, or add a curl/wget check to install.sh preflight. |
| L-1 | LOW | `install.sh:246-252` | Predictable temp path `/tmp/waggle-verify.$$` for stderr capture (CWE-377). | On a shared multi-user box an attacker who wins a PID-guess race could pre-symlink the path and have the `2>` truncate a file the user can write. Single-user localhost typical; low probability. Fix: `mktemp`. |
| L-2 | LOW | `scripts/waggle-server.sh:214-253` | PID-reuse in `stop`: if our server is down but the recorded integer PID was reused by an unrelated process **not** serving `/health` on our port, `signal_pid TERM/KILL` targets that process. | Standard pidfile-manager risk, single-user localhost; mitigated by the health-first early-return and the "refuse to signal unknown PID" guard. Matches industry norm. |
| L-3 | LOW | `install.sh:78-79`; `waggle-server.sh:58-59` | `--port` is never validated as numeric. | `--port abc` yields a broken-but-safe install (health never comes up → clear timeout). No injection. CLAUDE.md coding-style asks for boundary validation — worth a `[[ "$PORT" =~ ^[0-9]+$ ]]` guard. |
| L-4 | LOW | README.md:60 / getting-started.md:18 | The documented one-liner points at `raw.githubusercontent.com/marolinik/waggle-os/main/install.sh`, but **install.sh is not on `main` yet** (only on `feat/steal-5-installer`). | The docs describe the post-merge reality. Slug `marolinik/waggle-os` is correct and the repo is PUBLIC. **Sequencing dependency:** the merge must land install.sh on `main` for the published one-liner to resolve; the README/getting-started edits should not be published ahead of that merge. Honest, not a lie — but flag the ordering. |
| L-5 | LOW | `install.sh:88-90` | `--help` uses `sed -n '2,40p' "$0"`; under `curl \| bash`, `$0` is `bash`, so `--help` won't print the header. | Cosmetic; nobody pipes `--help`. Works when run as `./install.sh --help`. |

## Informational (out of scope / by design)
- getting-started.md Options 2-3 reference `github.com/marolinik/waggle` (desktop releases + a
  `git clone …/waggle.git`) while origin is `marolinik/waggle-os`. These lines are **pre-existing**
  (not introduced by this arc) — noted for a future docs pass, not this verdict.
- The resume branch (`install.sh:330-337`) runs `npm install` on pre-existing directory contents
  when a non-marked dir exists. This trusts the directory by design (it is the user's own machine);
  a pre-seeded malicious `package.json` postinstall would run, but that presupposes attacker write
  access to the user's home dir. Acceptable under the local trust model.

---

**Bottom line:** the security-critical properties (no injection, partial-download safety, correct
idempotency, honest git-over-TLS acquisition, real gating CI) all hold. Ship it; address M-1 and
L-1/L-3 as fast-follows, and ensure the merge lands `install.sh` on `main` before the README
one-liner is relied upon (L-4).
