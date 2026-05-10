/**
 * Zero-dependency structured logger. Emits one JSON object per line on
 * stderr (so hook scripts can keep stdout clean for return values).
 *
 * Levels: debug=10, info=20, warn=30, error=40. Default level is 'info';
 * override via constructor opts.level or env HIVE_MIND_SHIM_LOG_LEVEL.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isLogLevel(value: string): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

function parseLevel(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return isLogLevel(normalized) ? normalized : undefined;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface CreateLoggerOptions {
  /** Optional component name attached to every log line. */
  name?: string;
  /** Filter threshold; defaults to env HIVE_MIND_SHIM_LOG_LEVEL or 'info'. */
  level?: LogLevel;
  /** Custom write target for tests; defaults to process.stderr.write. */
  write?: (line: string) => void;
  /** Override clock for deterministic tests. */
  now?: () => Date;
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const name = opts.name ?? 'shim-core';
  const envLevel = parseLevel(process.env['HIVE_MIND_SHIM_LOG_LEVEL']);
  const level = opts.level ?? envLevel ?? 'info';
  const threshold = LEVEL_ORDER[level];
  const write = opts.write ?? ((line: string): void => { process.stderr.write(line); });
  const now = opts.now ?? ((): Date => new Date());

  function emit(lvl: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const entry: Record<string, unknown> = {
      timestamp: now().toISOString(),
      level: lvl,
      name,
      msg,
    };
    if (meta) {
      for (const k of Object.keys(meta)) {
        entry[k] = meta[k];
      }
    }
    write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (msg, meta): void => emit('debug', msg, meta),
    info: (msg, meta): void => emit('info', msg, meta),
    warn: (msg, meta): void => emit('warn', msg, meta),
    error: (msg, meta): void => emit('error', msg, meta),
  };
}
