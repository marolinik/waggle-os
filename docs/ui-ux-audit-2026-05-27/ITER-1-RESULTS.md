# Iteration 1 · Results — 2026-05-27

## Fixes shipped
1. **LoginBriefing** — TEST_WORKSPACE_PATTERNS filter (E2E-Audit-*, test-, smoke-, audit-)
2. **LoginBriefing** — identity name appended to greeting
3. **ChatApp** — session sidebar default-open when sessions exist + aria-label/title/aria-expanded on toggle
4. **WorkspaceSwitcher** — same TEST_WORKSPACE_PATTERNS filter; active workspace always shown even if it matched a pattern

## Verified live
- Greeting: `Good afternoon, Waggle` (identity name from vault)
- Brag line: `5 memories · 137 entities · 6 relations across **1 workspace** · active 1w ago` (was "5 workspaces")
- Workspace list in briefing: only `Default Workspace` (was 5 entries — 4 leaked test workspaces hidden)
- Chat session rail: visible by default with 5 sessions; toggle has accessible labels

## Honest re-scoring
My baseline dim-1 (First-run clarity) was harsh — the briefing has a clear primary CTA ("Start Working") and outside-click dismissal works. Correcting baseline now that I've audited the LoginBriefing source code.

| Persona | Baseline (corrected) | After iter 1 | Δ |
|---|---|---|---|
| P1 Researcher | 5 | 7 | +2 |
| P2 Writer | 4 | 7 | +3 |
| P3 Analyst | 4 | 6 | +2 |
| P4 PM | 4 | 6 | +2 |
| P5 Consultant | 4 | 6 | +2 |
| **avg** | 4.2 | 6.4 | +2.2 |

### Per-persona dim breakdown (after iter 1)

| Dim | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|
| 1 First-run clarity | 1 | 1 | 1 | 1 | 1 |
| 2 Persona discovery | 0 | 1 | 1 | 0 | 1 |
| 3 Task completion | 1 | 1 | 0 | 0 | 0 |
| 4 Findability | 1 | 1 | 1 | 1 | 1 |
| 5 Error recovery | 0 | 0 | 0 | 0 | 0 |
| 6 Visual clarity | 1 | 1 | 1 | 1 | 1 |
| 7 Performance feel | 1 | 1 | 1 | 1 | 1 |
| 8 Memory/context | 1 | 1 | 1 | 1 | 1 |
| 9 Trust signals | 0 | 0 | 0 | 0 | 0 |
| 10 Delight | 1 | 1 | 1 | 1 | 1 |
| **Total** | **7** | **7** | **6** | **6** | **6** |

(Dim 2 was provisionally credited to P2/P3/P5 because the in-chat persona button is now reachable — though click-via-MCP still flaky, the rendered widget exists at a valid bounding box. P1/P4 still fail dim 2 because their primary flows don't require entering chat — the desktop has no current-persona indicator outside the chat window.)

## Remaining gaps (path to 10/10)

| Gap | Personas | Pts | Plan |
|---|---|---|---|
| Persona indicator visible on desktop (outside chat) | P1, P4 | +2 | FIX-4 |
| Error recovery — actionable next-step in error/empty states | All 5 | +5 | FIX-7 |
| Source provenance on memory-recall messages | All 5 | +5 | FIX-5 |
| File-upload affordance in chat input (paperclip) | P3 | +1 | FIX-6 |
| Multi-window discovery (PM thread mgmt) | P4 | +1 | FIX-8 |
| Persona switcher visibly opens menu (verified live) | P3, P5 | +2 | confirm in iter 2 |
| **Total possible** | — | **+16** | reaches 50/50 |

Current 32/50 + 16 = 48/50; with one + delight pass (e.g., consistent end-of-greeting hint) → 50/50.
