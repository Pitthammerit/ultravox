#![cfg(target_os = "macos")]

use objc2::rc::autoreleasepool;
use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use objc2_app_kit::NSWorkspace;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct FrontmostApp {
    pub bundle_id: Option<String>,
    pub localized_name: Option<String>,
    /// Unix PID of the frontmost app at the time of capture. Used by the
    /// paste pipeline to re-activate the original target app before pasting,
    /// in case focus moved between hotkey-fire and paste-fire (long
    /// dictations, user clicked into another window during recording, etc.).
    pub pid: i32,
}

#[tauri::command]
pub fn get_frontmost_app() -> Result<FrontmostApp, String> {
    autoreleasepool(|_| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(app) = workspace.frontmostApplication() else {
            return Ok(FrontmostApp {
                bundle_id: None,
                localized_name: None,
                pid: -1,
            });
        };

        let bundle_id = app.bundleIdentifier().map(|s| s.to_string());
        let localized_name = app.localizedName().map(|s| s.to_string());
        // processIdentifier is not exposed in objc2-app-kit 0.2's
        // NSRunningApplication binding, so reach for it via raw msg_send.
        // The selector returns pid_t (i32 on macOS).
        let app_obj: &AnyObject = &*app as &AnyObject;
        let pid: i32 = msg_send![app_obj, processIdentifier];

        Ok(FrontmostApp {
            bundle_id,
            localized_name,
            pid,
        })
    })
}

/// Re-activate the app with the given PID, bringing its frontmost window
/// to focus. Returns Ok even if the app no longer exists (e.g. user quit
/// it during recording) — paste will harmlessly fall through to whatever
/// is currently focused.
///
/// Uses raw msg_send because objc2-app-kit 0.2's NSRunningApplication
/// binding doesn't include `runningApplicationWithProcessIdentifier:` or
/// `activateWithOptions:`. The runtime selectors are stable and present
/// on every macOS version we support.
pub fn activate_app_by_pid(pid: i32) -> Result<(), String> {
    if pid <= 0 {
        return Ok(());
    }
    // NSApplicationActivationOptions:
    //   NSApplicationActivateAllWindows         = 1 << 0
    //   NSApplicationActivateIgnoringOtherApps  = 1 << 1
    const NS_APP_ACTIVATE_ALL_WINDOWS: usize = 1;
    const NS_APP_ACTIVATE_IGNORING: usize = 2;
    let opts: usize = NS_APP_ACTIVATE_ALL_WINDOWS | NS_APP_ACTIVATE_IGNORING;

    autoreleasepool(|_| unsafe {
        let cls = class!(NSRunningApplication);
        let app: *mut AnyObject =
            msg_send![cls, runningApplicationWithProcessIdentifier: pid];
        if app.is_null() {
            // App no longer exists; harmless — paste falls through to whatever
            // is currently frontmost.
            return Ok(());
        }
        let _: bool = msg_send![&*app, activateWithOptions: opts];
        Ok(())
    })
}

/// Explicitly deactivate Ultravox at the OS level, so macOS promotes the
/// previously-frontmost non-Ultravox app to the foreground.
///
/// Why this exists: the paste pipeline used to call only
/// `activate_app_by_pid(target_pid)` and trust macOS to bring the target
/// app forward. Two scenarios broke that assumption and caused Cmd+V to
/// land inside our own Settings window:
///
///   1. The user triggered the hotkey while the Settings window WAS
///      already frontmost. Captured `target_pid` is then our own PID, so
///      `activate_app_by_pid` cheerfully reactivates Ultravox — exactly
///      what we don't want.
///
///   2. Hiding the pill panel (NSPanel with `canBecomeKeyWindow = YES`)
///      causes AppKit to promote the next ordered window of the same app
///      to key status. With Settings visible, Ultravox briefly becomes
///      frontmost; the subsequent `activate_app_by_pid(notes_pid)` may
///      lose the race against the in-flight key-window swap. The Cmd+V
///      gets posted while Settings is still frontmost.
///
/// Calling `[NSApp deactivate]` before `activate_app_by_pid` solves both:
/// macOS picks the previously-frontmost non-self app, which is the user's
/// real target in (1) and a no-op-ish step in (2) because the subsequent
/// `activate_app_by_pid(notes)` lands on an already-restored target.
pub fn deactivate_self() {
    autoreleasepool(|_| unsafe {
        let cls = class!(NSApplication);
        let app: *mut AnyObject = msg_send![cls, sharedApplication];
        if app.is_null() {
            return;
        }
        let _: () = msg_send![&*app, deactivate];
    })
}

/// Bundle id of whatever is currently frontmost. Pure read — used for
/// diagnostic logging in the paste pipeline so the user-shared debug log
/// can show which app actually had focus at Cmd+V time, separate from
/// the captured `target_pid`. Helps tell apart "wrong PID captured" from
/// "right PID but activation lost the race".
pub fn current_frontmost_bundle_id() -> Option<String> {
    autoreleasepool(|_| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace.frontmostApplication()?;
        app.bundleIdentifier().map(|s| s.to_string())
    })
}
