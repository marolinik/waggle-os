# Agent Behavior Audit — 2026-04-16

## Symptoms Reported
1. Agent creates documents user never asked for
2. Agent accuses user of prompt injection on normal answers ("yes thats the story")
3. Old memories appear after data wipe
4. GEPA spinner triggers → erratic behavior follows
5. Duplicate memory frames stored

## Root Causes Found

### RC-1: GEPA expands mid-conversation replies (CRITICAL)
**File**: `packages/server/src/local/routes/chat.ts:696-722`
**File**: `packages/server/src/local/services/optimizer-service.ts:120`

GEPA runs on EVERY user message. Its `isVague` classifier treats any message ≤100 chars
that isn't a greeting/question/command as "vague". Mid-conversation replies like
"yes thats the story" or "the first three" get expanded into elaborate prompts.

At `chat.ts:992-998`, the expanded text **replaces** the user's original message:
```
User sends: "yes thats the story"
GEPA expands to: "Create a comprehensive framework document covering AI sovereignty..."
LLM sees: the expanded version → creates an unrequested document
```

**Fix**: Only run GEPA on the first user message in a session. Add `isFirstUserMessage`
guard to the GEPA block (same check already used for ambiguity at line 731).

### RC-2: Entity extractor defaults capitalized phrases to "person" (MEDIUM)
**File**: `packages/agent/src/entity-extractor.ts:56-59`

Any 2-3 word capitalized phrase with no concept/org/project indicators defaults to
`person` type. Document headings ("Current Situation", "Key Issues", "Recommended
Next Action") get extracted as person entities.

**Fix**: Default to `concept` instead of `person` for unclassified 2-3 word phrases.

### RC-3: Cognify processes agent responses (LOW)
The cognify pipeline runs on full conversation text including agent-generated content.
Agent responses contain structured headings that get mis-extracted as entities.

**Fix**: Only cognify user messages, or add a pre-filter to strip markdown headings.

### RC-4: Frame dedup not catching identical content (LOW)
Frames 1 and 3 in the clean personal.mind are word-for-word identical.

**Fix**: Check for exact content match before creating new frames in `cognify()`.

## Fixes Applied
- [x] RC-1: Guard GEPA with isFirstUserMessage (chat.ts:696 — added `&& isFirstUserMessage`)
- [x] RC-2: Entity extractor default → concept (entity-extractor.ts:57 — check isPerson first)
- [ ] RC-3: (deferred — cognify source filtering)
- [ ] RC-4: (deferred — frame dedup)
