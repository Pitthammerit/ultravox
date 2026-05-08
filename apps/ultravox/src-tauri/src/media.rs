use std::sync::Mutex;
use tauri::State;

pub struct MediaState {
    pub was_playing: Mutex<Vec<String>>,
}

impl Default for MediaState {
    fn default() -> Self {
        Self {
            was_playing: Mutex::new(Vec::new()),
        }
    }
}

/// Pause the target app if it's running AND currently playing — in a single
/// AppleScript invocation. This matters for the macOS permission dialog: each
/// distinct AppleEvents target the app touches surfaces its own prompt.
///
/// The previous implementation used three separate osascript calls per app:
/// (1) `tell application "System Events" to ... contains` to check whether the
/// app is running, (2) `tell application "Music" to get player state`, and
/// (3) `tell application "Music" to pause`. Step (1) targets *System Events*
/// (a separate AppleEvents target) and steps (2)/(3) target *Music* (or
/// Spotify) — so on first use macOS prompted twice: once for "Ultravox wants
/// to control System Events", then again for "Ultravox wants to control
/// Music". User-visible double prompt.
///
/// The form below uses the AppleScript-native `application "Music" is running`
/// predicate which does NOT require System Events and does NOT launch the app.
/// All AppleEvents go to a single target. Returns "paused" if we paused it,
/// empty string otherwise.
fn pause_if_playing(app_name: &str) -> bool {
    let script = format!(
        "if application \"{name}\" is running then
            tell application \"{name}\"
                if player state is playing then
                    pause
                    return \"paused\"
                end if
            end tell
        end if
        return \"\"",
        name = app_name
    );
    let out = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output();
    matches!(out, Ok(o) if String::from_utf8_lossy(&o.stdout).trim() == "paused")
}

fn resume(app_name: &str) {
    // Only target the app if it's still running; don't launch it.
    let script = format!(
        "if application \"{name}\" is running then
            tell application \"{name}\" to play
        end if",
        name = app_name
    );
    let _ = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output();
}

#[tauri::command]
pub fn media_pause(state: State<MediaState>) {
    let apps = ["Music", "Spotify"];
    let mut playing = Vec::new();
    for app in apps {
        if pause_if_playing(app) {
            playing.push(app.to_string());
        }
    }
    if let Ok(mut guard) = state.was_playing.lock() {
        *guard = playing;
    }
}

#[tauri::command]
pub fn media_resume(state: State<MediaState>) {
    let was: Vec<String> = state
        .was_playing
        .lock()
        .map(|mut g| {
            let v = g.clone();
            g.clear();
            v
        })
        .unwrap_or_default();
    for app in was {
        resume(&app);
    }
}
