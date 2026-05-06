import { invoke } from "@tauri-apps/api/core";

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

export async function mediaPause(): Promise<void> {
  await invoke("media_pause");
}

export async function mediaResume(): Promise<void> {
  await invoke("media_resume");
}
