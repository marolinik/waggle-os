/** Minimal structured logger for @waggle/core */

/**
 * Logger shape used across the substrate. Downstream consumers that want
 * structured output (pino, winston, etc.) can wrap their logger in this
 * shape and pass it as a dependency.
 */
// Reverse-ported from OSS hive-mind (oss-drift triage R1, 2026-06-11).
export interface CoreLogger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;
}

export function createCoreLogger(tag: string): CoreLogger {
  const prefix = `[waggle:${tag}]`;
  // ALL diagnostics go to stderr. stdout is reserved for program data — the
  // MCP stdio protocol (hive-mind-mcp-server) and CLI `--json` envelopes — so
  // a library log line on stdout corrupts machine consumers. console.warn and
  // console.error already target stderr; route info/debug there too rather
  // than console.info/console.debug (which write to stdout).
  // Reverse-ported from OSS hive-mind (oss-drift triage R1, 2026-06-11).
  //
  // Guard the optional payload with `data !== undefined` (NOT a truthiness
  // check) so falsy-but-defined payloads (0, '', false, null) are still
  // logged instead of silently dropped. Ported from hive-mind a99ea0e.
  return {
    info: (msg: string, data?: unknown) =>
      data !== undefined ? console.error(`${prefix} ${msg}`, data) : console.error(`${prefix} ${msg}`),
    warn: (msg: string, data?: unknown) =>
      data !== undefined ? console.warn(`${prefix} ${msg}`, data) : console.warn(`${prefix} ${msg}`),
    error: (msg: string, data?: unknown) =>
      data !== undefined ? console.error(`${prefix} ${msg}`, data) : console.error(`${prefix} ${msg}`),
    debug: (msg: string, data?: unknown) =>
      data !== undefined ? console.error(`${prefix} ${msg}`, data) : console.error(`${prefix} ${msg}`),
  };
}
