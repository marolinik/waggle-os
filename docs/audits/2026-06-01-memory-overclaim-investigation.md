# Memory Over-Claim Investigation — 2026-06-01

**Trigger:** The 5-persona human E2E found the agent, on a *fresh* session, claimed
*"I have this from our last session / you're back in context"* and asserted specifics
the persona never stated (Ivan, LoCoMo, 4-month runway, OpenClaw, "227 entities").
Chen (the careful skeptic) scored trust 1/10 over it. Question: **workspace-memory
framed as session-history, or true confabulation?**

**Verdict: BOTH — and neither is cross-user data bleed.** The personas ran inside
Marko's own populated `Default / Researcher` workspace, so all recalled data is
legitimately Marko's. The problems are (1) a prompt instruction that frames
workspace memory as *this speaker's* prior conversation, and (2) the LLM
embellishing real recall with invented specifics that the prompt never forbids.

## Evidence (live workspace on :3333, the exact memory the agent used)

Dumped all **11 frames** + the **179-entity** knowledge graph and tested every
disputed claim for presence in real memory:

| Claim the agent made | In real memory? | |
|---|---|---|
| Ivan (owns GPU/H200) | **PRESENT** (frame 6 + entity "Ask Ivan") | real recall |
| Mihail (owns architecture) | **PRESENT** (frame text) | real recall |
| LoCoMo / Mem0 | **PRESENT** (frame text) | real recall |
| H200 / GPU | **PRESENT** | real recall |
| Egzakta, Hermes | entities present | real recall |
| **"4 months runway"** | **ABSENT** from all frames | **confabulated** |
| **"227 entities tracked"** | real count is **179** | **confabulated number** |
| **"OpenClaw + Hermes competitive analysis"** | OpenClaw **ABSENT** in frames | **confabulated** |
| **"our last session" / "you're back in context"** | no *this-speaker* session; prior sessions exist but are the owner's | **framing over-claim** |

So the recall substrate **works** (it retrieved Marko's real frames). The trust
damage comes from framing + embellishment, not from a broken retriever and not
from one user's memory leaking into another's.

## Root cause (code)

`packages/agent/src/orchestrator.ts` → `recallMemory()`, lines ~529-533, injected
into the system prompt every turn:

```
# Recalled Memories
These memories were automatically retrieved for the user's current message.
IMPORTANT: Use these to ground your response. Cite them naturally:
  "From our previous discussion...", "You mentioned that...", "Based on your workspace context..."
Do NOT ignore relevant memories. Do NOT present memory content as your own reasoning — attribute it.
```

Two defects:
1. **Framing:** it instructs the model to cite *workspace* memory as *"From our
   previous discussion…" / "You mentioned that…"* — asserting a shared history
   with the current speaker that may not exist (first contact, or the memory is
   the workspace owner's, not this speaker's). This directly seeds
   "welcome back / our last session."
2. **No anti-confabulation guard:** it says "attribute it" but never "state ONLY
   what the memories say; don't invent specifics not present." So the model fills
   gaps with plausible numbers/names (runway, 227, OpenClaw) and presents them as
   recall.

## Proposed fix (surgical — same block)

```
# Recalled Memories
These are facts saved in this WORKSPACE'S memory, retrieved for the user's current
message. They may come from earlier sessions, other sessions, or imported sources —
NOT necessarily from this conversation.
IMPORTANT — ground your response in them, but attribute provenance HONESTLY:
- Say "your saved memory shows…" / "from your workspace notes…". Do NOT say
  "from our previous discussion" or "you just mentioned" unless it was actually
  said earlier in THIS conversation.
- On the user's first message, do NOT claim continuity ("welcome back",
  "as we discussed", "you're back in context") — you have no prior turn yet.
- State ONLY what the memories below actually say. Do NOT invent specifics
  (numbers, names, dates, competitors) that are not present — if unsure, ask
  rather than assert.
- Do NOT present memory content as your own reasoning — attribute it.
```

Expected effect: flips Chen (the fabricated-history failure), de-risks Maya/Sam/Leo
(unverifiable specifics), and keeps the genuine recall that bonded them. Pairs with
the report's fix #1 (auditable memory) and #3 (demote the "Recalled N / Auto-saved N"
chrome).

## Not a data-bleed (scope note)

Single-tenant workspace; all data is the owner's. The cross-*user* bleed risk only
arises in shared/team workspaces and was NOT exercised here — flag for a separate
multi-tenant test, but it is not what this run found.
