use tauri::Manager;

mod hotkey;
mod paste;
mod permissions;
mod tray;

#[cfg(target_os = "macos")]
mod frontmost;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            if let Err(e) = hotkey::register_default_hotkeys(app.handle()) {
                eprintln!("hotkey registration failed: {e}");
            }
            if let Err(e) = tray::create_tray(app.handle()) {
                eprintln!("tray creation failed: {e}");
            }
            #[cfg(target_os = "macos")]
            {
                setup_pill_spaces(app.handle());
                // Run as a menu-bar / accessory app: no Dock icon, app stays
                // alive after every window closes. The user opens Settings
                // from the tray icon.
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // Settings window: closing it should hide instead of quit, so the
            // global hotkey + tray + pill keep working in the background.
            if let Some(settings_win) = app.get_webview_window("settings") {
                let win_clone = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }
            Ok(())
        });

    #[cfg(target_os = "macos")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        frontmost::get_frontmost_app,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::ultravox_register_hotkeys,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
    ]);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::ultravox_register_hotkeys,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Set NSWindowCollectionBehavior on the pill window so it appears in every
/// Space and over fullscreen apps (Final Cut, Keynote, fullscreen Safari, etc.).
///
/// canJoinAllSpaces (1 << 0) — window follows the user into every Space.
/// fullScreenAuxiliary (1 << 8) — window can float above a fullscreen app's Space.
#[cfg(target_os = "macos")]
fn setup_pill_spaces(app: &tauri::AppHandle) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let Some(win) = app.get_webview_window("pill") else { return };
    let Ok(ns_win_ptr) = win.ns_window() else { return };

    // canJoinAllSpaces = 1 << 0, fullScreenAuxiliary = 1 << 8
    let behavior: std::ffi::c_ulong = 1 | (1 << 8);
    unsafe {
        let ns_win = ns_win_ptr as *mut AnyObject;
        let _: () = msg_send![ns_win, setCollectionBehavior: behavior];
    }
}
