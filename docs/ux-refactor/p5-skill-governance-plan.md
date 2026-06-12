# P5 — D4 Skill-Write Governance · Build Plan

> Phase sequence (open-questions.md:574): P1=D3 ✅ · P2=verify+J08 ✅ · P3=D2 ✅ ·
> P4=D11/D12 ✅ · **P5=D4** ← here · P7=D15 (card risk-taxonomy alignment, deferred).
> Decision text: `docs/ux-refactor/deltas/open-questions.md` §D4 (lines 537–543).

## What D4 ratified (four bindings)

- **(i) Policy.** `create_skill` — normal = ask (in-chat approval card), trusted/yolo =
  auto-execute. `delete_skill` — always ask, every autonomy level. `read_skill` ungated.
  Always-audit all three with `initiator:'agent'`.
- **(ii) Surface.** In-chat SSE approval card is canonical. Card↔`ui/approval-modal.tsx`
  risk-taxonomy alignment is **D15/P7 — explicitly deferred, NOT P5.**
- **(iii) One write path.** Do NOT route the agent tool through HTTP. Extract a **shared
  skill-write service module** (create/update/delete + redaction + audit inside the
  service), consumed by both `routes/skills.ts` and `skill-tools.ts`. One module, one
  audit trail, two callers.
- **(iv) Endpoint consolidation (absorbs D14).** `POST /api/skills` delegates to the
  audited service. `PUT`/`DELETE /api/skills/:name` enter the audit trail. **Provenance:**
  frontmatter `initiator`/`source` + `GET /api/skills` returns it + Skills Hub badge
  ("created by agent — review"), replacing the name-heuristic "Custom" classification.
- **Persona exception** (already shipped): read-only personas keep losing
  `create_skill`/`delete_skill`, retain `read_skill`.
- **PM residual** (no code): skill creation stays FREE at launch — tier gate unchanged.

## Recon — current seams (verified 2026-06-12)

| Seam | File | State |
|------|------|-------|
| Agent tool | `packages/agent/src/skill-tools.ts` | create/delete write to disk + redact; **no audit, no provenance, no gate** |
| HTTP routes | `packages/server/src/local/routes/skills.ts` | `POST /api/skills`, `PUT`/`DELETE /:name` redact but **don't audit**; `POST /api/skills/create` (structured) DOES audit `action:'installed'` |
| Autonomy gate | `packages/agent/src/confirmation.ts` | declarative sets; chat.ts:900 calls `needsConfirmationWithAutonomy` |
| Frontmatter | `packages/agent/src/skill-frontmatter.ts` | parser+serializer; has name/description/scope/promoted_from/permissions — **no initiator/source** |
| Audit store | `packages/core/src/install-audit.ts` | `record()`; action enum **lacks a delete value** |
| Skills Hub UI | `apps/web/src/components/os/apps/skills/SkillRow.tsx`, `routes/SkillsRoute.tsx` | `custom` badge driven by name-heuristic |

## Decisions

### DEC-1 — Audit `action` for delete (the one real fork)

`AuditAction = 'proposed'|'approved'|'installed'|'rejected'|'failed'|'blocked'` — no
delete/uninstall value. The CHECK is duplicated in `packages/core/src/install-audit.ts`
**and** `packages/hive-mind-core/src/mind/schema.ts` (OSS-synced, §7.5). SQLite CHECK
can't be ALTERed → widening needs a table-rebuild migration on existing installs.

- create / update → `action:'installed'` (established convention — `routes/skills.ts`
  structured-create already does this; a skill on disk = installed).
- delete → **needs a decision** (see status note). Options:
  - **A (recommended): add `'uninstalled'`** to `AuditAction` + both schema CHECKs +
    a rebuild migration. Fills a genuine pre-existing gap (no uninstall of ANY capability
    is auditable today); additive/backward-compatible; honest trail. Cost: migration in
    2 files + OSS drift check.
  - **B: reuse `'rejected'`** with `detail:'deleted by agent'`. Zero migration, but
    semantically muddy and pollutes rejection queries.

### DEC-2 — Shared service location

`packages/agent/src/skill-write-service.ts`. The agent package is already a server
dependency (`@waggle/agent` imported by `routes/skills.ts`), so one module serves both
callers. Signature (pure, deps injected — no hidden globals):

```
createSkillWrite({ skillsDir, name, content, initiator, source, auditStore?,
                   skillHashStore?, onChange? }) → { path, redactions, action }
updateSkillWrite({ … }) ; deleteSkillWrite({ skillsDir, name, initiator, auditStore?, … })
```

Redaction (`redactSkillContent`) + provenance frontmatter stamp + audit `record()` all
live inside the service. Callers stop doing these by hand.

### DEC-3 — Provenance frontmatter

Add `initiator?: 'agent'|'user'` and `source?: string` to `SkillFrontmatter` + parser +
`serializeFrontmatter`. The service stamps them on create (preserves on update). Legacy
skills with no frontmatter → treated as `initiator:'user'` (no badge). Name-heuristic
"Custom" classification retired in favor of `initiator==='agent'`.

## Build order (TDD, commit per step)

1. ✅ **D4(i) gating** — `confirmation.ts` sets + tests. (`73f2ed5`)
2. ✅ **DEC-1 audit enum** — founder picked **Option A**: `'uninstalled'` + widen-CHECK
   migration in core `install-audit.ts` (belt-and-suspenders rebuild) AND hive-mind-core
   `db.ts` runMigrations sentinel + `schema.ts` DDL. (`658884f`)
3. ✅ **DEC-3 frontmatter** — `initiator`/`source` in parser/serializer. (`f3bda5b`)
4. ✅ **DEC-2 service** — `skill-write-service.ts` (lossless provenance stamp). (`2b56b78`)
5. ✅ **Rewire agent** — `skill-tools.ts` create/delete via service. (`2b56b78`)
6. ✅ **Rewire HTTP** — `routes/skills.ts` POST/create/PUT/DELETE via service; `GET
   /api/skills` returns provenance. (`29313a9`)
7. ✅ **UI badge** — `SkillRow.tsx` "agent · review" off provenance. (`48292ef`)
8. ⏳ Adversarial review workflow → record → final gates. (pending — needs opt-in)

## Status — implementation COMPLETE (2026-06-12)

All four D4 bindings shipped in 7 commits (`73f2ed5`→`48292ef`), NOT pushed.
Gates: tsc 0 across shared/hive-mind-core/core/agent/server/apps-web · 147 P5 tests
green (agent 96, core 22, server 20, FE 9) · lint 0.

**Remaining for P5 closeout:**
- **OSS re-split (§7.5):** `hive-mind-core/src/mind/{schema.ts,db.ts}` changed here first
  (the `'uninstalled'` CHECK + migration sentinel). The `marolinik/hive-mind` mirror must
  be regenerated via subtree-split before the next OSS release.
- **Adversarial review** (step 8) — every prior P-phase ran a multi-agent review workflow;
  deferred pending explicit opt-in.
- **Decision-log + open-questions** phase-line update marking P5 done.
- **D4(ii)** card↔modal risk-taxonomy alignment stays **P7/D15** (out of P5 scope).

## Out of scope (ledgered)

- D4(ii) card↔modal risk-taxonomy alignment → **P7/D15**.
- Marketplace install PRO-gate (unchanged).
- `promote_skill`/`auto_extract_skills`/`retire_skills` audit (not named by D4; leave).
