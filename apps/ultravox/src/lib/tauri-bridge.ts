import { invoke } from "@tauri-apps/api/core";

/**
 * Dev: start the CF Voice Worker locally with `wrangler dev` (port 8787).
 * Prod: VITE_WORKER_URL is set in `.env.production` to the deployed Worker.
 */
export const TOKEN_ENDPOINT = import.meta.env["VITE_WORKER_URL"]
  ? `${import.meta.env["VITE_WORKER_URL"]}/api/voice/token`
  : "http://localhost:8787/api/voice/token";

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
