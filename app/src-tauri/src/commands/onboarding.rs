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

fn flag_path() -> Result<PathBuf, String> {
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
    fn flag_path_resolves_to_dot_waggle_subdir() {
        // Set a temp env var so the test does not touch the real home dir.
        let tmp = std::env::temp_dir().join(format!("waggle-test-home-{}", std::process::id()));
        std::env::set_var("USERPROFILE", &tmp);
        std::env::set_var("HOME", &tmp);
        let path = flag_path().expect("flag_path resolves with USERPROFILE/HOME set");
        assert!(path.ends_with(".waggle/first-launch.flag") || path.ends_with(".waggle\\first-launch.flag"));
    }
}
