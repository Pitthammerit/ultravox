use tauri::Manager;

mod hotkey;
mod paste;
mod permissions;
mod tray;

#[cfg(target_os = "macos")]
mod frontmost;

#[cfg(target_os = "macos")]
mod media;

#[cfg(target_os = "macos")]
mod pill_window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if let Err(e) = hotkey::register_default_hotkeys(app.handle()) {
                eprintln!("hotkey registration failed: {e}");
            }
            if let Err(e) = tray::create_tray(app.handle()) {
                eprintln!("tray creation failed: {e}");
            }

            // Intercept the red-X close on the Settings window so the tray
            // icon can reopen it. Without this, macOS Tauri destroys the
            // window on close and `get_webview_window("settings")` returns
            // None forever after.
            if let Some(settings) = app.handle().get_webview_window("settings") {
                let win = settings.clone();
                settings.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }

            #[cfg(target_os = "macos")]
            pill_window::configure_overlay_windows(app.handle());
            Ok(())
        });

    #[cfg(target_os = "macos")]
    let builder = builder.manage(media::MediaState::default());

    #[cfg(target_os = "macos")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        frontmost::get_frontmost_app,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::set_pill_size,
        hotkey::ultravox_register_hotkeys,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
        media::media_pause,
        media::media_resume,
    ]);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::set_pill_size,
        hotkey::ultravox_register_hotkeys,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
