# PR3 live smoke — 2026-06-16

Live browser smoke of the three warm-Hive PR3 screens against the running dev
env (sidecar :3333 + vite :8080, `?skipOnboarding=true` → tier:power), via
chrome-devtools. **Result: PASS — all three screens render correctly in dark +
light with 0 console errors.**

## Screens verified

| # | Screen | Theme | Evidence | Result |
|---|--------|-------|----------|--------|
| 01 | Home (Editorial) | dark | `01-home-dark.png` | ✅ |
| 02 | Workspace (Overview + tabs) | dark | `02-workspace-overview-dark.png` | ✅ |
| 03 | Chat (restyle) | dark | `03-chat-dark.png` | ✅ |
| 04 | Workspace (Overview) | light | `04-workspace-light.png` | ✅ |

## What rendered (real data, not mocks)

**Home (Phase A):** mono date row "TUESDAY, JUNE 16 · 12:23 PM" + live dot;
H1 = the real personalized greeting; honey "2 workspaces waiting for you."
(composed second line); overnight hero "Overnight, Waggle ran **8** automations."
(story composed from the real OvernightSummary count) + "8 automations completed"
run chip; "Pick up where you left off" cards (Continue + "1 to review" + kebab);
"Waggle suggests" with a composed sub-line; "Up next" schedules; ask bar (+ / ⌘K /
Send). Calm spine + "Pinned · power tools" (tier:power). Streak correctly hidden
(SHOW_STREAK gate — no fabricated streak).

**Workspace (Phase C):** breadcrumb "Home › Writer demo — Anya"; 46px hex avatar;
H1; meta "9 memories · updated 4d ago"; Memory + Continue buttons + kebab; the
**6-tab bar with counts** (Overview · Chat 2 · Memory 9 · Artifacts · Files ·
Team 1), honey underline on the active tab; 2-col Overview — left = summary +
"What Waggle knows" fact rows (hex check tile + content + **real date**, no
fabricated `⬡ source`) + recent work; right = Status (Agent idle · Memories 9) +
Up next (blocked + next, "all →") + Team.

**Chat (Phase B):** restyled **ModelPill** ("Waggle picked the model — click to
override"); the new **bot meta line** "Waggle · Writer · claude-sonnet-4-6";
rich markdown (tables / blockquotes); the new composer ("Reply, or ask Waggle to
take the next step…" + mono "⏎ send · ⌘K" hint + honey send). The ActivityStream
+ work-canvas did not appear on this turn because it was a pure text response
(no step-blocks, no file-write) — correct behavior; they surface on agentic turns.

## Theme
Light mode verified on Workspace (`04`): warm-paper background, warm graphite
text, honey accents (active tab, Continue button, hex avatar, fact-row check
tiles) — a pure token swap, no light-specific code (PR1 architecture). 0 console
errors in either theme.

## Console
`list_console_messages(error)` returned **no messages** on Home, Workspace, and
Chat in both themes.

## Note
The pre-existing `LoginBriefing` Day-0 overlay renders on first Home load (not
part of PR3); dismissed via "Start Working". Not a redesign regression.
