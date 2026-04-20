# Harvest UX Audit — 2026-04-20 (M-07..10)

**Scope:** Same pattern as the M-33..48 audit — verify each sub-item against
current source code before estimating new build. The 2026-04-19 plan
estimated M-07..10 at 2-3 d. Audit confirms the original 3d backlog
estimate was 30% conservative — most infrastructure is in place; only
the UI surfaces and one server-side store are missing.

## Sub-item disposition

| Item | Spec | Server | Pipeline | UI | Verdict | Build est. |
|---|---|---|---|---|---|---|
| **M-07 SSE progress** | Live progress streaming during commit | ✅ `GET /api/harvest/progress` (harvest.ts:240) | ✅ emits `{phase, current, total, source}` for `saving` (per-frame) + `cognifying` (start/end) | ❌ HarvestTab shows only a spinner; no EventSource consumer | **80% done** — UI consumer only | ~3 hr |
| **M-08 Resumable** | Checkpoint every 100 frames + resume from interruption | ❌ no run/checkpoint store | ❌ no `checkpoint` references | ❌ no pause/resume on commit (the existing Pause/Play wiring is for **autoSync** toggle, not interruption) | **5% done** — needs full design + impl | ~6-8 hr |
| **M-09 Identity auto-populate** | Surface learned identity from harvest, confirm/edit | ✅ `identityUpdates` count flows from dedupResult (pipeline.ts:168) | ✅ identity-targeted frames detected | 🟡 HarvestTab shows count "N identity signal(s) detected" — but UserProfileApp Identity tab is fully manual, no auto-merge | **40% done** — needs harvest→identity merger + surfacing UX | ~4-6 hr |
| **M-10 Onboarding tile** | "Where does your AI life live?" — rich harvest-first discovery | n/a | n/a | 🟡 ImportStep.tsx exists but only offers ChatGPT + Claude (HarvestTab supports 14+ sources). No Claude Code auto-detect at this step. Position is step 3/8, not the headline. | **30% done** — expand sources + auto-detect + reposition copy | ~3 hr |

**Total revised:** ~16-20 hr (vs. 24 hr backlog estimate).

## Detailed evidence

### M-07 — SSE progress

```ts
// packages/server/src/local/routes/harvest.ts:49-55
function emitHarvestProgress(data: { phase, current, total, source }) {
  const listeners = (globalThis as any).__harvestProgressListeners;
  if (!listeners || listeners.size === 0) return;
  const event = new CustomEvent('harvest-progress', { detail: data });
  for (const fn of listeners) fn(event);
}

// harvest.ts:130, 137, 163, 165 — pipeline emits at:
emitHarvestProgress({ phase: 'saving',     current: 0,        total: items.length });
emitHarvestProgress({ phase: 'saving',     current: saved,    total: items.length });   // per-item
emitHarvestProgress({ phase: 'cognifying', current: 0,        total: frameIds.length });
emitHarvestProgress({ phase: 'cognifying', current: frameIds.length, total: frameIds.length });

// harvest.ts:240-256 — SSE endpoint
fastify.get('/api/harvest/progress', async (request, reply) => {
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', ... });
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    reply.raw.write(`data: ${JSON.stringify(detail)}\n\n`);
  };
  (globalThis as any).__harvestProgressListeners ??= new Set();
  (globalThis as any).__harvestProgressListeners.add(listener);
  request.raw.on('close', () => {
    (globalThis as any).__harvestProgressListeners?.delete(listener);
  });
});
```

**UI gap:** `HarvestTab.handleCommit` (line 157-173) sets `setImporting(true)`,
calls `adapter.harvestCommit(...)`, and only updates state on the awaited
result. No EventSource subscription. Adapter already has the `EventSource`
infrastructure pattern (used for `subagent_status` and chat streams) —
just needs to be applied here.

### M-08 — Resumable harvest

Zero matches for `checkpoint|resumable|interrupt|abort|harvestRun` in
either `packages/core/src/harvest/` or the harvest route. The pipeline
runs to completion or throws — there's no progressive checkpoint, no
run-state persistence, no resume API.

The `Pause/Play` icons in HarvestTab map to `s.autoSync` toggle (line 332-340)
— that's "should this source auto-sync on a schedule?", not "interrupt the
current import."

Honest scope: a resumable design needs:
1. A `harvest_runs` SQLite table (run_id, source, status, last_checkpoint_at, items_processed, total_items)
2. Pipeline accepts an optional `resumeFromRun: runId` arg
3. Pipeline checkpoints every N items (50-100) — write to harvest_runs
4. On commit failure, the runId is returned in the error payload
5. UI shows "Last harvest interrupted at item N/M — Resume?" banner

This is the only sub-item that's genuinely new code, not surfacing.

### M-09 — Identity auto-populate

Current state:
- Backend extracts identity signals during dedup (`packages/core/src/harvest/dedup.ts` likely)
- `identityUpdates` count flows up to import result
- HarvestTab surfaces the count: "N identity signal(s) detected"
- BUT: `UserProfileApp` Identity tab fields (Name, Role, Company, Industry, Bio) are 100% manual entry
- No "We learned this from your imports — confirm?" step

Two possible UX approaches (Marko picks):
1. **Inline confirmation in HarvestTab** — when count > 0, expand a section showing the signals (key/value pairs, source frames), each with a checkbox. "Save selected to profile" button merges into UserProfileApp's identity store.
2. **Toast → UserProfileApp redirect** — toast says "We learned 5 things about you. Review now?", clicking opens UserProfileApp Identity tab with a "Suggested from harvest" section above the manual fields.

Option 2 keeps HarvestTab focused on import; Option 1 keeps the full flow in one place. I'd lean Option 2 for separation of concerns.

### M-10 — Onboarding tile

Current ImportStep.tsx (`apps/web/src/components/os/overlays/onboarding/ImportStep.tsx`):
- Hardcoded 2 tiles: "ChatGPT Export" + "Claude Export"
- No Claude Code auto-detect (which HarvestTab DOES have via `detectClaudeCode`)
- Step copy is "Bring your AI memories" — generic, not the headline "Where does your AI life live?" framing
- Position: step 3 of 8 (after WhyWaggle, Tier; before Memory, Template, Persona, ApiKey, Ready)

Gaps to close:
1. Expand source tiles to top 6-8 (ChatGPT, Claude, Claude Code auto-detect, Gemini, Perplexity, Grok, Cursor, "+ More")
2. Hook ClaudeCode auto-detect at this step — if found, surface "We see X items in your Claude Code dir — import N min?"
3. Optionally promote this step to step 2 (right after WhyWaggle) per "harvest-first onboarding" — depends on whether wizard flow re-ordering is in scope
4. Reframe headline: "Where does your AI life live?" is more discovery-tone

## Recommended execution order (smallest → largest, demo value first)

1. **M-07 SSE consumer** (~3 hr) — immediate visible upgrade, infra already there. Wire EventSource in HarvestTab, render progress bar with phase + N/M counter.
2. **M-10 onboarding tile expansion** (~3 hr) — KVARK-demo relevant, low risk, no schema changes. Expand sources, hook ClaudeCode auto-detect, refresh copy.
3. **M-09 identity auto-populate** (~4-6 hr) — needs UX decision (option 1 vs 2 above). Spec the merger + surface the signals.
4. **M-08 resumable** (~6-8 hr) — biggest, needs `harvest_runs` table + checkpoint logic in pipeline + resume API + UI banner.

## Why this order

- M-07 unlocks the demo story for everything else (you can SEE harvest happening).
- M-10 is what a first-time user sees; outsized first-impression value.
- M-09 turns "we imported 1000 frames" into "and here's what we learned about YOU" — Memory's killer punchline.
- M-08 is reliability hardening that matters most for very large imports (Claude Code dir with 10K+ messages); deferring it to last lets the visible UX wins land first.

## Decision needed

Which item do you want to start with? My pick is **M-07 SSE consumer** (~3 hr,
ships in this session). I can also start with **M-10** (~3 hr) if you'd
rather lead with the onboarding-first impression. **M-09** needs a UX-option
pick (1 vs 2 above) before I start; **M-08** is biggest and probably needs
its own session.

---

**Author:** Claude (audit per Marko's S2 sequence — M-07..10 next)
