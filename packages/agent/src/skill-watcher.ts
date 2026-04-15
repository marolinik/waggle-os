/**
 * Skills 2.0 Tier 3b — filesystem watcher for SKILL.md hot-reload.
 *
 * Watches a single directory for .md file changes and fires a callback
 * when skills are created / modified / deleted. Debounced because
 * editors commonly emit 2-3 events for a single atomic save
 * (write-temp → rename → notify).
 *
 * Uses Node's built-in fs.watch() instead of chokidar to avoid
 * shipping an extra dependency into the Tauri binary. fs.watch is
 * inherently platform-dependent (inotify on Linux, FSEvents on macOS,
 * ReadDirectoryChangesW on Windows) but is adequate for a single
 * shallow directory of .md files. If reliability becomes an issue,
 * swap in chokidar without changing the public API.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SkillWatcherOptions {
  /** Fired when one or more .md files change. Receives the set of changed filenames. */
  onChange: (changedFiles: string[]) => void;
  /** Debounce window in ms to coalesce rapid events. Default 150. */
  debounceMs?: number;
}

export interface SkillWatcherHandle {
  /** Stop watching and release native handles. Idempotent. */
  close(): void;
}

/**
 * Start watching `dir` for .md file changes. If the directory doesn't
 * exist, it's created. Silently no-ops if fs.watch throws (e.g. on
 * exotic filesystems that don't support change notification).
 */
export function watchSkillDirectory(
  dir: string,
  opts: SkillWatcherOptions,
): SkillWatcherHandle {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const debounceMs = opts.debounceMs ?? 150;

  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const flush = () => {
    if (closed) return;
    const changed = Array.from(pending);
    pending = new Set();
    timer = null;
    if (changed.length > 0) {
      try {
        opts.onChange(changed);
      } catch {
        // Callback errors are the caller's problem — never kill the watcher.
      }
    }
  };

  const queue = (filename: string) => {
    if (closed) return;
    pending.add(filename);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(dir, { persistent: false }, (_eventType, filename) => {
      if (!filename) return;
      // fs.watch filename may include subdir — we only care about
      // direct children that end in .md
      const base = path.basename(filename);
      if (!base.endsWith('.md')) return;
      queue(base);
    });
    watcher.on('error', () => {
      // Don't crash — consider the watch dead and stop gracefully.
      closed = true;
      if (timer) clearTimeout(timer);
    });
  } catch {
    // fs.watch unsupported — return a no-op handle.
    closed = true;
  }

  return {
    close() {
      if (closed) return;
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        watcher?.close();
      } catch { /* ignore */ }
    },
  };
}
