import { LazyStore } from "@tauri-apps/plugin-store";
import { DEFAULT_MODES, type VoiceMode } from "./voiceModes";

export interface VocabularyEntry {
  input: string;
  replace: string;
}

export interface AppSettings {
  /** Hotkey for record toggle (Tauri shortcut format). */
  hotkeyRecord: string;
  /** Hotkey for mode-switcher overlay. */
  hotkeyModeOverlay: string;
  /** Default voice mode id. */
  activeModeId: string;
  /** All saved voice modes. */
  modes: VoiceMode[];
  /** Vocabulary find/replace pairs. */
  vocabulary: VocabularyEntry[];
  /** Theme choice: 'auto' | 'light' | 'dark-ocean' | 'dark-night'. */
  theme: "auto" | "light" | "dark-ocean" | "dark-night";
  /** Push-to-talk vs toggle. */
  recordingStyle: "toggle" | "push-to-talk";
  /** Onboarding seen flag — gates the first-run wizard. */
  onboardingComplete: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkeyRecord: "Cmd+Shift+;",
  hotkeyModeOverlay: "Alt+Shift+K",
  activeModeId: "note",
  modes: DEFAULT_MODES,
  vocabulary: [],
  theme: "auto",
  recordingStyle: "toggle",
  onboardingComplete: false,
};

const STORE_FILE = "settings.json";
const SETTINGS_KEY = "settings";

let storeInstance: LazyStore | null = null;

function getStore(): LazyStore {
  storeInstance ??= new LazyStore(STORE_FILE);
  return storeInstance;
}

export async function loadSettings(): Promise<AppSettings> {
  const store = getStore();
  const stored = await store.get<Partial<AppSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = getStore();
  await store.set(SETTINGS_KEY, settings);
  await store.save();
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}
