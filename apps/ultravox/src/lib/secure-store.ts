/**
 * macOS Keychain wrappers — backs the BYO OpenRouter key flow added in v0.19.0.
 *
 * Storage lives in the user's login keychain (service name namespaced by build
 * profile in `secure_store.rs`), never in the app's `settings.json` blob. The
 * key is fetched on demand at cleanup time and is NOT mirrored into React
 * state — UI only ever shows masked input and a "Saved" badge derived from
 * `secureStoreHas`. That way a memory dump of the renderer can't surface the
 * key, and the AI assistant the app talks to can't read it back from the
 * settings store either.
 */

import { invoke } from "@tauri-apps/api/core";

export async function secureStoreSet(key: string, value: string): Promise<void> {
  await invoke("secure_store_set", { key, value });
}

export async function secureStoreGet(key: string): Promise<string | null> {
  return (await invoke<string | null>("secure_store_get", { key })) ?? null;
}

export async function secureStoreDelete(key: string): Promise<void> {
  await invoke("secure_store_delete", { key });
}

export async function secureStoreHas(key: string): Promise<boolean> {
  return (await invoke<boolean>("secure_store_has", { key })) ?? false;
}

/** Canonical keychain entry name for the user's OpenRouter API key. */
export const KEY_OPENROUTER_API = "openrouter_api_key";
