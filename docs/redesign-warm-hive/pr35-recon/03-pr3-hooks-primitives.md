# PR3.5 Recon — What PR3 actually left behind (hooks + primitives)

> Audit, not trust. Every row below was verified against source on branch
> `feature/warm-hive-pr3` @ `dac7b696`. Where the handoff was imprecise it is
> called out. Repo root: `D:/Projects/waggle-os`.

---

## TL;DR — claimed primitives: exist vs must-build

**The three "Memory-Trust primitives" the handoff named — `ConfidenceBadge`,
`EvidenceChip`, `DetailDrawer` — ALL EXIST and are already in production use.**
The handoff's only error was the *location*: they are NOT in `os/warm/`, they live
in `components/ui/` and predate PR3 (created in the earlier UX-refactor arc, commit
`afe96355` "Phase 2B-FE.1 — Memory Center DS foundation"). PR3 added the warm
provenance layer (`ProvenanceLine`, `ActivityStream`) on top.

So PR3.5 **reuses**, does not build-from-scratch, the trust primitives. What is
genuinely **missing / static** is the *wiring*: the Workspace "What Waggle knows"
fact rows and the Chat activity step rows are visual-only (no `onClick`, no
provenance plumbed), and the chat `StepContentBlock` type has no `source` field —
that is the real PR3.5 work (the "frame.source 1-field server projection" keystone).

---

## TRUTH TABLE — claim → real state → file:line

| # | Handoff claim | Real state | Evidence (file:line) |
|---|---|---|---|
| 1 | "ConfidenceBadge / EvidenceChip / DetailDrawer primitives **ready** [implied: in `warm/`]" | **TRUE but mislocated.** All three exist in `components/ui/`, NOT `os/warm/`. Pre-date PR3 (commit `afe96355`). Already consumed by Memory Center. Do NOT rebuild. | `apps/web/src/components/ui/confidence-badge.tsx:22` (export `ConfidenceBadge`)<br>`apps/web/src/components/ui/evidence-chip.tsx:16` (export `EvidenceChip`)<br>`apps/web/src/components/ui/detail-drawer.tsx:22` (export `DetailDrawer`)<br>Bonus: `apps/web/src/components/ui/evidence-panel.tsx` (`EvidencePanel`) also exists |
| 1b | (warm/ dir listing) | The PR3 `warm/` set is 14 atoms; the trust primitives are NOT among them. warm/ has the provenance *renderer* (`ProvenanceLine`) + the chat *container* (`ActivityStream`). | `apps/web/src/components/os/warm/index.ts:7-20` |
| 2a | "clickable fact rows" (Workspace "What Waggle knows", PR3 Phase C2) | **FALSE — STATIC.** The `<li>` rows render `HexCheckTile + text + when`. No `onClick`, no anchor, no role=button, no cursor affordance. Pure display. | `apps/web/src/components/os/apps/WorkspaceDesktopApp.tsx:160-168` (the `facts.map` `<li>` has no handler). Header comment at `:146-149` explicitly flags `frame.source` is not yet projected onto these rows ("the PR3.5 keystone"). |
| 2b | "clickable step rows" (Chat activity steps) | **FALSE — STATIC.** `ActivityStream` renders each step as a `<li>` (`DotLive + text + optional ProvenanceLine`). The step `<li>` itself has no `onClick`. Provenance is only rendered `if (s.provenance)` — and the Chat caller never supplies it. | `apps/web/src/components/os/warm/ActivityStream.tsx:62-74` (step `<li>` static; provenance gated on `s.provenance`)<br>`apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx:30-33` (maps only `tone`+`text` — **omits `provenance` entirely**) |
| 2c | (why chat steps can't show provenance yet) | **Root blocker.** `StepContentBlock` has no `source`/`provenance` field. So even if BlockRenderer wanted to pass provenance, the data isn't on the block. Same shape as the Workspace keystone — both need `frame.source` server projection. | `apps/web/src/lib/types.ts:474-479` (`StepContentBlock` = `{type,blockId,description,status}` — no source) |
| 3 | "intact J08 banner" | **TRUE.** Renders on Home Cockpit; gated `needsReviewCount > 0`; `role="alert"`; deep-links to Memory Center via `waggle:open-app` with `filter:'unreviewed'`. Wiring intact end-to-end (route re-stash in `MemoryRoute.tsx`, consumed by `MemoryCenterTab`). | Render: `apps/web/src/components/os/apps/HomeCockpit.tsx:496-515`<br>Handler `openMemoryReview`: `:477-481`<br>Count source: `briefing.needsReviewCount` (`lib/types.ts:303`)<br>Consumer: `MemoryCenterTab.tsx:84` |
| 4 | "ProvenanceLine.tsx" | **EXISTS** (PR3 Phase 0, commit `0b15b91f`). Thin recolor of `EvidenceChip` to the intel/violet semantic. Full API below. | `apps/web/src/components/os/warm/ProvenanceLine.tsx:19` |
| 5 | "warm/index.ts + tones.ts" | **EXIST.** Full exports + tone vocab below. | `apps/web/src/components/os/warm/index.ts`, `tones.ts` |

---

## ProvenanceLine — full API (verified, `ProvenanceLine.tsx:4-32`)

```ts
interface ProvenanceLineProps {
  source: string;                 // REQUIRED. e.g. "web · mem0.ai" or "Claude Code"
  when?: string;                  // optional relative time, e.g. "2h ago"
  onClick?: () => void;           // PR3.5 trace hook — makes the pill clickable into memory detail
  className?: string;
}
export function ProvenanceLine({ source, when, onClick, className }): JSX.Element
```

**Render:** builds `label = \`⬡ ${source}${when ? \` · ${when}\` : ''}\``, then
delegates to `<EvidenceChip label title={label} onClick className=...>`. The chip is
recolored via `font-mono text-[var(--intel)] border-[var(--intel-wash)] bg-transparent`.

- **Clickable behavior:** when `onClick` is supplied, `EvidenceChip` renders a real
  `<button type="button">` with `hover:bg-muted hover:text-foreground` (`evidence-chip.tsx:19-25`);
  without it, a static `<span>` (`:26-30`). So `ProvenanceLine` is click-ready **iff the
  caller passes `onClick`** — the primitive supports it; the call sites don't use it yet.
- **`source` absent → date-only:** `source` is a **required** prop, so the pill cannot
  be rendered "date-only" via ProvenanceLine. The actual date-only fallback today is done
  by **not rendering ProvenanceLine at all** and showing a plain mono date instead — see
  the Workspace fact rows (`WorkspaceDesktopApp.tsx:165`, a bare
  `<div class="font-mono text-[10.5px]">{f.when}</div>`). The deliberate design note: PR3
  shows the REAL date only and **never fabricates a `source`** until `frame.source` is
  projected (`WorkspaceDesktopApp.tsx:146-149`). **PR3.5 implication:** to light up the
  ⬡ pill, project `frame.source` server-side, then swap the bare date `<div>` for
  `<ProvenanceLine source={...} when={f.when} onClick={...} />`.

---

## Tone / token vocabulary (for new Memory-Trust primitives)

### `os/warm/tones.ts` — `WarmTone` union + maps (`tones.ts:7-36`)

```ts
type WarmTone = 'work' | 'intel' | 'healthy' | 'attention' | 'risk' | 'honey' | 'neutral';

TONE_COLOR: Record<WarmTone, string>   // foreground/dot color
  work→var(--work)  intel→var(--intel)  healthy→var(--healthy)
  attention→var(--attention)  risk→var(--risk)  honey→var(--honey)
  neutral→var(--text-muted)

TONE_WASH: Record<WarmTone, string>    // tinted background
  work→var(--work-wash)  intel→var(--intel-wash)  healthy→var(--healthy-wash)
  attention→var(--honey-wash)  risk→var(--risk-wash)  honey→var(--honey-wash)
  neutral→var(--surface-3)
```

> Note the asymmetry: `attention` foreground = `--attention`, but its wash = `--honey-wash`
> (not `--attention-wash`). Match this when building a trust primitive on the attention tone.

### CSS tokens — defined in BOTH themes (`apps/web/src/index.css`)

| Token | Dark (`:162-168`) | Light (`:298-304`) | Semantic |
|---|---|---|---|
| `--intel` | `#b196dd` | `#7d57b8` | **violet — intelligence / memory / provenance** (the trust color) |
| `--intel-wash` | `rgba(177,150,221,.12)` | `rgba(125,87,184,.10)` | violet wash |
| `--work` / `--work-wash` | desaturated blue | — | task/work |
| `--healthy` / `--healthy-wash` | desaturated green | — | OK/done |
| `--attention` | (status block `:102+`) | — | needs-attention (uses `--honey-wash`) |
| `--risk` / `--risk-wash` | — | — | blocked/conflict |
| `--honey` / `--honey-wash` | — | — | brand accent |

The `confidence-badge` uses a *different* token family — Hive DS `--sem-*`
(`--sem-healthy` / `--sem-attention` / `--sem-risk`, `confidence-badge.tsx:17-19`) — not
the warm `--intel/--work/...`. **PR3.5 consistency call:** decide whether new
Memory-Trust atoms align to the warm `--intel` family (provenance) or the `--sem-*`
family (confidence bands). They currently coexist.

---

## warm/index.ts — full export list (`index.ts:7-20`)

```
HexAvatar · SectionLabel · DotLive · ProvenanceLine · RunChip (+RunChipProps)
IconTile · HexCheckTile · StreakChip · ModelPill · OvernightHero · AskBar
ActivityStream (+ActivityStep) · InlineApprovalCard · TONE_COLOR · TONE_WASH (+WarmTone)
```

14 atoms. **Not present (and not the warm dir's job per its header doc, `index.ts:3-6`):**
ConfidenceBadge / EvidenceChip / DetailDrawer — "Generic, always-labeled primitives
stay in `components/ui/`."

---

## Where the Memory surfaces live today (screen 19 target map)

| Surface | File | Notes for PR3.5 |
|---|---|---|
| **Memory Center (standalone screen, S04)** | `apps/web/src/components/os/apps/MemoryCenterApp.tsx` | The full screen. **Two-mind split** ("About you" = personal, "About this work" = workspace) + 7 views: `memories · timeline · graph · harvest · weaver · wiki · evolution` (`MEMORY_VIEWS`, `:36-38`). Controlled component (route owns mind+view via URL). This is what **screen 19 extends or replaces.** |
| **Per-mind memory list (the reusable core)** | `apps/web/src/components/os/apps/memory/MemoryCenterTab.tsx` | Parameterized by `mind` + `workspaceId`. **Already consumes the trust primitives:** `DetailDrawer` (`:337`), `ConfidenceBadge` (`:342`), `EvidencePanel`+source/evidence (`:406`), `MemoryCard` grid (`:323-331`, each card `onClick={() => openDetail(m)}`). This is the proven pattern PR3.5 should match. |
| **Workspace Memory tab** | `apps/web/src/components/os/apps/WorkspaceDesktopApp.tsx:701-705` | Tab `id:'memory'` (`TABS`, `:73`) embeds the SAME `<MemoryCenterTab mind="workspace" workspaceId consumeDeepLinks={false} />`. So the Workspace memory tab and the Memory Center already share one component — change once, both update. |
| **Route wrapper** | `apps/web/src/routes/MemoryRoute.tsx` | `/memory` ≡ `/memory/personal`; J08 banner target; re-stashes `?filter=` deep link. |
| **Memory card row** | `apps/web/src/components/os/apps/memory/MemoryCard.tsx` | Individual memory row component (grep-confirmed it references ConfidenceBadge family). |
| **J08 needs-review banner** | `apps/web/src/components/os/apps/HomeCockpit.tsx:496-515` | Already wired; deep-links here. |
| **Import reminder banner** | `apps/web/src/components/os/apps/memory/ImportReminderBanner.tsx` | Secondary banner on the Memory Center. |

---

## PR3.5 build implications (derived from the truth table)

1. **Reuse, don't rebuild** the trust primitives (`ui/confidence-badge`,
   `ui/evidence-chip`, `ui/detail-drawer`, `ui/evidence-panel`) — they exist and ship today.
2. **The keystone is the data, not the UI:** project `frame.source` (+ `when`) server-side
   so the Workspace fact rows and Chat steps can carry real provenance.
3. **Make the rows clickable** by (a) adding `onClick` to the Workspace fact `<li>`
   (`WorkspaceDesktopApp.tsx:160`) → open the memory detail drawer, (b) extending
   `StepContentBlock` (`types.ts:474`) with an optional `source` and threading it through
   `BlockRenderer.tsx:30-33` into `ActivityStep.provenance`.
4. **`ProvenanceLine` already supports `onClick`** (→ `EvidenceChip` renders a `<button>`);
   the only gap is call sites passing the handler + a real `source`.
5. **Token consistency decision** pending: warm `--intel` family (provenance) vs Hive DS
   `--sem-*` family (confidence). Both live; pick one story for screen 19.
