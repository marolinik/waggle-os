# Phase 10: Full UI Rewrite — shadcn Adoption

**Date**: 2026-03-20
**Author**: Claude (Product Manager + Architect) + Marko Markovic
**Status**: DRAFT — pending approval
**Baseline**: 3896 tests, 277 files, ALL PASSING
**Branch**: `phase8-wave-8f-ui-ux`

---

## Problem Statement

The shadcn/ui migration (Wave 9A) installed 21 shadcn components but **never actually adopted them**. The entire UI still uses inline `style={{...}}` blocks with custom CSS variables (`var(--bg)`, `var(--surface)`, etc.). Result:

- **371 inline style blocks** across 32 files (135 in views, 236 in UI package)
- **0 shadcn imports** in `packages/ui/` components
- **Only 3 views** import anything from `@/components/ui/`
- The app looks the same as it did before the "shadcn migration"
- No Tailwind utility classes in most views (CapabilitiesView: 4, EventsView: 0, MemoryView: 0)
- Marketplace view is buried inside CapabilitiesView (1536 lines!)

### What Users See
- Functional but **visually flat** — no cards, no borders, no hierarchy
- No hover states, no transitions, no micro-interactions
- Inline-styled components don't respond to theme switching properly
- Marketplace has 15K packages but no visual discovery experience

---

## Architecture Decision

**Replace all inline styles with shadcn primitives + Tailwind utilities.**

Rules:
1. Every container → `<Card>` / `<CardContent>` / `<CardHeader>`
2. Every button → `<Button>` with variant (`default` / `outline` / `ghost` / `destructive`)
3. Every input → `<Input>` or `<Textarea>`
4. Every select → `<Select>` + `<SelectContent>` + `<SelectItem>`
5. Every modal → `<Dialog>` or `<Sheet>`
6. Every list → proper spacing with `space-y-*` or `gap-*`
7. Every tab → `<Tabs>` + `<TabsList>` + `<TabsTrigger>` + `<TabsContent>`
8. All layout → Tailwind flex/grid utilities, NOT inline `display: flex`
9. All colors → CSS variables via `text-foreground`, `bg-card`, `border-border` etc.
10. All spacing → Tailwind (`p-4`, `gap-3`, `mb-2`), NOT `padding: '12px'`

**Direction D tokens stay** — amber primary (`--primary`), dark surfaces, Inter font. The shadcn components will use these via the CSS variable mapping already in `globals.css`.

---

## Scope Audit

### Layer 1: Desktop App Views (7 files, 2591 lines)

| File | Lines | Inline Styles | shadcn Imports | Priority |
|------|-------|---------------|----------------|----------|
| `CapabilitiesView.tsx` | 1536 | 67 | 0 | **P0** (biggest, most visible) |
| `CockpitView.tsx` | 352 | 0 | 2 | P1 (partially done) |
| `MissionControlView.tsx` | 260 | 30 | 1 | P1 |
| `EventsView.tsx` | 209 | 11 | 0 | P1 |
| `ChatView.tsx` | 139 | 2 | 0 | P2 (thin wrapper) |
| `SettingsView.tsx` | 52 | 2 | 0 | P2 (thin wrapper) |
| `MemoryView.tsx` | 43 | 1 | 0 | P2 (thin wrapper) |

### Layer 2: Desktop App Components (14 files, 2672 lines)

| File | Lines | Inline Styles | Priority |
|------|-------|---------------|----------|
| `AppSidebar.tsx` | 292 | 22 | **P0** (always visible) |
| `ContextPanel.tsx` | 536 | ~15 | P1 |
| `CostDashboardCard.tsx` | 205 | ~40 | P1 |
| `GlobalSearch.tsx` | 163 | ~8 | P2 |
| `ConnectorsCard.tsx` | 117 | ~10 | P1 |
| `CronSchedulesCard.tsx` | 96 | ~8 | P1 |
| Other cockpit cards | ~500 | ~30 | P1 |

### Layer 3: UI Package Components (58 files, 10467 lines)

| Directory | Files | Lines | Inline Styles | Priority |
|-----------|-------|-------|---------------|----------|
| `settings/` | 12 | 3097 | ~60 | **P0** (ModelsSection, VaultSection) |
| `chat/` | 11 | 2352 | ~40 | **P0** (core UX) |
| `workspace/` | 7 | 1097 | ~20 | P1 |
| `onboarding/` | 6 | 997 | ~15 | P1 |
| `events/` | 4 | 783 | ~15 | P1 |
| `memory/` | 5 | 754 | ~10 | P1 |
| `common/` | 5 | 519 | ~16 | **P0** (StatusBar, Sidebar, Modal) |
| `files/` | 4 | 421 | ~5 | P2 |
| `sessions/` | 2 | 313 | ~5 | P2 |

---

## Wave Plan

### Wave 10A: Foundation + Sidebar (2 slices)

**10A-1: CSS Variable Unification**
- Remove duplicate variable system — make `var(--bg)` an alias for `hsl(var(--background))` etc.
- Single source of truth: shadcn CSS variables in `globals.css`
- waggle-theme.css becomes a thin alias layer, not its own system
- Verify all existing inline `var(--bg)` references still resolve
- Test: dark mode toggle works, all views render correctly

**10A-2: AppSidebar → shadcn**
- Replace all 22 inline style blocks with Tailwind utilities
- Use shadcn `Button variant="ghost"` for nav items
- Use `cn()` for conditional classes (active state)
- Proper `<ScrollArea>` for workspace list
- Theme toggle uses shadcn `<Switch>`
- Direction D: amber active indicator, zinc inactive

### Wave 10B: Core Views — Chat + Settings (3 slices)

**10B-1: ChatView + Chat Components**
- `ChatView.tsx` → Tailwind layout
- `ChatMessage.tsx` → `<Card>` for messages, proper bubbles
- `ChatInput.tsx` → shadcn `<Textarea>` + `<Button>`
- `ToolResultRenderer.tsx` → `<Card>` + `<Badge>` for tool results
- `CommandPalette.tsx` → shadcn `<Command>`
- `FeedbackButtons.tsx` → shadcn `<Button variant="ghost">`
- `SubAgentProgress.tsx` → `<Card>` + progress indicators

**10B-2: SettingsView + Settings Components**
- `SettingsView.tsx` → shadcn `<Tabs>`
- `ModelsSection.tsx` → shadcn `<Card>` for model cards, `<Select>` for dropdown, `<Input>` for API keys, `<Button>` for Test/Show
- `VaultSection.tsx` → shadcn `<Card>` + `<Input>` + `<Button>`
- `AdvancedSection.tsx` → shadcn layout
- `BackupSection.tsx` → shadcn `<Button>` + `<Card>`

**10B-3: StatusBar + Common Components**
- `StatusBar.tsx` → Tailwind flex layout, `<Badge>` for indicators
- `Modal.tsx` → shadcn `<Dialog>`
- `Sidebar.tsx` → shadcn `<Sheet>` for mobile
- `Tabs.tsx` → shadcn `<Tabs>`

### Wave 10C: Feature Views (4 slices)

**10C-1: CapabilitiesView (the monster — 1536 lines)**
- Split into sub-components: `PackCatalog`, `MarketplaceBrowser`, `SkillDetail`, `InstallCenter`
- Each sub-component uses shadcn `<Card>`, `<Badge>`, `<Input>`, `<Tabs>`
- Search bar → shadcn `<Input>` with search icon
- Filter chips → shadcn `<Badge variant="outline">`
- Install buttons → shadcn `<Button>`
- Category tabs → shadcn `<Tabs>`
- **Marketplace gets its own visual identity** — grid of cards with icons, descriptions, install counts

**10C-2: CockpitView + Cockpit Cards**
- Already partially done (uses `<Card>` from shadcn)
- Fix remaining inline styles in child cards
- `CostDashboardCard` → proper shadcn `<Card>` + `<Badge>` for budget alerts
- `ConnectorsCard` → shadcn `<Card>` + status badges
- `AgentIntelligenceCard` → shadcn layout
- Consistent card sizing and spacing

**10C-3: EventsView + SessionTimeline**
- `EventsView.tsx` → shadcn `<Tabs>` for Live/Replay toggle
- `EventStream` → `<Card>` for step cards
- `SessionTimeline` → proper shadcn-styled timeline (already Direction D)
- `ActivityFeed` → `<Card>` entries

**10C-4: MissionControlView + MemoryView**
- `MissionControlView` → shadcn `<Card>` for fleet cards, `<Badge>` for status
- `MemoryView` → `<Card>` for frame timeline, `<Input>` for search
- `KGViewer` → keep custom canvas, wrap in `<Card>`

### Wave 10D: Workspace + Onboarding (2 slices)

**10D-1: Workspace Components**
- `CreateWorkspaceDialog` → shadcn `<Dialog>` + `<Input>` + `<Select>`
- `WorkspaceCard` → shadcn `<Card>` with hover effect
- `TaskBoard` → shadcn `<Card>` + `<Badge>` for task status
- `TeamPresence` → `<Badge>` indicators
- `TeamMessages` → `<Card>` message bubbles

**10D-2: Onboarding + Context Panel**
- `OnboardingWizard` → shadcn `<Card>` steps, `<Button>` navigation
- `SplashScreen` → clean shadcn layout
- `ContextPanel` → shadcn `<Sheet>` (collapsible side panel)
- `GlobalSearch` → already uses `<Command>`, verify styling

### Wave 10E: Polish + Rebuild (2 slices)

**10E-1: Visual QA + Micro-interactions**
- Hover states on all interactive elements
- Focus rings (keyboard accessibility)
- Transition animations (`transition-colors`, `transition-all`)
- Loading skeletons using shadcn `<Skeleton>`
- Empty states with proper illustrations
- Consistent border-radius (`rounded-lg` everywhere)

**10E-2: Production Rebuild**
- `npm run build` in `app/` → new dist/
- `node scripts/build-sidecar.mjs` → new service.js
- `npx tauri build` → new Windows installer
- Update Playwright baselines (14 screenshots)
- Full test suite verification
- Commit + push

---

## Estimated Effort

| Wave | Slices | Files Changed | Estimated Time |
|------|--------|--------------|----------------|
| 10A | 2 | ~5 | 1 session |
| 10B | 3 | ~15 | 1-2 sessions |
| 10C | 4 | ~20 | 2-3 sessions |
| 10D | 2 | ~10 | 1 session |
| 10E | 2 | ~5 | 1 session |
| **Total** | **13** | **~55** | **6-8 sessions** |

### Parallelization Strategy
- 10A must be first (CSS foundation)
- 10B and 10C can run partially parallel (different files)
- 10D depends on 10B-2 (settings patterns)
- 10E is last (rebuild)

Within each wave, slices can be dispatched as parallel agents since they touch different files.

---

## Success Criteria

### Visual
- [ ] No inline `style={{...}}` in any view or component (zero tolerance)
- [ ] All interactive elements use shadcn primitives
- [ ] All layout uses Tailwind utilities
- [ ] Dark/light mode works via CSS variable toggle (no JS-based theming)
- [ ] Direction D identity preserved (amber, dark surfaces, Inter font)

### Functional
- [ ] All 7 views render correctly
- [ ] Marketplace is visually discoverable (cards, search, filters)
- [ ] All 3896+ tests still pass
- [ ] Playwright baselines updated
- [ ] Tauri installer rebuilt

### Emotional
- [ ] Looks like a modern product (Linear / Raycast quality)
- [ ] User immediately understands the visual hierarchy
- [ ] Feels cohesive — every screen looks like it belongs together

---

## Anti-Patterns to Avoid

1. **Don't** change any business logic while restyling
2. **Don't** add features — this is purely visual
3. **Don't** rename props or change component APIs
4. **Don't** split components unless they're >500 lines (only CapabilitiesView qualifies)
5. **Don't** remove functionality in the name of "simplification"
6. **Don't** change the color palette — Direction D stays
7. **Don't** touch test files unless imports change
