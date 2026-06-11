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
  return {
    info: (msg: string, data?: unknown) => console.error(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
    warn: (msg: string, data?: unknown) => console.warn(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
    error: (msg: string, data?: unknown) => console.error(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
    debug: (msg: string, data?: unknown) => console.error(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
  };
}
