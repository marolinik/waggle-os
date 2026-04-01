/**
 * Structured logger for the Waggle local server.
 *
 * Replaces raw console.log/warn/error with tagged, leveled output.
 * All messages are prefixed with [waggle] and a component tag.
 * In M2 this writes to stdout; can be extended to file/telemetry later.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: '\x1b[90m[debug]\x1b[0m',
  info: '',
  warn: '\x1b[33m[warn]\x1b[0m',
  error: '\x1b[31m[error]\x1b[0m',
};

function formatMessage(tag: string, level: LogLevel, msg: string, data?: unknown): string {
  const prefix = LEVEL_PREFIX[level];
  const base = `[waggle:${tag}] ${prefix ? prefix + ' ' : ''}${msg}`;
  if (data !== undefined) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    return `${base} ${detail}`;
  }
  return base;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(tag: string): Logger {
  return {
    debug(msg, data) { console.debug(formatMessage(tag, 'debug', msg, data)); },
    info(msg, data) { console.log(formatMessage(tag, 'info', msg, data)); },
    warn(msg, data) { console.warn(formatMessage(tag, 'warn', msg, data)); },
    error(msg, data) { console.error(formatMessage(tag, 'error', msg, data)); },
  };
}

/** Default server logger */
export const log = createLogger('server');
