# Compliance PDF Audit — 2026-04-20 (M-02..06)

**Scope:** Audit-first per S2/S3/S4 recurring pattern. Verify each
sub-item before committing to the 3.5 d backlog estimate.

## Sub-item disposition

| Item | Spec | Engine | Route | UI | Verdict | Build est. |
|------|------|--------|-------|-----|---------|------------|
| **M-02 PDF export route** | pdfmake + buildComplianceDocDefinition → createPdf → route | ✅ `pdfmake@0.3.7` installed in `packages/agent`; `buildComplianceDocDefinition(report)` ✅ `renderComplianceReportPdf(report)` returns Buffer ✅ `writeComplianceReportPdf` writes to disk ✅ `compliance-pdf.test.ts` ✅ | ❌ no `/api/compliance/export-pdf` route | n/a | **95% done** — route wiring only | ~30 min |
| **M-03 Template system JSON schema** | Templates as JSON with sections/logo/branding/footer/risk class + loader + validator | ❌ nothing | ❌ | ❌ | **0% done** — genuinely new | ~2-3 hr |
| **M-04 ComplianceReport full-page viewer** | Expand current card → full-page + date picker + section toggles + PDF download | 🟡 `ComplianceDashboard.tsx` exists as 324-line card | ✅ GET /api/compliance/status shipped | 🟡 no date picker, no section toggles, no PDF download button | **50% done** — UI expansion | ~2-3 hr |
| **M-05 Custom branding** | Logo upload, org name override, risk classification override | ❌ no branding store; `WorkspaceConfig.riskLevel` + `riskClassifiedAt` shipped S1 (C2) | ❌ no branding route | ❌ | **15% done** (C2 risk fields) — needs branding store + logo file | ~1-2 hr |
| **M-06 KVARK template** | IAM audit, data residency, department breakdown section | ❌ nothing | ❌ | ❌ | **0% done** — needs M-03 first | ~1 hr once M-03 lands |

**Total revised: ~7-10 hr** (vs 3.5 d = 28 hr — **~65-75% reduction**).

## What's cheap and high-value — ship this session

**M-02 (~30 min):** Add `POST /api/compliance/export-pdf` to
`packages/server/src/local/routes/compliance.ts`. Reads the same body
shape as `/api/compliance/export`, calls `generator.generate()` to get
the `AuditReport`, pipes through `renderComplianceReportPdf()`, sends
with `Content-Type: application/pdf`.

**M-04 (~2-3 hr):** Expand `ComplianceDashboard.tsx`. Add:
- Date range picker (from/to inputs, default to last 30 days)
- Section toggles (interactions / oversight / models / provenance / risk)
- "Download PDF" button that POSTs to `/api/compliance/export-pdf` and
  triggers a browser download from the blob response

## What's design territory — defer to follow-up session

**M-03 Template system** is spec territory. Decisions:
- Schema shape: static JSON files shipped with the app, or user-editable
  template records in SQLite?
- Logo URL: where do logos live — `dataDir/compliance-logos/`?
  workspace-scoped?
- Section overrides: per-template section toggles that override the
  user's runtime selection?
- Risk class override per template, or tied to WorkspaceConfig?

**M-05 Branding** depends on M-03's template schema. Parking until M-03.

**M-06 KVARK template** is a JSON file once M-03 ships the loader.
Content (IAM audit columns, data residency shape, department breakdown)
needs Marko input from his actual KVARK demo storyboard.

## Recommended execution

1. **M-02** (~30 min, this session) — unblocks downstream + lets M-04
   have a working Download button to wire to.
2. **M-04** (~2-3 hr, this session) — visible demo value, no design
   decisions needed.
3. **M-03 + M-05 + M-06** — own session with Marko's input on the
   template-schema structure. Estimated ~4-6 hr together once decisions
   land.

---

**Author:** Claude (audit per Marko's M-02..06 pick after Wiki v2 completion)
