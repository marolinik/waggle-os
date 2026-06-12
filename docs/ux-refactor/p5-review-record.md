# P5/D4 — Adversarial Review Record

> Multi-agent review of the P5/D4 skill-governance diff (`c33da1e..5969778`), run as a
> dynamic workflow: **6 dimension reviewers → 3-lens adversarial verification per finding**
> (correctness / security-and-data-integrity / reproduction; confirmed if ≥2 of 3 vote real).
> 33 agents, ~3.6M subagent tokens, ~12 min. Fixes in `cdcef3d`.

## Tally

**9 findings → 5 confirmed (4 distinct) / 4 refuted.**

| # | Sev | Votes | Dimension | Finding | Disposition |
|---|-----|-------|-----------|---------|-------------|
| 2/4 | **HIGH** | 3/3 + 2/3 | service | Sticky provenance aliased into the AUDIT row — an agent editing a user-authored skill was recorded `initiator:'user'`, violating D4(i) "always audit initiator:'agent'" | **FIXED** — decoupled `fileInitiator/fileSource` (sticky, → frontmatter) from `input.initiator/source` (actual actor, → audit row). Test asserts `audit[0].initiator==='agent'` on an agent-update-of-user-skill. |
| 1 | MED | 2/3 | migration | `rebuildForWidenedActionCheck` dropped both `idx_audit_*` indexes — SQLite `RENAME` carries index names to the legacy table, so `CREATE INDEX IF NOT EXISTS` no-ops and `DROP TABLE` takes them. (Shadowed today since prod opens via `MindDB.runMigrations` which uses the index-correct `db.ts` path — but a live latent landmine on the DEC-1 migration path.) | **FIXED** — `DROP INDEX IF EXISTS` before recreate (mirrors `db.ts`). Test asserts both indexes exist post-rebuild. |
| 3 | MED | 3/3 | ui | `GET /api/skills` preview leaked the stamped YAML frontmatter into the Hub row (`s.content.slice(0,200)` led with `---initiator: agent...`) | **FIXED** — preview derived from `parseSkillFrontmatter(raw).body`. Server test asserts no `---`/`initiator:` in preview. |
| 5 | LOW | 3/3 | ui | Agent skill wore BOTH `agent · review` AND the name-heuristic `custom` label + appeared in the Custom tab | **FIXED** — `initiator==='agent'` ⇒ status `installed`; provenance supersedes the `custom` heuristic per D4(iv). |

## Refuted (correctly dismissed, 0/3)

- **service-dim duplicate of #1** (index drop) — the migration-dim panel confirmed it 2/3; the service-dim panel refuted 0/3. The disagreement was itself signal of a real-but-shadowed latent bug; fixed regardless.
- **Unparseable-prior fallback** (LOW) — `writeSkill` falling back to caller provenance when the prior file is unreadable is correct/intended, not a leak.
- **Hash-store trims** (MED) — `computeSkillHash` over on-disk content vs `loadSkills` trim was traced to NOT break `hash-status`.
- **`auto_extract_skills` direct `fs.writeFileSync`** (MED) — out of D4 scope (not one of the three named tools); ledgered in the P5 plan's out-of-scope section. A candidate post-launch consolidation, not a P5 defect.

## Gate (post-fix)

tsc 0 (core/agent/server/apps-web) · 101 regression + 28 P5/fix tests green · lint 0. `cdcef3d`.
