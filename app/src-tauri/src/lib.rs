// Tauri 2 requires a lib.rs for the cdylib/staticlib crate types.
// The actual app entry point is main.rs.

mod commands;
mod service;
mod tray;

use service::ServiceState;
use tauri::Manager;

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
            commands::onboarding::mark_first_launch_complete,
            commands::onboarding::reset_first_launch,
        ])
        .setup(|app| {
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

            // Auto-start the sidecar service before the webview loads so the
            // React app finds it already healthy on localhost:3333.
            let service_state = app.state::<ServiceState>();
            let port = service_state.port;
            match service::spawn_service_sync(port, &service_state.process) {
                Ok(()) => eprintln!("[waggle] Sidecar spawn initiated on port {}", port),
                Err(e) => eprintln!("[waggle] Failed to auto-start sidecar: {}", e),
            }

            // Start service watchdog
            let app_handle_watchdog = app.handle().clone();
            service::start_watchdog(app_handle_watchdog, port);

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
        .run(|app_handle, event| {
            // R7-002: kill the sidecar on app exit so it doesn't orphan and hold port 3333.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServiceState>() {
                    if let Ok(mut proc) = state.process.lock() {
                        if let Some(mut child) = proc.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
