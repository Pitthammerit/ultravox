/// macOS Accessibility permission helpers.
///
/// `AXIsProcessTrustedWithOptions` with `kAXTrustedCheckOptionPrompt = true`
/// is the official API that:
///   1. Returns `true` immediately if the app is already trusted.
///   2. Otherwise adds the app to the Accessibility list in System Settings
///      and shows the system dialog "… wants to control this computer".
///
/// This is how AudioSwift, Superwhisper, DeepL, etc. appear in that list
/// automatically — they call this on first launch.

#[cfg(target_os = "macos")]
mod ax {
    use std::ffi::{c_char, c_void};

    const KCF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        // kCFBooleanTrue is a pointer-sized opaque value; we just need the address.
        static kCFBooleanTrue: *const c_void;
        // These are structs passed by pointer to CFDictionaryCreate.
        static kCFTypeDictionaryKeyCallBacks: c_void;
        static kCFTypeDictionaryValueCallBacks: c_void;

        fn CFStringCreateWithCString(
            allocator: *const c_void,
            c_str: *const c_char,
            encoding: u32,
        ) -> *mut c_void;

        fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            value_callbacks: *const c_void,
        ) -> *mut c_void;

        fn CFRelease(cf: *const c_void);
    }

    /// Returns true if the process currently has Accessibility access.
    pub fn is_trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Triggers the macOS "wants to control this computer" dialog and adds
    /// the app to the Accessibility list in System Settings if not yet trusted.
    /// Returns true if access was already granted.
    pub fn request_trust() -> bool {
        unsafe {
            // "AXTrustedCheckOptionPrompt" is the string value of
            // kAXTrustedCheckOptionPrompt (defined in AXUIElement.h).
            let key_bytes = b"AXTrustedCheckOptionPrompt\0";
            let key = CFStringCreateWithCString(
                std::ptr::null(),
                key_bytes.as_ptr() as *const c_char,
                KCF_STRING_ENCODING_UTF8,
            );
            if key.is_null() {
                return AXIsProcessTrusted();
            }

            let keys: [*const c_void; 1] = [key as _];
            let values: [*const c_void; 1] = [kCFBooleanTrue];

            let dict = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks as *const _,
                &kCFTypeDictionaryValueCallBacks as *const _,
            );

            let trusted = if dict.is_null() {
                AXIsProcessTrusted()
            } else {
                let r = AXIsProcessTrustedWithOptions(dict);
                CFRelease(dict);
                r
            };

            CFRelease(key);
            trusted
        }
    }
}

/// Returns true if the app currently has Accessibility permission.
#[tauri::command]
pub fn check_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        ax::is_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Triggers the macOS permission dialog that adds the app to the
/// Accessibility list. Returns true if access is already granted.
#[tauri::command]
pub fn request_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        ax::request_trust()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// macOS microphone authorization helper (AVCaptureDevice).
///
/// The WebView's `navigator.permissions.query({name:"microphone"})` returns
/// "prompt" instead of "granted" on cold launches even when the system has
/// granted mic access — the WKWebView permission cache doesn't survive app
/// relaunches the way the system-level TCC database does. Reading the auth
/// status directly from AVCaptureDevice gives us the truthful value.
#[cfg(target_os = "macos")]
mod mic {
    use objc2::runtime::AnyClass;
    use objc2::{class, msg_send};
    use std::ffi::c_void;

    // AVMediaTypeAudio is an exported NSString * from AVFoundation. We import
    // it as an opaque pointer and pass it through to objc as an `id`.
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVMediaTypeAudio: *const c_void;
    }

    /// Mirrors AVAuthorizationStatus enum values (NSInteger).
    pub fn auth_status() -> i64 {
        unsafe {
            let cls: &AnyClass = class!(AVCaptureDevice);
            let media_type: *const c_void = AVMediaTypeAudio;
            let status: i64 = msg_send![cls, authorizationStatusForMediaType: media_type];
            status
        }
    }
}

/// Returns the system-level microphone authorization status as a string:
/// "notdetermined" | "restricted" | "denied" | "authorized".
///
/// Used as the source of truth for the Configuration → Permissions and
/// Onboarding mic rows. The WebView Permissions API is the fallback when
/// this returns "notdetermined" (i.e. the app has never asked yet).
#[tauri::command]
pub fn microphone_auth_status() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        match mic::auth_status() {
            0 => "notdetermined",
            1 => "restricted",
            2 => "denied",
            3 => "authorized",
            _ => "notdetermined",
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "authorized"
    }
}
