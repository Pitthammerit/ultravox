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

/// Write a string to the system clipboard from the Rust side.
///
/// Useful for callers that don't have a propagated user-activation gesture
/// (e.g. tray-menu actions). WKWebView's `navigator.clipboard.writeText`
/// requires a recent user activation in the WebView's DOM, which a native
/// AppKit menu click does not propagate. The Rust clipboard path has no
/// such restriction — it always succeeds when the app is running.
#[tauri::command]
pub fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())
}

/// Diagnostic info returned to the frontend after a paste attempt.
/// Frontend logs this into debug-log.json so we can correlate captured
/// target PID with the app that was actually frontmost at Cmd+V time.
#[derive(Debug, serde::Serialize)]
pub struct PasteDiagnostics {
    /// True if `target_pid` matched our own process id and was discarded.
    pub target_was_self: bool,
    /// Bundle id of the app that was frontmost immediately before Cmd+V
    /// was dispatched. `None` if AppKit returned no frontmost app.
    pub frontmost_at_paste: Option<String>,
}

#[tauri::command]
pub async fn paste_to_frontmost(
    app: AppHandle,
    text: String,
    target_pid: Option<i32>,
) -> Result<PasteDiagnostics, String> {
    let clipboard = app.clipboard();
    let saved = clipboard.read_text().ok();

    clipboard.write_text(text.clone()).map_err(|e| e.to_string())?;

    // Detect "user triggered the hotkey from inside Ultravox's own Settings
    // window" up-front. We log it and skip the self-activation step below
    // so the post-deactivate frontmost (the previous non-self app) wins.
    #[cfg(target_os = "macos")]
    let our_pid = std::process::id() as i32;
    #[cfg(target_os = "macos")]
    let target_was_self = matches!(target_pid, Some(p) if p == our_pid);

    #[cfg(not(target_os = "macos"))]
    let target_was_self = false;

    #[cfg(target_os = "macos")]
    {
        // Step 1: explicitly deactivate Ultravox at the app level. Without
        // this, hiding the pill (which is allowed to become key) can leave
        // our own Settings window as the next-ordered key window, making
        // Ultravox briefly frontmost and racing the activate-target call
        // below. Deactivating up-front lets macOS promote whatever non-
        // self app was most recently frontmost, which is the correct
        // target in every scenario we've seen.
        crate::frontmost::deactivate_self();

        // Step 2: re-activate the originally-captured target app, UNLESS
        // it's ourselves. Re-activating ourselves is exactly the bug we're
        // defending against (paste lands in Settings instead of the user's
        // app of choice).
        if let Some(pid) = target_pid {
            if target_was_self {
                eprintln!(
                    "[paste] target_pid {pid} is our own PID; \
                     skipping self-activation, deferring to deactivate result"
                );
            } else if let Err(e) = crate::frontmost::activate_app_by_pid(pid) {
                eprintln!("[paste] activate_app_by_pid({pid}) failed: {e}");
            }
        }
        // Brief settle so the activation propagates through the window
        // server before we send the keystroke.
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = target_pid;

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Capture who's actually frontmost right before Cmd+V dispatches.
    // The bundle id is then logged client-side so we can verify the
    // deactivate + activate sequence reached the intended target.
    #[cfg(target_os = "macos")]
    let frontmost_at_paste = crate::frontmost::current_frontmost_bundle_id();
    #[cfg(not(target_os = "macos"))]
    let frontmost_at_paste: Option<String> = None;

    dispatch_paste_combo(&app)?;

    if let Some(prev) = saved {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = app_handle.clipboard().write_text(prev);
        });
    }

    Ok(PasteDiagnostics {
        target_was_self,
        frontmost_at_paste,
    })
}
