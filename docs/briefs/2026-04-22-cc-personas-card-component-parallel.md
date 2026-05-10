# CC-2 Brief — Personas Card Component (Parallel Terminal)

**Author:** PM
**For:** Claude Code (waggle-os repo, second terminal, parallel to CC-1 Sprint 10 close-out)
**Date:** 2026-04-22
**Task:** Task #18 (Regen Brand-Bee personas card) implementation phase
**Priority:** Medium (non-blocking za Sprint 10; unblocks landing implementation post-launch prep)
**Budget:** $0 (pure local implementation, zero API spend)
**Wall-clock:** 2-4h CC time

---

## Critical boundary — CC-1 non-interference

CC-1 je aktivan na Sprint 10 parallel close-out (Task 1.1 live-run + Task 1.5 Phase 2+3). CC-1 radi na:
- `packages/server/src/benchmarks/**` — benchmark harness
- `packages/memory-mcp/**` ili `packages/core/**` — hive-mind ClaudeAdapter
- `preflight-results/**` — results artifacts
- `sessions/**` — exit pings

**CC-2 MORA da ostane u `apps/www/**` tree-u.** Ne dodiruj `packages/`, `preflight-results/`, `sessions/`, ili bilo koji drugi folder van `apps/www/`. Ako trebaš shared utility (npr. type definicija iz `packages/core`), importuj preko postojeće path mapping-a, ne kreiraj novu zavisnost.

Specifično dozvoljeni paths za write:
- `apps/www/src/components/**`
- `apps/www/src/data/**`
- `apps/www/src/app/design/personas/**`
- `apps/www/src/types/**` (ako ne postoji već)
- `apps/www/__tests__/**` ili equivalent test folder koji repo koristi

---

## Scope

Implementiraj `BrandPersonasCard` React komponentu sa svim downstream implementacionim implikacijama iz `decisions/2026-04-22-landing-personas-ia-locked.md` Decision 3. Komponenta mora biti spreman za landing integration + reusable za buduće product contexts (onboarding, pricing section snippets) kroz `variant` prop.

Svi copy strings dolaze iz ratifikovanog izvora — NE reinterpretiraj, NE polish, NE rewriting.

---

## Authoritative source files (CC čita, ne menja)

1. **Component contract:** `D:\Projects\PM-Waggle-OS\briefs\2026-04-22-brand-bee-personas-card-spec.md` — scaffold spec (updated 2026-04-22 sa ratifikovanim copy-om)
2. **Copy LOCKED:** `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-personas-card-copy-locked.md` — 13 canonical role titles + JTBD strings
3. **Landing IA LOCKED:** `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-landing-personas-ia-locked.md` — component contract implikacije (variant prop, onTileHover, CTA prop, reusable data source)
4. **Asset canon:** `D:\Projects\waggle-os\apps\www\public\brand\bee-*-dark.png` (11 canon + 2 pending from Task #24)
5. **Design system tokens:** `D:\Projects\waggle-os\apps\www\src\styles\globals.css` (already contains Hive DS tokens per 2026-04-20 setup)

---

## Deliverables

### 1. Data source — `apps/www/src/data/personas.ts`

TypeScript module koji izvozi `personas` const kao read-only tuple sa 13 entry-ja. Copy MUST come verbatim from `decisions/2026-04-22-personas-card-copy-locked.md` canonical table.

```ts
export interface Persona {
  slug: PersonaSlug;
  title: string;         // "The Hunter"
  role: string;          // "Finds the source you forgot you saved."
  alt: string;           // accessible label for img — "Waggle {title} bee mascot"
  imagePath: string;     // "/brand/bee-hunter-dark.png"
  order: number;         // 1-13, canonical reading order
}

export type PersonaSlug =
  | "hunter" | "researcher" | "analyst" | "connector" | "architect"
  | "builder" | "writer" | "orchestrator" | "marketer" | "team"
  | "celebrating" | "confused" | "sleeping";

export const personas: readonly Persona[] = [
  // 13 entries, ordering from decision log
] as const;
```

Slug mapping za image path:
- `hunter` → `/brand/bee-hunter-dark.png`
- `researcher` → `/brand/bee-researcher-dark.png`
- `analyst` → `/brand/bee-analyst-dark.png`
- `connector` → `/brand/bee-connector-dark.png`
- `architect` → `/brand/bee-architect-dark.png`
- `builder` → `/brand/bee-builder-dark.png`
- `writer` → `/brand/bee-writer-dark.png`  ← **placeholder state until Task #24 deploy**
- `orchestrator` → `/brand/bee-orchestrator-dark.png`
- `marketer` → `/brand/bee-marketer-dark.png`
- `team` → `/brand/bee-team-dark.png`
- `celebrating` → `/brand/bee-celebrating-dark.png`
- `confused` → `/brand/bee-confused-dark.png`
- `sleeping` → `/brand/bee-sleeping-dark.png`  ← **placeholder state until Task #24 deploy**

### 2. Component — `apps/www/src/components/BrandPersonasCard.tsx`

Functional React component, default export, zero required props.

```ts
export interface BrandPersonasCardProps {
  heading?: string;                                     // default "The Waggle Hive"
  subtitle?: string;                                    // default: see below
  showFillerTiles?: boolean;                            // default true
  variant?: "landing" | "compact";                      // default "landing"
  onTileHover?: (slug: PersonaSlug) => void;            // default no-op
  onPersonaClick?: (slug: PersonaSlug) => void;         // default no-op
  cta?: React.ReactNode;                                // optional CTA slot rendered below grid
}
```

Default subtitle: `"Thirteen personas for the work your AI does while you sleep."`

**Variant behavior:**
- `"landing"` — full 13-tile grid, responsive (4×4 + 3 fillers on ≥1024px, 3×5 on 768-1023px, 2×7 on <768px), includes heading + subtitle + CTA slot
- `"compact"` — stub implementation sa TypeScript-valid return ali renderuje TODO placeholder div. NE implementiraj puni compact layout u ovom sprintu; samo interface plumbing. Dodaj JSDoc `@todo compact variant scaffolding — implement in future sprint`.

**Tile anatomy (verbatim iz scaffold spec-a):**
- Background: hive-gradient `#0f1218` → `#080a0f`, 1px border `#1a1e27`
- Hover: border transition to `#e5a000`, scale 1.02, 200ms ease-out, respects `prefers-reduced-motion`
- Asset render: 256×256 area, centered, object-fit contain, `next/image` ako se koristi u repo-u
- Role title: Inter 16/600, color `#f5b731`
- Role line: Inter 13/400, color `#a0a3ad`

**Filler tiles:** 3 angular positions sa `hex-texture-dark.png` at 40% opacity, no copy, aria-hidden.

**Accessibility:**
- Grid je `<ul role="list">` sa `<li>` tile-ovima
- Each tile je `<figure>` sa `<img>` + `<figcaption>`
- Alt text iz `persona.alt` field
- `:focus-visible` outline `#e5a000` 2px za keyboard korisnike
- `aria-label` na CTA slot ako je prosleđen

**Placeholder handling za pending asseti (writer, sleeping):**

Proveri postojeći file state asset-a pri buildu. Ako asset ne postoji (ili je fallback detekcija on-mount), render fallback state:
- Tile zadržava strukturu i copy
- Umesto 256×256 asset-a, prikazi centered `<div>` sa hex-texture background-om i honey-400 "●" dot placeholder-om, 48×48 centered
- Dodaj `data-placeholder="true"` attribute za lakše testiranje

Ovo treba da radi korektno dok Task #24 ne CLOSE i writer + sleeping asseti ne budu deploy-ovani. Posle Task #24 CLOSE, placeholder automatski prestaje da se prikazuje bez code change-a (asset postoji → render normal).

### 3. Preview route — `apps/www/src/app/design/personas/page.tsx`

Izolovani preview route za visual QA i hand-off. Renderuje `<BrandPersonasCard variant="landing" />` na full-page hive background (`#08090c`). No header, no footer, no navigation — čista prezentacija.

Dodaj noindex meta tag ako framework podržava (sprečava SEO indeksaciju preview route-a).

### 4. Tests — `apps/www/__tests__/BrandPersonasCard.test.tsx` (ili equivalent repo convention)

Minimum test coverage:
1. Component renders 13 persona tiles + 3 filler tiles by default
2. Each persona tile contains correct title + role copy (check all 13)
3. `onPersonaClick` fired sa pravilnim slug kada se tile klikne
4. `onTileHover` fired sa pravilnim slug na mouseover
5. `cta` prop renders u CTA slot
6. `showFillerTiles={false}` skida filler tiles iz render-a
7. Placeholder state renders za pending asset (mock missing file)
8. Compact variant renders bez error-a (basic smoke test)

Use repo existing test runner (Jest + RTL ako je to standard; vitest ako je to standard). Check `package.json` i `apps/www/package.json` pre nego što odabereš.

### 5. Export hygiene

Dodaj barrel export u `apps/www/src/components/index.ts` (ako postoji) ili kreiraj. Također osiguraj da tip `PersonaSlug` i interface `Persona` budu eksportovani iz `apps/www/src/data/personas.ts` za buduće cross-file use.

---

## Exit criteria

- [ ] `personas.ts` data source committed sa svih 13 canonical entries
- [ ] `BrandPersonasCard.tsx` component fully implemented sa `landing` variant; `compact` variant je stub sa TODO
- [ ] Preview route `/design/personas` renders clean 13-tile grid sa 3 filler-a u browser-u
- [ ] Tests pass sa ≥8 test case-ova covered
- [ ] Placeholder handling verified — writer + sleeping render u placeholder stanju bez JavaScript errora (jer trenutno još uvek imaju white-dominant PNGs; kad Task #24 CLOSE-uje i novi PNGs budu deploy-ovani, placeholder ne bi trebao da se aktivira)
- [ ] `next build` (ili repo equivalent) prolazi bez error-a
- [ ] Exit ping u `sessions/2026-04-22-personas-card-component-exit.md` sa:
  - Preview route screenshot 1024px viewport
  - Test run pass count
  - Build output clean
  - List all files created/modified
  - Placeholder state screenshot (show writer + sleeping u placeholder mode-u)

---

## PM review gate

CC-2 NE commit-uje direktno na main niti ne push-uje na origin. Posle svih exit criteria PASS, CC-2 priprema branch (npr. `feat/personas-card-component`) sa svim izmenama commit-ovanim i posta exit ping. PM review-uje diff, potvrđuje, i daje go-signal za merge + push.

---

## Anti-pattern check

- Ne reinterpretiraj copy — verbatim iz decision log-a
- Ne menjaj scaffold spec layout values (gradient colors, Inter weights, gap, container max-width)
- Ne implementiraj `/bees/<slug>` subpage rute — LOCKED decision je bez subpage-a v1
- Ne uvodi nove dependencies u package.json (sve mora raditi sa postojećim Tailwind + React + next/image stack-om)
- Ne dodiruj fajlove van `apps/www/` tree-a
- Ne commit-uj bez PM review-a
- Ne push na origin autonomno
- Ne scope-creepuj u pricing copy, hero copy, ili druge landing sekcije — samo personas card

---

## Escalation triggers

1. **Build breakage** — IMMEDIATE PM ping, stash uncommitted work
2. **Test failure koja ne može da se reši u ≤30 min** — PM ping, opisi fail
3. **Dependency missing** (npr. Tailwind token nije pronađen) — PM ping, ne dodavaj new dependency autonomously
4. **Asset path mismatch** (npr. PNG fajlovi ne postoje na očekivanim putanjama) — PM ping, ne kreiraj stub PNG-ove
5. **TypeScript error koju copy-from-brief ne rešava** — PM ping
6. **Waggle-os CC-1 touch any file CC-2 just modified** (git conflict) — STOP, PM ping, ne force-resolve

---

## Related

- `briefs/2026-04-22-brand-bee-personas-card-spec.md` — scaffold spec (layout, tile anatomy)
- `decisions/2026-04-22-personas-card-copy-locked.md` — copy LOCKED
- `decisions/2026-04-22-landing-personas-ia-locked.md` — component contract implikacije (Decision 3)
- `briefs/2026-04-22-cc-bee-regen-execution.md` — sibling CC brief (post-Sprint-10 execution)
- `.auto-memory/feedback_repo_access_boundaries.md` — waggle-os write governance

---

**End of brief. CC-2 autonoman do exit ping-a. PM review gate ispred merge-a. No cross-talk sa CC-1.**
