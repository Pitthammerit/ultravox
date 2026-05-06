use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Parse a Tauri-style accelerator string like "Cmd+Shift+;" into a `Shortcut`.
/// Accepts the friendly aliases the JS side emits (Cmd, Ctrl, Alt, Shift,
/// plus single-char keys, F1-F24, and named keys).
fn parse_shortcut(spec: &str) -> Result<Shortcut, String> {
    let mut mods = Modifiers::empty();
    let mut key_code: Option<Code> = None;

    for part_raw in spec.split('+') {
        let part = part_raw.trim();
        if part.is_empty() {
            continue;
        }
        let lower = part.to_lowercase();
        match lower.as_str() {
            "cmd" | "command" | "meta" | "super" => mods |= Modifiers::SUPER,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" | "opt" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            other => {
                key_code = Some(parse_key(other)?);
            }
        }
    }

    let code = key_code.ok_or_else(|| format!("no key in shortcut: {spec}"))?;
    Ok(Shortcut::new(if mods.is_empty() { None } else { Some(mods) }, code))
}

fn parse_key(key: &str) -> Result<Code, String> {
    // Single letter: A-Z (case-insensitive)
    if key.len() == 1 {
        let c = key.chars().next().unwrap().to_ascii_uppercase();
        return match c {
            'A' => Ok(Code::KeyA), 'B' => Ok(Code::KeyB), 'C' => Ok(Code::KeyC),
            'D' => Ok(Code::KeyD), 'E' => Ok(Code::KeyE), 'F' => Ok(Code::KeyF),
            'G' => Ok(Code::KeyG), 'H' => Ok(Code::KeyH), 'I' => Ok(Code::KeyI),
            'J' => Ok(Code::KeyJ), 'K' => Ok(Code::KeyK), 'L' => Ok(Code::KeyL),
            'M' => Ok(Code::KeyM), 'N' => Ok(Code::KeyN), 'O' => Ok(Code::KeyO),
            'P' => Ok(Code::KeyP), 'Q' => Ok(Code::KeyQ), 'R' => Ok(Code::KeyR),
            'S' => Ok(Code::KeyS), 'T' => Ok(Code::KeyT), 'U' => Ok(Code::KeyU),
            'V' => Ok(Code::KeyV), 'W' => Ok(Code::KeyW), 'X' => Ok(Code::KeyX),
            'Y' => Ok(Code::KeyY), 'Z' => Ok(Code::KeyZ),
            '0' => Ok(Code::Digit0), '1' => Ok(Code::Digit1),
            '2' => Ok(Code::Digit2), '3' => Ok(Code::Digit3),
            '4' => Ok(Code::Digit4), '5' => Ok(Code::Digit5),
            '6' => Ok(Code::Digit6), '7' => Ok(Code::Digit7),
            '8' => Ok(Code::Digit8), '9' => Ok(Code::Digit9),
            ';' => Ok(Code::Semicolon),
            ',' => Ok(Code::Comma),
            '.' => Ok(Code::Period),
            '/' => Ok(Code::Slash),
            '\\' => Ok(Code::Backslash),
            '\'' => Ok(Code::Quote),
            '`' => Ok(Code::Backquote),
            '-' => Ok(Code::Minus),
            '=' => Ok(Code::Equal),
            '[' => Ok(Code::BracketLeft),
            ']' => Ok(Code::BracketRight),
            _ => Err(format!("unsupported key char: {c}")),
        };
    }

    // F1..F24
    if let Some(rest) = key.strip_prefix('F').or_else(|| key.strip_prefix('f')) {
        if let Ok(n) = rest.parse::<u8>() {
            return match n {
                1 => Ok(Code::F1), 2 => Ok(Code::F2), 3 => Ok(Code::F3), 4 => Ok(Code::F4),
                5 => Ok(Code::F5), 6 => Ok(Code::F6), 7 => Ok(Code::F7), 8 => Ok(Code::F8),
                9 => Ok(Code::F9), 10 => Ok(Code::F10), 11 => Ok(Code::F11), 12 => Ok(Code::F12),
                13 => Ok(Code::F13), 14 => Ok(Code::F14), 15 => Ok(Code::F15), 16 => Ok(Code::F16),
                17 => Ok(Code::F17), 18 => Ok(Code::F18), 19 => Ok(Code::F19), 20 => Ok(Code::F20),
                21 => Ok(Code::F21), 22 => Ok(Code::F22), 23 => Ok(Code::F23), 24 => Ok(Code::F24),
                _ => Err(format!("unsupported function key: F{n}")),
            };
        }
    }

    // Named keys (case-insensitive)
    let lower = key.to_lowercase();
    match lower.as_str() {
        "space" => Ok(Code::Space),
        "enter" | "return" => Ok(Code::Enter),
        "tab" => Ok(Code::Tab),
        "escape" | "esc" => Ok(Code::Escape),
        "up" | "arrowup" => Ok(Code::ArrowUp),
        "down" | "arrowdown" => Ok(Code::ArrowDown),
        "left" | "arrowleft" => Ok(Code::ArrowLeft),
        "right" | "arrowright" => Ok(Code::ArrowRight),
        "home" => Ok(Code::Home),
        "end" => Ok(Code::End),
        "pageup" => Ok(Code::PageUp),
        "pagedown" => Ok(Code::PageDown),
        "semicolon" => Ok(Code::Semicolon),
        "comma" => Ok(Code::Comma),
        "period" => Ok(Code::Period),
        "slash" => Ok(Code::Slash),
        "backslash" => Ok(Code::Backslash),
        "quote" => Ok(Code::Quote),
        "backquote" => Ok(Code::Backquote),
        "minus" => Ok(Code::Minus),
        "equal" => Ok(Code::Equal),
        "bracketleft" => Ok(Code::BracketLeft),
        "bracketright" => Ok(Code::BracketRight),
        _ => Err(format!("unsupported key name: {key}")),
    }
}

/// Default fallbacks if settings are empty/invalid.
const DEFAULT_RECORD: &str = "Cmd+Shift+;";
const DEFAULT_MODE_OVERLAY: &str = "Alt+Shift+K";

/// Register both default hotkeys at startup. The two `_record` / `_mode`
/// strings are pulled from `ultravox_register_hotkeys` later — this just
/// boots the app with sane defaults so the user can tap the key right away.
pub fn register_default_hotkeys<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    register_hotkeys_inner(app, DEFAULT_RECORD, DEFAULT_MODE_OVERLAY)
}

fn register_hotkeys_inner<R: Runtime>(
    app: &AppHandle<R>,
    record: &str,
    mode_overlay: &str,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    // Wipe whatever is currently registered. unregister_all is idempotent.
    let _ = gs.unregister_all();

    let record_shortcut = parse_shortcut(record)?;
    let mode_shortcut = parse_shortcut(mode_overlay)?;

    let app_a = app.clone();
    gs.on_shortcut(record_shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            // Show the pill window WITHOUT stealing focus so the user's active
            // app stays frontmost. alwaysOnTop keeps the pill visible on top.
            // Keeping the previous app focused means Cmd+V paste lands there
            // correctly once transcription finishes.
            // getUserMedia works fine from a non-focused window once macOS has
            // granted the microphone permission.
            if let Some(win) = app_a.get_webview_window("pill") {
                let _ = win.show();
            }
            let _ = app_a.emit("hotkey:toggle-record", ());
        }
    })
    .map_err(|e| e.to_string())?;

    let app_b = app.clone();
    gs.on_shortcut(mode_shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = app_b.emit("hotkey:toggle-mode-overlay", ());
            if let Some(win) = app_b.get_webview_window("pill") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    })
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Re-register both hotkeys with new accelerator strings. Called from JS
/// when the user finishes editing a hotkey in the Configuration panel.
#[tauri::command]
pub fn ultravox_register_hotkeys<R: Runtime>(
    app: AppHandle<R>,
    record: String,
    mode_overlay: String,
) -> Result<(), String> {
    register_hotkeys_inner(&app, &record, &mode_overlay)
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

#[tauri::command]
pub fn set_pill_height<R: Runtime>(app: AppHandle<R>, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    if let Some(win) = app.get_webview_window("pill") {
        win.set_size(Size::Logical(LogicalSize { width: 540.0, height: height as f64 }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_pill_size<R: Runtime>(app: AppHandle<R>, width: u32, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    if let Some(win) = app.get_webview_window("pill") {
        win.set_size(Size::Logical(LogicalSize { width: width as f64, height: height as f64 }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
