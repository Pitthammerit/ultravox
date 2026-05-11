/*!
 * Local audio recording storage.
 *
 * When the user opts into `settings.recordings.saveLocal`, every Whisper
 * recording's audio blob gets persisted to disk so they can replay it,
 * re-transcribe it with a different mode, or audit later.
 *
 * Storage location is user-configurable. Default is
 * `~/Documents/Ultravox Recordings/` (per user request 2026-05-11) —
 * visible in Finder under the user's regular Documents folder rather
 * than hidden in `~/Library/Application Support/`. The user can pick
 * any folder they like via `choose_recordings_folder` (native
 * AppKit folder picker via osascript) and the chosen absolute path
 * lives in `settings.recordings.folder`.
 *
 * Privacy posture: default OFF, opt-in only. Files never leave the
 * machine via this module — the existing transcribe.ts pipeline still
 * uploads the raw audio to whatever transcription backend the active
 * mode picks, but persistence here is local-only. Retention is swept
 * on launch by the frontend (using `list_recording_files` +
 * `delete_recording_audio`).
 *
 * One file per HistoryEntry, named by its existing UUID:
 *   <recordings_dir>/<id>.<ext>
 */

use serde::Serialize;
use std::path::PathBuf;

const DEFAULT_FOLDER_NAME: &str = "Ultravox Recordings";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingFile {
    /// HistoryEntry UUID (the filename stem, before the dot).
    pub id: String,
    /// File extension without the leading dot (e.g. "mp4" or "webm").
    pub ext: String,
    pub size_bytes: u64,
    /// Last-modified time in unix milliseconds (used by retention sweep).
    pub mtime_ms: u64,
}

/// The fallback directory used when `settings.recordings.folder` is unset
/// (fresh install or after user clicks "Reset to default").
///
/// `~/Documents/Ultravox Recordings/`. We pick the home Documents folder
/// rather than `Application Support/` so the user sees the audio files in
/// Finder where they expect them. macOS doesn't require any special
/// permission for write access to a user-owned Documents subfolder.
fn default_recordings_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "no home dir".to_string())?;
    Ok(home.join("Documents").join(DEFAULT_FOLDER_NAME))
}

/// Resolve the directory for recordings, given the user's optional setting.
/// Creates the directory on-demand (mkdir -p semantics) so the rest of the
/// commands don't have to.
///
/// If `folder` is Some and non-empty, use it as-is (already validated to be
/// an absolute path from the frontend's choose-folder flow). Otherwise fall
/// back to `~/Documents/Ultravox Recordings/`.
fn recordings_dir(folder: Option<&str>) -> Result<PathBuf, String> {
    let dir = match folder.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => PathBuf::from(s),
        None => default_recordings_dir()?,
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir recordings: {e}"))?;
    Ok(dir)
}

/// Defense-in-depth: validate the entry id looks like a UUID-shaped string
/// (hex / hyphen) so a caller can't traverse out of the recordings dir
/// via "../foo" or similar.
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("empty entry id".into());
    }
    if id.len() > 64 {
        return Err("entry id too long".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("invalid entry id: {id}"));
    }
    Ok(())
}

fn validate_ext(ext: &str) -> Result<(), String> {
    if ext.is_empty() {
        return Err("empty ext".into());
    }
    if ext.len() > 8 {
        return Err("ext too long".into());
    }
    if !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("invalid ext: {ext}"));
    }
    Ok(())
}

/// Returns the default recordings directory as a string for the frontend
/// UI ("Reset to default" / "currently default" display).
#[tauri::command]
pub fn recordings_default_folder() -> Result<String, String> {
    Ok(default_recordings_dir()?.to_string_lossy().to_string())
}

/// Open a native macOS folder picker, anchored to the current Finder
/// active window. Returns the picked absolute path, or None if the user
/// cancelled. No new Tauri plugin needed — uses osascript which is
/// always available on macOS.
#[tauri::command]
pub fn choose_recordings_folder() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        // `choose folder` returns an alias on cancel — wrap in try so we
        // get an empty string back instead of an AppleScript error code,
        // which we then map to None.
        let script = r#"try
            POSIX path of (choose folder with prompt "Pick a folder for Ultravox recordings")
        on error number -128
            return ""
        end try"#;
        let out = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("osascript spawn: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "osascript exited {}: {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if path.is_empty() {
            return Ok(None);
        }
        // macOS sometimes returns paths with a trailing slash (alias
        // POSIX path); strip it so saved-path comparisons work.
        let cleaned = path.trim_end_matches('/').to_string();
        Ok(Some(cleaned))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("folder picker only supported on macOS".to_string())
    }
}

/// Write `bytes` to <recordings>/<entry_id>.<ext>. Returns the absolute
/// path. Overwrites any existing file at that path. Atomic via .part +
/// rename so a crashed write doesn't leave a half-file.
#[tauri::command]
pub fn save_recording_audio(
    entry_id: String,
    ext: String,
    bytes: Vec<u8>,
    folder: Option<String>,
) -> Result<String, String> {
    validate_id(&entry_id)?;
    validate_ext(&ext)?;
    let dir = recordings_dir(folder.as_deref())?;
    let path = dir.join(format!("{entry_id}.{ext}"));
    let tmp = dir.join(format!("{entry_id}.{ext}.part"));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("write tmp: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// Idempotent — no error if the file doesn't exist. We delete by scanning
/// for any extension matching `<entry_id>.*` because the caller may not
/// remember which container format was used.
#[tauri::command]
pub fn delete_recording_audio(
    entry_id: String,
    folder: Option<String>,
) -> Result<(), String> {
    validate_id(&entry_id)?;
    let dir = match recordings_dir(folder.as_deref()) {
        Ok(d) => d,
        Err(_) => return Ok(()), // dir doesn't exist → nothing to delete
    };
    let prefix = format!("{entry_id}.");
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let s = name.to_string_lossy();
        if s.starts_with(&prefix) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

/// Read the audio bytes for replay or re-transcribe.
#[tauri::command]
pub fn read_recording_audio(
    entry_id: String,
    ext: String,
    folder: Option<String>,
) -> Result<Vec<u8>, String> {
    validate_id(&entry_id)?;
    validate_ext(&ext)?;
    let dir = recordings_dir(folder.as_deref())?;
    let path = dir.join(format!("{entry_id}.{ext}"));
    std::fs::read(&path).map_err(|e| format!("read: {e}"))
}

/// Enumerate all files in the recordings dir. Used by the retention sweep
/// to find orphans + entries past the retention threshold, and by the
/// Configuration panel's disk-usage readout.
#[tauri::command]
pub fn list_recording_files(folder: Option<String>) -> Result<Vec<RecordingFile>, String> {
    // Don't auto-create the dir for a pure list — return empty if missing.
    let dir = match folder.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => PathBuf::from(s),
        None => match default_recordings_dir() {
            Ok(d) => d,
            Err(_) => return Ok(Vec::new()),
        },
    };
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<RecordingFile> = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Skip .part tmp files left behind by an interrupted save.
        if path.extension().and_then(|s| s.to_str()) == Some("part") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let ext = match path.extension().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size_bytes = metadata.len();
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(RecordingFile { id: stem, ext, size_bytes, mtime_ms });
    }
    out.sort_by_key(|f| std::cmp::Reverse(f.mtime_ms));
    Ok(out)
}

/// Reveal the recordings directory in Finder. Used by the "Open recordings
/// folder" button in the Configuration panel.
#[tauri::command]
pub fn open_recordings_folder(folder: Option<String>) -> Result<(), String> {
    let dir = recordings_dir(folder.as_deref())?;
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg(&dir)
            .status()
            .map_err(|e| format!("open spawn: {e}"))?;
        if !status.success() {
            return Err(format!("open exited with {status}"));
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = dir;
        return Err("only supported on macOS".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn validate_id_accepts_uuid_shape() {
        assert!(validate_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_id("abc123").is_ok());
    }

    #[test]
    fn validate_id_rejects_path_traversal() {
        assert!(validate_id("../etc/passwd").is_err());
        assert!(validate_id("foo/bar").is_err());
        assert!(validate_id("foo bar").is_err());
        assert!(validate_id("").is_err());
        assert!(validate_id(&"x".repeat(65)).is_err());
    }

    #[test]
    fn validate_ext_accepts_common() {
        assert!(validate_ext("mp4").is_ok());
        assert!(validate_ext("webm").is_ok());
        assert!(validate_ext("wav").is_ok());
        assert!(validate_ext("ogg").is_ok());
    }

    #[test]
    fn validate_ext_rejects_dotted_or_long() {
        assert!(validate_ext(".mp4").is_err());
        assert!(validate_ext("foo.bar").is_err());
        assert!(validate_ext("").is_err());
        assert!(validate_ext("verylongextension").is_err());
    }

    /// Round-trip into a tmp dir provided as the `folder` argument.
    /// Verifies that the user-configurable folder path is honored end-to-end.
    #[test]
    fn save_read_delete_round_trip_with_custom_folder() {
        let tmp = std::env::temp_dir().join(format!("ultravox-rec-test-{}", std::process::id()));
        let folder = tmp.to_string_lossy().to_string();
        let id = "test-uuid-1234".to_string();

        let path =
            save_recording_audio(id.clone(), "mp4".to_string(), b"hello".to_vec(), Some(folder.clone()))
                .expect("save ok");
        assert!(Path::new(&path).is_file());
        // File must live UNDER the requested folder, not Application Support.
        assert!(path.starts_with(&folder));

        let bytes = read_recording_audio(id.clone(), "mp4".to_string(), Some(folder.clone()))
            .expect("read ok");
        assert_eq!(bytes, b"hello");

        delete_recording_audio(id.clone(), Some(folder.clone())).expect("delete ok");
        assert!(!Path::new(&path).exists());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn list_recording_files_returns_metadata_for_existing() {
        let tmp = std::env::temp_dir().join(format!("ultravox-rec-list-test-{}", std::process::id()));
        let folder = tmp.to_string_lossy().to_string();
        let _ = save_recording_audio(
            "abc123".to_string(),
            "mp4".to_string(),
            b"hello".to_vec(),
            Some(folder.clone()),
        );

        let files = list_recording_files(Some(folder.clone())).expect("list ok");
        assert!(!files.is_empty(), "should list the saved file");
        let found = files.iter().find(|f| f.id == "abc123").expect("found abc123");
        assert_eq!(found.ext, "mp4");
        assert_eq!(found.size_bytes, 5);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn default_recordings_dir_lives_under_documents() {
        let p = default_recordings_dir().expect("ok");
        let s = p.to_string_lossy();
        assert!(s.contains("Documents"));
        assert!(s.ends_with(DEFAULT_FOLDER_NAME));
    }

    #[test]
    fn list_returns_empty_for_missing_folder() {
        let nonexistent = std::env::temp_dir()
            .join(format!("ultravox-nope-{}-doesnotexist", std::process::id()));
        let files =
            list_recording_files(Some(nonexistent.to_string_lossy().to_string())).expect("ok");
        assert!(files.is_empty());
    }
}
