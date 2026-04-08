/** Minimal structured logger for @waggle/core */
export function createCoreLogger(tag: string) {
  const prefix = `[waggle:${tag}]`;
  return {
    info: (msg: string, data?: unknown) => console.info(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
    warn: (msg: string, data?: unknown) => console.warn(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
    error: (msg: string, data?: unknown) => console.error(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
    debug: (msg: string, data?: unknown) => console.debug(data ? `${prefix} ${msg}` : `${prefix} ${msg}`, ...(data ? [data] : [])),
  };
}
