# DESIGN_POV.md — strategic notes from the design pass

> These are **convictions, not tickets** — observations from living inside Waggle
> while designing it. They go beyond the brief. One (#1, Memory Trust) is already
> built into this package as a screen (`screens/memory-trust.html`, doc section
> "Trust"). The other four are open questions worth a decision before — or shortly
> after — the refactor ships. Treat this as a starting point for the team, not a
> spec.

---

## 1. Memory you can trust  ·  **BUILT — see `memory-trust.html`**

**The risk.** A persistent-memory product's #1 churn driver isn't *forgetting* — it's
**remembering the wrong thing**, acting on something stale, or knowing something the
user wishes it didn't. The concept (rightly) sells memory as an asset that compounds.
But the first time Waggle confidently does the wrong thing because of a bad memory,
trust breaks — and trust is the entire reason someone leaves their working life in the
hive.

**The response (designed).** A *Memory Trust* layer:
- **Confidence + freshness** on every memory (the agent and the user can both discount
  what's shaky or old instead of acting on it blindly).
- **Forget** (real removal from recall + from anything said next) and **Correct**
  (inline; dependents re-checked) on any memory.
- **Stale review** prompts ("this is 6 weeks old — still true?").
- **"Why did you do that?" trace** — any agent action unfolds into goal → recalled
  memories (with confidence) → checks → action, and the fix (correct/forget the
  offending memory) is one click from the explanation.

**Why it's also a moat.** Editable, accountable memory is *harder* to build than
accumulating memory, and it's exactly what enterprise/KVARK buyers will demand
(auditability, right-to-correct, EU AI Act alignment). It turns the scariest property
of the product into its most trustworthy one.

---

## 2. The cold-start inversion

**The problem.** Waggle is **worst on day one** (knows nothing) and best on day 365 —
the value curve runs backwards exactly when you're trying to convert someone. Import
helps, but the first week is make-or-break and isn't yet designed as a deliberate arc.

**Suggested response.** A "worth it before it's full" thread: honest, inviting empty
states; and an explicit, **celebrated first aha moment** — the first time Waggle
surfaces *"I remembered X so you didn't have to,"* made a felt moment rather than a
silent convenience. Measure time-to-first-recall as a north-star activation metric.

---

## 3. Voice & lexicon (commit to the metaphor — carefully)

The bee system (Waggle / hive / waggle-dance / "while you slept") is charming but
half-committed; it wobbles between cute and technical. There's a coherent, restrained
metaphor here (the dance = diffusion is already used well). **Write a short voice &
lexicon guide:** which bee-words earn their place (hive, waggle-dance), which stay
plain (memory, agents, connectors), and a hard rule that the enterprise/KVARK surface
stays sober. Consistency makes it feel intentional instead of themed.

---

## 4. Who pays for inference?

The pricing story ("memory free forever, pay for scale") is clean — but the project's
**own benchmark admits high token use**, and tokens are the real cost. The unmade
decision: **BYO-key** (user pays the provider directly — fits local-first, keeps
margins clean, but adds onboarding friction) **vs. Waggle-metered** (smoother UX, but
you carry inference cost + need usage caps). This quietly reshapes Billing, Onboarding
(the model gate), and Usage. Decide it explicitly before the billing flow ships; the
current design supports either but commits to neither.

---

## 5. The morning briefing as a *ritual*

The habit loop is solid; the most ownable version of the trigger is a **60-second
briefing you could listen to** — "Waggle reads you your morning." Audio is sticky,
daily, hands-free, and nobody in the agent category has it. A natural extension of the
Home cockpit + the "while you slept" summary, and a strong hook for the mobile +
messaging surfaces on the roadmap.

---

### How to use this
- #1 is done — review the screen and wire it to the real memory store
  (confidence/freshness/forget/correct/trace are all backed by data the substrate
  already has or can derive).
- #2–#5 are decisions for product + design leadership. None blocks the refactor, but
  #4 (inference cost) should be settled before Billing goes live, and #1's trust
  primitives should land early because everything else trades on them.
