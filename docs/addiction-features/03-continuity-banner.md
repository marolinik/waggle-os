# 03 — Continuity Moments (Auto-Resume Banner)

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~120 LOC + ~2-3h wall-clock
**Touches:** apps/web (1 file: ChatApp.tsx OR new ContinuityBanner.tsx), packages/server (1 endpoint extension)

---

## User story

When I open Chat after closing it for hours/days, I want a 1-line banner reminding me where I left off — what I last decided, what's still open — and a one-click way to continue or start fresh, so I don't have to re-orient myself manually.

## Acceptance criteria

1. When ChatApp mounts AND `messages.length === 0` AND last session for the workspace was within the past 7 days, render a "Picking up where you left off" banner at the top of the chat.
2. Banner content: 1-line headline ("Yesterday you decided X") + 2 buttons: `Continue` (loads last session messages) + `Start fresh` (dismisses banner, opens empty input).
3. Banner suppressed for fresh workspaces (sessionCount=0) and for sessions older than 7 days (handoff to LoginBriefing's domain).
4. Dismissing banner via `Start fresh` sets a per-workspace flag `continuity:dismissed:{wsId}` so the banner doesn't re-render same session.
5. Continuity banner replaces neither WorkspaceBriefing nor LoginBriefing — it's a third surface specific to "between-session" memory.

## UI sketch

```
ChatApp top, above message list:
  ┌──────────────────────────────────────────────────────────┐
  │ ⟳ Picking up where you left off                       ✕  │
  │ Yesterday you decided: ship migrations Wednesday.        │
  │ 2 open follow-ups · last session 16h ago                 │
  │                                                          │
  │ [ Continue conversation ]    [ Start fresh ]             │
  └──────────────────────────────────────────────────────────┘

After click Continue: banner fades, last session messages stream into the chat.
After click Start fresh: banner removed for this session, input focused.
```

## Data model

No new tables. Extends existing endpoints:
- `GET /api/workspaces/:id/context` — already returns `recentThreads[]`. Pull `recentThreads[0]` if its `lastActive` ≤ 7 days. Add `lastDecision` field (top decision content from yesterday) — drawable from existing `recentDecisions[0]`.
- New endpoint `POST /api/sessions/:id/load` — already exists conceptually as `getHistory(workspaceId, sessionId)`. Confirm wire-up.

Frontend localStorage:
```
continuity:dismissed:{wsId} = ISO timestamp
```
Set on Start-fresh click. Banner suppressed for that workspace until next mount where lastActive moves forward (i.e. user has actually had new activity).

## Implementation notes

- Existing `WorkspaceBriefing` already shows `recentThreads[]` as a list. Continuity banner is a focused alternative: ONE thread, biggest decision, action-oriented buttons.
- Decision: keep WorkspaceBriefing for the "browse" affordance (5 recent threads + memories + decisions list) and add ContinuityBanner as the "resume" affordance (1 thread, 1 click to continue). They co-exist, both above chat list, ContinuityBanner above WorkspaceBriefing.
- Continue button: calls existing session load mechanism — `setActiveSession(threadId)` then `loadSessionHistory(threadId)`.
- Decision extraction: `recentDecisions[0]` from workspace-context already filtered for last 24h elsewhere; reuse.

## Estimate

- ContinuityBanner component: ~70 LOC
- ChatApp wire-up + localStorage logic: ~30 LOC
- Server context extension (lastDecision field): ~10 LOC
- Tests: ~30 LOC (banner render conditions, dismissal flag, time-window logic)
- **Total ~140 LOC, ~2-3h with verification.**

## Risks + open questions

1. **Three surfaces collide** — ContinuityBanner + WorkspaceBriefing + LoginBriefing all surface "what you did last" content. Need clear visual hierarchy: LoginBriefing (cross-workspace), WorkspaceBriefing (this workspace overview), ContinuityBanner (one-click resume).
2. **Stale banner** — user opens Chat at 2am after a 12-hour break. Banner says "Yesterday you...". Linguistic edge case (was it really yesterday?). Use existing `timeAgo()` helper.
3. **Continue vs new session** — clicking Continue should load the OLD session's messages OR start a NEW session that references them? v1: load old session messages so user sees full context.
4. **Multiple workspaces** — banner only fires for the active workspace. Cross-workspace continuity prompts are LoginBriefing's job.
5. **Fresh user** — sessionCount=0 → banner suppressed. But what about a returning user with one stub workspace and no real sessions? Same: suppress.

## Out of scope (v1)

- Voice continuity ("Resume our conversation where I asked about X").
- Multi-thread continuity (continue the most-impactful thread, not just newest).
- Smart "you might want to follow up on X" suggestion engine. (That's the Daily Brief's domain.)
- Cross-device continuity sync (already handled by server-side session storage; no client work needed).

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Time window — 7 days reasonable? or shorter (3 days)? or 30 days?
- [ ] Dismissal scope — per-session (re-show next mount) or per-day?
- [ ] Continue button behavior — load old messages vs new session w/ context inject
- [ ] Co-existence with WorkspaceBriefing — both above chat OR Continuity replaces Briefing for last-7-day case?
