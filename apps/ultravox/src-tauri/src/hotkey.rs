use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register_default_hotkeys<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // Default record-toggle: Cmd+Shift+;
    let record_hotkey = Shortcut::new(
        Some(Modifiers::SUPER | Modifiers::SHIFT),
        Code::Semicolon,
    );
    // Default mode-switcher: Alt+Shift+K
    let mode_hotkey = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyK);

    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(record_hotkey, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app_clone.emit("hotkey:toggle-record", ());
            }
        })
        .map_err(|e| e.to_string())?;

    let app_clone2 = app.clone();
    app.global_shortcut()
        .on_shortcut(mode_hotkey, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app_clone2.emit("hotkey:toggle-mode-overlay", ());
                if let Some(win) = app_clone2.get_webview_window("mode-overlay") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn show_pill<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pill") {
        win.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_pill<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pill") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_mode_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mode-overlay") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_mode_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mode-overlay") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
