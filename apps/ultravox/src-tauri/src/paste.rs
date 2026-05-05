use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[tauri::command]
pub async fn paste_to_frontmost(app: AppHandle, text: String) -> Result<(), String> {
    let clipboard = app.clipboard();
    let saved = clipboard.read_text().ok();

    clipboard.write_text(text.clone()).map_err(|e| e.to_string())?;

    tokio::time::sleep(Duration::from_millis(50)).await;

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Direction::Press)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Meta, Direction::Release)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|e| e.to_string())?;
    }

    if let Some(prev) = saved {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = app_handle.clipboard().write_text(prev);
        });
    }

    Ok(())
}
