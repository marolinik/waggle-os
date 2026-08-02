use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const WATCHDOG_FAILURE_THRESHOLD: u32 = 3;
const WATCHDOG_INITIAL_STARTUP_GRACE: Duration = Duration::from_secs(600);

pub struct ServiceState {
    pub process: Mutex<Option<Child>>,
    pub port: u16,
}

impl ServiceState {
    pub fn new(port: u16) -> Self {
        Self {
            process: Mutex::new(None),
            port,
        }
    }
}

fn valid_node_override(custom: Option<&OsStr>) -> Option<PathBuf> {
    let custom_path = PathBuf::from(custom?);
    custom_path.is_file().then_some(custom_path)
}

/// Resolve the Node.js binary path.
/// Priority: WAGGLE_NODE_PATH env → bundled resources/node[.exe] → system PATH "node"
fn resolve_node_path() -> String {
    // 1. Explicit env override (development/advanced users)
    let custom = std::env::var_os("WAGGLE_NODE_PATH");
    if let Some(custom_path) = valid_node_override(custom.as_deref()) {
        return custom_path.to_string_lossy().to_string();
    }
    if custom.as_deref().is_some_and(|value| !value.is_empty()) {
        eprintln!("[waggle] Ignoring WAGGLE_NODE_PATH because it is not a runtime file");
    }

    // 2. Bundled Node.js in resources/ directory (next to exe)
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(ref dir) = exe_dir {
        let bundled = if cfg!(windows) {
            dir.join("resources").join("node.exe")
        } else {
            dir.join("resources").join("node")
        };
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
    }

    // 3. Development fallback: relative to src-tauri working dir
    if cfg!(debug_assertions) {
        let dev_resources = if cfg!(windows) {
            "resources/node.exe"
        } else {
            "resources/node"
        };
        if std::path::Path::new(dev_resources).exists() {
            return dev_resources.to_string();
        }
    }

    // 4. System PATH fallback
    "node".to_string()
}

#[derive(Debug, PartialEq, Eq)]
enum ServiceScriptKind {
    Bundled,
    DevSource,
}

#[derive(Debug, PartialEq, Eq)]
struct ServiceScript {
    path: PathBuf,
    kind: ServiceScriptKind,
}

#[derive(Debug, PartialEq, Eq)]
struct BundledNpmEnvironment {
    path: std::ffi::OsString,
    npm_exec_path: PathBuf,
    npm_prefix: PathBuf,
    npm_cache: PathBuf,
}

fn bundled_npm_environment(
    resources_dir: &Path,
    configured_data_dir: Option<&OsStr>,
    home_dir: Option<&OsStr>,
    ambient_path: Option<&OsStr>,
) -> Result<BundledNpmEnvironment, String> {
    let data_dir = configured_data_dir
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            home_dir
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .map(|home| home.join(".waggle"))
        })
        .ok_or_else(|| "Unable to resolve writable npm data directory".to_string())?;
    let runtime_dir = resources_dir
        .join("node_modules")
        .join("waggle-node-runtime");
    let npm_root = data_dir.join("npm");
    let separator = if cfg!(windows) { ";" } else { ":" };
    let mut path = std::ffi::OsString::from(runtime_dir.join("bin"));
    path.push(separator);
    path.push(resources_dir);
    if let Some(existing_path) = ambient_path.filter(|value| !value.is_empty()) {
        path.push(separator);
        path.push(existing_path);
    }

    Ok(BundledNpmEnvironment {
        path,
        npm_exec_path: runtime_dir
            .join("node_modules")
            .join("npm")
            .join("bin")
            .join("npm-cli.js"),
        npm_prefix: npm_root.join("prefix"),
        npm_cache: npm_root.join("cache"),
    })
}

fn find_dev_service_script(current_dir: &Path) -> Option<PathBuf> {
    for dir in current_dir.ancestors() {
        let candidate = dir
            .join("packages")
            .join("server")
            .join("src")
            .join("local")
            .join("service.ts");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_service_script(
    exe_dir: Option<&Path>,
    current_dir: &Path,
) -> Result<ServiceScript, String> {
    if let Some(dir) = exe_dir {
        let bundled = dir.join("resources").join("service.js");
        if bundled.exists() {
            return Ok(ServiceScript {
                path: bundled,
                kind: ServiceScriptKind::Bundled,
            });
        }
    }

    if cfg!(debug_assertions) {
        if let Some(script) = find_dev_service_script(current_dir) {
            return Ok(ServiceScript {
                path: script,
                kind: ServiceScriptKind::DevSource,
            });
        }
    }

    Err("Unable to locate sidecar service.js resource".to_string())
}

/// Build the Command used to spawn the sidecar process.
/// Shared by both the sync auto-start path and the async `ensure_service` tauri command.
fn build_service_command(port: u16) -> Result<Command, String> {
    let node_path = resolve_node_path();

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    let service_script = resolve_service_script(exe_dir.as_deref(), &current_dir)?;

    let mut cmd = if service_script.kind == ServiceScriptKind::DevSource {
        let mut c = Command::new(&node_path);
        c.arg("--import").arg("tsx").arg(&service_script.path);
        c
    } else {
        let mut c = Command::new(&node_path);
        c.arg(&service_script.path);
        c
    };

    cmd.env("WAGGLE_PORT", port.to_string());

    if service_script.kind == ServiceScriptKind::Bundled {
        cmd.env("WAGGLE_SKIP_LITELLM", "1");

        if let Some(ref dir) = exe_dir {
            let resources_dir = dir.join("resources");
            let native_dir = resources_dir.join("native");
            let node_modules_dir = resources_dir.join("node_modules");
            let configured_data_dir = std::env::var_os("WAGGLE_DATA_DIR");
            let home_dir = if cfg!(windows) {
                std::env::var_os("USERPROFILE")
                    .filter(|value| !value.is_empty())
                    .or_else(|| std::env::var_os("HOME").filter(|value| !value.is_empty()))
            } else {
                std::env::var_os("HOME")
                    .filter(|value| !value.is_empty())
                    .or_else(|| std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
            };
            let ambient_path = std::env::var_os("PATH");
            let npm_environment = bundled_npm_environment(
                &resources_dir,
                configured_data_dir.as_deref(),
                home_dir.as_deref(),
                ambient_path.as_deref(),
            )?;
            std::fs::create_dir_all(&npm_environment.npm_prefix)
                .map_err(|error| format!("Unable to create bundled npm prefix: {error}"))?;
            std::fs::create_dir_all(&npm_environment.npm_cache)
                .map_err(|error| format!("Unable to create bundled npm cache: {error}"))?;
            cmd.env("PATH", &npm_environment.path);
            cmd.env("NPM_EXECPATH", &npm_environment.npm_exec_path);
            cmd.env("NPM_CONFIG_PREFIX", &npm_environment.npm_prefix);
            cmd.env("NPM_CONFIG_CACHE", &npm_environment.npm_cache);

            // NODE_PATH must include the staged production deps
            // (resources/node_modules — better-sqlite3, @fastify/static,
            // drizzle-orm, @huggingface/transformers, …) so the sidecar's bare
            // require()/import() calls resolve, plus resources/native for any
            // abs-path native consumers. Node accepts multiple entries,
            // ';'-separated on Windows and ':' elsewhere.
            let sep = if cfg!(windows) { ";" } else { ":" };
            let node_path = format!(
                "{}{}{}",
                node_modules_dir.to_string_lossy(),
                sep,
                native_dir.to_string_lossy(),
            );
            cmd.env("NODE_PATH", node_path);

            let vec_ext = if cfg!(windows) {
                native_dir.join("vec0.dll")
            } else if cfg!(target_os = "macos") {
                native_dir.join("vec0.dylib")
            } else {
                native_dir.join("vec0.so")
            };
            if vec_ext.exists() {
                cmd.env("WAGGLE_SQLITE_VEC_PATH", vec_ext.to_string_lossy().as_ref());
            }

            let ort_dir = native_dir.join("onnxruntime");
            if ort_dir.exists() {
                cmd.env(
                    "ONNXRUNTIME_NODE_BINDING_PATH",
                    ort_dir.to_string_lossy().as_ref(),
                );
            }
        }
    }

    Ok(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;
    use std::thread;

    fn long_lived_command() -> Command {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", "ping -n 30 127.0.0.1 >NUL"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 30"]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command
    }

    #[test]
    fn service_script_prefers_bundled_resource_when_present() {
        let root =
            std::env::temp_dir().join(format!("waggle-service-script-{}", std::process::id()));
        let resources = root.join("resources");
        std::fs::create_dir_all(&resources).expect("creates temp resources");
        std::fs::write(resources.join("service.js"), "console.log('ok')").expect("writes service");

        let script = resolve_service_script(Some(&root), Path::new("D:/Projects/waggle-os"))
            .expect("bundled script resolves");

        assert_eq!(script.kind, ServiceScriptKind::Bundled);
        assert_eq!(script.path, resources.join("service.js"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn dev_service_script_searches_current_dir_ancestors() {
        let root =
            std::env::temp_dir().join(format!("waggle-dev-service-script-{}", std::process::id()));
        let script = root
            .join("packages")
            .join("server")
            .join("src")
            .join("local")
            .join("service.ts");
        std::fs::create_dir_all(script.parent().expect("script parent")).expect("creates dirs");
        std::fs::write(&script, "export {};").expect("writes service");

        let nested = root.join("app").join("src-tauri");
        std::fs::create_dir_all(&nested).expect("creates nested cwd");

        assert_eq!(find_dev_service_script(&nested), Some(script));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_node_overrides_do_not_shadow_runtime_fallbacks() {
        let directory_override = std::env::temp_dir();
        assert_eq!(valid_node_override(None), None);
        assert_eq!(valid_node_override(Some(OsStr::new(""))), None);
        assert_eq!(
            valid_node_override(Some(directory_override.as_os_str())),
            None
        );
    }

    #[test]
    fn existing_node_override_is_accepted() {
        let root =
            std::env::temp_dir().join(format!("waggle-node-override-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("creates temp runtime dir");
        let runtime = root.join(if cfg!(windows) { "node.exe" } else { "node" });
        std::fs::write(&runtime, b"runtime").expect("writes temp runtime");

        assert_eq!(
            valid_node_override(Some(runtime.as_os_str())),
            Some(runtime.clone())
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bundled_npm_environment_uses_configured_data_dir_and_preserves_path() {
        let resources = Path::new("waggle resources");
        let data_dir = Path::new("waggle data");
        let ambient_entries = vec![PathBuf::from("ambient-one"), PathBuf::from("ambient two")];
        let ambient_path = std::env::join_paths(&ambient_entries).expect("joins ambient PATH");
        let environment = bundled_npm_environment(
            resources,
            Some(data_dir.as_os_str()),
            Some(OsStr::new("unused home")),
            Some(ambient_path.as_os_str()),
        )
        .expect("bundled npm environment resolves");

        assert_eq!(
            environment.npm_exec_path,
            resources
                .join("node_modules")
                .join("waggle-node-runtime")
                .join("node_modules")
                .join("npm")
                .join("bin")
                .join("npm-cli.js")
        );
        assert_eq!(environment.npm_prefix, data_dir.join("npm").join("prefix"));
        assert_eq!(environment.npm_cache, data_dir.join("npm").join("cache"));
        let mut expected_path_entries = vec![
            resources
                .join("node_modules")
                .join("waggle-node-runtime")
                .join("bin"),
            resources.to_path_buf(),
        ];
        expected_path_entries.extend(ambient_entries);
        assert_eq!(
            std::env::split_paths(&environment.path).collect::<Vec<_>>(),
            expected_path_entries
        );
    }

    #[test]
    fn bundled_npm_environment_falls_back_to_waggle_home() {
        let resources = Path::new("resources");
        let home = Path::new("home");
        let environment = bundled_npm_environment(
            resources,
            Some(OsStr::new("")),
            Some(home.as_os_str()),
            None,
        )
        .expect("fallback npm environment resolves");

        assert_eq!(
            environment.npm_prefix,
            home.join(".waggle").join("npm").join("prefix")
        );
        assert_eq!(
            environment.npm_cache,
            home.join(".waggle").join("npm").join("cache")
        );
    }

    #[test]
    fn bundled_npm_environment_requires_a_writable_home() {
        let result = bundled_npm_environment(Path::new("resources"), None, None, None);
        assert_eq!(
            result,
            Err("Unable to resolve writable npm data directory".to_string())
        );
    }

    #[test]
    fn exited_service_child_does_not_block_restart() {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", "exit", "0"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "exit 0"]);
            command
        };
        let child = command.spawn().expect("starts short-lived child");
        let mut process = Some(child);

        for _ in 0..100 {
            if !service_child_is_running(&mut process).expect("inspects service child") {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(process.is_none());
    }

    #[test]
    fn running_service_child_remains_registered() {
        let child = long_lived_command()
            .spawn()
            .expect("starts long-lived child");
        let mut process = Some(child);

        assert!(service_child_is_running(&mut process).expect("inspects service child"));
        let mut child = process.take().expect("preserves running service child");
        child.kill().expect("kills long-lived child");
        child.wait().expect("reaps long-lived child");
    }

    #[test]
    fn service_spawn_holds_process_lock_until_child_registered() {
        let process = Mutex::new(None);
        spawn_service_with(&process, || {
            assert!(matches!(
                process.try_lock(),
                Err(std::sync::TryLockError::WouldBlock)
            ));
            Ok(long_lived_command())
        })
        .expect("spawns service while holding process lock");

        let mut child = process
            .lock()
            .expect("locks service child")
            .take()
            .expect("one service child remains registered");
        child.kill().expect("kills service child");
        child.wait().expect("reaps service child");
    }

    #[test]
    fn watchdog_keeps_a_live_sidecar_during_cold_embedding_startup() {
        assert!(!watchdog_should_restart(
            false,
            true,
            Duration::from_secs(45),
            WATCHDOG_FAILURE_THRESHOLD,
        ));
        assert!(!watchdog_should_restart(
            false,
            true,
            WATCHDOG_INITIAL_STARTUP_GRACE - Duration::from_secs(1),
            u32::MAX,
        ));
    }

    #[test]
    fn watchdog_restarts_an_exited_sidecar_during_cold_startup() {
        assert!(watchdog_should_restart(false, false, Duration::ZERO, 1,));
    }

    #[test]
    fn watchdog_restarts_after_startup_grace_or_established_health_loss() {
        assert!(watchdog_should_restart(
            false,
            true,
            WATCHDOG_INITIAL_STARTUP_GRACE,
            WATCHDOG_FAILURE_THRESHOLD,
        ));
        assert!(!watchdog_should_restart(
            true,
            true,
            Duration::ZERO,
            WATCHDOG_FAILURE_THRESHOLD - 1,
        ));
        assert!(watchdog_should_restart(
            true,
            true,
            Duration::ZERO,
            WATCHDOG_FAILURE_THRESHOLD,
        ));
    }

    #[test]
    fn watchdog_does_not_spawn_while_a_cold_sidecar_is_alive() {
        let process = Mutex::new(Some(
            long_lived_command().spawn().expect("starts cold sidecar"),
        ));
        let build_called = std::cell::Cell::new(false);

        let recovery = recover_service_with(
            &process,
            false,
            Duration::from_secs(45),
            u32::MAX,
            true,
            || {
                build_called.set(true);
                Ok(long_lived_command())
            },
        )
        .expect("defers cold sidecar recovery");

        assert_eq!(recovery, WatchdogRecovery::Deferred);
        assert!(!build_called.get());
        let mut child = process
            .lock()
            .expect("locks cold sidecar")
            .take()
            .expect("preserves cold sidecar");
        child.kill().expect("kills cold sidecar");
        child.wait().expect("reaps cold sidecar");
    }

    #[test]
    fn watchdog_restart_holds_the_process_lock_until_registration() {
        let process = Mutex::new(None);

        let recovery = recover_service_with(&process, false, Duration::ZERO, 1, true, || {
            assert!(matches!(
                process.try_lock(),
                Err(std::sync::TryLockError::WouldBlock)
            ));
            Ok(long_lived_command())
        })
        .expect("restarts exited sidecar atomically");

        assert_eq!(recovery, WatchdogRecovery::Restarted);
        let mut child = process
            .lock()
            .expect("locks restarted sidecar")
            .take()
            .expect("registers restarted sidecar");
        child.kill().expect("kills restarted sidecar");
        child.wait().expect("reaps restarted sidecar");
    }
}

fn service_child_is_running(process: &mut Option<Child>) -> Result<bool, String> {
    let Some(child) = process.as_mut() else {
        return Ok(false);
    };
    match child.try_wait() {
        Ok(None) => Ok(true),
        Ok(Some(_)) => {
            *process = None;
            Ok(false)
        }
        Err(error) => Err(format!("Failed to inspect service process: {error}")),
    }
}

fn watchdog_should_restart(
    has_ever_been_healthy: bool,
    child_is_running: bool,
    initial_startup_elapsed: Duration,
    consecutive_failures: u32,
) -> bool {
    if !child_is_running {
        return true;
    }

    consecutive_failures >= WATCHDOG_FAILURE_THRESHOLD
        && (has_ever_been_healthy || initial_startup_elapsed >= WATCHDOG_INITIAL_STARTUP_GRACE)
}

#[derive(Debug, PartialEq, Eq)]
enum WatchdogRecovery {
    Deferred,
    Restarted,
    RestartLimitReached,
}

fn recover_service_with(
    process: &Mutex<Option<Child>>,
    has_ever_been_healthy: bool,
    initial_startup_elapsed: Duration,
    consecutive_failures: u32,
    restart_allowed: bool,
    build_command: impl FnOnce() -> Result<Command, String>,
) -> Result<WatchdogRecovery, String> {
    let mut proc = process.lock().map_err(|e| e.to_string())?;
    let child_is_running = service_child_is_running(&mut proc)?;
    if !watchdog_should_restart(
        has_ever_been_healthy,
        child_is_running,
        initial_startup_elapsed,
        consecutive_failures,
    ) {
        return Ok(WatchdogRecovery::Deferred);
    }
    if !restart_allowed {
        return Ok(WatchdogRecovery::RestartLimitReached);
    }

    if let Some(mut child) = proc.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    let mut command = build_command()?;
    let child = command
        .spawn()
        .map_err(|error| format!("Failed to restart service: {error}"))?;
    *proc = Some(child);
    Ok(WatchdogRecovery::Restarted)
}

fn spawn_service_with(
    process: &Mutex<Option<Child>>,
    build_command: impl FnOnce() -> Result<Command, String>,
) -> Result<(), String> {
    let mut proc = process.lock().map_err(|e| e.to_string())?;
    if service_child_is_running(&mut proc)? {
        return Ok(());
    }

    let mut cmd = build_command()?;
    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start service: {e}"))?;
    *proc = Some(child);
    Ok(())
}

/// Synchronously spawn the sidecar process if not already running. Does not wait
/// for the health check. Safe to call from Tauri's synchronous `.setup()` callback.
pub fn spawn_service_sync(port: u16, process: &Mutex<Option<Child>>) -> Result<(), String> {
    spawn_service_with(process, || build_service_command(port))
}

#[tauri::command]
pub async fn ensure_service(state: State<'_, ServiceState>) -> Result<String, String> {
    let port = state.port;
    let health_url = format!("http://127.0.0.1:{}/health", port);

    match reqwest::get(&health_url).await {
        Ok(resp) if resp.status().is_success() => {
            return Ok("Service already running".to_string());
        }
        _ => {}
    }

    spawn_service_sync(port, &state.process)?;

    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        match reqwest::get(&health_url).await {
            Ok(resp) if resp.status().is_success() => {
                return Ok("Service started".to_string());
            }
            _ => continue,
        }
    }

    Err("Service failed to start within 30 seconds".to_string())
}

#[tauri::command]
pub async fn stop_service(state: State<'_, ServiceState>) -> Result<String, String> {
    let mut proc = state.process.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = proc.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok("Service stopped".to_string())
}

#[tauri::command]
pub async fn get_service_port(state: State<'_, ServiceState>) -> Result<u16, String> {
    Ok(state.port)
}

pub fn start_watchdog(app: AppHandle, port: u16) {
    tauri::async_runtime::spawn(async move {
        let health_url = format!("http://127.0.0.1:{}/health", port);
        let mut consecutive_failures: u32 = 0;
        let mut has_ever_been_healthy = false;
        let mut initial_startup_started = Instant::now();
        let mut restart_count: u32 = 0;
        let mut restart_window_start = Instant::now();
        const MAX_RESTARTS: u32 = 5;
        const RESTART_WINDOW: Duration = Duration::from_secs(600);

        // Wait for initial startup
        tokio::time::sleep(Duration::from_secs(15)).await;

        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;

            match reqwest::get(&health_url).await {
                Ok(resp) if resp.status().is_success() => {
                    has_ever_been_healthy = true;
                    consecutive_failures = 0;
                }
                _ => {
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    if restart_window_start.elapsed() > RESTART_WINDOW {
                        restart_count = 0;
                        restart_window_start = Instant::now();
                    }

                    let recovery = if let Some(state) = app.try_state::<ServiceState>() {
                        recover_service_with(
                            &state.process,
                            has_ever_been_healthy,
                            initial_startup_started.elapsed(),
                            consecutive_failures,
                            restart_count < MAX_RESTARTS,
                            || build_service_command(port),
                        )
                    } else {
                        Err("Service state is unavailable".to_string())
                    };

                    match recovery {
                        Ok(WatchdogRecovery::Deferred) => continue,
                        Ok(WatchdogRecovery::RestartLimitReached) => {
                            let _ = app.emit(
                                "waggle://service-status",
                                serde_json::json!({ "status": "failed" }),
                            );
                            eprintln!("[waggle] Watchdog: max restarts exceeded, giving up");
                            break;
                        }
                        Ok(WatchdogRecovery::Restarted) => {}
                        Err(error) => {
                            eprintln!("[waggle] Watchdog: respawn failed: {error}");
                            let _ = app.emit("waggle://service-restart-needed", ());
                            restart_count += 1;
                            consecutive_failures = 0;
                            has_ever_been_healthy = false;
                            initial_startup_started = Instant::now();
                            tokio::time::sleep(Duration::from_secs(10)).await;
                            continue;
                        }
                    }

                    let _ = app.emit(
                        "waggle://service-status",
                        serde_json::json!({ "status": "restarting" }),
                    );
                    eprintln!(
                        "[waggle] Watchdog: server unresponsive, respawning (attempt {})",
                        restart_count + 1
                    );

                    let _ = app.emit("waggle://service-restart-needed", ());

                    restart_count += 1;
                    consecutive_failures = 0;
                    has_ever_been_healthy = false;
                    initial_startup_started = Instant::now();
                    tokio::time::sleep(Duration::from_secs(10)).await;
                }
            }
        }
    });
}
