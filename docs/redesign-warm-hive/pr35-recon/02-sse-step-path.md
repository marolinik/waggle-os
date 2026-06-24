# PR3.5 Recon — SSE/Chat "step" event path & provenance attach point

**Question:** Can a `source`/provenance field attach to streamed agent "step" events
(to power the `⬡ source · when` ProvenanceLine pill that PR3 wired date-only)?

**Verdict: NEEDS-WIRING.** A streamed `step` event today carries *only* `{ content: string }` —
no frame id, no `source`, no provenance of any kind. The frame `source` *does* exist in the
substrate (`MemoryFrame.source: FrameSource`), but it is flattened to formatted text strings
before it ever reaches the SSE layer. Attaching `source` to a step is a real (but small &
well-scoped) plumbing job, not a trivial projection. The cleanest path is **not** to enrich the
generic `step` event — it's to enrich the `tool_result` event for the `auto_recall` (memory) tool,
which is the only step type that has a real provenance signal.

---

## 1. Server — where steps are produced & streamed

**Route:** `packages/server/src/local/routes/chat.ts` — `POST /api/chat`, SSE via `reply.hijack()`.

**SSE writer (the only emit helper):** `chat.ts:475`
```ts
const sendEvent = (event: string, data: unknown) => {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
```

### The `step` payload shape (server)
Every `step` event the server emits has the **same minimal shape**: `{ content: string }`. There is
no other field. Representative emit sites:

- `chat.ts:761` — `sendEvent('step', { content: 'Recalling relevant memories...' })`
- `chat.ts:780` — `sendEvent('step', { content: 'Recalled N relevant memories.' })`
- `chat.ts:1170` — `sendEvent('step', { content: stepText })` where `stepText = describeToolUse(name, input)`
  (this is the **per-tool-call** step, fired from the agent-loop `onToolUse` callback — the main step source)
- plus budget/approval/compression/GEPA steps at `:740 :754 :771 :904 :921 :929 :1023 :1027 :1108 :1352 :1382 :1389 :1439 :1458` — all `{ content }` only.

### The agent-loop emission (where tool steps originate)
**`packages/agent/src/agent-loop.ts`** does **not** emit `step` events itself. It exposes typed
callbacks (`AgentLoopConfig`, `agent-loop.ts:37-39`):
```ts
onToken?: (token: string) => void;
onToolUse?: (name: string, input: Record<string, unknown>) => void;
onToolResult?: (name: string, input: Record<string, unknown>, result: string) => void;
```
The route wires these to SSE in the runner config (`chat.ts:1167-1185` / `:1186-1220`):
```ts
onToolUse: (name, input) => {
  const stepText = describeToolUse(name, input);
  sendEvent('step', { content: stepText });   // ← the step
  sendEvent('tool', { name, input });          // ← raw tool event (has name+input)
  ...
},
onToolResult: (name, input, result) => {
  ...
  sendEvent('tool_result', { name, result, duration, isError });  // ← name+result+duration
  ...
},
```
**Key fact:** the loop's callbacks expose `name`, `input`, `result` — but **no frame, no `source`,
no provenance**. The agent loop has no concept of which memory frame a step touched.

### The related `tool_result` shape (server)
`chat.ts:1200` — `{ name, result, duration, isError }`. For the memory tool specifically:
`chat.ts:781` — `sendEvent('tool_result', { name: 'auto_recall', result: resultText, duration, isError })`
where `resultText` is **already-rendered text** (`chat.ts:777-779`):
```ts
const snippets = (recall.recalled ?? []).slice(0, 3);
const snippetText = snippets.map(s => `  - ${s}`).join('\n');
const resultText = `${recall.count} memories recalled:\n${snippetText}`;
```

### Why the provenance is lost: `recallMemory()` returns text, not frames
`packages/agent/src/orchestrator.ts:453-457`:
```ts
async recallMemory(...): Promise<{ text: string; count: number; recalled?: string[] }>
```
`recalled` is a `string[]` of **formatted snippets** — the frame objects (which *do* carry
`source`) are collapsed to display strings inside `recallMemory` before returning. The real
provenance lives one layer deeper: `packages/hive-mind-core/src/mind/frames.ts:35` —
`MemoryFrame.source: FrameSource` (e.g. `user_stated`, harvest adapters: chatgpt/claude/etc.),
plus `sourceUrl`/`sourceId` extras. So **the data exists in the DB, it is just not projected up
through `recallMemory` → SSE.**

---

## 2. Frontend — SSE consumer → activity stream blocks

### SSE parse + event-type mapping
**`apps/web/src/lib/adapter.ts:692-738`** (`streamChat` async generator) parses the raw SSE
text and maps event names to `StreamEvent.type`:
- `adapter.ts:729` — `else if (type === 'step') type = 'step';`
- yields `{ type, data } as StreamEvent` (`adapter.ts:732`) — `data` is the parsed `{ content }`.

### `StreamEvent` type
**`apps/web/src/lib/types.ts:616-619`**:
```ts
export interface StreamEvent {
  type: 'token' | 'step' | 'tool_start' | 'tool_end' | 'done' | 'error' | 'approval_request' | 'approval_required' | 'model_switch' | 'notification';
  data: unknown;
}
```

### Step → block reduction
**`apps/web/src/hooks/useChat.ts:152-165`** turns a `step` event into a `StepContentBlock`:
```ts
case 'step': {
  const description = typeof data === 'string' ? data : (data?.content as string ?? '');
  if (description) {
    // mark prior running steps done
    blocks.push({ type: 'step', blockId: nextBlockId('step'), description, status: 'running' });
  }
  break;
}
```

### `StepContentBlock` type (client) — **the field set to extend**
**`apps/web/src/lib/types.ts:474-479`**:
```ts
export interface StepContentBlock {
  type: 'step';
  blockId: string;
  description: string;
  status: 'running' | 'done';
}
```
No `source`/`provenance` field. This is the type that would gain an optional
`provenance?: { source: string; when?: string }`.

### Where provenance is (not yet) shown — PR3's date-only affordance
**`apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx:28-43`** groups a consecutive run
of step blocks into one `ActivityStream` card. PR3 already left the hook here and an honest comment
(`BlockRenderer.tsx:24-26`):
```ts
// Provenance pills are intentionally omitted: the SSE
// `step` payload carries no structured source field today (recon chat.md §4) —
// we render the affordance, never fabricated provenance.
```
And the map drops provenance (`BlockRenderer.tsx:30-33`):
```ts
const activitySteps: ActivityStep[] = steps.map(s => ({
  tone: s.status === 'running' ? 'honey' : 'intel',
  text: s.description,        // ← no provenance projected
}));
```

The rendering target already exists and is wired:
- **`ActivityStream`** (`components/os/warm/ActivityStream.tsx:8-13`) — `ActivityStep.provenance?: { source; when?; onClick? }`, rendered at `:67-71` **only when present**.
- **`ProvenanceLine`** (`components/os/warm/ProvenanceLine.tsx:19-32`) — the `⬡ source · when` pill.

So the **client consumer is provenance-ready**; it is waiting for the server to deliver a `source`.

---

## 3. Honest verdict — trivial vs needs-wiring

**NEEDS-WIRING (small, scoped). NOT trivially projectable.**

- A generic `step` (e.g. "Drafting the document", "Budget limit reached", a `bash` tool call) has
  **no provenance at all** and never will — those steps are not memory reads. Stamping them with a
  `source` would be fabrication (exactly what PR3's comment refuses). So a blanket "add source to
  every step" is wrong on the merits.
- The **one** step with a genuine provenance signal is the **memory recall** (`auto_recall`). Its
  source is real (`MemoryFrame.source`) but is destroyed by `recallMemory()` returning `string[]`
  text instead of frame metadata.

### The precise new wiring needed
1. **Substrate → orchestrator (the load-bearing change):** widen `recallMemory()`'s return in
   `packages/agent/src/orchestrator.ts:453-457` to carry per-snippet provenance, e.g. add
   `recalledFrames?: Array<{ text: string; source: FrameSource; sourceUrl?: string; when?: string }>`
   alongside the existing `recalled: string[]`. The frame objects with `.source` are already in hand
   inside `recallMemory` — this is a "stop flattening it" change, not a new query. (This is the
   *same* 1-field server projection the S2 handoff named: *"the `frame.source` 1-field server
   projection (unlocks the ⬡ provenance pill on Chat+Workspace)"*.)
2. **Server SSE:** in `chat.ts` around `:780-781`, emit the source on the memory step/tool_result —
   either add `source`/`provenance` to the existing `tool_result` (`{ name:'auto_recall', ... }`) or
   to the `step` payload for that one event: `sendEvent('step', { content, provenance: { source, when } })`.
   (`{ content }` → `{ content, provenance? }` is additive and backward-compatible.)
3. **Client types:** add optional `provenance?: { source: string; when?: string }` to
   `StepContentBlock` (`types.ts:474`) and to the `StreamEvent` `data` handling.
4. **Client reducer:** in `useChat.ts:152` carry `data.provenance` onto the pushed step block.
5. **Client render:** in `BlockRenderer.tsx:30-33` project `s.provenance` into `ActivityStep` (the
   `ActivityStream`/`ProvenanceLine` rendering path already exists and gates on presence).

**Effort estimate:** ~5 small edits across 4 files (orchestrator return-shape widen is the only
non-trivial one; everything else is a 1-field pass-through). No new DB columns, no new query — the
`source` already exists at `frames.ts:35`. Lowest-risk slice = wire it on `auto_recall` only
(memory steps), leave all other steps provenance-less by design.

### Scope call for PR3.5
**In-scope and the right size for PR3.5** *iff* paired with the `recallMemory` return-shape widen.
If PR3.5 wants to stay frontend-only, then provenance on steps is **out-of-scope** (the data is not
on the wire) — and the honest move is to keep PR3's "render the affordance, never fabricated
provenance" stance until the server projection lands.

---

## Appendix — file:line index

| Concern | File:line |
|---|---|
| SSE writer | `packages/server/src/local/routes/chat.ts:475` |
| step payload (memory) | `chat.ts:761`, `:780` |
| step payload (per tool call) | `chat.ts:1170` (via `describeToolUse`) |
| tool_result payload | `chat.ts:1200`; memory variant `chat.ts:781` |
| recall snippet build (text flatten) | `chat.ts:777-779` |
| agent-loop callbacks (no source) | `packages/agent/src/agent-loop.ts:37-39`, wired `chat.ts:1167-1220` |
| recallMemory return shape | `packages/agent/src/orchestrator.ts:453-457` |
| frame `source` field (real provenance) | `packages/hive-mind-core/src/mind/frames.ts:35` |
| SSE parse + map | `apps/web/src/lib/adapter.ts:717-732` |
| StreamEvent type | `apps/web/src/lib/types.ts:616-619` |
| step → block reducer | `apps/web/src/hooks/useChat.ts:152-165` |
| StepContentBlock type | `apps/web/src/lib/types.ts:474-479` |
| activity grouping + omitted-provenance comment | `apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx:24-43` |
| ActivityStream (provenance-ready) | `apps/web/src/components/os/warm/ActivityStream.tsx:8-13, 67-71` |
| ProvenanceLine pill | `apps/web/src/components/os/warm/ProvenanceLine.tsx:19-32` |
