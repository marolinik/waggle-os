# LOCKED — Landing IA Integration for Personas Card

**Ratified by:** Marko Marković
**Date:** 2026-04-22
**Brief source:** `strategy/2026-04-22-landing-personas-integration.md`
**Scope:** Three decision points governing personas card integration into Waggle landing information architecture

---

## Decisions (all ratified per PM preporuka)

### Decision 1 — Landing scroll pozicija personas card-a

**LOCKED:** Personas card positions in the "narrative heart" slot — posle proof/SOTA panel, posle how-it-works cognitive-layer narrative, ispred pricing sekcije.

**Rationale:** User je već video faktički dokaz (benchmark broj) i strukturalnu naraciju (memory + retrieval + wiki). Card služi da se apstraktna teza prevede u konkretan doživljaj upotrebe kroz personifikaciju bee roles. Pozicija izbegava rizik da bee metafora potopi tehničku kredibilnost (što bi se desilo da card sedi bliže hero-u), a takođe koristi card kao most ka pricing sekciji (personas implicitno opravdavaju Teams tier kroz "The Team" persona).

---

### Decision 2 — Deep-dive subpage strategija

**LOCKED:** Bez individual persona subpage rutа u v1 launch-u. Tile-ovi su interaktivni (hover/tap → inline expansion sa 1-2 dodatne rečenice ili mikro-ilustracije unutar istog grid cell-a), ali ne navigiraju na zasebne `/bees/<slug>` rute.

**v1.5 amendment authorization:** Ako post-launch analytics (heatmap klikova na tile-ove) pokaže jasan demand signal, odobreno je gradjenje jedne `/bees` agregatorske podstranice koja sadrži sve 13 proširene priče, bez SEO/URL load-a 13 zasebnih stranica.

**Rationale:** 13 zasebnih subpage-ova pomera launch timeline za 2-3 sprint-a bez jasnog impact-a na conversion. Grid-forma u single-surface izvršenju ima sopstveni gestalt efekat ("ovo pokriva moj dan") koji subpage fragmentacija uništava. Pre-optimization na nerealizovan demand odbačena.

---

### Decision 3 — Personas kao product-wide nomenclature (Opcija 3 — dual-layer)

**LOCKED:** Bee persona imena su **layered visibility** kroz onboarding, tooltips, empty states, i ostale dodirne tačke u Waggle proizvodu, BEZ da su prerequisite za razumevanje osnovne funkcionalnosti.

**Primeri dual-layer implementacije (authorized):**
- UI komande ostaju tehničke (`search`, `connect`, `summarize`) — bee imena NISU aliasi komandi
- Onboarding tour može da referencira "Meet The Hunter — your search bee" kao storytelling device
- Empty states mogu da imaju persona-specific illustration + voice ("The Hunter is ready to find what you saved")
- Tooltips iznad output-a mogu da koriste persona attribution ("Consolidated by The Night Shift")
- Pricing comparison tabela koristi bee nomenclature gde to jača argument (Teams tier: "Unlock The Team persona — shared context across your workspace")

**Anti-patterns zabranjeni:**
- Ne uvoditi bee imena kao naziv product kategorije ili feature grupe (ne postoji "Hunter mode" ili "Writer mode" kao product setting)
- Ne zahtevati od korisnika da zna bee personas pre nego što može da koristi osnovnu funkcionalnost
- Ne prekomerno koristiti bee language u tehničkoj dokumentaciji ili error porukama (tehnički sadržaj ostaje neutralan)

**Rationale:** Dual-layer maksimizira brand coherence (svaka upotreba proizvoda potkrepljuje personas card) bez da nameće metaforu kao cognitive barrier za nove korisnike. Balans između "lokalizovana metafora" (niska brand ROI) i "full nomenclature" (visoka cognitive load).

---

## Downstream implementacione implikacije (LOCKED)

**Za `BrandPersonasCard.tsx` (CC implementation brief):**

1. Data source mora da izlazi kao reusable export `apps/www/src/data/personas.ts` — 13 persona objekata (slug, title, role, alt, imagePath). Ne sme biti hardcoded u komponenti.
2. Komponenta mora da ima `variant` prop sa bar dva režima — `landing` (full 13-tile grid) i `compact` (budući use case u pricing ili onboarding). Compact varijanta ne mora da bude implementirana odmah, ali TypeScript interface mora da dozvoli.
3. CTA ispod card-a nije deo komponente — prosleđuje se kao `children` ili `cta` prop iz parent landing page-a.
4. `onTileHover` callback prop mora postojati na v1 interface-u (default no-op) da v1.5 inline-expansion dodatak ne zahteva breaking change.

**Za landing page kompoziciju:**

1. Section order (top-to-bottom): Hero → Proof/SOTA → How it works → **Personas card** → Pricing → FAQ → Footer
2. Hero sekundarni copy mora da priprema personas card kroz behavior framing ("It finds what you forgot. It names what keeps repeating. It ships what you planned.") BEZ eksplicitnog imenovanja bee metafora — bee je reveal, ne premise
3. Pricing comparison tabela referencira bee nomenclature gde jača argument, posebno Teams tier opravdanje kroz "The Team" persona

**Za ostale delove proizvoda (budući scope):**

1. Onboarding tour scaffold može da koristi persona-driven storytelling
2. Empty states su odobreni prostor za persona illustration + voice
3. Tooltips i output attribution mogu da koriste persona nomenclature

---

## Scope boundaries (explicit)

**IN scope ovog LOCKED:**
- Landing page section ordering i personas card pozicioniranje
- Component contract implikacije za `BrandPersonasCard.tsx`
- Authorization za dual-layer nomenclature kroz proizvod

**OUT of scope (zahteva zasebne LOCKED odluke):**
- Pricing section copy refinement — odvojen backlog item
- Hero section copy refinement — odvojen backlog item
- Onboarding tour detailed spec — zahteva zaseban brief i product-wide nomenclature layer spec
- `/bees` agregatorska podstranica copy i design — pokreće se post-launch samo ako analytics signalira demand

---

## Next action unblocked

Sa ove tri LOCKED odluke + personas card copy LOCKED (sister decision), CC može da implementira `BrandPersonasCard.tsx` sa finalnim copy-om, finalnim data source kao reusable export, finalnim `variant` prop interface-om. Nema više PM-blocker-a za tu komponentu.

Preostaje blocker: bee-writer-dark + bee-sleeping-dark assets moraju da CLOSE Task #24 pre nego što card može da renderuje svih 13 tile-a bez placeholder-a.

---

## Related

- `strategy/2026-04-22-landing-personas-integration.md` — brief sa kompletnim rationale-om i alternativama
- `decisions/2026-04-22-personas-card-copy-locked.md` — sister LOCKED za copy
- `briefs/2026-04-22-brand-bee-personas-card-spec.md` — component scaffold spec (updated)
- `briefs/2026-04-22-cc-bee-regen-execution.md` — bee regen CC brief (Task #24)

---

**LOCKED. Authoritative from 2026-04-22.**
