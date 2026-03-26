/**
 * useAutoUpdate — listens for the Tauri updater event emitted from Rust
 * and logs when an update is available.
 *
 * The actual update check happens in Rust (lib.rs) on startup. It emits
 * a `waggle://update-available` event with { version, body }. This hook
 * listens for that event and surfaces the info as state.
 *
 * Non-blocking, silent (log only). Guarded for web mode.
 *
 * Release flow:
 *   git tag v1.0.1 && git push --tags
 *   This triggers release.yml which builds + signs + publishes to GitHub Releases.
 *   Tauri updater fetches latest.json from the release assets.
 */

import { useEffect, useState } from 'react';

interface UpdateInfo {
  version: string;
  body: string;
}

export function useAutoUpdate(): UpdateInfo | null {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Guard: only run inside Tauri desktop runtime
    if (!('__TAURI_INTERNALS__' in window)) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const eventModule = '@tauri-apps/' + 'api/event';
        const { listen } = await import(/* @vite-ignore */ eventModule);

        unlisten = await listen('waggle://update-available', (event: unknown) => {
          const payload = (event as { payload: UpdateInfo }).payload;
          console.log('[updater] Update available:', payload.version);
          setUpdateInfo(payload);
        });
      } catch (err) {
        console.warn('[updater] Failed to register update listener:', err);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  return updateInfo;
}
