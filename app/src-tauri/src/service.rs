use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

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
}

/// Synchronously spawn the sidecar process if not already running. Does not wait
/// for the health check. Safe to call from Tauri's synchronous `.setup()` callback.
pub fn spawn_service_sync(port: u16, process: &Mutex<Option<Child>>) -> Result<(), String> {
    {
        let proc = process.lock().map_err(|e| e.to_string())?;
        if proc.is_some() {
            return Ok(());
        }
    }

    let mut cmd = build_service_command(port)?;
    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start service: {}", e))?;

    let mut proc = process.lock().map_err(|e| e.to_string())?;
    *proc = Some(child);
    Ok(())
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
                    consecutive_failures = 0;
                }
                _ => {
                    consecutive_failures += 1;
                    if consecutive_failures >= 3 {
                        if restart_window_start.elapsed() > RESTART_WINDOW {
                            restart_count = 0;
                            restart_window_start = Instant::now();
                        }

                        if restart_count >= MAX_RESTARTS {
                            let _ = app.emit(
                                "waggle://service-status",
                                serde_json::json!({ "status": "failed" }),
                            );
                            eprintln!("[waggle] Watchdog: max restarts exceeded, giving up");
                            break;
                        }

                        let _ = app.emit(
                            "waggle://service-status",
                            serde_json::json!({ "status": "restarting" }),
                        );
                        eprintln!(
                            "[waggle] Watchdog: server unresponsive, respawning (attempt {})",
                            restart_count + 1
                        );

                        // R7-003: self-heal — reap the dead child (so spawn_service_sync's
                        // is_some() early-return clears) then respawn the sidecar in place.
                        if let Some(state) = app.try_state::<ServiceState>() {
                            {
                                if let Ok(mut proc) = state.process.lock() {
                                    if let Some(mut child) = proc.take() {
                                        let _ = child.kill();
                                        let _ = child.wait();
                                    }
                                }
                            }
                            match spawn_service_sync(port, &state.process) {
                                Ok(()) => eprintln!("[waggle] Watchdog: sidecar respawned"),
                                Err(e) => eprintln!("[waggle] Watchdog: respawn failed: {}", e),
                            }
                        }
                        let _ = app.emit("waggle://service-restart-needed", ());

                        restart_count += 1;
                        consecutive_failures = 0;
                        tokio::time::sleep(Duration::from_secs(10)).await;
                    }
                }
            }
        }
    });
}
