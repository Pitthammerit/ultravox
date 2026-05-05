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
