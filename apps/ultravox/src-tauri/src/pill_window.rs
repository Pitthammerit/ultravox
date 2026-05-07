#[cfg(target_os = "macos")]
fn configure_overlay<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    use tauri::Manager;
    use objc2::runtime::{AnyClass, AnyObject};
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

    // For the pill window only: swap the NSWindow's ISA to NSPanel so we can
    // set NSWindowStyleMaskNonactivatingPanel — required for the pill to
    // float above other apps' fullscreen Spaces while the activation policy
    // stays Regular. Superwhisper does the same trick.
    if label == "pill" {
        unsafe {
            extern "C" {
                fn object_setClass(
                    obj: *mut std::ffi::c_void,
                    cls: *const std::ffi::c_void,
                ) -> *const std::ffi::c_void;
                fn class_replaceMethod(
                    cls: *const std::ffi::c_void,
                    name: *const std::ffi::c_void,
                    imp: *const std::ffi::c_void,
                    types: *const std::ffi::c_char,
                ) -> *const std::ffi::c_void;
                fn sel_registerName(
                    name: *const std::ffi::c_char,
                ) -> *const std::ffi::c_void;
            }
            if let Some(panel_class) = AnyClass::get("NSPanel") {
                object_setClass(
                    ns_win as *mut std::ffi::c_void,
                    panel_class as *const AnyClass as *const std::ffi::c_void,
                );

                // styleMask |= NSWindowStyleMaskNonactivatingPanel (1 << 7)
                let cur: u64 = msg_send![&*ns_win, styleMask];
                let new = cur | (1 << 7);
                let _: () = msg_send![&*ns_win, setStyleMask: new];

                // Override -[NSPanel canBecomeKeyWindow] to return YES.
                // For panels with NSWindowStyleMaskNonactivatingPanel set,
                // the framework default is NO — so the panel can never
                // become key, and -keyDown: never reaches the WebView,
                // which means JavaScript window.addEventListener("keydown")
                // never fires. That's why Esc stops working as soon as we
                // do the NSPanel ISA swap above. Replacing the method to
                // unconditionally return true restores keyboard input
                // while keeping the nonactivating behavior (the app does
                // NOT activate when the panel becomes key, because that's
                // controlled separately by the styleMask bit).
                extern "C" fn always_yes(
                    _self: *mut std::ffi::c_void,
                    _cmd: *const std::ffi::c_void,
                ) -> bool { true }

                let sel = sel_registerName(
                    b"canBecomeKeyWindow\0".as_ptr() as *const std::ffi::c_char,
                );
                class_replaceMethod(
                    panel_class as *const AnyClass as *const std::ffi::c_void,
                    sel,
                    always_yes as *const std::ffi::c_void,
                    b"c@:\0".as_ptr() as *const std::ffi::c_char,
                );
            } else {
                eprintln!("overlay_window: NSPanel class not found");
            }
        }
    }

    // canJoinAllSpaces (1 << 0) | stationary (1 << 4) | fullScreenAuxiliary (1 << 8)
    // - canJoinAllSpaces: appears on every Space (incl. fullscreen Spaces)
    // - stationary: don't slide with Space switches; stay put
    // - fullScreenAuxiliary: allowed to float over fullscreen apps
    let behavior: u64 = (1 << 0) | (1 << 4) | (1 << 8);
    unsafe {
        let _: () = msg_send![&*ns_win, setCollectionBehavior: behavior];
    }

    // NSScreenSaverWindowLevel = 1000 — sits above fullscreen overlays on
    // modern macOS (Sonoma+). NSPopUpMenuWindowLevel (101) is too low: a
    // fullscreen app's own auxiliary panels can occlude us.
    unsafe {
        let _: () = msg_send![&*ns_win, setLevel: 1000_i64];
    }
}

/// Configure all transient overlay windows (pill + mode-overlay) so they
/// float above fullscreen Spaces and other apps. macOS' `alwaysOnTop` flag
/// alone does NOT traverse fullscreen Spaces — the underlying NSWindow
/// needs `canJoinAllSpaces | stationary | fullScreenAuxiliary` and a level
/// above the normal floating-panel level.
#[cfg(target_os = "macos")]
pub fn configure_overlay_windows<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    configure_overlay(app, "pill");
    configure_overlay(app, "mode-overlay");
}

/// Re-apply the overlay flags to a single window. Tauri's `show()`,
/// `set_size()`, and `set_focus()` calls can reset the NSWindow level and
/// collection behavior — call this after every state transition (show,
/// resize) so the pill keeps floating above fullscreen apps.
#[cfg(target_os = "macos")]
pub fn reapply_overlay_flags<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    configure_overlay(app, label);
}

#[cfg(not(target_os = "macos"))]
pub fn reapply_overlay_flags<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, _label: &str) {}

#[cfg(not(target_os = "macos"))]
pub fn configure_overlay_windows<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {}
