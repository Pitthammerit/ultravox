/// Secure secret storage backed by macOS Keychain via the `keyring` crate.
///
/// Used for the user's BYO OpenRouter API key (Configuration → API Keys).
/// The key is written to the user's login keychain so it survives reinstalls,
/// is encrypted at rest by macOS, and never lives inside the app's settings
/// store (which is plain JSON on disk and would be readable by anything
/// with file-system access).
///
/// Service name is namespaced by build profile so dev + release don't share
/// keychain entries — flipping between `pnpm tauri dev` and an installed
/// release DMG mirrors the same separation we already do for the
/// settings.json bundle id.
use keyring::{Entry, Error as KeyringError};

#[cfg(debug_assertions)]
const SERVICE: &str = "com.ultravox.dev.keys";
#[cfg(not(debug_assertions))]
const SERVICE: &str = "com.ultravox.app.keys";

fn entry_for(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("keyring entry init failed: {e}"))
}

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    let entry = entry_for(&key)?;
    entry
        .set_password(&value)
        .map_err(|e| format!("keychain write failed: {e}"))
}

#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    let entry = entry_for(&key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    let entry = entry_for(&key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Idempotent: deleting a non-existent entry is success — callers
        // (e.g. the "Remove" button in Configuration) shouldn't have to
        // pre-check existence.
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

#[tauri::command]
pub fn secure_store_has(key: String) -> Result<bool, String> {
    let entry = entry_for(&key)?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(e) => Err(format!("keychain probe failed: {e}")),
    }
}
