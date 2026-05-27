# Open-Work Summary — 2026-05-26

**Single-pager rolled up from `OPEN-TASKS-2026-05-20.md` + the May 22-26 closures + 2026-05-22 S1 handoff + verified HEAD `9902906`.**

This is a **status snapshot**, not the source of truth. The canonical structured list is `OPEN-TASKS-2026-05-20.md`; this file just answers "what do I have to do now."

---

## TL;DR — the critical path

The launch critical path is **overwhelmingly Marko's external actions**, not engineering. Engineering surface is small and well-bounded.

1. **M8** — Buy Windows EV code-signing cert (~$300-500/yr, 1-3 day shipping lead). **Longest single launch blocker. Start now.**
2. **M5** — Top up API credits (Anthropic / OpenAI / Google / OpenRouter). ~15 min. Unblocks Pillar-1 Qwen-local follow-up + Pillar-2 N=500 + any remaining trio-judge work.
3. **M9** — Contact ML peer reviewer for papers. ~1 day. Phase 6 gate.
4. **M10** — Greenlight launch date. Decision. Everything downstream.

If those 4 fire, everything else is either already done or can be done in 1-5 days of engineering.

---

## 1. AI-OS arc — substantially shipped, asymmetric capture

**Done (24 commits 2026-05-20 + 1 PR fix `9902906` since):**
- Phase 0-4 + 1E + polish — all 4 Path-D primitives delivered end-to-end
- Tool detection for 7 tools · `/api/tools/{detect,launch,hooks,processes,kill}` · LauncherApp dock · WaggleDance v2 bus + bridge to existing UI · skill diffusion via `onSkillDistillationFire` · Mission Control inventory tile · Memory provenance badge · launch-with-prompt textarea · process tracker + Stop button
- Rollback tag: `checkpoint/pre-ai-os-2026-05-20`

**Open on AI-OS side:**

| # | What | Effort | Why now / why later |
|---|---|---|---|
| V-3 | AI-OS end-to-end runtime verification on Marko's actual machine with `WAGGLE_SIGNAL_EMIT=1` | 30 min | Needs binary build, no code |
| D-1 | **Wave 2/3 hook implementations** for 6 stub packages (cursor / claude-desktop / codex / codex-desktop / hermes / openclaw) | multi-day per package | Deferred until claude-code-only ship gets real usage feedback. Currently 7 tools *launch* but only 1 *captures* — asymmetric on purpose |
| G7+ | Cross-tool replay UI, Mission Control provenance polish | post-launch | Tier 2 from exploration doc |
| G9 | Embedded shells (xterm.js for `claude-code` CLI only) | post-launch | Explicitly Phase 5+ per D4 decision |

**The leverage point on AI-OS:** each new capture-capable hook package converts a *launchable* tool into a *memory-feeding* one. That's the multiplier on the moat. Ship after claude-code-only proves out.

---

## 2. Engineering — actionable in-session (no external blocker)

| # | Item | Effort | Notes |
|---|---|---|---|
| E-2 | Cross-tool prompt-arg shapes (cursor / codex / hermes) | <1 day per tool | Verify against real binaries; today only `claude-code` has confirmed conventions |
| E-4 | hive-mind OSS source extraction (CR-6) | 2-3 days | Scaffold done; **largely closed by E-14 v0.3.0 promotion** — re-verify scope before scheduling |
| E-6 | OneNote landed; broader MS Graph (CR-1) closure | — | Email+Calendar+Files already covered by Outlook+OneDrive+MSTeams. **Treat as done unless gap surfaces.** |
| E-7 | Demo video script (CR-4) | 1 day | Content, not code. 90-sec harvest→wiki→insight + 5-min deep dive |
| E-8 | LinkedIn launch posts (CR-5) | 0.5-1 day | Content. 3-post sequence over 10 days |
| E-9 | Tauri binary build + smoke (CR-8) | 1 day | Hasn't built since mega code changes. Sanity build on clean Windows VM |
| E-12 | Cursor harvest adapter | 0.5-1 day | Independent of M1-M4. Marko uses Cursor |

**Genuine in-session engineering: E-2 (small) + E-7/E-8 (content) + E-9 (binary) + E-12 (adapter).** That's it.

---

## 3. Engineering — verification only (needs binary)

| # | Item | Status |
|---|---|---|
| V-1 | Spawn Agent + Dock click-paths | Code shipped (`14942be` P35 + P36 wired). Needs clean-install runtime check |
| V-2 | Light mode finish | Semantic tokens done. Remaining is render-time visual fine-tuning on a Windows binary |
| V-3 | AI-OS end-to-end with `WAGGLE_SIGNAL_EMIT=1` | See §1 |

All three roll into a single binary-build session.

---

## 4. Marko external actions (real launch blockers)

| # | Action | Time | Status |
|---|---|---|---|
| M1 | ChatGPT export | — | ⏭️ Skipped 2026-05-21 (export emails never arrived) |
| M2 | Claude export | — | ✅ Done 2026-04-17 (30 MB at `Desktop\MEMORIES\Claude\`) |
| M3 | Gemini export | — | ✅ Done 2026-04-17 (437 MB at `Desktop\MEMORIES\Google\`) |
| M4 | Perplexity export | — | ⏭️ Skipped 2026-05-21 (marginal contribution) |
| **M5** | **Top up API credits** | 15 min | **Open. Gates Pillar-1 Qwen-local + Pillar-2 N=500.** |
| M6 | Confirm judge models | — | ✅ Done 2026-05-21 (Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5) |
| M7 | Stripe products | — | ✅ Done. Pro+Teams × monthly+annual live in `CNCrMQy1f7` |
| **M8** | **Windows EV code-signing cert** | 1-3 day shipping | **Open. Longest single blocker. Start the order.** |
| **M9** | **ML peer reviewer for papers** | 1 day | **Open.** Phase 6 gate |
| **M10** | **Greenlight launch date** | Decision | **Open.** Everything downstream |

---

## 5. Marko-gated engineering — runs after M-actions

| # | Item | Depends on | Notes |
|---|---|---|---|
| E-10 | Stripe webhooks → tier enforcement | — | ✅ Done. `tierFromPriceId()` resolves 4-var contract. 17/17 webhook tests green |
| E-11 | Phase 1 Harvest ingestion | **Unblocked** | Ingest M2 + M3 exports into production `personal.mind`. ~3 days. Cognify + identity auto-populate + wiki compile. Fresh delta-exports recommended for launch week |
| E-13 | Mac notarization | M8 cert + Marko-side | Signs macOS bundle |

---

## 6. Multi-week eval campaigns — almost all closed

| # | Campaign | Status |
|---|---|---|
| C-1 | LoCoMo Memory Proof (trio-strict canonical v2) | ✅ Done 2026-05-21. **67.8% strict / 70.0% majority** (post MiniMax parser fix). Self-judge inflation +5.3pp (within norms). Published in `hive-mind/benchmarks/locomo/RESULTS.md` |
| C-2 | Substrate Claim (Stage 3 v6 N=400) | ✅ Done 2026-04-25. **Fisher one-sided p = 8.07 × 10⁻¹⁸**, +19.25pp retrieval lift. Canary expansion DROPPED 2026-04-30 per PM reset |
| C-3 | GAIA 2 Phase 5b (ARE-native) | ✅ Done 2026-05-22. **N=160: 83.8% strict / 86.5% judged-only** (Mem0 ~40-55% → +30-45pp). $91 actual / $100 cap |
| **Pillar 1 follow-up** | **Qwen-local harness benchmark** | 🟡 Open. Repeat GAIA 2 with Qwen 3.6 35B LOCAL for sovereign full-local number. Env-driven (MODEL/BASE_URL → local Ollama). Queued on Qwen serving |
| **Pillar 2 follow-up** | **LongMemEval N=500 + Sonnet lane** | 🟡 Open. **N=100 blend-tuned 75.2% trio-strict** (above LoCoMo 67.8%). Scale-up next |
| C-4 | Phase 6 Write Papers | 🟡 Concept doc exists (`docs/research/PAPER-2-CONCEPT_gepa-evolution.md`); papers not written. Gates on Pillar-1 Qwen + Pillar-2 N=500 results |
| C-5 | Phase 7 Launch Prep | 🟡 Gates on papers (C-4) |
| C-6 | Phase 7b Launch Day | 🟡 All above + M10 greenlight |

---

## 7. Strategic decisions pending (Marko)

| # | Decision | Unlocks |
|---|---|---|
| S-1 | hive-mind OSS timing (before/with/after Waggle) | Launch sequencing. **Default is "before"** since substrate-claim evidence is already public at `marolinik/hive-mind` v0.3.0 |
| S-2 | Harvest-first onboarding (replace step 2 or parallel opt-in?) | UX (D-3) |
| S-3 | Warm list (5-10 names to pre-email 72h before launch) | Launch credibility |
| S-4 | Single-author or dual-author on papers? | Paper attribution |
| S-5 | Marketplace model (free+attribution / freemium / enterprise-only?) | Skills monetization |
| S-6 | EvolveSchema attribution (keep "Mikhail" or cite ACE — Zhang et al.?) | Paper 2 framing |

---

## 8. Deferred post-launch arcs

| # | Item | Scope | Days |
|---|---|---|---|
| D-1 | Wave 2/3 hooks for 6 packages | per-package multi-day | Per-package |
| D-2 | Wiki Compiler v2 (markdown export, incremental, Obsidian+Notion adapters, health dashboard) | — | 5 |
| D-3 | Harvest UX Full Polish (live SSE, resumable, identity auto-populate, harvest-first onboarding) | — | 5 |
| D-4 | Compliance Report UX + Templates | — | 3.5 |
| D-5 | Installer Flow (INST-1/2/3: Ollama bundled installer, hardware scan, daemon auto-start) | — | 2 |
| D-6 | PDF E2E deferred items (21 from 2026-04-17 PDF triage) | — | Opportunistic |
| D-7 | Responsive gaps (R-1..R-5) | — | Not blocking launch |
| D-8 | Engagement features ENG-1..ENG-7 | — | 7 × half-day |
| D-9 | Medium UX fixes UX-1..UX-7 | — | 5 × 1-4 hr |

---

## 9. Test infrastructure

**Status:** Docker compose stack restored 2026-05-21 (LiteLLM:4000 + Postgres:5434 + Redis:6381 + MinIO:9000-9001) → **6610/6611 pass, 0 fail** (1 skipped). The 30 prior failures were all service-blocked, not session-induced. CLI/marketplace seed setup is per-machine.

---

## 10. Recommended next moves (PM-grade pick list)

| Time available | Best use |
|---|---|
| 5 min | **Start M8 order** (Windows EV cert, 1-3 day lead) |
| 30 min | M5 (API credits) + M6 already done — proceed to Pillar-1 Qwen-local setup or Pillar-2 N=500 setup |
| Half-day | E-9 (Tauri binary build + smoke — rolls in V-1/V-2/V-3 verification) **OR** E-12 (Cursor harvest adapter) |
| 1-3 days | E-11 (Phase 1 Harvest ingestion — M2+M3 exports → production `personal.mind` + cognify + identity + wiki) |
| 2+ days | Pillar-1 Qwen-local benchmark run, then C-4 papers |

---

## What's NOT on this list (intentional)

- ❌ Re-running C-1/C-2/C-3 (closed, evidence published)
- ❌ Building OS substrate from scratch (~70% pre-built before AI-OS arc; product surface shipped)
- ❌ Embedding external IDEs (Path D ratified: skip Path C)
- ❌ E-3 / QW-1..QW-5 / CR-2 / P36 / OW-6 (all stale-but-already-shipped per grep verification)

---

**Bottom line:** ~5-7 working days of in-session engineering + binary verification, ~$300-500 + 3 days for the cert, decisions on M9/M10/S-1..S-6, and the two pillar follow-ups (Qwen-local + N=500). Then launch.

Verified against HEAD `9902906` on 2026-05-26.
