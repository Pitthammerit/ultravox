mod hotkey;
mod paste;
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
    ]);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
