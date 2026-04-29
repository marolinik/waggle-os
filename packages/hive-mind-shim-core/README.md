# @hive-mind/shim-core

Foundation utilities for the [hive-mind-clients](https://github.com/marolinik/hive-mind-clients) cross-IDE silent capture shim portfolio.

This package is shared by every per-IDE shim (`@hive-mind/claude-code-hooks`, `@hive-mind/cursor-hooks`, etc.). It exposes typed interfaces, deterministic helpers, and a single CLI bridge to the hive-mind core — so each shim only has to translate IDE-native hook events into a common shape, then hand off to shim-core.

**Status**: pre-1.0, Wave 1 in development.
**Target**: Node >= 20, ESM-only.
**Peer dependency**: hive-mind-cli >= 0.1.0 (installed via `npm install -g @hive-mind/cli` or a local link).

## What's in here

| Module | Purpose |
|---|---|
| `frame-encoder` | Translate `HookEvent` -> `HookFrame` (the I/P/B-style payload that ships to hive-mind). |
| `workspace-resolver` | Pick the right `.mind` file: per-project marker if present, else `~/.hive-mind/global.mind`. |
| `cli-bridge` | The single chokepoint. Spawns `hive-mind-cli mcp call <tool> --args <json> --json` and returns typed results. |
| `hook-event-types` | Canonical `EventType`, `ShimSource`, `HookEvent` interfaces shared across shims. |
| `importance-classifier` | Pure-functional rules that map content -> `temporary` / `important` / `critical`. |
| `prompt-summarizer` | Deterministic extractive summarizer (no LLM call). Used by `Stop`-hook handlers to compress turns. |
| `retry-bridge` | Exponential backoff with jitter and per-attempt timeout. Wraps every CLI call. |
| `logger` | Zero-dep structured JSON logger. Writes to stderr so hook stdout stays clean. |

## Usage (from a shim)

```ts
import {
  createCliBridge,
  encodeFrame,
  resolveWorkspace,
  type HookEvent,
} from '@hive-mind/shim-core';

const bridge = createCliBridge();

const event: HookEvent = {
  eventType: 'user-prompt-submit',
  source: 'claude-code',
  cwd: process.cwd(),
  timestamp_iso: new Date().toISOString(),
  payload: { content: 'How do I X?', session_id: 'abc-123' },
};

const workspace = await resolveWorkspace(event.cwd);
await bridge.switchWorkspace(workspace.path);

const frame = encodeFrame(event);
await bridge.saveMemory(frame);
```

## Bridge architecture

Every operation goes through one transport: `hive-mind-cli mcp call <tool> --args <json> --json --timeout-ms N`. That's a deliberate chokepoint:

- New MCP tools added upstream are reachable immediately via `bridge.callMcpTool('<new_tool>', args)`.
- Schema or arg changes in upstream MCP tools surface in one place, not 6 shims.
- Failure modes (timeout, exit non-zero, malformed JSON, `isError=true`) are normalized into thrown `Error`s by the bridge.

## License

Apache-2.0 — see [the repo root](https://github.com/marolinik/hive-mind-clients/blob/main/LICENSE) for the full text.
