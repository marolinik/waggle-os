// Tauri 2 requires a lib.rs for the cdylib/staticlib crate types.
// The actual app entry point is main.rs.

mod commands;
mod service;
mod tray;

use service::ServiceState;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::{Duration, Instant};
use tauri::Manager;

const EXIT_IDLE: u8 = 0;
const EXIT_DRAINING: u8 = 1;
const EXIT_READY: u8 = 2;
static EXIT_STATE: AtomicU8 = AtomicU8::new(EXIT_IDLE);

#[derive(Debug, PartialEq, Eq)]
enum ExitRequestDecision {
    StartDrain,
    WaitForDrain,
    ExitNow,
}

fn decide_exit_request(state: &AtomicU8) -> ExitRequestDecision {
    match state.compare_exchange(
        EXIT_IDLE,
        EXIT_DRAINING,
        Ordering::AcqRel,
        Ordering::Acquire,
    ) {
        Ok(_) => ExitRequestDecision::StartDrain,
        Err(EXIT_DRAINING) => ExitRequestDecision::WaitForDrain,
        Err(EXIT_READY) => ExitRequestDecision::ExitNow,
        Err(_) => ExitRequestDecision::WaitForDrain,
    }
}

fn is_restart_request(code: Option<i32>) -> bool {
    code == Some(tauri::RESTART_EXIT_CODE)
}

fn drain_before_unpreventable_restart(app_handle: &tauri::AppHandle) {
    match decide_exit_request(&EXIT_STATE) {
        ExitRequestDecision::StartDrain => {
            if let Some(state) = app_handle.try_state::<ServiceState>() {
                if let Err(error) =
                    tauri::async_runtime::block_on(service::stop_service_bounded(&state))
                {
                    eprintln!("[waggle] Restart drain failed: {error}");
                    let _ = service::stop_service_sync(&state);
                }
            }
            EXIT_STATE.store(EXIT_READY, Ordering::Release);
        }
        ExitRequestDecision::WaitForDrain => {
            let deadline = Instant::now() + Duration::from_secs(13);
            while EXIT_STATE.load(Ordering::Acquire) == EXIT_DRAINING && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
            if EXIT_STATE.load(Ordering::Acquire) == EXIT_DRAINING {
                if let Some(state) = app_handle.try_state::<ServiceState>() {
                    let _ = service::stop_service_sync(&state);
                }
                EXIT_STATE.store(EXIT_READY, Ordering::Release);
            }
        }
        ExitRequestDecision::ExitNow => {}
    }
}

#[tauri::command]
async fn show_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(ServiceState::new(3333))
        .invoke_handler(tauri::generate_handler![
            service::ensure_service,
            service::stop_service,
            service::get_service_port,
            show_notification,
            commands::memory::recall_memory,
            commands::memory::save_memory,
            commands::memory::search_entities,
            commands::memory::get_identity,
            commands::wiki::get_wiki_pages,
            commands::wiki::get_wiki_page,
            commands::wiki::get_wiki_page_content,
            commands::wiki::compile_wiki_section,
            commands::agent::run_agent_query,
            commands::onboarding::is_first_launch,
            commands::onboarding::reset_first_launch,
        ])
        .setup(|app| {
            // Create the configured window here so the Windows certifier can
            // opt into a loopback-only WebView CDP port without shipping
            // remote debugging enabled for normal launches.
            let main_window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .cloned()
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "configured main window is missing",
                    )
                })?;
            let mut main_window = tauri::WebviewWindowBuilder::from_config(
                app.handle(),
                &main_window_config,
            )?;
            #[cfg(windows)]
            if let Some(raw_port) = std::env::var_os("WAGGLE_CERTIFIER_WEBVIEW_DEBUG_PORT") {
                let raw_port = raw_port.to_string_lossy();
                let port = raw_port.parse::<u16>().map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "WAGGLE_CERTIFIER_WEBVIEW_DEBUG_PORT must be an integer",
                    )
                })?;
                if port < 1024 {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "WAGGLE_CERTIFIER_WEBVIEW_DEBUG_PORT must be >= 1024",
                    )
                    .into());
                }
                let browser_args = format!(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port}"
                );
                main_window = main_window.additional_browser_args(&browser_args);
                eprintln!(
                    "[waggle] WebView certifier debug endpoint enabled on 127.0.0.1:{port}"
                );
            }
            main_window.build()?;

            tray::setup_tray(app.handle())?;

            // Register global hotkey: Ctrl+Shift+W to toggle window visibility
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
            let app_handle = app.handle().clone();
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(),
            )?;

            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyW);
            // R7-005: a hotkey collision must not crash setup — log and continue.
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!(
                    "[waggle] Failed to register Ctrl+Shift+W global shortcut: {}",
                    e
                );
            }

            // Auto-start an owned sidecar launch before the webview loads.
            // Its verified endpoint may differ from the preferred port.
            let service_state = app.state::<ServiceState>();
            match service::spawn_service_sync(&service_state) {
                Ok(()) => eprintln!("[waggle] Owned sidecar spawn initiated"),
                Err(e) => eprintln!("[waggle] Failed to auto-start sidecar: {}", e),
            }

            // Start service watchdog
            let app_handle_watchdog = app.handle().clone();
            service::start_watchdog(app_handle_watchdog);

            Ok(())
        })
        // Window management: close minimizes to tray instead of quitting
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            // Tauri deliberately ignores prevent_exit() for its restart exit
            // code. Drain synchronously inside this bounded callback so the
            // original restart cannot overtake sidecar cleanup.
            tauri::RunEvent::ExitRequested { code, .. } if is_restart_request(code) => {
                drain_before_unpreventable_restart(app_handle);
            }
            tauri::RunEvent::ExitRequested { code, api, .. } => {
                match decide_exit_request(&EXIT_STATE) {
                    ExitRequestDecision::StartDrain => {
                        api.prevent_exit();
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(state) = app_handle.try_state::<ServiceState>() {
                                if let Err(error) = service::stop_service_bounded(&state).await {
                                    eprintln!("[waggle] Graceful service shutdown failed: {error}");
                                }
                            }
                            EXIT_STATE.store(EXIT_READY, Ordering::Release);
                            app_handle.exit(code.unwrap_or(0));
                        });
                    }
                    ExitRequestDecision::WaitForDrain => api.prevent_exit(),
                    ExitRequestDecision::ExitNow => {}
                }
            }
            // Terminal fallback for OS/crash-edge exits. The normal tray and
            // programmatic paths have already completed the bounded drain.
            tauri::RunEvent::Exit => {
                if let Some(state) = app_handle.try_state::<ServiceState>() {
                    let _ = service::stop_service_sync(&state);
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_requests_start_one_drain_then_wait_until_exit_is_ready() {
        let state = AtomicU8::new(EXIT_IDLE);
        assert_eq!(decide_exit_request(&state), ExitRequestDecision::StartDrain);
        assert_eq!(
            decide_exit_request(&state),
            ExitRequestDecision::WaitForDrain
        );
        state.store(EXIT_READY, Ordering::Release);
        assert_eq!(decide_exit_request(&state), ExitRequestDecision::ExitNow);
        assert!(is_restart_request(Some(tauri::RESTART_EXIT_CODE)));
        assert!(!is_restart_request(Some(0)));
        assert!(!is_restart_request(None));
    }
}
