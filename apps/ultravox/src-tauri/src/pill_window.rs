#[cfg(target_os = "macos")]
fn configure_overlay<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    use tauri::Manager;
    use objc2::runtime::AnyObject;
    use objc2::msg_send;

    let win = match app.get_webview_window(label) {
        Some(w) => w,
        None => {
            eprintln!("overlay_window: '{label}' window not found");
            return;
        }
    };

    let raw_ptr: *mut std::ffi::c_void = match win.ns_window() {
        Ok(ptr) => ptr,
        Err(e) => {
            eprintln!("overlay_window: ns_window() failed for '{label}': {e}");
            return;
        }
    };

    let ns_win = raw_ptr as *mut AnyObject;

    // canJoinAllSpaces (1 << 0) | fullScreenAuxiliary (1 << 8)
    let behavior: u64 = (1 << 0) | (1 << 8);
    unsafe {
        let _: () = msg_send![&*ns_win, setCollectionBehavior: behavior];
    }

    // NSPopUpMenuWindowLevel = 101 — floats above fullscreen spaces
    unsafe {
        let _: () = msg_send![&*ns_win, setLevel: 101_i64];
    }
}

/// Configure all transient overlay windows (pill + mode-overlay) so they
/// float above fullscreen Spaces and other apps. macOS' `alwaysOnTop` flag
/// alone does NOT traverse fullscreen Spaces — the underlying NSWindow
/// needs `canJoinAllSpaces | fullScreenAuxiliary` and a level above the
/// normal floating-panel level.
#[cfg(target_os = "macos")]
pub fn configure_overlay_windows<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    configure_overlay(app, "pill");
    configure_overlay(app, "mode-overlay");
}
