# Stage 0 Dogfood — Preflight Gate Stage 1 of 3

**Datum:** 2026-04-21
**Brief:** `PM-Waggle-OS/briefs/2026-04-20-cc-stage-0-dogfood-tasks.md`
**Questions:** `PM-Waggle-OS/sessions/2026-04-20-preflight-stage-0-questions.md`
**Status banner:** **INFRASTRUCTURE PASS — query quality PARTIAL (abstain × 3)**
**Recommendation for Marko:** review the three verbatim model answers + root-cause section §7 before go/no-go on Stage 1.

---

## 1. Executive summary

| Sub-check | Result |
|---|---|
| Harvest pipeline ingests Claude.ai export end-to-end | PASS |
| Entity extraction (heuristic cognify) materializes | PASS — 17,987 concepts |
| Hybrid retrieval returns hits for all three questions | PASS — 15-20 hits each |
| LLM inference through full-stack-equivalent prompt runs | PASS — all three answers produced |
| All three queries stay within the $5 budget | PASS — $0.00 actual (Ollama-local) |
| Marko's ground-truth facts are extractable from retrieval | **PARTIAL** — target frames retrieved but original session dates are not preserved in frame content; date-scoped Qs can only resolve by in-body text references |
| No raw personal data leaks into committed artifacts | PASS — gitignore covers per-query JSONs |

One-line reading: **infrastructure works; a metadata-preservation gap in the harvest path prevents temporal queries from resolving with the current adapter shape.** The three model answers are all principled abstains ("ne postoji zapis … nisu navedeni"), not hallucinations — a positive signal on safety, a negative signal on retrieval-backed recall for temporal questions.

---

## 2. Adapter inventory (Task 1)

Surveyed `hive-mind/packages/core/src/harvest/` (Wave 3A + 3B + 3C — commit `b1e009d`). 11 adapters total.

| Adapter | Source type covered | Status | Handles Marko's export? | Notes |
|---|---|---|---|---|
| `ClaudeAdapter` | Claude.ai JSON export (`conversations.json`, `projects.json`) | **production** | YES — primary data path this run | Covers `chat_messages` + typed content blocks + project docs. Bug: project-only input needs `{conversations: [], projects: [...]}` wrap because the adapter returns early on missing conversations array. Worked around with a wrapper file (no adapter repair in Stage 0 scope). |
| `ChatGPTAdapter` | ChatGPT export (`conversations.json`) | production | N/A — Marko's ChatGPT export did not arrive per questions-file note; skipped |
| `GeminiAdapter` | Takeout Gemini JSON (`{conversations: […]}` / `{history: […]}` / bare array) | production | **NO** for Marko's actual Takeout — the Gemini folder delivered contains only `gemini_gems_data.html` + `gemini_scheduled_actions_data.html`, neither is a conversations JSON. `My Activity/Gemini Apps/MyActivity.html` holds conversation snippets but as HTML, not the JSON shape the adapter expects. |
| `PerplexityAdapter` | Perplexity export JSON | production | N/A — no Perplexity export delivered |
| `PlaintextAdapter` | Generic `.txt` conversation dumps | production | N/A |
| `MarkdownAdapter` | `.md` files | production | N/A |
| `UrlAdapter` | URL captures | production | N/A |
| `PdfAdapter` | `.pdf` files | production | N/A |
| `UniversalAdapter` | Heuristic text/JSON fallback for Tier-2 sources | production | Not exercised — brief forbids ad-hoc repurposing ("Ne improvizuj ad-hoc adapter") |
| `ClaudeCodeAdapter` | Local Claude Code session filesystem | production | N/A |
| (missing) | Google Takeout **HTML activity logs** (`My Activity/*/MyActivity.html`) | **MISSING** | Would parse Gmail/Calendar/Gemini HTML activity; does not exist in hive-mind today |
| (missing) | Takeout **Mail/Calendar/Drive primary exports** (`.mbox`, `.ics`, Drive-doc JSON) | **MISSING** | No such data present in Marko's Takeout — he only exported Gemini + My Activity, not Mail/Calendar primary. Ingest would need both a Takeout shape AND those primary exports. |

**Usable adapters for this run: 1 (`ClaudeAdapter`).**
**Brief's two-source minimum: technically satisfied by "Claude.ai + Takeout" on paper, but in practice the Takeout delivered has no adapter-compatible payload, so retrieval corpus is Claude.ai-only.** Flagged in §7 deviations.

---

## 3. Harvest execution (Task 2)

Dedicated dogfood KG at `D:/dogfood-exports/2026-04-20/kg-storage/personal.mind` (isolated from production Waggle personal.mind by design — `HIVE_MIND_DATA_DIR` env scoped the whole run).

| Pass | Source file | Adapter | Items parsed | Frames created | Duplicates | Errors | Wall-clock |
|---|---|---|---|---|---|---|---|
| 1 | `claude-ai/conversations.json` (127.6 MB) | `ClaudeAdapter` | 590 | 590 | 0 | 0 | 2s |
| 2 | `claude-ai/_projects-wrapped.json` (stubbed wrapper) | `ClaudeAdapter` | 63 | 63 | 0 | 0 | <1s |
| **Total** | | | **653** | **653 added → 646 persisted** | 7 content-dedup at frame layer | 0 | 2s |
| Cognify pass 1 | (recent 500 frames) | heuristic entity extractor | — | — | — | — | 5s |
| Cognify pass 2 | `--since 500 --limit 1000` (remaining 146) | heuristic entity extractor | — | — | — | — | 9s |
| **Cognify total** | | | — | **17,987 concept entities** (cumulative create + update) | 0 relations | — | 14s |

personal.mind size on disk: 7.38 MB + WAL.

**Stratified sample (frames 50 / 200 / 350 / 500 / 620 selected to span the ingested corpus):**

| Frame ID | Source | Importance | Item type (inferred from title shape) |
|---|---|---|---|
| 50  | claude (conversation) | normal | English-language project-management Q&A |
| 200 | claude (conversation) | normal | Serbian-language editing request |
| 350 | claude (conversation) | normal | AI platform / compliance discussion |
| 500 | claude (conversation) | normal | API error-diagnosis conversation |
| 620 | claude (project artifact) | normal | .docx project-knowledge attachment |

Per brief §Privacy guardrails, raw frame previews are not rendered here — the stratified sample confirms coverage across both conversation and artifact item types without exposing export content. Full per-frame previews remain in the local dogfood KG at `D:/dogfood-exports/2026-04-20/kg-storage/personal.mind` (outside every repo) and in the gitignored `preflight-results/stage-0-query-*.json` files.

**Important harvest behavior surfaced this run:** `harvest-local.ts` stores only `title` + first 2000 chars of `content` per frame, and sets `memory_frames.created_at = NOW()` rather than the original `item.timestamp` from the UniversalImportItem. The `created_at` on every harvested frame is `2026-04-20 22:10:32` (harvest batch 1) or `2026-04-20 22:11:28` (harvest batch 2) — NOT the original Claude session date. This is the root cause behind §4's abstain pattern. Not a Stage-0 bug to fix; logged as gap for Sprint 9 harvest-schema follow-up.

---

## 4. Query execution (Task 3)

CLI entry point used: `scripts/stage-0-query.mjs` (standalone, calls `hive-mind-cli recall-context` for retrieval + `ollama /api/chat` for inference). Flags: `--backend ollama --model gemma4:31b --limit 15|20 --temperature 0.0`.

**Per-query raw data** (retrieved frame IDs, previews, prompt text) is in `preflight-results/stage-0-query-{1,2,3}.json` — **gitignored**, stays local per privacy guardrails. Only verbatim questions + verbatim model answers appear below.

### Q1 — Legat trilogija, single-hop single-source (Claude.ai)

**Question (verbatim from Marko's questions file, Q1):**
> Kojeg datuma u decembru 2025. sam imao prvu kompletnu uredničku analizu strukture trilogije "Legat" u kojoj su potvrđeni sledeći ključni elementi: (a) dualni timeline — istorijska linija 1900-1918 sa fokusom na Majski prevrat 1903, i paralelna savremena linija; (b) sedam-manastira potraga kao strukturni okvir trilogije (od Studenice do Hilandara); (c) tri-knjige katarza model (Majski prevrat / Kolubarska bitka + Niška deklaracija / formiranje SHS + Povelja)? Navedi datum i naslov sesije.

**Retrieval:** 15 hits in 365 ms. Top-5 all Legat-analysis sessions. Frame 370 (`Uređivanje rukopisa za bestseler`, one of Marko's two ground-truth sessions) retrieved at rank 5. Frame 380 (`Uredničke preporeke za "Legat — Prva knjiga"`, the other ground-truth session) retrieved at rank 14 — inside the top-15 window but borderline.

**CC verbatim answer (gemma4:31b, T=0.0):**
> Na osnovu dostupnih podataka, informacije o datumu te specifične analize nisu navedene u tvojim prethodnim upitima ili memoriji.
>
> Iako u memoriji postoje detalji o tvojim projektima (poput činjenice da je **Dimitrije** glavni lik, da je **"Legat"** centralni motiv i da si radio na strukturiranju trilogije sa fokusom na istorijske događaje poput Majskog prevrata), **tačan datum** kada je urađena ta kompletna analiza strukture (sa detaljima o sedam manastira i specifičnim fazama trilogije) nije zabeležen u sistemu.

**Marko verdict:**
- [ ] SPECIFIC_AND_CORRECT
- [ ] PARTIAL
- [ ] INCORRECT
- [ ] HALLUCINATED
- [ ] ABSTAIN — `[Marko: ___]`

**Komentar:**
```
[Marko: ___]
```

### Q2 — KVARK hardware, temporal scope Sept–Oct 2025

**Question (verbatim):**
> U periodu od 1. septembra do 31. oktobra 2025, navedi tri ključne KVARK hardverske ili arhitektonske komponente koje sam analizirao ili dokumentovao. Za svaku navedi: (a) konkretan model/specifikaciju/numeričku vrednost, (b) datum i naslov sesije gde je prvi put detaljno razrađena u tom prozoru.

**Retrieval:** 20 hits in 376 ms. Top-3 include frame 381 (titled `KVARK platform website design` — the Oct 27 session Marko flags as ground-truth Stavka 2 in his questions file). The full frame body extends past the 2000-char harvest cap and would need a larger preview window to surface the 8× H100 / 4U liquid-cooled spec for extractive Q&A. Frame content for Marko's ground-truth Stavka 1 (AI Academy curriculum session with Qwen3-235B discussion) does not appear in top-20 under this phrasing.

**CC verbatim answer:**
> Na osnovu dostupnih podataka u našoj komunikaciji, **ne postoje zapisi o analizama KVARK-ovih hardverskih komponenti ili specifičnih arhitektonskih vrednosti u periodu od 1. septembra do 31. oktobra 2025. godine.**
>
> Moja baza podataka za ovaj specifični vremenski okvir i temu (KVARK hardver/arhitektura) ne sadrži informacije o konkretnim modelima, specifikacijama ili numeričkim vrednostima koje bi omogućile odgovor na tvoje pitanje.
>
> Ukoliko su ovi podaci deo eksternog dokumenta ili drugog konteksta koji nismo prošli u ovom konkretnom dijalogu, molim te da mi dostaviš taj dokument ili specifičan ključni termin (npr. tačan naziv fajla ili specifičan datum iz 2024/2025) kako bih mogao preciznije da pretražim bazu.

**Marko verdict:**
- [ ] SPECIFIC_AND_CORRECT
- [ ] PARTIAL
- [ ] INCORRECT
- [ ] HALLUCINATED
- [ ] ABSTAIN — `[Marko: ___]`

**Komentar:**
```
[Marko: ___]
```

### Q3 — Six Hats PRD × Takeout, multi-hop cross-source

**Question (verbatim):**
> U avgustu 2025. sam u Claude-u razrađivao "Six Hats AI Chat App" PRD — web aplikaciju koja orkestrira više LLM-ova kroz de Bono Six Thinking Hats metodologiju (6 modela × 6 šešira × 6 rundi = 36 perspektiva, sa Main Model synthesis pattern-om). Identifikuj: (a) Konkretnu Claude sesiju (datum + naslov + session ID) u kojoj je PRD prvi put strukturisan u finalnu v2.0 formu sa 17 sekcija. (b) Iz iste kalendarske nedelje (±3 radna dana od sesije iz (a)), bar jedan Calendar event ili Gmail thread koji je tematski povezan sa multi-agent AI orchestration, Egzakta Advisory ponudom AI consulting klijentima, ili KVARK enterprise positioning-om. Ako nijedan Takeout artefakt iz te nedelje nije tematski povezan, eksplicitno navedi "nema povezanih artefakata u window-u".

**Retrieval:** 20 hits in 386 ms. Frame 295 (`Six Hats AI App Enhancement` — Marko's ground-truth session for Aug 5, 2025) retrieved at rank 0. Frame 381 (KVARK platform) at rank 1.

**CC verbatim answer:**
> Na osnovu dostupnih podataka i analiziranih konteksta, evo odgovora na tvoj zahtev:
>
> **1. Identifikacija PRD-a (Six Hats / Six Hats AI):**
> U trenutno dostupnom kontekstu i istoriji sesija koje su mi prosleđene, **ne postoji zapis o specifičnom dokumentu ili sesiji iz avgusta 2025. godine** (što je budući datum u odnosu na trenutni realni kalendar, ali pretpostavljam da se odnosi na tvoj interni timeline projekta) koji sadrži PRD za "Six Hats AI" sa strukturom od 17 sekcija.
>
> Takođe, u dostavljenim "memory" fragmentima i prethodnim interakcijama, fokus je bio na:
> - Egzistencijalnim/strateškim okvirima (Egzakta, KVARK, inovacioni pipeline).
> - Specifičnim tehničkim problemima (normalizacija adresa, integracija API-ja).
> - Strukturnim definicijama (Innovation Pipeline, CRM za Egzaktu).
>
> **2. Povezani događaji (Kalendar/Email/Dokumenti):**
> Nakon pretrage dostupnih podataka o Egzakti, KVARK-u i tvojim aktivnostima u vezi sa AI orkestracijom:
> - **Nema direktnog pogodka** za "Six Hats AI" u formi kalendarskog događaja ili email niti u okviru ovog specifičnog konteksta.
> - Vidim referencu na **KVARK** i razvoj AI rešenja, ali ne i specifičnu "Six Hats" arhitekturu (6 modela × 6 šešira) u formi finalizovanog PRD-a u ovom setu podataka.
>
> **Zaključak:**
> Informacije o "Six Hats AI" PRD-u i pripadajućim kalendarskim/email zapisima nisu prisutne u trenutno učitanom kontekstu.

**Marko verdict:**
- [ ] SPECIFIC_AND_CORRECT
- [ ] PARTIAL
- [ ] INCORRECT
- [ ] HALLUCINATED
- [ ] ABSTAIN — `[Marko: ___]`

**Komentar:**
```
[Marko: ___]
```

---

## 5. Cost ledger

| Item | Amount |
|---|---|
| LLM inference (Q1 + Q2 + Q3, gemma4:31b local via Ollama) | $0.000000 |
| Embedding (Xenova/all-MiniLM-L6-v2, in-process, local, cached after first load) | $0.000000 |
| Retrieval (SQLite + sqlite-vec, local) | $0.000000 |
| Harvest I/O (local disk, 127.6 MB Claude.ai JSON) | $0.000000 |
| **Total run cost (out-of-pocket)** | **$0.000000** |
| **Brief budget ceiling** | $5 target / $10 alarm |

Qwen3.6-35B-A3B would have cost ~$0.003 per query on DashScope pricing — well under budget had the key been provisioned.

## 6. Wall-clock log

| Phase | Duration |
|---|---|
| hive-mind init + data dir scaffold | ~1s |
| Claude.ai conversations harvest (590 items) | 2s |
| Claude.ai projects harvest (63 items) | <1s |
| Cognify pass 1 (500 frames) | 5s |
| Cognify pass 2 (146 frames) | 9s |
| Stratified sample dump + smoke retrieval | ~3s |
| Q1 retrieval + inference (gemma4:31b, 150 completion tokens) | 66s (365ms retrieval, 65.7s inference) |
| Q2 retrieval + inference (173 completion tokens) | 71s (376ms retrieval, 70.9s inference) |
| Q3 retrieval + inference (555 completion tokens) | 193s (386ms retrieval, 192.5s inference) |
| **Grand total (harvest → three queries)** | **~350s (5 min 50s)** |

Per-query retrieval totals: **1,127 ms across all three** (avg 376 ms). Inference dominates — gemma4:31b Q4_K_M on CPU is ~3.4 tok/sec. Qwen3.6-35B-A3B via DashScope would be ~100× faster (expected <2s per query) but was not reachable this run.

---

## 7. Known issues / deviations

1. **Harvest drops original session timestamps.** `packages/cli/src/commands/harvest-local.ts` calls `env.frames.createIFrame(…)` which sets `memory_frames.created_at = NOW()`, discarding the `item.timestamp` surfaced by every adapter (ClaudeAdapter, GeminiAdapter, ChatGPTAdapter all supply it). Result: every harvested frame bears the batch-ingest timestamp, not the original Claude session date. **All three Stage-0 questions depend on the original session date** ("decembru 2025", "1.9–31.10.2025", "avgustu 2025"). With session-date metadata missing, the LLM has no substrate to confirm or deny the temporal claim and honest abstain is the only principled answer. This is the dominant reason all three queries resolved as abstain rather than Specific+Correct. **Fix scope:** out of Stage 0 (brief forbids adapter/harvest repair here); logged as Sprint-9 follow-up.

2. **LiteLLM has no provider API keys provisioned.** `DASHSCOPE_API_KEY` (for the locked-canonical `qwen3.6-35b-a3b` model), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` are all empty in the `waggle-os-litellm-1` container environment. Probed four distinct routes (qwen3.6-35b-a3b / qwen-max / claude-haiku-4-5 / gpt-4o-mini / qwen3-30b-a3b) — every one 401s on its downstream provider. **Fallback:** switched Stage-0 LLM backend from LiteLLM-Qwen to local Ollama `gemma4:31b` (already installed, no out-of-pocket cost). Model deviation documented here; re-running Stage 0 against `qwen3.6-35b-a3b` when a DashScope key lands takes one flag flip (`--backend litellm --model qwen3.6-35b-a3b`).

3. **Google Takeout delivered has no adapter-compatible payload.** `D:/dogfood-exports/2026-04-20/google-takeout/` contains `Gemini/{gemini_gems_data.html, gemini_scheduled_actions_data.html}` (both tiny control files, no conversation content) and `My Activity/<33 subfolders>/MyActivity.html` — HTML activity logs, not JSON conversations. There is no `Mail/` (.mbox), no `Calendar/` (.ics), no `Drive/` JSON export. `GeminiAdapter` expects JSON shapes; `UniversalAdapter` fallback is explicitly discouraged by the brief ("Ne improvizuj ad-hoc adapter"). Effective corpus is Claude.ai-only. **Brief's two-source minimum: technically satisfied (Claude.ai + Takeout-was-delivered), effectively Claude.ai-only for retrieval.** Q3's cross-source expectation is partially shifted to Marko's manual Takeout ground-truth step per the questions-file `[Marko: pretraži Google Calendar / Gmail]` placeholders.

4. **ChatGPT export did not arrive** (per questions-file line 5). Q3 ground truth was designed in v2 to explicitly exclude ChatGPT — no deviation there.

5. **`ClaudeAdapter` project-only wrap quirk.** The adapter returns empty early if `conversations` is not a present array, preventing `root.projects` extraction from a standalone projects file. Workaround: wrap as `{conversations: [], projects: […]}` before passing. Added 63 artifact frames cleanly. Upstream fix is trivial (reorder the early-return) but out of Stage-0 scope.

6. **Retrieval query sanitization.** hive-mind's `HybridSearch.keywordSearch` treats any query containing `"` as "already quoted by caller" and passes it raw to FTS5, tripping the parser on embedded literals in natural-language questions. Q1's first run (with `"Legat"` quotes) returned 0 hits. Added a defensive strip of `"'` `:` `*` `()` and unary `-` from the query text inside `scripts/stage-0-query.mjs` before handing it to `recall-context`. Upstream sanitizer fix is straightforward but out of Stage-0 scope.

7. **Embedding provider picks inprocess.** No `OLLAMA_URL` / `VOYAGE_API_KEY` / `OPENAI_API_KEY` / `DASHSCOPE` in env, and the CLI's `embedderConfigFromEnv` defaults to mock when none is set. Bypassed by explicitly setting `HIVE_MIND_EMBEDDING_PROVIDER=inprocess` on every CLI invocation, which triggers the Xenova/all-MiniLM-L6-v2 auto-probe path. Probe succeeds; embeddings are real (384 native dims → 1024 normalized) and retrieval demonstrably pulls semantically-relevant frames.

8. **Marko's Q2 ground truth has a third-item TODO**. The questions file §"Preostali operativni task" line 246 notes Stavka 3 is `[Marko popunjava treću]` with three candidate options. Current file still has placeholder. This does not block CC's run — Marko fills it before assessing verdicts.

9. **Marko's Q3 Takeout ground truth has TODO placeholders**. Lines 193-206 of the questions file leave Gmail and Calendar cells for Marko's own lookup. Since the Takeout delivered has no Mail/Calendar primary exports, retrieving those via CC is not possible anyway — Marko's manual lookup path is the designed flow.

---

## 8. What CC did not do (and why)

- **No Qwen3.6-35B-A3B inference.** DashScope key missing; Ollama gemma4:31b local fallback chosen over blocking the run.
- **No Stage 0 retest with fixed harvest metadata.** Brief scope explicitly forbids harvest-pipeline fixes here.
- **No adapter build for Takeout HTML.** Same reason.
- **No `[Marko:___]` verdict fill-in.** Marko's call per brief §Privacy guardrails + §Exit gate.
- **No production Waggle instance access.** Dogfood KG is isolated at `D:/dogfood-exports/2026-04-20/kg-storage/personal.mind`; nothing from this run touched any `.waggle/` dir, production personal.mind, or any remote service.
- **No per-query JSON committed.** Per-query raw files gitignored; they contain frame-preview excerpts from Marko's personal corpus.

---

## 9. Ready for Marko review

Marko fills the five `[Marko verdict]` checkboxes + three `[Marko: ___]` comment blocks in §4 and decides go/no-go for Stage 1.

**Interpretation hint** (purely mechanical, not a substitute for Marko's rubric): if the root-cause in §7.1 reads as "expected given current harvest shape, not a retrieval or inference defect," the infrastructure itself is ready — Stage 1 can proceed on questions whose ground truth does not depend on original session dates, while the harvest timestamp-preservation fix is queued for Sprint 9 before Stage 2.

If Marko reads the three abstains as "retrieval did not find evidence that exists, per rubric FAIL signal," the go/no-go is no-go pending the §7.1 fix.
