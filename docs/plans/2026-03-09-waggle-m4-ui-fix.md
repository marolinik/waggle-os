# M4 Desktop App — UI Fix Plan

**Date:** 2026-03-09
**Problem:** M4 backend and component logic are complete (1616 tests), but the actual app is an unassembled skeleton. No visual design, broken Tailwind, App.tsx only used 4 of 30 components.

---

## Design Direction

**Aesthetic:** Industrial-refined dark theme. VS Code density meets Linear polish.
**Font:** JetBrains Mono for code/labels, system-ui for body text
**Colors:**
- Background: #0a0a0f (near-black with blue tint)
- Surface: #12121a (cards, panels)
- Surface-2: #1a1a26 (elevated panels, sidebar)
- Border: #2a2a3a (subtle, low contrast)
- Text: #e4e4ef (off-white)
- Text-muted: #6b6b80
- Primary: #6366f1 (indigo-500, for active/selected states)
- Primary-hover: #818cf8
- Accent: #22d3ee (cyan for status indicators)
- Error: #ef4444
- Warning: #f59e0b
- Success: #22c55e

**Layout:** Fixed 3-column when context panel open, 2-column default
- Sidebar: 220px (collapsible to 48px icon rail)
- Main content: flex-1
- Context panel: 280px (sessions/memory detail, slides in/out)
- Status bar: 28px fixed bottom

---

## Architecture Decision: NO shadcn/ui

shadcn/ui requires a CLI setup, Radix primitives, and generates files that would conflict with our existing @waggle/ui components. We already have 30+ components. The right move is to:
1. Fix the Tailwind config so it actually works
2. Apply proper CSS to our existing components via a global stylesheet
3. Use CSS custom properties for the theme tokens (already built in theme-tokens.ts)

This avoids ripping out and replacing everything.

---

## Fix Scope (3 phases)

### Phase A: Foundation (Tailwind + Global Styles + Theme)
1. Fix `app/tailwind.config.ts` — scan @waggle/ui source
2. Create `app/src/styles/waggle-theme.css` — CSS custom properties from our THEME_TOKENS
3. Create `app/src/styles/components.css` — targeted styles for all @waggle/ui components
   - Sidebar: dark surface, icon rail when collapsed, group headers, workspace cards
   - Chat: message bubbles (user right/blue, assistant left/dark), input bar pinned bottom
   - Tabs: horizontal tab bar with close buttons, active indicator
   - StatusBar: fixed bottom, compact, monospace stats
   - Modal: backdrop blur, centered, border
   - Settings: tabbed panel with form groups
   - Memory: frame cards, timeline, search bar
   - Events: step cards with status colors
   - Sessions: time-grouped list, active highlight

### Phase B: App Shell (Rewrite App.tsx)
1. Proper routing state machine: 'chat' | 'settings' | 'memory' | 'events'
2. Sidebar with:
   - App logo/name at top
   - Workspace tree (groups expandable, active highlighted)
   - Nav section at bottom: Chat, Memory, Events, Settings icons + labels
   - "+ New Workspace" button
3. Main area:
   - Chat view: tab bar at top, messages in middle, input pinned at bottom
   - Settings view: SettingsPanel filling the area
   - Memory view: MemoryBrowser with search + timeline + detail
   - Events view: EventStream with step cards
4. Context panel (right side, toggleable):
   - Sessions list when in chat view
   - Frame detail when in memory view
5. Onboarding: full-screen overlay on first run
6. Modals: CreateWorkspaceDialog, FilePreview
7. Keyboard shortcuts wired

### Phase C: Visual Verification
1. Start Vite dev server + backend service
2. Playwright screenshots of every view
3. Fix any visual issues found
4. Test workspace creation, settings save, view switching
5. Final screenshot showing polished result

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/tailwind.config.ts` | Fix content paths |
| `app/src/styles/waggle-theme.css` | NEW — CSS custom properties |
| `app/src/styles/components.css` | NEW — component styles |
| `app/src/styles/globals.css` | Update imports |
| `app/src/App.tsx` | Full rewrite — proper shell |
| `app/src/views/ChatView.tsx` | NEW — chat view composition |
| `app/src/views/SettingsView.tsx` | NEW — settings view |
| `app/src/views/MemoryView.tsx` | NEW — memory browser view |
| `app/src/views/EventsView.tsx` | NEW — events view |
| `app/src/components/AppSidebar.tsx` | NEW — sidebar composition |
| `app/src/components/ContextPanel.tsx` | NEW — right panel |

---

## NOT in scope (follow-up work)
- Tauri-specific features (tray, hotkey, window management) — runtime only
- Real LLM responses — needs LiteLLM running
- macOS build
- Performance optimization
