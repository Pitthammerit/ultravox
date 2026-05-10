use std::sync::Mutex;
use tauri::State;

/// One row per (app, original_volume) that we ducked. We restore each
/// app individually because Music and Spotify have independent volume
/// controls and the user may have started them at different levels.
#[derive(Debug, Default, Clone)]
pub struct DuckSnapshot {
    pub app: String,
    pub original_volume: i32,
}

pub struct MediaState {
    pub was_playing: Mutex<Vec<String>>,
    pub ducked: Mutex<Vec<DuckSnapshot>>,
}

impl Default for MediaState {
    fn default() -> Self {
        Self {
            was_playing: Mutex::new(Vec::new()),
            ducked: Mutex::new(Vec::new()),
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

/// Read the current sound volume of an app via AppleScript. Returns None
/// if the app isn't running OR doesn't expose a `sound volume` property
/// (only Music and Spotify do, currently). Same single-target pattern as
/// pause_if_playing — no System Events involvement, no permission prompt
/// chaining.
fn get_volume(app_name: &str) -> Option<i32> {
    let script = format!(
        "if application \"{name}\" is running then
            tell application \"{name}\" to return sound volume as integer
        end if
        return \"\"",
        name = app_name,
    );
    let out = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()?;
    String::from_utf8_lossy(&out.stdout).trim().parse::<i32>().ok()
}

fn set_volume(app_name: &str, volume: i32) {
    let clamped = volume.clamp(0, 100);
    let script = format!(
        "if application \"{name}\" is running then
            tell application \"{name}\" to set sound volume to {vol}
        end if",
        name = app_name,
        vol = clamped,
    );
    let _ = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output();
}

/// Lower the volume of Music + Spotify by `percent` percent (0–100). For
/// example, percent=50 cuts the current volume in half. Saves the original
/// volume per-app so `media_unduck` can restore exactly. Idempotent: if
/// already ducked, the second call is a no-op (we don't compound).
#[tauri::command]
pub fn media_duck(state: State<MediaState>, percent: u8) {
    // Hold the mutex across the entire read-modify-write window so two
    // concurrent media_duck calls (rapid record-stop/restart, or fast
    // toggle of the duck setting) can't race past the empty-check, both
    // run AppleScript, and overwrite each other's snapshots — leaving
    // the wrong "original" volume to restore later.
    //
    // The AppleScript I/O happens while holding the lock, which is fine:
    // the only competing caller would be a duplicate duck, and the lock
    // is uncontended in steady-state recording. media_unduck takes the
    // same lock so it serialises against this naturally.
    let mut guard = match state.ducked.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if !guard.is_empty() {
        return; // already ducked — don't compound
    }
    let pct = percent.min(100) as f32;
    let factor = 1.0 - pct / 100.0;
    let mut snapshots = Vec::new();
    for app in ["Music", "Spotify"] {
        if let Some(orig) = get_volume(app) {
            let new_vol = ((orig as f32) * factor).round() as i32;
            set_volume(app, new_vol);
            snapshots.push(DuckSnapshot {
                app: app.to_string(),
                original_volume: orig,
            });
        }
    }
    *guard = snapshots;
}

/// Restore Music + Spotify to whatever volume they had before media_duck
/// was called. Safe to call when nothing was ducked (no-op).
#[tauri::command]
pub fn media_unduck(state: State<MediaState>) {
    let snapshots: Vec<DuckSnapshot> = state
        .ducked
        .lock()
        .map(|mut g| {
            let v = g.clone();
            g.clear();
            v
        })
        .unwrap_or_default();
    for snap in snapshots {
        set_volume(&snap.app, snap.original_volume);
    }
}
