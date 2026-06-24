# PR3.5 — Live route verification against a FRESH sidecar (2026-06-16)

**Why this exists:** the S3 handoff shipped PR3.5 but flagged one open item — the running
`:3333` dev sidecar was started 2026-06-12 (4 days pre-PR3.5), so `tsx` never loaded the
new routes. The committed UI smoke (`smoke-pr35-20260616/`) therefore ran the Memory-Trust
front door against a **stale** backend. This pass restarts the sidecar from the PR3.5 tree
and exercises the three new routes end-to-end (HTTP + FE), closing that gap.

**Verdict: PASS.** All three PR3.5 backend routes work live; the FE wires to them with **0
console errors/warnings**.

---

## Environment (verified, not assumed)

| Thing | State |
|---|---|
| Branch | `feature/warm-hive-pr3` @ `199bdbab` |
| Sidecar | fresh start from this tree — `WAGGLE_SKIP_LITELLM=1 tsx packages/server/src/local/start.ts` on `:3333`; `/health` → `database.healthy:true`, personal mind frameCount 3 |
| New-route presence proof | `GET /api/memory/999999/trace` (no auth) → **401 MISSING_TOKEN** (route exists) — NOT a Fastify "route not found" 404, i.e. the live sidecar has the PR3.5 code |
| Vite | running `:8080`, **serves this tree** (its served `MemoryTrustManage.tsx` module contains `ConfidenceRing` + `/confirm`) and proxies `/api` → my fresh `:3333` |
| Auth | bearer from `GET /api/auth/session-token` (loopback, no Origin needed) |

---

## 1A — `GET /api/workspaces/:id/context` projects `frame.source`  ✅

The provenance ⬡ pill on the Workspace "What Waggle knows" rows is fed by the `source`
column the SELECTs now carry (workspaces.ts:394 / :411).

| Workspace | recentMemories | sources observed |
|---|---|---|
| `writer-demo-anya` | 8 | **`user_stated` AND `tool_verified`** (multi-source — proves not hardcoded) |
| `default-workspace` | 1 | `user_stated` |
| `new-hive` | 0 | (honest empty) |

`recentDecisions[].source` projected too. Writer-demo frames 14/15 carry `agent_inferred`
(the backend-review H-1 honesty fix — agent writes are no longer silently `user_stated`).

## 1.5 — `POST /api/memory/:id/confirm` + `GET /api/memory/:id/trace`  ✅

**confirm** (HTTP + audit-trail proof):
- `POST /api/memory/47/confirm` → `status: active`, id 47. (404 on `999999`.)
- End-to-end write proof in `~/.waggle/audit.db`:
  `event_type=memory_write ws=personal 2026-06-16 15:43:56 in={"frameId":47,"action":"confirm"} out={...,"status":"active"}`
  → route → `setMetadata` → `emitAuditEvent` → DB. Workspace-mind path also exercised
  (writer-demo-anya frame 12, `mind:workspace`).
- The drawer for M-47 shows `updated 6/16/2026, 5:43:56 PM` — the exact `updatedAt` my
  confirm stamped (live persistence proof).

**trace** (all three paths):
- `GET /api/memory/47/trace` → `{"trace":null}` (honest — manual frame, no `trace_id`).
- `GET /api/memory/999999/trace` → 404 `Memory not found`.
- `GET /api/memory/abc/trace` → 400 `Invalid memory id`.
- Populated `{trace:{...}}` requires a chat-written frame carrying `metadata.trace_id`
  (pattern-write-back path) — none in the dev data; unit-covered (memory-center 25/25).

## UI smoke — Memory-Trust front door vs the FRESH sidecar  ✅

`http://localhost:8080/memory` → **Trust tab is the default Memory view**.

- **Manage** (`01-manage-fresh-sidecar.png`): honest stat bar — `3` memories · **`—`**
  high-confidence (gated, not faked) · `0` stale · `0` awaiting confirm. 3 rows with the
  live 3-segment provenance line `⬡ M-47 · source: you · ● fresh`; M-1 shows real freshness
  `● aging — added 9w ago`. "Forgotten" filter honestly disabled (hard-delete, no recovery).
- **Detail drawer**: `source: user_stated`, `updated …5:43:56 PM` (my confirm write).
- **"Why is this here?"** → FE fired `GET /api/memory/47/trace?mind=personal` → **200** →
  Why view rendered the no-fabrication empty state: *"No trace is linked to M-47. This
  memory was added manually, imported, or written before traces were linked…"*
  (`02-why-trace-null-fresh-sidecar.png`).
- All FE→backend calls 200 (`/api/memory?mind=personal&limit=500`, `/api/memory/stats?scope=all-minds`,
  `/api/workspaces`, `/api/memory/47/trace`). **Console: 0 errors, 0 warnings** (whole session).

---

## Notes
- Audit log shows a **prior** live-verify ran at 15:18 (throwaway frames, since cleaned up)
  — consistent with concurrent activity earlier in the day; this pass independently
  reproduces PASS on a freshly-restarted sidecar.
- No code changed in this pass — verification only. Evidence is uncommitted (founder's call).

## Next (ship)
1. Mark **PR #17** ready. It's stacked on **PR #16** → merge/rebase **#16 → main first**,
   then **rebase #17 onto main**.
2. Optionally commit this evidence dir alongside the prior `smoke-pr35-20260616/`.
