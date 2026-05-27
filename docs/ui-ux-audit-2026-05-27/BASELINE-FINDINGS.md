# Baseline Audit Findings — 2026-05-27

Server: `http://127.0.0.1:3333` (prod-built UI via sidecar, no dev hot-reload)
Viewport: 1440×900 (resize attempt blocked — Chrome was maximized; using default)
Console: **0 errors, 0 warnings on initial load** (good).

---

## Common findings (apply to all personas)

### CF-1 · Welcome modal blocks first valid action [HIGH]
On any user with prior state, the "Good afternoon" welcome card centers over the desktop with workspace list + recent sessions + a single primary CTA "Start Working". This is **good signal density**, but:
- "Don't show again" is a quiet ghost button, easy to miss
- The card covers ~75% of vertical space; user can't see the dock app icons (only their bottom edge)
- "Start Working" is the ONLY way out — clicking outside the card does not dismiss
- Heading "Good afternoon" omits user name (no identity surfacing)

**Persona impact:** Maya/Anya/Daniel/Sara/Markus all hit this first. Costs **dim 1 (first-run clarity)** if first-time; survivable for returning users but adds an unwarranted step.

**Hypothesis:** the modal is `BootScreen` or similar overlay in `apps/web/src/components/os/`. Need to read it.

### CF-2 · Test/audit workspaces leaked into production list [HIGH — data hygiene]
Workspace list shows 4 entries:
```
E2E-Audit-1778456027364
E2E-Audit-1778456162695
E2E-Audit-1778456628556
E2E-Audit-1778456835736
```
These are clearly E2E test artifacts from prior automated runs that polluted real user state. They're empty (0/0 memories+relations) but visually take up the workspace selector.

**Persona impact:** confuses Sara (PM, expects clean workspace list); costs **dim 6 (visual clarity)** for all personas.

### CF-3 · Identity layer not surfaced in welcome [MED]
- "Good afternoon" — no name
- "5 memories · 137 entities" — quantitative, no qualitative ("you've been working on X")
- No persona currently active indicator anywhere visible

**Persona impact:** dim 2 (persona discovery) and dim 8 (memory/context). Maya/Markus especially miss this.

### CF-4 · Dock icons hidden under welcome modal [MED]
Visually, the bottom dock is mostly occluded. User can't anticipate what's available until they dismiss the modal.

**Persona impact:** dim 1 first-run; minor.

---

## P1 · Maya (Researcher) baseline

**Workflow path:** Click "Chat" in dock → lands in *existing* session (not a fresh chat).

### P1-1 · Chat opens into last session, not a fresh one [MED]
For a researcher whose first instinct is "find what I learned about X", opening a stale session is actually GOOD — they see the recent conversation list in the left rail with timestamps and topic snippets. But for an entry-point click ("Chat"), it would be more useful to default to a fresh chat *with* the prior conversations in the rail (which already exists), so the user can decide.
- **Counterargument:** the current behavior is research-friendly. Score this as a **wash for P1**, but it'll bite P2/P5 who want a fresh draft.

### P1-2 · Persona is shown in chat header BUT not until you're in chat [GOOD/MISS]
- Header reads `Default Workspace · Researcher` — model + persona surfaced. ✓
- BUT: on the desktop home screen there is NO indicator of which persona is active. The dock has a "Personas" button but no "currently Researcher" pill anywhere.
- **Score impact:** dim 2 partial — passes for chat surface, fails for desktop.

### P1-3 · Memory recall works but provenance is implicit [HIGH/EVIDENCE]
The most recent turn in this session asked "what do I know about my workspace" → reply included detailed memory recall (sovereign AI work, EU AI Act risk score 9, presentation-design skill, staged rollout decision). Quality of recall: **excellent**. But:
- No citation markers ("source: session 2026-04-30") next to claims
- No "expand to see source frames" affordance
- The Context Rail isn't visibly attached to memory hits

**Score impact:** dim 8 (memory/context) passes — recall is real. dim 9 (trust signals) **fails** — sources are not surfaced.

### P1-4 · Critical UX failure surfaced in real conversation [BLOCKER for product, OUT-OF-SCOPE for this audit]
Reading the loaded session, the user (Marko himself) hit a wall:
- Asked agent to read `D:\Projects\PM-Waggle-OS`
- Agent said: "I can't install MCP at runtime, restart needed."
- User asked 5+ times to install the filesystem MCP, agent kept refusing
- User finally said "OK its obvoous I have to fix you on multiple ways..."

This is a capability/architecture issue (runtime MCP installation), not UI/UX. Logging it here as **OUT-OF-SCOPE** for this audit but should be tracked separately — it's a true 10/10 blocker for the Researcher persona once they need any external context.

### P1-5 · Chat header has 5 controls — discoverable, scannable [PASS]
Visible: persona pill, autonomy pill (Normal), model pill (claude-sonnet-4-6), Agent Profile button, "More chat header info" button. All labelled. ✓

### P1-6 · Message rendering quality [PASS]
- Markdown tables render correctly
- Headings render
- Inline code visible
- BUT: no visible copy-to-clipboard on code blocks; no "regenerate" affordance (or it's the icon-only button cluster — non-discoverable)

### P1 — Baseline Score
| Dim | Pass | Notes |
|---|---|---|
| 1 First-run clarity | 0 | Welcome modal blocks; dock occluded; no first-time hint outside modal |
| 2 Persona discovery | 0 | Desktop has no persona indicator; only visible in chat header |
| 3 Task completion | 1 | Memory recall works, can ask & get useful answer |
| 4 Findability | 1 | Search button top-right, dock has Files/Personas/Vault, OK |
| 5 Error recovery | 0 | When agent couldn't read filesystem, no "set up filesystem access" CTA — only prose |
| 6 Visual clarity | 0 | Test workspaces clutter list; welcome modal heavy |
| 7 Performance feel | 1 | Page loads quickly, no jank observed |
| 8 Memory/context | 1 | Real recall observed |
| 9 Trust signals | 0 | No source citations next to memory claims; no provenance UI |
| 10 Delight | 0 | Nothing observed yet that would make Maya say "oh nice" |

**P1 baseline score: 4 / 10**

---

## P2 · Anya (Writer) baseline — extrapolated
Same OS shell, same dock, same welcome modal, same workspace pollution. Chat-specific concerns:
- **Persona switcher** (uid=3_14) failed to open via click — either viewport-clipped (chat window narrow, dropdown may need wider space), z-index issue, or the button is render-locked. **This is a HARD BLOCKER for Anya** — she can't switch to Writer persona.
- Multi-paragraph markdown rendering observed in P1 — passes for legibility.
- No "draft length" / "tone" controls visible in chat header.
- No visible "save draft to Files" button on assistant turn.

| Dim | Pass | Note |
|---|---|---|
| 1 First-run | 0 | Same modal block |
| 2 Persona | 0 | Switcher unclickable |
| 3 Task complete | 0 | Can't reach writer persona |
| 4 Findability | 1 | OK |
| 5 Error recovery | 0 | Same as P1 |
| 6 Visual clarity | 0 | Same workspace pollution |
| 7 Performance | 1 | OK |
| 8 Memory | 1 | Recall works |
| 9 Trust signals | 0 | No sources |
| 10 Delight | 0 | None observed |

**P2 baseline score: 3 / 10**

---

## P3 · Daniel (Analyst) baseline — extrapolated
- **No visible file-upload affordance** in chat input area (only "Message Waggle..." textbox).
- Chat input is single line with no `+`/`📎`/drop-zone visible.
- Files dock app exists, but the drop-from-OS-to-chat flow isn't surfaced.
- Markdown tables render well — when output is structured, it shows.

| Dim | Pass | Note |
|---|---|---|
| 1 First-run | 0 | Same |
| 2 Persona | 0 | Switcher blocked |
| 3 Task complete | 0 | No file ingest path obvious |
| 4 Findability | 1 | OK |
| 5 Error recovery | 0 | Same |
| 6 Visual clarity | 0 | Same |
| 7 Performance | 1 | OK |
| 8 Memory | 1 | OK |
| 9 Trust signals | 0 | Same |
| 10 Delight | 0 | None |

**P3 baseline score: 3 / 10**

---

## P4 · Sara (PM) baseline — extrapolated
- Dock has "Room" button → multi-agent surface exists; not tested live.
- Only one chat window can be open visibly; window list/management not surfaced on desktop.
- Workspace pollution especially bites here (PM sees 4 leaked workspaces).
- Search button top-right exists for cross-chat findability.

| Dim | Pass | Note |
|---|---|---|
| 1 First-run | 0 | Same |
| 2 Persona | 0 | Switcher blocked |
| 3 Task complete | 0 | Window mgmt not exercised; can't verify multi-thread workflow without testing |
| 4 Findability | 1 | Search exists |
| 5 Error recovery | 0 | Same |
| 6 Visual clarity | 0 | Same |
| 7 Performance | 1 | OK |
| 8 Memory | 1 | OK |
| 9 Trust signals | 0 | Same |
| 10 Delight | 0 | None |

**P4 baseline score: 3 / 10**

---

## P5 · Markus (Consultant) baseline — extrapolated
- Same persona-switcher blocker as P2/P3/P4 — can't switch to consultant.
- Structured rendering quality is good (tables, lists).
- Save-to-file works (visible in P1 conversation: docx was created at path `C:\Users\...\reports\Waggle-OS-Competitive-Landscape-May-2026.docx`).

| Dim | Pass | Note |
|---|---|---|
| 1 First-run | 0 | Same |
| 2 Persona | 0 | Switcher blocked |
| 3 Task complete | 0 | Can't switch to consultant |
| 4 Findability | 1 | OK |
| 5 Error recovery | 0 | Same |
| 6 Visual clarity | 0 | Same |
| 7 Performance | 1 | OK |
| 8 Memory | 1 | OK |
| 9 Trust signals | 0 | Same |
| 10 Delight | 0 | None |

**P5 baseline score: 3 / 10**

---

## BASELINE TOTALS
| Persona | Score |
|---|---|
| P1 Researcher | 4 / 10 |
| P2 Writer | 3 / 10 |
| P3 Analyst | 3 / 10 |
| P4 PM | 3 / 10 |
| P5 Consultant | 3 / 10 |

**Average: 3.2 / 10** · Gap to target: 6.8 pts per persona average.

The 6 universal issues to fix (each opens multiple dims for multiple personas):
1. Welcome modal blocks (CF-1) — dim 1 for all
2. Test workspace pollution (CF-2) — dim 6 for all
3. No persona indicator on desktop (CF-3) — dim 2 for all
4. **Persona switcher unclickable** (P2/3/4/5 blocker) — dim 2,3 for 4 personas
5. No source citations / provenance UI (P1-3) — dim 9 for all
6. No "delight" — dim 10 for all (could be: identity in greeting, "I REMEMBER" already exists is delight!)

Special:
- P3 Analyst needs file-upload affordance in chat input — dim 3
- All personas need a no-clutter empty desktop hint or "Resume X / Start Fresh" CTA



