// Tauri 2 requires a lib.rs for the cdylib/staticlib crate types.
// The actual app entry point is main.rs.

mod service;
mod tray;

use service::ServiceState;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
async fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            app.global_shortcut().register(shortcut)?;

            // Start service watchdog
            let app_handle_watchdog = app.handle().clone();
            let port = app.state::<ServiceState>().port;
            service::start_watchdog(app_handle_watchdog, port);

            // 9D-7: Check for updates on startup (non-blocking)
            let app_handle_update = app.handle().clone();
            tokio::spawn(async move {
                // Wait 5s for UI to load before checking
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                match app_handle_update.updater() {
                    Ok(updater) => match updater.check().await {
                        Ok(Some(update)) => {
                            let version = update.version.clone();
                            let _ = app_handle_update.emit(
                                "waggle://update-available",
                                serde_json::json!({
                                    "version": version,
                                    "body": update.body.clone().unwrap_or_default(),
                                }),
                            );
                            eprintln!("[waggle] Update available: v{}", version);
                        }
                        Ok(None) => {
                            eprintln!("[waggle] App is up to date");
                        }
                        Err(e) => {
                            eprintln!("[waggle] Update check failed: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("[waggle] Updater init failed: {}", e);
                    }
                }
            });

            Ok(())
        })
        // Window management: close minimizes to tray instead of quitting
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
