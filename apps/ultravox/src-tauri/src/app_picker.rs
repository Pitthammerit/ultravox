#![cfg(target_os = "macos")]

//! Native `.app` picker for the per-mode auto-switching UI (v0.19.0).
//!
//! Plan deviation from the v0.19.0 spec: the spec recommended "Strategy
//! B" (NSOpenPanel via objc2-app-kit). The codebase already uses
//! osascript for the recordings folder picker (recordings.rs::
//! choose_recordings_folder) — mirroring that pattern keeps the picker
//! infrastructure consistent and skips a new objc2 dependency.
//! "choose application with multiple selections allowed" returns a list
//! of application references; we extract bundle id + display name and
//! send them up to JS.
//!
//! Output protocol: `<bid>` `<>` `<name>` `|||` `<bid>` ... — using
//! multi-character separators because bundle IDs and app names may
//! contain `:` / `,` / `/` and we want a parser that won't get
//! confused. Empty string on cancel (AppleScript -128).

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct PickedApp {
    pub bundle_id: String,
    pub display_name: String,
}

#[tauri::command]
pub fn pick_app_bundle(prompt: String) -> Result<Vec<PickedApp>, String> {
    // Defensive: AppleScript double-quotes must be escaped or the
    // string literal in the script ends prematurely.
    let escaped_prompt = prompt.replace('"', "\\\"");
    let script = format!(
        r#"try
    set pickedList to choose application with prompt "{}" with multiple selections allowed
    set output to ""
    repeat with p in pickedList
        set bid to id of p
        set nm to name of p
        set output to output & bid & "<>" & nm & "|||"
    end repeat
    return output
on error number -128
    return ""
end try"#,
        escaped_prompt
    );

    let out = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("osascript spawn: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "osascript exited {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if raw.is_empty() {
        return Ok(vec![]);
    }
    let entries: Vec<PickedApp> = raw
        .split("|||")
        .filter(|s| !s.trim().is_empty())
        .filter_map(|entry| {
            let mut parts = entry.splitn(2, "<>");
            let bid = parts.next()?.trim().to_string();
            let name = parts.next().unwrap_or("").trim().to_string();
            if bid.is_empty() {
                return None;
            }
            Some(PickedApp {
                bundle_id: bid.clone(),
                display_name: if name.is_empty() { bid } else { name },
            })
        })
        .collect();
    Ok(entries)
}
