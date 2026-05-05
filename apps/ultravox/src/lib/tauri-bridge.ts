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
