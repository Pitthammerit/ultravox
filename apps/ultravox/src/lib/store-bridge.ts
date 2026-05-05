import { LazyStore } from "@tauri-apps/plugin-store";
import { DEFAULT_MODES, type VoiceMode } from "./voiceModes";

export interface VocabularyEntry {
  input: string;
  replace: string;
}

export interface SoundSettings {
  /** getUserMedia constraint — let the browser auto-adjust mic level. */
  autoGain: boolean;
  /** Trim silent passages before upload. v1.1 — currently no-op. */
  silenceRemoval: boolean;
  /** Play a brief tone when recording starts and stops. */
  chime: boolean;
  /** 0..100 — chime volume. */
  chimeVolume: number;
}

export interface HistoryEntry {
  id: string;
  /** Unix ms timestamp when transcription completed. */
  ts: number;
  modeId: string;
  /** Bundle id of the focused app at the moment of recording. */
  bundleId: string | null;
  text: string;
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
  /** Sound + microphone preferences. */
  sound: SoundSettings;
  /** Recent transcription history (capped at HISTORY_MAX). */
  history: HistoryEntry[];
}

export const HISTORY_MAX = 50;

export const DEFAULT_SETTINGS: AppSettings = {
  hotkeyRecord: "Cmd+Shift+;",
  hotkeyModeOverlay: "Alt+Shift+K",
  activeModeId: "note",
  modes: DEFAULT_MODES,
  vocabulary: [],
  theme: "auto",
  recordingStyle: "toggle",
  onboardingComplete: false,
  sound: {
    autoGain: true,
    silenceRemoval: false,
    chime: false,
    chimeVolume: 50,
  },
  history: [],
};

const STORE_FILE = "settings.json";
const SETTINGS_KEY = "settings";

let storeInstance: LazyStore | null = null;

function getStore(): LazyStore {
  storeInstance ??= new LazyStore(STORE_FILE);
  return storeInstance;
}

/**
 * Merge stored partial settings with DEFAULT_SETTINGS. Deep-merge for nested
 * objects (sound) so older saves missing newer fields still produce a valid
 * AppSettings without nuking user-set values.
 */
function mergeWithDefaults(stored: Partial<AppSettings> | null | undefined): AppSettings {
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    sound: { ...DEFAULT_SETTINGS.sound, ...(stored.sound ?? {}) },
    modes: stored.modes ?? DEFAULT_SETTINGS.modes,
    vocabulary: stored.vocabulary ?? [],
    history: stored.history ?? [],
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const store = getStore();
  const stored = await store.get<Partial<AppSettings>>(SETTINGS_KEY);
  return mergeWithDefaults(stored ?? null);
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

/**
 * Append a transcription to history, capping at HISTORY_MAX (newest first).
 * Race-safe: re-reads settings before writing.
 */
export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const current = await loadSettings();
  const next = [entry, ...current.history].slice(0, HISTORY_MAX);
  await saveSettings({ ...current, history: next });
}

export async function clearHistory(): Promise<void> {
  const current = await loadSettings();
  await saveSettings({ ...current, history: [] });
}

export async function resetSettings(): Promise<void> {
  await saveSettings(DEFAULT_SETTINGS);
}
