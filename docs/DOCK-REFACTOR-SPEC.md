# Waggle AI — Dock Refactor: Implementation Spec for Claude Code

## Executive Summary

Refactor the flat 15-icon bottom dock into a **tiered, zone-based macOS-style dock** with progressive disclosure. The dock stays at the bottom. The desktop metaphor stays. No new packages required. This is a structural refactor of existing components, not a visual redesign.

**Reference prototype:** `docs/dock-v2-macos.html` — open in browser to see the target UX.

**Estimated scope:** 6–8 files modified, 2–3 new files created. Zero backend changes.

---

## Architecture Overview

### Current State (PROBLEM)
```
Dock.tsx renders a flat array of 14 AppId items + Spawn Agent button.
Every user sees every icon. No grouping. No progressive disclosure.
```

### Target State (SOLUTION)
```
Dock.tsx renders a TIER-FILTERED set of dock items with:
- Zone parents (Ops, Extend) that open a tray/popover above the dock
- Direct app launchers (Chat, Agents, Files) that open windows directly
- Separators between zone groups
- Tier config stored in localStorage via useOnboarding hook
```

---

## Tier Definitions

Create new file: `apps/web/src/lib/dock-tiers.ts`

```typescript
import type { AppId } from '@/components/os/Dock';

export type UserTier = 'simple' | 'professional' | 'power' | 'admin';

export interface DockEntry {
  type: 'app' | 'zone-parent' | 'separator';
  key: string;
  appId?: AppId;             // for type='app' — opens this window
  icon: string;              // lucide icon name
  label: string;
  color: string;             // tailwind color class
  children?: DockEntry[];    // for type='zone-parent' — tray items
}

// What each tier sees in the dock (ordered left to right)
export const TIER_DOCK_CONFIG: Record<UserTier, DockEntry[]> = {

  simple: [
    { type:'app', key:'home',    appId:'dashboard',    icon:'LayoutDashboard', label:'Home',     color:'text-sky-400' },
    { type:'app', key:'chat',    appId:'chat',         icon:'MessageSquare',   label:'Chat',     color:'text-primary' },
    { type:'app', key:'files',   appId:'files',        icon:'FolderOpen',      label:'Files',    color:'text-amber-300' },
    { type:'separator', key:'sep-1', label:'', icon:'', color:'' },
    { type:'app', key:'system',  appId:'settings',     icon:'Settings',        label:'Settings', color:'text-muted-foreground' },
  ],

  professional: [
    { type:'app', key:'home',    appId:'dashboard',    icon:'LayoutDashboard', label:'Home',     color:'text-sky-400' },
    { type:'app', key:'chat',    appId:'chat',         icon:'MessageSquare',   label:'Chat',     color:'text-primary' },
    { type:'app', key:'agents',  appId:'agents',       icon:'Bot',             label:'Agents',   color:'text-orange-400' },
    { type:'app', key:'files',   appId:'files',        icon:'FolderOpen',      label:'Files',    color:'text-amber-300' },
    { type:'separator', key:'sep-1', label:'', icon:'', color:'' },
    { type:'app', key:'memory',  appId:'memory',       icon:'Brain',           label:'Memory',   color:'text-amber-300' },
    { type:'app', key:'system',  appId:'settings',     icon:'Settings',        label:'Settings', color:'text-muted-foreground' },
  ],
```
```typescript
  power: [
    { type:'app', key:'home',    appId:'dashboard',     icon:'LayoutDashboard', label:'Home',          color:'text-sky-400' },
    { type:'separator', key:'sep-0', label:'', icon:'', color:'' },
    { type:'app', key:'chat',    appId:'chat',          icon:'MessageSquare',   label:'Chat',          color:'text-primary' },
    { type:'app', key:'agents',  appId:'agents',        icon:'Bot',             label:'Agents',        color:'text-orange-400' },
    { type:'app', key:'files',   appId:'files',         icon:'FolderOpen',      label:'Files',         color:'text-amber-300' },
    { type:'app', key:'dance',   appId:'waggle-dance',  icon:'Zap',             label:'Waggle Dance',  color:'text-amber-400' },
    { type:'app', key:'term',    appId:'terminal',      icon:'Terminal',        label:'Terminal',       color:'text-emerald-400' },
    { type:'separator', key:'sep-1', label:'', icon:'', color:'' },
    { type:'zone-parent', key:'ops', icon:'Activity', label:'Ops', color:'text-emerald-400', children: [
      { type:'app', key:'cockpit',  appId:'cockpit',       icon:'Activity',  label:'Command Center', color:'text-emerald-400' },
      { type:'app', key:'events',   appId:'events',        icon:'Radio',     label:'Events & Logs',  color:'text-cyan-400' },
      { type:'app', key:'jobs',     appId:'scheduled-jobs', icon:'Clock',    label:'Scheduled Jobs', color:'text-amber-400' },
    ]},
    { type:'zone-parent', key:'extend', icon:'Package', label:'Extend', color:'text-violet-400', children: [
      { type:'app', key:'skills',   appId:'capabilities',  icon:'Package',   label:'Skills & Apps',  color:'text-violet-400' },
      { type:'app', key:'connect',  appId:'connectors',    icon:'Plug',      label:'Connectors',     color:'text-emerald-400' },
      { type:'app', key:'market',   appId:'marketplace',   icon:'Store',     label:'Marketplace',    color:'text-orange-400' },
    ]},
    { type:'separator', key:'sep-2', label:'', icon:'', color:'' },
    { type:'app', key:'system',  appId:'settings',      icon:'Settings',        label:'Settings',      color:'text-muted-foreground' },
  ],

  admin: [
    // Same as power, plus these additions:
    // - Voice app after Terminal in the Work group
    // - Memory, Vault, Profile as individual icons before Settings
    // - Team Management, RBAC inside System zone-parent
    // Full config follows the same pattern — extend from power tier
    // Implementation: clone power config and add admin-specific items
  ],
};

export const DEFAULT_TIER: UserTier = 'simple';
```

---

## File-by-File Changes

### 1. NEW: `apps/web/src/lib/dock-tiers.ts`
- Tier config as defined above
- Export `TIER_DOCK_CONFIG`, `UserTier`, `DockEntry`, `DEFAULT_TIER`
- Export helper: `getDockForTier(tier: UserTier): DockEntry[]`

### 2. MODIFY: `apps/web/src/hooks/useOnboarding.ts`
Add `tier` field to `OnboardingState`:
```typescript
export interface OnboardingState {
  completed: boolean;
  step: number;
  tier: UserTier;        // NEW — defaults to 'simple'
  workspaceId?: string;
  apiKeySet?: boolean;
  templateId?: string;
  personaId?: string;
}
```
Default: `tier: 'simple'`. Persisted in localStorage under `waggle:onboarding`.

### 3. REWRITE: `apps/web/src/components/os/Dock.tsx`

Current signature:
```typescript
interface DockProps {
  onOpenApp: (id: AppId) => void;
  openApps: AppId[];
  minimizedApps?: AppId[];
  onSpawnAgent?: () => void;
  waggleBadgeCount?: number;
}
```

New signature:
```typescript
interface DockProps {
  tier: UserTier;
  onOpenApp: (id: AppId) => void;
  openApps: AppId[];
  minimizedApps?: AppId[];
  onSpawnAgent?: () => void;
  waggleBadgeCount?: number;
}
```

**Key changes:**
- Import `TIER_DOCK_CONFIG` from dock-tiers
- Replace hardcoded `apps` array with `TIER_DOCK_CONFIG[tier]`
- Render three item types:
  - `type: 'app'` → Same as current (icon button, calls `onOpenApp(appId)`)
  - `type: 'separator'` → Thin vertical divider (existing pattern)
  - `type: 'zone-parent'` → Icon button that toggles a `DockTray` popover above it
- Keep ALL existing Framer Motion hover/tap animations
- Keep the Spawn Agent button after last separator (same as current)
- Keep the open-app dot indicator (same as current)
- Add: Zone parent gets a subtle ring/glow when its tray is open

### 4. NEW: `apps/web/src/components/os/DockTray.tsx`

A popover that appears ABOVE the dock when a zone-parent is clicked.

```typescript
interface DockTrayProps {
  items: DockEntry[];
  onSelect: (appId: AppId) => void;
  onClose: () => void;
  anchorRect: DOMRect;  // position relative to the parent icon
}
```

**Behavior:**
- Renders horizontally above the dock, centered on the parent icon
- Each item: icon + label + optional badge
- Uses `glass-strong` background (same as dock)
- Click outside or press Escape closes it
- Framer Motion: `AnimatePresence` with slide-up-fade-in
- Auto-closes after selecting an item

**Styling:**
- `backdrop-filter: blur(16px)`, rounded-xl, border same as dock
- Items: 64px wide columns, icon on top, label below (10px)
- Hover: `bg-muted/50` same as dock items

### 5. MODIFY: `apps/web/src/components/os/Desktop.tsx`

**Changes:**
- Import `UserTier` from dock-tiers
- Read tier from `onboardingState.tier`
- Pass `tier` prop to `<Dock />`
- Add `AppId` entries for new apps if missing: `'scheduled-jobs'`, `'terminal'`, `'marketplace'`, `'voice'`
- Add corresponding entries in `appConfig` for new AppIds (position, size, title, icon)
- Add `renderAppContent` cases for new AppIds (can be placeholder components initially)
- Update `AppId` type union in Dock.tsx to include new IDs

**Critical: Chat remains workspace-bound.**
The existing `openChatForWorkspace(activeWorkspaceId)` logic stays exactly as-is. When user clicks Chat in the dock, it opens chat for the active workspace. No change needed here.

**Critical: Files dual-mode.**
Files already receives `workspaceId` — keep this. Future enhancement: add a "Browse All" tab inside FilesApp. Out of scope for this refactor.

### 6. MODIFY: `apps/web/src/components/os/overlays/GlobalSearch.tsx`

Upgrade from basic filter to AI-aware command palette.

**Changes to QUICK_COMMANDS:**
```typescript
const QUICK_COMMANDS: SearchResult[] = [
  // Quick Actions (always shown)
  { type:'command', id:'chat',         title:'New conversation',     subtitle:'Open chat in active workspace', icon: MessageSquare },
  { type:'command', id:'agents',       title:'Create new agent',     subtitle:'Spawn a specialized agent',     icon: Bot },
  { type:'command', id:'files',        title:'Upload document',      subtitle:'Add files to workspace',        icon: FolderOpen },
  // Navigation
  { type:'command', id:'dashboard',    title:'Dashboard',            icon: LayoutDashboard },
  { type:'command', id:'cockpit',      title:'Command Center',       icon: Activity },
  { type:'command', id:'capabilities', title:'Skills & Apps',        icon: Package },
  { type:'command', id:'memory',       title:'Memory',               icon: Brain },
  { type:'command', id:'settings',     title:'Settings',             icon: Settings },
];
```

**New: AI interpretation row.**
When query.length > 12 and no exact matches, append:
```typescript
results.push({
  type: 'ai-action',
  id: query,
  title: `"${query}"`,
  subtitle: 'AI will interpret and route this request',
  icon: Sparkles,
});
```
Clicking this sends the query as a chat message to the active workspace.

**New: Recent items section.**
Fetch last 5 workspaces from `adapter.getWorkspaces()` sorted by `lastActive`, show as "Recent" group below navigation.

**Visual changes:**
- Add an "AI" badge (small purple pill) next to the search icon: `<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-semibold">AI</span>`
- Footer: add "AI understands natural language" hint on the right side

### 7. MODIFY: `apps/web/src/hooks/useKeyboardShortcuts.ts`

Update `APP_SHORTCUTS` to reflect new structure:
```typescript
const APP_SHORTCUTS: Record<string, AppId> = {
  '0': 'dashboard',
  '1': 'chat',
  '2': 'agents',
  '3': 'files',
  '4': 'cockpit',        // was: mission-control
  '5': 'memory',
  '6': 'events',
  '7': 'settings',
  '8': 'capabilities',
  '9': 'waggle-dance',
};
```


---

### 8. MODIFY: `apps/web/src/components/os/overlays/OnboardingWizard.tsx`

**Goal:** Insert a tier-selection step between the current Step 1 (Why Waggle) and Step 2 (Memory Import). This becomes the new Step 2, shifting all subsequent steps by +1.

**Current step flow (7 steps, 0–6):**
```
0: Welcome (auto-advance 3s)
1: Why Waggle (value props)
2: Memory Import (ChatGPT/Claude JSON)
3: Template Selection (8 templates)
4: Persona Selection (8 personas + custom)
5: API Key Setup (provider + key validation)
6: Celebration (auto-finish 2s)
```

**New step flow (8 steps, 0–7):**
```
0: Welcome (auto-advance 3s)           — unchanged
1: Why Waggle (value props)             — unchanged
2: Choose Your Experience (tier)        — NEW
3: Memory Import                        — was step 2
4: Template Selection                   — was step 3
5: Persona Selection                    — was step 4
6: API Key Setup                        — was step 5
7: Celebration                          — was step 6
```

**New Step 2 — "Choose Your Experience" UI spec:**

```tsx
{step === 2 && (
  <motion.div key="step-2" {...fadeSlide} className="text-center">
    <Sparkles className="w-10 h-10 text-primary mx-auto mb-4" />
    <h2 className="text-2xl font-display font-bold text-foreground mb-2">
      Choose Your Experience
    </h2>
    <p className="text-sm text-muted-foreground mb-8">
      You can change this anytime in Settings.
    </p>

    <div className="grid grid-cols-3 gap-4 mb-8">
      {TIER_OPTIONS.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            onUpdate({ tier: t.id });
            setSelectedTier(t.id);
          }}
          className={`glass-strong rounded-xl p-5 text-left transition-all
            ${selectedTier === t.id
              ? 'ring-2 ring-primary bg-primary/10'
              : 'hover:bg-muted/30'}`}
        >
          <t.icon className={`w-6 h-6 mb-3 ${t.color}`} />
          <div className="text-sm font-display font-semibold text-foreground mb-1">
            {t.name}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {t.desc}
          </div>
        </button>
      ))}
    </div>

    <button
      onClick={() => goToStep(3)}
      disabled={!selectedTier}
      className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground
        font-display text-sm font-semibold disabled:opacity-40"
    >
      Continue <ChevronRight className="inline w-4 h-4 ml-1" />
    </button>
  </motion.div>
)}
```

**TIER_OPTIONS constant (add near top of file with other constants):**
```typescript
import { Zap, Shield, Crown } from 'lucide-react';  // add to imports
import type { UserTier } from '@/lib/dock-tiers';

const TIER_OPTIONS = [
  {
    id: 'simple' as UserTier,
    name: 'Simple',
    icon: Hexagon,        // reuse existing import
    color: 'text-sky-400',
    desc: 'Clean and focused. Just the essentials — chat, files, and home.',
  },
  {
    id: 'professional' as UserTier,
    name: 'Professional',
    icon: Zap,
    color: 'text-amber-400',
    desc: 'Agents, memory, and workspace tools. The full knowledge-worker kit.',
  },
  {
    id: 'power' as UserTier,
    name: 'Full Control',
    icon: Crown,
    color: 'text-violet-400',
    desc: 'Everything. Ops console, scheduled jobs, terminal, marketplace.',
  },
] as const;
```

**Additional changes in OnboardingWizard.tsx:**

1. Add `selectedTier` local state: `const [selectedTier, setSelectedTier] = useState<UserTier>(state.tier || 'simple');`
2. Update step count: `displayStep` range becomes `step >= 1 && step <= 6`, step dots array `[0,1,2,3,4,5,6,7]`
3. Update `progressPct`: `(step / 7) * 100`
4. Update "Step X of Y" display: `Step {displayStep} of 6`
5. Shift all `step === N` conditionals for steps 2–6 to `step === N+1`
6. Update auto-finish in celebration: `if (step === 7)` instead of `if (step === 6)`
7. Update `handleFinish` to call `goToStep(7)` instead of `goToStep(6)`
8. Update `complete` callback: `update({ completed: true, step: 7 })`

**Note on admin tier:** Admin is not offered during onboarding. It is set programmatically via Settings → Administration or via API. The three onboarding options map to `simple`, `professional`, and `power`.

---

### 9. EXPAND: `AppId` Type Union

**Current `AppId` in `Dock.tsx`:**
```typescript
export type AppId = "chat" | "dashboard" | "memory" | "events" |
  "capabilities" | "connectors" | "cockpit" | "mission-control" |
  "settings" | "vault" | "profile" | "terminal" | "calculator" |
  "notes" | "waggle-dance" | "files" | "agents";
```

**New `AppId` (add these to the union):**
```typescript
export type AppId = "chat" | "dashboard" | "memory" | "events" |
  "capabilities" | "connectors" | "cockpit" | "mission-control" |
  "settings" | "vault" | "profile" | "terminal" | "calculator" |
  "notes" | "waggle-dance" | "files" | "agents" |
  // NEW:
  "scheduled-jobs" | "marketplace" | "voice";
```

**Deprecation note:** `mission-control` remains in the type for backward compatibility but is no longer referenced in any tier config. It can be removed in a follow-up cleanup pass once all references are confirmed cleared.

**Move the `AppId` type to `dock-tiers.ts`** for single-source-of-truth. Re-export from `Dock.tsx`:
```typescript
// Dock.tsx
export type { AppId } from '@/lib/dock-tiers';
```

This prevents circular imports — `dock-tiers.ts` defines both the type and the tier configs that reference it.

---

### 10. NEW: Placeholder App Components

Create minimal placeholder components for new AppIds. These are functional shells — enough for the dock to open them without crashing. Real implementation comes later.

**File: `apps/web/src/components/os/apps/ScheduledJobsApp.tsx`**
```typescript
import { Clock, Plus } from 'lucide-react';
import type { CronJob } from '@/lib/types';

interface ScheduledJobsAppProps {
  workspaceId?: string;
}

export default function ScheduledJobsApp({ workspaceId }: ScheduledJobsAppProps) {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-display font-semibold">Scheduled Jobs</h2>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg
          bg-primary/10 text-primary text-sm font-display hover:bg-primary/20">
          <Plus className="w-4 h-4" /> New Job
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No scheduled jobs yet</p>
          <p className="text-xs mt-1">
            Automate recurring tasks — reports, syncs, health checks
          </p>
        </div>
      </div>
    </div>
  );
}
```

**File: `apps/web/src/components/os/apps/MarketplaceApp.tsx`**
```typescript
import { Store, Search } from 'lucide-react';

export default function MarketplaceApp() {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Store className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-display font-semibold">Marketplace</h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg
          bg-muted/30 text-muted-foreground text-sm">
          <Search className="w-4 h-4" />
          <span>Search skills, connectors, agents...</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Marketplace coming soon</p>
          <p className="text-xs mt-1">
            Community skills, agent templates, and connector packs
          </p>
        </div>
      </div>
    </div>
  );
}
```

**File: `apps/web/src/components/os/apps/VoiceApp.tsx`**
```typescript
import { Mic } from 'lucide-react';

export default function VoiceApp() {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-6">
        <Mic className="w-5 h-5 text-rose-400" />
        <h2 className="text-lg font-display font-semibold">Voice</h2>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Mic className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Voice interface coming soon</p>
          <p className="text-xs mt-1">
            Talk to your agents, dictate notes, voice commands
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Register in Desktop.tsx `appConfig`:**
```typescript
// Add to appConfig object:
'scheduled-jobs': { x: 200, y: 150, w: 700, h: 500, title: 'Scheduled Jobs', icon: Clock },
'marketplace':    { x: 250, y: 130, w: 800, h: 550, title: 'Marketplace',     icon: Store },
'voice':          { x: 300, y: 200, w: 500, h: 400, title: 'Voice',           icon: Mic },
```

**Register in Desktop.tsx `renderAppContent` switch:**
```typescript
case 'scheduled-jobs': return <ScheduledJobsApp workspaceId={activeWorkspaceId} />;
case 'marketplace':    return <MarketplaceApp />;
case 'voice':          return <VoiceApp />;
```

---

### 11. Migration & Backward Compatibility

**localStorage migration:**
Existing users have `waggle:onboarding` without a `tier` field. The `useOnboarding` hook already spreads defaults: `{ ...defaultState, ...JSON.parse(raw) }`. As long as `defaultState` includes `tier: 'professional'` (not `'simple'` — existing users are already familiar with the UI), migration is automatic.

```typescript
// useOnboarding.ts — updated defaultState
const defaultState: OnboardingState = {
  completed: false,
  step: 0,
  tier: 'professional',  // existing users get professional, new users choose during onboarding
};
```

**Why `professional` as default, not `simple`:**
An existing user who skipped or completed onboarding before this change has already seen the full dock. Downgrading them to `simple` (3 icons) would be jarring and confusing. `professional` gives them a curated but familiar experience. New users who go through onboarding will explicitly choose their tier.

**AppId backward compatibility:**
- `mission-control` stays in the type union but has no dock entry. If a user had it in an open window state (persisted), the window opens normally — `renderAppContent` still handles it.
- `profile` and `vault` remain accessible via Settings sub-tabs or Ctrl+K. They lose dedicated dock icons but keep their AppId and window behavior.
- Old keyboard shortcuts (Ctrl+Shift+N for old mappings) will silently remap to new targets. No user action required.

**Settings → tier switcher:**
Add a "Dock Experience" dropdown to the Settings app (existing SettingsApp.tsx) under a new "Appearance" or "General" section:
```typescript
<label className="text-sm font-display text-muted-foreground">Dock Experience</label>
<select
  value={onboardingState.tier}
  onChange={(e) => onUpdate({ tier: e.target.value as UserTier })}
  className="glass-strong rounded-lg px-3 py-2 text-sm"
>
  <option value="simple">Simple — essentials only</option>
  <option value="professional">Professional — full workspace tools</option>
  <option value="power">Full Control — everything visible</option>
</select>
```
This allows users to switch tier post-onboarding without resetting anything.

---

### 12. Testing Checklist

Run through each item manually after implementation. Automate where feasible.

**Tier rendering:**
- [ ] Simple tier: dock shows exactly 5 items (Home, Chat, Files, separator, Settings)
- [ ] Professional tier: dock shows 7 items (Home, Chat, Agents, Files, sep, Memory, Settings)
- [ ] Power tier: dock shows all zones including Ops and Extend zone-parents
- [ ] Switching tier in Settings immediately updates the dock (no refresh)
- [ ] Admin tier (if implemented): extends power with additional items

**Zone trays:**
- [ ] Clicking Ops zone-parent opens tray with Command Center, Events & Logs, Scheduled Jobs
- [ ] Clicking Extend zone-parent opens tray with Skills & Apps, Connectors, Marketplace
- [ ] Clicking a tray item opens the corresponding app window AND closes the tray
- [ ] Clicking outside the tray closes it
- [ ] Pressing Escape closes the tray
- [ ] Only one tray open at a time (opening Extend closes Ops)
- [ ] Tray position: centered above the parent icon, never clipped off-screen

**Dock interactions (preserved from current):**
- [ ] Hover magnification animation works on all item types
- [ ] Open-app dot indicator shows for running apps
- [ ] Minimized apps show correct state
- [ ] Spawn Agent button still present and functional
- [ ] Waggle badge count still displays on relevant icon
- [ ] Dock glass-strong background and blur consistent

**Onboarding:**
- [ ] New user sees tier selection as Step 2
- [ ] Selecting a tier highlights the card with ring-2
- [ ] "Continue" button disabled until a tier is selected
- [ ] Selected tier persists in localStorage under `waggle:onboarding`
- [ ] Step count updated to "Step X of 6" (was "of 5")
- [ ] Progress dots show 8 dots (was 7)
- [ ] All subsequent steps shifted correctly (template is now step 4, etc.)
- [ ] Celebration auto-finish fires at step 7

**Command palette (Ctrl+K):**
- [ ] Opens with Ctrl+K
- [ ] Shows "AI" badge next to search icon
- [ ] Quick commands match new app structure
- [ ] Long queries (>12 chars) show AI interpretation row
- [ ] Clicking AI interpretation sends query to active workspace chat
- [ ] Recent workspaces section appears below commands
- [ ] Footer shows "AI understands natural language" hint

**Keyboard shortcuts:**
- [ ] Ctrl+Shift+0 opens Dashboard
- [ ] Ctrl+Shift+1 opens Chat (workspace-bound)
- [ ] Ctrl+Shift+2 opens Agents
- [ ] Ctrl+Shift+3 opens Files
- [ ] Ctrl+Shift+4 opens Cockpit (Command Center)
- [ ] Ctrl+Shift+5 opens Memory
- [ ] All shortcuts work regardless of current tier (shortcut bypasses tier filtering)

**Backward compatibility:**
- [ ] Existing user (completed onboarding, no tier field) defaults to `professional`
- [ ] mission-control AppId still renders if window state is persisted
- [ ] Profile and Vault accessible via Ctrl+K even when not in dock
- [ ] No console errors on fresh load or tier switch

**New placeholder apps:**
- [ ] Scheduled Jobs opens with placeholder UI, no crash
- [ ] Marketplace opens with placeholder UI, no crash
- [ ] Voice opens with placeholder UI, no crash
- [ ] All three have correct icons and titles in window chrome

---

### 13. Implementation Phasing

Execute in this order. Each phase is independently shippable — the app works after every phase.

**Phase 1 — Foundation (do first, everything depends on this)**
```
1. Create `apps/web/src/lib/dock-tiers.ts`
   - UserTier type, DockEntry interface, TIER_DOCK_CONFIG, getDockForTier()
   - Move AppId type here, add new IDs (scheduled-jobs, marketplace, voice)

2. Modify `apps/web/src/hooks/useOnboarding.ts`
   - Add tier field to OnboardingState
   - Set defaultState.tier = 'professional'
```

**Phase 2 — Dock rewrite (core visual change)**
```
3. Rewrite `apps/web/src/components/os/Dock.tsx`
   - Accept tier prop
   - Replace hardcoded apps array with TIER_DOCK_CONFIG[tier]
   - Render app / separator / zone-parent item types
   - Zone-parent click toggles local state for tray

4. Create `apps/web/src/components/os/DockTray.tsx`
   - Popover above dock for zone-parent children
   - AnimatePresence, click-outside-close, escape-close

5. Modify `apps/web/src/components/os/Desktop.tsx`
   - Read tier from onboardingState
   - Pass tier to Dock
   - Add appConfig entries for new AppIds
   - Add renderAppContent cases (import placeholders)
```

**Phase 3 — Placeholder apps (quick, no dependencies)**
```
6. Create ScheduledJobsApp.tsx
7. Create MarketplaceApp.tsx
8. Create VoiceApp.tsx
   — All three are empty shells with icon + "coming soon" message
```

**Phase 4 — Onboarding upgrade**
```
9. Modify OnboardingWizard.tsx
   - Insert tier selection step at position 2
   - Shift all subsequent steps by +1
   - Add TIER_OPTIONS constant
   - Update step count, progress bar, auto-finish
```

**Phase 5 — Command palette + shortcuts**
```
10. Modify GlobalSearch.tsx
    - Expand QUICK_COMMANDS
    - Add AI interpretation row
    - Add recent items section
    - Add AI badge and footer hint

11. Modify useKeyboardShortcuts.ts
    - Update APP_SHORTCUTS to new mapping
```

**Phase 6 — Settings integration + polish**
```
12. Add "Dock Experience" dropdown to SettingsApp.tsx
13. Verify backward compatibility (existing users, persisted window states)
14. Run full testing checklist (Section 12)
```

---

## Claude Code Execution Notes

**How to feed this spec to Claude Code:**

1. Open terminal in `D:\Projects\waggle-os`
2. Run: `claude`
3. Paste: "Read `docs/DOCK-REFACTOR-SPEC.md` and implement Phase 1 (foundation). Create `dock-tiers.ts` and modify `useOnboarding.ts` exactly as specified."
4. After Phase 1 is confirmed working, proceed: "Now implement Phase 2 — rewrite Dock.tsx and create DockTray.tsx as specified in the doc."
5. Continue phase by phase.

**Why phase-by-phase, not all at once:**
- Each phase can be tested independently
- If Claude Code makes an error, the blast radius is contained
- You can review and adjust after each phase before proceeding
- The app remains functional between phases

**Things Claude Code will handle well:**
- TypeScript interfaces and type definitions
- Component structure and props
- State management and localStorage
- Framer Motion animations (it knows the patterns from the existing code)
- Import/export wiring

**Things to watch for (review carefully):**
- DockTray positioning math (centered above parent icon, edge clamping)
- z-index layering between tray and dock
- Click-outside detection not interfering with dock itself
- Onboarding step shift — easy to get off-by-one errors
- Tier config completeness — verify every existing feature has a home

---

*End of spec. Reference prototype: `docs/dock-v2-macos.html`*
