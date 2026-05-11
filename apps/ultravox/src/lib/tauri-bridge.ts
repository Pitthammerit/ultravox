import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Defaults to the deployed worker (which is always reachable).
 * Set `VITE_WORKER_URL=http://localhost:8787` to override during local
 * worker development with `wrangler dev`.
 */
const DEFAULT_WORKER_URL = "https://ultravox-voice-worker.journey-within.workers.dev";
const WORKER_BASE = import.meta.env["VITE_WORKER_URL"] ?? DEFAULT_WORKER_URL;
export const TOKEN_ENDPOINT = `${WORKER_BASE}/api/voice/token`;

/**
 * Paste `text` into the frontmost app via Cmd+V. When `pid` is provided
 * (the PID of the app that was frontmost when the user fired the record
 * hotkey), the Rust side re-activates that app before pasting — so even
 * if focus moved during the recording session, the transcript still lands
 * in the originally-targeted text field.
 */
export interface PasteDiagnostics {
  /** True if the captured target_pid matched Ultravox's own process id and
   * was discarded (we don't re-activate ourselves — that would cause the
   * paste to land in our own Settings window). */
  targetWasSelf: boolean;
  /** Bundle id of the app that was actually frontmost immediately before
   * Cmd+V was dispatched. Compare against the captured frontmost-at-record
   * bundle id to verify the deactivate + activate sequence reached the
   * intended target. */
  frontmostAtPaste: string | null;
}

export async function pasteToFrontmost(text: string, pid?: number): Promise<PasteDiagnostics> {
  const raw = await invoke<{ target_was_self: boolean; frontmost_at_paste: string | null }>(
    "paste_to_frontmost",
    { text, targetPid: pid ?? null },
  );
  return {
    targetWasSelf: raw.target_was_self,
    frontmostAtPaste: raw.frontmost_at_paste,
  };
}

/**
 * Write text to the system clipboard via the Rust clipboard plugin.
 * Use instead of `navigator.clipboard.writeText` when the call is
 * triggered without an in-WebView user gesture (e.g. tray-menu clicks),
 * since WKWebView's clipboard policy requires recent user activation in
 * the DOM — which AppKit menu clicks don't propagate.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await invoke("copy_to_clipboard", { text });
}

export interface FrontmostApp {
  bundle_id: string | null;
  localized_name: string | null;
  pid: number;
}

export async function getFrontmostApp(): Promise<FrontmostApp | null> {
  try {
    return await invoke<FrontmostApp>("get_frontmost_app");
  } catch {
    return null;
  }
}

/**
 * Re-register every global hotkey atomically. The Rust side wipes any
 * previously-registered shortcuts and binds whichever recording shortcut
 * matches `recordingStyle` ("toggle" → `record`, "push-to-talk" → `ptt`)
 * along with the always-on mode-overlay shortcut. The two recording
 * shortcuts are mutually exclusive — only one is bound at a time.
 */
export async function registerHotkeys(
  record: string,
  modeOverlay: string,
  ptt: string,
  recordingStyle: "toggle" | "push-to-talk",
): Promise<void> {
  await invoke("ultravox_register_hotkeys", {
    record,
    modeOverlay,
    ptt,
    recordingStyle,
  });
}

/** Returns true if the app already has Accessibility permission. */
export async function checkAccessibilityPermission(): Promise<boolean> {
  return invoke<boolean>("check_accessibility_permission");
}

/**
 * Triggers the macOS "wants to control this computer" system dialog.
 * Adds the app to the Accessibility list in System Settings if not yet present.
 * Returns true if access was already granted before the call.
 */
export async function requestAccessibilityPermission(): Promise<boolean> {
  return invoke<boolean>("request_accessibility_permission");
}

export async function setPillHeight(height: number): Promise<void> {
  await invoke("set_pill_height", { height });
}

export async function setPillSize(width: number, height: number): Promise<void> {
  await invoke("set_pill_size", { width, height });
}

export async function setPillPositionTopCenter(width: number, height: number): Promise<void> {
  await invoke("set_pill_position_top_center", { width, height });
}

export async function setPillSizeAtPosition(width: number, height: number, x: number, y: number): Promise<void> {
  await invoke("set_pill_size_at_position", { width, height, x, y });
}

export interface TrayMicDevice { id: string; label: string; }

/**
 * Push the current list of audio input devices into the tray's
 * "Microphone Settings" submenu. selectedId === null means "system default".
 */
export async function updateMicSubmenu(devices: TrayMicDevice[], selectedId: string | null): Promise<void> {
  await invoke("update_mic_submenu", { devices, selectedId });
}

export interface TrayModeEntry { id: string; label: string; }

/**
 * Push the current settings.modes list into the tray's "Mode" submenu.
 * `activeId` controls which row gets the ✓ checkmark. Called on settings
 * load and on every modes / activeModeId change so the tray reflects the
 * user's actual mode list (custom names and all), not a hardcoded set.
 */
export async function updateModeSubmenu(modes: TrayModeEntry[], activeId: string | null): Promise<void> {
  await invoke("update_mode_submenu", { modes, activeId });
}

export async function mediaPause(): Promise<void> {
  await invoke("media_pause");
}

export async function mediaResume(): Promise<void> {
  await invoke("media_resume");
}

/** Lower Music/Spotify volume by `percent` (0–100). Saves the original
 *  volume per-app so mediaUnduck restores exactly. Idempotent. */
export async function mediaDuck(percent: number): Promise<void> {
  await invoke("media_duck", { percent });
}

/** Restore Music/Spotify to their original volumes. No-op if nothing
 *  was ducked. */
export async function mediaUnduck(): Promise<void> {
  await invoke("media_unduck");
}

/** Returns the macOS preferred language as a 2-letter code ("en", "de", ...). */
export async function getSystemLanguage(): Promise<string> {
  return invoke<string>("get_system_language");
}

/**
 * Open System Settings → Privacy & Security → category. Used to recover
 * when the user denied a permission — once denied, macOS won't re-prompt,
 * the user has to flip the toggle in Settings.
 */
export async function openPrivacySettings(category: "microphone" | "accessibility"): Promise<void> {
  await invoke("open_privacy_settings", { category });
}

export async function setTrafficLightsVisible(visible: boolean): Promise<void> {
  await invoke("set_traffic_lights_visible", { visible });
}

/** Unregister every global hotkey. Used during onboarding so that the
 *  moment the user types a key combo into the HotkeyRecorder, the global
 *  hotkey doesn't ALSO fire and start a recording. */
export async function unregisterAllHotkeys(): Promise<void> {
  await invoke("unregister_all_hotkeys");
}

/* ───────── Claude Code (local CLI fallback) ───────── */

export interface ClaudeCodeStatus {
  available: boolean;
  path: string | null;
  version: string | null;
}

/** Probe whether the user has the Anthropic Claude Code CLI installed
 *  locally, so transcribe.ts can route LLM cleanup through it instead of
 *  the managed worker. Returns availability + version, no auth check. */
export async function claudeCodeCheck(): Promise<ClaudeCodeStatus> {
  return invoke<ClaudeCodeStatus>("claude_code_check");
}

/** Run the Claude Code CLI with a one-shot prompt. Returns the model's
 *  stdout. Throws if the CLI is missing, not authenticated, or times out. */
export async function claudeCodeCleanup(prompt: string, model?: string): Promise<string> {
  return invoke<string>("claude_code_cleanup", { prompt, model: model ?? null });
}

/* ───────── Local Whisper (on-device whisper-rs + Metal) ───────── */

export interface LocalWhisperStatus {
  /** True if a model is loaded and ready. */
  available: boolean;
  modelPath: string | null;
  /** e.g. "ggml-base.en.bin" */
  modelVariant: string | null;
}

/** Probe whether the on-device Whisper model is downloaded and ready.
 *  Pass preferredVariant to use a specific model if installed; falls back
 *  to whichever model is on disk. Pass language to enable smart auto-routing
 *  (e.g. prefer base.en for English). */
export async function localWhisperStatus(preferredVariant?: string, language?: string, audioQuality?: "low" | "normal"): Promise<LocalWhisperStatus> {
  return invoke<LocalWhisperStatus>("local_whisper_status", {
    preferredVariant: preferredVariant ?? null,
    language: language ?? null,
    audioQuality: audioQuality ?? null,
  });
}

/** Run on-device Whisper transcription. Throws if the model isn't loaded
 *  or if decoding/transcription fails — caller should fall back to cloud. */
export async function localWhisperTranscribe(audioBytes: Uint8Array, language: string | null, preferredVariant?: string, routingLanguage?: string, audioQuality?: "low" | "normal"): Promise<string> {
  return invoke<string>("local_whisper_transcribe", {
    audioBytes: Array.from(audioBytes),
    language,
    preferredVariant: preferredVariant ?? null,
    routingLanguage: routingLanguage ?? null,
    audioQuality: audioQuality ?? null,
  });
}

/** Trigger model download for a given variant. Variants: "tiny" | "base" | "small" | "large-v3-turbo". */
export async function localWhisperDownloadModel(variant: string): Promise<void> {
  await invoke("local_whisper_download_model", { variant });
}

export interface LocalWhisperModelInfo {
  variant: string;
  sizeBytes: number;
  /** True when the paired CoreML encoder bundle is installed alongside the
   *  .bin file. Surfaced in the Configuration panel as an "ANE" badge so
   *  users can see at a glance which models route through Apple's Neural
   *  Engine (faster) vs Metal-only (still fast, but CPU/GPU). */
  coremlInstalled: boolean;
}

export async function localWhisperListModels(): Promise<LocalWhisperModelInfo[]> {
  return invoke<LocalWhisperModelInfo[]>("local_whisper_list_models");
}

export async function localWhisperDeleteModel(variant: string): Promise<void> {
  await invoke("local_whisper_delete_model", { variant });
}

export interface LocalWhisperDownloadProgress {
  variant: string;
  downloaded: number;
  total: number;
  percent: number;
}

export interface LocalWhisperDownloadComplete {
  variant: string;
  modelPath: string;
}

export interface LocalWhisperDownloadError {
  variant: string;
  error: string;
}

export function subscribeToDownloadProgress(handler: (p: LocalWhisperDownloadProgress) => void): Promise<UnlistenFn> {
  return listen<LocalWhisperDownloadProgress>("local_whisper:download-progress", (e) => handler(e.payload));
}

export function subscribeToDownloadComplete(handler: (p: LocalWhisperDownloadComplete) => void): Promise<UnlistenFn> {
  return listen<LocalWhisperDownloadComplete>("local_whisper:download-complete", (e) => handler(e.payload));
}

export function subscribeToDownloadError(handler: (p: LocalWhisperDownloadError) => void): Promise<UnlistenFn> {
  return listen<LocalWhisperDownloadError>("local_whisper:download-error", (e) => handler(e.payload));
}

/* ───────── Local LLM (on-device llama.cpp + Metal) ───────── */

export interface LocalLlmStatus {
  /** True if a model is loaded and ready. */
  available: boolean;
  modelPath: string | null;
  /** e.g. "phi-3.5", "qwen2.5-3b", "mistral-7b" */
  modelVariant: string | null;
}

export interface LocalLlmModelInfo {
  variant: string;
  sizeBytes: number;
}

/** Probe whether an on-device LLM model is downloaded and ready. */
export async function localLlmStatus(preferredVariant?: string): Promise<LocalLlmStatus> {
  return invoke<LocalLlmStatus>("local_llm_status", {
    preferredVariant: preferredVariant ?? null,
  });
}

/** Run on-device LLM cleanup. Throws if the model isn't loaded or inference fails. */
export async function localLlmCleanup(prompt: string, preferredVariant?: string): Promise<string> {
  return invoke<string>("local_llm_cleanup", {
    prompt,
    preferredVariant: preferredVariant ?? null,
  });
}

/** Trigger model download for a given variant. Variants: "phi-3.5" | "qwen2.5-3b" | "mistral-7b". */
export async function localLlmDownloadModel(variant: string): Promise<void> {
  await invoke("local_llm_download_model", { variant });
}

export async function localLlmDeleteModel(variant: string): Promise<void> {
  await invoke("local_llm_delete_model", { variant });
}

export async function localLlmListModels(): Promise<LocalLlmModelInfo[]> {
  return invoke<LocalLlmModelInfo[]>("local_llm_list_models");
}

export interface LocalLlmDownloadProgress {
  variant: string;
  downloaded: number;
  total: number;
  percent: number;
}

export interface LocalLlmDownloadComplete {
  variant: string;
  modelPath: string;
}

export interface LocalLlmDownloadError {
  variant: string;
  error: string;
}

export function subscribeToLlmDownloadProgress(handler: (p: LocalLlmDownloadProgress) => void): Promise<UnlistenFn> {
  return listen<LocalLlmDownloadProgress>("local_llm:download-progress", (e) => handler(e.payload));
}

export function subscribeToLlmDownloadComplete(handler: (p: LocalLlmDownloadComplete) => void): Promise<UnlistenFn> {
  return listen<LocalLlmDownloadComplete>("local_llm:download-complete", (e) => handler(e.payload));
}

export function subscribeToLlmDownloadError(handler: (p: LocalLlmDownloadError) => void): Promise<UnlistenFn> {
  return listen<LocalLlmDownloadError>("local_llm:download-error", (e) => handler(e.payload));
}

/* ─── Local audio recording storage ──────────────────────────────────
 *
 * Wrappers for src-tauri/src/recordings.rs. These persist Whisper audio
 * blobs to ~/Library/Application Support/com.ultravox.dev/recordings/
 * when the user opts into settings.recordings.saveLocal.
 */

export interface RecordingFile {
  /** HistoryEntry UUID (filename stem). */
  id: string;
  /** Extension without the leading dot ("mp4", "webm", "wav"). */
  ext: string;
  sizeBytes: number;
  /** Last-modified time, unix milliseconds. */
  mtimeMs: number;
}

/**
 * Persist a recording's audio bytes to disk, named by the HistoryEntry UUID.
 * Returns the absolute path. Overwrites any prior file at that path. The
 * Rust side writes via a `.part` tmp file + atomic rename so a crashed
 * write doesn't leave a half-file.
 *
 * `folder`: optional user-chosen recordings directory. When undefined,
 * Rust falls back to ~/Documents/Ultravox Recordings/.
 */
export async function saveRecordingAudio(
  entryId: string,
  ext: string,
  bytes: Uint8Array,
  folder?: string,
): Promise<string> {
  return invoke<string>("save_recording_audio", {
    entryId,
    ext,
    bytes: Array.from(bytes),
    folder: folder ?? null,
  });
}

/** Idempotent — no error if no file matches. Removes ANY extension matching
 *  the entry id, so callers don't have to remember the container format.
 *  `folder` defaults to the same per-user setting as save. */
export async function deleteRecordingAudio(entryId: string, folder?: string): Promise<void> {
  await invoke("delete_recording_audio", { entryId, folder: folder ?? null });
}

/** Read the bytes back for replay or re-transcribe. Caller wraps in a Blob
 *  with the entry's stored mime type to pass through MediaRecorder /
 *  transcribe.ts. */
export async function readRecordingAudio(
  entryId: string,
  ext: string,
  folder?: string,
): Promise<Uint8Array> {
  const arr = await invoke<number[]>("read_recording_audio", {
    entryId,
    ext,
    folder: folder ?? null,
  });
  return new Uint8Array(arr);
}

/** Enumerate every file in the recordings/ dir. Used by the Configuration
 *  panel disk-usage readout AND the retention sweep that runs on app launch. */
export async function listRecordingFiles(folder?: string): Promise<RecordingFile[]> {
  return invoke<RecordingFile[]>("list_recording_files", { folder: folder ?? null });
}

/** Reveal the recordings/ directory in Finder. */
export async function openRecordingsFolder(folder?: string): Promise<void> {
  await invoke("open_recordings_folder", { folder: folder ?? null });
}

/** Return the default recordings folder (~/Documents/Ultravox Recordings/)
 *  for display in Configuration → Recordings → "Folder" row. */
export async function recordingsDefaultFolder(): Promise<string> {
  return invoke<string>("recordings_default_folder");
}

/** Open the native macOS folder picker. Returns the picked absolute path,
 *  or null if the user cancelled. Implemented via osascript on the Rust
 *  side so no extra Tauri plugin is required. */
export async function chooseRecordingsFolder(): Promise<string | null> {
  return invoke<string | null>("choose_recordings_folder");
}
