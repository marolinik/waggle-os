# CC Brief — Stage 0 Dogfood (Preflight Gate, Stage 1 of 3)

**Datum:** 2026-04-20 EOD → target wall-clock 1-2h
**Autor:** PM (Claude, za Marka → CC)
**Scope:** End-to-end sanity run kroz hive-mind harvest pipeline na Marko-ovim ličnim AI export podacima, verifikacija retrieval path-a kroz tri lično formulisana pitanja. Bez benchmark scoring-a, bez judge-eva, bez dataset-a. Ovo je smoke test integracije harvest → storage → retrieval pre nego što se troši budžet na Stage 1 mikro-eval i Stage 2 4-cell.
**Exit target:** `waggle-os/preflight-results/stage-0-dogfood-2026-04-XX.md` raw report + ping u `PM-Waggle-OS/sessions/2026-04-XX-preflight-stage-0-handoff.md` sa go/no-go preporukom za Marka.
**Parallelism note:** Ovaj sprint se može pokrenuti paralelno sa PM calibration labeling passom i CC Sprint 9 (judge wiring). Ne deli resource contention na kritičnom putu.

---

## Context

CC Sprint 8 zatvoren i pushovan 2026-04-20 (`345e13b`, `97f14ca`, `e990261`). Preflight sample i failure-mode judge scaffold su na origin/main. Pre nego što se pokrene Stage 1 (mikro-eval, ~$5-10) i Stage 2 (4-cell na preflight-locomo-50, ~$67-134), Stage 0 validira da harvest pipeline ume da proguta real-world AI export data i da retrieval path vraća specifične činjenice — ne hallucinacije iz general knowledge modela.

Stage 0 je jedini stage koji se **ne pokreće nad sintetičkim ili javnim benchmark dataset-om**. Izvor podataka je Marko-ova lična istorija interakcija sa AI asistentima. To znači da dve stvari moraju raditi u sprezi:
1. Hive-mind harvest adapteri u `hive-mind` repo-u (Wave 3B + 3C — ~11 adaptera, po memoriji `project_harvest_parity_stream.md`)
2. Waggle-os query path (full-stack cell koji preko MCP dependency bridge-a čita hive-mind storage)

Ako ovo radi end-to-end, Stage 1 i Stage 2 su tehnički izvodivi. Ako ne radi, otkrivamo to za $5 umesto za $150.

## Read-first (sequential)

1. `D:\Projects\PM-Waggle-OS\strategy\2026-04-20-preflight-gate-spec.md` §2 (Stage 0) — canonical pass kriterijum i setup opis
2. `D:\Projects\PM-Waggle-OS\decisions\2026-04-20-preflight-oq-resolutions-locked.md` — Stage 2 context (ne Stage 0 direktno, ali upućuje na shared sample lock i harvest flow)
3. `D:\Projects\PM-Waggle-OS\.auto-memory\project_harvest_parity_stream.md` (u memoriji) — zabeležen arhitekturni fork Opcija A (hive-mind kao dependency u Waggle Tauri sidecar-u) i koji su adapteri dostupni
4. `D:\Projects\hive-mind\` root README + harvest adapter paket — shto je trenutno u production-ready stanju od Wave 3B/3C commit-a `0836c67`

Ako nešto u ovom brief-u kontradikuje LOCKED decision file-ove, LOCKED-i pobeđuju. Flaguj kontradikciju u exit ping-u.

---

## Marko-va priprema (blocking CC task 1)

Pre nego što CC pokrene ijedan task, Marko mora dostaviti sledeće u lokalni folder **`D:\dogfood-exports\2026-04-20\`** (zaključano 2026-04-20; izvan svih repo-a, izvan sync-ovanih foldera, zero risk accidental commit-a):

**Folder struktura — CC kreira pri Task 2 izvršenju:**
```
D:\dogfood-exports\2026-04-20\
├── claude-ai\          ← Marko unzipuje Claude.ai export ovde pre nego CC startuje
├── google-takeout\     ← Marko unzipuje Takeout arhivu ovde pre nego CC startuje
└── kg-storage\         ← dedicated dogfood bitemporal KG instance, CC kreira
```

Ako u praksi ChatGPT export stigne sa zakašnjenjem, dodaje se kao `claude-ai\` sibling folder `D:\dogfood-exports\2026-04-20\chatgpt\` i tretira kao post-Stage-0 corpus enrichment (ne trigger-uje Stage 0 retest).


**Exports (po prioritetu):**
1. **Google Takeout** — full archive sa Gmail + Calendar + Drive + ChatBot interaction (ako je enabled), obavezno
2. **Claude.ai export** — zip arhiva sa `conversations.json` + atačmentima, obavezno
3. **ChatGPT export** — zip arhiva sa `conversations.json`, obavezno
4. **Gemini export** — preko Google Takeout, obavezno ako postoji (Gemini interakcije idu kroz Takeout kao "My Activity > Gemini Apps")
5. **Cursor chat history** — opciono, po raspoloživosti (export iz Cursor UI ako postoji)
6. **Opciono: drugi lični izvori** — notes, Obsidian vault, email arhiva — Marko procenjuje šta ima smisla dodati

Minimum za pokretanje Stage 0 su **bar dva tipa exporta** (npr. Claude.ai + ChatGPT, ili Claude.ai + Google Takeout). Samo jedan export suviše sužava retrieval test surface.

**Tri pitanja — Marko formuliše lično.**

Kriterijum za dobro Stage 0 pitanje:

- Odgovor **mora** sadržati činjenicu koja **ne postoji u general knowledge modela** — mora doći iz Markove export data-e. Primer loš: "Ko je CEO Egzakta?" (javna informacija). Primer dobar: "Koji je konkretan tehnički razlog što sam odlučio da ne idem Anthropic API direct nego preko LiteLLM proxy-ja, i kada sam to odlučio?"
- Bar jedno pitanje treba da bude **temporal** — traži da sistem razlikuje dve vremenske tačke (npr. "Šta je bila moja pozicija oko X pre januara 2026 vs posle?")
- Bar jedno pitanje treba da bude **multi-hop** — traži povezivanje dve nezavisne instance iz export-a (npr. "Koja je bila konekcija između Y rasprave u Claude.ai i Z task-a u ChatGPT-u?")
- Treće pitanje može biti **single-hop entity lookup** — najprostiji retrieval test kao kontrola

Marko piše sva tri pitanja u `PM-Waggle-OS/sessions/2026-04-XX-preflight-stage-0-questions.md` pre nego što CC krene. CC ne improvizuje pitanja.

---

## Task 1 — Harvest adapter inventory

**Cilj:** utvrditi koji su hive-mind harvest adapteri production-ready za Marko-ove export tipove.

**Output:** sekcija `## Adapter Inventory` u `stage-0-dogfood-2026-04-XX.md`. Tabela sa redovima: adapter naziv, source tip koji pokriva (Google Takeout / Claude.ai / ChatGPT / Gemini / Cursor / drugo), status (production / beta / broken / missing), komentar.

**Method:**
- Pregledaj `hive-mind/packages/harvest-adapters/` (ili nearest equivalent)
- Identifikuj adaptere koji postoje, koji imaju testove, i koji su poslednji put dirnuti (ako je dugo stajao, flag za potencijalni stale status)
- Za svaki od Markovih export tipova, mapiraj na najbolji dostupan adapter ili označi **MISSING** ako ga nema

Ako za neki export tip **nema** adaptera (npr. Marko preda Cursor chat a Cursor adapter ne postoji), taj export tip se preskače iz Stage 0 sa eksplicitnim napomenom u output artifact-u. Ne improvizuj ad-hoc adapter — to bi zamaglilo signal ("da li sistem radi" vs "da li ad-hoc kod radi").

---

## Task 2 — Harvest pipeline execution

**Cilj:** pokrenuti identifikovane adaptere nad Marko-ovim export fajlovima, upisati u hive-mind bitemporal KG storage.

**Output:** sekcija `## Harvest Execution` u stage-0 report-u. Po adapteru: start timestamp, end timestamp, number of frames written, number of entities extracted, number of errors, wall-clock duration, sample 3-5 extracted frames (stratifikovano — ne prvi 5, razbacano preko corpus-a).

**Method:**
- Koristi postojeći hive-mind harvest CLI ili programmatic API (što god je dokumentovano kao preporučen entry point)
- Svi export-i idu u isti bitemporal KG instance — to je cela poenta (cross-source retrieval u Task 3 treba da radi)
- Output putanja za KG storage je **`D:\dogfood-exports\2026-04-20\kg-storage\`** (zaključano) — izolovana od Marko-ove production Waggle instance, pa Stage 0 ne kontaminira njegov produkcijski storage niti obrnuto
- Loguj sve errore — čak i ako harvest pass-uje većinu frame-ova, pojedinačni parse failure-i su signal za buduce adapter popravke

**Fail scenario 2A — harvest adapter crash-uje:**
- Log stack trace, označi adapter kao broken u inventory tabeli, nastavi sa ostalim adapterima ako je moguće
- Ako svi adapteri pucaju → Stage 0 FAIL, ping PM sa recommendation "debug harvest pipeline pre ponavljanja"

**Fail scenario 2B — harvest pass ali 0 frame-ova ingested:**
- Format parsing bug — export format se razlikuje od onog na kom je adapter testiran
- Log konkretan diagnostic (koji field je očekivan, koji je dobijen), ping PM

---

## Task 3 — Query execution kroz full-stack cell

**Cilj:** proći tri Marko-ova pitanja kroz Waggle full-stack cell (isti cell koji će se koristiti u Stage 2), koristeći hive-mind storage koji je upisan u Task 2.

**Output:** sekcija `## Query Results` u stage-0 report-u. Po pitanju:
- Pitanje (verbatim Marko-v tekst)
- Retrieved instances (po ID-u, izvoru, timestamp-u, i kratkom ekscerptu ~50-100 reči)
- Model answer (verbatim, ne rezimiran)
- Marko-va procena: **Specific+Correct** / **Partial** / **Generic** / **Wrong** (popunjava Marko u review fazi, CC ostavlja prazno polje `[Marko:___]`)

**Method:**
- Koristi isti CLI pattern kao Stage 2, ali na single-query nivou umesto benchmark mode:
  ```
  npm run bench -- \
    --cell full-stack \
    --mode single-query \
    --question "<verbatim>" \
    --storage-path <path-to-dogfood-kg> \
    --model qwen3.6-35b-a3b \
    --output preflight-results/stage-0-query-<N>.json
  ```
- Ako `single-query` mode ne postoji u trenutnom runner-u, CC može (a) dodati minimal CLI flag-ovanje ili (b) napisati kratak standalone `scripts/stage-0-query.ts` koji koristi iste interne module kao cell factory iz Sprint 7/8. Bilo koja od dve opcije — CC bira po najmanje invazivnom putu
- Nema judge-a, nema scoring-a — ovo je čisto za Marko-vu ručnu procenu
- Temperature = 0.0 za determinizam kao i u Stage 2

**Cost budget:** ~$5 za sve tri query (sa embedding + full-stack retrieval + Qwen inference). Ako prelazi $10 → stop i ping PM.

---

## Task 4 — Report assembly i ping

**Cilj:** stage-0 report u kanonskoj formi za Marko-vu review + PM ping u PM-Waggle-OS.

**Output 1:** `waggle-os/preflight-results/stage-0-dogfood-2026-04-XX.md` (ISO date of completion). Sadržaj:
1. Status banner — **Infrastructure PASS** (harvest + retrieval radi), **Infrastructure FAIL** (nešto pukne pre nego Marko stigne da procenjuje)
2. Adapter Inventory tabela (Task 1)
3. Harvest Execution sekcija (Task 2) sa error log-om
4. Query Results sekcija (Task 3) — tri pitanja, tri odgovora, `[Marko:___]` prazna polja
5. Cost ledger (Qwen inference + embedding + harvest I/O)
6. Wall-clock log
7. Known issues / deviations — sve što je odstupilo od spec-a, eksplicitno

**Output 2:** `PM-Waggle-OS/sessions/2026-04-XX-preflight-stage-0-handoff.md` — kraći ping za Marka i PM-a:
- Pass/fail infrastructure verdict
- Pointer na full report
- Recommendation: **go** (Marko može da popunjava `[Marko:___]` polja i da donese go/no-go za Stage 1), **no-go** (infrastructure failure, debug-first), ili **partial** (harvest pass ali jedan ili više query vratio empty retrieval — treba tuning pre Stage 1)
- Open questions ako ih ima

---

## Exit gate

- [ ] Task 1 adapter inventory popunjena, realno stanje dokumentovano
- [ ] Task 2 harvest execution logovana za sve korišćene adaptere
- [ ] Task 3 sve tri query-ja izvršene, odgovori kompletni, `[Marko:___]` polja prazna za njegovu procenu
- [ ] Task 4 report + PM ping napisan
- [ ] Cost ledger ≤ $10 total (budget je $5, margin do $10 pre alarma)
- [ ] Zero production Waggle instance kontaminacije (dedicated dogfood storage path)
- [ ] Nijedan export fajl sa Marko-ovim ličnim podacima nije commitovan u repo — `.gitignore` proveren, manual grep potvrđen

Posle ovog sprint-a Marko radi ručnu procenu tri odgovora. Go/no-go za Stage 1 donosi on, bazirano na popunjenim `[Marko:___]` poljima i verdict rubriku iz `preflight-gate-spec.md §2`:

**PASS** = sva tri pitanja procenjena kao **Specific+Correct**
**FAIL** = bar jedno pitanje procenjeno kao **Generic** ili **Wrong**
**PARTIAL** = kombinacija Specific+Correct i Partial — zahteva second-pass review sa Marko-vim komentarom zašto je označeno Partial

## Not in scope (explicit exclusions)

- Stage 1 mikro-eval (12 zadataka × 3 arma)
- Stage 2 preflight 4-cell na preflight-locomo-50.json
- Judge wiring (Sprint 9 scope)
- Harvest adapter feature parity u waggle-os repo-u (parked per `project_harvest_parity_stream.md`, resume posle SOTA dokaza + launch)
- Adapter repair ili novih adapter build — ako je neki adapter broken, logujemo i preskačemo, ne popravljamo u Stage 0 scope-u
- Personal data upload, sync, ili bilo koji external push — sve ostaje lokalno

## Privacy guardrails (explicit)

- Marko-vi export fajlovi nikad ne idu u repo, ne u log output koji bi se share-ovao, ne u bilo koji SaaS tool
- Report artifact (`stage-0-dogfood-2026-04-XX.md`) sme da sadrži: adapter nazive, counts, timing, verbatim pitanja (Marko ih je autorizovao kao scope), i verbatim model answers
- **NE sme da sadrži:** raw frame content iz Marko-vih export-a osim ako je Marko eksplicitno u pitanju naveo konkretan excerpt, i tada samo tačno to što je pitanje
- `[Marko:___]` polja popunjava Marko, ne CC — CC ne sme da donosi procenu o Specific+Correct-u bez Marko-vog input-a

---

## Reference

- Preflight gate spec: `strategy/2026-04-20-preflight-gate-spec.md`
- Sprint 8 exit ping: `sessions/2026-04-20-sprint-8-exit.md`
- Harvest parity stream: `.auto-memory/project_harvest_parity_stream.md`
- Target model: `.auto-memory/project_target_model_qwen_35b.md`
- Preflight OQ resolutions LOCKED: `decisions/2026-04-20-preflight-oq-resolutions-locked.md`
