use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

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

#[tauri::command]
pub async fn ensure_service(state: State<'_, ServiceState>) -> Result<String, String> {
    let port = state.port;
    let health_url = format!("http://127.0.0.1:{}/health", port);

    // Check if service is already running via health check
    match reqwest::get(&health_url).await {
        Ok(resp) if resp.status().is_success() => {
            return Ok("Service already running".to_string());
        }
        _ => {}
    }

    // Start the agent service — scope the MutexGuard so it's dropped before await
    {
        let mut proc = state.process.lock().map_err(|e| e.to_string())?;

        let node_path = std::env::var("WAGGLE_NODE_PATH").unwrap_or_else(|_| "node".to_string());

        let service_script = if cfg!(debug_assertions) {
            let app_dir = std::env::current_dir().map_err(|e| e.to_string())?;
            let script = app_dir
                .parent()
                .ok_or("no parent")?
                .parent()
                .ok_or("no grandparent")?
                .join("packages")
                .join("server")
                .join("src")
                .join("local")
                .join("service.ts");
            script.to_string_lossy().to_string()
        } else {
            "resources/service.js".to_string()
        };

        let mut cmd = if cfg!(debug_assertions) {
            let mut c = Command::new(&node_path);
            c.arg("--import").arg("tsx").arg(&service_script);
            c
        } else {
            let mut c = Command::new(&node_path);
            c.arg(&service_script);
            c
        };

        cmd.env("WAGGLE_PORT", port.to_string());

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start service: {}", e))?;
        *proc = Some(child);
    } // MutexGuard dropped here

    // Wait for health check (up to 30 seconds)
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
    tokio::spawn(async move {
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
                            let _ = app.emit("waggle://service-status",
                                serde_json::json!({ "status": "failed" }));
                            eprintln!("[waggle] Watchdog: max restarts exceeded, giving up");
                            break;
                        }

                        let _ = app.emit("waggle://service-status",
                            serde_json::json!({ "status": "restarting" }));
                        eprintln!("[waggle] Watchdog: server unresponsive, restart needed (attempt {})", restart_count + 1);
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
