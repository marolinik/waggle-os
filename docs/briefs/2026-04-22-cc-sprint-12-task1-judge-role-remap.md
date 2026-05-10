# CC Brief — Sprint 12 Task 1 Judge Role Remap (B2 LOCK alignment)

**Datum:** 2026-04-22 PM
**Autor:** PM
**Prethodni:** Session 2 exit ping, Surprise #5 (judge role mapping konflikt)
**Odluka (Marko):** "Slažem se sa preporukom za sva tri primary. Push sada, slažem se."
**Scope:** 4. commit Sprint 12 Task 1 — nakon push-a tri postojeća commita (`8466eaf`, `b7e52fc`, `a6e4be9`) na `origin/main`.
**Procena:** 15-30 min, $0 LLM spend.

---

## 1. Zašto ovo radimo

Session 2 je implementirao judge role mapping prateći primer iz brief-a (§ 2.1 B):
- Opus 4.7 → `primary`
- GPT-5.4 → `secondary`
- Gemini 3.1 → `secondary`
- Grok 4.20 → `tertiary`

Međutim, **B2 LOCK § 1 je autoritativni izvor** i kaže:
- Opus 4.7 + GPT-5.4 + Gemini 3.1 = **sva tri `primary`** (3-vendor primary ensemble)
- Grok 4.20 = **`reserve`** (tie-break only)

Brief je operativni dokument, B2 LOCK je strukturalna odluka. Autoritet hijerarhije je jasan: LOCK pobeđuje brief. Remap je surgical, 4. commit izoluje promenu od Session 2 trojke radi granularnog rollback-a.

---

## 2. Execute sequence

### Korak 1 — Push Session 2 commits (pre remap-a)

```
git push origin main
```

Expected output: `origin/main` napreduje za 3 commita (`8466eaf` → `b7e52fc` → `a6e4be9`). Ovo ide **prvo** da Session 2 trojka ostane čista u git istoriji pre nego što remap uđe.

### Korak 2 — Edits

**File A: `benchmarks/harness/config/models.json`**

Promeni `judge_role` vrednosti:
- `gpt-5.4` entry: `"judge_role": "secondary"` → `"judge_role": "primary"`
- `gemini-3.1` entry: `"judge_role": "secondary"` → `"judge_role": "primary"`
- `grok-4.20` entry: `"judge_role": "tertiary"` → `"judge_role": "reserve"`

`claude-opus-4-7` ostaje `"judge_role": "primary"` (nema promene).

**File B: `benchmarks/harness/src/types.ts`**

`JudgeRole` enum treba da se proširi za `reserve`. Trenutna definicija verovatno ima `'primary' | 'secondary' | 'tertiary'`. Promeni u:

```ts
export type JudgeRole = 'primary' | 'secondary' | 'tertiary' | 'reserve';
```

Zadrži `secondary` i `tertiary` u enumu radi backward-compat — nijedan trenutni entry ih ne koristi nakon remap-a, ali budući modeli mogu.

**File C: `benchmarks/harness/tests/models-config.test.ts`**

Session 2 je dodao 2 assertion-a koji sada promašuju:
- "Grok 4.20 tertiary + `floating_alias` + `xai_via_openrouter`" → promeni `tertiary` → `reserve`
- "GPT + Gemini secondary + floating_alias" → promeni `secondary` → `primary`

Plus ako postoji test koji validira `judge_role` enum vrednosti po entry-u, proveri da pokriva sve 4 uloge (`primary`, `secondary`, `tertiary`, `reserve`). Ako ne, dodaj minimalnu coverage proveru.

### Korak 3 — Verify

```
cd benchmarks/harness
npx tsc --noEmit
npm test
```

Expected: 138/138 green (nema promene u test count-u; 3 assertion-a flip-uju vrednosti, ne broj).

### Korak 4 — Commit

```
git add benchmarks/harness/config/models.json \
        benchmarks/harness/src/types.ts \
        benchmarks/harness/tests/models-config.test.ts

git commit -m "fix(benchmarks): Sprint 12 Task 1 B2 LOCK alignment — judge roles remap per B2 LOCK § 1

B2 LOCK § 1 treats Opus 4.7 + GPT-5.4 + Gemini 3.1 as a 3-vendor primary
ensemble with Grok 4.20 as tie-break reserve. Session 2's initial mapping
(from brief § 2.1 B example) placed GPT + Gemini as secondary and Grok as
tertiary. This commit aligns judge_role values with the LOCK authority.

Changes:
- models.json: GPT-5.4 secondary → primary, Gemini 3.1 secondary → primary,
  Grok 4.20 tertiary → reserve
- types.ts: JudgeRole enum extends with 'reserve' (secondary/tertiary
  retained for backward compat)
- models-config.test.ts: 2 assertions updated to reflect new mapping

Test count unchanged (138/138 harness green). tsc clean."
```

### Korak 5 — Push

```
git push origin main
```

`origin/main` napreduje za 4. commit.

---

## 3. Acceptance criteria

- [ ] Session 2 trojka push-ovana (3 commita na `origin/main`)
- [ ] `models.json`: Opus/GPT/Gemini = `primary`, Grok = `reserve`
- [ ] `types.ts`: `JudgeRole` uključuje `reserve`
- [ ] 138/138 harness tests green
- [ ] `tsc --noEmit` clean
- [ ] 4. commit push-ovan na `origin/main`

---

## 4. Out of scope

- Ništa osim gore nabrojanog. Blockers #5 + #6 i smoke test suite ostaju za Session 3.
- Ne diraj judge-runner.ts, ne diraj preregistration.ts, ne diraj B3 addendum per-row pinning fields.
- Bez novih deps, bez refactor-a.

---

## 5. Ako naiđeš na nešto neočekivano

Surprises §-policy važi: ne blokira, zabeležiš u session close ping sa ACCEPT/REMAP predlogom. Ali ovo je surgical remap — očekivanje je da ide clean za 20 minuta. Ako `JudgeRole` enum već ima `reserve` (što ne verujem, Session 2 ga nije dodao), samo preskoči tu izmenu u types.ts.

---

**Signal PM-u kada se završi:** kratak exit ping sa 4. commit SHA-om + confirmation da je origin/main na 4 commita dalje od pre-Session-2 baseline-a.
