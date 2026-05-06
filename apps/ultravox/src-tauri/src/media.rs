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

fn is_running(app_name: &str) -> bool {
    let out = std::process::Command::new("osascript")
        .args([
            "-e",
            &format!(
                "tell application \"System Events\" to return (name of processes) contains \"{}\"",
                app_name
            ),
        ])
        .output();
    matches!(out, Ok(o) if String::from_utf8_lossy(&o.stdout).trim() == "true")
}

fn is_playing(app_name: &str) -> bool {
    let out = std::process::Command::new("osascript")
        .args([
            "-e",
            &format!(
                "tell application \"{}\" to get player state",
                app_name
            ),
        ])
        .output();
    matches!(out, Ok(o) if String::from_utf8_lossy(&o.stdout).trim() == "playing")
}

fn send_command(app_name: &str, cmd: &str) {
    let _ = std::process::Command::new("osascript")
        .args([
            "-e",
            &format!("tell application \"{}\" to {}", app_name, cmd),
        ])
        .output();
}

#[tauri::command]
pub fn media_pause(state: State<MediaState>) {
    let apps = ["Music", "Spotify"];
    let mut playing = Vec::new();
    for app in apps {
        if is_running(app) && is_playing(app) {
            send_command(app, "pause");
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
        send_command(&app, "play");
    }
}
