# Installer Arc — Steal #5: One-Line Installer + Setup Wizard (2026-07-10)

**Branch:** `feat/steal-5-installer` (worktree `.claude/worktrees/steal5-arc`, off main `b8c65c22`).
**Source:** CowAgent teardown steal #5 (`docs/analysis/cowagent-vs-waggle-2026-07-09.md` §2.5).
**Orchestration:** Fable plans/gates/verifies; Opus executes; adversarial Opus verifier before merge.
**Recon basis:** 3 recon agents (sidecar boot surface · existing deploy story · CowAgent run.sh patterns), 2026-07-10.

---

## 1. Problem

Waggle has three run stories today: Tauri desktop binary (individuals), Docker team stack
(Postgres/Redis/MinIO/Clerk — heavy), and "clone + two dev terminals" in README. There is **no
one-command headless self-host story** for the solo sidecar — the exact surface the OSS funnel
audience (VPS / homelab) needs, and the surface the channels arc (steal #4) just made valuable
("Waggle agent in my Telegram, on my server").

Verified facts the design leans on (recon, 2026-07-10):
- Solo sidecar = `packages/server/src/local/start.ts` → `service.ts:startService()`. Default port
  **3333**, binds loopback. Health at `/health`. Writes `server.pid` under dataDir already.
- **Zero required env.** dataDir defaults `~/.waggle`; vault (AES-256-GCM) is the canonical key
  store; `WAGGLE_SKIP_LITELLM=1` skips the optional Python LiteLLM subprocess entirely.
- **Zero-key boot confirmed**: provider chain litellm → built-in anthropic-proxy → Ollama →
  `degraded`; `/api/chat` echo mode keeps UI functional with no key (`chat.ts:823-941`).
- Fresh-clone sequence: `npm install` → `npm run build:packages` (mandatory — shared +
  hive-mind-core export only dist/) → optionally `npm run build` (web UI; server serves SPA via
  dist candidate list or `WAGGLE_FRONTEND_DIR`, `index.ts:2475-2505`).
- Web OnboardingWizard (model-gate step) already owns first-run API-key entry with test button +
  skip. **CLI must not duplicate it.**
- No prebuilt server artifact exists (release.yml ships desktop installers only) → v1 installs
  from source via git clone. Server tarball/GHCR image = explicitly out of scope (v2 candidate).
- #1 platform risk: sqlite-vec on Linux — root package.json pins only `sqlite-vec-windows-x64`;
  Linux/macOS rely on sqlite-vec's own optional platform deps (UNVERIFIED). Mitigations: runtime
  require-check in installer + `WAGGLE_SQLITE_VEC_PATH` remedy + empirical CI smoke on ubuntu.

## 2. Design decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| D1 | v1 ships **`install.sh` only** (Linux + macOS). Windows headless deferred; Windows users have the desktop .msi. | Funnel audience is VPS/homelab; CowAgent ships bash-only too. |
| D2 | Installer ends at: prereqs → clone → build → tiny wizard → start → print URL. **No API keys, no personas, no channels in CLI** — web UI owns all of it. | OnboardingWizard model-gate is the polished existing flow; duplication = drift. |
| D3 | **No sudo, ever.** Missing prereq ⇒ print exact per-OS install command and exit. | Security differentiator vs CowAgent's silent `sudo yum/apt`; simplicity-first. |
| D4 | Wizard = 5 questions, all Enter-defaulted: install dir [`~/waggle-os`] · port [`3333`] · data dir [`~/.waggle`] · build web UI [Y] · start now [Y]. Reads from **`/dev/tty`** so `curl \| bash` works. | CowAgent's zero-key skippable wizard, minus everything the web UI owns. |
| D5 | Idempotent **3-way dir branch**: dir + `.waggle-installed` marker ⇒ print usage/upgrade hint + exit · dir without marker ⇒ resume (skip clone) · no dir ⇒ clone. Timestamp-backup any config it would overwrite. | CowAgent's proven re-run safety for `curl \| bash`. |
| D6 | **Injection-safe writes**: all wizard answers pass as env vars into `node -e` that `JSON.stringify`s config / builds arguments. Never shell-interpolate user input into files or commands. | CowAgent's env→json.dump heredoc pattern, ported to Node. |
| D7 | Process management via new **`scripts/waggle-server.sh`** (`start|stop|status|logs`): nohup + the sidecar's own `server.pid`, `WAGGLE_SKIP_LITELLM=1` always, health-poll `GET /health` with pure-bash timeout shim. No `ps\|grep`. | Restart story without systemd; reuses existing pidfile. systemd unit = v2. |
| D8 | **`--yes` non-interactive mode** (all defaults, no tty) + **CI smoke job** on ubuntu-latest: run installer → poll `/health` → assert 200 → `waggle-server.sh stop`. | Only empirical way to verify Linux (dev box is Windows); settles sqlite-vec risk. |
| D9 | Source fetch = `git clone --depth 1` over HTTPS from GitHub (integrity via git/TLS). Release-tag pinning + checksummed tarball = v2 with the (future) server artifact. | No tarball exists to checksum yet; git clone is the honest v1. |
| D10 | Post-install runtime verification inside installer: `node -e "require('better-sqlite3'); …sqlite-vec load"` against the built tree; on failure print `WAGGLE_SQLITE_VEC_PATH` remedy + toolchain hints. | Converts the #1 UNCERTAIN into a user-visible actionable check. |

## 3. Deliverables

1. **`install.sh`** (repo root) — the `curl -fsSL https://raw.githubusercontent.com/marolinik/waggle-os/main/install.sh | bash` entry. Stages: preflight (bash≥4 warn-only, OS detect, git, node ≥20 per `engines`, npm; toolchain warn) → 3-way dir branch → clone → `npm install --no-audit --no-fund` → `npm run build:packages` → optional `npm run build` → wizard (D4) → runtime verify (D10) → delegate start to `waggle-server.sh` → success card (URL, add-key-in-Settings pointer, channels pointer, `waggle-server.sh` cheat-sheet). Flags: `--yes`, `--dir`, `--port`, `--data-dir`, `--no-web`, `--no-start`, `--branch` (default `main`).
2. **`scripts/waggle-server.sh`** — `start|stop|status|logs [--port N] [--data-dir P]`; start = nohup tsx `src/local/start.ts` with `WAGGLE_SKIP_LITELLM=1`, `WAGGLE_FRONTEND_DIR` set when web dist exists; stop = pidfile TERM, 3s grace, KILL; status = pidfile + `/health`; logs = tail dataDir log file.
3. **CI**: `installer-smoke` job (new workflow or extend existing CI) — ubuntu-latest, run `./install.sh --yes --no-web --dir "$RUNNER_TEMP/waggle"` (clone-skip mode: point at checkout instead of cloning — installer supports `--local-source <path>` for CI/dev), poll health ≤120s, assert, stop. Cache npm.
4. **Docs**: README self-host section (the one-liner + what it does + security posture) + `docs/guides/getting-started.md` new "Option: one-line self-host" + note in `docs/guides/self-host*` if exists.

## 4. Waves

**Wave 1 (Opus exec):** deliverables 1 + 2. Gate: `bash -n` both scripts; shellcheck if available; full real run in Git Bash on Windows against temp dir using `--local-source` (skip clone) — must reach healthy `/health` and stop cleanly; re-run idempotency check (3-way branch); `--yes` path exercised.
**Wave 2 (Opus exec):** deliverables 3 + 4. Gate: workflow YAML validated; docs factual against script flags; no marketing claims beyond behavior.
**Verify (Opus adversarial):** try to break: injection via dir/port answers, curl|bash with no tty, partial-failure resume, port conflict, missing node, dirty re-run, pidfile staleness, `--local-source` path traversal. VERDICT doc at `docs/plans/VERIFIER-VERDICT-INSTALLER-2026-07-10.md`.

**Gates for every wave:** no repo-wide side effects outside listed files; existing suites untouched (scripts are net-new; only README/getting-started/CI edited); commit per wave.

## 5. Out of scope (v2 candidates — do not build now)

systemd/launchd units · Windows `install.ps1` · prebuilt server tarball + checksum/signature + release-tag pinning · GHCR image · CLI channel enablement · uninstaller beyond documented `rm -rf` note · nvm auto-install.
