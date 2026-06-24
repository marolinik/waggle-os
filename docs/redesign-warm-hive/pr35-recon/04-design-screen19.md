# Screen 19 — Memory Trust · Build-Ready Design Contract

> Source of truth: `docs/design_handoff_waggle_app/design-files/screens/memory-trust.html`
> (authoritative mock, read in full), `screenshots/19-memory-trust.png` (rendered),
> `DESIGN_POV.md` #1, `SCREENS.md` (no 01–18 entry — this screen is POV-driven, #19).
> All copy below is **verbatim** from the mock. All class names / colors / spacing are
> quoted from the HTML `<style>` block.

**DESIGN_POV #1 mandate (verbatim, `DESIGN_POV.md:12-34`):** "A persistent-memory
product's #1 churn driver isn't *forgetting* — it's **remembering the wrong thing**…"
The designed response is a *Memory Trust* layer with four primitives: **confidence +
freshness** on every memory; **Forget** (real removal from recall) and **Correct**
(inline; dependents re-checked); **Stale review** prompts; **"Why did you do that?"
trace**. It is "also a moat… auditability, right-to-correct, EU AI Act alignment."
POV §How-to-use: "wire it to the real memory store (confidence/freshness/forget/correct/
trace are all backed by data the substrate already has or can derive)."

---

## 1. Header / Views (the segmented control)

The page is a single full-height column (`body { height:100vh; overflow:hidden;
display:flex; flex-direction:column }`). A sticky control bar (`.controls`, blurred
`backdrop-filter:blur(10px)`, `border-bottom:1px solid var(--line-soft)`) holds a
**2-button segmented switch** that toggles between two full views.

| Element | Verbatim copy / spec |
|---|---|
| Eyebrow label (`.lab`, mono 10.5px, `--text-dim`, uppercase) | `Memory Trust · view` |
| Segment button 1 (`.seg button.on` — **active by default**) | `Manage memory` |
| Segment button 2 (`.seg button`) | `Why did you do that?` |
| Active-view label (`.vlabel`, swaps on toggle) — Manage | `<b>Manage</b> — forget, correct, confirm; see confidence & freshness` |
| Active-view label — Why | `<b>Why-trace</b> — every action explains itself` |
| Right control (`.tbtn`) | Theme toggle `☾`/`☀` |

**Segment active state:** `.seg button.on { background:var(--honey); color:#1a1407; }`
(honey fill + dark-ink text — the canonical "selected" treatment). Inactive buttons are
`background:transparent; color:var(--text-muted)`. Segment container `.seg` is a
`var(--surface-2)` pill with `border:1px solid var(--line-soft)`, `border-radius:10px`,
3px inner padding.

**Two VIEW modes:**
- **A — "Manage memory"** (`.view[data-view="manage"]`, on by default — this is what the
  screenshot shows): editorial hero → 4 stat cards → search+filters → memory rows → trust
  principle footnote.
- **B — "Why did you do that?"** (`.view[data-view="why"]`): editorial hero → a single
  **trace card** (goal→recall→checks→action chain) → trust principle footnote. (See §6.)

Toggle JS: clicking a segment button sets `.on`, shows the matching `.view`, swaps the
`.vlabel` HTML, and resets `.stage` scroll to 0. Stage content is centered in
`.wrap { max-width:920px; margin:0 auto; padding:30px 32px 70px }`.

---

## 2. Editorial Hero

### View A — Manage (`.head`, margin-bottom 22px)
- **Eyebrow** (`.eyebrow`, mono 11px, `letter-spacing:.14em`, uppercase, `color:var(--honey)`,
  with a 20px honey rule `::before`): `Trust · the thing that makes you stay`
- **H1** (`.head h1`, 28px / weight 650 / `letter-spacing:-0.02em`; `<em>` is **honey,
  non-italic** — `h1 em { font-style:normal; color:var(--honey) }`):
  `Memory you can ` + **`correct, age, and forget.`** ← the phrase **"correct, age, and
  forget."** gets the honey accent (everything after "Memory you can " is in `<em>`).
- **Body** (`.head p`, 15px, `--text-muted`, `line-height:1.55`, `max-width:64ch`; `<b>` =
  `--text-2`): verbatim —
  > A memory that only grows is a liability. Waggle shows you **how sure it is**, **how
  > fresh it is**, and **where it came from** — and lets you fix or forget anything.
  > You're always in control of what the hive believes.

  (Honey-emphasis `<b>` spans: "how sure it is", "how fresh it is", "where it came from".)

### View B — Why
- **Eyebrow:** `Provenance · accountability`
- **H1** (honey `<em>` = the quoted question):
  `Ask the agent ` + **`"why did you do that?"`**
- **Body** (`<b>` spans bolded): verbatim —
  > Any action an agent takes can be traced back to the exact memories and sources behind
  > it — so a wrong move is **diagnosable, not mysterious**. If a bad memory caused it,
  > fix the memory right from the trace.

---

## 3. Stat Cards — "trust summary bar" (`.tsum`, View A only)

4-up grid: `grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px`. Collapses
to `1fr 1fr` under `max-width:820px`. Each card `.ts`: `padding:16px`, `border-radius:
var(--r-lg)` (18px), `border:1px solid var(--line-soft)`, `background:var(--surface)`.
Value `.ts .v` = 24px / weight 750 / `letter-spacing:-0.02em`; label `.ts .l` = 11.5px,
`--text-muted`, `margin-top:5px`. **Warn variant** `.ts.warn`: `border-color:
color-mix(in srgb,var(--attention) 35%,transparent)` + value tinted `--attention`.

| # | Value (verbatim) | Label (verbatim) | Color of value | Card variant |
|---|---|---|---|---|
| 1 | `142` | `Memories in this hive` | default `--text` (white/ink) | `.ts` |
| 2 | `128` | `High confidence & fresh` | **green** — `style="color:var(--healthy)"` (`#6cb78c`) | `.ts` |
| 3 | `9` | `Stale · worth a review` | **honey** — `--attention` (`#e9a52c`) | `.ts.warn` |
| 4 | `3` | `Awaiting your confirm` | **honey** — `--attention` (`#e9a52c`) | `.ts.warn` |

Color order = **white / green / honey / honey** (matches the brief). Cards 3 & 4 also get
the honey-tinted warn border.

---

## 4. Search + Filters (`.toolbar`, View A only)

`.toolbar { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap }`.

**Search bar** (`.search` — flex:1, min-width:200px, `padding:9px 14px`, `border-radius:
11px`, `border:1px solid var(--line)`, `background:var(--surface)`):
- Leading magnifier `<svg>` (circle + handle), 16px, `stroke:var(--text-dim)`,
  `stroke-width:1.9`, no fill.
- Input placeholder (verbatim): `Search what Waggle knows… or ask it to forget something`
  — 14px, transparent bg, `color:var(--text)`.

**Filter chips** (`.filt`, 12.5px / weight 600, `padding:8px 13px`, `border-radius:9px`,
`border:1px solid var(--line-soft)`, `background:var(--surface)`):

| Chip (verbatim) | State |
|---|---|
| `All` | **active** — `.filt.on` |
| `Stale` | default |
| `Needs confirm` | default |
| `Forgotten` | default |

**Active chip** `.filt.on`: `color:var(--text); border-color:var(--honey-line);
background:var(--honey-wash)` (honey-wash fill + honey-line border). Hover `.filt:hover`
just lifts `color` to `--text`. (Note: the warm primitive set already has chip-like
patterns; the active = honey-wash + honey-line treatment must be reused.)

---

## 5. Memory ROW anatomy (`.mem`, the core component — repeated in `.mems` grid)

`.mems { display:grid; gap:10px }`. Each row `.mem`: `border:1px solid var(--line-soft)`,
`background:var(--surface)`, `border-radius:var(--r-lg)` (18px), `padding:16px 18px`,
`transition:.15s`. **State border variants:**
- `.mem.stale` → `border-color:color-mix(in srgb,var(--attention) 30%,var(--line-soft))`
- `.mem.disputed` → `border-color:color-mix(in srgb,var(--risk) 30%,var(--line-soft));
  opacity:.92`

Layout `.mem .top { display:flex; align-items:flex-start; gap:13px }` — three columns:
**[confidence ring] [body] [actions]**.

### 5a. Confidence ring (`.conf`, width 42px, flex:none, centered)
- Ring `.ring`: `width/height 38px`, `border-radius:999px`, `display:grid; place-items:
  center`, mono 11px / weight 600. **Both the number color AND the 2px ring border come
  from `confColor(c)`** (inline `style="color:${confColor(c)};border:2px solid
  ${confColor(c)}"`).
- **Ring color logic** (`confColor(c)` JS, verbatim):
  - `c >= 85` → `var(--healthy)` (sage green)
  - `c >= 60` → `var(--attention)` (honey)
  - `else` (`< 60`) → `var(--risk)` (terracotta)
- Caption `.cl` below ring: literal text `conf` (rendered uppercase via
  `text-transform:uppercase`), 9px mono, `--text-dim`, `margin-top:4px`,
  `letter-spacing:.06em`. → reads **`CONF`**.

### 5b. Body (`.mbody`, flex:1)
- **Fact text** `.mtext`: 14.5px, `line-height:1.5`, `color:var(--text)`. **`<b>` inside
  gets weight 650** — this is the honey-free *bold* emphasis on the key phrase (NOT
  honey-colored; it's bold weight only). Disputed rows strike through: `.mem.disputed
  .mtext { text-decoration:line-through; text-decoration-color:color-mix(in srgb,
  var(--risk) 60%,transparent); color:var(--text-muted) }`.
- **Provenance line** `.prov` (`margin-top:8px`, flex-wrap, `gap:7px 14px`, mono 10.5px,
  `color:var(--text-dim)`). Format = three segments:
  `⬡ <id>`  ·  `source: <src>`  ·  `● <freshness>`
  - ID segment: `<span class="src">⬡ ${m.id}</span>` — `.prov .src { color:var(--intel) }`
    (muted violet) — e.g. `⬡ M-204`.
  - Source segment: plain `source: ${m.src}` in `--text-dim` — e.g. `source: chat · Tue`.
  - Freshness segment: `● ` + label, colored by `.fresh.ok`→`var(--healthy)` (green) or
    `.fresh.old`→`var(--attention)` (honey). Fresh label = `fresh`; old label =
    `aging — last seen 6w ago`.

### 5c. Action buttons (`.acts`, flex:none, gap:6px)
Two square icon buttons `.mact` (30×30px, `border-radius:8px`, `border:1px solid
var(--line-soft)`, `background:var(--surface-2)`, `color:var(--text-muted)`; icon svg 15px
`stroke:currentColor` `stroke-width:1.8`):
1. **Edit / correct** — `title="Edit / correct"`, `data-act="edit"`; pencil icon. Hover
   `.mact:hover { border-color:var(--honey-line); color:var(--honey) }`. Click → toast
   `Correcting <id> — opens an inline editor`.
2. **Forget / delete** — `.mact.danger`, `title="Forget this"`, `data-act="forget"`; trash
   icon. Danger hover `.mact.danger:hover { border-color:color-mix(in srgb,var(--risk)
   45%,transparent); color:var(--risk) }`. Click → row animates out (`opacity:0;
   translateX(-12px)`, 300ms, then removed) + toast `Forgotten <id> — removed from recall`.

### 5d. Inline sub-banners (conditional, render inside `.mbody`)
- **Corrected banner** (`.corrected`, disputed rows that carry `m.corrected`): healthy-wash
  pill — `background:var(--healthy-wash); border:1px solid color-mix(in srgb,var(--healthy)
  30%,transparent)`, 12.5px `--text-2`, green check svg (`stroke:var(--healthy)`). Renders
  `<b>{before "→"}</b> → {after "→"}`.
- **Stale review banner** (`.stalebanner`, on `.mem.stale`): honey-wash pill —
  `background:var(--honey-wash); border:1px solid var(--honey-line)`, clock svg
  (`stroke:var(--honey)`). Text (verbatim): `This is 6 weeks old — still true?` Right-aligned
  button pair `.sp`:
  - `.sbtn.go` (`background:var(--honey); color:#1a1407`) — verbatim `Still true`
    (`data-act="confirm"`). Click → banner morphs into a `.corrected` "Confirmed still true ·
    freshness reset" pill + toast `Confirmed <id> — freshness reset`.
  - `.sbtn.ghost` (`background:var(--surface); color:var(--text-2); border:var(--line-strong)`)
    — verbatim `Forget` (`data-act="forget"`).

### 5e. Seed dataset (the 5 demo rows — verbatim `mems[]`)
| id | fact text (`<b>` = bold phrase) | conf | ring color | src | fresh | state |
|---|---|---|---|---|---|---|
| `M-204` | Mara wants market work to **lead with the regulated-industries angle**. | 94 | green | `chat · Tue` | fresh | ok |
| `M-198` | **Mem0** is cloud-only and raised prices ~15% in March. | 88 | green | `web · mem0.ai` | fresh | ok |
| `M-141` | The Q3 launch date is **September 12**. | 61 | honey | `chat · 6 weeks ago` | old | **stale** (shows stale banner) |
| `M-088` | Mara prefers **Slack over email** for updates. | 47 | terracotta | `inferred · once` | old | **disputed** (strikethrough + corrected banner: `Corrected by you → prefers a daily digest, not Slack pings.`) |
| `M-052` | Primary competitor is **Letta**. | 90 | green | `teardown.md` | fresh | ok |

---

## 6. "Why did you do that?" Trace view (View B, `.trace`)

A single card: `border:1px solid var(--line)`, `border-radius:var(--r-xl)` (26px),
`background:var(--bg-2)`, `overflow:hidden`. Three regions: **header → vertical chain →
action footer**, then the trust principle footnote below.

### 6a. Trace header (`.th`, `padding:18px 22px`, bottom border)
- **Hex avatar** `.ti.hex` (34×38px, honey gradient `linear-gradient(150deg,
  var(--honey-bright),var(--honey-deep))`, dark-ink `paper-plane`/send svg). → reuse warm
  `HexAvatar` primitive.
- Title `<b>` 15.5px/650 (verbatim): `Drafted the board brief around "regulated industries"`
- Subtitle `.sub` 12px `--text-muted` (verbatim): `Deck-builder · 18m ago · Q2 Board Deck`
- `.when` (mono 11px `--text-dim`, margin-left:auto): `trace #a1f9`

### 6b. Trace chain (`.tchain`, `padding:8px 22px 18px`) — `.tnode` steps
Each node is a 2-col grid `24px 1fr` with a **vertical connector line** drawn via
`.tnode::before { position:absolute; left:11px; top:34px; bottom:-14px; width:1.5px;
background:var(--line) }` (suppressed on `:last-child`). Each `.tdot` (24px circle,
colored per step, dark-ink svg `stroke:#1a1407 stroke-width:2.4`):

| # | dot color | title `<b>` (13.5px/600) | body `.tc p` (13px `--text-muted`) — verbatim |
|---|---|---|---|
| 1 | `var(--intel)` (violet, arrow icon) | `Goal received` | You asked: `"tighten the board narrative."` (the quote in `.mono`) |
| 2 | `var(--honey)` (check icon) | `Recalled 3 memories` | Strongest was: `⬡ mem #M-204` (`.src` violet) — "Mara wants market work to lead with the regulated-industries angle." + **evidence chip** `.ev`: `confidence 94% · source: chat · Tue · still fresh` |
| 3 | `var(--honey)` (check icon) | `Cross-checked the teardown` | Confirmed 2 of 3 proof points cite customer quotes `⬡ teardown.md` (`.src`) |
| 4 | `var(--healthy)` (green, arrow icon) | `Acted` | Wrote slide 6 around the regulated angle and flagged it for your review. |

`.ev` evidence chip: `font-size:12px; color:var(--text-2); padding:8px 12px; border-radius:
8px; background:var(--surface); border:1px solid var(--line-soft)`. `.src` inline refs =
mono 11px `--intel`. Inline `.mono` quote = mono 11.5px `--text-dim`.

### 6c. Trace action footer (`.traceact`, top border, `background:var(--surface)`,
`padding:16px 22px`, gap:9px) — three buttons `.tbtn2` (12.5px/650, `padding:9px 15px`,
`border-radius:9px`):
1. `.tbtn2.go` (honey fill, `#1a1407` ink) — verbatim `Looks right`
2. `.tbtn2.ghost` (`--surface-2`, `--line-strong` border) — verbatim
   `That memory is wrong → correct it`
3. `.tbtn2.danger` (transparent, risk text + risk-tint border `color-mix(in srgb,
   var(--risk) 35%,transparent)`) — verbatim `Forget #M-204 & redo`

---

## 7. Trust principle footnote (`.principle`, both views)

Shared component below the content: `display:flex; gap:13px; align-items:flex-start;
padding:18px 20px; border-radius:var(--r-lg); background:var(--bg-2); border:1px solid
var(--line-soft)`. Leading 20px svg `stroke:var(--healthy)` (shield/check on View A;
info-circle on View B). Text 13.5px `--text-muted` `line-height:1.6`, `<b>`=`--text`.

- **View A (verbatim):** **Nothing is remembered behind your back.** Every memory is
  inspectable, editable, and forgettable — and forgetting is real: it's removed from recall
  and from anything Waggle says next. Confidence and freshness are shown so the agent (and
  you) can discount what's old or shaky instead of acting on it blindly.
- **View B (verbatim):** **Every agent action keeps its trace.** The chain from goal →
  recalled memories → checks → action is stored with the result, so "why did you do that?"
  always has an answer — and the fix (correct or forget the offending memory) is one click
  from the explanation.

**Toast** (shared, `#toast`): `.toast` bottom-center pill, `background:var(--surface);
border:1px solid var(--healthy); box-shadow:var(--shadow-lg)`, 8px green dot `.td2`
(`background:var(--healthy)`), slides up on `.show` (2400ms auto-dismiss).

---

## 8. Tokens — mock → PR3 warm tokens (1:1, already aligned)

The mock's `waggle.css` tokens are **identical hex** to PR3's warm tokens in
`apps/web/src/index.css` (same names, same dark + light values). **No remapping needed** —
build directly against the CSS vars below.

| Mock var | Hex (dark / light) | PR3 warm token | Used in screen 19 for |
|---|---|---|---|
| `--honey` | `#e9a52c` / `#b57d12` | `--honey` ✓ | segment-on, accent `<em>`, eyebrow, conf 60–84, active filter, go-buttons |
| `--honey-bright` | `#f6c45a` / `#cf932a` | `--honey-bright` ✓ | hex-avatar gradient top |
| `--honey-deep` | `#c07e16` / `#92620a` | `--honey-deep` ✓ | hex-avatar gradient bottom |
| `--honey-wash` | `rgba(233,165,44,.10)` | `--honey-wash` ✓ | active filter bg, stale banner bg |
| `--honey-line` | `rgba(233,165,44,.28)` | `--honey-line` ✓ | active filter border, stale border, hover states |
| `--healthy` | `#6cb78c` / `#3c8a5f` | `--healthy` ✓ | stat #2 green, conf ≥85 ring, fresh●, "Acted" dot, principle icon, toast |
| `--healthy-wash` | `rgba(108,183,140,.12)` | `--healthy-wash` ✓ | corrected banner bg |
| `--attention` | `#e9a52c` / `#b57d12` | `--attention` ✓ | stat #3/#4 honey, conf 60–84 ring, stale border, aging● |
| `--risk` | `#db8068` / `#c0573c` | `--risk` ✓ | conf <60 ring, disputed border/strikethrough, danger buttons |
| `--intel` | `#b196dd` / `#7d57b8` | `--intel` ✓ | `⬡` provenance id, trace `.src` refs, "Goal received" dot |
| Dark-ink on honey | `#1a1407` (mock uses `#1a1407`) | warm light `--primary-foreground: #1a1407` ✓ | text on every honey fill |
| `--surface` / `--surface-2` / `--bg-2` | warm graphite / paper | `--surface` / `--surface-2` / `--bg-2` ✓ | cards, rows, action btns, trace bg |
| `--line` / `--line-soft` / `--line-strong` | warm graphite lines | same ✓ | borders |
| `--text` / `--text-2` / `--text-muted` / `--text-dim` | warm text scale | same ✓ | type hierarchy |
| `--r-lg` 18px / `--r-xl` 26px | radii | same ✓ | cards/rows 18px, trace 26px |
| `--mono` JetBrains Mono / `--sans` Hanken Grotesk | fonts | same ✓ | provenance/conf mono; body sans |

**Reuse existing warm primitives** (`apps/web/src/components/os/warm/`):
- `ProvenanceLine.tsx` — already renders `⬡ source · when` in mono `--intel` (the §5b
  provenance pattern). Extend with a freshness `●` segment + `source:` prefix to match.
- `HexAvatar.tsx` — the §6a honey-gradient hex with dark-ink icon.
- `SectionLabel.tsx` — eyebrow/mono-uppercase labels.
- `DotLive.tsx` — the freshness `●` dot.
- `ModelPill` / `RunChip` / chip patterns — the filter-chip + go-button shapes.

---

## Component inventory (6-line summary)

1. **Header/segmented control** — `Memory Trust · view` eyebrow + 2-tab switch (`Manage memory` default-on honey-fill | `Why did you do that?`) + swapping `.vlabel` + theme toggle, toggling between two full views.
2. **Editorial hero (per view)** — honey eyebrow, 28px H1 with honey `<em>` accent ("correct, age, and forget." / "why did you do that?"), 64ch body with bold spans.
3. **Stat bar (View A)** — 4 cards: 142 white / 128 green / 9 honey-warn / 3 honey-warn, repeat(4,1fr)→2-col @820px.
4. **Toolbar (View A)** — search input ("Search what Waggle knows… or ask it to forget something") + 4 filter chips (All on / Stale / Needs confirm / Forgotten).
5. **Memory row** — 3-col [conf ring (color by ≥85 green / ≥60 honey / <60 terracotta) + CONF] · [bold fact + `⬡ id · source · ● freshness` provenance + optional corrected/stale banner] · [edit + danger-forget icon buttons]; 5 seed rows incl. 1 stale + 1 disputed/strikethrough.
6. **Why-trace (View B)** — hex-avatar header (`trace #a1f9`) + 4-node connector chain (Goal→Recalled→Cross-checked→Acted, dots intel/honey/honey/healthy, evidence chip) + 3-button footer (Looks right / correct it / Forget #M-204 & redo); shared trust-principle footnote + green toast on both views.
