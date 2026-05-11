import appsJson from "./apps.json";
import type { VoiceMode } from "./voiceModes";

interface AppEntry {
  bundleId: string;
  preferredMode: string;
  displayName: string;
}

interface AppsRegistry {
  version: number;
  apps: AppEntry[];
}

const registry: AppsRegistry = appsJson as AppsRegistry;

const byBundle: Map<string, AppEntry> = new Map(
  registry.apps.map((a) => [a.bundleId.toLowerCase(), a]),
);

/**
 * Pick the best mode for a given frontmost-app bundle id.
 * Falls back to the user's `activeModeId` when no entry matches.
 */
export function pickAutoMode(
  bundleId: string | null | undefined,
  modes: VoiceMode[],
  fallbackId: string,
): VoiceMode {
  if (bundleId) {
    const entry = byBundle.get(bundleId.toLowerCase());
    if (entry) {
      const m = modes.find((mm) => mm.id === entry.preferredMode);
      if (m) return m;
    }
  }
  const fallback = modes.find((m) => m.id === fallbackId);
  return fallback ?? modes[0]!;
}

export function getRegistryEntry(bundleId: string | null | undefined): AppEntry | null {
  if (!bundleId) return null;
  return byBundle.get(bundleId.toLowerCase()) ?? null;
}

/**
 * Pick the mode for a single recording, gated on the user's opt-in setting.
 *
 * v0.19.0: when `autoModeEnabled` is true, iterate `modes` in order and
 * return the first mode whose `autoModeApps` includes the frontmost
 * bundle ID (case-insensitive). Mode order is user-controlled via
 * the drag handle in ModesPanel, so ties resolve deterministically.
 * Falls back to `activeModeId` when no mode matches or no bundle is
 * available. When `autoModeEnabled` is false, `activeModeId` always
 * wins.
 *
 * Previously (v0.18.8) this called `pickAutoMode` which used the
 * static `apps.json` registry. v0.19.0 turns `apps.json` into seed-
 * only data (copied into per-mode `autoModeApps` lists once on first
 * launch via `migrateSeedAutoModeApps` in store-bridge.ts), so
 * `pickAutoMode` is no longer called at record time. It stays
 * exported because the seed migration imports it.
 */
export function selectModeForRecording(
  modes: VoiceMode[],
  activeModeId: string,
  frontmostBundleId: string | null | undefined,
  autoModeEnabled: boolean,
): VoiceMode {
  if (autoModeEnabled && frontmostBundleId) {
    const bid = frontmostBundleId.toLowerCase();
    const matched = modes.find((m) =>
      m.autoModeApps?.some((entry) => entry.bundleId.toLowerCase() === bid),
    );
    if (matched) return matched;
  }
  return modes.find((m) => m.id === activeModeId) ?? modes[0]!;
}
