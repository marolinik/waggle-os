# LOCKED Decision — Target Model: Qwen/Qwen3.6-35B-A3B

**Date:** 2026-04-19
**Status:** LOCKED — VERIFIED 2026-04-19 via HF model card https://huggingface.co/Qwen/Qwen3.6-35B-A3B
**Decided by:** Marko Marković
**Supersedes:**
- KVARK LOCKED (2026-04-18): Qwen3-30B-A3B-Thinking
- Backlog default: Gemma 4 31B

---

## Decision

**Qwen/Qwen3.6-35B-A3B** postaje kanonski engine za ceo stack:
- KVARK production deployment (LM TEK H200 x8 sa vLLM)
- Waggle Pro/Teams default model
- Sva tri benchmark-a u Track 2 (LoCoMo, LongMemEval, SWE-ContextBench)
- Sve buduće PA evaluacije

## Rationale

Jedan model kroz ceo stack znači jedna jasna priča za launch narativ i jedna konzistentna baseline za sve buduće mere. Tri-način divergencija (KVARK na 30B-A3B-Thinking, benchmarks na Gemma 4 31B, Marko-specified 35B-A3B) bi otvorila defensive poziciju u svakoj eksternoj konverzaciji. Jedan model = jedna priča.

35B-A3B (3B activated parameters MoE) je logična evolucija iz 30B-A3B-Thinking generacije, sa dodatnih 5B kapaciteta i (pretpostavljeno) zadržanim thinking-mode capabilities. Veći model + ista A3B activation = više kapaciteta bez većih inference troškova.

## Verified specifications (HF model card 2026-04-19)

- **Architecture:** 35B total / 3B active MoE (8 routed + 1 shared expert iz 256 total)
- **License:** Apache-2.0 (kritično za KVARK enterprise on-prem — bez licencne naknade)
- **Release:** April 2026
- **Context:** 262,144 native, do 1,010,000 sa YaRN scaling
- **Thinking mode:** default ON, toggle off via `enable_thinking: false`, "Preserve Thinking" mode za historical messages — rešava prethodnu Thinking-vs-base SKU dilemu
- **Quantization:** GGUF + 147 quantized varijanti dostupno (LM Studio, Jan, Ollama compatible)
- **Inference engines:** SGLang v0.5.10+ (preporučeno), vLLM v0.19.0+, KTransformers, HF Transformers
- **vLLM serve config (mapira na LM TEK H200 x8):** `vllm serve Qwen/Qwen3.6-35B-A3B --port 8000 --tensor-parallel-size 8 --max-model-len 262144 --reasoning-parser qwen3`
- **Standalone benchmark scores koje moramo respektovati:**
  - SWE-bench Verified: **73.4** ← naš H-44 SWE-CB rezultat mora meaningfully premašiti ovo da headline drži
  - AIME 2026: 92.7
  - MMLU-Pro: 85.2
  - Terminal-Bench 2.0: 51.5
  - GPQA Diamond: 86.0
  - Vision: RealWorldQA 85.3, OmniDocBench 89.9 (model je multimodalan)
- **Adoption signal:** 82,000 downloads u prvom mesecu, 834 likes, 5 adapters, 40 finetunes

## Implications

- KVARK spec mora da se ažurira — uklanja se LOCKED 30B-A3B-Thinking referenca, dodaje 35B-A3B sa istim deployment specifikacijama. vLLM komanda gore se direktno koristi.
- Backlog stavka koja default-uje Gemma 4 31B u benchmark setup-u mora da se izmeni u 35B-A3B pre nego što benchmark krene.
- [M]-02 judge memo (još neispisan) mora da specifikuje 35B-A3B kao engine pod evaluacijom, sa 4-judge ensemble kako je korišćen u V5: gemini-3.1-pro-preview, gpt-5, grok-4.20, MiniMax-M2.7 (no Anthropic — vendor circularity guard).
- **Launch narrative repositioning:** Standalone Qwen3.6-35B-A3B je već u Opus-class na većini benchmark-a sa samo 3B aktivnih parametara. Stara formulacija "Waggle daje malom Qwen-u Opus klasu" treba da se preformuliše u "**održavamo Opus-class capability lokalno, sa našom memorijom kao multipler za long-term context i continuity između sesija**". To je čak jača priča jer ne zavisi od dokazivanja "small beats big" — koje je onako kontra naše Core Thesis.
- Apache-2.0 + on-prem = direktno upijanje u sovereign AI narrativ: "vaši podaci nikad ne napuštaju vašu infrastrukturu, model je vaš, license je vaš".
- Native 262K context + YaRN 1M je komplementaran hive-mind memoriji, ne supstitut: long context rešava in-session reasoning, naša memorija rešava cross-session continuity. Oba se promovišu kao para, ne kao alternativa.

## Benchmark threshold implikacije

H-44 SWE-ContextBench mora pokazati meaningful lift iznad standalone 73.4. Tri scenarija:
- **78-79:** +5pp lift, defensive headline kvalitet ("PromptAssembler i memorija zajedno daju +5pp na SWE-bench class")
- **80-83:** Strong launch headline ("Waggle + Qwen3.6-35B-A3B exceeds Opus-class SWE-bench performance")
- **<76:** Headline se skida, pivot na LoCoMo/LongMemEval kao primary anchor

## Next actions

1. Marko šalje HF release source ili potvrđuje da je model dostupan
2. Pišem [M]-02 judge memo
3. Engineering audit proverava vLLM/inference path kompatibilnost
4. KVARK spec update (workstream zaseban, posle Waggle launch-a per Waggle→KVARK demand gen odluka)
