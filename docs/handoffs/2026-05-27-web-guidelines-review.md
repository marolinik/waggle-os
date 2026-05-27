# Web Interface Guidelines Review — apps/web/src/components/os/apps/
**Date:** 2026-05-27 · **Scope:** All 26 OS app surfaces · **Source rules:** [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)

> **~480 findings across 26 files.** Most are repeated patterns — a small number of utility/wrapper fixes close hundreds of findings. Read §0 (Systemic patterns) first to plan the work, then §1 (per-file findings) when implementing.

---

## 0. Systemic patterns — fix once, close many

These 12 patterns account for ~80% of all findings. Each can be addressed with a single utility/component fix that propagates across the codebase.

| # | Pattern | Approx count | Fix once |
|---|---|---|---|
| **S-1** | Decorative lucide icons missing `aria-hidden="true"` | ~100 | Wrap lucide icons in a `<Icon hidden />` helper, or add lint rule. Simplest: codemod `<X />` (icon-only sibling to text) → `<X aria-hidden="true" />` |
| **S-2** | Icon-only buttons missing `aria-label` | ~40 | Audit `<Button>` usage where children are a single lucide icon; add `aria-label` prop. Lint rule: jsx-a11y/role-has-required-aria-props |
| **S-3** | `Loader2` / `animate-spin` / `animate-pulse` not honoring `prefers-reduced-motion` | ~25 | Add `motion-reduce:animate-none` to all spinner/pulse classes; OR create a `<Spinner />` primitive that applies it |
| **S-4** | Hardcoded `toLocaleDateString()` / `toLocaleTimeString()` / `toLocaleString()` / `toFixed()` instead of `Intl.DateTimeFormat` + `Intl.NumberFormat` | ~30 | Create `lib/format.ts` with `formatDate(d, opts)` + `formatNumber(n, opts)` + `formatCurrency(n, ccy)` wrappers; codemod replace |
| **S-5** | Placeholders + loading states using three-dot ASCII (`...`) instead of horizontal-ellipsis character (`…`) | ~30 | Codemod find-and-replace across the apps dir. Add ESLint rule `no-trailing-three-dots` |
| **S-6** | Form `<Input>` / `<select>` lacking `htmlFor`/`id` label association + `autocomplete` + `spellCheck={false}` for codes/usernames/secrets | ~40 | Create `<FormField label name autocomplete>` wrapper; migrate file-by-file |
| **S-7** | Tab buttons missing `role="tab"` / `aria-selected` / arrow-key keyboard navigation | ~12 (× many buttons each) | Create `<Tabs />` primitive with the WAI-ARIA tab pattern; replace ad-hoc `<button>` tab implementations |
| **S-8** | Native `<select>` missing explicit `background-color` + `color` for Windows dark mode | ~8 | Add to global CSS: `select { background-color: var(--bg); color: var(--fg); color-scheme: dark light; }` |
| **S-9** | Modals (3 modals found) missing `role="dialog"` + `aria-modal` + focus trap + `overscroll-behavior: contain` + Escape handler | ~3 modals × 5 issues = 15 | Create `<Modal />` primitive that bundles all 5; replace ad-hoc modal divs |
| **S-10** | Destructive actions using `confirm()` / `alert()` or no confirmation at all (delete frame, revoke grant, remove integration, etc.) | ~10 | Replace `confirm()` with `<ConfirmDialog />` primitive; add to destructive-action checklist in PR review |
| **S-11** | URL state not reflected for tabs / filters / search query | ~8 | Adopt `nuqs` (or similar) for URL-synced state; migrate per-app |
| **S-12** | Async updates (loading text, save status, toast result) lacking `aria-live="polite"` region | ~15 | Create `<StatusRegion />` primitive; migrate per-app. Or: ensure existing toast layer has `aria-live` on its container |

**Less systemic but worth a single PR each:**

| # | Pattern | Where |
|---|---|---|
| S-13 | `console.error` in production paths | `ChatWindowInstance` (×3), `AgentsApp` (×9), `ConnectorsApp` (×3) |
| S-14 | Brand names not wrapped in `translate="no"` (Waggle, Vault, KVARK) | Throughout |
| S-15 | `<tr>` rows used as buttons in FilesApp without `role="button"` / keyboard activation | `FilesApp.tsx:492, 531` |
| S-16 | Direct `fetch` without `AbortController` → `setState` after unmount risk | `DashboardApp`, `MissionControlApp`, `CockpitApp`, `TelemetryApp`, `BackupApp` |
| S-17 | Polling intervals (`setInterval`) not pausing on `document.visibilityState === 'hidden'` | `MissionControlApp` (3s), `CockpitApp` (30s), `ApprovalsApp` (5s) |
| S-18 | Nested `<button>` inside `<button>` (invalid HTML) | `EventsApp.tsx:84`, `CapabilitiesApp.tsx:218` |
| S-19 | `Date.now()` / `new Date()` called during render (hydration mismatch + non-deterministic re-render) | `RoomApp.tsx:62`, `ApprovalsApp.tsx:39`, `EventsApp.tsx:131` |
| S-20 | Raw-HTML injection React prop usage (verify escape correctness) | `MemoryApp.tsx:308` |

### Recommended fix order (highest leverage first)

1. **Day 1** — S-1 (icon `aria-hidden`) + S-2 (icon button `aria-label`) + S-5 (three-dot → ellipsis char) via codemod. Closes ~170 findings in one PR.
2. **Day 2** — S-3 (motion-reduce) via shared `<Spinner />` primitive + S-4 (`Intl.*` wrappers in `lib/format.ts`) via codemod. Closes ~55 findings.
3. **Day 3** — S-9 (`<Modal />` primitive) + S-10 (`<ConfirmDialog />`) + S-12 (`<StatusRegion />`). Closes ~30 findings plus removes `confirm()`/`alert()` from the product entirely.
4. **Day 4** — S-7 (`<Tabs />` primitive with WAI-ARIA pattern) — propagates to MissionControl, Agents, Memory, UserProfile, Approvals, Connectors, Marketplace, Capabilities, FilesAppTabs. Closes ~12 tab-pattern clusters.
5. **Day 5** — S-6 (`<FormField />`) for label association + autocomplete + spellCheck. Migrate one app at a time; priority: UserProfile, Vault, Connectors, Settings.
6. **Day 6** — S-13/S-16/S-17 (console.error cleanup + AbortController + visibilityState guards). Touches ~5 apps.
7. **Day 7** — S-11 (URL state via `nuqs`) per-app. Deep-link enablement.

**~7 working days of leverage work** closes the bulk of the ~480 findings. Remaining work is genuine per-file polish.

---

## 1. Per-file findings

Each section below is reviewed against the full Vercel Web Interface Guidelines ruleset. Format: `file:line — issue`. Ellipsis character below written as `…` per guideline S-5.

### apps/web/src/components/os/apps/SettingsApp.tsx

```
SettingsApp.tsx:246 — <select> lacks <label> or aria-label ("Dock Experience" is paragraph, not associated)
SettingsApp.tsx:265 — theme button "Dark" lacks aria-label/aria-pressed for toggle state
SettingsApp.tsx:276 — theme button "Light" lacks aria-label/aria-pressed for toggle state
SettingsApp.tsx:307 — telemetry toggle button lacks aria-label, role="switch", aria-checked
SettingsApp.tsx:321 — confirm()/alert() blocks UI; use accessible dialog with focus mgmt
SettingsApp.tsx:394 — Prompt Shape <select> label wraps HintTooltip but onClick from tooltip can fire htmlFor association
SettingsApp.tsx:415 — Daily Budget Input has no htmlFor link to label (label is plain <label> without for)
SettingsApp.tsx:415 — number input lacks inputMode="decimal" and autocomplete
SettingsApp.tsx:415 — placeholder "No limit" lacks example pattern + ellipsis
SettingsApp.tsx:587 — Enterprise <a> lacks visible focus state class
SettingsApp.tsx:656 — Remove button lacks aria-label (icon-less but ambiguous in repeated list)
SettingsApp.tsx:662 — newGate Input lacks label/aria-label
SettingsApp.tsx:691 — Team Server URL Input: label not associated via htmlFor; should be type="url" with autocomplete="url"
SettingsApp.tsx:696 — Auth Token Input: label not associated; password input lacks autocomplete="current-password" / spellCheck={false}
SettingsApp.tsx:728 — export button does direct DOM manipulation + URL.createObjectURL; loading state missing
SettingsApp.tsx:744 — Import Data button has no onClick handler (dead button)
SettingsApp.tsx:762 — alert() instead of inline error UI; not aria-live
SettingsApp.tsx:777 — file input lacks aria-label/visible label
SettingsApp.tsx:780 — confirm() blocks; use accessible dialog
SettingsApp.tsx:790 — alert() success/error not announced (no aria-live)
SettingsApp.tsx:813 — KVARK Server URL: label not associated; missing type="url"/autocomplete
SettingsApp.tsx:818 — API Token: label not associated; missing autocomplete + spellCheck={false}
SettingsApp.tsx:983 — `as any` cast violates type safety
SettingsApp.tsx:996 — <a> with target="_blank" opens server log JSON in tab — should download or be <button>
SettingsApp.tsx:1015 — Save status uses "Saved" not "Saved…"; lacks aria-live="polite"
SettingsApp.tsx:267 — hardcoded HSL colors bypass theme tokens (hive-950 / token violation)
SettingsApp.tsx:184 — setTimeout for saveMsg can leak if component unmounts
SettingsApp.tsx:185 — "Failed" lacks fix/next-step copy
SettingsApp.tsx:422 — "Save Model Settings" loading state lacks ellipsis
SettingsApp.tsx:518 — "Confirming your payment..." uses three-dot ASCII instead of ellipsis char
SettingsApp.tsx:432 — "Vault" brand name should use translate="no"
SettingsApp.tsx:202 — 9 tab buttons in tablist; arrow-key navigation handler missing (roving tabindex partial only)
```

### apps/web/src/components/os/apps/DashboardApp.tsx

```
DashboardApp.tsx:91 — direct fetch without abort signal; can setState after unmount
DashboardApp.tsx:132 — Brain Health HintTooltip wraps div tabIndex={0} — non-interactive element shouldn't be focusable without role
DashboardApp.tsx:163 — <h2> "Workspaces" is page section; no <h1> in component scope
DashboardApp.tsx:209 — inline style ws.hue lacks safelist for arbitrary HSL — XSS risk if hue unsanitized
DashboardApp.tsx:214 — <AvatarImage> needs alt text for persona avatar
DashboardApp.tsx:225 — HintTooltip wraps span with tabIndex={0} and role="img" — focusable image-only span is awkward
DashboardApp.tsx:262 — new Date(...).toLocaleDateString() without Intl.DateTimeFormat hardcoded locale
DashboardApp.tsx:194 — grid of workspace cards: no virtualization for large workspace counts (>50)
DashboardApp.tsx:199 — workspace card button missing focus-visible:ring class
DashboardApp.tsx:298 — "Create your first workspace" should be Title Case
DashboardApp.tsx:84 — useState/useEffect with no cleanup for fetch
DashboardApp.tsx:147 — {brainScore}% uses tabular-nums but parent should also balance text
DashboardApp.tsx:266 — ChevronRight decorative — needs aria-hidden="true"
```

### apps/web/src/components/os/apps/MissionControlApp.tsx

```
MissionControlApp.tsx:63 — setInterval polling every 3s without document.visibilityState check (wastes battery/network)
MissionControlApp.tsx:93 — icon-only refresh button missing aria-label
MissionControlApp.tsx:102 — Rocket icon decorative — needs aria-hidden="true"
MissionControlApp.tsx:121 — tabs lack role="tablist"/role="tab"/aria-selected
MissionControlApp.tsx:123 — tab buttons lack keyboard arrow-key navigation
MissionControlApp.tsx:162 — icon-only pause button missing aria-label
MissionControlApp.tsx:167 — icon-only play button missing aria-label
MissionControlApp.tsx:171 — icon-only stop button missing aria-label
MissionControlApp.tsx:171 — destructive stop action lacks confirmation/undo
MissionControlApp.tsx:156 — animate-pulse not honoring prefers-reduced-motion
MissionControlApp.tsx:218 — new Date(...).toLocaleTimeString() hardcoded — use Intl.DateTimeFormat
MissionControlApp.tsx:177 — duration math `Math.round(s.duration ?? 0) / 60` lacks Intl.NumberFormat
MissionControlApp.tsx:180 — tokenUsage .toLocaleString() — should use Intl.NumberFormat with explicit locale
MissionControlApp.tsx:24 — sessions list .map() — no virtualization for >50 fleet sessions
MissionControlApp.tsx:152 — fleet card lacks key focus-visible class
```

### apps/web/src/components/os/apps/CockpitApp.tsx

```
CockpitApp.tsx:63 — setInterval(30s) polling without visibility check
CockpitApp.tsx:77 — icon-only refresh button missing aria-label
CockpitApp.tsx:84 — AlertTriangle decorative — needs aria-hidden="true"
CockpitApp.tsx:106 — "Uptime: {Math.round(...)}h" lacks Intl.NumberFormat; needs nbsp before unit
CockpitApp.tsx:130 — $cost.toFixed(4) hardcoded — use Intl.NumberFormat currency
CockpitApp.tsx:153 — new Date(...).toLocaleDateString() hardcoded locale
CockpitApp.tsx:163 — decorative icons in cards lack aria-hidden="true" (repeats x7)
CockpitApp.tsx:200 — empty state "No routines" lacks call-to-action
CockpitApp.tsx:221 — empty state "No connectors" lacks CTA
CockpitApp.tsx:236 — Advanced toggle button lacks aria-expanded
CockpitApp.tsx:300 — audit JSON.stringify dumped to <p> — should be <pre> with formatting; truncate may clip critical data
CockpitApp.tsx:78 — RefreshCw animate-spin not honoring prefers-reduced-motion
CockpitApp.tsx:130 — cost numbers lack tabular-nums for column alignment
CockpitApp.tsx:71 — destructive-red default for unknown health status is misleading (treats unknown as error)
```

### apps/web/src/components/os/apps/TelemetryApp.tsx

```
TelemetryApp.tsx:33 — no AbortController; setState after unmount possible
TelemetryApp.tsx:51 — loading spinner not announced (no aria-live, no aria-busy)
TelemetryApp.tsx:51 — Loader2 animate-spin not honoring prefers-reduced-motion
TelemetryApp.tsx:69 — BarChart3 icon decorative — needs aria-hidden="true"
TelemetryApp.tsx:82 — large numbers .toLocaleString() — use Intl.NumberFormat with explicit locale
TelemetryApp.tsx:89 — $cost.toFixed(4) — use Intl.NumberFormat currency
TelemetryApp.tsx:107 — .map index as React key — use stable workspaceId
TelemetryApp.tsx:113 — progress bar lacks role="progressbar"/aria-valuenow/aria-valuemax
TelemetryApp.tsx:115 — cost numbers lack tabular-nums
TelemetryApp.tsx:130 — .map index as key — use t.name
TelemetryApp.tsx:131 — decorative Zap icon needs aria-hidden="true"
TelemetryApp.tsx:107 — byWorkspace .map() unbounded — no virtualization at >50
```

### apps/web/src/components/os/apps/BackupApp.tsx

```
BackupApp.tsx:19 — direct fetch w/o AbortController; setState after unmount
BackupApp.tsx:53 — decorative Archive icon needs aria-hidden="true"
BackupApp.tsx:58 — Loader2 animate-spin not honoring prefers-reduced-motion
BackupApp.tsx:59 — "Creating..." uses three-dot ASCII — should use ellipsis char
BackupApp.tsx:63 — lastResult feedback lacks aria-live="polite"; success/error indistinguishable to AT
BackupApp.tsx:82 — .map index as key — use b.timestamp
BackupApp.tsx:87 — new Date(b.timestamp).toLocaleString() hardcoded — use Intl.DateTimeFormat
BackupApp.tsx:93 — "Restore" button has no onClick handler (dead button)
BackupApp.tsx:93 — "Restore" is destructive — needs confirmation/undo
BackupApp.tsx:42 — formatSize hardcoded units — should use Intl.NumberFormat with notation: "compact"
BackupApp.tsx:64 — lastResult.includes('success') string-match brittle
BackupApp.tsx:84 — decorative CheckCircle2 icon needs aria-hidden="true"
BackupApp.tsx:14 — backups list .map() no virtualization for >50 backups
```

### apps/web/src/components/os/apps/EventsApp.tsx

```
EventsApp.tsx:53 — icon-only abort button (StopCircle) — has text "Cancel" so OK; redundant tooltip
EventsApp.tsx:69 — Loader2 animate-spin not honoring prefers-reduced-motion
EventsApp.tsx:79 — formatTimestamp uses toLocaleTimeString — should be Intl.DateTimeFormat
EventsApp.tsx:84 — nested <button> inside <button> (StepCard expand wraps Cancel button) — invalid HTML/a11y bug
EventsApp.tsx:98 — <pre> JSON.stringify without word break — overflows on long content
EventsApp.tsx:187 — animate-pulse not honoring prefers-reduced-motion
EventsApp.tsx:203 — inline style paddingLeft uses arbitrary computed value — fine but lacks safe area handling
EventsApp.tsx:213 — ChevronRight decorative needs aria-hidden="true"
EventsApp.tsx:216 — Circle decorative icon needs aria-hidden="true"
EventsApp.tsx:233 — formatTimestamp again hardcoded format
EventsApp.tsx:281 — GitBranch decorative needs aria-hidden="true"
EventsApp.tsx:298 — tabs lack role="tablist"/role="tab"/aria-selected/aria-controls
EventsApp.tsx:298 — tab buttons lack arrow-key keyboard navigation
EventsApp.tsx:319 — sidebar lacks <nav>/role="navigation"
EventsApp.tsx:346 — filter pill buttons lack aria-pressed
EventsApp.tsx:363 — autoScroll toggle lacks role="switch"/aria-checked
EventsApp.tsx:418 — filteredSteps.map() unbounded — no virtualization for >50 events
EventsApp.tsx:435 — stepsByTime nested map() unbounded — no virtualization
EventsApp.tsx:131 — rootNode.timestamp falls back to new Date().toISOString() — hydration mismatch risk if SSR
EventsApp.tsx:328 — tooltip text uses straight apostrophe — should use curly quote
EventsApp.tsx:367 — "Auto-scroll ON/OFF" should use semantic switch + visual ON/OFF reflects via aria-checked
```

### apps/web/src/components/os/apps/ChatApp.tsx

```
ChatApp.tsx:106 — icon button (Code toggle) missing aria-label
ChatApp.tsx:178 — icon button (ThumbsUp) missing aria-label
ChatApp.tsx:186 — icon button (ThumbsDown) missing aria-label
ChatApp.tsx:204 — autoFocus inside menu items applied to every loop iteration; misuse of autoFocus
ChatApp.tsx:262 — "Allow once" not Title Case; use "Allow Once"
ChatApp.tsx:282 — "Show/Hide details" not Title Case
ChatApp.tsx:346 — button missing aria-label / no aria-expanded for popover trigger
ChatApp.tsx:359 — <div onClick> overlay used as backdrop dismiss — not a button/no keyboard handler
ChatApp.tsx:393 — TTL option buttons rely on hover/color only; "15 min" should use &nbsp; (non-breaking)
ChatApp.tsx:678 — "New Session" button uses Title Case OK but icon-only button at 714 missing aria-label
ChatApp.tsx:714 — chevron toggle button missing aria-label (icon-only)
ChatApp.tsx:722 — persona picker button missing aria-haspopup/aria-expanded
ChatApp.tsx:873 — model picker button missing aria-haspopup/aria-expanded
ChatApp.tsx:962 — pin toggle button missing aria-expanded
ChatApp.tsx:975 — PinOff icon button missing aria-label
ChatApp.tsx:986 — shimmer animation not gated by prefers-reduced-motion
ChatApp.tsx:1033 — large messages.map without virtualization (could exceed 50 items in long sessions)
ChatApp.tsx:1035 — onDoubleClick on <div> without keyboard equivalent for context rail
ChatApp.tsx:1067 — copy icon button missing aria-label
ChatApp.tsx:1077 — pin icon button missing aria-label
ChatApp.tsx:1151 — paperclip button missing aria-label
ChatApp.tsx:1154 — textarea lacks <label>/aria-label (placeholder only)
ChatApp.tsx:1159 — placeholder doesn't end with ellipsis char (uses three-dot ASCII)
ChatApp.tsx:1163 — Send icon button missing aria-label
ChatApp.tsx:696 — hardcoded date format (toLocaleDateString without locale options)
ChatApp.tsx:1159 — "Message Waggle..." uses three-dot ASCII and "Waggle" should be wrapped translate="no"
ChatApp.tsx:1166 — submit button has disabled state but no spinner indicator during request
ChatApp.tsx:907 — "Agent Profile" toggle button missing aria-expanded
ChatApp.tsx:282 — "Show/Hide details" — placeholders should be specific; use "Show JSON" / "Hide JSON"
ChatApp.tsx:175 — decorative ToolStatusIcon icons inside ToolCard not marked aria-hidden
ChatApp.tsx:243 — decorative AlertTriangle missing aria-hidden
ChatApp.tsx:1054 — decorative Sparkles missing aria-hidden
```

### apps/web/src/components/os/apps/ChatWindowInstance.tsx

```
ChatWindowInstance.tsx:91 — useEffect dependency array missing currentPersona (would loop) but eslint react-hooks/exhaustive-deps suppressed silently
ChatWindowInstance.tsx:145 — console.error in production code path
ChatWindowInstance.tsx:172 — console.error in production code path
ChatWindowInstance.tsx:199 — console.error in production code path
ChatWindowInstance.tsx:210 — useEffect deps array empty but uses workspaceId via fetchTeam closure — stale closure risk
ChatWindowInstance.tsx:216 — toast description splits "/" path — display name not localized via Intl
```

### apps/web/src/components/os/apps/AgentsApp.tsx

```
AgentsApp.tsx:58 — console.error in production code path
AgentsApp.tsx:83 — console.error in production code path
AgentsApp.tsx:92 — console.error in production code path
AgentsApp.tsx:100 — console.error in production code path
AgentsApp.tsx:108 — console.error in production code path
AgentsApp.tsx:117 — console.error in production code path
AgentsApp.tsx:125 — console.error in production code path
AgentsApp.tsx:138 — console.error in production code path
AgentsApp.tsx:146 — console.error in production code path
AgentsApp.tsx:174 — decorative Bot icon missing aria-hidden
AgentsApp.tsx:186 — decorative Bot icon inside tab missing aria-hidden
AgentsApp.tsx:197 — decorative Users icon inside tab missing aria-hidden
AgentsApp.tsx:202 — "New Persona" toggle button missing aria-expanded
AgentsApp.tsx:208 — X icon button (cancel) needs aria-label, currently relies on text adjacent
AgentsApp.tsx:226 — decorative AlertCircle missing aria-hidden
AgentsApp.tsx:228 — "Retry" button has icon + text but icon missing aria-hidden
AgentsApp.tsx:231 — icon-only dismiss button (X) missing aria-label
AgentsApp.tsx:239 — decorative Search icon missing aria-hidden
AgentsApp.tsx:243 — placeholder "Search personas..." uses three-dot ASCII not ellipsis char
AgentsApp.tsx:243 — placeholder "Search groups..." uses three-dot ASCII not ellipsis char
AgentsApp.tsx:240 — Input lacks aria-label / <label>
AgentsApp.tsx:235 — role="tabpanel" missing aria-labelledby tying to active tab
AgentsApp.tsx:182 — tabs lack onKeyDown for arrow-key navigation (WAI-ARIA tab pattern)
```

### apps/web/src/components/os/apps/MemoryApp.tsx

```
MemoryApp.tsx:122 — decorative Search icon missing aria-hidden
MemoryApp.tsx:123 — Input missing aria-label / <label>
MemoryApp.tsx:126 — placeholder "Search memories..." uses three-dot ASCII not ellipsis char
MemoryApp.tsx:138 — filter toggle button missing aria-expanded
MemoryApp.tsx:152 — decorative frame-type emoji icons should be aria-hidden
MemoryApp.tsx:167 — range input missing aria-label (only visual label sibling without htmlFor)
MemoryApp.tsx:178 — frames.map can exceed 50 items — sidebar should virtualize
MemoryApp.tsx:200 — hardcoded date format (toLocaleDateString without options) — use Intl.DateTimeFormat
MemoryApp.tsx:217 — decorative Loader2 missing aria-hidden
MemoryApp.tsx:223 — decorative Brain icon missing aria-hidden
MemoryApp.tsx:245 — tabs use aria-pressed (button) instead of role="tab"/aria-selected pattern
MemoryApp.tsx:289 — Edit3 icon-only button missing aria-label
MemoryApp.tsx:292 — Trash2 destructive action (delete frame) lacks confirmation or undo
MemoryApp.tsx:303 — toLocaleString called without locale — hardcoded date format
MemoryApp.tsx:308 — raw-HTML injection React prop usage — verify renderSimpleMarkdown escapes correctly (comment states yes, but high-risk surface)
MemoryApp.tsx:285 — decorative frame-type emoji missing aria-hidden
MemoryApp.tsx:321 — decorative Brain icon missing aria-hidden
MemoryApp.tsx:86 — URL doesn't reflect view tab state (deep-link missing)
```

### apps/web/src/components/os/apps/VoiceApp.tsx

```
VoiceApp.tsx:4 — decorative Mic icon missing aria-hidden
VoiceApp.tsx:7 — "voice commands" — should end with period or follow consistent copy style; minor copy issue
```

### apps/web/src/components/os/apps/UserProfileApp.tsx

```
UserProfileApp.tsx:84 — useEffect deps array empty but uses adapter.getProfile — should declare or comment intent
UserProfileApp.tsx:174 — any-typed setProfile callback violates avoid-any rule
UserProfileApp.tsx:192 — any-typed setProfile callback violates avoid-any rule
UserProfileApp.tsx:217 — role="tablist" but tab buttons missing onKeyDown arrow handlers
UserProfileApp.tsx:226 — decorative tab icons missing aria-hidden
UserProfileApp.tsx:232 — decorative CheckCircle2 missing aria-hidden
UserProfileApp.tsx:239 — role="tabpanel" missing aria-labelledby/id
UserProfileApp.tsx:254 — decorative Sparkles missing aria-hidden
UserProfileApp.tsx:301 — <label> missing htmlFor + Input missing id (label not associated)
UserProfileApp.tsx:302 — Input missing autoComplete="name" + spellCheck={false} consideration
UserProfileApp.tsx:306 — <label> missing htmlFor + Input missing id (label not associated)
UserProfileApp.tsx:307 — Input missing autoComplete="organization-title"
UserProfileApp.tsx:311 — <label> missing htmlFor + Input missing id
UserProfileApp.tsx:312 — Input missing autoComplete="organization"
UserProfileApp.tsx:316 — <label> missing htmlFor + select missing id
UserProfileApp.tsx:317 — native <select> in dark mode missing explicit background-color/color
UserProfileApp.tsx:326 — <label> missing htmlFor + textarea missing id
UserProfileApp.tsx:327 — placeholder "Brief professional bio..." uses three-dot ASCII
UserProfileApp.tsx:334 — submit-style button stays enabled correctly but no aria-live feedback for saveMsg (line 521)
UserProfileApp.tsx:351 — placeholder "Paste at least 50..." uses three-dot ASCII
UserProfileApp.tsx:356 — decorative Loader2/Sparkles missing aria-hidden
UserProfileApp.tsx:397 — color inputs missing <label htmlFor>
UserProfileApp.tsx:425 — <label> missing htmlFor + Input missing id
UserProfileApp.tsx:430 — <label> missing htmlFor + Input missing id
UserProfileApp.tsx:445 — placeholder "Paste your brand guidelines..." uses three-dot ASCII
UserProfileApp.tsx:501 — <label> missing htmlFor + select missing id
UserProfileApp.tsx:502 — native <select> in dark mode missing explicit background-color/color
UserProfileApp.tsx:521 — saveMsg announcement lacks aria-live="polite"
UserProfileApp.tsx:217 — tabs missing tabIndex management for arrow-key navigation (only static tabIndex set)
UserProfileApp.tsx:140 — switch statement field name "name" overrides closure name shadowing (lint risk; works but error-prone)
```

### apps/web/src/components/os/apps/TimelineApp.tsx

```
TimelineApp.tsx:48 — hardcoded date format — should use Intl.DateTimeFormat
TimelineApp.tsx:59 — hardcoded date format — should use Intl.DateTimeFormat
TimelineApp.tsx:123 — decorative Clock icon missing aria-hidden
TimelineApp.tsx:130 — cost format uses toFixed instead of Intl.NumberFormat currency
TimelineApp.tsx:149 — decorative Filter icon missing aria-hidden
TimelineApp.tsx:150 — <select> missing <label> / aria-label
TimelineApp.tsx:150 — native <select> missing explicit background-color/color (dark mode)
TimelineApp.tsx:166 — decorative Loader2 missing aria-hidden
TimelineApp.tsx:170 — decorative Clock missing aria-hidden
TimelineApp.tsx:182 — pluralization "event/events" — should use Intl.PluralRules
TimelineApp.tsx:188 — filtered.map may exceed 500 items (limit param) — should virtualize
TimelineApp.tsx:193 — row button missing aria-expanded for expand/collapse state
TimelineApp.tsx:200 — decorative event Icon missing aria-hidden
TimelineApp.tsx:215 — cost format uses toFixed instead of Intl.NumberFormat
TimelineApp.tsx:225 — chevron animation not gated by prefers-reduced-motion (rotate-90 transition-transform)
TimelineApp.tsx:218 — long output truncated with slice(500) but lacks "show more" affordance
TimelineApp.tsx:135 — range filter state not reflected in URL (deep-link missing)
```

### apps/web/src/components/os/apps/ConnectorsApp.tsx

```
ConnectorsApp.tsx:81 — console.error in production code
ConnectorsApp.tsx:100 — console.error in production code
ConnectorsApp.tsx:108 — console.error in production code
ConnectorsApp.tsx:134 — icon-only Loader2 button area lacks aria-label / aria-busy on loading state
ConnectorsApp.tsx:140 — decorative AlertTriangle icon missing aria-hidden="true"
ConnectorsApp.tsx:144 — decorative RefreshCw icon missing aria-hidden="true"
ConnectorsApp.tsx:161 — decorative Plug icon missing aria-hidden="true"
ConnectorsApp.tsx:171 — decorative Server icon missing aria-hidden="true"
ConnectorsApp.tsx:177 — filter buttons missing role="radio"/aria-pressed + visible focus state
ConnectorsApp.tsx:196 — icon-only refresh button missing aria-label="Refresh connectors"
ConnectorsApp.tsx:203 — decorative Zap icon missing aria-hidden="true"
ConnectorsApp.tsx:231 — expand/collapse button lacks aria-expanded + aria-controls
ConnectorsApp.tsx:248 — decorative CheckCircle2 missing aria-hidden="true"
ConnectorsApp.tsx:249 — decorative ChevronDown/ChevronRight missing aria-hidden="true"
ConnectorsApp.tsx:267 — using array index as React key
ConnectorsApp.tsx:290 — email Input lacks <label>, name, autocomplete="email", type="email"
ConnectorsApp.tsx:294 — token Input lacks <label>, name, autocomplete="off"; password type but spellCheck not disabled
ConnectorsApp.tsx:295 — placeholder doesn't end with ellipsis char
ConnectorsApp.tsx:297 — Connect button while connecting lacks aria-busy / loading state ending in ellipsis char
ConnectorsApp.tsx:299 — decorative Loader2/Plug icons missing aria-hidden="true"
ConnectorsApp.tsx:152-186 — tab buttons missing keyboard arrow navigation typical for role="tablist"
ConnectorsApp.tsx:271 — external link missing visible "(opens in new tab)" cue / decorative ExternalLink missing aria-hidden
ConnectorsApp.tsx:282 — Disconnect destructive action lacks confirmation/undo
ConnectorsApp.tsx:158,168,178,212,232,283,298 — "transition-colors" OK but hover state on buttons missing focus-visible:ring-* class
ConnectorsApp.tsx:184 — filter values "all/connected/available" not reflected in URL (deep-linking)
ConnectorsApp.tsx:265 — empty state for filtered (zero results) not handled
```

### apps/web/src/components/os/apps/MarketplaceApp.tsx

```
MarketplaceApp.tsx:46 — empty catch swallows error silently
MarketplaceApp.tsx:58 — empty catch swallows error silently
MarketplaceApp.tsx:141 — decorative Store icon missing aria-hidden="true"
MarketplaceApp.tsx:149 — tab buttons missing focus-visible:ring-* and keyboard arrow-nav for role="tablist"
MarketplaceApp.tsx:167 — decorative Search icon missing aria-hidden="true"
MarketplaceApp.tsx:168 — search Input lacks <label> or aria-label, type="search", autocomplete="off"
MarketplaceApp.tsx:171 — placeholder uses three-dot ASCII not ellipsis char
MarketplaceApp.tsx:174 — decorative Loader2 missing aria-hidden="true"
MarketplaceApp.tsx:180 — tabpanel lacks aria-labelledby pointing to active tab
MarketplaceApp.tsx:183 — decorative Loader2 missing aria-hidden="true"
MarketplaceApp.tsx:184 — "Loading packages..." should use ellipsis char
MarketplaceApp.tsx:184 — loading text lacks aria-live="polite"
MarketplaceApp.tsx:190 — decorative Package missing aria-hidden="true"
MarketplaceApp.tsx:192 — straight quotes around query; should use curly quotes
MarketplaceApp.tsx:197 — large list rendered via .map without virtualization (>50 risk)
MarketplaceApp.tsx:202 — decorative Package missing aria-hidden="true"
MarketplaceApp.tsx:207 — decorative CheckCircle2 missing aria-hidden="true"
MarketplaceApp.tsx:218 — destructive "Remove" lacks confirmation/undo
MarketplaceApp.tsx:218 — icon-only sized button labeled "Remove" OK but Trash2 needs aria-hidden
MarketplaceApp.tsx:225 — Install button while installing lacks aria-busy
MarketplaceApp.tsx:230 — decorative Loader2/Download missing aria-hidden="true"
MarketplaceApp.tsx:144 — "{total} packages available" lacks aria-live to announce changes after search
```

### apps/web/src/components/os/apps/CapabilitiesApp.tsx

```
CapabilitiesApp.tsx:38 — useEffect missing dependency array entries (exhaustive-deps); log.length omitted intentionally but eslint will flag
CapabilitiesApp.tsx:40 — decorative Loader2 missing aria-hidden="true"
CapabilitiesApp.tsx:48 — decorative CheckCircle2/X missing aria-hidden="true"
CapabilitiesApp.tsx:53 — new Date().toLocaleDateString() should use Intl.DateTimeFormat with explicit locale
CapabilitiesApp.tsx:202 — decorative Package missing aria-hidden="true"
CapabilitiesApp.tsx:205 — decorative TrustIcon missing aria-hidden="true"
CapabilitiesApp.tsx:218 — skill chip uses three-dot ASCII; tile is a button-in-button violation (button at 194 wraps buttons at 212)
CapabilitiesApp.tsx:230 — decorative CheckCircle2 missing aria-hidden="true"
CapabilitiesApp.tsx:238 — decorative Loader2/Download missing aria-hidden="true"
CapabilitiesApp.tsx:253 — modal backdrop <div onClick> closes modal — should be <button> or document-level handler; missing role="dialog" + aria-modal
CapabilitiesApp.tsx:253 — missing onKeyDown for Escape to close
CapabilitiesApp.tsx:253 — modal missing focus trap + initial focus management
CapabilitiesApp.tsx:253 — missing overscroll-behavior: contain on modal
CapabilitiesApp.tsx:259 — inner div needs role="document" or stopPropagation works but should also handle keydown
CapabilitiesApp.tsx:264 — decorative Package missing aria-hidden="true"
CapabilitiesApp.tsx:283 — tabIndex={0} on a span — should be <button> if interactive
CapabilitiesApp.tsx:298-305 — button-in-button (if HintTooltip wraps a button)
CapabilitiesApp.tsx:313 — decorative CheckCircle2 missing aria-hidden="true"
CapabilitiesApp.tsx:327 — decorative Download missing aria-hidden="true"
CapabilitiesApp.tsx:341 — icon-only view-mode toggle "grid" missing aria-label and aria-pressed
CapabilitiesApp.tsx:345 — decorative Grid3X3 missing aria-hidden="true"
CapabilitiesApp.tsx:347 — icon-only view-mode toggle "list" missing aria-label and aria-pressed
CapabilitiesApp.tsx:351 — decorative List missing aria-hidden="true"
CapabilitiesApp.tsx:357 — tablist lacks keyboard arrow-key navigation
CapabilitiesApp.tsx:369 — tab buttons lack visible focus-visible:ring-*
CapabilitiesApp.tsx:378 — decorative Store icon missing aria-hidden="true"
CapabilitiesApp.tsx:386 — decorative Search missing aria-hidden="true"
CapabilitiesApp.tsx:387 — search Input lacks <label>/aria-label, type="search", autocomplete="off"
CapabilitiesApp.tsx:390 — placeholder uses three-dot ASCII not ellipsis char
CapabilitiesApp.tsx:397 — decorative Loader2 missing aria-hidden="true"
CapabilitiesApp.tsx:401 — active tab not reflected in URL (deep-linking)
CapabilitiesApp.tsx:413 — decorative Package missing aria-hidden="true"
CapabilitiesApp.tsx:434 — "29 services" — hardcoded number should be derived from connectors data
CapabilitiesApp.tsx:464 — decorative FlaskConical missing aria-hidden="true"
CapabilitiesApp.tsx:467 — close button missing aria-label
CapabilitiesApp.tsx:469 — decorative X missing aria-hidden="true"
CapabilitiesApp.tsx:471 — truncation marker uses three-dot ASCII
CapabilitiesApp.tsx:191 — `(pack.trust)` allows undefined index; falls back fine but type is unsound
```

### apps/web/src/components/os/apps/VaultApp.tsx

```
VaultApp.tsx:94 — useRef<ReturnType<typeof setTimeout>>() called without initial value (TS2554 in strict mode)
VaultApp.tsx:112 — `as any` cast — use proper type
VaultApp.tsx:211 — decorative Loader2 missing aria-hidden="true"
VaultApp.tsx:217 — tablist with single tab visible — odd UX (only "Secrets")
VaultApp.tsx:225 — decorative Key missing aria-hidden="true"
VaultApp.tsx:241 — decorative Shield missing aria-hidden="true"
VaultApp.tsx:243 — icon-only refresh button missing aria-label
VaultApp.tsx:244 — decorative RefreshCw missing aria-hidden="true"
VaultApp.tsx:248 — decorative Shield missing aria-hidden="true"
VaultApp.tsx:268 — decorative Lock missing aria-hidden="true"
VaultApp.tsx:277 — opacity-0/group-hover reveal pattern hides actions from keyboard users — needs focus-within: opacity-100
VaultApp.tsx:282 — icon-only Pencil button — HintTooltip provides label but explicit aria-label safer
VaultApp.tsx:283 — decorative Pencil missing aria-hidden="true"
VaultApp.tsx:287 — icon-only Reveal/Hide button missing explicit aria-label
VaultApp.tsx:288 — decorative Eye/EyeOff missing aria-hidden="true"
VaultApp.tsx:292 — icon-only Delete destructive button lacks confirmation/undo
VaultApp.tsx:293 — decorative Trash2 missing aria-hidden="true"
VaultApp.tsx:279 — revealed value rendered inline; missing aria-live="polite" announcement on reveal
VaultApp.tsx:310 — secret-name Input lacks <label> / autocomplete="off" / name attribute
VaultApp.tsx:312 — placeholder doesn't end with ellipsis char
VaultApp.tsx:314 — icon-only dropdown toggle missing aria-label / aria-expanded / aria-controls
VaultApp.tsx:316 — decorative ChevronDown missing aria-hidden="true"
VaultApp.tsx:321 — suggestion dropdown lacks role="listbox" + option roles + keyboard nav
VaultApp.tsx:342 — native <select> missing explicit background-color and color for dark mode
VaultApp.tsx:342 — select lacks <label>/aria-label
VaultApp.tsx:353 — decorative User missing aria-hidden="true"
VaultApp.tsx:354 — username Input lacks <label>, autocomplete="username", spellCheck={false}
VaultApp.tsx:354 — placeholder doesn't end with ellipsis char
VaultApp.tsx:360 — password Input lacks <label>, autocomplete="off" / "new-password", spellCheck={false}
VaultApp.tsx:361 — placeholder doesn't end with ellipsis char
VaultApp.tsx:364 — submit button uses disabled-while-empty pattern; "Add to Vault" lacks loading aria-busy
VaultApp.tsx:367 — "Add to Vault"/"Update in Vault" copy good; loading state should append ellipsis char
VaultApp.tsx:163 — reveal timer state mutation race if component unmounts (no cleanup on unmount)
```

### apps/web/src/components/os/apps/FilesApp.tsx

```
FilesApp.tsx:39 — divider div used as h-px bar — fine but heading <h4> at 41 lacks scroll-margin-top
FilesApp.tsx:47 — new Date().toLocaleDateString() — use Intl.DateTimeFormat with explicit locale
FilesApp.tsx:387 — "Server unreachable" banner missing role="status" / aria-live="polite"
FilesApp.tsx:452 — decorative Folder icon missing aria-hidden="true"
FilesApp.tsx:453 — <input> rename/new-folder field lacks <label>/aria-label
FilesApp.tsx:457 — placeholder "New folder name..." should use ellipsis char
FilesApp.tsx:459 — autoFocus usage acceptable here (single primary input in dialog)
FilesApp.tsx:472 — decorative Folder missing aria-hidden="true"
FilesApp.tsx:492 — <tr> with onClick — table row is not a button; keyboard activation broken (no Enter/Space handlers, no role="button"/tabIndex)
FilesApp.tsx:497 — inline ternary returns a value but isn't used; comma side-effect pattern flagged by ESLint
FilesApp.tsx:503 — decorative Icon missing aria-hidden="true"
FilesApp.tsx:505 — rename <input> missing <label>/aria-label, autocomplete="off", spellCheck={false}
FilesApp.tsx:518 — sizes & dates not using tabular-nums (font-variant-numeric)
FilesApp.tsx:519 — new Date().toLocaleDateString() — use Intl.DateTimeFormat
FilesApp.tsx:526 — grid view large lists may need virtualization >50
FilesApp.tsx:531 — grid <button> contains draggable + onDoubleClick; button doesn't natively get double-click semantics
FilesApp.tsx:536 — same comma-side-effect ternary issue
FilesApp.tsx:541 — decorative Icon missing aria-hidden="true"
FilesApp.tsx:561 — decorative CheckSquare missing aria-hidden="true"
FilesApp.tsx:579 — decorative XSquare missing aria-hidden="true"
FilesApp.tsx:599 — modal backdrop <motion.div onClick> closes — missing role="dialog" + aria-modal + aria-labelledby
FilesApp.tsx:599 — missing overscroll-behavior: contain
FilesApp.tsx:603 — close button missing aria-label
FilesApp.tsx:603 — decorative XIcon missing aria-hidden="true"
FilesApp.tsx:606 — decorative Folder missing aria-hidden="true"
FilesApp.tsx:611 — decorative Folder missing aria-hidden="true"
FilesApp.tsx:613 — paths use font-mono — should be translate="no"
FilesApp.tsx:640 — context-menu lacks role="menu" + role="menuitem" semantics + arrow-key navigation
FilesApp.tsx:644-660 — menu item icons missing aria-hidden="true"
FilesApp.tsx:651 — destructive Delete in context menu lacks confirmation
FilesApp.tsx:670 — properties dialog missing role="dialog"/aria-modal/aria-labelledby
FilesApp.tsx:679 — path display missing translate="no"
FilesApp.tsx:681 — close button missing aria-label
FilesApp.tsx:687 — field icons missing aria-hidden="true" throughout
FilesApp.tsx:698-699 — new Date().toLocaleString() — use Intl.DateTimeFormat
FilesApp.tsx:708 — path display missing translate="no"
FilesApp.tsx:494 — draggable row lacks aria-grabbed/aria-dropeffect alternatives and screen-reader keyboard DnD alternative
FilesApp.tsx:339-342 — drag handlers don't disable text selection or set inert on dragged element
FilesApp.tsx:526 — hard-coded grid-cols-4 doesn't adapt to width
FilesApp.tsx:283 — keyboard handler handleBulkDelete destructive without confirmation
FilesApp.tsx:496 — onClick on <tr> uses ctrlKey/metaKey but no shiftKey range select
FilesApp.tsx:587 — status bar count not announced via aria-live for selection changes
FilesApp.tsx:690 — "({propertiesFile.size.toLocaleString()} bytes)" — Intl.NumberFormat
FilesApp.tsx:445 — hidden file input lacks accessible name (id+label)
```

### apps/web/src/components/os/apps/FilesAppTabs.tsx

```
FilesAppTabs.tsx:48 — tablist missing aria-orientation="horizontal" (default) and roving tabindex/keyboard arrow navigation
FilesAppTabs.tsx:57 — tab buttons lack tabIndex={active ? 0 : -1} for roving tabindex pattern
FilesAppTabs.tsx:57 — tab buttons lack focus-visible:ring-* class (no visible focus state)
FilesAppTabs.tsx:71 — decorative Icon missing aria-hidden="true"
FilesAppTabs.tsx:40 — active tab not synced to URL (deep-linking missing for tab state)
```

### apps/web/src/components/os/apps/LauncherApp.tsx

```
LauncherApp.tsx:282 — icon button (refresh) missing aria-label
LauncherApp.tsx:283 — decorative RefreshCw icon needs aria-hidden="true"
LauncherApp.tsx:289-307 — status banners (error/lastResult) should have aria-live="polite" for async updates
LauncherApp.tsx:320 — textarea lacks <label> or aria-label (only adjacent text label)
LauncherApp.tsx:320 — textarea missing spellCheck attribute for prompt content
LauncherApp.tsx:361 — loading state "Detecting installed tools…" good but missing aria-live region
LauncherApp.tsx:441 — title attr used for Stop button hint; should also have aria-label for screen readers
LauncherApp.tsx:282,425,439,452,467,482 — buttons rely on shadcn focus-visible defaults (verify component provides)
LauncherApp.tsx:393 — animate-pulse needs to respect prefers-reduced-motion
LauncherApp.tsx:23 — Loader2 spin animation needs prefers-reduced-motion guard
LauncherApp.tsx:323 — placeholder "Paste a task or question. Leave blank to launch the tool bare." doesn't end with ellipsis char
```

### apps/web/src/components/os/apps/WaggleDanceApp.tsx

```
WaggleDanceApp.tsx:54 — icon-only refresh button missing aria-label
WaggleDanceApp.tsx:55 — decorative RefreshCw icon needs aria-hidden="true"
WaggleDanceApp.tsx:65 — filter buttons missing aria-pressed for toggle state
WaggleDanceApp.tsx:84 — "Loading signals…" lacks aria-live="polite"
WaggleDanceApp.tsx:98 — signal button (text "button") works, but selected state needs aria-pressed/aria-current
WaggleDanceApp.tsx:126 — `toLocaleTimeString([], ...)` — should use Intl.DateTimeFormat
WaggleDanceApp.tsx:162 — `new Date(...).toLocaleString()` should use Intl.DateTimeFormat
WaggleDanceApp.tsx:106 — Icon (decorative) missing aria-hidden="true"
WaggleDanceApp.tsx:168 — <pre> JSON dump can be very long; consider scroll region with aria-label
WaggleDanceApp.tsx:65,98 — filter/list buttons lack visible focus-visible:ring styles
WaggleDanceApp.tsx:79 — two-pane layout uses fixed w-1/2 without min-w-0 on children → flex truncation risk
```

### apps/web/src/components/os/apps/RoomApp.tsx

```
RoomApp.tsx:23 — decorative lucide icons need aria-hidden="true" throughout
RoomApp.tsx:85 — animate-pulse on status dot needs prefers-reduced-motion guard
RoomApp.tsx:128 — animate-spin needs prefers-reduced-motion guard
RoomApp.tsx:62 — `Date.now()` inside formatElapsed called during render → hydration mismatch risk + non-deterministic re-renders
RoomApp.tsx:211 — "Recently completed" button uses ▼/▶ Unicode arrows — missing aria-expanded for collapsible
RoomApp.tsx:211 — collapsible toggle button missing aria-controls referencing the panel
RoomApp.tsx:163 — h3 heading hierarchy starts at h3 — verify parent surfaces an h1/h2; otherwise non-hierarchical
RoomApp.tsx:178 — main scrollable region lacks aria-label / role
RoomApp.tsx:211 — button uses outline-none default; relies on browser focus ring — should add focus-visible:ring-*
```

### apps/web/src/components/os/apps/ApprovalsApp.tsx

```
ApprovalsApp.tsx:126 — `confirm(...)` browser dialog — destructive action needs custom modal with proper focus management
ApprovalsApp.tsx:146,155 — tab buttons missing role="tab"/aria-selected for tablist semantics
ApprovalsApp.tsx:178,233 — tab panels missing role="tabpanel" / aria-labelledby
ApprovalsApp.tsx:166 — icon-only refresh button missing aria-label (HintTooltip provides visual but not accessible name)
ApprovalsApp.tsx:171 — decorative RefreshCw icon needs aria-hidden="true"
ApprovalsApp.tsx:171 — animate-spin needs prefers-reduced-motion guard
ApprovalsApp.tsx:273 — revoke icon-only button missing aria-label (only HintTooltip)
ApprovalsApp.tsx:179,235 — pending/grants tab panels should announce updates via aria-live="polite"
ApprovalsApp.tsx:39 — `formatRelative` reads Date.now() during render → hydration mismatch / stale UI; no minute-tick refresh
ApprovalsApp.tsx:146,155 — tab buttons rely on browser focus only; need focus-visible:ring
ApprovalsApp.tsx:90 — 5s polling interval on pending — consider visibility/idle pause
ApprovalsApp.tsx:250 — "Revoke all" destructive action style is text-only — should be a clear button
ApprovalsApp.tsx:111,121,131 — error toast generic ("Failed to send response") — should include fix/next step
```

### apps/web/src/components/os/apps/ScheduledJobsApp.tsx

```
ScheduledJobsApp.tsx:126 — decorative Clock icon missing aria-hidden="true"
ScheduledJobsApp.tsx:130 — "New" button has icon + text label (OK), but icon needs aria-hidden
ScheduledJobsApp.tsx:141 — Loader2 animate-spin needs prefers-reduced-motion guard
ScheduledJobsApp.tsx:156,167,186 — labels not associated with inputs via htmlFor/id (visual labels only)
ScheduledJobsApp.tsx:168 — native <select> missing explicit color-scheme/background for dark mode
ScheduledJobsApp.tsx:188 — same: native <select> needs explicit background-color and color for dark mode
ScheduledJobsApp.tsx:158 — "Nightly memory consolidation" placeholder doesn't end with ellipsis char
ScheduledJobsApp.tsx:231,246,255 — icon-only buttons rely on HintTooltip only — need aria-label for screen readers
ScheduledJobsApp.tsx:243 — `new Date(job.lastRun).toLocaleDateString()` should use Intl.DateTimeFormat
ScheduledJobsApp.tsx:252 — Loader2 animate-spin needs prefers-reduced-motion guard
ScheduledJobsApp.tsx:127 — h2 heading — verify parent h1 exists for hierarchy
ScheduledJobsApp.tsx:159,200 — Input components rely on shadcn defaults — verify autocomplete attribute presence
ScheduledJobsApp.tsx:130,232,247,256 — buttons lack focus-visible:ring (rely on browser default)
ScheduledJobsApp.tsx:88,97,116 — error toasts lack remediation guidance
ScheduledJobsApp.tsx:128 — "{jobs.length} jobs" — should be "1 job" / "n jobs" pluralization
```

### apps/web/src/components/os/apps/TeamGovernanceApp.tsx

```
TeamGovernanceApp.tsx:7-13 — decorative Shield/Lock icons missing aria-hidden="true"
TeamGovernanceApp.tsx:17,23,30 — decorative Users/Shield/Crown icons missing aria-hidden="true"
TeamGovernanceApp.tsx:38 — "$49/mo" hardcoded format — should use Intl.NumberFormat for currency and non-breaking space "$49&nbsp;/mo per seat"
TeamGovernanceApp.tsx:10 — h2 heading — verify parent h1 exists
TeamGovernanceApp.tsx:38 — upgrade hint text only — no CTA button to upgrade (missed engagement)
TeamGovernanceApp.tsx:5 — empty state has no skip/back link; primarily decorative gate screen
```

---

## 2. Out-of-scope / acceptable patterns (don't action)

- `autoFocus` on `FilesApp.tsx:459` (rename / new-folder dialog) and `ScheduledJobsApp.tsx:162` (job-create form first input) — single primary input in a dialog, desktop-only context, explicitly allowed by guideline.
- `EventsApp.tsx:53` `StopCircle` "Cancel" button — has visible text; redundant tooltip is acceptable.
- `RoomApp.tsx:166` " · " mid-dot separator — fine, not a copy violation.
- Per-app `transition-colors` use — list-only transition (not `transition: all`), guideline-compliant.
- `LauncherApp.tsx:404` truncation with `title` attr on path — `min-w-0` parent present, no finding.

---

## 3. Verification gates (run after each fix PR)

1. `npm run lint` — confirm no new ESLint errors.
2. `npx tsc --noEmit --project apps/web/tsconfig.json` — confirm types still clean.
3. `npm run test -- --run apps/web` — confirm unit tests still pass.
4. `npm run test:visual` — confirm visual regression snapshots still pass (or update intentionally).
5. **Manual a11y spot-check** on the touched app: tab through with keyboard only, verify focus visible at every stop. Use Chrome DevTools → Accessibility Tree to spot-check `aria-*` propagation.

---

## 4. Suggested PR breakdown (matches §0 fix order)

| PR | Title | Files | Approx findings closed |
|---|---|---|---|
| PR-A | `chore(a11y): aria-hidden + aria-label codemod` | ~26 app files | ~140 |
| PR-B | `chore(copy): ellipsis codemod (three-dot → single char)` | ~12 app files | ~30 |
| PR-C | `feat(ui): <Spinner /> primitive with motion-reduce` + migrate | ~10 app files | ~25 |
| PR-D | `feat(lib): Intl wrappers in lib/format.ts` + codemod | ~12 app files | ~30 |
| PR-E | `feat(ui): <Modal /> + <ConfirmDialog /> + <StatusRegion />` + migrate | ~6 app files | ~30 |
| PR-F | `feat(ui): <Tabs /> WAI-ARIA primitive` + migrate | ~9 app files | ~12 tab clusters |
| PR-G | `feat(ui): <FormField /> wrapper` + migrate | UserProfile, Vault, Connectors, Settings, FilesApp | ~40 |
| PR-H | `fix: console.error cleanup + AbortController + visibilityState` | AgentsApp, ChatWindowInstance, ConnectorsApp, Dashboard, MissionControl, Cockpit, Telemetry, Backup, Approvals | ~30 |
| PR-I | `feat: URL state via nuqs for tabs/filters/search` | per-app | ~8 |
| PR-J | `fix: nested button + Date.now()-in-render + raw-HTML escape audit` | EventsApp, CapabilitiesApp, RoomApp, ApprovalsApp, MemoryApp | ~10 |

**~7 working days. Closes ~360 of ~480 findings (75%). Remaining 25% is genuine per-file polish.**

---

Generated by web-design-guidelines skill review on 2026-05-27 against HEAD `9902906`.
