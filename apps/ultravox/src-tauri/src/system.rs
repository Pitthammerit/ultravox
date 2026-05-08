/// System-level helpers (locale, etc.) read from macOS.
///
/// `navigator.language` inside WKWebView is unreliable — it can lag behind
/// the system locale, especially right after the user changes Language &
/// Region. Reading from `defaults read -g AppleLanguages` is authoritative.
use std::process::Command;

/// Open System Settings → Privacy & Security → a specific category. Used
/// by the onboarding wizard to recover when the user denied a permission
/// — once denied, macOS will not re-prompt; the only way back is the
/// Privacy pane.
///
/// Valid `category` values: "microphone", "accessibility".
#[tauri::command]
pub fn open_privacy_settings(category: String) -> Result<(), String> {
    let url = match category.as_str() {
        "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        other => return Err(format!("unknown privacy category: {other}")),
    };
    Command::new("open")
        .arg(url)
        .status()
        .map_err(|e| format!("failed to open: {e}"))?;
    Ok(())
}

/// Show or hide the macOS traffic-light buttons (close/minimize/zoom) for the
/// settings window. Called by the JS header on mouse-enter/leave so the
/// controls autohide until the user hovers the header region.
#[tauri::command]
pub fn set_traffic_lights_visible(app: tauri::AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        use objc2::runtime::AnyObject;
        use objc2::msg_send;

        let win = match app.get_webview_window("settings") {
            Some(w) => w,
            None => return,
        };
        let ptr = match win.ns_window() {
            Ok(p) => p as *mut AnyObject,
            Err(_) => return,
        };
        let hidden = !visible;
        // NSWindowButton enum values: close=0, miniaturize=1, zoom=2
        unsafe {
            for btn_type in [0usize, 1usize, 2usize] {
                let btn: *mut AnyObject = msg_send![ptr, standardWindowButton: btn_type];
                if !btn.is_null() {
                    let _: () = msg_send![btn, setHidden: hidden];
                }
            }
        }
    }
}

/// Returns the user's macOS preferred language as a short tag — the first
/// entry of `AppleLanguages` lowercased and split at the dash, e.g. "de"
/// for "de-DE", "en" for "en-US". Falls back to "en".
#[tauri::command]
pub fn get_system_language() -> String {
    let output = Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
        .ok();

    if let Some(o) = output {
        if let Ok(s) = String::from_utf8(o.stdout) {
            // Output looks like:
            //   (
            //       "de-DE",
            //       en
            //   )
            // We want the first non-empty quoted/unquoted token.
            for line in s.lines() {
                let trimmed = line.trim();
                if trimmed == "(" || trimmed == ")" || trimmed.is_empty() {
                    continue;
                }
                // Strip quotes and trailing comma.
                let cleaned = trimmed
                    .trim_end_matches(',')
                    .trim_matches('"')
                    .to_lowercase();
                if let Some((lang, _region)) = cleaned.split_once('-') {
                    return lang.to_string();
                }
                if !cleaned.is_empty() {
                    return cleaned;
                }
            }
        }
    }
    "en".to_string()
}
