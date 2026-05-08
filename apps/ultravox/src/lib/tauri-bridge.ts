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

export async function pasteToFrontmost(text: string): Promise<void> {
  await invoke("paste_to_frontmost", { text });
}

export interface FrontmostApp {
  bundle_id: string | null;
  localized_name: string | null;
}

export async function getFrontmostApp(): Promise<FrontmostApp | null> {
  try {
    return await invoke<FrontmostApp>("get_frontmost_app");
  } catch {
    return null;
  }
}

export async function registerHotkeys(record: string, modeOverlay: string): Promise<void> {
  await invoke("ultravox_register_hotkeys", { record, modeOverlay });
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

export async function mediaPause(): Promise<void> {
  await invoke("media_pause");
}

export async function mediaResume(): Promise<void> {
  await invoke("media_resume");
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
 *  to whichever model is on disk. */
export async function localWhisperStatus(preferredVariant?: string): Promise<LocalWhisperStatus> {
  return invoke<LocalWhisperStatus>("local_whisper_status", { preferredVariant: preferredVariant ?? null });
}

/** Run on-device Whisper transcription. Throws if the model isn't loaded
 *  or if decoding/transcription fails — caller should fall back to cloud. */
export async function localWhisperTranscribe(audioBytes: Uint8Array, language: string | null, preferredVariant?: string): Promise<string> {
  return invoke<string>("local_whisper_transcribe", { audioBytes: Array.from(audioBytes), language, preferredVariant: preferredVariant ?? null });
}

/** Trigger model download for a given variant. Variants: "tiny" | "base" | "small" | "large-v3-turbo". */
export async function localWhisperDownloadModel(variant: string): Promise<void> {
  await invoke("local_whisper_download_model", { variant });
}

export interface LocalWhisperModelInfo {
  variant: string;
  sizeBytes: number;
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
