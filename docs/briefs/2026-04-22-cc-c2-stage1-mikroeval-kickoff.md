# CC-1 Brief — C2 Stage 1 Mikro-eval Kickoff Authorization

**Datum:** 2026-04-22
**Sprint:** 11 · Track C · Task C2
**Authority:** PM (Marko Marković), 2026-04-22 PM Cowork ratification
**Pre-req gates:** A2 ✅ CLOSED · B1 ✅ CLOSED · B2 ✅ CLOSED · LiteLLM container UP (verified at kickoff time)
**Budget:** $5–15 hard cap (per Day 2 PM plan §2 of `2026-04-23-sprint-11-day-2-am-status.md`)
**Hard alarm @ 130%:** $20

---

## 1. Authorization

C2 Stage 1 mikro-eval is **AUTHORIZED to kick off** as soon as §2 pre-req is satisfied. CC-1 may execute on Day 2 PM or Day 3 AM at its discretion; PM does not need to be in-loop for kickoff itself, only for exit ping review.

Two decisions are folded in alongside the C2 kick:

- B3 cleanup ticket (HIGH + MEDIUM) is authorized to land **before** C2 kickoff per `decisions/2026-04-22-model-route-naming-locked.md` §3. Surgical fix in `anthropic-proxy.ts:43-44` and `workspace-templates.ts:406`. Test + lint guard required per §4. Estimated 1h, no LLM cost. CC-1 may sequence as: B3 cleanup commit → docker health-check → C2 kickoff in a single working block.
- B2 fold-in: C2 is the first invocation that wires `resolveTieBreak` into the Stage 2 judge runner on 3-primary splits per B2 exit ping §6. Existing `judgeEnsemble` retains its internal contract; the wire-up replaces the `computeMajority` call on 3-vote primary ensemble paths only.

## 2. Pre-req: Docker / LiteLLM health-check

Mandatory step zero. Docker Desktop went down between B1 smoke (2026-04-21T17:54Z) and B2 smoke attempt (2026-04-21T23:01Z); Marko restarted within ~3 minutes. The same risk applies to C2.

```bash
docker ps --filter "name=waggle-os-litellm-1" --format "{{.Names}} {{.Status}}"
```

**Expected output:** `waggle-os-litellm-1 Up <duration>`

**If container not Up:**

1. Restart Docker Desktop (Marko handles UI; CC-1 cannot trigger Docker Desktop UI from sandbox).
2. Wait for Docker daemon ready: `until docker info >/dev/null 2>&1; do sleep 2; done` (cap at 60s).
3. Bring up LiteLLM stack: `docker compose -f docker-compose.litellm.yml up -d` (path per repo convention).
4. Wait for container Up: `until docker ps --filter "name=waggle-os-litellm-1" --filter "status=running" -q | grep -q .; do sleep 2; done` (cap at 60s).
5. Smoke the proxy: `curl -sS http://localhost:4000/health | jq` — expect `{"healthy_count": <n>, "unhealthy_count": 0}` or equivalent green signal from LiteLLM admin.
6. Re-run the `docker ps` check from step zero. Only proceed when container is Up.

**If container is Up but LiteLLM `/health` returns unhealthy or 5xx:** abort C2 kickoff, write a short `sessions/2026-04-22-c2-blocked-litellm-unhealthy.md` ping with the captured output, and notify PM. Do NOT attempt to debug LiteLLM mid-kickoff — that is a separate track.

## 3. Invocation

Per B1 exit ping §3.1 + A2 exit ping §6 (template unchanged):

```bash
node benchmarks/harness/src/runner.ts \
  --model qwen3.6-35b-a3b-stage2 \
  --cell raw \
  --dataset locomo \
  --limit 10 \
  --seed 42 \
  --live \
  --budget 10
```

Output JSONL goes to `benchmarks/runs/2026-04-22-c2-stage1-mikroeval/raw.jsonl` (or whatever path the runner picks per current convention; do not override).

## 4. Exit criteria

C2 is CLOSED when ALL of:

1. **10 instances evaluated** end-to-end. No partial runs counted as PASS.
2. **A2 wire confirmed live.** Every JSONL row carries `reasoning_content` + `reasoning_content_chars` + `reasoning_shape ∈ {'message.reasoning_content', 'message.reasoning', 'body.reasoning_content'}`. Zero `reasoning_shape: 'unknown'` events on this thinking=on route — if any appear, that is a drift signal worth investigating before closing.
3. **B2 wire confirmed live (if any 1-1-1 split occurs).** When a 3-primary split lands as 1-1-1, `resolveTieBreak` should fire with `path=quadri-vendor` and `fourth_vendor_slug='xai/grok-4.20'`, observable in pino events. If no 1-1-1 occurs in the 10-instance sample (likely — split rate is sparse), CC-1 reports "no tie-break trigger observed in sample, B2 path unverified live in C2 — C3 will exercise it at scale" and that is an acceptable interim state.
4. **Budget ≤ $15.** Exit ping reports actual spend with breakdown by call class (primary judge, tie-break, target model).
5. **Zero NETWORK_ERROR / 5xx tail** on the run. Transient single-call retries within the runner's own retry budget are OK; persistent infra issues are NOT.
6. **Aggregate report generated.** `buildAggregate` over the JSONL produces a summary block with the `reasoningContent { count, sumChars, p50Chars, p95Chars, shapeDistribution }` slot populated per A2 §2.1.
7. **Exit ping written** to `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c2-stage1-mikroeval-exit.md` following the same template as B1/A2/B2/B3 (deliverables, validation gates, observability sample, budget, related files). Cite this brief and the four pre-req exit pings as authority.

## 5. Failure / abort criteria

C2 should be ABORTED (not failed-and-recorded — actually aborted mid-run) if ANY of:

- Budget burn > $20 (130% of cap) at any partial-run checkpoint.
- LiteLLM `/health` flips unhealthy mid-run.
- Persistent NETWORK_ERROR for >3 consecutive calls on the same target model.
- `reasoning_content_shape_unknown` drift event fires more than once in the sample (signals provider schema drift; C2 should pause until investigated).

On abort: write a short `sessions/2026-04-22-c2-aborted-<reason>.md` ping with captured state, do NOT clean up partial JSONL (it is forensic evidence), notify PM.

## 6. What C2 does NOT need to do

- Does NOT need to wait on A3 bench-spec LOCK. A3 governs Stage 2 mass-run scope (C3 + H-42a/b); C2 is a 10-instance smoke on the existing B1-LOCKED config and is independent.
- Does NOT need to wait on B4 Stage 2 kickoff memo. B4 is PM-led; C2 is a pure CC-1 execution.
- Does NOT need PM authorization for the B3 cleanup commit if CC-1 chooses to land it before C2. Authorization is granted in §1 of this brief.

## 7. After C2 PASS

- C3 (Stage 2 4-cell mini PASS) is unblocked but **gated on A3 bench-spec LOCK**. CC-1 should NOT auto-kick C3 on C2 PASS — wait for PM authorization that follows A3 LOCK.
- B4 Stage 2 kickoff memo can incorporate the C2 readiness signal once C2 is CLOSED. PM picks up B4 in parallel; CC-1 contributes a 1-paragraph "harness readiness assessment from C2" addendum on PM request.

## 8. Sprint 11 close path after C2

If C2 PASSes and B3 cleanup ticket lands, Sprint 11 reaches **8/10 CLOSED** (A1, A2, B1, B2, B3, C1, C2 + B3 cleanup as a sub-deliverable of B3 audit). Remaining: A3 (PM-Marko 30min), B4 (PM-led memo), C3 (gated on A3). Sprint 11 can plausibly reach 9/10 CLOSED if A3 is ratified within 48h and C3 kickoff follows.

## 9. Related

- `PM-Waggle-OS/sessions/2026-04-23-sprint-11-day-2-am-status.md` — master status (Day 2 PM plan §2 lists C2 as next CC-1 work)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-h-audit-1-exit.md` — A2 exit ping (reasoning_content wire reference)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b1-stage2-config-exit.md` — B1 config + invocation template
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b2-tiebreak-exit.md` — B2 fold-in note §6
- `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` — B3 cleanup authorization
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — B2 LOCK authority
- `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` — B1 LOCK authority

---

**C2 AUTHORIZED. Pre-req gate is the single Docker health-check in §2. CC-1 owns the kick; PM reads the exit ping. B3 cleanup commit is in-scope to land alongside or just before. C3 gated on A3 — do not auto-kick.**
