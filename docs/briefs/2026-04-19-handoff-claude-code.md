# Handoff za Claude Code — 2026-04-19

**Od:** Marko (preko PM agenta)
**Cilj:** Claude Code zatvara Polish + standing pool dok PM agent radi engineering audit paralelno.

---

## Šta je odlučeno (LOCKED 2026-04-19)

Tri-track sekvenca do launch-a. Detalji u `decisions/2026-04-19-tracks-sequencing-locked.md`.

**Track 1 (tvoj zadatak sad):** Polish + standing pool, blocker za Track 2.
**Track 2 (kreće posle Track 1 + audit):** Tri benchmarka paralelno.
**Track 3 (paralelno sa Track 2):** UI/UX + e2e.

Target model za ceo stack je sad **Qwen/Qwen3.6-35B-A3B** (LOCKED + VERIFIED 2026-04-19, HF model card: https://huggingface.co/Qwen/Qwen3.6-35B-A3B). Specifikacije relevantne za nas: 35B total / 3B active MoE, Apache-2.0, native 262K context (YaRN do 1M), thinking mode default ON (toggle off via `enable_thinking: false`), vLLM 0.19.0+ preporučen sa komandom `vllm serve Qwen/Qwen3.6-35B-A3B --tensor-parallel-size 8 --max-model-len 262144 --reasoning-parser qwen3` (mapira direktno na LM TEK H200 x8). Standalone benchmark baselines: SWE-bench Verified 73.4, AIME 2026 92.7, MMLU-Pro 85.2, GPQA Diamond 86.0. Ovo zamenjuje prethodni KVARK LOCKED Qwen3-30B-A3B-Thinking i backlog default Gemma 4 31B.

**Launch narrative implikacija:** Qwen3.6-35B-A3B je već u Opus-class na većini benchmark-a sa 3B aktivnih params. NE forsirati "small beats big" formulaciju. Pravilna formulacija je "održavamo Opus-class capability lokalno, sa našom memorijom kao multipler za long-term continuity". H-44 SWE-CB mora premašiti standalone 73.4 — target 78+ za defensive lift, 80+ za strong headline.

---

## Konkretan rad — Track 1

### Phase A+B (prvi prioritet, ~6-8h)

Zatvori H-01..H-06 (6 stavki). Po zatvaranju, H-35 binary smoke test je ready — pokreni ga i potvrdi zelenu boju.

### Standing pool (posle Phase A+B, prema prioritetu)

- **~35 HIGH** — polish close + proofs + papers prep + launch prep
- **~50 MEDIUM** — per backlog prioritet
- **~22 LOW** — per backlog prioritet

**Eksplicitno isključeno:** Harvest adapter stream. Harvest ostaje PARKED do post-launch per arhitekturna odluka (vidi `project_harvest_parity_stream.md` u memoriji). Ne diraj harvest u ovom prolazku.

---

## Šta dolazi posle Polish (čekaj instrukcije)

### Engineering audit (PM agent radi paralelno)

Dok ti radiš Polish, PM agent radi cross-cut engineering audit oba repo-a (waggle-os puni + hive-mind release health). Audit deliverable je `briefs/2026-04-19-engineering-audit-pre-benchmark.md`. Iz audit-a će izaći **dodatne H-XX stavke** koje ulaze u Track 1 kao "must fix before benchmark". Ne kreći Track 2 dok audit nalazi ne uđu u backlog i ne budu zatvoreni.

### Track 2 (čekaj zelenu)

Kad Polish + audit fix-evi padnu, kreće Track 2:

- **H-42 LoCoMo** na hive-mind repo-u (memory recall, target ≥91.6% Mem0 SOTA)
- **H-43 LongMemEval** na waggle-os repo-u (agent long-term memory, Letta baseline ~83%)
- **H-44 SWE-ContextBench** na waggle-os repo-u (verovatnoća top-3: 60-70%)

Sva tri istovremeno, isti engine (Qwen/Qwen3.6-35B-A3B), isti judge ensemble.

### Judge ensemble specifikacija

Iz V5 PA testova, validiran metodološki (judge disagreement < 0.25):
- gemini-3.1-pro-preview
- gpt-5
- grok-4.20
- MiniMax-M2.7

**Bez Anthropic modela u judge ensemble-u** — vendor circularity guard. Ne mešati Anthropic među evaluatorima jer sami ćemo verovatno koristiti Anthropic modele negde u stack-u.

### Track 3 (paralelno sa Track 2)

UI/UX peglanje + e2e test scenariji. Marko će igrati ulogu user-a u browser-u prema persona skriptama, PM agent priprema friction log. Track 3 ne blokira Track 2.

---

## Launch copy anchor (za Track 2 output)

Kad benchmark rezultati dođu, launch copy headline kandidate su:

- **Verifikovano već (V5 H1 PASS):** "PromptAssembler verified to lift Opus 4.6 by +5.2pp across 5/6 scenarios (4-judge ensemble, no vendor circularity)" — ovo je tvoj publishable anchor bez obzira na benchmark ishod.
- **Pending Track 2 brojeva:** "Memory layer matches/exceeds Mem0 SOTA on LoCoMo", "Competitive with leading agent memory frameworks on LongMemEval", "Top-N on SWE-ContextBench"

Konkretni headline brojevi izlaze iz Track 2. Track 3 paralelno priprema demo + screenshot + video kapital.

**Ne forsirati u headline:** Qwen analitički scaffold (V5 H2 narrow win, max 7.4pp na 1/2 scenarija), compression closure (V5 H3 fail, −5.0% mean closure). Te dve hipoteze su naučni nalazi, ne marketing materijal.

---

## Sledeći komunikacioni cycle

1. Ti potvrdi prijem ovog handoff-a i krećeš Polish A+B
2. Ja krećem engineering audit paralelno
3. Kad imam audit nalaze za "must fix before benchmark" kategoriju, stavljam ih u backlog kao formalne H-XX
4. Ti zatvaraš te dodatne stavke kao deo Track 1
5. Kad Track 1 padne, daješ mi green-light za Track 2 spec finalizaciju
6. Track 2 i Track 3 kreću zajedno

Ako naletneš na blocker u Polish-u koji nije tehnički već strateški, eskaliraj odmah preko PM agenta — ne čekaj.
