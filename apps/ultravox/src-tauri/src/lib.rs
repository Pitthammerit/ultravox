mod paste;

#[cfg(target_os = "macos")]
mod frontmost;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(target_os = "macos")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        frontmost::get_frontmost_app
    ]);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![paste::paste_to_frontmost]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
