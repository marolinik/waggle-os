# CC-1 — Day 2 AM Kickoff Brief

**Datum:** 2026-04-22 PM (issued for 2026-04-23 AM start)
**Sprint:** 11 · Pre-flight readiness
**Day 1 close:** 3/10 exit kriterijuma CLOSED (A1, B1, C1)
**Day 2 ceiling:** $0.30 ukupno · hard alarm 130% = $0.39
**Owner:** CC-1
**PM:** Marko + Cowork

---

## Šta tražim

Tri zadatka **paralelno** u Day 2 AM (A2 + B2 + B3). Svi su unblocked. Day 1 ratifikacioni gateway je prošao 2026-04-22 EOD; sve PM LOCK odluke su zaključane i referencirane dole.

---

## Task A2 — reasoning_content capture (harness only)

**Scope:** SAMO reasoning_content extraction po design doc §6 (7 koraka). turnId plumbing je već LIVE na HEAD `e1ae0a4` (≥50 hits, 9 fajlova) — **NE re-implementiraj generator ni threading.**

**Authoritative dokumenti:**
- Design doc: `D:\Projects\waggle-os\docs\plans\H-AUDIT-1-DESIGN-DOC-2026-04-22.md` (commit `008deac`)
- PM ratifikacija sa 5 odgovorenih open questions: `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-h-audit-1-design-ratified.md`

**Eksplicitne odluke iz ratifikacije (mora se poštovati):**
1. **Parser precedence — DUAL-SHAPE, redom:**
   - `body.choices?.[0]?.message?.reasoning_content` (DashScope native primary)
   - `body.choices?.[0]?.message?.reasoning` (OpenRouter unified, current bridge)
   - `body.reasoning_content` (legacy fallback)
2. **Observability:** `llm.response` pino event MORA imati `reasoningShape: 'message.reasoning_content' | 'message.reasoning' | 'body.reasoning_content' | 'unknown'`. Emit `reasoning_content_shape_unknown` warning ako thinking=true a nijedan shape nije present (no throw).
3. **Persistence:** isti JSONL row, net-new fields `reasoning_content` + `reasoning_content_chars` na `JsonlRecord`. Read-path pruning kroz `readJsonl(path, { includeReasoning: false })`. Write-path uvek full.
4. **Retention:** Tier 1 sprint-internal probes pruned at sprint close (gitignored `benchmarks/results/`). Tier 2 launch-claim runs (H-42a/b) gzipped to `benchmarks/archive/*.jsonl.gz`, 12mo minimum.

**HARD STOP signali (anti-patterns §7 design doc-a):**
- Ne dirati turnId generator (`turn-context.ts:29 generateTurnId()`).
- Reasoning_content NIKAD u frames / memory / KG / UI / MCP payload.
- Reasoning_content NIKAD u judge prompt (invalidira Sprint 10 Task 2.2 Fleiss' κ=0.8784 lock).

**Budget:** $0
**Exit ping:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-22-sprint-11-h-audit-1-exit.md`
**CLOSE kriterijum:** §4 design doc rows 4–7 green (rows 1–3 već green na HEAD).

---

## Task B2 — Tie-break policy implementacija

⚠️ **VENDOR SWAP DELTA vs originalni Sprint 11 brief §3 B2:**

Originalna verzija je navela `claude-sonnet-4-6` kao fourth vendor. **Marko je 2026-04-22 LOCKED zamenu na `xai/grok-4.20`.**

**Authoritative LOCK dokument (mora pročitati pre koda):**
- `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-tie-break-policy-locked.md`

**Konkretna implementacija:**

- **Novi fajl:** `packages/server/src/benchmarks/judge/ensemble-tiebreak.ts`
- **Interface:** `resolveTieBreak(votes: Vote[]): TieBreakResult` gde:
  ```ts
  type TieBreakResult = {
    verdict: string;
    path: 'majority' | 'quadri-vendor' | 'pm-escalation';
    votes: Vote[];
  };
  ```
- **Quadri-vendor branch:** poziva `xai/grok-4.20` (LiteLLM route). NE Sonnet 4.6, NE Opus 4.7, NE Grok 4.3 Beta.
- **xAI infra:** `XAI_API_KEY` (84 chars) live u `D:\Projects\waggle-os\.env`. Route `xai/grok-4.20` već wired u `litellm-config.yaml` (od PA v5, 2026-04-17). Nula nove infrastrukture.
- **4 unit testa:**
  1. `1-1-1` split → trigger quadri-vendor call na `xai/grok-4.20`, verifikuj system prompt + rubric payload
  2. `1-1-2` split → already majority, no tiebreak call
  3. `2-1-1` split → majority wins, no tiebreak call
  4. `3-0` consensus → trivial verdict, no tiebreak call
- **Observability:** pino log polja `tie_break.path` ∈ `{none, majority, quadri-vendor, pm-escalation}` + `tie_break.fourth_vendor_slug` (uvek `grok-4.20` u Sprint 11 scope-u, ali field future-proof).
- **Integracija:** u postojeći ensemble orchestration path (Sprint 10 Task 2.2 ratified ensemble: Opus 4.7 + GPT-5.4 + Gemini 3.1).

**HARD STOP:**
- Ne predlaži Opus 4.7 kao tie-break (već je Judge 1).
- Ne predlaži Sonnet 4.6 (vraća na 2-Anthropic problem, suprotno od Sprint 10 multi-vendor odluke).
- Ne predlaži Grok 4.3 Beta (locked iza SuperGrok Heavy $300/mo, nije na našem tier-u).

**Budget cap:** $0.20 za grok-4.20 calls u unit testu (xAI pricing comparable Anthropic Sonnet, no cost surprise).
**Wall-clock:** 2-3h
**Exit ping:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-22-sprint-11-b2-tiebreak-exit.md` sa: commit hash, test results (4/4 expected green), pino log sample sa `tie_break.*` fields, jedan example actual quadri-vendor call cost.

---

## Task B3 — Opus 4.6 route audit

**Scope:** klasifikuj sve reference na claude-opus / claude-sonnet model snapshotove i alias-e u kodu, izveštaj sa preporukom za naming convention LOCK.

**Konkretni koraci:**
1. `grep -rn "claude-opus\|claude-sonnet-4" packages/server/ packages/cli/`
2. Za svaku referencu klasifikuj:
   - **(a) dated snapshot** (npr. `claude-opus-4-6-20251014`, `claude-opus-4-7-20260201`)
   - **(b) floating alias** (npr. `claude-opus-4-6`, `claude-opus-4-7`)
   - **(c) provider-prefixed** (npr. `anthropic/claude-opus-4-7`)
3. Output report fajl: `D:\Projects\waggle-os\docs\reports\opus-4-6-route-audit-2026-04-22.md`
   - Tabela: file path → line → reference → klasa (a/b/c) → preporuka (zadržati / migrate na pinned snapshot / migrate na floating alias)
4. PM review report → ja izdajem `decisions/2026-04-22-model-route-naming-locked.md` LOCK convention.

**Budget cap:** $0.10 (read-only audit, samo grep + classify)
**Wall-clock:** 1-2h
**Exit ping:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-22-sprint-11-b3-opus46-audit-exit.md` sa: report file path, count by class, top 3 najprioritetnijih cleanup-a.

---

## Day 2 AM execution rules

**Paralelizam:** A2 + B2 + B3 mogu trčati istovremeno (no inter-dependence). Predlog redosleda po complexity load: B3 (najlakši, čisti audit) → B2 (mid, treba unit testovi) → A2 (najteži, harness extension).

**Cumulative budget Day 2:** $0.30 ($0 + $0.20 + $0.10). Hard alarm at 130% = $0.39. Ako tokom rada vidiš da grok-4.20 unit testovi pretiti da preskoče $0.20 cap → STOP, ping PM, ne nastavi.

**Logging:** sve LIVE pozive (B2 unit testovi, eventualni A2 smoke verifikacija) loguj sa `cost_usd` i `latency_ms` u test output.

**Exit kriterijumi za Day 2 AM blok:**
- A2 CLOSED → §4 design doc rows 4–7 green + exit ping fajl postoji
- B2 CLOSED → 4/4 unit testovi green + LOCK doc reference verifikovan u commit message + exit ping fajl
- B3 CLOSED → report fajl postoji + classification complete + exit ping fajl

Kada sva tri exit ping-a budu na disku, PM (Cowork) izdaje Day 2 AM close memo i autorizuje C2 (Stage 1 mikro-eval) za Day 2 PM ili Day 3 AM.

---

## Reference (sve pročitati pre koda)

| Dokument | Path |
|---|---|
| Sprint 11 master brief | `D:\Projects\PM-Waggle-OS\briefs\2026-04-22-cc-sprint-11-kickoff.md` |
| A1 ratifikacija (A2 scope LOCK) | `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-h-audit-1-design-ratified.md` |
| H-AUDIT-1 design doc | `D:\Projects\waggle-os\docs\plans\H-AUDIT-1-DESIGN-DOC-2026-04-22.md` (commit `008deac`) |
| Tie-break policy LOCK (B2 vendor swap) | `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-tie-break-policy-locked.md` |
| Stage 2 config LOCK (kontekst) | `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-stage-2-primary-config-locked.md` |
| Sprint 11 scope LOCK | `D:\Projects\PM-Waggle-OS\decisions\2026-04-22-sprint-11-scope-locked.md` |
| Day 1 status | `D:\Projects\PM-Waggle-OS\sessions\2026-04-22-sprint-11-day-1-status.md` |
| LiteLLM config (vendor routes) | `D:\Projects\waggle-os\litellm-config.yaml` |

---

**Idi.**
