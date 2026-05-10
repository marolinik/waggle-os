---
title: JsonlRecord Taxonomy Namespace Split — LOCKED
date: 2026-04-23
decision-id: sprint-12-task-2-c3-mini / pre-kick §2.1
status: LOCKED
authority: Marko Marković (PM)
supersedes: (new decision, no prior LOCK on this surface)
related:
  - decisions/2026-04-22-bench-spec-locked.md (A3 LOCK v1 §6 failure taxonomy)
  - briefs/2026-04-23-cc-sprint-12-task2-c3-mini-kickoff.md (§2.1 source)
  - sessions/2026-04-22-cc-sprint-12-task1-session3-exit.md (Task 1 Session 3 Surprise #2)
---

# Odluka

`JsonlRecord` shape u `benchmarks/harness/src/types.ts` (ili ekvivalentan modul) dobija **Opcija C — Namespace Split**:

- **Nova A3-namespace polja:**
  - `a3_failure_code: FailureCode` — 8-value space iz A3 LOCK §6 (F1, F2, F3, F4, F5, F6, F_other, null)
  - `a3_rationale: string | null` — free-text; **mandatory non-null kada `a3_failure_code === "F_other"`**, inače opcionalan
- **Legacy Sprint 9 polja zadržana kao read-only:**
  - `judge_failure_mode?: FailureMode | null` — stara 5-value space (F1-F5)
  - `judge_rationale?: string`
  - Legacy polja se NE populiraju na novim A3 run-ovima. Čitači koji obrađuju pre-A3 arhive (C2 stage 1, B1/B2/B3 smoke) nastavljaju da ih čitaju iz JSONL fajlova bez promjena.

# Zašto Opcija C (ne A ili B)

**Protiv Opcije A (Extend — duplikacija schema):** Ekstenzija dodaje 8-value polje pored 5-value polja bez eksplicitnog naming kontrakta. Grep-om se ne razlikuju A3 record-ovi od pre-A3 record-ova; downstream analiza mora implicitno znati koji skup polja je autoritativni. Pogoršava forensic čitljivost C2 arhive.

**Protiv Opcije B (Deprecate — breaking):** Uklanjanje Sprint 9 polja bi preimenovalo postojeće JSONL fajlove u neparsiranje za stare reader-e. C2 stage 1 arhiv je pre-registracijski forensic signal (shape drift je namjerno dokumentovan); brisanje tog signala destructively bi ga uklonilo iz rekorda. Za proof obligations prema vanjskim auditorima (Anthropic, hive-mind Apache 2.0 komunita) ovo je neprihvatljivo.

**Za Opcija C (Namespace split):** Aditivna promjena, $0 breaking risk, grep-friendly (`a3_` prefix eksplicitno identifikuje A3 taxonomy column). Forensic kontinuitet očuvan — C2 i pre-A3 arhivi se čitaju starim parserom, novi A3 run-ovi se čitaju novim parserom, overlap area je eksplicitno namjerna. Auditor može u bilo kom trenutku dokazati da se 5-value i 8-value space koegzistuju bez semantičkog sudara.

# Implementacione obaveze (CC-1)

1. Dodati `a3_failure_code` i `a3_rationale` u `JsonlRecord` type definiciji. Preferrably kao required polja za A3 pipeline-written record-ove (default `null` / `null`), opcionalna samo za legacy readers.
2. Judge-response parser koji izlazi iz 3-primary ensemble vote mora emitovati `a3_failure_code` sa validnom vrijednošću iz F1-F6+F_other set-a. Validator (Blocker #6 commit `00157b1`) mora odbiti null+non-F_other kombinacije van taxonomy set-a.
3. `a3_rationale` mora biti non-null string kada `a3_failure_code === "F_other"`. Runner test-suite mora pokriti taj constraint (vidi `packages/server/tests/benchmarks/failure-taxonomy.test.ts` parity ako postoji).
4. Sprint 9 `judge_failure_mode` i `judge_rationale` polja se **ne** populiraju na A3 run output-u. Parser koji ih obrađuje mora ih default-ovati na `undefined` u A3 kontekstu (ne na prazan string).
5. Aggregate JSON (`aggregate.json` pattern iz Blocker #6 commit `00157b1`) mora pročitati iz `a3_failure_code` kolone, ne iz Sprint 9 kolone. Grep exit criterion u Task 2 brief §6 +12 koristi `a3_failure_code` kao autoritativni ključ.
6. Commit poruka sugerisana: `feat(benchmarks): A3 failure taxonomy namespace split — a3_failure_code + a3_rationale preserving Sprint 9 legacy fields`.

# Primjena na Task 2 C3 mini kickoff

Ova odluka odblokira §2.1 PRE-KICK HALT u `briefs/2026-04-23-cc-sprint-12-task2-c3-mini-kickoff.md`. CC-1 sada može pristupiti types.ts ekstenziji paralelno sa §2.2 OpenRouter slug verifikacijom i §2.3 `resolveTieBreak` wire-om, bez čekanja daljih PM odluka.

Exit criterion +12 u briefu §6 ostaje kako je napisano: `jq '.a3_failure_code' benchmarks/runs/2026-04-23-c3-stage2-mini/*.jsonl | sort | uniq -c` mora mapirati na `failure_distribution.counts` u `aggregate.json`.

# Posljedice za budući rad

- H-42a/b full LoCoMo run (Stage 2 pune N=1540) naslijediće isti namespace split bez daljih odluka.
- Gemma Week 3 probe (LOCKED 2026-04-20) također koristi `a3_` namespace.
- Pre-A3 arhiv (C2 stage 1, B-smoke outputs) nije migrirativan; čita ga legacy parser kao što jeste.
- Ako se u budućnosti otkrije potreba za re-namespacing-om (npr. v2 taxonomy), slijedi se isti pattern: novi prefix (`a4_`), staro ostaje read-only.
