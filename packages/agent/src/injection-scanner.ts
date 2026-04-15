/**
 * Thin re-export for backward compatibility.
 *
 * The canonical home of `scanForInjection` is now `@waggle/core` — it was moved
 * so the harvest pipeline (in core) can call it without a cross-package import.
 * Existing callers in `@waggle/agent` and downstream packages can keep importing
 * from `./injection-scanner.js` or `@waggle/agent` unchanged.
 */

export { scanForInjection, type ScanResult } from '@waggle/core';
