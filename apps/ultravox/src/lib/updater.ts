import { check } from "@tauri-apps/plugin-updater";

export interface UpdateInfo {
  version: string;
  body: string | null;
  download: () => Promise<void>;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      body: update.body ?? null,
      download: () => update.downloadAndInstall(),
    };
  } catch {
    // Silently swallow — no network, placeholder pubkey, or dev build
    return null;
  }
}
