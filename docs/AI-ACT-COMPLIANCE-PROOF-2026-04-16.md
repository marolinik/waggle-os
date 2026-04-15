# Waggle OS -- EU AI Act Compliance Proof

**Document version:** 2.0
**Date:** 2026-04-16
**Standard:** Regulation (EU) 2024/1689 -- Artificial Intelligence Act
**Scope:** Waggle OS platform, all user tiers (FREE / PRO / TEAMS / ENTERPRISE)
**Previous audit:** [`AI-ACT-AUDIT-2026-04-10.md`](./AI-ACT-AUDIT-2026-04-10.md)
**Author:** Waggle OS Compliance Module

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Article-by-Article Mapping](#article-by-article-mapping)
   - [Art. 12 -- Automatic Event Logging](#article-12--automatic-event-logging)
   - [Art. 14 -- Human Oversight](#article-14--human-oversight)
   - [Art. 19 -- Log Retention](#article-19--log-retention)
   - [Art. 26 -- Deployer Monitoring](#article-26--deployer-monitoring)
   - [Art. 50 -- Transparency Obligations](#article-50--transparency-obligations)
3. [Compliance Matrix](#compliance-matrix)
4. [How to Generate Proof](#how-to-generate-proof)
5. [Sample Audit Report](#sample-audit-report)
6. [Gaps and Remediation Plan](#gaps-and-remediation-plan)

---

## Executive Summary

Waggle OS implements EU AI Act compliance as a built-in, always-on layer that runs on every tier. The compliance infrastructure is not a premium add-on -- it is embedded in the data layer (`packages/core/src/compliance/` and `packages/core/src/mind/schema.ts`) and activates automatically when the system initializes a `.mind` database.

**Core compliance components:**

| Component | Package | Purpose |
|---|---|---|
| `InteractionStore` | `@waggle/core` | CRUD for Art. 12 audit log (`ai_interactions` table) |
| `ComplianceStatusChecker` | `@waggle/core` | Evaluates compliance posture per article |
| `ReportGenerator` | `@waggle/core` | Produces structured JSON audit reports |
| `buildComplianceDocDefinition` | `@waggle/agent` | Generates boardroom-grade PDF reports (pdfmake) |
| `CostTracker` | `@waggle/agent` | Per-model cost tracking with budget caps |
| `confirmation.ts` | `@waggle/agent` | Smart confirmation gates + tiered autonomy |
| `injection-scanner.ts` | `@waggle/core` | Input sanitization (3 pattern sets) |
| `tool-filter.ts` | `@waggle/agent` | Per-context and per-persona tool allow/deny lists |
| Compliance server routes | `@waggle/server` | HTTP API surface for all compliance operations |

**Key architectural decision:** The `ai_interactions` table has DDL-level triggers (`ai_interactions_no_delete`, `ai_interactions_no_update`) that make it append-only at the database engine level. No application code can silently mutate or delete audit rows. This answers the auditor's first question -- "can rows be tampered with?" -- with a concrete "no" enforced by SQLite itself.

---

## Article-by-Article Mapping

### Article 12 -- Automatic Event Logging

**Requirement:** Art. 12(1) mandates that high-risk AI systems enable automatic recording of events (logs) throughout their lifecycle, including at minimum: (a) the period of each use, (b) the reference database against which input data was checked, (c) input data for which the search led to a match, and (d) the identification of natural persons involved in the verification of results.

For general-purpose AI systems (GPAI) deployed in non-high-risk contexts, Art. 12 still applies via Art. 53 as a transparency and traceability measure.

**Waggle Implementation:**

| Sub-requirement | Implementation | File |
|---|---|---|
| Event recording | `InteractionStore.record()` inserts a row per AI interaction | `packages/core/src/compliance/interaction-store.ts` (line 23) |
| Model identification | `model` + `provider` columns, NOT NULL | `packages/core/src/mind/schema.ts` (lines 155-156) |
| Token counting | `input_tokens` + `output_tokens` columns | `packages/core/src/mind/schema.ts` (lines 157-158) |
| Cost tracking | `cost_usd` column + `CostTracker` class | `packages/agent/src/cost-tracker.ts` |
| Tool call recording | `tools_called` column (JSON array) | `packages/core/src/mind/schema.ts` (line 160) |
| Human action recording | `human_action` column (approved/denied/modified/none) | `packages/core/src/mind/schema.ts` (line 161) |
| Input/output recording | `input_text` + `output_text` columns (Art. 12.1(a)) | `packages/core/src/mind/schema.ts` (lines 169-170) |
| Workspace + session scoping | `workspace_id` + `session_id` columns | `packages/core/src/mind/schema.ts` (lines 153-154) |
| Persona tracking | `persona` column | `packages/core/src/mind/schema.ts` (line 165) |
| Append-only enforcement | `ai_interactions_no_delete` + `ai_interactions_no_update` triggers | `packages/core/src/mind/schema.ts` (lines 183-192) |
| Provenance for imported data | `imported_from` column | `packages/core/src/mind/schema.ts` (line 164) |
| Automatic recording on agent loop | `TraceRecorder` wired into chat route | `packages/server/src/local/routes/chat-helpers.ts` |

**Tier Coverage:** All tiers (FREE, PRO, TEAMS, ENTERPRISE). The `ai_interactions` table is part of the core schema that initializes on every `.mind` database regardless of tier. There is no tier gate on interaction recording.

**Evidence:**
- Schema DDL: `packages/core/src/mind/schema.ts` lines 150-192 define the table, indices, and append-only triggers.
- Store class: `packages/core/src/compliance/interaction-store.ts` -- `record()` method (line 23) performs the INSERT with all 14 columns.
- Status checker: `packages/core/src/compliance/status-checker.ts` -- `checkArt12()` (line 48) evaluates total interaction count and flags `warning` for zero rows or `non-compliant` if the system has been active 24+ hours with no logs.
- Server route: `packages/server/src/local/routes/compliance.ts` -- `POST /api/compliance/interactions` (line 86) exposes recording via HTTP.
- E2E test: `tests/e2e/full-product-audit.spec.ts` line 125 -- `GET /api/compliance/status` verifies the endpoint returns status data.

**Gap:** None for the logging mechanism itself. GDPR Art. 17 (right-to-erasure) pseudonymization flow is specified but not yet implemented -- when implemented, it will use tombstone markers via a fresh INSERT rather than bypassing the append-only triggers (documented in schema.ts comment at line 176).

---

### Article 14 -- Human Oversight

**Requirement:** Art. 14 requires that high-risk AI systems be designed to allow effective oversight by natural persons, including the ability to: (a) fully understand the system's capabilities and limitations, (b) correctly interpret output, (c) decide not to use the system or disregard its output, (d) intervene or interrupt the system.

For GPAI deployers, human oversight means maintaining the ability to approve, deny, or modify agent-proposed actions.

**Waggle Implementation:**

| Sub-requirement | Implementation | File |
|---|---|---|
| Approve/deny/modify gates | `needsConfirmation()` + `getApprovalClass()` functions | `packages/agent/src/confirmation.ts` (lines 8-50+) |
| Destructive action blocking | `ALWAYS_CONFIRM` set (write_file, edit_file, git_commit, etc.) | `packages/agent/src/confirmation.ts` (line 13) |
| Tiered autonomy levels | `shouldConfirmAtAutonomy()` with Normal/Trusted/YOLO levels | `packages/agent/src/confirmation.ts` (line 147+) |
| Critical action safety net | `isCriticalNeverAutopass()` -- stays gated even at YOLO | `packages/agent/src/confirmation.ts` (line 188) |
| Bash command classification | `SAFE_BASH_PATTERNS` (read-only) vs `DESTRUCTIVE_BASH_PATTERNS` | `packages/agent/src/confirmation.ts` (lines 25-50) |
| Connector risk gating | `CONNECTOR_WRITE_PATTERNS` regex gates write operations | `packages/agent/src/confirmation.ts` (line 22) |
| Per-persona tool deny lists | `filterToolsForContext()` + `disallowedTools` on AgentPersona | `packages/agent/src/tool-filter.ts` (line 23) |
| Oversight action recording | `human_action` column in `ai_interactions` + `getOversightLog()` | `packages/core/src/compliance/interaction-store.ts` (lines 144-160) |
| Oversight count aggregation | `getOversightCounts()` returns approved/denied/modified counts | `packages/core/src/compliance/interaction-store.ts` (line 163) |
| Behavioral spec rules | Memory conflict protocol requires explicit user confirmation | `packages/agent/src/behavioral-spec.ts` (lines 71-79) |
| Cross-workspace access gates | `read_other_workspace`, `list_workspace_files` in ALWAYS_CONFIRM | `packages/agent/src/confirmation.ts` (lines 17-18) |
| Input injection defense | `scanForInjection()` with 3 pattern sets on all external input | `packages/core/src` (re-exported via `packages/agent/src/injection-scanner.ts`) |

**Tier Coverage:** All tiers.
- **FREE/PRO:** Normal autonomy by default. All write operations require confirmation. Tool deny lists active.
- **TEAMS/ENTERPRISE:** Full audit log (`auditLog: 'full'` in `tiers.ts`). Admin panel available for oversight review. Tiered autonomy configurable per workspace.
- The autonomy system guarantees that `isCriticalNeverAutopass()` tools (destructive bash, git push, force operations) ALWAYS require human confirmation regardless of tier or autonomy level.

**Evidence:**
- Confirmation logic: `packages/agent/src/confirmation.ts` -- comprehensive gate system with 3 autonomy levels.
- Status checker: `packages/core/src/compliance/status-checker.ts` -- `checkArt14()` (line 75) evaluates oversight action counts and approval rates.
- Tier definition: `packages/shared/src/tiers.ts` -- `auditLog` field: `'none'` (FREE), `'basic'` (PRO), `'full'` (TRIAL/TEAMS/ENTERPRISE).

**Gap:** The `auditLog` tier capability is defined but the FREE tier sets it to `'none'`. This does NOT affect the underlying interaction recording (which always runs) -- it controls the visibility of the audit export UI in the admin panel. The audit data itself exists on all tiers; only the admin dashboard exposure varies. To fully close this gap, the compliance status endpoint (`GET /api/compliance/status`) should be accessible on all tiers (it currently is -- no tier gate on the route).

---

### Article 19 -- Log Retention

**Requirement:** Art. 19 requires that logs generated by high-risk AI systems be kept for a period appropriate to the intended purpose, and for at least six months (unless otherwise provided by Union or national law). Deployers must ensure logs are not deleted or modified during the retention period.

**Waggle Implementation:**

| Sub-requirement | Implementation | File |
|---|---|---|
| Default permanent retention | Logs default to indefinite retention (no auto-pruning) | `packages/core/src/compliance/status-checker.ts` (lines 100-108) |
| System age tracking | `meta.first_run_at` entry set on schema init, used for retention math | `packages/core/src/mind/db.ts` via `MindDB.getFirstRunAt()` |
| Pruning detection | `checkArt19()` compares system age vs oldest log age to detect pruning | `packages/core/src/compliance/status-checker.ts` (lines 118-142) |
| Append-only enforcement | SQLite triggers prevent DELETE/UPDATE on ai_interactions | `packages/core/src/mind/schema.ts` (lines 183-192) |
| Retention period calculation | `retentionDays` computed from oldest log timestamp | `packages/core/src/compliance/status-checker.ts` (lines 113-115) |
| 6-month minimum check | `SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000` constant | `packages/core/src/compliance/status-checker.ts` (line 15) |

**Tier Coverage:** All tiers. The retention mechanism is part of the core schema and status checker. There is no tier gate on log retention. The append-only triggers fire on all databases regardless of tier.

**Evidence:**
- Status checker: `packages/core/src/compliance/status-checker.ts` -- `checkArt19()` (line 100) performs the full retention evaluation including the system-age vs log-age pruning detection fix (Review Critical #2 comment at line 117).
- Schema triggers: `packages/core/src/mind/schema.ts` lines 183-192 -- `ai_interactions_no_delete` and `ai_interactions_no_update` triggers enforce append-only at the DDL level.
- The `oldest` timestamp query (`MIN(timestamp)`) is in `InteractionStore.getOldestTimestamp()` at `packages/core/src/compliance/interaction-store.ts` line 100.

**Gap:** None. Waggle's default is permanent retention (no auto-pruning), which exceeds the Art. 19 minimum of 180 days. The append-only triggers prevent accidental deletion. The only gap is that GDPR Art. 17 erasure (if a user requests deletion of their data) requires a pseudonymization flow that replaces content with tombstone markers -- this is documented but not yet implemented (schema.ts line 176).

---

### Article 26 -- Deployer Monitoring

**Requirement:** Art. 26 requires deployers of high-risk AI systems to: (a) assign human oversight to competent individuals, (b) ensure input data is relevant and sufficiently representative, (c) monitor the operation of the system on the basis of the instructions for use, (d) inform the provider and suspend use if they suspect risks, (e) keep logs, (f) use available technical documentation, (g) classify workspaces by risk level.

**Waggle Implementation:**

| Sub-requirement | Implementation | File |
|---|---|---|
| 4 active monitors | `cost_tracking`, `tool_logging`, `model_identification`, `persona_tracking` | `packages/core/src/compliance/status-checker.ts` (lines 148-153) |
| Cost monitoring | `CostTracker` class with per-model pricing + daily budget caps | `packages/agent/src/cost-tracker.ts` |
| Budget enforcement | `BudgetExceededError` + soft/hard cap modes | `packages/agent/src/cost-tracker.ts` (lines 32-43) |
| Tool usage monitoring | `tools_called` JSON array stored per interaction | `packages/core/src/mind/schema.ts` (line 160) |
| Model identification | `model` + `provider` columns per interaction, aggregated by `getModelInventory()` | `packages/core/src/compliance/interaction-store.ts` (line 116) |
| Persona tracking | `persona` column per interaction | `packages/core/src/mind/schema.ts` (line 165) |
| Risk classification | `TEMPLATE_RISK_MAP` maps workspace templates to risk levels | `packages/core/src/compliance/types.ts` (lines 134-154) |
| Risk level types | `AIActRiskLevel: 'minimal' | 'limited' | 'high-risk' | 'unacceptable'` | `packages/core/src/compliance/types.ts` (line 7) |
| Workspace-level risk | `ReportGenerator` accepts `getWorkspaceRisk()` callback | `packages/core/src/compliance/report-generator.ts` (line 19) |

**Tier Coverage:** All tiers.
- **FREE:** 4 monitors always active. `CostTracker` runs on all tiers. Template risk classification active.
- **PRO:** Same 4 monitors + `auditLog: 'basic'` (interaction summary visible).
- **TEAMS/ENTERPRISE:** Full audit log + admin panel (`adminPanel: true`). Risk classification visible in admin dashboard.
- The `TEMPLATE_RISK_MAP` in `types.ts` automatically classifies workspaces created from templates (e.g., `'legal-review': 'high-risk'`, `'hr-management': 'high-risk'`, `'research-project': 'minimal'`).

**Evidence:**
- Status checker: `packages/core/src/compliance/status-checker.ts` -- `checkArt26()` (line 146) returns the 4 active monitors.
- Cost tracker: `packages/agent/src/cost-tracker.ts` -- `DEFAULT_MODEL_PRICING` (line 23) covers 6 Claude models. `setBudget()` (line 55) configures daily caps.
- Tier capabilities: `packages/shared/src/tiers.ts` -- `auditLog` field per tier: `'none'` (FREE), `'basic'` (PRO), `'full'` (TRIAL/TEAMS/ENTERPRISE).
- Risk map: `packages/core/src/compliance/types.ts` lines 134-154 -- 18 template-to-risk mappings.

**Gap:** The `getWorkspaceRisk()` callback in `ReportGenerator` defaults to returning `'minimal'` if no callback is provided (line 32 of `report-generator.ts`). The workspace config does not yet persist risk classification date (`riskClassifiedAt: null` at line 53). This means risk classification is template-derived but not user-editable at runtime. For full Art. 26 compliance in high-risk contexts, users should be able to manually set and persist the risk level.

---

### Article 50 -- Transparency Obligations

**Requirement:** Art. 50 requires that: (a) deployers ensure AI system output is identifiable as AI-generated, (b) persons interacting with an AI system are informed they are interacting with an AI, (c) providers of GPAI models make available a sufficiently detailed summary of content used for training.

For Waggle as a deployer, the obligation is transparency about which models are being used and ensuring users know they are interacting with an AI.

**Waggle Implementation:**

| Sub-requirement | Implementation | File |
|---|---|---|
| Model disclosure in UI | Model name shown in StatusBar per interaction | `apps/web/src/` (StatusBar component) |
| Model inventory | `getModelInventory()` aggregates all model usage with call counts | `packages/core/src/compliance/interaction-store.ts` (line 116) |
| Model recorded per interaction | `model` + `provider` columns, NOT NULL constraint | `packages/core/src/mind/schema.ts` (lines 155-156) |
| AI-generated content marking | Behavioral spec instructs agents to identify as AI | `packages/agent/src/behavioral-spec.ts` (quality rules) |
| Professional disclaimers | Context-sensitive disclaimers for regulated domains | `packages/agent/src/behavioral-spec.ts` (lines 109-113) |
| Anti-hallucination discipline | Agents must distinguish KNOWN from INFERRED content | `packages/agent/src/behavioral-spec.ts` (lines 86-91) |
| Persona identification | Active persona tracked and disclosed | `packages/agent/src/persona-data.ts` |
| LLM routing transparency | LiteLLM config with named model routes | `litellm-config.yaml` |

**Tier Coverage:** All tiers. Model identification is NOT NULL in the schema -- every interaction must have a model name. The StatusBar shows the active model on all tiers. Professional disclaimers are part of the behavioral spec which loads on all tiers.

**Evidence:**
- Status checker: `packages/core/src/compliance/status-checker.ts` -- `checkArt50()` (line 163) checks whether any models appear in the inventory.
- Schema constraint: `packages/core/src/mind/schema.ts` line 155 -- `model TEXT NOT NULL`.
- Behavioral spec: `packages/agent/src/behavioral-spec.ts` -- `qualityRules` section (line 83+) includes anti-hallucination discipline and professional disclaimer rules.

**Gap:** None. Model transparency is enforced at the schema level (NOT NULL constraint) and in the UI (StatusBar). The behavioral spec's disclaimer rules ensure AI-generated content is contextually marked in regulated domains.

---

## Compliance Matrix

Rows represent each article sub-requirement. Columns represent tier coverage.

### Art. 12 -- Event Logging

| Sub-requirement | Free | Pro | Teams | Enterprise |
|---|---|---|---|---|
| Interaction recording (every AI call) | implemented | implemented | implemented | implemented |
| Model + provider identification | implemented | implemented | implemented | implemented |
| Token count tracking | implemented | implemented | implemented | implemented |
| Cost tracking | implemented | implemented | implemented | implemented |
| Tool call logging | implemented | implemented | implemented | implemented |
| Human action recording | implemented | implemented | implemented | implemented |
| Input/output text capture | implemented | implemented | implemented | implemented |
| Workspace + session scoping | implemented | implemented | implemented | implemented |
| Persona tracking | implemented | implemented | implemented | implemented |
| Append-only enforcement (DDL triggers) | implemented | implemented | implemented | implemented |
| Import provenance | implemented | implemented | implemented | implemented |
| Audit export API (`POST /api/compliance/export`) | implemented | implemented | implemented | implemented |
| Audit export admin UI | N/A | partial | implemented | implemented |
| GDPR Art. 17 pseudonymization | missing | missing | missing | missing |

### Art. 14 -- Human Oversight

| Sub-requirement | Free | Pro | Teams | Enterprise |
|---|---|---|---|---|
| Confirmation gates for write operations | implemented | implemented | implemented | implemented |
| Destructive action blocking (ALWAYS_CONFIRM) | implemented | implemented | implemented | implemented |
| Tiered autonomy (Normal/Trusted/YOLO) | implemented | implemented | implemented | implemented |
| Critical actions gated even at YOLO | implemented | implemented | implemented | implemented |
| Bash command risk classification | implemented | implemented | implemented | implemented |
| Connector write-op risk gating | implemented | implemented | implemented | implemented |
| Per-persona tool deny lists | implemented | implemented | implemented | implemented |
| Oversight action recording in ai_interactions | implemented | implemented | implemented | implemented |
| Oversight log aggregation + approval rate | implemented | implemented | implemented | implemented |
| Cross-workspace access gates | implemented | implemented | implemented | implemented |
| Input injection scanning | implemented | implemented | implemented | implemented |
| Admin panel for oversight review | N/A | N/A | implemented | implemented |

### Art. 19 -- Log Retention

| Sub-requirement | Free | Pro | Teams | Enterprise |
|---|---|---|---|---|
| Default permanent retention (no auto-pruning) | implemented | implemented | implemented | implemented |
| System age tracking (first_run_at) | implemented | implemented | implemented | implemented |
| Pruning detection (system age vs log age) | implemented | implemented | implemented | implemented |
| Append-only DDL triggers | implemented | implemented | implemented | implemented |
| 6-month minimum enforcement | implemented | implemented | implemented | implemented |
| GDPR Art. 17 erasure flow | missing | missing | missing | missing |

### Art. 26 -- Deployer Monitoring

| Sub-requirement | Free | Pro | Teams | Enterprise |
|---|---|---|---|---|
| Cost monitoring (CostTracker) | implemented | implemented | implemented | implemented |
| Daily budget caps (soft/hard) | implemented | implemented | implemented | implemented |
| Tool usage monitoring | implemented | implemented | implemented | implemented |
| Model identification monitoring | implemented | implemented | implemented | implemented |
| Persona tracking | implemented | implemented | implemented | implemented |
| Template-based risk classification | implemented | implemented | implemented | implemented |
| Workspace risk level in reports | implemented | implemented | implemented | implemented |
| Risk classification persistence | partial | partial | partial | partial |
| Admin panel visibility | N/A | N/A | implemented | implemented |

### Art. 50 -- Transparency

| Sub-requirement | Free | Pro | Teams | Enterprise |
|---|---|---|---|---|
| Model name in UI (StatusBar) | implemented | implemented | implemented | implemented |
| Model inventory aggregation | implemented | implemented | implemented | implemented |
| Model NOT NULL schema constraint | implemented | implemented | implemented | implemented |
| Professional disclaimers (behavioral spec) | implemented | implemented | implemented | implemented |
| Anti-hallucination discipline | implemented | implemented | implemented | implemented |
| Persona identification | implemented | implemented | implemented | implemented |
| LLM routing transparency | implemented | implemented | implemented | implemented |

### Summary

| Article | Free | Pro | Teams | Enterprise |
|---|---|---|---|---|
| Art. 12 -- Logging | implemented (13/14) | implemented (13/14) | implemented (13/14) | implemented (13/14) |
| Art. 14 -- Oversight | implemented (11/12) | implemented (11/12) | implemented (12/12) | implemented (12/12) |
| Art. 19 -- Retention | implemented (5/6) | implemented (5/6) | implemented (5/6) | implemented (5/6) |
| Art. 26 -- Monitoring | implemented (7/9) | implemented (7/9) | implemented (8/9) | implemented (8/9) |
| Art. 50 -- Transparency | implemented (7/7) | implemented (7/7) | implemented (7/7) | implemented (7/7) |

Legend:
- `implemented` -- code exists, tested, and active on this tier
- `partial` -- mechanism exists but has a known limitation (see Gaps section)
- `missing` -- not yet implemented (see Gaps section)
- `N/A` -- not applicable to this tier by design (e.g., admin panel not available on Free)

---

## How to Generate Proof

This section provides step-by-step instructions for a user or auditor to independently verify Waggle OS's compliance posture.

### Step 1: Generate an Audit Report via the API

The compliance API is available on all tiers via the local sidecar server.

**Check current compliance status:**

```bash
curl http://localhost:3000/api/compliance/status
```

Returns a `ComplianceStatus` JSON object with per-article status, detail text, and supporting metrics.

Optionally scope to a specific workspace:

```bash
curl "http://localhost:3000/api/compliance/status?workspaceId=ws-my-workspace"
```

**Generate a full audit report for a date range:**

```bash
curl -X POST http://localhost:3000/api/compliance/export \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-04-16T23:59:59Z",
    "format": "json",
    "include": {
      "interactions": true,
      "oversight": true,
      "models": true,
      "provenance": true,
      "riskAssessment": true,
      "fria": false
    }
  }'
```

The response is an `AuditReport` object (see [Sample Audit Report](#sample-audit-report) below).

To scope the report to a single workspace, add `"workspaceId": "ws-my-workspace"` to the request body.

**Server route source:** `packages/server/src/local/routes/compliance.ts`

### Step 2: Verify Interaction Logs Exist

**List recent interactions:**

```bash
curl "http://localhost:3000/api/compliance/interactions?limit=20"
```

Returns `{ interactions: AIInteraction[] }`. Each entry contains:
- `id`, `timestamp` -- when the interaction occurred
- `model`, `provider` -- which LLM was used
- `inputTokens`, `outputTokens`, `costUsd` -- resource consumption
- `toolsCalled` -- JSON array of tools invoked
- `humanAction` -- `'approved'`, `'denied'`, `'modified'`, or `'none'`
- `persona` -- which agent persona handled the request
- `inputText`, `outputText` -- the actual request and response content (Art. 12.1(a))

**Verify interaction count is non-zero after usage:**

```bash
curl http://localhost:3000/api/compliance/status | jq '.art12Logging.totalInteractions'
```

If this returns `0` after the system has been active for 24+ hours, the status will show `"non-compliant"` with a diagnostic message ("Verify logging pipeline").

**Verify append-only enforcement directly in the database:**

```sql
-- This should FAIL with: "ai_interactions is append-only (EU AI Act Art. 12 audit log)"
DELETE FROM ai_interactions WHERE id = 1;

-- This should also FAIL with the same message
UPDATE ai_interactions SET model = 'tampered' WHERE id = 1;
```

The triggers `ai_interactions_no_delete` and `ai_interactions_no_update` in `packages/core/src/mind/schema.ts` enforce this at the engine level.

### Step 3: Check Model Inventory Completeness

**List all models used:**

```bash
curl "http://localhost:3000/api/compliance/models"
```

Returns `{ models: ModelInventoryEntry[] }` with aggregated usage per model:
- `model` -- model identifier (e.g., `claude-sonnet-4-6`)
- `provider` -- provider name (e.g., `anthropic`)
- `calls` -- total number of invocations
- `inputTokens`, `outputTokens` -- total token consumption
- `costUsd` -- total estimated cost

**Filter by date range and workspace:**

```bash
curl "http://localhost:3000/api/compliance/models?from=2026-04-01&to=2026-04-16&workspaceId=ws-legal"
```

**Verify completeness:** Every model that appears in a chat session or agent loop should have a corresponding entry. The `model TEXT NOT NULL` schema constraint ensures no interaction can be logged without a model identifier.

### Step 4: Validate Oversight Log Entries

The oversight log captures every human approve/deny/modify action on agent-proposed tool calls.

**Via the audit report:**

```bash
curl -X POST http://localhost:3000/api/compliance/export \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-04-16T23:59:59Z",
    "format": "json",
    "include": {
      "interactions": false,
      "oversight": true,
      "models": false,
      "provenance": false,
      "riskAssessment": false,
      "fria": false
    }
  }'
```

The response `humanOversightLog` array contains entries with:
- `timestamp` -- when the action occurred
- `action` -- `'approved'`, `'denied'`, or `'modified'`
- `tool` -- which tool the action was taken on
- `detail` -- contextual information (e.g., persona in use)

**Check approval rate:**

```bash
curl http://localhost:3000/api/compliance/status | jq '.art14Oversight'
```

Returns `humanActions` (total count) and `approvalRate` (0-100%).

### Step 5: Generate a PDF Compliance Report

For boardroom-grade PDF output, use the `buildComplianceDocDefinition()` function from `@waggle/agent`:

```typescript
import { buildComplianceDocDefinition, renderComplianceReportPdf, writeComplianceReportPdf } from '@waggle/agent';

// Given an AuditReport from Step 1:
const pdfPath = await writeComplianceReportPdf(auditReport, './compliance-audit.pdf');
```

Or programmatically inspect the document structure:

```typescript
const docDef = buildComplianceDocDefinition(auditReport);
// docDef is a pdfmake TDocumentDefinitions with:
// - Cover page: org name, risk level, period, overall status
// - Article status grid: per-article status badges
// - Model inventory table with totals
// - Human oversight log (up to 50 most recent events)
// - Harvest provenance table
// - Summary section with aggregate counts
```

**Source:** `packages/agent/src/compliance-pdf.ts`
**Tests:** `packages/agent/tests/compliance-pdf.test.ts`

### Step 6: Verify Risk Classification

Check the risk classification for a workspace:

```bash
curl -X POST http://localhost:3000/api/compliance/export \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws-legal",
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-04-16T23:59:59Z",
    "format": "json",
    "include": { "interactions": false, "oversight": false, "models": false, "provenance": false, "riskAssessment": true, "fria": false }
  }'
```

The `workspace.riskLevel` field in the response shows the classification (`minimal`, `limited`, `high-risk`, or `unacceptable`).

The `TEMPLATE_RISK_MAP` in `packages/core/src/compliance/types.ts` maps workspace templates to risk levels:

| Template | Risk Level |
|---|---|
| legal-review | high-risk |
| hr-management | high-risk |
| recruiting | high-risk |
| finance | high-risk |
| insurance | high-risk |
| credit-scoring | high-risk |
| healthcare | high-risk |
| sales-pipeline | limited |
| marketing-campaign | limited |
| customer-support | limited |
| product-launch | limited |
| agency-consulting | limited |
| education | limited |
| data-analysis | limited |
| research-project | minimal |
| code-review | minimal |
| content-creation | minimal |
| project-management | minimal |
| blank | minimal |

---

## Sample Audit Report

Below is the structure produced by a `ReportGenerator.generate()` call (via `POST /api/compliance/export`). This is the same structure consumed by `buildComplianceDocDefinition()` to produce the PDF.

```json
{
  "report": {
    "version": "1.0",
    "generatedAt": "2026-04-16T14:30:00.000Z",
    "period": {
      "from": "2026-01-01T00:00:00Z",
      "to": "2026-04-16T23:59:59Z"
    },
    "generatedBy": "Waggle OS"
  },
  "workspace": {
    "id": "ws-legal",
    "name": "Legal Review",
    "riskLevel": "high-risk",
    "riskClassifiedAt": null
  },
  "complianceStatus": {
    "overall": "compliant",
    "art12Logging": {
      "status": "compliant",
      "detail": "1,247 interactions logged with full model, token, cost, and tool tracking.",
      "totalInteractions": 1247
    },
    "art14Oversight": {
      "status": "compliant",
      "detail": "47 human oversight actions: 39 approved, 5 denied, 3 modified.",
      "humanActions": 47,
      "approvalRate": 83
    },
    "art19Retention": {
      "status": "compliant",
      "detail": "Logs retained since 2026-01-15 (91 days). System is still within its first 180 days.",
      "oldestLogDate": "2026-01-15T09:30:00.000Z",
      "retentionDays": 91
    },
    "art26Monitoring": {
      "status": "compliant",
      "detail": "4 active monitors: cost, tools, model ID, persona.",
      "activeMonitors": [
        "cost_tracking",
        "tool_logging",
        "model_identification",
        "persona_tracking"
      ]
    },
    "art50Transparency": {
      "status": "compliant",
      "detail": "2 model(s) in use, all identified in StatusBar and interaction logs.",
      "modelsDisclosed": true
    }
  },
  "modelInventory": [
    {
      "model": "claude-sonnet-4-6",
      "provider": "anthropic",
      "calls": 500,
      "inputTokens": 1000000,
      "outputTokens": 200000,
      "costUsd": 3.50
    },
    {
      "model": "claude-haiku-3-5",
      "provider": "anthropic",
      "calls": 747,
      "inputTokens": 500000,
      "outputTokens": 80000,
      "costUsd": 0.42
    }
  ],
  "humanOversightLog": [
    {
      "timestamp": "2026-04-10T09:15:00.000Z",
      "action": "approved",
      "tool": "save_memory",
      "detail": "Persona: legal-professional"
    },
    {
      "timestamp": "2026-04-11T14:22:00.000Z",
      "action": "denied",
      "tool": "send_email",
      "detail": "Persona: legal-professional"
    }
  ],
  "harvestProvenance": [
    {
      "source": "Claude Code exports",
      "importedAt": "2026-03-01T00:00:00.000Z",
      "itemsImported": 156,
      "framesCreated": 89
    }
  ],
  "interactionCount": 1247
}
```

### PDF Structure (from `buildComplianceDocDefinition`)

The PDF generated from this report contains the following pages and sections:

**Page 1 -- Cover**
- Title: "AI ACT COMPLIANCE AUDIT" (honey-colored kicker, #E5A000)
- Workspace name in large bold text (30pt, #08090C)
- Honey-colored horizontal rule separator
- Two-column metadata grid:
  - Left: Risk Level (e.g., "HIGH-RISK"), Period (date range)
  - Right: Overall Status (color-coded: green/honey/red), Generated timestamp
- Page break after cover

**Page 2+ -- Compliance Status**
- Section header: "Compliance Status" (16pt bold, honey)
- Executive summary sentence based on overall status
- Article status grid table:
  - Column 1: Article label (e.g., "Art. 12 -- Logging")
  - Column 2: Status badge (COMPLIANT in green, WARNING in honey, NON-COMPLIANT in red)
  - Column 3: Detail text

**Model Inventory**
- Section header: "Model Inventory"
- Table with columns: Model, Provider, Calls, Input tok, Output tok, Cost (USD)
- TOTAL row at bottom with bold sums and #FAFAFA background
- Falls back to italic "No model calls recorded" if empty

**Human Oversight Log**
- Section header: "Human Oversight Log"
- Table with columns: Timestamp, Action, Tool, Detail
- Capped at 50 most recent events with overflow note
- Falls back to italic "No human oversight events" if empty

**Harvest Provenance**
- Section header: "Harvest Provenance"
- Table with columns: Source, Imported At, Items, Frames
- Falls back to italic "No harvest provenance data" if empty

**Summary**
- Bulleted list: total interactions, models in inventory, oversight events, harvest sources
- Horizontal rule separator
- Footer: report version + generator attribution

**Every page (2+):**
- Header: "Waggle -- AI Act Compliance Audit" (left) + workspace name (right)
- Footer: generation date (left) + page number "X / Y" (right)

**PDF metadata:**
- Title: "Waggle AI Act Compliance Audit -- {workspace name}"
- Author: "Waggle OS"
- Creator: "Waggle OS Compliance Module"
- Subject: period description

**Source:** `packages/agent/src/compliance-pdf.ts` -- `buildComplianceDocDefinition()` (line 205)
**Test:** `packages/agent/tests/compliance-pdf.test.ts` -- verifies metadata, page size, margins, content structure

---

## Gaps and Remediation Plan

| # | Gap | Articles Affected | Severity | Remediation | Status |
|---|---|---|---|---|---|
| 1 | GDPR Art. 17 pseudonymization flow | Art. 12, Art. 19 | Medium | Implement tombstone INSERT + status flag flow that replaces `inputText`/`outputText` without bypassing append-only triggers | Designed, not implemented |
| 2 | Risk classification not user-editable at runtime | Art. 26 | Low | Add workspace config field for manual risk level + `riskClassifiedAt` timestamp persistence | `riskClassifiedAt` field exists as null; needs persistence logic |
| 3 | Admin panel gated to TEAMS/ENTERPRISE | Art. 14, Art. 26 | Informational | The underlying data and API endpoints are available on all tiers. Only the admin UI is gated. No action required for compliance -- the API is the proof surface. | By design |
| 4 | `auditLog` capability set to `'none'` on FREE tier | Art. 12, Art. 14 | Informational | This controls admin UI visibility, not data collection. All interaction data is recorded regardless of this setting. Consider renaming to `auditLogUI` for clarity. | By design |
| 5 | No NER-based PII detection | Art. 10 (data quality) | Low | Current regex-based PII scan catches emails, phones, API keys, JWTs. A model-based NER scanner would improve coverage. | v1 regex shipped; NER deferred |

**Overall assessment:** Waggle OS meets the substantive requirements of Articles 12, 14, 19, 26, and 50 on all tiers. The compliance data layer (schema, interaction store, status checker, report generator) runs unconditionally. The gaps are in ancillary areas (GDPR erasure flow, risk classification UI, PII detection depth) that do not affect the core compliance posture.

---

_Generated 2026-04-16. Source files verified against the `main` branch of `waggle-os`. For the machine-readable prior audit, see [`AI-ACT-AUDIT-2026-04-10.json`](./AI-ACT-AUDIT-2026-04-10.json). For the PDF generator, see `packages/agent/src/compliance-pdf.ts`._
