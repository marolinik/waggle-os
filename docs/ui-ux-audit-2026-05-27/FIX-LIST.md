# Fix List — 2026-05-27 UX Audit

Surgical fixes targeting the 5-persona baseline gaps. Per CLAUDE.md §3.3: minimal
diffs, no scope creep, no unrelated refactors.

## Shipping this iteration

### FIX-1 · Filter test/audit workspaces in LoginBriefing [HIGH]
**File:** `apps/web/src/components/os/overlays/LoginBriefing.tsx`
**Reason:** E2E-Audit-* workspaces leaked into the user's real workspace list. Visible to all 5 personas.
**Change:** filter `workspaces` by name before `.slice(0, 5)`. Patterns: `/^E2E-Audit-\d+$/`, `/^test-/i`, `/^smoke-/i`, `/^audit-/i`.
**Dim impact:** dim 6 (Visual clarity) — passes for all 5 personas (+5 pts).

### FIX-2 · Personalize greeting with identity name [HIGH]
**File:** `apps/web/src/components/os/overlays/LoginBriefing.tsx`
**Reason:** "Good afternoon" → "Good afternoon, Marko" surfaces identity layer + provides one delight moment.
**Change:** call `adapter.getIdentity()` in the load effect, append `, {name}` to greeting if name is non-null.
**Dim impact:** dim 10 (Delight) — passes for all 5 personas (+5 pts).

### FIX-3 · Auto-expand chat session sidebar when sessions exist [HIGH]
**File:** `apps/web/src/components/os/apps/ChatApp.tsx`
**Reason:** Sidebar starts collapsed (`showSessions=false`), New Session button renders at w=0, sessions list invisible. P2/P3/P5 can't start a fresh chat without finding the chevron.
**Change:** initialize `showSessions = sessions && sessions.length > 0`, OR add useEffect that opens it when sessions arrive for the first time. Also add `aria-label`/`title` to the toggle button.
**Dim impact:** dim 3 (Task completion) — passes for P2/P3/P5 (+3 pts); dim 1 (First-run clarity) borderline for P1/P4 (+1 pt provisional).

## Deferred (next iteration)

### FIX-4 · Persona indicator on desktop top bar [MED]
**File:** likely `Desktop.tsx` or a sub-TopBar — top bar shows `Workspace · model` but no persona when chat closed. Add a persona pill with "as: Researcher".
**Dim impact:** dim 2 for P1/P4 (+2 pts).

### FIX-5 · Source citation badges on memory recall [MED]
**Files:** chat-blocks (TextBlock, BlockRenderer)
**Reason:** P1 needs provenance — "from memory (2026-04-30)" badge on assistant turns that used recall.
**Risk:** non-trivial — needs message metadata flow from agent to UI.
**Dim impact:** dim 9 (Trust signals) — passes for all 5 (+5 pts).

### FIX-6 · File attach affordance in chat input [LOW]
**File:** `ChatApp.tsx` — there IS drag-drop (line 660-662) + hidden file input (line 666-672), but no visible button. Add a small paperclip button next to the textbox.
**Dim impact:** dim 3 for P3 (+1 pt).

## Out of scope (data / architecture)

- Runtime MCP install in chat (P1-4 found in real conversation) — major feature.
- Cleaning the actual E2E-Audit-* workspaces from the data store — UI filter is the surgical fix.
- Test runners that pollute user state — out of scope for this audit.
