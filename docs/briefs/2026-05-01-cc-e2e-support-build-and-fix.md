# CC E2E Support Brief — Build dev server + Stay-on-call za PM E2E testing

**Datum:** 2026-05-01
**Autor:** PM
**Status:** AUTHORED — Marko paste-uje u CC sesiju da pokrene
**Mode:** SUPPORT (ne autonomous sprint) — CC je u stand-by režimu sa active dev server, prima friction reports od PM tokom dana, fix-uje + push, vraća se u stand-by
**Cost cap:** $25 hard / $20 halt — fix iteracije su mali diff-ovi, troškovi minorni; halt štiti od runaway loop ako neki bug otkrije fundamentalan problem

---

## §0 — Mode declaration

Ovo NIJE puni Sesija D UI alignment sprint. Ovo je SUPPORT sesija za PM E2E testiranje. CC role je:

1. Izgraditi i pokrenuti apps/web dev server lokalno na Marko-ovoj mašini
2. Popraviti bilo koje build/typecheck/lint errors koji blokiraju dev server start
3. Ostati u stand-by sa aktivnim dev serverom, čekajući PM friction reports
4. Kad PM prijavi broken funkcionalnost, CC izvršava: diagnose → fix → commit → notify PM "fix ready, please re-test"
5. Iterativni loop dok PM ne kaže "E2E PASS"

Ne implement-uj nijednu novu feature osim onoga što PM eksplicitno traži kao fix za otkriveni broken issue.

---

## §1 — Build phase (one-time setup)

### Korak 1 — Branch + dependencies

```bash
cd D:\Projects\waggle-os
git fetch origin
git checkout main
git pull origin main
git status
```

Verify clean working tree na origin/main HEAD-u.

### Korak 2 — npm install

```bash
npm install
```

Run from repo root. Monorepo workspaces će install sve packages including apps/web.

**Izlazni report:** koji su packages installed, ima li warnings, ima li peer dependency conflicts.

### Korak 3 — Type check + lint

```bash
npm run typecheck --workspace=apps/web
npm run lint --workspace=apps/web
```

**Akcija ako fail:** popravi minimalno — type errors koji blokiraju build moraju biti rešeni; lint warnings ostaju za kasnije. Commit "fix(typecheck): minimal pre-E2E-build fixes" ako bilo šta menjanju. Push.

### Korak 4 — Dev server start

```bash
npm run dev --workspace=apps/web
```

Default port verovatno 5173 (Vite). Capture exact URL koji se prikazuje u terminal output.

**Acceptance:** dev server sluša na portu, browser može otvoriti URL bez crash-a, prva stranica se učita (čak i ako ima warning ili partial render).

### Korak 5 — Notify PM

CC poruka u CC sesiju: "Dev server live at http://localhost:5173 (or actual port). Build clean. Standing by for E2E testing reports."

---

## §2 — Support phase (loop)

PM testira kroz Chrome MCP. Kad otkrije broken issue, prijavljuje CC u sledećem formatu:

```
FRICTION REPORT #N
- App / feature: [npr. MemoryApp filter pills]
- Expected: [npr. clicking "decision" pill should filter to decision entries]
- Actual: [npr. pill stays gray, no filter applied]
- Repro: [npr. open Memory app → click "decision" pill]
- Screenshot: ss_xxx (PM Chrome MCP capture)
- Severity: P0 launch blocker / P1 needs fix / P2 polish
```

CC akcije po friction report:

1. **Diagnose** — read source file koji sadrži feature, identify root cause (use grep/read tools, NE start_search van apps/web)
2. **Fix** — minimalna izmena koja rešava reportovan issue. Ne refactor, ne rename, ne dodavaj nove features.
3. **Verify** — run vitest na affected file ako test postoji, ili manual mental walkthrough ako ne
4. **Commit** — `fix(area): short description (PM friction report #N)`
5. **Push** — `git push origin main` (ako PM ratifikovao direct push) ili push na branch (ako PM zahteva PR review)
6. **Notify** — "Fix ready for #N, commit abc123. Hot reload should pick up automatically. Please re-test and confirm."

**Loop pravilo:** ne raditi dva fix-a paralelno — sequencijalno, jedan po jedan. To štiti od regression introduction sa multiple parallel changes.

---

## §3 — Halt triggers

CC HALT-uje i poziva Marko ratifikaciju ako:

- Kumulativni spend > $20 → halt + report
- Bilo koji single fix zahteva > 5 retry iteracija → halt + diagnostic
- Test suite breaks i ne može vratiti zelenom unutar 30 min → halt + rollback decision
- Otkriven fundamentalan architecture bug koji zahteva > 200 LOC change → halt + scope decision
- PM report ukazuje na broken business logic (ne UI) — to ide van scope ovog brief-a, zahteva dedicated brief
- Dev server padne i ne može da se restart-uje unutar 15 min → halt + diagnostic

---

## §4 — Out of scope eksplicitno

CC ne radi:

- Nove features (samo fix-evi otkrivenih broken stvari)
- UI redesign per Claude Design (to je Sesija D, parkirano)
- Refactor (osim minimalan refactor koji prirodno prati fix)
- Backend changes (services/, hive-mind packages)
- Tauri-specific work (Sesija A scope)
- Test coverage expansion (osim ako fix natural-ly traži novi test)
- Documentation update (osim CHANGELOG entry per fix)
- Performance optimization (osim ako PM eksplicitno friction report kao P0)

---

## §5 — Cumulative state tracking

CC održava jednostavan log na repo:

```
docs/e2e-2026-05-01-fix-log.md
```

Po fixu dodaje:

```
## Fix #N — YYYY-MM-DD HH:MM
Friction report: [PM report content]
Root cause: [1-2 rečenice]
Files changed: [list]
Commit: abc123
PM verification: PASS / FAIL / PENDING
```

Ovo je audit trail za PM Pass-2 review na kraju.

---

## §6 — End-of-day handoff

Kad PM zaključi E2E test pass, CC izvršava finalni:

```bash
git log --oneline origin/main..HEAD
git push origin main
```

Plus emit-uje kratak summary u CC sesiju: "E2E support session COMPLETE. N fix-eva applied across M files. Final commit list: [list]. fix-log saved. Standing down."

---

**End of brief. Marko paste-uje u CC sesiju za kickoff. PM čeka "Dev server live at..." poruku da krene Chrome MCP testiranje.**
