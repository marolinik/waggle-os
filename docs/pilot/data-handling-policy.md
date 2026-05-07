# Waggle OS Pilot — Data Handling Policy

**Effective date:** 2026-05-08
**Audience:** pilot users, internal compliance review, EU AI Act Article 13 transparency.
**Authoritative implementation:** the source code in this repo (see "Where to look in the code" sections below).

This document is the durable summary of how Waggle OS handles your data during the pilot phase. It is written so a non-engineer can read it end-to-end in 5–10 minutes and so a regulator can map every claim back to the line of code that implements it.

If anything below diverges from what the binary actually does, the code wins and this document is wrong — open an issue and tag it `data-policy-drift`.

---

## 1. What gets stored, and where

Waggle OS is a **local-first** desktop app. Almost all of your data lives on your machine, under one directory we call the **data dir**.

### 1.1 The data dir
- **Default location:** `%APPDATA%\waggle\` on Windows, `~/Library/Application Support/waggle/` on macOS.
- **Override:** `--data-dir <path>` flag on the binary, or the `WAGGLE_DATA_DIR` env var.
- **Inspect it yourself at any time** — it's a normal folder of normal files.

### 1.2 Files inside the data dir

| File / dir | Contains | Encrypted at rest? |
|---|---|---|
| `personal.mind` | Cross-workspace memory frames + knowledge graph + identity. SQLite. | No (filesystem-level only). |
| `<workspace-id>.mind` | Per-workspace memory frames + sessions + chat history. SQLite (one file per workspace). | No. |
| `config.json` | Settings: tier, trial start, telemetry toggle, server URL, autonomy defaults. | No. |
| `vault.db` + `.vault-key` | API keys for connected providers (OpenAI, Anthropic, Stripe, etc.). | **Yes** — AES-256-GCM, key in `.vault-key` (file permissions restricted to current user via icacls / chmod 600). |
| `telemetry.db` | Local-only event counters used for the Memory Health and Cost Summary panels. **Never sent off-device.** | No. |
| `marketplace.db` | Cache of the public skills/connectors catalog (no PII). | No. |
| `audit.db` | Tamper-evident audit log of compliance-relevant actions (consent grants, model invocations, exports, erasure requests). | No (chained-hash for integrity, not confidentiality). |
| `sessions/` (legacy) | Pre-2026-04 chat history. New installs don't have this; old installs migrate into `<workspace>.mind`. | No. |
| `harvest-cache/` | Working files during a harvest import. Cleaned up after each run. | No. |

### 1.3 What is **never** written to disk
- Plaintext API keys outside `vault.db`. The `[waggle:vault]` boot log warning ("could not restrict key file permissions") fires only if the OS's per-file ACL probe fails — the file content is still encrypted regardless.
- Your chat content, except inside the corresponding `.mind` file. No swap-file or temp-file copies are written by Waggle (the OS's own swap behavior is outside our control).

### Where to look in the code
- Data dir resolution: `packages/core/src/config.ts` (`WaggleConfig` constructor).
- Vault encryption: `packages/core/src/mind/vault.ts` (`VaultStore.set` / `.get`).
- Mind file lifecycle: `packages/core/src/mind/db.ts` (`MindDB` constructor — `sqlite-vec` extension, FTS5 + vec0 tables).
- Audit log: `packages/server/src/local/routes/events.ts` (`emitAuditEvent`) and `packages/core/src/compliance/`.

---

## 2. What leaves your machine, and when

By default, **nothing leaves your machine without an explicit action you took**. Specifically:

| Action you took | Data sent | Where to | Can I turn it off? |
|---|---|---|---|
| Sent a chat message to a cloud model (Anthropic, OpenAI, Google, etc.) | Your prompt + relevant memory excerpts + tool definitions | The provider you configured | Yes — switch the workspace to a local Ollama model. |
| Connected a connector (Gmail, Notion, Linear, Slack, Stripe, etc.) | OAuth handshake + scoped reads as you instruct | The third-party service | Yes — disconnect in Settings → Connectors. |
| Started a Stripe checkout for Pro/Teams | Your email + billing address | Stripe | N/A — required for paid tier. |
| Clicked "Start free trial" | Tier change is local; no network call beyond the standard `/api/tier/start-trial` POST to your local sidecar | Nowhere off-device | Always local. |
| Joined a Teams workspace | Selected workspace frames + your member metadata | The Teams server URL you provided | Yes — disconnect in Settings → Team. |
| Enabled telemetry (off by default) | Aggregated usage counts (no chat content) | `telemetry.waggle-os.ai` | Yes — Settings → Privacy → Telemetry. |

### What we never send off-device
- The contents of `personal.mind` or `<workspace>.mind` files (except the specific frames a model call needs as context).
- The contents of `vault.db` or `.vault-key`.
- The contents of `audit.db`.
- Any data flagged by `injection-scanner.ts` as suspicious (these are quarantined locally, not exfiltrated for analysis).

### Where to look in the code
- Connector outbound traffic: `packages/agent/src/connectors/`.
- Cloud model calls: `packages/agent/src/providers/` and `litellm-config.yaml`.
- Telemetry payload shape: `packages/core/src/telemetry.ts` (`sanitizeForExport`).
- Stripe traffic: `packages/server/src/local/routes/stripe.ts`.

---

## 3. Backup

### 3.1 Manual backup (recommended weekly during pilot)
- `Settings → Privacy → Backup` produces a single encrypted file (`<date>.waggle-backup`).
- Format: `WAGGLE-BACKUP-V1` magic header, AES-256-GCM payload, decrypts only with the password you set at backup time.
- Coverage: everything in the data dir except transient `.tmp` / `.lock` files and the marketplace cache (re-downloadable).

### 3.2 Restore
- `Settings → Privacy → Restore` accepts a `.waggle-backup` file + the password you used.
- Restore is **destructive** to the current data dir — it overwrites in place. If you want to keep the current state, copy the data dir somewhere first.

### 3.3 What we recommend for pilot users
1. Run a manual backup at the end of every active day.
2. Keep the resulting `.waggle-backup` in a place that survives a disk loss — Dropbox / iCloud / OneDrive / external drive. Pick one that matches your own threat model. (The file is encrypted, so the cloud provider can't read it.)
3. Test restore on a different machine **once**, before you need to. If restore fails, you'll want to know during the pilot, not after a disk crash.

### Where to look in the code
- Backup creation: `packages/server/src/local/routes/backup.ts` (`POST /api/backup`).
- Restore: same file (`POST /api/restore`).
- Encryption format: `BACKUP-FORMAT.md` if present, else read the constants at the top of `backup.ts`.

---

## 4. Erasure (right to delete your data)

Waggle OS exposes a **complete erasure** endpoint that wipes the data dir on next startup. Pilot users invoke it via:
- UI: `Settings → Privacy → Erase all my data` (when wired — see roadmap below).
- API: `POST /api/data/erase` with the confirmation phrase. This is the source of truth.

### 4.1 What gets erased
On next Waggle launch after erasure is requested, the following are removed:
- Every file inside the data dir, **except** an `audit-receipt-<timestamp>.json` left behind so you have a record of what was deleted.
- The data dir is then re-created empty, putting the install back into the "first-run" state.

### 4.2 What does NOT get erased automatically
- Data already sent to **cloud providers** (Anthropic / OpenAI / Stripe etc.). You must request deletion from each provider directly via their own privacy/account-deletion flows. Waggle has no mechanism to recall data once a third party received it.
- Data already pushed to a **Teams server** (only relevant if you joined a Teams workspace). You must contact your Teams admin or use the Teams server's own erasure flow.
- Data inside any **manual `.waggle-backup` files** you exported. Delete those yourself if you want them gone.
- The Waggle OS **binary itself** and its installer. Uninstall via the OS package manager if you also want the application removed.

### 4.3 The confirmation gate
`POST /api/data/erase` requires both:
- HTTP header `X-Confirm-Erase: yes`
- JSON body `{ "confirmation": "I UNDERSTAND THIS IS PERMANENT" }` — exact match, case-sensitive, no leading/trailing whitespace.

A request missing either is rejected with `400 ERASE_NOT_CONFIRMED`. This is intentional friction — accidental erasure is unrecoverable.

### 4.4 The receipt
A successful erasure request returns a receipt with:
- `requestedAt` — ISO timestamp from the server.
- `markerPath` — absolute path of the `.erase-pending.json` file that schedules the wipe.
- `dataDirSnapshot` — count + total size of files marked for deletion (read from the live data dir at request time, before deletion).
- `instruction` — human-readable next step ("Quit Waggle and relaunch — erasure completes during startup.").

The receipt is also written to `audit.db` BEFORE the marker file is created, so the audit trail survives any partial failure during the actual wipe.

### Where to look in the code
- Route handler: `packages/server/src/local/routes/data-erase.ts` (lands in Phase 3b).
- Startup wipe: `packages/server/src/local/service.ts` (lands in Phase 3b — checks for marker before opening any DB).

---

## 5. EU AI Act + GDPR — how this maps

| Requirement | Implementation |
|---|---|
| GDPR Art. 13 (information at collection) | This document + the in-app `Settings → Privacy` panel. |
| GDPR Art. 15 (access) | `POST /api/export` produces a ZIP with all your data. |
| GDPR Art. 17 (erasure) | `POST /api/data/erase` (this section). |
| GDPR Art. 20 (portability) | Same export ZIP at Art. 15. |
| GDPR Art. 32 (security) | Vault AES-256-GCM, file ACLs, audit log integrity hash chain. |
| EU AI Act Art. 13 (transparency) | Cloud-model invocations logged to `audit.db` per call; readable via `Settings → Compliance → Interactions`. |
| EU AI Act Art. 50 (deepfake / AI-content disclosure) | Out of scope for the desktop OS — applies to apps you build on top. |

### Where to look in the code
- AI Act compliance reports: `packages/core/src/compliance/report-generator.ts`.
- Status checker (gap analysis): `packages/core/src/compliance/status-checker.ts`.
- Audit chain: `packages/core/src/mind/awareness.ts` (audit event emission).

---

## 6. Pilot-specific commitments

For the duration of your pilot (defined in your individual pilot agreement / NDA):

1. **No analytics on chat content.** Telemetry events count actions ("user opened settings panel"), not contents ("user asked about X").
2. **No silent updates.** A new Waggle binary requires you to download and install it; there is no auto-update channel during pilot.
3. **No data sharing across pilots.** Your data dir is yours alone. There is no central database shared between pilot users.
4. **48-hour incident notification.** If we discover a security issue that could affect your pilot data, you will be contacted within 48 hours of confirmation — by the email in your pilot agreement.
5. **Erasure honored even after pilot ends.** You can call `/api/data/erase` indefinitely. There is no time limit and no fee.

---

## 7. Roadmap items NOT yet implemented (as of 2026-05-08)

Honest gaps:
- ~~**Settings → Privacy → Erase all my data button.** The route exists (Phase 3b); the UI button is on the backlog.~~ **CLOSED 2026-05-08** — Settings → General → Erase All Data ships the button + a typed-phrase confirmation dialog (`apps/web/src/components/os/overlays/EraseDataDialog.tsx`). Visible at all tiers since GDPR Art. 17 cannot be tier-gated.
- **Per-workspace erasure.** Today it's all-or-nothing. Per-workspace erasure is feasible (the .mind files are independent) but the route doesn't expose it yet.
- **Erasure of cloud-side data.** No automated webhook fan-out — pilot users handle this manually per § 4.2 above.
- **External audit certification.** ISO 27001 / SOC 2 not started. We're transparent that we're a pre-launch product.

---

## 8. Contact

Questions about this policy:
- Email: marolinik@gmail.com (Marko Marković, Founder)
- GitHub issue: `marolinik/waggle-os`, label `data-policy`

For an urgent privacy concern affecting active pilot data, email with subject `[URGENT-PRIVACY]` for fastest response.

---

_Last code-verified: 2026-05-08 (commit head + trial-start + spawn-agent audit)._
