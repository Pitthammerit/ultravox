use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Send Cmd+V (or Ctrl+V on Windows) on the main thread.
///
/// **Why main thread:** macOS' Text Services Manager (`TSMGetInputSourceProperty`,
/// reached transitively from `enigo::Keyboard::key`) calls
/// `dispatch_assert_queue` on the main dispatch queue. Calling it from any
/// other thread aborts the process with `EXC_BREAKPOINT (SIGTRAP)`. Tauri runs
/// async commands on tokio workers, so we must marshal the enigo calls onto
/// the main thread and await completion.
fn dispatch_paste_combo(app: &AppHandle) -> Result<(), String> {
    use std::sync::mpsc::sync_channel;
    let (tx, rx) = sync_channel::<Result<(), String>>(0);

    app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            #[cfg(target_os = "macos")]
            {
                enigo
                    .key(Key::Meta, Direction::Press)
                    .map_err(|e| e.to_string())?;
                // Give macOS TSM time to register the modifier before the key
                // event fires; without this delay the modifier is occasionally
                // missed and a bare 'v' is typed instead of Cmd+V.
                std::thread::sleep(Duration::from_millis(30));
                enigo
                    .key(Key::Unicode('v'), Direction::Click)
                    .map_err(|e| e.to_string())?;
                std::thread::sleep(Duration::from_millis(10));
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
            Ok(())
        })();
        // Best-effort send; the receiver may have been dropped if the caller
        // was cancelled. We don't care about that case.
        let _ = tx.send(result);
    })
    .map_err(|e| format!("run_on_main_thread failed: {e}"))?;

    // Block this tokio worker thread until the main thread finishes the paste.
    // The main-thread closure is short (a few ms of TSM lookups + key events),
    // so the worker thread block is bounded and acceptable.
    rx.recv()
        .map_err(|e| format!("main-thread paste dropped: {e}"))?
}

#[tauri::command]
pub async fn paste_to_frontmost(app: AppHandle, text: String) -> Result<(), String> {
    let clipboard = app.clipboard();
    let saved = clipboard.read_text().ok();

    clipboard.write_text(text.clone()).map_err(|e| e.to_string())?;

    tokio::time::sleep(Duration::from_millis(50)).await;

    dispatch_paste_combo(&app)?;

    if let Some(prev) = saved {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = app_handle.clipboard().write_text(prev);
        });
    }

    Ok(())
}
