use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder},
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
                rgba[idx] = 0xE8; // R
                rgba[idx + 1] = 0x92; // G
                rgba[idx + 2] = 0x2A; // B
                rgba[idx + 3] = 0xFF; // A
            }
        }
    }
    (rgba, size, size)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Open Waggle").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Waggle").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &settings, &quit])
        .build()?;

    let (rgba, w, h) = generate_tray_icon();
    let icon = Image::new_owned(rgba, w, h);

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Waggle Agent Service")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                show_main_window(app);
            }
            "settings" => {
                show_main_window(app);
                let _ = app.emit("waggle://navigate", "/settings");
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    eprintln!("[waggle] System tray icon created successfully");
    Ok(())
}
