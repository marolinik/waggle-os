# CC Brief — Bee Regen Execution (writer + sleeping)

**Author:** PM (autorizovano bez dodatne Marko ratifikacije — Stavka 1 "sam odradi" direktiva 2026-04-22)
**For:** Claude Code (waggle-os repo, post Sprint 10 close)
**Date:** 2026-04-22
**Task:** Task #24 — Regen 2 preostala bela bee asset-a
**Priority:** Medium (non-blocking za Sprint 10; unblocks Task #16 + Task #18 post-Sprint-10)
**Budget:** ≤ $2.00 (2 gens × $0.70-0.90 + $0 upscale/deploy)

---

## Kontekst (kratko)

Post 2026-04-21 batch regen 9 bee personas-a, preostala su 2 asset-a koja zadržavaju white-dominant backgrounds što kvari canon koherenciju sa novih 9. Marko ratifikacija 2026-04-22: regen oba u dark-first canon. Ovaj brief je autorizovan direktno od PM-a kao "sam odradi" tok — CC izvršava bez dodatne Marko ratifikacije dok ne stigne contact sheet za go/no-go na kraju.

Source brief sa subject strings i style canon: `briefs/2026-04-22-bee-writer-sleeping-regen-brief.md`. CC čita taj fajl za kompletne subject string-ove; ovaj brief dodaje execution mechanics.

---

## Execution scope

**Autoritativno izvršenje bez dodatnih PM/Marko check-in-ova do contact sheet deliverable-a.**

CC ima autoritet da:
1. Kreira Python gen script u waggle-os tmp folderu (ne commit-uje u repo)
2. Pokreće Nano Banana Pro gen preko `generativelanguage.googleapis.com/v1beta` sa postojećim Marko GEMINI_API_KEY env varijablom
3. Radi multi-reference gen (bee-researcher-dark.png + icon-draft-dark.jpeg) verbatim iz 2026-04-21 pipeline-a
4. Radi Lanczos upscale 1024→2048 preko PIL
5. Kreira backup folder u waggle-os repo-u pre overwrite-a
6. Overwritu-je ciljne fajlove u `apps/www/public/brand/`
7. Generiše 13-tile contact sheet PNG za vizuelni go/no-go

CC NEMA autoritet da:
1. Modifikuje subject strings — koristi verbatim iz source brief-a
2. Menja style canon (palette, outline weight, composition rules)
3. Gen dodatne bee personas-e (scope je strogo 2: writer + sleeping)
4. Modifikuje bilo koji drugi asset u `brand/` folderu osim ciljna 2
5. Commit-uje rezultat u waggle-os glavnu granu bez PM review-a
6. Push na origin/main bez PM autorizacije

---

## Gen run protokol

**Step 1 — Prerequisite check:**
```bash
# Verify GEMINI_API_KEY present
# Verify source canon references present:
#   apps/www/public/brand/bee-researcher-dark.png
#   apps/www/public/brand/icon-draft-dark.jpeg
# Verify PIL available (pip install Pillow if needed)
```

**Step 2 — Backup:**
```
mkdir apps/www/public/brand/_backup-pre-regen-20260422-writer-sleeping/
cp bee-writer-dark.png _backup-pre-regen-20260422-writer-sleeping/
cp bee-sleeping-dark.png _backup-pre-regen-20260422-writer-sleeping/
```

**Step 3 — Gen writer first:**
- Subject string: verbatim iz source brief §Character brief — bee-writer-dark
- Multi-reference: bee-researcher-dark.png (primary) + icon-draft-dark.jpeg (anchor)
- Native output: 1024×1024
- Save to tmp path: `tmp/gen-runs/2026-04-22-writer-<ISO>.png`

**Step 4 — Internal QA check na writer:**
Automatski brightness histogram check na raw gen output — ako mean luminance > 0.45 (što bi signaliralo previše belog), flag u log-u i re-gen 1× sa dodatnim emphasis "NO WHITE BACKGROUND" u prompt. Max 2 re-gen pokušaja pre escalation.

**Step 5 — Gen sleeping:**
Ako writer prošao Step 4, prelazi na sleeping sa identičnim protokolom. Subject string verbatim iz source brief §Character brief — bee-sleeping-dark.

**Step 6 — Upscale oba:**
Lanczos PIL upscale 1024→2048 square format. Output:
- `tmp/gen-runs/bee-writer-dark-2048-2026-04-22.png`
- `tmp/gen-runs/bee-sleeping-dark-2048-2026-04-22.png`

**Step 7 — Contact sheet generation:**
13-tile contact sheet PNG (5×3 ili 4×4 grid sa 2 filler) combining all 13 bee personas from final state (11 canon + 2 new). Output: `tmp/gen-runs/contact-sheet-13-2026-04-22.png`.

**Step 8 — PM delivery:**
Napisati exit ping u `sessions/2026-04-22-bee-regen-exit.md` sa:
- Link na contact sheet PNG (relativna putanja)
- Brightness histogram rezultati za oba gen-a
- Budget actual iskorišćenje
- File timestamp i veličina oba final asset-a
- Eksplicitno: "Awaiting Marko vizuelni go/no-go na contact sheet pre deploy override-a"

---

## Deploy gate (PM-authorized, not CC-autonomous)

CC NE overwrituje ciljne fajlove `bee-writer-dark.png` i `bee-sleeping-dark.png` dok PM ne potvrdi Marko go/no-go na contact sheet. Ovo je single manual gate u inače autonomom toku — zato što overwrite waggle-os repo fajlova zahteva eksplicitnu ratifikaciju per repo access boundaries (`.auto-memory/feedback_repo_access_boundaries.md`).

Tok posle CC exit ping-a:
1. PM pregleda contact sheet
2. PM šalje Marko kratki ping sa contact sheet preview
3. Marko: go/no-go
4. Ako go → PM autorizuje CC da overwrite + create commit + push na origin/main
5. Ako no-go → PM drafta refinement brief sa specifičnim feedback-om → CC re-gen max 2× → ponovi go/no-go

---

## Exit criteria (Task #24 CLOSE)

- [ ] bee-writer-dark.png 2048×2048 deploy-ovan u `apps/www/public/brand/`, no white dominant area, canon-aligned, Marko go approved
- [ ] bee-sleeping-dark.png 2048×2048 deploy-ovan u istu putanju, no white dominant area, canon-aligned, Marko go approved
- [ ] Contact sheet 13×1 prolazi Marko vizuelni go/no-go kao stilski koherentan set
- [ ] Backup folder `_backup-pre-regen-20260422-writer-sleeping/` postoji u repo-u
- [ ] Commit na main sa jasnom porukom "brand: regen bee-writer-dark + bee-sleeping-dark (Task #24 CLOSE)"
- [ ] Push na origin/main
- [ ] PM exit ping sa Task #24 CLOSE verdict

Task #24 CLOSE automatski otvara Task #16 (claude.ai/design upload resume) kao spreman za izvršenje.

---

## Escalation triggers

1. **Gen API failure / auth error** — 2 retry max, pa IMMEDIATE PM ping
2. **Budget alarm > $2.00 hit** — IMMEDIATE PM ping, pauza run
3. **Brightness histogram fail posle 2 re-gen pokušaja** — IMMEDIATE PM ping, ne proceed sa drugim asset-om
4. **PIL / upscale library issue** — IMMEDIATE PM ping
5. **Repo write permission issue** — IMMEDIATE PM ping, ne pokušavaj da force

---

## Anti-pattern check

- Ne scope-creepuj u gen dodatnih assets-a (celebrating, researcher koji su canon reference)
- Ne modifikuj subject strings da "poboljšaš" output — verbatim iz source brief-a
- Ne commit-uj tmp gen runs u repo — tmp ostaje u `tmp/gen-runs/`
- Ne overwrituj ciljne fajlove pre Marko go na contact sheet
- Ne push bez PM autorizacije

---

## Related

- `briefs/2026-04-22-bee-writer-sleeping-regen-brief.md` — source subject strings + style canon
- `.auto-memory/project_bee_assets_regen.md` — prethodni 2026-04-21 regen pipeline i learnings
- `.auto-memory/feedback_repo_access_boundaries.md` — waggle-os write governance
- `decisions/2026-04-22-personas-card-copy-locked.md` — sibling LOCKED
- `decisions/2026-04-22-landing-personas-ia-locked.md` — sibling LOCKED

---

**End of brief. Autorizovano za izvršenje post Sprint 10 close. PM on call za 5 escalation triggers.**
