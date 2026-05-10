use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[cfg(target_os = "windows")]
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

/// Send Cmd+V on macOS using atomic CGEvent dispatch.
///
/// Why atomic: the previous enigo-based implementation pressed Cmd, slept 30 ms
/// to give the macOS Text Services Manager time to register the modifier,
/// then clicked V. Under load that 30 ms wasn't always enough — TSM hadn't
/// flagged the input source as Cmd-active by the time the V keystroke
/// arrived, so the target app saw a bare 'v'. ~2 in 5 cycles surfaced the bug.
///
/// CGEventCreateKeyboardEvent + setFlags lets us fire the V key with the
/// Command modifier flag *already attached* to the same event. The event
/// enters the system pre-flagged — there's no window where the V can be
/// interpreted without Cmd. This is the same path that Karabiner-Elements,
/// BetterTouchTool, and macOS itself use for synthetic shortcuts.
///
/// Why main thread: the previous enigo path required the main thread because
/// enigo transitively calls TSMGetInputSourceProperty, which asserts the main
/// dispatch queue. CGEvent posting does NOT have that requirement, but we
/// keep the main-thread marshaling for consistency and to serialize against
/// any other CG event work the UI thread might be doing.
#[cfg(target_os = "macos")]
fn dispatch_paste_combo_macos() -> Result<(), String> {
    use core_graphics::event::{
        CGEvent, CGEventFlags, CGEventTapLocation,
    };
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    // ANSI keycode for 'V' on a US keyboard layout. macOS keycode (kVK_ANSI_V).
    const KEY_V: u16 = 9;

    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .map_err(|_| "CGEventSource::new failed".to_string())?;

    let down = CGEvent::new_keyboard_event(source.clone(), KEY_V, true)
        .map_err(|_| "CGEvent keyDown create failed".to_string())?;
    down.set_flags(CGEventFlags::CGEventFlagCommand);
    down.post(CGEventTapLocation::HID);

    // Brief separation so the destination app can sequence keyDown/keyUp
    // through its own dispatch loop. Required on some apps (e.g. Electron-
    // based editors) that batch keyDown handling.
    std::thread::sleep(Duration::from_millis(8));

    let up = CGEvent::new_keyboard_event(source, KEY_V, false)
        .map_err(|_| "CGEvent keyUp create failed".to_string())?;
    up.set_flags(CGEventFlags::CGEventFlagCommand);
    up.post(CGEventTapLocation::HID);

    Ok(())
}

fn dispatch_paste_combo(app: &AppHandle) -> Result<(), String> {
    use std::sync::mpsc::sync_channel;
    let (tx, rx) = sync_channel::<Result<(), String>>(0);

    app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            #[cfg(target_os = "macos")]
            {
                dispatch_paste_combo_macos()
            }
            #[cfg(target_os = "windows")]
            {
                let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
                enigo
                    .key(Key::Control, Direction::Press)
                    .map_err(|e| e.to_string())?;
                enigo
                    .key(Key::Unicode('v'), Direction::Click)
                    .map_err(|e| e.to_string())?;
                enigo
                    .key(Key::Control, Direction::Release)
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            {
                Err::<(), String>("unsupported platform".to_string())
            }
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| format!("run_on_main_thread failed: {e}"))?;

    rx.recv()
        .map_err(|e| format!("main-thread paste dropped: {e}"))?
}

#[tauri::command]
pub async fn paste_to_frontmost(
    app: AppHandle,
    text: String,
    target_pid: Option<i32>,
) -> Result<(), String> {
    let clipboard = app.clipboard();
    let saved = clipboard.read_text().ok();

    clipboard.write_text(text.clone()).map_err(|e| e.to_string())?;

    // Re-activate the originally-targeted app BEFORE pasting. This handles
    // the case where the user clicked into another window during recording
    // (or the pill window briefly stole focus), which would otherwise cause
    // the paste to land in the wrong place. Without this, long dictations
    // can vanish entirely. The PID was captured at hotkey-fire time on the
    // frontend and threaded through here.
    #[cfg(target_os = "macos")]
    if let Some(pid) = target_pid {
        if let Err(e) = crate::frontmost::activate_app_by_pid(pid) {
            // Best-effort: log and continue. A failed re-activation is
            // recoverable — paste still goes to whatever is frontmost now,
            // which is usually correct anyway.
            eprintln!("[paste] activate_app_by_pid({pid}) failed: {e}");
        }
        // Brief settle so the activation propagates through the window
        // server before we send the keystroke.
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = target_pid;

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
