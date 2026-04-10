# Waggle Personal Mind — EU AI Act Audit Report

**Generated:** 2026-04-10T10:05:22.224Z
**Standard:** Regulation (EU) 2024/1689 — Artificial Intelligence Act
**Scope:** Personal mind DB on this machine after Claude Code harvest
**DB:** `C:/Users/MarkoMarkovic/.waggle/personal.mind`
**Report version:** 1.0
**Period:** 2026-01-01T00:00:00Z → 2026-04-10T10:05:22.215Z

---

## Executive Summary

**Overall verdict:** 🟡 warning

This audit evaluates the Waggle personal mind against the five articles of the EU AI Act that apply to deployers of general-purpose AI systems: **Art. 12** (event logging), **Art. 14** (human oversight), **Art. 19** (log retention), **Art. 26** (deployer monitoring), and **Art. 50** (transparency obligations). It also adds a harvest-specific audit covering PII exposure, data minimization, source provenance, and retention posture for the 156 frames imported from `~/.claude/` on 2026-04-10.

## §1 Article-by-Article Status

| Article | Status | Detail |
|---|---|---|
| **Art. 12 — Event logging** | 🟡 warning | No interactions logged yet. Logging activates automatically on first AI interaction. |
| **Art. 14 — Human oversight** | 🟢 compliant | Human oversight capabilities available (approval gates, tool deny lists). No oversight actions recorded yet. |
| **Art. 19 — Log retention** | 🟢 compliant | No logs to retain yet. Retention policy is permanent by default. |
| **Art. 26 — Deployer monitoring** | 🟢 compliant | 4 active monitors: cost, tools, model ID, persona. |
| **Art. 50 — Transparency** | 🟢 compliant | Model identification active. Models will be disclosed on first interaction. |

### Art. 26 — Active monitors

- `cost_tracking`
- `tool_logging`
- `model_identification`
- `persona_tracking`

## §2 Workspace Risk Classification

| | |
|---|---|
| **Workspace** | personal (default) |
| **Classification** | `minimal` (EU AI Act Annex III not applicable) |
| **Rationale** | Single-user productivity system, no third parties, no high-risk use cases (biometric ID, critical infrastructure, etc.) |
| **Reclassification trigger** | Add a third-party user, deploy to production facing external users, or integrate with an Annex III use case |

## §3 Harvest Provenance (Art. 12 §1 — Chain of Custody)

| Source | Imported at | Items | Frames created |
|---|---|---|---|
| Claude Code (~/.claude) | 2026-04-10 09:24:54 | 468 | 468 |

### Claude Code (~/.claude)

- **Source path:** `C:\Users\MarkoMarkovic\.claude`
- **First registered:** 2026-04-10 09:15:46
- **Last synced:** 2026-04-10 09:24:54
- **Items seen:** 468
- **Frames created:** 468
- **Auto-sync:** disabled

## §4 PII & Sensitive Data Scan

Regex-based scan of all **156 harvest frames** for common PII and credential patterns. This is a best-effort scan; deeper detection (NER, classifier models) is out of scope for v1.

| Pattern | Occurrences | Risk level |
|---|---|---|
| Email addresses | 5 | Low (identity, not credentials) |
| Phone numbers | 8 | Low |
| Credit card numbers | 0 | High — flag if > 0 |
| SSN / national IDs | 0 | High — flag if > 0 |
| API key patterns (sk-, ghp_, xoxb-, ...) | 0 | **Critical — flag if > 0** |
| JWT tokens | 0 | **Critical — flag if > 0** |
| URLs (context only) | 47 | Informational |

**Frames containing any PII:** 7 of 156

### ✅ No critical credential leaks detected

No API key or JWT patterns matched in the harvested content. Email addresses are present (5 occurrences — expected, these are user identity) but are considered low-risk personal data, not credentials.

## §5 Data Minimization (Art. 10 §3 / GDPR Art. 5)

| Control | Setting |
|---|---|
| **Content cap per frame** | 4,000 chars (hard-coded in route + cron handler) |
| **Frames truncated at cap** | 28 of 156 (18%) |
| **Smallest frame** | 268 chars |
| **Largest frame** | 4078 chars |
| **Source filesystem** | ~/.claude/ only (explicit allowlist) |
| **Auto-dedup** | SHA-256 content hash via `findDuplicate` |

The 4 KB cap prevents unbounded ingestion of large files. Future improvement: per-category caps (e.g., rules might warrant smaller caps than memories).

## §6 Retention Posture (Art. 19)

| Importance tier | Harvest frames | Retention policy |
|---|---|---|
| `normal` | 156 | indefinite (manual delete only) |

**Current retention exceeds the Art. 19 minimum of 6 months** because harvest frames default to `normal` importance, which is never auto-pruned. If the user requests deletion, the `harvest` gop can be dropped with a single SQL statement (shown in §9 of this report).

## §7 Source Auditability (Art. 12 §1(c))

- **All sources have a recorded path:** ✅ yes
- **All sources have a last-sync timestamp:** ✅ yes
- **Per-frame source attribution:** every harvest frame begins with `[Harvest:<source>] <title>` so provenance is preserved inside the content itself, not just a sidecar metadata column.

## §8 Model Inventory & Oversight Log (Art. 50 / Art. 14)

- **Model inventory entries:** 0
- **Human oversight actions recorded:** 0
- **Total interactions logged in period:** 0

> **Note:** The `ai_interactions` table is empty because no agent interactions have yet been routed through the `InteractionStore` recording path on this DB. Once the Waggle server runs and the user starts a chat session, every turn will be logged with model, tokens, cost, tools, and human oversight actions. The infrastructure is in place — the log simply has no rows yet.

## §9 Right-to-Erasure (GDPR Art. 17)

Full deletion of the harvested content is a single SQL statement executed against this DB:

```sql
DELETE FROM memory_frames_fts WHERE rowid IN (SELECT id FROM memory_frames WHERE gop_id = 'harvest');
DELETE FROM memory_frames_vec WHERE rowid IN (SELECT id FROM memory_frames WHERE gop_id = 'harvest');
DELETE FROM memory_frames WHERE gop_id = 'harvest';
DELETE FROM harvest_sources;
```

No data is replicated outside this DB, so a single deletion fulfills the user request. Backup copies (if any) must also be deleted — a backup was created before the harvest run at `~/.waggle/personal.mind.backup-pre-harvest-*` and should be reviewed under the same policy.

## §10 Findings & Required Actions

| Severity | Action |
|---|---|
| **INFO** | No ai_interactions logged yet — this is expected until first agent session runs through the server. |

## §11 Compliance Posture — honest caveats

- This report reflects **the state of a single local DB**, not a running production deployment. Compliance postures for hosted / multi-tenant / enterprise deployments are out of scope.
- The `ai_interactions` log is **empty** because no agent sessions have been logged against this DB yet. Art. 12 status is `warning` based on the current count, not the design.
- PII detection is **regex-only** — robust detection would require an NER model or an LLM classifier.
- The harvest imports **code and reasoning artifacts from the user's own Claude Code sessions**. These are not third-party personal data under GDPR; they are the user's own first-party content.
- The `minimal` risk classification is a default — reclassification is required if the workspace begins serving third parties or handles Annex III use cases.

---

_Generated by the AI Act audit pipeline on top of `ComplianceStatusChecker` and `ReportGenerator` from `@waggle/core/compliance`. Full machine-readable report: [`AI-ACT-AUDIT-2026-04-10.json`](./AI-ACT-AUDIT-2026-04-10.json)._
