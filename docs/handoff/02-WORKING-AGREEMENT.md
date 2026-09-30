# 02 — Radni dogovor tima (Waggle v1.2)

**Revizija dokumenta: 1.2 DRAFT · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**
**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

Izmene 1.2.1: H-01 — remote samo `<ODOBRENI_TIMSKI_REMOTE>`, zabrana push-a na javni `origin` (§2.1, §15); H-02 — identitet paketa i zastareli status (§0 „Putanje u paketu”, DoD heševi → manifest); H-04 — pokazivači na TEAM-START-AUTHORIZATION TSA-01..TSA-10, mašina osnivača kao zabrane, ne obaveze tima (uvod, §0, §2.2, §2.4, §3, §4, §7, §10, §14, §15); H-05 — bezbedan test profil (BTP) i W0-PR20 (§2.4, §10); H-06 — backlog polja i registar kapija (§4, usklađeni DoR/DoD); H-09 — necikličan release put F3a → K → F3b → javni GO (§2.1, §13); H-12 — veza na proveru kapaciteta i okvir prvog meseca (§7); usklađenje: danas naspram posle odobrenja (§0).

Za koga je: tech lead, developeri i QA koji od osnivača preuzimaju Waggle. Dokument opisuje kako tim radi: grane, worktree-jeve, PR-ove, review, gates, uloge, ledger, receipts i CI.

Dokument je izveden iz [Delivery plana §0](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) (DP-0.01..DP-0.16) i iz [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). **Ako se ovaj tekst razlikuje od njih, važe plan i checklist**, a razlika je nalaz koji se prijavljuje po §10. Koji izvor pobeđuje kad se `AGENTS.md`, checklist, plan i handoff sukobe, predlaže [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) TSA-10 (PREDLOG, NEODOBRENO). Do potvrde važi privremeno pravilo iz §0 („Redosled važenja”): primenjuje se stroža norma, a svaki konflikt zaustavlja rad i ide osnivaču. Pravila koja ovde prvi put stoje nose oznaku PREDLOG (predlog ovog radnog dogovora). Ratifikuju ih tech lead i founder. Oznake statusa su iste kao u paketu: ODLUKA / POTVRĐENO NA REVIZIJI / NALAZ AUDITA — ZA PROVERU / DELIMIČNO/NEPOVEZANO / PREDLOG / ODLOŽENO / NEPOZNATO.

---

## 0. Pre prvog reda koda

> **Implementacija još nije odobrena.** Kodiranje počinje tek kad founder eksplicitno odobri delivery plan ([brief §20.4](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md): „Kodiranje i skupe/eksterne radnje čekaju naredno eksplicitno odobrenje”). Do tog odobrenja nema kreiranja `integration/waggle-next`, commit-a, push-a, PR-a, receipt run-ova ni plaćenih API poziva. Dozvoljeni su čitanje paketa i koda, read-only provere i priprema lične mašine van repoa. Šta je dozvoljeno danas, šta posle potvrde TEAM-START-AUTHORIZATION, a šta tek posle odobrenja plana, sažeto je u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) §3 (PREDLOG, NEODOBRENO); dok ga osnivač ne potvrdi, važi ova rečenica.

> **Posle odobrenja sav rad ide po OBAVEZNOJ strategiji bezbedne implementacije:** Delivery plan §0 (DP-0.01..DP-0.16) i [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). Pre svakog PR-a, agenta i sesije svaka stavka checklist-a mora biti „da”. Jedno „ne” zaustavlja rad. Ovo važi i za ljude i za AI agente.

- **Zatvorene odluke:** D-01..D-18 (brief §3) su ODLUKA i ne otvaraju se ni u PR-u, ni u review-u, ni u retrospektivi. Ako kod ili nalaz protivreči nekoj od njih, to se beleži po §10, a odluka ostaje.
- **Šta blokira šta:** ratifikacije ADR nacrta (RAT-01..RAT-09) i odobrenja ODB-01/ODB-02 su u [Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), a founder queue DQ-01..DQ-09 u §6. Nijedna DQ stavka ne zaustavlja W0 ni razvoj W1-PR1/PR2. RAT-01 mora biti ratifikovan pre zatvaranja G1 (F1). Za W0 ne treba nijedan RAT.
- **Putanje u paketu:** putanje su usklađene sa rasporedom repoa (`docs/…`, `docs/plans/v1.2-evidence/…`). Istorija normalizacije od 29.09.2026 je u [HANDOFF-HISTORY §3](../plans/v1.2-evidence/HANDOFF-HISTORY.md), a mapa starih putanja u [v1.2-evidence/README.md, „Mapa starih putanja”](../plans/v1.2-evidence/README.md#mapa-starih-putanja).

**Redosled važenja: predlog je TSA-10 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (NEODOBRENO); pitanje (j) u [00 §6](00-START-HERE.md).** Izvori se danas sukobljavaju. `AGENTS.md:6` kaže „If this file conflicts with any other document, **this file wins.**”. Checklist je po DP-0.01..DP-0.16 obavezan za svaki PR, a uvod ovog dokumenta kaže da važe plan i checklist. Paket ne kaže koji od njih pobeđuje. Ovaj handoff je izveden dokument i nema ovlašćenje da odredi redosled važenja ni da sam tumači `AGENTS.md`. Zato do founder odluke važi samo privremeno pravilo (PREDLOG):

1. **Stroža norma važi.** Kad dva izvora (`AGENTS.md` sa `CLAUDE.md`, checklist, Delivery plan, FRD, ovaj handoff) propisuju različito, a oba se mogu ispuniti istovremeno, ispunjavaju se oba. Gde nema konflikta, svaki izvor važi u celini, uključujući `AGENTS.md` §3.1–§3.6, §7 i §7.5.
2. **Svaki konflikt zaustavlja rad i ide osnivaču** (§10, [05 §5.5](05-RISKS-DECISIONS-ESCALATION.md)). Konflikt postoji kad se izvori ne mogu ispuniti istovremeno ili kad nije jasno koja je norma stroža. Rad na toj tački staje, a tim ne bira izvor sam.
3. D-01..D-18 ostaju ODLUKA i nisu deo ovog pitanja. Sukob nekog izvora sa njima se beleži po §10, a odluka se ne otvara.

Poznati konflikti sa `AGENTS.md`. Predlog razrešenja po ID-u je u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (TSA-06, TSA-10) i ide osnivaču uz pitanja (j) i (a). Do potvrde važi ovo:
- `AGENTS.md` §4 kaže „Max 5 files per phase. Complete → verify → await approval → next phase”, a PR-ovi plana su veći. W0-PR9 dira 7 source fajlova (`personas.ts`, `chat.ts`, `routes/evolution.ts`, `EvolutionTab.tsx`, `fleet-run-executor.ts`, `agent-groups.ts`, `fleet.ts`), a W0-PR12 šest fajlova (`dock-tiers.ts`, `AppShell.tsx`, `command-catalog.ts`, `cost.ts`, `settings.ts`, `tier-enforcement-matrix.test.ts`); brojano iz redova Delivery §2 W0. Paket ne kaže šta je „phase” u odnosu na PR iz reda plana ni ko daje „approval” (NEPOZNATO). Do odgovora važi t. 1: nijedna faza rada ne dira više od 5 fajlova, a posle svake se pokreću gates iz §6.2. Po t. 2, W0-PR9 i W0-PR12 ne počinju dok osnivač ne kaže šta je faza i ko je odobrava. PR se ne deli ispod reda plana osim split postupkom iz §4. Predlog zamene: TSA-06 (jedinica je PR ID iz plana, bez limita broja fajlova; „faza” je logički korak sa gate-ovima, bez čekanja osnivača). Do potvrde TSA-06 važi ovaj bullet.
- `AGENTS.md` §3.8 (i §3.7, „via `/handoff`”) traži handoff kroz `~/.Codex/skills/handoff/` u `C:/Users/MarkoMarkovic/.Codex/projects/D--Projects-waggle-os/memory/…`, a `CLAUDE.md` §3.8 isto za `~/.claude/…`. To su lične putanje na founder mašini. Upis u osnivačev lični profil je stavka koju [05 §5.3](05-RISKS-DECISIONS-ESCALATION.md) („Podaci žive instalacije”) šalje osnivaču. Kako se §3.8 primenjuje na tim je zato deo pitanja (j), a tim do odgovora ne piše u te putanje. Ono što se može ispuniti važi odmah (t. 1): „Never hide failures” i verifikacija pre zapisa stanja. Stroža verifikacija je §6.2 (`npm run build:packages`), jer `npx tsc --noEmit` po paketu, koji pominje §3.8, prolazi nad zastarelim deklaracijama (TD-TEST-12). Do odluke stanje, otvoreni padovi i sledeći korak idu u PR opis ili issue (PREDLOG). Predlog: TSA-10 t.5.
- Ko odobrava i ko merge-uje u `integration/waggle-next`: §7; predlog TSA-01.

---

## 1. Uloge i vlasnici

Plan dodeljuje posao **ulogama**, ne imenima. Kanonska lista uloga je u DP-0.14, i nju koriste Delivery §2, FRD §15 i dispozicija:

**Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release, OSS/License owner.** Founder je vlasnik samo decision queue-a (DQ), ratifikacija (RAT), odobrenja (ODB) i spoljnih kapija.

- Složena oznaka `Harness/Chat owner` znači dve uloge.
- Aliasi iz Build-vs-Borrow dokumenta: `Runtime/W1 owner` = Durable owner, `Harness/W3 owner` = Harness owner, `Capability/W4 owner` = Capability owner, `Release/OSS owner` = OSS/License owner (DP-0.14).
- **Ko nosi koju ulogu: NEPOZNATO.** Tech lead popunjava tabelu ispod pre starta W0 i objavljuje je timu. Jedna osoba sme nositi više uloga. Uloga bez imena blokira PR-ove u svojoj oblasti (vidi DoR, §8).

| Uloga | Tipična oblast u G1 (Delivery §2 W0 „Owner/uloga”) | Ime (popunjava tech lead) |
|---|---|---|
| Harness owner | F-HARN, F-EVO-01/10; W0-PR1..PR9 | NEPOZNATO |
| Chat owner | `chat.ts` + `chat-*.ts` (PR8, PR9, PR11) | NEPOZNATO |
| Memory owner | F-HM hook trio, F-HM-05; `orchestrator.ts`, `hive-mind-core` (PR10, PR11, PR18) | NEPOZNATO |
| Boundary owner | F-TK-02/03/04 de-gate (PR12); WB-PR1/PR2 | NEPOZNATO |
| Release owner | F-REL-01/06, ADR-10-K3 PostHog prekidač; W0-PR0 CI; W8-PR1 | NEPOZNATO |
| Durable owner | F-DUR-10 probe (PR14); od W1 i `workflow-*` | NEPOZNATO |
| Server owner | hotspot merge vlasnik za `packages/server/src/local/index.ts` (DP-0.14). U G1 ga dira W0-PR6 (`index.ts:612`, `new HarnessTraceBridge`, POTVRĐENO NA REVIZIJI) | NEPOZNATO |
| OSS/License owner | OSS-PR1/PR2 inventar i lint | NEPOZNATO |
| Ostale uloge (Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark) | od G2, po Delivery §2 | NEPOZNATO |

---

## 2. Grane i worktree-jevi

### 2.1 Baseline i integraciona grana

- Baseline je `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (DP-0.01, POTVRĐENO NA REVIZIJI).
- `integration/waggle-next` se kreira iz `2af0904d` u **sopstvenom novom worktree-ju**, nikad u `D:/Projects/waggle-os` (DP-0.04). Sve wave/PR grane ciljaju nju, **nikad `main`**. Na 29.09. i 30.09.2026 grana još ne postoji ni lokalno ni na `origin` (read-only `git ls-remote origin`, 30.09.2026). Kreira je tech lead posle founder odobrenja plana (PREDLOG). Lokacija worktree-ja: NEPOZNATO, izbor tima, ali ne sme biti unutar postojećih worktree direktorijuma.
- **Remote (PREDLOG, H-01):** sve timske grane (`integration/waggle-next`, `<wave-id>/*`) i interna planska dokumentacija push-uju se samo na `<ODOBRENI_TIMSKI_REMOTE>` ([01 §3.2](01-ONBOARDING-DEV-ENV.md)), nikad na javni `https://github.com/marolinik/waggle-os.git`. Danas (pre odluke osnivača o kanalu predaje i odobrenja starta) niko ne push-uje ni na jedan remote.
- Merge u `main` je **zabranjen**. Jedini put je kontrolisani korak K posle F3a receipts: founder-odobren **fast-forward** `main` → `S` (tačan zamrznut SHA; bez merge commit-a, squash-a i rebase-a) i tag `vX.Y.Z` → `S`, koji pokreće hosted potpis bez publikacije; zatim F3b nad potpisanim artefaktom i tek onda javni GO (Delivery §5, §5.1 RP-01..RP-12, DQ-01, DP-0.11/DP-0.12). K izvršava vlasnik repoa ili Release owner kome je osnivač to imenovano delegirao u odobrenju K; nikad agent.

### 2.2 Zaštićeni worktree-jevi i stash-ovi

- **Mašina osnivača — zabrane, ne obaveze tima** (DP-0.02, DP-0.03; [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) TSA-03 A, primenjeno u reviziji 1.2.1 po uputstvu osnivača). Na mašini osnivača devet postojećih worktree-jeva iz DP-0.02 i docs worktree `D:/Projects/waggle-v12-handoff` (grana `docs/waggle-v1.2-planning`, u kom je ovaj paket; 10. unos, `git worktree list` 30.09.2026) se ne brišu, ne checkout-uju i ne prune-uju, čak ni kad postanu „prunable”. Docs worktree se ne menja bez vlasnika paketa. Stash-ovi `stash@{0}` i `stash@{1}` se ne diraju. Ko god radi na toj mašini, pre i posle sesije proverava `git worktree list` (tih 10 unosa) i `git stash list` (tačno 2 unosa). Da li tim uopšte radi na mašini osnivača: predlog TSA-03 B je „ne” (NEODOBRENO; pitanje (c) u [00 §6](00-START-HERE.md)).
- **Timska mašina.** Svež timski klon nema te worktree-je ni stash-ove (`refs/stash` se ne prenosi klonom) i ne treba da ih ima. Provera je: `git worktree list` i `git stash list` se snimaju na početku i na kraju sesije, i nijedan unos koji ne pripada autoru sesije nije uklonjen ni izmenjen. Sopstveni završeni worktree se uklanja samo po TSA-04 (PREDLOG, NEODOBRENO); do potvrde se ne uklanja nijedan unos, ni sopstveni ([01 §3.3](01-ONBOARDING-DEV-ENV.md)).

### 2.3 Imenovanje grana

- Jedna kratkotrajna grana po zadatku, u obliku `<wave-id>/<tema>` (DP-0.05, checklist). Dozvoljeni prefiksi `<wave-id>`: `w0`–`w8`, `w3e`, `wb`, `oss`, `b1`–`b3`. Primeri iz plana: `w0/harn-01-verify-default`, `w1/run-store-spike`.
- Tema nosi ID plana tamo gde postoji, na primer `w0/pr12-approvals-degate` ili `wb/pr1-tier-inventory` (PREDLOG).
- **Napomena o nazivu:** zadatak za ovaj handoff pominjao je šemu `feat/<wave>-<slug>`. Ni plan, ni checklist, ni ijedan fajl paketa je ne koriste (grep „feat/” = 0). Checklist dozvoljava samo `<wave-id>/…` prefikse, pa važi `<wave-id>/<tema>`. Reč `feat` ide u tip commit poruke (§12), ne u ime grane.

### 2.4 Jedan worktree po paralelnom agentu ili developeru

- Svaki developer i svaki AI agent radi u sopstvenom worktree-ju, napravljenom iz `integration/waggle-next`. Niko ne dira tuđ worktree (DP-0.05). Primer (PREDLOG, putanju bira tim):

```bash
git -C <integration-worktree> worktree add ../waggle-w0-harn-01 -b w0/harn-01-verify-default integration/waggle-next
```

- Paralelizam u planu: 3–4 worktree-ja sa efektivnim paralelizmom 2.5–3.0 (Delivery §4.3 pretpostavke; NEPOZNATO do F1 merenja). Prvi paralelni set u G1 (00-START-HERE, dan 3–4): Harness / Memory / Boundary+Release / Durable-probe.
- Svaki worktree ima **sopstveni izolovan runtime**: `WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `PORT≠3100`, E2E env i `HOME`/`USERPROFILE`/`HERMES_HOME` za hook testove. Tačna lista je u checklist-u, stavka „Env izolacija”, i ovde se namerno ne prepisuje. Sidecar/web/E2E i hook/launch/canary run-ovi, kao i root suite do merge-a W0-PR20, idu samo u bezbednom test profilu (checklist „Bezbedan test profil (BTP)”); scratch `HOME`/`USERPROFILE` nije sandbox. `apps/web/.env.local` se ne kopira u agentske worktree-je.
- **Izuzetak W0-PR19:** generator golden fixture-a mora da radi na kodu `2af0904d` u zasebnom worktree-ju (Delivery W0-PR19). Checklist takav worktree ne dozvoljava. To je otvoren LOW nalaz u [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md), red „SAFE-IMPLEMENTATION-CHECKLIST.md”. Worktree za W0-PR19 se ne pravi dok founder ne potvrdi izuzetak (§10). Predlog izuzetka sa tačnim pravilima: TSA-05 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (NEODOBRENO).

### 2.5 Integracija, rebase i merge

- Feature grana se integriše sa `integration/waggle-next` **najmanje jednom dnevno** (DP-0.06, checklist).
- **Force-push je zabranjen** (DP-0.11). Zato važi sledeće (PREDLOG):
  - dok grana nije push-ovana, rebase na `integration/waggle-next` je slobodan;
  - kad je grana push-ovana, integracija ide merge-om `integration/waggle-next` u feature granu (repo već koristi obrazac „Merge origin/main into deps/vite-8”, `cab61cd9`). Rebase pa force-push nije dozvoljen.
- Način merge-a PR-a u integracionu granu (PREDLOG): merge commit, ne squash. Tako ostaju odvojeni RED commit i GREEN commit (§5). Podešavanja GitHub repoa se ne menjaju (checklist, apsolutne zabrane). Kakav merge metod repo trenutno dozvoljava: NEPOZNATO.
- Tokom receipt ciklusa (freeze, §13) nema merge-a u integracionu granu (PREDLOG).

---

## 3. Hotspot fajlovi i merge vlasnici

Hotspot fajl se merge-uje samo uz odobrenje njegovog vlasnika (uloge) (DP-0.14, checklist). **Dva PR-a koja diraju isti hotspot ne merge-uju se isti dan bez integracionog testa.** Šta se računa kao taj test, plan ne definiše (stavka „Integracioni test” ispod tabele). Tabela je prepisana tačno iz DP-0.14, uz dodatak iz W8:

| Hotspot | Merge vlasnik (uloga) |
|---|---|
| `packages/server/src/local/routes/chat.ts` + `chat-*.ts` | Harness/Chat owner |
| `packages/agent/src/agent-loop.ts` + `loop-gates.ts` | Harness owner |
| `packages/agent/src/orchestrator.ts` + `prompt-assembler.ts` | Memory owner |
| `packages/server/src/local/index.ts` | Server owner |
| `packages/shared/src/tiers.ts` + `assert-tier.ts` | Boundary owner |
| `packages/agent/src/workflow-harness.ts` + `workflow-tools.ts` | Harness owner → od W1 Durable owner |
| `packages/core/src/cron-store.ts` + `local/cron.ts` | Durable owner |
| `packages/hive-mind-core/src/**` | Memory owner + OSS drift dužnost (`CLAUDE.md` §7.5) |
| `release.yml` / `scripts/certify-*` (Delivery §2 W8) | Release owner, i ne dirati bez founder review-a |

- Očekivani konflikti: W1-PR4/PR8/PR9, W3-PR2 i W4-PR1 diraju iste fajlove `chat.ts`/`agent-loop.ts` (Delivery §4.3). Sve promene u `chat.ts` ili `agent-loop.ts` nose integracioni trošak (brief §15.3).
- **Integracioni test: predlog je TSA-07 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (NEODOBRENO); mora biti potvrđen pre prvog merge-a Harness lane-a (W0-PR1..PR8).** DP-0.14 i checklist (stavka „Hotspot fajlovi”) ne kažu šta je integracioni test, ko ga pokreće ni ko potpisuje rezultat. Ne kažu ni da li je „isti hotspot” jedan fajl ili ceo red tabele iznad. Plan budžetira hotspot integracione testove samo u G2, za W1-PR4/PR8/PR9 × W3-PR2 × W4-PR1 (Delivery §4.1, red „Integracija/spec sync”, (2)). G1 deo tog reda je samo ID reconcile. Pravilo ipak pogađa G1 odmah: W0-PR1, W0-PR3 i W0-PR7 diraju `workflow-harness.ts`, W0-PR7 i W0-PR8 `workflow-tools.ts`, a W0-PR4 i W0-PR5 `agent-loop.ts` (kolona „Fajlovi” u Delivery §2 W0). PR1, PR7 i PR8 su u serijskoj sekvenci W0 PR1/PR7/PR8/PR9 od 3–4 rd (Delivery §3).
  - **Do odluke** (stroža norma, §0): „isti hotspot” je ceo red tabele iznad, a drugi PR na istom hotspot-u ne merge-uje se istog dana kad i prvi. Tako se pravilo ispunjava bez testa koji nije definisan. Uticaj na W0 serijsku sekvencu je NEPOZNATO i ovde se ne preračunava.
  - **PREDLOG definicije** (preuzet u TSA-07, uz pojašnjenje da je „isti hotspot” isti red tabele i da posle W0-PR0 CI na merge commit-u PR B mora biti zelen; potvrđuje ga osnivač u TEAM-START-AUTHORIZATION). Kad se PR B merge-uje istog dana posle PR A na istom hotspot-u, integracioni test ima dva dela. (1) Četiri gate-a iz §6.2 i dopunske provere iz §6.3 prolaze na grani PR B, posle merge-a trenutnog HEAD-a `integration/waggle-next`, koji već sadrži PR A. (2) Bar jedan imenovani test vežba izmene oba PR-a zajedno na tom hotspot-u. Opis PR B navodi taj test, komandu, izlaz i exit kod. Test pokreće autor PR B. Rezultat potpisuje hotspot merge vlasnik iz tabele iznad, a ako je on autor PR B, drugi član tima (§7). Za chat hotspot važi i otvoreno pitanje ko-odobravanja (stavka „Otvoreno pitanje … chat hotspot-a” ispod).
- Promena u `packages/hive-mind-core/src/{mind,harvest}/**` beleži se za maintainer review `scripts/oss-drift-baseline.json`. Ništa se ne autoriše direktno na OSS mirror-u i nikad nema raw subtree push-a (checklist; `CLAUDE.md` §7.5).
- Hotspot vlasnika za pojedini W0 PR plan navodi u W0 „Hotspot merge owner”: PR1–PR8 Harness owner (`agent-loop.ts`/`loop-gates.ts`, `workflow-*`); PR9, PR8 i PR11 Chat owner (`chat.ts`, `chat-agent-run.ts`, `chat-collaboration.ts`); PR18 (`orchestrator.ts` recall filter, `hive-mind-core`), PR15 (samo komentar `orchestrator.ts:106-109`) i PR10 (`hive-mind-core` hook read path) Memory owner; PR14 Durable owner (`cron-store.ts`/`local/cron.ts`). Uz to, PR6 → Server owner (`packages/server/src/local/index.ts:612`). Tu stavku W0 „Hotspot merge owner” ne navodi, ali sledi iz DP-0.14 i iz reda W0-PR6 („`index.ts:612` prosleđuje resolver”). Ista je i W0-PR6 kartica u [03-BACKLOG.md](03-BACKLOG.md). Razlika se prijavljuje po §10.
- **Otvoreno pitanje (NEPOZNATO): ko odobrava merge chat hotspot-a.** DP-0.14 za `chat.ts` + `chat-*.ts` kaže `Harness/Chat owner`, a to su dve uloge. W0 „Hotspot merge owner (po DP-0.14)” navodi samo Chat owner za PR9, PR8 i PR11, isto kao hotspot redovi W1, W2, W3, W3e, W4, W5 i B1–B3. Da li Harness owner ko-odobrava, plan ne kaže. Paket to ne bira ćutke: pitanje je u §10 i mora biti rešeno pre prvog merge-a W0-PR8, W0-PR9 ili W0-PR11 (isto u [04 §2](04-CODEBASE-MAP.md)).

---

## 4. Veličina PR-a i slicing

- **Jedan PR = jedan PR ID iz plana** (npr. W0-PR0..W0-PR20; integracioni poslovi INT-01..INT-05, [03 §8.1](03-BACKLOG.md)). Kolona „PR slicing” u Delivery §2 je autoritativna za sadržaj, fajlove i testove koje PR menja. G1 ima ~26 PR-a (Delivery §4.2: W0-PR0..PR19 = 20, od toga 16 sa RED testom, plus WB-PR1/2, OSS-PR1/2, W8-PR1 i ID reconcile doc-only PR; brojanje revizije 1.2 — revizija 1.2.1 dodaje W0-PR20, a ID reconcile doc-only PR je INT-02). Spremnost za početak i za merge računa se iz tipizovanih polja backlog-a ([03 §0.1](03-BACKLOG.md)); kapija merge-a ne zabranjuje rad u grani.
- **Redosled iz plana je obavezan.** Primeri: W0-PR19 se merge-uje pre W0-PR6 i W0-PR18; W0-PR18 posle W0-PR11; u W0-PR9 F-EVO-01 ide pre F-EVO-10; zbog rizika važi redosled PR1 → PR8 → PR2/PR3 (Delivery §2 W0 „Rizik”). Graf zavisnosti je u Delivery §3.
- **Split.** Ako se PR mora podeliti, delovi dobijaju sufiks po obrascu plana (`B2-PR2a`, `W3e-PR9a..e`), a split se prijavljuje u PR opisu i docs PR-om u plan. Plan kaže „split se meri, ne pretpostavlja” (Delivery §4.2). Spajanje dva plan PR-a u jedan nije dozvoljeno bez tech lead odluke zabeležene po §10 (PREDLOG). Postojeća spajanja u planu (npr. F-EVO-01 i F-EVO-10 u W0-PR9) važe kako su napisana.
- **Surgical:** svaka izmenjena linija vodi do zadatka. Nema „usputnog” refaktora ni reformatiranja (`AGENTS.md` §3.3). Uočeni nepovezani dug se beleži (§11), ne popravlja se ćutke.
- **Struktura i ponašanje se nikad ne mešaju u istom commit-u** ([TECH-DEBT.md](../TECH-DEBT.md) „Adopted Conventions”). Pre strukturnog refaktora fajla >300 LOC, uklanjanje mrtvog koda ide u zaseban commit `chore(scope): dead code removal — [filename]` (`AGENTS.md` §4).
- **Veličina PR-a:** predlog TSA-06 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) za timski rad zamenjuje `AGENTS.md` §4 „Max 5 files per phase. Complete → verify → await approval → next phase.” (`AGENTS.md:403`, `CLAUDE.md:441` na `2af0904d`): jedinica je PR ID iz plana bez limita broja fajlova; cilj je do oko 400 izmenjenih linija produkcionog koda, a iznad oko 800 split ili obrazloženje (odlučuje tech lead); „faza” je logički korak sa gate-ovima, bez čekanja osnivača (PREDLOG, NEODOBRENO). Do potvrde važi §0, „Redosled važenja”: najviše 5 fajlova po fazi, a W0-PR9 (7 source fajlova) i W0-PR12 (6 fajlova) ne počinju (pitanje (j) u [00 §6](00-START-HERE.md)).
- **Nijedan PR ne uvodi Fusion/council/5-hats/agent-fusion površinu.** Postojeći subagenti dobijaju samo isti `ContextPackage`/run ugovor. Takav PR se odbija na review-u (ODLUKA D-16, DP-0.16).

---

## 5. RED → GREEN (test prvo)

Pravilo (DP-0.15, PREDLOG — SMER BRIEFA §15.4): svaki nalaz iz phase-A prvo dobija RED test koji pada na `2af0904d`, a zatim minimalni GREEN.

1. **RED commit:** test koji reprodukuje nalaz, bez produkcione izmene. Pokrenuti ga i sačuvati izlaz koji pada. Repo već ima ovaj obrazac („pinned first in `880c2dbe`” → fix `cbe83a37`, [TECH-DEBT.md](../TECH-DEBT.md) TD-CHAT-12). Gde plan traži `it.fails` (WB-PR2), RED ostaje `it.fails`.
2. **GREEN commit:** minimalna izmena posle koje test prolazi. Svi gates (§6) su zeleni.
3. **Testovi koji pinuju pogrešno ponašanje** navedeni su po PR-u u Delivery §2 (npr. `workflow-tools-harness.test.ts:135-179` za W0-PR1, `harness-trace-bridge.test.ts:82-92,327` za W0-PR6, `evolution-routes.test.ts:169-188` za W0-PR9, `cost-tracker.test.ts:54-57` za W0-PR13, a za W0-PR11 `agent-groups.test.ts:362`, `external-tool-runs.test.ts:259`, `fleet-isolation.test.ts:203,496-525`). Prepisuju se u **istom PR-u**, uz obrazloženje u opisu, nikad tiho.
4. Characterization testovi (`*-characterization.test.ts`) se nikad ne menjaju da bi izmena ponašanja prošla. Izmena ponašanja dobija sopstveni commit koji namerno ažurira pin ([TECH-DEBT.md](../TECH-DEBT.md) „Adopted Conventions”).
5. **Stavke sa oznakom NALAZ AUDITA — ZA PROVERU** (npr. W0-PR14 `getDue` hipoteza, W0-PR17) počinju reprodukcijom. Ako se RED ne može reprodukovati, nalaz ne važi za ovu reviziju: rad staje po §10. Popravka se ne izmišlja.
6. „Modul postoji” nije dokaz. Ništa se ne tvrdi kao „radi E2E” bez izvršenog testa na izolovanom sidecar-u (checklist, PR opis).
7. **Migracije:** svaka MIG-00..MIG-09 mutacija radi prvo na kopiji izolovanog dataDir-a, sa snapshot-om i `manifest.json` (MIG-00.3), dry-run izveštajem, idempotencijom i rollback testom po klasi. Za G1 mutacije MIG-04(A) (W0-PR6) i MIG-05(i) (W0-PR18) važi Klasa A nad golden fixture-om W0-PR19. Klasa B važi od G2, posle W1-PR15. Detalji su u DP-0.09, checklist-u i [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md).

---

## 6. Obavezni gates po PR-u

### 6.1 Okruženje

```bash
fnm use 22.23.2        # .node-version = 22.23.2; better-sqlite3 ABI 127
node -v                # mora biti v22.23.2
```

Nema `npm install`/`npm ci` dok dev serveri drže `.node` fajlove. Ako je instalacija neophodna, koristiti `--package-lock-only` (checklist).

### 6.2 Četiri obavezna gate-a (DP-0.06, checklist)

```bash
npm run build:packages
npm run typecheck:server-tests
npm run lint
npm run test -- --run --maxWorkers=6
```

- Sve četiri skripte postoje u `package.json` (POTVRĐENO NA REVIZIJI). `npm run build:packages` je jedini autoritativni lokalni tsc gate (TD-TEST-12, [TESTING.md](../TESTING.md) „CI Gates”). `npx tsc --noEmit --project packages/<pkg>` nije dovoljan.
- `--maxWorkers=6`: DP-0.06 kaže da bez njega lokalni suite pada sa OOM. Taj broj potiče iz zapisa iz sesije od 27.09.2026 sa jedne mašine od 80 GB i za ovaj paket nije reprodukovan (NEPOZNATO). Treba ga izmeriti na mašini tima ([01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md) §6.2, §13 t.1).
- `vitest.config.ts:28` postavlja `maxWorkers: 4`, a CI root korak ga preklapa sa `--maxWorkers=2` (`.github/workflows/ci.yml:86`). Serijski korak za 6 package-install runtime testova koristi `--maxWorkers=1 --no-file-parallelism` (`ci.yml:100-101`). Sve troje je POTVRĐENO NA REVIZIJI. DP-0.06 tvrdi da „CI koristi svoj `vitest.config.ts` `maxWorkers: 4`”, a to se ne slaže sa `ci.yml:86`. Zašto lokalno pada podrazumevanih 4 worker-a, a 6 prolazi, nije poznato (NEPOZNATO, meri se). Razlika se prijavljuje po §10.
- Dok suite radi, source se ne menja (checklist).
- Exit kod se čita direktno (`echo $?` / `$LASTEXITCODE`). Izlaz se ne propušta kroz `| tail` pre čitanja exit koda, jer pipe maskira neuspeh.

### 6.3 Dopunske provere prema dodirnutoj površini

CI job `test` u `.github/workflows/ci.yml` pokreće i komande koje četiri gate-a ne pokrivaju (POTVRĐENO NA REVIZIJI). Dok integraciona grana nema CI, PR koji dira navedenu površinu pokreće ih lokalno (PREDLOG):

| Dira | Komanda | Zašto |
|---|---|---|
| `apps/web/**` | `npm run typecheck:web` i `npm run test -w apps/web` | root `vitest.config.ts` isključuje `apps/**` (`:43`), pa `npm run test` ne pokreće web testove |
| `app/**` (Tauri TS skripte) | `npx tsc -p app/tsconfig.json` | CI korak „Tauri TS typecheck” |
| `packages/server/src/local/routes/chat*.ts` | root vitest sa coverage ratchet-om kao u `ci.yml` (`--coverage.include='packages/server/src/local/routes/chat*.ts'`, pragovi statements 94, lines 94, branches 87, functions 98) | pragovi smeju samo da rastu (TD-TEST-2) |
| korisnički tok / UI | `npm run test:e2e:smoke`, **samo** uz izolovan E2E env iz checklist-a (`WAGGLE_E2E_BASE_URL`, `WAGGLE_E2E_PORT`, `WAGGLE_E2E_REUSE_EXISTING_SERVER=0`, `WAGGLE_E2E_DATA_DIR`), i tek pošto se proveri da na 3333 ne sluša founder-ova instanca | blokirajući `e2e-smoke` job u `ci.yml` |
| migracija | dry-run izveštaj + snapshot `manifest.json` + drugi prolaz = no-op + rollback test po klasi | DP-0.09 |

Napomena: [TESTING.md](../TESTING.md) `:144` kaže „Coverage is not enforced in CI”, ali `ci.yml` sprovodi ratchet na `chat*.ts` (TD-TEST-2 CLOSED 2026-09-23). Rečenica u TESTING.md je zastarela (POTVRĐENO NA REVIZIJI). Ne ulazi u W0-PR15 bez odluke po §10, jer je W0-PR15 lista zatvorena u planu.

---

## 7. Review pravila

| Pravilo | Status |
|---|---|
| Svaki PR ima bar **jedno ljudsko odobrenje** od vlasnika uloge za tu oblast (§1). Bez ljudskog odobrenja nema merge-a. | PREDLOG |
| PR koji dira hotspot (§3) mora imati odobrenje hotspot merge vlasnika. Ako je autor i vlasnik, odobrava drugi član tima. | DP-0.14 + PREDLOG (drugi potpis) |
| `release.yml` / `scripts/certify-*`: Release owner **i** founder review. | Delivery §2 W8 |
| Migracioni PR (MIG-*), PR u `packages/hive-mind-core/src/**` i PR koji menja security/approval granicu: dva ljudska odobrenja. Obuhvat i drugi reviewer: TSA-01 t.4 (NEODOBRENO). | PREDLOG |
| PR čiji merge plan vezuje za ratifikaciju (npr. W1-PR2 → RAT-02, W3-PR2 → RAT-03, W2-PR1 → RAT-04, W3e-PR1 → RAT-05, W1-PR11 → RAT-06, W4-PR3 → RAT-07, WB-PR3 → RAT-08, W8-PR6 → RAT-09) ne merge-uje se pre founder ratifikacije. Review u PR-u ne zamenjuje ratifikaciju. | Delivery §6.1 |
| W2-PR3 se ne merge-uje bez odobrenog DQ-04 budžeta (LoCoMo same-judge merge gate). | Delivery §6 DQ-04 |
| **AI revieweri** (code-review agenti, Codex i slično) su dozvoljeni kao **pre-review**. Njihov nalaz se sažima u PR opisu, a svaka tačka dobija „popravljeno” ili „odbijeno, zato što…”. AI odobrenje se ne računa kao odobrenje. AI agent ne merge-uje. | PREDLOG |
| Reviewer proverava: da li PR odgovara redu plana, RED→GREEN dokaz, prepisane testove, safe-impl checklist „da”, affected receipts, oznake statusa u opisu i da nema Fusion površine (D-16). | PREDLOG (izvedeno iz checklist-a, „PR opis”) |

**Ko odobrava i ko merge-uje u `integration/waggle-next`: predlog je TSA-01 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (NEODOBRENO); do potvrde pitanje (k) za osnivača.** Izvori se razilaze. Delivery §4.2, red „Human review (founder; ~3 PR/dan NEPOZNATO)”, računa da founder serijski pregleda svaki PR. DP-0.14 daje merge hotspot-a vlasniku uloge i kaže „Founder samo za decision queue i spoljne kapije”. Prvi red tabele iznad traži jedno odobrenje vlasnika uloge (PREDLOG), a [05 §5.2](05-RISKS-DECISIONS-ESCALATION.md) daje merge tech lead-u (PREDLOG). Zato pravila u tabeli nikome ne daju ovlašćenje za merge dok founder ne odluči: (1) da li je founder review obavezan za svaki PR ili samo za redove koji ga traže (W8 `release.yml`/`scripts/certify-*`, RAT/DQ merge blokade); (2) ko izvršava merge u `integration/waggle-next` (tech lead, vlasnik uloge ili founder); (3) ko odobrava kad je autor ujedno vlasnik uloge. Pitanje je u listi (a)–(o) u [00 §6](00-START-HERE.md), kao (k). Tech lead ga šalje osnivaču zajedno sa pitanjem (a), po [05 §5.5](05-RISKS-DECISIONS-ESCALATION.md).

**Kapacitet review-a:** Delivery §4.2 računa sa serijskim review-om od strane founder-a (~3 PR/dan, NEPOZNATO). Kako se to deli između tima i founder-a posle preuzimanja: NEPOZNATO, odlučuje founder. Brojevi i rasponi plana se ne preračunavaju u ovom dokumentu. Prvo stvarno merenje je F1 retrospektiva (Delivery §4.3). Predlog TSA-01 skida serijski founder review sa svakog PR-a (founder review ostaje za `release.yml` i `scripts/certify-*`); kapacitet prema stvarnom timu potvrđuje tech lead. Pretpostavke kapaciteta po nedeljama prvog meseca, gruba provera kapaciteta i zapis rasporeda koji tech lead podnosi u nedelji 1 su u [Delivery §4.4.4–§4.4.7](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md).

---

## 8. Definition of Ready (PR sme da počne)

Sve stavke moraju biti „da" (PREDLOG, izvedeno iz Delivery §2 formata i checklist-a):

- [ ] Founder je odobrio delivery plan (§0).
- [ ] PR ID postoji u Delivery §2, ili je docs PR koji ga dodaje merge-ovan (§10).
- [ ] Input contract talasa je ispunjen i tiket je `ready_to_start` po [03 §0.1](03-BACKLOG.md): `technical_dependencies` i `sequence_after` su merge-ovani, a `start_gates` i `start_after` događaji zatvoreni. Merge-preduslovi (`merge_gates`) ne blokiraju početak rada u grani (H-06).
- [ ] Poznate su kapije merge-a (`merge_gates`: RAT-nn, DQ-nn, ODB-01/ODB-02, tiketi-preduslovi, registar [backlog-gates.csv](backlog-gates.csv)), zapisane u opisu, sa vlasnikom.
- [ ] Uloga i hotspot vlasnik imaju ime (§1, §3).
- [ ] RED test je imenovan, a testovi koji pinuju pogrešno ponašanje su navedeni (iz reda plana).
- [ ] Za NALAZ AUDITA — ZA PROVERU postoji plan reprodukcije (§5 t.5).
- [ ] Poznata je klasa migracije: „nema šeme” / Klasa A / Klasa B + MIG ID.
- [ ] Unapred su navedeni affected receipts (I/R/P/A/C) iz reda talasa „Affected receipts”.
- [ ] Postoji sopstveni worktree iz `integration/waggle-next` sa izolovanim env-om, i checklist „Pre svakog PR-a” je sav „da”.

## 9. Definition of Done (PR sme da se merge-uje)

- [ ] **AT ID-evi zeleni:** deo AT-a (ili imenovani FRD test, npr. FRD-05.8, Disposition OD-10) koji [FRD §15](../Waggle_FRD_v1.2_DRAFT.md) u koloni „Wave (autoritativan za dokaz završetka)” pripisuje ovom PR-u. Ako PR nema AT, piše se „nema — razlog” (npr. W0-PR19 „bez nalaza — preduslov testova”).
- [ ] Tiket je `ready_to_merge` po [03 §0.1](03-BACKLOG.md): sve `merge_gates` su zatvorene, a tiketi u njima merge-ovani (H-06).
- [ ] RED→GREEN dokaz: RED commit sa izlazom koji pada, GREEN commit sa izlazom koji prolazi (naziv testa i komanda).
- [ ] Četiri gate-a iz §6.2 zelena, plus dopunske provere iz §6.3 za dodirnutu površinu. Pre W0-PR0 izlaz se lepi u PR, a posle W0-PR0 CI mora biti zelen (§14).
- [ ] Prepisani ili uklonjeni testovi su navedeni sa razlogom.
- [ ] **SAFE-IMPLEMENTATION checklist je sav „da”** (sve tri sekcije: „Pre svakog PR-a”, „Apsolutne zabrane”, „PR opis”).
- [ ] **Affected receipts navedeni** (I installer / R router / P persona / A auth canaries / C crash-injection), ili „nijedan — razlog”.
- [ ] Migration/rollback napomena, ili „nema šeme”. Za migracije: dry-run izveštaj, snapshot manifest, idempotencija i rollback test po klasi (DP-0.09).
- [ ] **Ledger ažuriran:** novi ili otkriveni dug dobija red u [docs/TECH-DEBT.md](../TECH-DEBT.md) **pre merge-a**. Zatvoren red dobija status i SHA. Pogrešan red se ispravlja (§11).
- [ ] **Docs ažurirani** kad se menja ponašanje, komanda ili konfiguracija. Izmena PRD/FRD ili `00-START-HERE` `.md` znači ponovni DOCX izvoz i ažuriranje heševa u [manifestu paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3 (uslov predaje iz Delivery §6.1), u zasebnom doc-only PR-u.
- [ ] Za izmenu u `hive-mind-core` postoji zapis za `scripts/oss-drift-baseline.json` review.
- [ ] Svaka tvrdnja u PR opisu nosi oznaku statusa.
- [ ] AI pre-review je obrađen, a ljudska odobrenja su tu po §7.
- [ ] Nema otvorenog „nalaza protiv plana” (§10) vezanog za ovaj PR.

Talas je gotov kad je svaki njegov PR prošao checklist bez ijedne stavke „ne” (uslov exit-a u svakom talasu Delivery §2) i kad su njegovi exit AT-ovi zeleni. Kontrolna tačka G1/G2/G3 je gotova tek kad su ispunjeni njeni exit kriterijumi iz Delivery §1, **uključujući freeze receipts**. Do RAT-01 ti exit kriterijumi ostaju PREDLOG.

---

## 10. Kad nalaz protivreči planu

Ovo važi kad kod na reviziji, test, reprodukcija ili spoljna činjenica pokaže da plan, FRD, ADR ili checklist ne odgovara stvarnosti. Primeri: hipoteza se ne reprodukuje, fajl ili linija su pomereni, test koji plan kaže „ne lomi se” ipak se lomi, pravilo je neispunjivo.

1. **Stop.** Nema daljeg koda na toj tački. Ostatak PR-a sme da nastavi samo ako ne zavisi od nje.
2. **Zabeleži** u PR-u (ili issue-u, ako PR još ne postoji): šta plan tvrdi (dokument, sekcija, ID), šta je nađeno (`path:line` na reviziji, komanda i izlaz) i oznaku statusa. Oznaka se nikad ne podiže bez izvršene reprodukcije: NALAZ AUDITA — ZA PROVERU ne postaje POTVRĐENO NA REVIZIJI bez nje.
3. **Eskaliraj** isti dan vlasniku uloge i tech lead-u. Founder-u ide sve što dira: D-01..D-18 (samo se beleži, ne otvara se), DQ/RAT/ODB stavke, exit kriterijume G1/G2/G3, raspone i datume, apsolutne zabrane, receipts ili obim talasa.
4. **Odluka se zapisuje** doc-only PR-om u pogođeni dokument paketa, obrascem koji paket već koristi: „Napomena kritike (datum): …”. Brojevi, ID-evi i rasponi se ne preračunavaju u feature PR-u.
5. **Tek onda nastavak.** Obim se nikad ne menja ćutke. Nema „usput sam dodao”, „preskočio sam jer ne važi” ni tihog prepisivanja testa.

Poznate stavke koje već čekaju ovaj postupak:
- worktree za W0-PR19 na `2af0904d` naspram checklist-a (OPEN-LOW-FINDINGS) — predlog TSA-05;
- docs worktree `docs/waggle-v1.2-planning` na mašini osnivača: od revizije 1.2.1 zaštićen kao ostali unosi te mašine (§2.2; DP-0.02; TSA-03 A) — razrešeno u dokumentaciji;
- zastarela rečenica o coverage-u u TESTING.md `:144` (§6.3);
- DP-0.06 „CI koristi `vitest.config.ts` `maxWorkers: 4`” naspram `ci.yml:86` `--maxWorkers=2`, i nepoznat razlog za lokalni `--maxWorkers=6` (§6.2; [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md) §6.2, §13 t.1);
- W0 „Hotspot merge owner” u Delivery §2 ne navodi W0-PR6 → Server owner (`local/index.ts:612`), iako to sledi iz DP-0.14 (§3);
- merge vlasnik za `chat.ts` + `chat-*.ts`: DP-0.14 kaže `Harness/Chat owner` (dve uloge), a W0 „Hotspot merge owner” i ostali wave redovi kažu samo Chat owner. Pitanje za tech lead-a i founder-a, rešava se pre prvog merge-a W0-PR8/PR9/PR11 (§3; [04 §2](04-CODEBASE-MAP.md));
- stavka 1 checklist-a „Pre svakog PR-a” na hostu koji nije mašina osnivača: preformulisana u reviziji 1.2.1 po uputstvu osnivača (mašina osnivača: zabrane; timska mašina: provera tuđih unosa; §2.2; TSA-03 A) — razrešeno u dokumentaciji. Otvoreno ostaje samo da li tim radi na mašini osnivača (TSA-03 B; pitanje (c) u 00 §6);
- razrešeno u reviziji 1.2.1 (H-05): izolacija samo kroz `WAGGLE_DATA_DIR` nije potpuna (N-28). Pravilo je bezbedan test profil (checklist „Bezbedan test profil (BTP)”, DP-0.08). Popravka koda je W0-PR20 ([03](03-BACKLOG.md)), sa sentinel testom. Kod nije popravljen, a runtime potvrda nije urađena ([05](05-RISKS-DECISIONS-ESCALATION.md) N-28, R-15);
- redosled važenja `AGENTS.md` / checklist / Delivery plan / handoff, uključujući `AGENTS.md` §4 (5 fajlova po fazi) naspram W0-PR9/W0-PR12 i lične putanje iz `AGENTS.md` §3.8. Pitanje (j) u [00 §6](00-START-HERE.md) ide osnivaču zajedno sa pitanjem (a). Do odluke važi stroža norma, a svaki konflikt zaustavlja rad (§0); predlog TSA-06 i TSA-10;
- šta je „integracioni test” iz pravila o dva merge-a istog hotspot-a istog dana (DP-0.14, checklist), ko ga pokreće i ko potpisuje. Tech lead (do ESK-01 osnivač) odlučuje pre prvog merge-a Harness lane-a (W0-PR1..PR8). Do tada se drugi PR na istom hotspot-u ne merge-uje istog dana (§3); predlog TSA-07;
- ko odobrava i ko merge-uje u `integration/waggle-next`: Delivery §4.2 (founder serijski review) naspram DP-0.14, §7 ovde i 05 §5.2 (§7); predlog TSA-01;
- ostali LOW nalazi u [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md).

---

## 11. Ledger disciplina (`docs/TECH-DEBT.md`)

[docs/TECH-DEBT.md](../TECH-DEBT.md) je jedinstveni red za dug. Pravila su ratifikovana 2026-09-18 („Debt Budget & Broken-Windows Policy”) i važe za tim:

1. **Prozor koji dotakneš, zatvaraš.** Ako te izmena dovede do defekta, popravi ga u istom arc-u ili mu otvori red sa ID-om, lokacijom, rizikom, effort-om, prioritetom i vlasnikom **pre merge-a PR-a**.
2. **Nema nepraćenih hakova.** Goli `// TODO` bez ID-a ne ulazi u kod. Quirk u characterization testu nosi `// QUIRK (docs/TECH-DEBT.md TD-…)`.
3. Arc plaća dug koji sam napravi.
4. **Pogrešan red u ledger-u je defekt.** Ispravlja se ili deli (obrazac CA-5 → CA-5b).

Format reda (postojeći): `| Item | Location | Type | Risk | Effort | Priority | Status |`. ID je `TD-<OBLAST>-n` (npr. TD-CHAT-46, TD-TEST-12). Zatvaranje: `**CLOSED <datum>** (<SHA>, pinned first in <SHA>)`. Ledger je na engleskom, pa novi redovi ostaju na engleskom radi konzistentnosti (PREDLOG).

Odnos prema planu: ID-evi plana (F-HARN-nn, W0-PRnn, AT-nn, MIG-nn) nisu TD redovi i ne kopiraju se u ledger. TD red nastaje kad se otkrije ili napravi dug van plana, ili kad PR dira postojeći TD red. Na primer, W0-PR15 ispravlja line-anchor TD-CHAT-46 (`docs/TECH-DEBT.md:65`). Oznake talasa i tiketa idu u commit poruke i TECH-DEBT, nikad kao početak komentara u kodu („Adopted Conventions”).

---

## 12. Commit poruke

Konvencija je proverena na reviziji (`git log --oneline -30`; zbir tipova za poslednjih 300 commit-a bez merge-ova: `test` 96, `docs` 81, `fix` 46, `refactor` 40, `chore` 14, `build` 13, `feat` 4, `perf` 3, `ci` 3). POTVRĐENO NA REVIZIJI.

- Oblik: `<tip>(<scope>): <kratak opis u imperativu, malim slovima>`. Scope je paket ili oblast: `agent`, `server`, `core`, `web`, `www`, `marketplace`, `deps`… Za CI se koristi `ci:`.
- Tipovi: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build` (`build(deps)` za zavisnosti).
- ID-evi smeju u zagradu na kraju subject-a (primer iz repoa: `chore(deps): record the TypeScript 7 and transformers 4 blockers (TD-DEP-3, TD-DEP-4)`). Plan ID ide tu ili u telo (PREDLOG).
- Telo objašnjava **zašto**: šta je bilo pogrešno, šta je provereno, šta je namerno ostavljeno.
- Commit koji su pisali AI agenti nosi `Co-Authored-By:` trailer, kao postojeći commit-i.
- PR merge commit ostaje GitHub-ov podrazumevani „Merge pull request #N from …”.
- RED i GREEN su odvojeni commit-i. Primer za W0-PR1 (PREDLOG):

```text
test(agent): pin that a harness run without WAGGLE_AUTO_VERIFY reaches verify (W0-PR1, RED)
fix(agent): skip verify only when WAGGLE_AUTO_VERIFY is '0' (W0-PR1, F-HARN-01, AT-01)
ci: run CI on integration/** branches (W0-PR0)
```

---

## 13. Receipts, evidence i freeze proces (Delivery §5)

**Receipt oznake:** **I** installer, **R** router (smart-router primary, compact-tool-context, budget, fallback), **P** persona, **A** auth canaries, **C** crash-injection.

| Receipt | Alat na `2af0904d` | Stanje (POTVRĐENO NA REVIZIJI, Delivery §5/W8) |
|---|---|---|
| I | `scripts/certify-windows-installer.ps1` | povezan u `release.yml` |
| R | `scripts/qualify-smart-router.ts` | **nepovezan** (bez npm/CI ulaza) → W8-PR1 u G1 pre F1 |
| P | `npm run persona:seal` (`scripts/seal-persona-acceptance.ts`) | postoji (`package.json:48`) |
| A | `scripts/test-windows-official-auth-canaries.ps1` | **nepovezan** → W8-PR1 wrapper; prvi A tek na F2 (realni nalozi) |
| C | — | **ne postoji** (F-REL-03) → W8-PR2 u G2 pre F2 |

**Pravilo tačne revizije:** svaki receipt važi za tačan SHA i SHA-256 artefakta. Bounded carry-forward zahteva iscrpan pregled intervening diff-a. Nijedan receipt sa `e4bf403e`/`b07a6173`/`c4e6a515` ne pokriva `2af0904d` (Delivery §5; `CLAUDE.md` §1).

| Freeze | Kada | Receipts | Plan trajanja |
|---|---|---|---|
| **F1** | kraj G1 | I (interni pilot, clean-profile, bez javnog potpisa) + P + R | 3–5 rd, ne ispod S1 „3–4 dana”; trajanje se **meri** |
| **F2** | kraj G2, pre B3 | R + P + A + C na packaged internom pilot build-u + I interni | 4–7 rd |
| **F3a** | kraj G3 (RC, interni; source SHA `S`) | I + R + P + A + C nad internim artefaktom `A_int` + notices/SBOM asserti + sealed Deep Security za `S` + F2→F3 benchmark carry-forward atestacija; bez javnog potpisa | 5–8 rd |
| **F3b** | posle kontrolisanog koraka K (Delivery §5.1) | I + R + P + A + C ponovo nad potpisanim `A_sig` iz `release.yml` run-a + provera Authenticode potpisnika; receipts sa `A_int` ne prelaze na `A_sig` | NEPOZNATO; ≤ 30 dana od K do promocije |
| **F4** | kontingencija | puni set ponovo | — |

Broj: 3 planirana freeze-a (F3 = F3a + F3b nad istim `S`) + 1 kontingencija = 3–4 (Delivery §5). Sve je PREDLOG.

**Freeze postupak** (sažetak Delivery §5 i checklist-a; redosled koraka je PREDLOG):
1. Tech lead proglašava freeze i beleži tačan SHA `integration/waggle-next`. Do kraja ciklusa nema merge-a u integracionu granu.
2. Receipt run-ovi se izvode **samo na namenskoj VM ili disposable Windows nalogu bez instaliranog Waggle-a**, nikad na founder nalogu ni sa founder-ovim ličnim auth stanjem (`~/.claude`, `~/.codex`, Hermes home, provider ključevi). Svako odbijanje skripta („owned by another install”, „already registered; refusing to replace it”, drugi `Refusing …`) **zaustavlja rad**. Ne zaobilazi se ručnim brisanjem registry-ja ili profila.
3. P/R/A run-ovi koriste plaćene pozive ili realne naloge, pa idu samo uz konkretno **ODB-01** odobrenje za taj run, sa cap-om zadatim pre starta. Benchmark i judge run-ovi (LoCoMo same-judge rerun, B2-PR0/B2/B3, GEPA fidelity) idu samo uz **DQ-04**.
4. I receipt: internal clean-profile certification iz `CLAUDE.md` §2, izvršena na namenskoj mašini:
   ```powershell
   pwsh -NoProfile -File scripts/certify-windows-installer.ps1 `
     -InstallerPath "<absolute-path-to-Waggle-setup.exe>" `
     -ExpectedSourceRevision "<40-character-final-HEAD>" `
     -VerifyManagedModel
   ```
   Packaged default-profile zahteva **odsutan** `WAGGLE_DATA_DIR`. Izolacija se ovde postiže posebnim nalogom.
5. R se pokreće kroz npm ulaz iz W8-PR1. Ako W8-PR1 nije merge-ovan pre F1, pokreće se ad hoc `tsx scripts/qualify-smart-router.ts`, i to se beleži u receipt manifest (Delivery §5 F1).
6. Pre F1/F2 certify-a grep build `dist`-a za `phc_` i `pk_live_`/`pk_test_` potvrđuje da ključevi nisu upečeni. Rezultat ide u manifest (checklist; izvodljivost ZA PROVERU).
7. **Receipt manifest** (W8-PR1) beleži SHA, SHA-256 artefakta, komande, okruženje, ograničenja, rezultat, run ID, nalog bez tajni, cap i stvarni trošak (brief §15.4; checklist).
8. Posle F1 radi se retrospektiva: izmereno trajanje ciklusa i AI eng-dani po PR-u prema Delivery §4.1.1. Tek tada se rasponi smeju ažurirati, i to doc-only PR-om.

**Nikad kao dokaz:** stari persona score kao knowledge-work benchmark, „runner radi” kao B3, interni certify kao javni potpis (Delivery §5). Nema `git tag v*` ni push-a tagova (`release.yml:12-15` se okida na bilo koji `v*` tag); jedini izuzetak je kontrolisani korak K (Delivery §5.1), koji izvršava vlasnik repoa (osnivač) ili Release owner kome je osnivač to imenovano delegirao u pisanom odobrenju K; nikad agent. `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` ostaje nedefinisan. Nema lokalnog potpisivanja release artefakta ni ručnog pokretanja workflow-a (DP-0.11/DP-0.12, checklist).

---

## 14. CI napomena

- **Stanje na reviziji (POTVRĐENO NA REVIZIJI):**
  - `.github/workflows/ci.yml:3-6`: `push.branches: [main]`, `pull_request.branches: [main]`;
  - `.github/workflows/tauri-build-pr.yml:17-40`: `pull_request` i `push` samo za `main` (uz `paths` filter);
  - `.github/workflows/release.yml:12-15`: samo `push.tags: 'v*'`.

  Integraciona grana zato **nema CI** dok W0-PR0 ne doda `integration/**` (DP-0.07).
- **Do merge-a W0-PR0:** svi gates (§6) se pokreću lokalno, a u PR se lepi izlaz: komanda, verzija Node-a, završni rezime (broj fajlova i testova, pass/fail) i exit kod. „Prošlo je kod mene” bez izlaza se ne prihvata.
- **W0-PR0** je prvi PR na integracionoj grani. Dira samo branch filtere u `ci.yml` i `tauri-build-pr.yml` i **ne dira `release.yml`**. Predlog diff-a je u [templates/ci-integration-branch-proposal.md](templates/ci-integration-branch-proposal.md). Da li će sam W0-PR0 PR pokrenuti CI pre svog merge-a: NEPOZNATO. Zato se i za njega gates pokreću lokalno.
- **Posle W0-PR0:** zelen CI je deo DoD-a. Crven CI se ne zaobilazi ručnim re-run-om (checklist zabranjuje ručno pokretanje i re-run workflow-a). Predlog TSA-08 (NEODOBRENO) dozvoljava samo re-run neuspelih job-ova `ci.yml`/`tauri-build-pr.yml` sa zapisanim infrastrukturnim uzrokom, u budžetu; crven test zbog koda se nikad ne re-run-uje. Uzrok se analizira. Ako je crvenilo posledica budžeta ili runnera, a ne koda, to se beleži i eskalira vlasniku repoa.
- `hive-mind-cli-cross-platform.yml` okida se na `push` za `main` i `feature/**` i na `pull_request` za `main`. DP-0.07 ga ne pominje, pa ostaje van W0-PR0 dok se ne odluči po §10.

---

## 15. Apsolutne zabrane (sažetak; izvor je checklist)

Bez eksplicitnog founder odobrenja: nema merge-a u `main`; nema force-push-a; nema push-a interne dokumentacije ni timskih grana na javni `origin` (samo `<ODOBRENI_TIMSKI_REMOTE>`, H-01); nema `git tag v*` ni push-a tagova; `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` ostaje nedefinisan; nema release-a, publikacije, attestation-a ni lokalnog potpisivanja; nema promene vidljivosti repoa; nema promene licence/NOTICE teksta pre DQ-02; nema Stripe/billing radnji ni promene www pricing-a pre DQ-01/DQ-03; nema zamene instalirane aplikacije na founder mašini; nema instalacije neproverenog binarnog ili MCP koda iz testova; nema run-a sa realnim nalogom ili plaćenim API-jem bez ODB-01/DQ-04; nema izmena GitHub repo/org podešavanja ni ručnog pokretanja workflow-a (re-run samo po TSA-08, posle potvrde). Pun tekst i razlozi: [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md), „Apsolutne zabrane”.

---

## 16. Šablon PR-a

Predlog šablona je [templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.md). **Nije instaliran** u `.github/`. Postojeći `.github/PULL_REQUEST_TEMPLATE.md` traži `npx tsc --noEmit` po paketu, a to [TESTING.md](../TESTING.md) (TD-TEST-12) ne smatra autoritativnim. Zamena postojećeg šablona je zaseban PR sa review-om (PREDLOG) i nije deo W0-PR0.

## Izvori

[Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0 (DP-0.01..DP-0.16), §1, §2 W0/W8, §3, §4.1 (red „Integracija/spec sync”), §4.2, §4.3, §5, §6, §6.1, Prilog A · [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) · [FRD §15](../Waggle_FRD_v1.2_DRAFT.md) · [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md) · [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md) · [ADR-INDEX.md](../decisions/ADR-INDEX.md) · brief §3, §15.3, §15.4, §20.4 · repo na `2af0904d` (read-only): [package.json](../../package.json), `.github/workflows/{ci,tauri-build-pr,release,hive-mind-cli-cross-platform}.yml` (`ci.yml:86,100-101`), `.github/PULL_REQUEST_TEMPLATE.md`, `vitest.config.ts:28,43`, `.node-version`, [docs/TECH-DEBT.md](../TECH-DEBT.md) („Debt Budget & Broken-Windows Policy”, „Adopted Conventions”), [docs/TESTING.md](../TESTING.md) („CI Gates”), [AGENTS.md](../../AGENTS.md) `:6`, §3.3, §3.7, §3.8, §4, [CLAUDE.md](../../CLAUDE.md) §1, §2, §3.8, §7.5; `git log` (poslednjih 300 commit-a bez merge-ova), `git worktree list`, `git stash list` (29.09.2026). Revizija 1.2.1: [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (PREDLOG, NEODOBRENO) · [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) „Bezbedan test profil (BTP)”, „Release put” · [Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §4.4, §5.1 · [03 §0.1, §8](03-BACKLOG.md), [backlog-gates.csv](backlog-gates.csv) · [manifest paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) · [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md) · [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.md). Povezani handoff dokumenti: [00](00-START-HERE.md) §3, §6 · [01](01-ONBOARDING-DEV-ENV.md) §3.2, §6.2, §13 · [05](05-RISKS-DECISIONS-ESCALATION.md) §5.0, §5.2, §5.3, §5.5. Početna tačka paketa: [00-START-HERE.md](00-START-HERE.md).
