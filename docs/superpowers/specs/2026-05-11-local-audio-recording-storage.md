# Local Audio Recording Storage — Design

**Date:** 2026-05-11  
**Owner:** Ultravox  
**Status:** Approved (decisions made via AskUserQuestion 2026-05-11)

## Goal

Let users opt into saving the audio of every recording to disk on their Mac. Saved audio is accessible from the History panel for replay, re-transcription, and audit. Privacy-conscious: default OFF, never uploaded except to the existing transcription path (Cloudflare Worker / OpenRouter / local LLM), retention auto-sweep on launch.

## User decisions (locked)

- **Retention:** 30 days, sweep on app launch. User-configurable in Configuration → Recordings (off / 7 / 30 / 90).
- **Onboarding:** No dedicated step. Feature is only surfaced in Configuration panel.

## Architecture

### Storage location

```
~/Library/Application Support/com.ultravox.dev/recordings/<historyEntryId>.<ext>
```

One file per `HistoryEntry`, named by its existing UUID. Lives next to `whisper-models/` and `llm-models/` so all user data sits under one bundle id. `.<ext>` is whatever MediaRecorder produced (`mp4` on macOS WKWebView, `webm` elsewhere) — no re-encoding.

### Schema changes

`HistoryEntry` (`store-bridge.ts`) gains:

```ts
interface HistoryEntry {
  id: string;
  ts: number;
  modeId: string;
  bundleId: string | null;
  text: string;
  audioPath?: string;     // absolute path on disk; absent = no audio saved
  audioFormat?: string;   // mime type for <audio> playback ("audio/mp4")
  audioBytes?: number;    // for the History panel size display
}
```

`AppSettings` gains a new top-level group:

```ts
interface AppSettings {
  ...
  recordings: {
    saveLocal: boolean;            // default false
    retentionDays: 0 | 7 | 30 | 90; // 0 = never auto-delete; default 30
  };
}
```

`DEFAULT_SETTINGS.recordings = { saveLocal: false, retentionDays: 30 }`.

### Tauri commands (Rust side)

```rust
// recordings.rs
#[tauri::command]
pub fn save_recording_audio(entry_id: String, ext: String, bytes: Vec<u8>) -> Result<String, String>;
//   → writes to <data_dir>/recordings/<entry_id>.<ext>, returns absolute path

#[tauri::command]
pub fn delete_recording_audio(entry_id: String) -> Result<(), String>;
//   → removes <entry_id>.* from recordings dir; idempotent (no-op if absent)

#[tauri::command]
pub fn read_recording_audio(entry_id: String, ext: String) -> Result<Vec<u8>, String>;
//   → for re-transcribe + replay-via-blob

#[tauri::command]
pub fn list_recording_files() -> Result<Vec<RecordingFile>, String>;
//   → enumerates the recordings dir, returns [{ id, ext, sizeBytes, mtimeMs }]
//     used by the retention sweep + "Delete all" + size accounting

#[tauri::command]
pub fn open_recordings_folder() -> Result<(), String>;
//   → Finder reveal of the recordings dir
```

### Frontend wiring

- `appendHistory(entry, audioBlob?)` in `store-bridge.ts` — when `settings.recordings.saveLocal` is true AND `audioBlob` is provided, blob is read via `arrayBuffer()` then written via `save_recording_audio`. The returned path is stored on the new entry's `audioPath`. When false, `audioBlob` is dropped.
- `PillWindow.stopAndTranscribe` — already has the blob from `recorder.stop()`; passes it through to `appendHistory`.
- Retention sweep: `purgeStaleRecordings()` in `store-bridge.ts`, called once on settings load when recordings.saveLocal is true. Uses `list_recording_files` + `delete_recording_audio` for orphans (no matching history entry) and entries older than retention threshold.
- Re-transcribe path: `HistoryPanel` "Re-transcribe" button reads bytes via `read_recording_audio`, re-runs through the `transcribe()` function in `transcribe.ts` with the current active mode's settings, replaces the entry's text in place.

### UI surfaces

#### 1. Configuration panel → new "Recordings" Section

Lives between "Permissions" and "Transcription". Layout:

```
RECORDINGS
┌─────────────────────────────────────────────────────────────┐
│ Save audio recordings locally       [toggle  ●─────○]       │
│ Audio is stored at ~/.../recordings/, never uploaded        │
│ except for the original transcription request.              │
├─────────────────────────────────────────────────────────────┤
│ Auto-delete after        [Off ▾] / [7 days] / [30 days] / [90 days] │
├─────────────────────────────────────────────────────────────┤
│ Disk usage:  3.4 MB across 12 recordings                    │
├─────────────────────────────────────────────────────────────┤
│ [ Open recordings folder ]   [ Delete all saved audio ]     │
└─────────────────────────────────────────────────────────────┘
```

Section is collapsible; collapsed by default for new users to keep Configuration uncluttered. The retention dropdown reuses the existing dropdown styling (matches the cleanup-style picker).

#### 2. History panel

Each entry that has `audioPath`:

- Native `<audio controls>` element above the text snippet (~28 px tall, full width)
- Below: existing "Copy" button + new "Re-transcribe" button + new "Delete audio" button
- Entries without audio render unchanged

The replay loads the file via `read_recording_audio` and constructs a Blob URL. URL is revoked on row unmount.

#### 3. Onboarding

No new step. Feature discoverable only in Configuration panel after onboarding completes.

## Privacy posture

1. **Default OFF.** Nothing is written to disk unless the user explicitly opts in.
2. **Local only.** Files never leave the machine except via the existing transcription request (which already sends the audio for the original recording).
3. **Auto-cleanup.** 30-day default keeps the recordings dir bounded.
4. **Visible disk usage.** Configuration panel always shows current size and count.
5. **One-click clear.** "Delete all saved audio" is destructive and shown with confirm-tap pattern matching the existing reset-settings UX.

## Test plan

### Automated (vitest)

- `appendHistory(entry, blob)` with `recordings.saveLocal: true` calls `save_recording_audio` and stores `audioPath`
- `appendHistory(entry, blob)` with `recordings.saveLocal: false` does NOT call `save_recording_audio`; `audioPath` remains undefined
- `appendHistory(entry, undefined)` is a no-op for audio (no command call)
- Retention sweep: orphaned files (no matching entry) are deleted
- Retention sweep: files older than `retentionDays` are deleted
- `retentionDays: 0` disables sweep (no deletions)
- `delete_recording_audio` for missing file resolves OK (idempotent)

### Rust (cargo test)

- `save_recording_audio` writes to expected path
- `read_recording_audio` round-trips bytes
- `list_recording_files` returns correct metadata
- `delete_recording_audio` is idempotent

### Manual (post-DMG)

- Record with toggle off → no file written
- Record with toggle on → file at expected path
- History panel shows audio player; click play → audio plays
- Re-transcribe → new transcription produces same text (assuming same mode)
- Toggle off → next recording has no file; previous saved files remain
- "Delete all" clears the dir; size readout updates to "0 MB"

## Out of scope

- iCloud sync / cloud backup
- Audio export to other formats (user can navigate Finder if they want)
- Encryption at rest (rely on FileVault)
- Per-mode toggle (saveLocal is global)
- Sharing / "Open with…" beyond Finder reveal
- Mobile / Windows / Linux audio dirs (this is a macOS-only app)

## Files affected

### New
- `apps/ultravox/src-tauri/src/recordings.rs` (Rust commands)
- `apps/ultravox/src/lib/recordings.ts` (frontend bridge + retention sweep)
- `apps/ultravox/src/tests/recordings.test.ts` (vitest)

### Modified
- `apps/ultravox/src-tauri/src/lib.rs` (register the new mod + commands)
- `apps/ultravox/src/lib/store-bridge.ts` (HistoryEntry + AppSettings.recordings, appendHistory signature)
- `apps/ultravox/src/lib/tauri-bridge.ts` (TS bindings for the new commands)
- `apps/ultravox/src/panels/ConfigurationPanel.tsx` (new Recordings section)
- `apps/ultravox/src/panels/HistoryPanel.tsx` (audio player + re-transcribe + delete-audio buttons)
- `apps/ultravox/src/windows/PillWindow.tsx` (pass blob through to appendHistory)
- `CLAUDE.md` (one-paragraph note on the feature + the recordings dir path)

## Self-review

- [x] No placeholders / TBDs in this spec
- [x] Schema changes are explicit
- [x] All commands have signatures
- [x] User decisions integrated (30-day default, no onboarding step)
- [x] Test plan covers automated + manual
- [x] Out-of-scope list keeps the implementation focused
