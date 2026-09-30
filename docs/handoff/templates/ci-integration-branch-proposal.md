# PREDLOG — CI filteri za integracionu granu (W0-PR0)

**Revizija dokumenta: 1.2 DRAFT · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**
**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

Izmene 1.2.1: H-09 — put ka tagu je kontrolisani korak K posle F3a (§3); usklađenje sa H-01 (CI radi na grani u `<ODOBRENI_TIMSKI_REMOTE>`, §0 i §4) i H-04 TSA-08 (re-run, §4).

**Status: PREDLOG.** Ništa iz ovog dokumenta nije primenjeno na `.github/` i nijedan workflow nije pokrenut. Ovo je nacrt sadržaja PR-a **W0-PR0** („`integration/**` u `ci.yml` i `tauri-build-pr.yml` filtere”, [Delivery plan §2 W0](../../plans/WAGGLE-DELIVERY-PLAN-v1.2.md); DP-0.07). PR se otvara tek kad founder odobri delivery plan i kad postoji `integration/waggle-next`. Cilj PR-a je `integration/waggle-next`, ne `main`. Grana i PR žive samo na `<ODOBRENI_TIMSKI_REMOTE>` (H-01; [01 §3.2](../01-ONBOARDING-DEV-ENV.md)), pa i CI iz ovog diff-a radi tamo; javni `origin` nije odredište.

## 1. Zašto

- `.github/workflows/ci.yml:3-6` okida se samo za `main`: `push.branches: [main]`, `pull_request.branches: [main]`. POTVRĐENO NA REVIZIJI (F-REL-10).
- `.github/workflows/tauri-build-pr.yml:17-40` okida se na `pull_request` i `push` samo za `main` (uz `paths` filter), a ima i `workflow_dispatch` (`:41`). POTVRĐENO NA REVIZIJI.
- Bez izmene, `integration/waggle-next` i PR-ovi koji ciljaju nju **nemaju CI** (DP-0.07). Do merge-a W0-PR0 gates se pokreću lokalno, a izlaz se lepi u PR ([02-WORKING-AGREEMENT.md §14](../02-WORKING-AGREEMENT.md)).

## 2. Tačan diff

Proveren sa `git apply --check` nad worktree-jem na `2af0904d` (29.09.2026; bez primene). Glob `integration/**` pokriva `integration/waggle-next`. Parsiranje izmenjenog YAML-a daje `on.push.branches` = `on.pull_request.branches` = `["main","integration/**"]` za oba fajla.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,7 +1,7 @@
 name: CI
 on:
   push:
-    branches: [main]
+    branches: [main, 'integration/**']
   pull_request:
-    branches: [main]
+    branches: [main, 'integration/**']
 
--- a/.github/workflows/tauri-build-pr.yml
+++ b/.github/workflows/tauri-build-pr.yml
@@ -16,8 +16,9 @@
 on:
   pull_request:
     branches:
       - main
+      - 'integration/**'
     paths:
       - 'app/**'
       - 'apps/web/**'
       - 'packages/**'
@@ -29,7 +30,8 @@
   push:
     branches:
       - main
+      - 'integration/**'
     paths:
       - 'app/**'
       - 'apps/web/**'
       - 'packages/**'
```

Šta PR namerno **ne** menja (surgical, `AGENTS.md` §3.3):
- `paths` filtere, poslove, korake, runnere i `workflow_dispatch` u `tauri-build-pr.yml`;
- komentar u zaglavlju `tauri-build-pr.yml` („per-PR + main pushes”). Ostaje netačan u detalju, pa se beleži kao nalaz po §10 radnog dogovora, a ne popravlja se usput;
- `.github/PULL_REQUEST_TEMPLATE.md`.

## 3. `release.yml` ostaje tag-only i ne dira se

- `.github/workflows/release.yml:12-15`: jedini trigger je `push.tags: 'v*'`. POTVRĐENO NA REVIZIJI.
- W0-PR0 **ne dira `release.yml`** (DP-0.07). Kako je `release.yml` u `paths` listi `tauri-build-pr.yml`, reviewer proverava da diff nema nijednu liniju u `release.yml`.
- **Nijedan `v*` tag se ne pravi i ne push-uje** iz ovog plana. `release.yml` se okida na **bilo koji** `v*` tag, i istorijski ne-release tagovi su već pokretali neuspešne runove (DP-0.12; live stanje NALAZ AUDITA — ZA PROVERU). `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` ostaje nedefinisan. Jedini put ka tagu je kontrolisani korak K posle F3a receipts: founder-odobren fast-forward `main` → `S` i tag `vX.Y.Z` → `S` (Delivery §5.1, DQ-01); tag push-uje vlasnik repoa, ne tim.
- Opcioni uži trigger `v[0-9]+.[0-9]+.[0-9]+` i ruleset za `refs/tags/v*` su GitHub operativna podešavanja vlasnika repoa kroz W8 (Delivery §2 W8, ADR-10-O8). **Nisu deo ovog PR-a.**

## 4. Otvoreno (ne ulazi u W0-PR0 bez odluke)

| Stavka | Status | Ko odlučuje |
|---|---|---|
| Da li sam W0-PR0 PR (base `integration/waggle-next`) pokreće CI pre svog merge-a | NEPOZNATO. Gates se za W0-PR0 zato pokreću lokalno i izlaz se lepi | — |
| Trošak Actions budžeta: `push` na `integration/**` u `tauri-build-pr.yml` pokreće Windows (`timeout-minutes: 45`) i macOS matricu (`timeout-minutes: 60`) na svaki merge koji dira `paths` | NEPOZNATO (budžet nije meren; mesečni limit upisuje osnivač u TEAM-START-AUTHORIZATION TSA-08, a plan naloga zavisi od `<ODOBRENI_TIMSKI_REMOTE>`) | Release owner → founder |
| `hive-mind-cli-cross-platform.yml` (`push`: `main`, `feature/**`; `pull_request`: `main`) i `mind-parity-check.yml`/`sync-mind.yml` (samo `main`; `sync-mind` i `mind-parity-check` su deprecation anchor-i po `CLAUDE.md` §7.5) nisu u DP-0.07 | van obima W0-PR0 | tech lead po §10 radnog dogovora |
| Ručni `workflow_dispatch` ili re-run posle merge-a | **zabranjeno** bez founder odobrenja (checklist, apsolutne zabrane). Jedini predloženi izuzetak: re-run neuspelih job-ova `ci.yml`/`tauri-build-pr.yml` sa zapisanim infrastrukturnim uzrokom, u budžetu (TSA-08, NEODOBRENO) | founder |

## 5. Verifikacija posle merge-a (PREDLOG)

1. Sledeći PR ka `integration/waggle-next` prikazuje `CI` proveru (`test`, `e2e-smoke`, `e2e`) i, kad dira `paths`, i `Tauri Build Verification`. Nijedan workflow se ne pokreće ručno.
2. U Actions listi nema nijednog run-a `Release Build`.
3. Rollback: revert W0-PR0 na integracionoj grani. Nema podataka ni stanja koje revert pogađa.

## Izvori

[Delivery plan](../../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) DP-0.07, DP-0.11, DP-0.12, §2 W0 (W0-PR0) i W8, §5 F3, §5.1 (RP-01..RP-12), §6 DQ-01 · [TEAM-START-AUTHORIZATION](../TEAM-START-AUTHORIZATION.md) TSA-08, TSA-09 (PREDLOG, NEODOBRENO) · [SAFE-IMPLEMENTATION-CHECKLIST.md](../../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) (Baseline, apsolutne zabrane) · repo na `2af0904d` (read-only): `.github/workflows/ci.yml:1-6`, `.github/workflows/tauri-build-pr.yml:16-41`, `.github/workflows/release.yml:12-15`, `.github/workflows/hive-mind-cli-cross-platform.yml`, `.github/workflows/mind-parity-check.yml`, `.github/workflows/sync-mind.yml` · [02-WORKING-AGREEMENT.md](../02-WORKING-AGREEMENT.md) §10, §14.
