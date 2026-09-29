# Waggle v1.2 — sažetak za osnivača (29.09.2026)

## Predaja razvojnoj ekipi

Ulazna tačka za tech lead-a, developere i QA je [`docs/handoff/00-START-HERE.md`](../handoff/00-START-HERE.md) (i `00-START-HERE.docx` pored njega): status, redosled čitanja, mapa paketa, prvih 10 radnih dana, apsolutne zabrane i eskalacija. U istom folderu su `01-ONBOARDING-DEV-ENV.md`, `02-WORKING-AGREEMENT.md`, `03-BACKLOG.md` (+ `backlog.csv`), `04-CODEBASE-MAP.md` i `05-RISKS-DECISIONS-ESCALATION.md`.

- **Implementacija nije odobrena.** Kodiranje počinje tek kada osnivač pisano odobri delivery plan (pitanje (a) u 00 §6). Do tada tim samo čita paket i repo i priprema mašinu.
- **Posle odobrenja je obavezna [SAFE-IMPLEMENTATION checklista](SAFE-IMPLEMENTATION-CHECKLIST.md)** za svaki PR, agenta i sesiju; svako „ne” zaustavlja rad.
- Odobrenje plana ne uključuje RAT-01..RAT-09, ODB-01/ODB-02 ni DQ-01..DQ-09. Odluke D-01..D-18 su zatvorene i ne otvaraju se.
- PRD i FRD DOCX su ponovo izvezeni 29.09.2026 nakon normalizacije putanja; važeći SHA-256 su u Delivery §6.1 i Disposition OD-9.

---

**Šta je paket.** Planerski paket v1.2 DRAFT nad `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (repo samo čitan). Sadrži PRD i FRD v1.2 (`.md` + DOCX, sa SHA-256 heševima); Delivery plan sa talasima W0–W8/W3e/WB/OSS/B1–B3, kontrolnim tačkama G1 → G2 → G3 i SAFE-IMPLEMENTATION checklistom (Prilog A); dispoziciju C1–C22 / A1–A29 / R01–R24, Build-vs-Borrow, benchmark protokol i migracije MIG-00..09; 10 ADR nacrta sa indeksom i AT-01..AT-30, svaki sa lokacijom, fixture-om, okruženjem, owner-om i milestone-om.

Sve je PREDLOG. Nijedan ADR, prag, datum ni G struktura nije odobren. Odluke D-01..D-18 nisu ponovo otvarane.

## Procena (Delivery plan §4 — ekspertski raspon, ne P50, bez paušalnog AI popusta)
| | AI-orkestrirani eng-dani | Klasični eng-dani | Kalendar kumulativno (bez pauza) |
|---|---|---|---|
| G1 | 11–16 | 22–30 | 3–5 nedelja → 18.10.2026 – 01.11.2026 |
| G2 (inkrement) | 87–121 (kum. 98–137) | 177–245 (kum. 199–275) | 11–18 nedelja → 13.12.2026 – 31.01.2027 |
| G3 (inkrement) | 37–53, sa W3e-PR9 41–60 (kum. 135–190 / 139–197) | 75–108.5, sa W3e-PR9 83–122.5 (kum. 274–383.5 / 282–397.5) | (a) B3 paralelno: 16–27 nedelja → 17.01.2027 – 04.04.2027 (sa W3e-PR9 i T_evo pre B3 na istoj mašini: 16–28 → 11.04.2027); (b) B3 serijski: 18–30 nedelja → 31.01.2027 – 25.04.2027 (sa T_evo placeholder-om 18–32 → 09.05.2027) |

- **Datumi.** Datumi su kraj n-te kalendarske nedelje od 27.09.2026 (nedelja), ne radni rok. Poslednji radni dan te nedelje je petak. S1 raspon „12–17 nedelja” iznosi 20.12.2026–24.01.2027 i nije novi dogovor.
- **Pauze nisu u rasponima.** Osnov je PREDLOG: državni praznici RS i pretpostavljeno zatvaranje firme 24–31.12; kalendar Egzakte je NEPOZNATO. Pauze su 11.11.2026 (1 rd), 24.12.2026–07.01.2027 (8 rd), Sretenje 15–16.02.2027 (2 rd) i Uskrs/Praznik rada 30.04–04.05.2027 (3 rd). Sa njima: G2: 11–20 nedelja (do 14.02.2027); G3 (a): 18–29 nedelja (31.01–18.04.2027); (a') sa T_evo: 18–31 (do 02.05.2027); G3 (b): 19–33 nedelja (07.02–16.05.2027); sa PR9: 20–33; sa T_evo: 20–35 (do 30.05.2027). Svaka granica posle 24.12.2026 pomera se za +1–3 nedelje.
- **Osetljivost na klasičnu kolonu.** Ako se računa klasičnom kolonom umesto AI, G2 je 16–28 nedelja, G3 (a) 23–39, a G3 (b) 26–45. Dok F1 retrospektiva ne izmeri AI throughput, stvarna nesigurnost je G2 11–28 i G3 16–45 nedelja.
- **Javni datum G3 je NEPOZNATO.** Authenticode, Deep Security i CASA (ako se ide na Gmail) dodaju se na kraj i nemaju dokaz trajanja.

## Glavni potvrđeni defekti na `2af0904d` (POTVRĐENO NA REVIZIJI)
- **F-HARN-01/02/03/05:** verify se preskače po defaultu i u `catch`; `VERDICT: FAIL` prolazi regex; svaki bash (i `echo`) prolazi kao test, a exit code se ignoriše; budget stop gasi verifikaciju (AT-01..AT-03).
- **F-HARN-06/08:** trace bridge upisuje `verified` i `ok:true` bez dokaza; gate-ovi čitaju `tool_calls` koje prijavi model, a ne serverski journal.
- **F-EVO-01/05:** evolved persona override zasenčuje ugrađena persona, a pobednička EvolveSchema se ne koristi u izvršenju ni u deploy-u (AT-04/AT-05).
- **F-DUR-01/13:** restart sve aktivne runove označava kao `interrupted`, a server-driven phase executor ne postoji (AT-07).
- **F-DUR-06 (oslabljen refute-om):** zatvaranje SSE socket-a prekida run, pa nema detach-a (AT-10).
- **F-HM-05:** workspace run sažetak se kopira u personal mind na četiri mesta. To je curenje scope-a (AT-13).
- **F-TK-02 / F-TK-11:** Approvals je TEAMS-sakriven samo u navigaciji; `createKvarkTools` nema nijednog produkcijskog pozivaoca.
- **F-UXM-02/06:** readiness daje lažno pozitivne rezultate; ciljni Qwen model nije ni na jednoj proizvodnoj putanji.
- **F-REL-04 / F-REL-06:** nema SBOM-a ni THIRD_PARTY_NOTICES; cena Opus-a u `cost-tracker.ts` je netačna.

## Najveće NEPOZNATO
AI throughput (odnos ≈0.48× je procena iz S1, nije izmeren); founder review kapacitet (~3 PR/dan); B3 wall-clock (placeholder 10–20 rd) i T_evo (1–8 rd); da li postoje stvarni Stripe pretplatnici; trajanje Authenticode / Deep Security / CASA koraka; test mašina za F1 receipt; vidljivost repoa (live stanje je public, a dokumenti kažu private; NALAZ AUDITA — ZA PROVERU).

## Decision queue (Delivery §6; preporuke su PREDLOG)
- **DQ-01 Public naming/GO:** naziv i broj verzije tek posle F3 poređenja; do tada „controlled preview”.
- **DQ-02 Licenca:** jedna odluka o ownership-u i finalni LICENSE/NOTICE tekstovi, uz granicu OSS-excluded.
- **DQ-03 Pretplatnici:** read-only Stripe inventar pre bilo kakve WB-PR5 migracije.
- **DQ-04 Benchmark budžet:** cap za LoCoMo rerun (merge gate za W2-PR3), B2-PR0/B2, B3 i GEPA fidelity.
- **DQ-05 Model/hardware:** `Qwen/Qwen3.8-27B` Q4_K_M, repin Ollama-e i prioritetni test uređaji.
- **DQ-06 Mail/calendar:** Microsoft Graph kao prvi ekosistem, ili Gmail sa BYO OAuth pilotom.
- **DQ-07 Mobile:** Telegram kao jedini G3 kanal sa token-vezanim approve/deny.
- **DQ-08 UI jezik:** English-only prvi release, sa centralizovanim stringovima.
- **DQ-09 Pragovi/režimi:** latency, quality i classifier pragovi i CONDITIONAL politika, zaključani pre B3/F2.
- **RAT-01..RAT-09:** ratifikacija G strukture i ADR-01..10 pre imenovanih merge-ova (§6.1).
- **ODB-01:** plaćeni receipt run-ovi.
- **ODB-02:** obim W3e-PR9 (bounded recipe evolution).

## Šta NIJE urađeno
Nije pisan ni menjan kod. Repo nije diran: nema commit-a, push-a, taga, merge-a ni release-a. Nisu pokretani E2E, installer, receipt ni benchmark run-ovi. Nije bilo Stripe radnji ni plaćenih API poziva. Worktree-jevi i stash-evi nisu dirani.

## Poslednji kritički krug
HIGH 0, MED 12. LOW nalazi su namerno ostavljeni bez nove petlje i stoje u `docs/plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md`: 17 otvorenih, a 8 je već razrešeno. U završnoj proveri kompletnosti dodata su dva elementa: definicija „lokacije testa” u FRD §15, posle čega je FRD DOCX ponovo izvezen i heševi su ažurirani; uslov SAFE-IMPLEMENTATION checkliste u exit kriterijumima svih 13 talasa.
