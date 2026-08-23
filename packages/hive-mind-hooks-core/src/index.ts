/**
 * @waggle/hive-mind-hooks-core — public barrel.
 *
 * Tool-agnostic foundation for the hive-mind lifecycle-hook ports
 * (codex / codex-desktop / cursor / hermes / openclaw). Generalizes the
 * reversible-install primitives, the EventAdapter-parameterized lifecycle
 * handler bodies, and the jsonRegister merge helper proven by the Wave-1
 * @waggle/hive-mind-hooks-claude-code reference. Codec-agnostic: YAML/JSON5
 * parsers live in the consumer packages, not here.
 */

// Per-tool event mapping + field extraction contract.
export * from './event-adapter.js';

// Filesystem path + command-string helpers (backup paths, cli-path quoting).
export * from './paths-core.js';

// Reversible-install primitives (byte-identical backup, pointer round-trip,
// create-if-missing + verified restore/uninstall).
export * from './install-core.js';

// Additive, marker-tagged, immutable JSON config merge for JSON-config tools.
export * from './json-register.js';

// Shared lifecycle handler bodies + factories (stdin/exit-0 + openclaw in-process).
export * from './handlers-core.js';

// Fail-open hook runner + stdin/argv helpers (re-authored from the CC _shared.ts).
export * from './hook-shared.js';

// Cross-platform entrypoint detection for executable hook modules.
export { isDirectExecution } from '@waggle/hive-mind-shim-core';
