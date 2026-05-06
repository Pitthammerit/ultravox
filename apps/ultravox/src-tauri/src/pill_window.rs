#[cfg(target_os = "macos")]
pub fn configure_pill_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    use objc2::runtime::AnyObject;
    use objc2::msg_send;

    let win = match app.get_webview_window("pill") {
        Some(w) => w,
        None => {
            eprintln!("pill_window: 'pill' window not found");
            return;
        }
    };

    let raw_ptr: *mut std::ffi::c_void = match win.ns_window() {
        Ok(ptr) => ptr,
        Err(e) => {
            eprintln!("pill_window: ns_window() failed: {e}");
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
