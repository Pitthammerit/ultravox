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
  /** Noise suppression — reduce background noise (mild quality tradeoff). */
  noiseSuppression: boolean;
  /** Pause Music and Spotify when a recording starts; resume when it stops. */
  pauseMediaWhileRecording: boolean;
  /** Start every recording in compact (minimal) pill mode. */
  compactPill: boolean;
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
  /** UI language preference (chosen during onboarding). */
  uiLanguage: "en" | "de";
  /** Legacy single-field display name. v0.9.16+ stores firstName/lastName
   *  separately; mergeWithDefaults migrates this on load. Retained in the
   *  interface so older saves still parse without errors. */
  userName?: string;
  /** First name — used as default in greetings/sign-offs (e.g. "Cheers, Ben"). */
  firstName?: string;
  /** Last name — available via {{lastName}} / {{fullName}} for custom prompts. */
  lastName?: string;
  /** Push-to-talk vs toggle. */
  recordingStyle: "toggle" | "push-to-talk";
  /** Onboarding seen flag — gates the first-run wizard. */
  onboardingComplete: boolean;
  /** Last step the user was on in the onboarding wizard (0..TOTAL-1).
   *  Persisted on every step change so a permission-induced app restart
   *  resumes where the user left off instead of wiping their entries. */
  onboardingStep?: number;
  /** Sound + microphone preferences. */
  sound: SoundSettings;
  /** Saved expanded-pill position (LogicalPosition, screen coords). Used to
   *  restore where the pill was before the user collapsed it to the top-center
   *  compact state. */
  pillExpandedPosition?: { x: number; y: number };
  /** Last dragged compact-pill position (LogicalPosition). Saved on every
   *  mouseup after a compact-pill drag so the pill reopens where the user
   *  left it instead of always defaulting to top-center. */
  pillCompactPosition?: { x: number; y: number };
  /**
   * Recording-window appearance:
   *   "classic" — full pill with waveform + footer hints
   *   "mini"    — compact dots-only pill at top-center
   *   "none"    — no pill window shown during recording (silent mode)
   * Migrated from the legacy `sound.compactPill` boolean on first load.
   */
  pillStyle?: "classic" | "mini" | "none";
  /** Selected mic input device id (from navigator.mediaDevices.enumerateDevices).
   *  null/undefined = system default. Settable from the tray's Microphone
   *  Settings submenu. */
  selectedMicDeviceId?: string | null;
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
  uiLanguage: "en",
  recordingStyle: "toggle",
  onboardingComplete: false,
  pillStyle: "classic",
  sound: {
    autoGain: true,
    silenceRemoval: false,
    chime: false,
    chimeVolume: 50,
    noiseSuppression: true,
    pauseMediaWhileRecording: false,
    compactPill: false,
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
 * Migrate model IDs that don't exist on OpenRouter to the equivalents that do.
 * Older builds wrote anthropic/claude-haiku-4-5-20251001 (the dashed Anthropic
 * SDK form) into the store; OpenRouter only accepts the dotted form. This
 * runs on every load — no-op once the settings file is clean.
 */
const MODEL_ID_MIGRATIONS: Record<string, string> = {
  "anthropic/claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4-6-20251024": "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4-7-20251030": "anthropic/claude-opus-4.7",
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
};

const VALID_PROVIDERS = new Set(["openrouter", "claude-code", "none"]);

function migrateModes(modes: VoiceMode[]): { modes: VoiceMode[]; changed: boolean } {
  let changed = false;
  const next = modes.map((m) => {
    let updated = m;
    const target = m.languageModel ? MODEL_ID_MIGRATIONS[m.languageModel] : undefined;
    if (target) {
      changed = true;
      updated = { ...updated, languageModel: target };
    }
    // Normalize unknown / removed providers (e.g. legacy "gemini" / "claude")
    // to the managed OpenRouter path so existing modes keep working.
    if (!VALID_PROVIDERS.has(updated.languageModelProvider as string)) {
      changed = true;
      updated = {
        ...updated,
        languageModelProvider: "openrouter",
        languageModel: updated.languageModel ?? "anthropic/claude-haiku-4.5",
      };
    }
    return updated;
  });
  return { modes: next, changed };
}

/**
 * Merge stored partial settings with DEFAULT_SETTINGS. Deep-merge for nested
 * objects (sound) so older saves missing newer fields still produce a valid
 * AppSettings without nuking user-set values.
 */
function mergeWithDefaults(stored: Partial<AppSettings> | null | undefined): AppSettings {
  if (!stored) return DEFAULT_SETTINGS;
  // Migrate legacy `userName` → `firstName` + `lastName` on first load after
  // upgrading. Split on the first whitespace; everything after becomes the
  // last name. The legacy field is left in place so a downgrade still works.
  let firstName = stored.firstName;
  let lastName = stored.lastName;
  if (!firstName && !lastName && typeof stored.userName === "string" && stored.userName.trim()) {
    const parts = stored.userName.trim().split(/\s+/);
    firstName = parts[0];
    if (parts.length > 1) lastName = parts.slice(1).join(" ");
  }
  // Migrate legacy sound.compactPill (boolean) → top-level pillStyle (3-way).
  // Only applied if pillStyle wasn't explicitly set yet.
  let pillStyle = stored.pillStyle;
  if (!pillStyle) {
    pillStyle = stored.sound?.compactPill ? "mini" : "classic";
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ...(firstName !== undefined ? { firstName } : {}),
    ...(lastName !== undefined ? { lastName } : {}),
    pillStyle,
    sound: { ...DEFAULT_SETTINGS.sound, ...(stored.sound ?? {}) },
    modes: stored.modes ?? DEFAULT_SETTINGS.modes,
    vocabulary: stored.vocabulary ?? [],
    history: stored.history ?? [],
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const store = getStore();
  const stored = await store.get<Partial<AppSettings>>(SETTINGS_KEY);
  const merged = mergeWithDefaults(stored ?? null);
  // One-time data migration: rewrite any obsolete model IDs to current ones,
  // then persist so the next read is a no-op.
  const { modes, changed } = migrateModes(merged.modes);
  if (changed) {
    const next = { ...merged, modes };
    await store.set(SETTINGS_KEY, next);
    await store.save();
    console.log("[store-bridge] migrated obsolete model IDs in stored modes");
    return next;
  }
  return merged;
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
