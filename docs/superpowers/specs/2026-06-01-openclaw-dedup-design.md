# OQ-6 — Provenance-Insensitive Save-Side Dedup (OpenClaw gateway double-capture)

**Date:** 2026-06-01
**Status:** Approved design, pre-plan (implementation-ready; no code written yet)
**Origin:** Wave 2/3 hook ports spec §5.5 open question OQ-6 (deferred fast-follow). See `docs/superpowers/specs/2026-06-01-wave23-hook-stubs-design.md`.
**Touches:** `packages/hive-mind-core/src/mind/frames.ts` (+ tests). OSS-mirrored via subtree-split.

---

## 1. Summary

**Problem.** The OpenClaw gateway can drive Claude Code / Codex as *backends*. If those backends also have hive-mind hooks installed, the same conversation turn is captured twice — once by OpenClaw's gateway hook (`message:received` / `message:sent`) and once by the backend's own lifecycle hooks — producing two near-identical memory frames. Wave 2/3 shipped provenance *stamping* (OpenClaw frames carry `openclaw-gateway:<channel>`) but deferred the dedup.

**Fix.** Make the existing save-side dedup **provenance-insensitive**: compare the semantic turn **body**, not the `[hm …]` metadata prefix that carries `session:`/`src:`. This collapses any two same-body captures of a turn into one stored frame regardless of which source wrote it.

**Why it's small.** `FrameStore.createIFrame` already dedups every insert via `findDuplicate` — but with an *exact* `sha256(content.trim())`. The double-capture survives for exactly one reason: the two frames' content prefixes differ (`session:`/`src:`). Stripping that prefix before hashing closes the gap with a one-helper change.

## 2. Decision log

- **D-locus (approved): save-side, provenance-aware.** Fix in `findDuplicate` (central, `hive-mind-core`) rather than OpenClaw-local suppression (fragile — the gateway may not expose which backend handled a turn) or recall-side dedup (frame-count moat metric still double-counts; every recall pays). Benefits all sources, not just OpenClaw.
- **D-scope (approved): provenance-insensitive globally within the existing 500-frame recency window.** Two identical short bodies (e.g. `"continue"`) across recent sessions also merge to one frame + `access_count`. Accepted as correct/desirable; the recency bound keeps it from being unbounded.
- **D-match (approved): exact match on the stripped body, not fuzzy.** Conservative — only *byte-identical* bodies collapse. Rejected `trigramSimilarity` (risks false-merging legitimately-similar frames).

## 3. Mechanism (verified from source)

- `FrameStore.createIFrame(...)` calls `findDuplicate(content)` first (frames.ts:78); on a hit it bumps `access_count` (`touch`) and returns the existing frame — no new row.
- `findDuplicate(content)` (frames.ts:251) hashes `sha256(content.trim())` and compares against the SHA-256 of each of the **last 500** frames' trimmed content. Recency-bounded by design (the docstring notes unbounded dedup would need a dedicated `content_hash` column + index).
- The stored `content` is `buildPrefix(frame) + frame.body`, where `buildPrefix` (shim-core `frame-encoder.ts:106-117`) emits `[hm session:<scope> parent:<id> src:<source> event:<type>] ` (tokens present only when set).
- For the double-capture: OpenClaw writes `[hm session:openclaw-gateway:<channel> src:openclaw event:stop] <body>`; the backend writes `[hm session:<backend-scope> src:claude-code event:stop] <body>`. **Same `<body>`, different prefix → different exact hash → not deduped.**

## 4. The change

Add a prefix-stripping helper and apply it on both sides of the comparison in `findDuplicate`:

```ts
/**
 * Strip the leading hive-mind metadata prefix `[hm session:… src:… event:…] `
 * so dedup compares the semantic turn BODY, not the provenance. Content without
 * the prefix (harvest / ingest / cognify) is returned unchanged — a no-op.
 */
function stripHmPrefix(content: string): string {
  return content.replace(/^\[hm [^\]]*\]\s*/, '');
}

findDuplicate(content: string): MemoryFrame | null {
  const key = createHash('sha256').update(stripHmPrefix(content).trim()).digest('hex');
  const existing = this.db.getDatabase().prepare(`
    SELECT * FROM memory_frames ORDER BY id DESC LIMIT 500
  `).all() as MemoryFrame[];
  for (const frame of existing) {
    const frameKey = createHash('sha256').update(stripHmPrefix(frame.content).trim()).digest('hex');
    if (frameKey === key) {
      this.touch(frame.id);
      return frame;
    }
  }
  return null;
}
```

No signature change; no new column; no migration. `createIFrame` and every other caller are unchanged.

## 5. Properties

- **Backward-compatible / minimal blast radius.** The strip is a no-op for any content lacking the `[hm …]` prefix, so harvest/ingest/cognify dedup behavior is byte-for-byte unchanged. Only hook-captured frames (which carry the prefix) change.
- **Conservative.** Only *identical bodies* collapse. Genuinely different captures of a turn (e.g. OpenClaw's raw outbound text vs the backend's summarized turn) have different bodies and both survive — the fix never merges distinct content.
- **Attribution preserved.** First writer's frame is kept verbatim (with its `src:`); the later duplicate only bumps `access_count`. One frame per turn, attributed to whoever landed first.
- **Recency window sufficient.** Gateway and backend fire on the same turn (seconds apart) → both within the recent 500 → reliably caught. No new index needed.
- **Generic + OSS-clean.** Lives in `hive-mind-core`, ships in the mirror, helps every tool. No proprietary/KVARK logic; no secrets.

## 6. Testing

`frames.ts` unit tests (extend the existing `findDuplicate`/`createIFrame` suite):

1. **Cross-source collapse:** insert `[hm session:openclaw-gateway:c1 src:openclaw event:stop] BODY` then `[hm session:s2 src:claude-code event:stop] BODY` → second returns the first frame, `access_count` incremented, row count unchanged (= the OQ-6 scenario).
2. **Different body → no merge:** same prefixes, different bodies → two distinct frames.
3. **Non-prefixed content unchanged (regression):** two identical bodies *without* `[hm …]` prefix still dedup exactly as before; a prefixed vs non-prefixed pair with the same body collapses (strip makes them equal) — assert intended.
4. **Recency bound holds:** a duplicate older than the 500-frame window is not found (documents the bound).
5. **Prefix-strip helper:** `stripHmPrefix` removes a well-formed prefix, leaves prefix-less content untouched, and does not over-strip a body that merely contains `[` brackets later.

OpenClaw-level (optional, in `hive-mind-hooks-openclaw` or an integration test): a gateway-captured frame + a synthetic backend frame of the same turn yield one stored frame.

## 7. Risks + open questions

- **Over-merge of trivial identical bodies** (e.g. `"continue"` across recent sessions). Accepted per D-scope; the `access_count` bump preserves the multiplicity signal, and such content is low-value memory. If it ever proves wrong, the strip can be narrowed to only drop the `session:`/`src:` tokens while keeping `event:` (so different events never collide) — noted, not implemented.
- **Prefix format coupling.** The regex `^\[hm [^\]]*\]\s*` is coupled to `buildPrefix`'s output. If `frame-encoder.ts` changes the prefix wrapper, the strip must track it. Mitigation: a shared constant/test that asserts `stripHmPrefix(buildPrefix(f) + body) === body` would lock the coupling — consider co-locating, but the helper lives in `hive-mind-core` and `buildPrefix` in `shim-core`, so a cross-package assertion test is the pragmatic guard.
- **No content_hash column.** Deliberately out of scope; the 500-window covers OQ-6. Unbounded historical dedup remains a separate future concern (already flagged in the frames.ts docstring).
