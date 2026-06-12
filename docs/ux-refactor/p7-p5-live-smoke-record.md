# P5 + P7 — Live Browser Smoke Record (2026-06-12)

> Real-browser verification of the launch-critical P5 (skill governance) + P7/D15
> (error states + risk taxonomy) work, run against a live local stack: sidecar
> (Fastify, :3333, anthropic-proxy provider) + vite dev server (:8080) + Playwright.
> Goal: confirm no real-browser gap that the unit/integration suites couldn't catch.

## Verdict: PASS (core goal met)

App boots clean and **every screen changed in P5/P7 renders correctly with 0 console
errors attributable to the changes**. The P5 provenance→badge chain is verified
end-to-end in the browser. One residual (live approval-card trigger) is unit-covered.

## What was verified

| Surface | Phase | Result |
|---------|-------|--------|
| Boot → `/home` (Home Cockpit) | regression | Renders full briefing; **0 console errors** |
| `/approvals` | B1 | Empty state ("No pending approvals") on the success path — correct; no error-as-empty, no crash |
| `/skills` (Skills Hub) | P5/D4iv | Renders; see end-to-end badge check below |
| `/room` | B2 | "idle-empty" — SSE subscribed OK, settled (not stuck connecting, not error); the connecting/error/idle distinction works |
| `/files` | B4 | Populated (real load) — no false cold-load error; `loadedPath` gating correct |
| `/settings/events` | B5 | Renders; no error boundary, no false "couldn't load" |
| `/memory` | B5 | Two-mind Memory Center renders; no error boundary |
| `/settings` | B5 | Renders; **no unhandled promise rejection** (the getTelemetryStatus `.catch` fix held) |

**Cumulative: 0 console errors** across all 8 screens (`all: true`).

### P5/D4iv provenance badge — verified END-TO-END in the browser

1. Wrote an agent-stamped skill (`initiator: agent`, `source: chat`) directly to
   `~/.waggle/skills/smoke-agent-skill.md`.
2. `GET /api/skills` returned `{ initiator: 'agent', source: 'chat', preview: '<body>' }`
   — provenance present **and the preview is the clean body, not the YAML frontmatter**
   (confirms the P5-review fix #3 live).
3. Reloaded `/skills` → the skill row rendered the **"agent · review"** badge
   (`rowHasBadge: true`, exactly 1 badge), and did NOT also wear the name-heuristic
   "custom" label (P5-review fix #5). Cleaned up the smoke skill afterward.

## Residual (NOT verified live — unit-covered)

- **A5/A6 in-chat approval card with the risk badge + Always-allow gating** was not
  triggered live: it needs a real workspace chat + a deterministic LLM tool-call to
  produce an `approval_required` event, which is flaky. The attempt hit a routing stub
  (`/workspaces/default/chat` 404s `/context` — `default` is not a real workspace id,
  pre-existing, unrelated to P5/P7).
  - **Coverage that stands in:** `p7-a5-approval-card-risk.test.tsx` (badge renders incl.
    critical), `p7-a6-approval-gating.test.tsx` (modal represents critical; Always-allow
    gated by approvalClass), and the A4 `classifyGatedToolRisk` unit tests. The FE data
    path is a type-only widening (`useChat` casts the SSE payload straight to
    `ApprovalRequest`), so the fields the A4 server enrichment sends are already present
    at runtime — the unit tests exercise the render of exactly that shape.
  - **To close fully** (post-launch nicety): drive a chat in a real workspace that elicits
    a `write_file`/`bash` call and assert the card shows the RiskBadge + that "Always allow"
    is hidden on a critical op.

## Environment notes (for the next smoke)

- Sidecar: `WAGGLE_SKIP_LITELLM=1 node --env-file=.env node_modules/tsx/dist/cli.mjs packages/server/src/local/start.ts` → :3333 (anthropic-proxy; ioredis ECONNREFUSED on :6381 is non-fatal noise; Redis not required).
- Vite: `npm run dev` → :8080, proxies `/api`,`/health`,`/ws` → 3333.
- `build:packages` must be green first (hive-mind-core exports only `dist/`).
- Stop servers by port via PowerShell `Stop-Process` (PID from `netstat -ano | grep ":<port> "`).
- `.playwright-mcp/` artifacts are gitignored.
