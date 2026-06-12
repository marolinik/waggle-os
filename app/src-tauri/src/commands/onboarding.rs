// CC Sesija A §2.3 Task A10 — first-launch detection via filesystem flag.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.3 Task A10
//
// Persists a flag file at `~/.waggle/first-launch.flag` so the onboarding wizard
// state survives across app reinstalls (browser localStorage doesn't, since
// Tauri builds may use a fresh WebView profile per install). The web `npm run
// dev` path continues to use localStorage via useOnboarding — these commands
// are the durable Tauri-mode addition, not a replacement.
//
// Cross-platform user-home resolution uses std::env (USERPROFILE on Windows,
// HOME on Unix) to avoid pulling in a new dirs/home crate dep.

use std::path::PathBuf;

const FLAG_DIR: &str = ".waggle";
const FLAG_FILE: &str = "first-launch.flag";

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Resolve the flag location: `WAGGLE_DATA_DIR` (when set and non-empty) else
/// `~/.waggle` — the SAME resolution order the sidecar's resolveDataDir uses
/// (UX-Refactor P4/D11). Without this, a custom-data-dir install reads/writes
/// the flag in `~/.waggle` while the server's completion stamp lives in the
/// data dir — and a stale `~/.waggle` flag from a prior default install would
/// auto-skip onboarding against a brand-new data dir (P4 review, 5 findings).
fn flag_path() -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("WAGGLE_DATA_DIR") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir).join(FLAG_FILE));
        }
    }
    let home = home_dir().ok_or_else(|| {
        "could not resolve user home directory (USERPROFILE/HOME unset)".to_string()
    })?;
    Ok(home.join(FLAG_DIR).join(FLAG_FILE))
}

/// Returns true if the user has not yet completed onboarding.
/// Implementation: returns `!flag_file_exists`. On any IO error (e.g. home dir
/// unresolvable in a sandboxed environment) returns `true` so the wizard runs
/// — better to show the wizard once too often than to silently skip it.
#[tauri::command]
pub async fn is_first_launch() -> Result<bool, String> {
    let path = match flag_path() {
        Ok(p) => p,
        Err(_) => return Ok(true),
    };
    Ok(!path.exists())
}

/// Marks onboarding as complete by creating the flag file. Idempotent.
/// Creates the parent `~/.waggle/` directory if needed.
#[tauri::command]
pub async fn mark_first_launch_complete() -> Result<(), String> {
    let path = flag_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {} failed: {}", parent.display(), e))?;
    }
    std::fs::write(&path, b"completed\n")
        .map_err(|e| format!("write {} failed: {}", path.display(), e))?;
    Ok(())
}

/// Resets the first-launch flag (deletes the file). For dev / QA flows that
/// need to re-trigger onboarding without a full reinstall.
#[tauri::command]
pub async fn reset_first_launch() -> Result<(), String> {
    let path = flag_path()?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("remove {} failed: {}", path.display(), e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_path_resolution_order() {
        // ONE sequential test — env vars are process-global and cargo runs
        // tests in parallel threads; split tests would race on WAGGLE_DATA_DIR.
        let tmp = std::env::temp_dir().join(format!("waggle-test-home-{}", std::process::id()));
        std::env::set_var("USERPROFILE", &tmp);
        std::env::set_var("HOME", &tmp);

        // Default: ~/.waggle.
        std::env::remove_var("WAGGLE_DATA_DIR");
        let path = flag_path().expect("flag_path resolves with USERPROFILE/HOME set");
        assert!(
            path.ends_with(".waggle/first-launch.flag")
                || path.ends_with(".waggle\\first-launch.flag")
        );

        // P4/D11: a custom data dir keeps the flag NEXT TO the server's stamp.
        let data_dir =
            std::env::temp_dir().join(format!("waggle-test-datadir-{}", std::process::id()));
        std::env::set_var("WAGGLE_DATA_DIR", &data_dir);
        let custom = flag_path().expect("flag_path resolves with WAGGLE_DATA_DIR set");
        assert!(custom.starts_with(&data_dir));
        assert!(custom.ends_with("first-launch.flag"));

        // Empty env value falls through to the home default (matches resolveDataDir).
        std::env::set_var("WAGGLE_DATA_DIR", "");
        let fallback = flag_path().expect("flag_path resolves with empty WAGGLE_DATA_DIR");
        assert!(
            fallback.ends_with(".waggle/first-launch.flag")
                || fallback.ends_with(".waggle\\first-launch.flag")
        );

        std::env::remove_var("WAGGLE_DATA_DIR");
    }
}
