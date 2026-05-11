use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::pill_window;

/// True while a recording session is active. Used to re-arm the global
/// Escape shortcut after any `unregister_all`-style operation (e.g. user
/// edits a hotkey mid-recording, onboarding wipes shortcuts) so the
/// "Escape from any window discards" guarantee survives those operations.
static RECORDING_ESCAPE_DESIRED: AtomicBool = AtomicBool::new(false);

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
const DEFAULT_PTT: &str = "Cmd+Shift+Space";
const DEFAULT_RECORDING_STYLE: &str = "toggle";

/// Register both default hotkeys at startup. The two `_record` / `_mode`
/// strings are pulled from `ultravox_register_hotkeys` later — this just
/// boots the app with sane defaults so the user can tap the key right away.
pub fn register_default_hotkeys<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    register_hotkeys_inner(
        app,
        DEFAULT_RECORD,
        DEFAULT_MODE_OVERLAY,
        DEFAULT_PTT,
        DEFAULT_RECORDING_STYLE,
    )
}

fn register_hotkeys_inner<R: Runtime>(
    app: &AppHandle<R>,
    record: &str,
    mode_overlay: &str,
    ptt: &str,
    recording_style: &str,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    // Wipe whatever is currently registered. unregister_all is idempotent.
    let _ = gs.unregister_all();

    let mode_shortcut = parse_shortcut(mode_overlay)?;
    let is_ptt = recording_style == "push-to-talk";

    if is_ptt {
        // PTT mode: register only the PTT shortcut. On Pressed, show the
        // pill window WITHOUT stealing focus and emit ptt-pressed; on
        // Released, emit ptt-released. The toggle hotkey is intentionally
        // NOT registered — the two recording styles are mutually exclusive.
        let ptt_shortcut = parse_shortcut(ptt)?;
        let app_a = app.clone();
        gs.on_shortcut(ptt_shortcut, move |_app, _shortcut, event| match event.state() {
            ShortcutState::Pressed => {
                if let Some(win) = app_a.get_webview_window("pill") {
                    let _ = win.show();
                    pill_window::reapply_overlay_flags(&app_a, "pill");
                }
                let _ = app_a.emit("hotkey:ptt-pressed", ());
            }
            ShortcutState::Released => {
                let _ = app_a.emit("hotkey:ptt-released", ());
            }
        })
        .map_err(|e| e.to_string())?;
    } else {
        // Toggle mode (default): register the record shortcut. On Pressed,
        // show the pill window without stealing focus and emit
        // toggle-record. We do NOT emit ptt-pressed here — JS guards
        // would ignore it anyway, but emitting both made the event
        // contract ambiguous and risked double-triggering during a future
        // listener change.
        let record_shortcut = parse_shortcut(record)?;
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
                    pill_window::reapply_overlay_flags(&app_a, "pill");
                }
                let _ = app_a.emit("hotkey:toggle-record", ());
            }
        })
        .map_err(|e| e.to_string())?;
    }

    let app_b = app.clone();
    gs.on_shortcut(mode_shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = app_b.emit("hotkey:toggle-mode-overlay", ());
            if let Some(win) = app_b.get_webview_window("pill") {
                let _ = win.show();
                let _ = win.set_focus();
                pill_window::reapply_overlay_flags(&app_b, "pill");
            }
        }
    })
    .map_err(|e| e.to_string())?;

    // If a recording is currently active, the unregister_all at the top of
    // this function just wiped the recording-Escape shortcut. Re-arm it so
    // hitting Escape from any window still reaches the discard prompt — the
    // very symptom Phase A (v0.12.8) was meant to fix would otherwise come
    // back the moment the user touches a hotkey mid-recording.
    if RECORDING_ESCAPE_DESIRED.load(Ordering::SeqCst) {
        let _ = arm_recording_escape(app);
    }

    Ok(())
}

fn arm_recording_escape<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let gs = app.global_shortcut();
    let escape = Shortcut::new(None, Code::Escape);
    let app_clone = app.clone();
    gs.on_shortcut(escape, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = app_clone.emit("recording:escape", ());
        }
    })
    .map_err(|e| e.to_string())
}

/// Re-register both hotkeys with new accelerator strings. Called from JS
/// when the user finishes editing a hotkey in the Configuration panel.
///
/// `recording_style` selects which recording shortcut is bound:
///   "toggle"        → `record` (tap to start/stop)
///   "push-to-talk"  → `ptt` (hold to record, release to stop)
/// Only one of the two is bound at a time. Mode-overlay is always bound.
#[tauri::command]
pub fn ultravox_register_hotkeys<R: Runtime>(
    app: AppHandle<R>,
    record: String,
    mode_overlay: String,
    ptt: String,
    recording_style: String,
) -> Result<(), String> {
    register_hotkeys_inner(&app, &record, &mode_overlay, &ptt, &recording_style)
}

/// Unregister every globally-registered shortcut. Used during onboarding so
/// that the moment the user types a key combo into the HotkeyRecorder, the
/// global hotkey doesn't simultaneously trigger a recording. App.tsx calls
/// this when the wizard mounts and re-registers when onboarding completes.
///
/// Onboarding deliberately wants every shortcut gone — including the
/// recording-Escape — so this command intentionally does NOT re-arm it.
/// Callers that need Escape preserved should use unregister selectively
/// rather than this nuclear option.
#[tauri::command]
pub fn unregister_all_hotkeys<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    RECORDING_ESCAPE_DESIRED.store(false, Ordering::SeqCst);
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())
}

/// Register a global Escape shortcut for the duration of an active recording.
///
/// The pill is an NSPanel and can become key, but if the user clicks into a
/// different Ultravox window (Settings, Onboarding) during a recording the
/// pill's local keydown handler never fires — Escape silently does nothing.
/// Registering Escape globally while recording fixes this: regardless of
/// which window is focused, Escape forwards to the pill's discard flow.
///
/// MUST be paired with `unregister_recording_escape` on every exit path
/// from the recording state machine, otherwise Escape stays globally
/// captured and breaks every other app on the system. The frontend handles
/// pairing in PillWindow's recording-state effect.
#[tauri::command]
pub fn register_recording_escape<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    RECORDING_ESCAPE_DESIRED.store(true, Ordering::SeqCst);
    arm_recording_escape(&app)
}

/// Release the global Escape shortcut. Called the moment the recording
/// state machine leaves the recording / discardConfirm states. The
/// underlying plugin call is a no-op if Escape wasn't registered, so
/// duplicate calls are safe.
#[tauri::command]
pub fn unregister_recording_escape<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    RECORDING_ESCAPE_DESIRED.store(false, Ordering::SeqCst);
    let gs = app.global_shortcut();
    let escape = Shortcut::new(None, Code::Escape);
    // unregister returns Err if the shortcut isn't currently registered;
    // treat that as success since the caller's intent is just "make sure
    // Escape is not globally hijacked".
    let _ = gs.unregister(escape);
    Ok(())
}

#[tauri::command]
pub fn show_pill<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pill") {
        win.show().map_err(|e| e.to_string())?;
        pill_window::reapply_overlay_flags(&app, "pill");
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
        pill_window::reapply_overlay_flags(&app, "mode-overlay");
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
        win.set_size(Size::Logical(LogicalSize { width: 388.0, height: height as f64 }))
            .map_err(|e| e.to_string())?;
        pill_window::reapply_overlay_flags(&app, "pill");
    }
    Ok(())
}

#[tauri::command]
pub fn set_pill_size<R: Runtime>(app: AppHandle<R>, width: u32, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    if let Some(win) = app.get_webview_window("pill") {
        win.set_size(Size::Logical(LogicalSize { width: width as f64, height: height as f64 }))
            .map_err(|e| e.to_string())?;
        pill_window::reapply_overlay_flags(&app, "pill");
    }
    Ok(())
}

/// Resize the pill to (width × height) and pin it to the top-center of
/// whichever screen it is currently on. Used for the compact / minimize
/// state — Superwhisper's "dots pill" pattern.
///
/// On macOS the menu bar is ~24pt tall; notched MacBooks (M1+) extend that
/// to ~37pt around the camera cutout. A 44pt offset clears both with a
/// small visual gap. The previous 12pt offset placed the pill behind the
/// menu bar / notch.
#[tauri::command]
pub fn set_pill_position_top_center<R: Runtime>(
    app: AppHandle<R>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let win = app
        .get_webview_window("pill")
        .ok_or("pill window missing")?;
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let mw = monitor.size().width as f64 / scale;
    let mx = monitor.position().x as f64 / scale;
    let my = monitor.position().y as f64 / scale;

    #[cfg(target_os = "macos")]
    let top_offset = 44.0;
    #[cfg(not(target_os = "macos"))]
    let top_offset = 12.0;

    let x = (mx + (mw - width as f64) / 2.0).round() as i32;
    let y = (my + top_offset).round() as i32;
    win.set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .map_err(|e| e.to_string())?;
    win.set_position(tauri::LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| e.to_string())?;
    crate::pill_window::reapply_overlay_flags(&app, "pill");
    Ok(())
}

/// Resize the pill to (w × h) and place at exact (x, y). Used by the
/// expand-from-compact path to restore the saved expanded position.
#[tauri::command]
pub fn set_pill_size_at_position<R: Runtime>(
    app: AppHandle<R>,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let win = app
        .get_webview_window("pill")
        .ok_or("pill window missing")?;
    win.set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .map_err(|e| e.to_string())?;
    win.set_position(tauri::LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| e.to_string())?;
    crate::pill_window::reapply_overlay_flags(&app, "pill");
    Ok(())
}
