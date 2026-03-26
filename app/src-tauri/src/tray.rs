use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

fn generate_tray_icon() -> (Vec<u8>, u32, u32) {
    let size: u32 = 32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    // Orange filled square with rounded-ish corners
    for y in 0..size {
        for x in 0..size {
            let idx = ((y * size + x) * 4) as usize;
            // Simple circle mask for rounded look
            let cx = (x as f32) - 15.5;
            let cy = (y as f32) - 15.5;
            let dist = (cx * cx + cy * cy).sqrt();
            if dist < 14.0 {
                // Orange: #E8922A
                rgba[idx] = 0xE8;     // R
                rgba[idx + 1] = 0x92; // G
                rgba[idx + 2] = 0x2A; // B
                rgba[idx + 3] = 0xFF; // A
            }
        }
    }
    (rgba, size, size)
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Open Waggle").build(app)?;
    let pause = MenuItemBuilder::with_id("pause", "Pause Agents").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let about = MenuItemBuilder::with_id("about", "About Waggle").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Waggle").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &pause, &settings, &about, &quit])
        .build()?;

    let (rgba, w, h) = generate_tray_icon();
    let icon = Image::new_owned(rgba, w, h);

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Waggle Agent Service")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "pause" => {
                // Emit event to frontend
                let _ = app.emit("waggle://pause-agents", ());
            }
            "settings" => {
                let _ = app.emit("waggle://navigate", "/settings");
            }
            "about" => {
                let _ = app.emit("waggle://navigate", "/about");
            }
            "quit" => {
                // Emit quit event — React handles cleanup then exits via Tauri API
                let _ = app.emit("waggle://quit", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    eprintln!("[waggle] System tray icon created successfully");
    Ok(())
}
