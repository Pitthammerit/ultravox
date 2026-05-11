import { LazyStore } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import { DEFAULT_MODES, type VoiceMode } from "./voiceModes";
import type { Lang } from "./i18n/catalog";
import appsJson from "./apps.json";

interface AppsRegistryEntry {
  bundleId: string;
  preferredMode: string;
  displayName: string;
}
interface AppsRegistry {
  version: number;
  apps: AppsRegistryEntry[];
}
const appsRegistry: AppsRegistry = appsJson as AppsRegistry;

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
  /** When true, lower Music/Spotify volume to (100 - duckPercent)% of its
   *  current level for the duration of a recording, then restore. Mutually
   *  exclusive with pauseMediaWhileRecording in the UI — turning one on
   *  turns the other off. */
  duckMediaWhileRecording: boolean;
  /** Ducking depth in percent (30 / 50 / 70). 50 means the volume is cut
   *  in half during the recording. Only consulted when
   *  duckMediaWhileRecording is true. */
  duckPercent: 30 | 50 | 70;
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
  /** Absolute path to the saved audio file on disk. Set only when
   *  settings.recordings.saveLocal was true at recording time AND the
   *  blob was successfully persisted. Absent on text-only entries.
   *  File lives at ~/Library/Application Support/com.ultravox.dev/
   *  recordings/<id>.<audioFormat-ext>. */
  audioPath?: string;
  /** Mime type ("audio/mp4", "audio/webm") used to construct an
   *  <audio> element src attribute and to round-trip through
   *  read_recording_audio for re-transcribe. */
  audioFormat?: string;
  /** File size in bytes — surfaced in History panel size readout
   *  without re-stat'ing on every render. */
  audioBytes?: number;
}

/** Recording-storage preferences. Default OFF — opt-in only because saved
 *  audio is sensitive. When enabled, every recording's audio blob is
 *  persisted to ~/.../recordings/<historyEntryId>.<ext>. */
export interface RecordingsSettings {
  /** Master switch for AUDIO persistence to disk. When false, no audio
   *  is ever written; existing files on disk stay untouched (user can
   *  clear via Configuration → "Delete all saved audio"). Recording +
   *  transcription happen regardless — this only controls the post-
   *  transcription audio backup. */
  saveLocal: boolean;
  /** Auto-delete files older than this many days on app launch.
   *  0 disables auto-delete. */
  retentionDays: 0 | 7 | 30 | 90;
  /** Absolute path to the user-chosen recordings folder. When undefined
   *  or empty, the Rust side falls back to ~/Documents/Ultravox Recordings/.
   *  Set via Configuration → Recordings → "Choose folder…" which opens the
   *  native macOS folder picker (osascript). Cleared by clicking "Reset
   *  to default" — the field reverts to undefined and the Rust default
   *  resolver takes over. */
  folder?: string;
  /**
   * Last-transcription cache mode (independent of saveLocal — that's
   * audio, this is text):
   *   "auto-copy"  — Append to history AND leave the transcript on
   *                  the clipboard after paste (no clipboard restore).
   *                  Useful when you want to re-paste with ⌘V.
   *   "cache-only" — Append to history (current default). Clipboard is
   *                  restored to its prior content after paste. User
   *                  clicks the Copy button to re-load the transcript
   *                  onto the clipboard.
   *   "no-cache"   — Don't append to history at all. Paste happens
   *                  normally; the transcript exists only as long as
   *                  the focused app keeps it. Privacy-strictest mode.
   */
  cacheMode: "auto-copy" | "cache-only" | "no-cache";
}

export interface AppSettings {
  /** Hotkey for record toggle (Tauri shortcut format). */
  hotkeyRecord: string;
  /** Hotkey for mode-switcher overlay. */
  hotkeyModeOverlay: string;
  /** Hotkey for push-to-talk (hold to record, release to stop). Active only
   *  when `recordingStyle === "push-to-talk"`. The toggle hotkey
   *  (`hotkeyRecord`) and this one are mutually exclusive — Rust registers
   *  only the one matching the current style. */
  pttHotkey: string;
  /** Default voice mode id. */
  activeModeId: string;
  /** All saved voice modes. */
  modes: VoiceMode[];
  /** Vocabulary find/replace pairs. */
  vocabulary: VocabularyEntry[];
  /** Theme choice: 'auto' | 'light' | 'dark-ocean' | 'dark-night'. */
  theme: "auto" | "light" | "dark-ocean" | "dark-night";
  /** UI language preference (chosen during onboarding). All four members
   *  of the catalog Lang union are now selectable in the LANG_OPTIONS
   *  picker — keep this type in sync with catalog.ts. */
  uiLanguage: Lang;
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
  /** Local audio recording storage preferences (Configuration → Recordings). */
  recordings: RecordingsSettings;
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
   * Migrated from the legacy `sound.compactPill` boolean on first load.
   * The legacy "none" option (silent recording) was removed in v0.9.29 and
   * is migrated to "classic" on load.
   */
  pillStyle?: "classic" | "mini";
  /** Selected mic input device id (from navigator.mediaDevices.enumerateDevices).
   *  null/undefined = system default. Settable from the tray's Microphone
   *  Settings submenu. */
  selectedMicDeviceId?: string | null;
  /** Recent transcription history (capped at HISTORY_MAX). */
  history: HistoryEntry[];
  /**
   * Local Whisper transcription via on-device model (whisper-rs + Metal).
   * When true, each mode's Transcription Model dropdown is shown and used for
   * routing. When false, all modes fall back to cloud regardless of per-mode
   * setting. Falls back to cloud on any error.
   */
  localWhisperEnabled?: boolean;
  /** Master toggle for the local-LLM cleanup pipeline.
   * When true AND the per-mode `languageModelProvider` is "local", cleanup
   * runs on-device via local_llm_cleanup. When false, the local branch in
   * transcribe.ts is skipped — cleanup falls through to the worker path
   * regardless of per-mode provider setting. Coupled with localWhisperEnabled:
   * the Mode-panel handler turns this on the first time the user enables
   * local transcription, but the user can decouple them after.
   */
  localCleanupEnabled?: boolean;
  /** Path to the downloaded GGML model file. Set when download completes. */
  localWhisperModelPath?: string;
  /** Whether the "Models" accordion in the Mode editor is expanded. Defaults
   *  to open; collapsed state is persisted across sessions. */
  modelsBoxOpen?: boolean;
  /** When true, each recording picks its mode based on the frontmost app's
   *  bundle id (apps.json lookup → preferred mode). Falls back to the user's
   *  activeModeId when the bundle isn't registered. Default false — the
   *  user's explicit choice always wins unless this is opted into. Was
   *  removed in v0.11.7 (silent override hid user intent); restored in
   *  v0.18.8 behind this opt-in. */
  autoModeEnabled?: boolean;
  /** Internal: marks that the v0.18.6 SHADOW_PAD bump (14 → 32 pt)
   *  position-shift compensation has run. Set to true the first time a
   *  v0.18.7+ build loads settings. Never user-edited; never displayed.
   *  Underscore prefix signals "internal migration marker, not config".
   *  See migratePillPositions for semantics. */
  _pillPositionsMigratedShadowPad32?: boolean;
  /** Internal: marks that the v0.18.x curated apps.json → per-mode
   *  `autoModeApps` seed migration has run. Set to true the first time a
   *  v0.19.0+ build loads settings, regardless of whether any matches
   *  were seeded. Never user-edited; never displayed. See
   *  migrateSeedAutoModeApps for semantics. */
  autoModeSeeded?: boolean;
}

export const HISTORY_MAX = 50;

export const DEFAULT_SETTINGS: AppSettings = {
  hotkeyRecord: "Cmd+Shift+;",
  hotkeyModeOverlay: "Alt+Shift+K",
  pttHotkey: "Cmd+Shift+Space",
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
    duckMediaWhileRecording: false,
    duckPercent: 50,
    compactPill: false,
  },
  history: [],
  localWhisperEnabled: true,
  localCleanupEnabled: true,
  modelsBoxOpen: true,
  autoModeEnabled: false,
  // Fresh installs start "already migrated" — there are no v0.18.5
  // positions to fix. The migration only fires for upgrade paths where
  // the stored file lacks this marker (see migratePillPositions).
  _pillPositionsMigratedShadowPad32: true,
  // Fresh installs ship with DEFAULT_MODES already including the
  // curated autoModeApps directly — no migration needed. Existing-user
  // upgrade path runs the seed migration once when this marker is
  // absent (see migrateSeedAutoModeApps).
  autoModeSeeded: true,
  recordings: {
    saveLocal: false,         // Privacy-first default — audio opt-in only.
    retentionDays: 30,        // Auto-clean monthly when enabled.
    cacheMode: "cache-only",  // Text in history; clipboard restored after paste.
  },
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

const VALID_PROVIDERS = new Set(["openrouter", "claude-code", "local", "none"]);

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
    // to "none" — raw transcript with no cleanup. v0.18.2 dropped the
    // managed OpenRouter key, so a silent rewrite to "openrouter" would
    // make the very first recording fail with MissingOpenRouterKeyError
    // for any user upgrading from a build that had unknown providers.
    // "none" is always safe; users can opt back into a real cleanup
    // provider in the Mode editor.
    if (!VALID_PROVIDERS.has(updated.languageModelProvider as string)) {
      changed = true;
      updated = {
        ...updated,
        languageModelProvider: "none",
      };
    }
    // v0.10.8: add transcriptionModel to modes that were saved before this
    // field existed. Default to "auto" (smart-route based on mode language).
    if (updated.transcriptionModel === undefined) {
      changed = true;
      updated = { ...updated, transcriptionModel: "auto" };
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
  // Migrate legacy sound.compactPill (boolean) → top-level pillStyle.
  // Only applied if pillStyle wasn't explicitly set yet.
  // v0.9.29: collapse the legacy "none" option to "classic" — the silent
  // recording mode was removed; users who had it land on the default pill.
  let pillStyle: "classic" | "mini" | undefined =
    stored.pillStyle === "classic" || stored.pillStyle === "mini"
      ? stored.pillStyle
      : undefined;
  if (!pillStyle) {
    pillStyle = stored.sound?.compactPill ? "mini" : "classic";
  }
  // v0.12.4: heal divergence between pillStyle and the legacy compactPill
  // boolean. Earlier writers only updated pillStyle, leaving compactPill
  // stale; on subsequent reads any code that fell back to compactPill saw
  // the wrong value. Force them in lockstep so future reads agree.
  const sound = { ...DEFAULT_SETTINGS.sound, ...(stored.sound ?? {}) };
  sound.compactPill = pillStyle === "mini";
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ...(firstName !== undefined ? { firstName } : {}),
    ...(lastName !== undefined ? { lastName } : {}),
    pillStyle,
    sound,
    modes: stored.modes ?? DEFAULT_SETTINGS.modes,
    vocabulary: stored.vocabulary ?? [],
    history: stored.history ?? [],
  };
}

// Test export.
export const __test__mergeWithDefaults = mergeWithDefaults;
export const __test__migratePillPositions = migratePillPositions;
export const __test__migrateSeedAutoModeApps = migrateSeedAutoModeApps;

/**
 * v0.18.x → 0.19.0 one-shot seed migration. Before v0.19.0 the
 * `apps.json` curated registry was the runtime source-of-truth for
 * auto-mode (bundle ID → preferredMode lookup). v0.19.0 makes
 * `apps.json` seed-only: walk it once, look up each `preferredMode` in
 * the user's saved modes, and append `{ bundleId, displayName }` to
 * that mode's `autoModeApps` (de-duped by bundle ID).
 *
 * Decision based on `storedRaw.autoModeSeeded` — same stored-not-merged
 * check pattern as migratePillPositions. DEFAULT_SETTINGS seeds the
 * marker true so fresh installs (storedRaw=null) skip naturally; only
 * upgrade paths with a v0.18.x save (marker absent in stored) trigger
 * the seeding.
 *
 * Idempotent: user-deleted entries stay deleted on subsequent loads
 * because the marker is set to true on first run.
 */
function migrateSeedAutoModeApps(
  storedRaw: Partial<AppSettings> | null | undefined,
  merged: AppSettings,
): { settings: AppSettings; changed: boolean } {
  if (!storedRaw) return { settings: merged, changed: false };
  if (storedRaw.autoModeSeeded) return { settings: merged, changed: false };
  // Pre-v0.19.0 save: walk apps.json and append to matching modes.
  const next: AppSettings = { ...merged, autoModeSeeded: true };
  next.modes = merged.modes.map((m) => {
    const seedEntries = appsRegistry.apps.filter((a) => a.preferredMode === m.id);
    if (seedEntries.length === 0) {
      // Ensure the field exists even when no curated entries — empty
      // array beats undefined for downstream code clarity.
      return { ...m, autoModeApps: m.autoModeApps ?? [] };
    }
    const existing = m.autoModeApps ?? [];
    const existingBundleIds = new Set(existing.map((e) => e.bundleId.toLowerCase()));
    const toAdd = seedEntries
      .filter((s) => !existingBundleIds.has(s.bundleId.toLowerCase()))
      .map((s) => ({ bundleId: s.bundleId, displayName: s.displayName }));
    return { ...m, autoModeApps: [...existing, ...toAdd] };
  });
  return { settings: next, changed: true };
}

/**
 * v0.18.6 → 0.18.7 one-shot migration for the SHADOW_PAD bump (14 → 32).
 *
 * Saved `pillExpandedPosition` / `pillCompactPosition` are the *window*
 * origin in screen coords. With the larger transparent margin, the
 * visible pill sits at (x + SHADOW_PAD, y + SHADOW_PAD) within the
 * window — so a window opened at OLD saved coords shows the visible
 * pill 18 pt further down-and-right than it used to be. Subtract that
 * delta once so the visible pill returns to its previous screen
 * position.
 *
 * Decision based on the **stored** value (not the merged one):
 * DEFAULT_SETTINGS now seeds the marker as `true`, so the merged result
 * always carries the marker — checking stored directly is the only way
 * to detect a true v0.18.5-era settings file.
 *
 * Edge case: a user who installed v0.18.6 fresh, saved a position
 * under SHADOW_PAD=32, then upgrades to v0.18.7 will have their
 * position incorrectly subtracted by 18 — accept this since the v0.18.6
 * audience is small at time of write, and one re-drag fixes it.
 */
const SHADOW_PAD_BUMP_DELTA = 18;
function migratePillPositions(
  storedRaw: Partial<AppSettings> | null | undefined,
  merged: AppSettings,
): { settings: AppSettings; changed: boolean } {
  // No stored file → fresh install → DEFAULT_SETTINGS already has the
  // marker, nothing to do.
  if (!storedRaw) return { settings: merged, changed: false };
  // Already-migrated saves carry the marker.
  if (storedRaw._pillPositionsMigratedShadowPad32) {
    return { settings: merged, changed: false };
  }
  // Pre-migration save (v0.18.5 or earlier): adjust positions if any,
  // and persist the marker so future loads no-op.
  let next: AppSettings = { ...merged, _pillPositionsMigratedShadowPad32: true };
  if (merged.pillExpandedPosition) {
    next = {
      ...next,
      pillExpandedPosition: {
        x: merged.pillExpandedPosition.x - SHADOW_PAD_BUMP_DELTA,
        y: merged.pillExpandedPosition.y - SHADOW_PAD_BUMP_DELTA,
      },
    };
  }
  if (merged.pillCompactPosition) {
    next = {
      ...next,
      pillCompactPosition: {
        x: merged.pillCompactPosition.x - SHADOW_PAD_BUMP_DELTA,
        y: merged.pillCompactPosition.y - SHADOW_PAD_BUMP_DELTA,
      },
    };
  }
  return { settings: next, changed: true };
}

export async function loadSettings(): Promise<AppSettings> {
  const store = getStore();
  const stored = await store.get<Partial<AppSettings>>(SETTINGS_KEY);
  let working = mergeWithDefaults(stored ?? null);
  let needsPersist = false;
  const modeMigration = migrateModes(working.modes);
  if (modeMigration.changed) {
    working = { ...working, modes: modeMigration.modes };
    needsPersist = true;
    console.log("[store-bridge] migrated obsolete model IDs in stored modes");
  }
  const positionMigration = migratePillPositions(stored, working);
  if (positionMigration.changed) {
    working = positionMigration.settings;
    needsPersist = true;
    console.log("[store-bridge] migrated pill positions for SHADOW_PAD bump (v0.18.6)");
  }
  const autoModeMigration = migrateSeedAutoModeApps(stored, working);
  if (autoModeMigration.changed) {
    working = autoModeMigration.settings;
    needsPersist = true;
    console.log("[store-bridge] seeded apps.json curated entries into per-mode autoModeApps (v0.19.0)");
  }
  if (needsPersist) {
    await store.set(SETTINGS_KEY, working);
    await store.save();
  }
  return working;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = getStore();
  await store.set(SETTINGS_KEY, settings);
  await store.save();
  // Broadcast so other windows (the pill, in particular) can react —
  // e.g. re-push the tray Mode submenu when modes / activeModeId change.
  // Best-effort: a missing emit must never break a save.
  try { await emit("settings:saved"); } catch { /* swallow */ }
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
 *
 * If `audioBlob` is provided AND settings.recordings.saveLocal is true,
 * the blob is persisted to disk via the save_recording_audio Tauri
 * command and the resulting path + format + size land on the entry.
 * Either condition false → audio side is skipped, entry stored text-only.
 *
 * Audio save errors are logged but never block the history write — losing
 * the audio backup is preferable to losing the transcript record.
 */
export async function appendHistory(entry: HistoryEntry, audioBlob?: Blob): Promise<void> {
  const current = await loadSettings();
  let enriched = entry;
  if (audioBlob && current.recordings?.saveLocal) {
    try {
      const ext = blobMimeToExt(audioBlob.type);
      const buf = new Uint8Array(await audioBlob.arrayBuffer());
      const { saveRecordingAudio } = await import("./tauri-bridge");
      const path = await saveRecordingAudio(entry.id, ext, buf, current.recordings?.folder);
      enriched = {
        ...entry,
        audioPath: path,
        audioFormat: audioBlob.type || `audio/${ext}`,
        audioBytes: audioBlob.size,
      };
    } catch (e) {
      console.warn("[history] saveRecordingAudio failed:", e);
    }
  }
  const next = [enriched, ...current.history].slice(0, HISTORY_MAX);
  await saveSettings({ ...current, history: next });
}

/** Extract a sane filename extension from a Blob mime type.
 *  Recorder produces "audio/mp4", "audio/webm;codecs=opus" etc. We
 *  strip codec params and pick a short ext suitable as a filename. */
function blobMimeToExt(mime: string): string {
  const base = (mime || "").split(";")[0]!.trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/aac") return "mp4";
  if (base.startsWith("audio/webm")) return "webm";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/wave") return "wav";
  return "bin";
}

export async function clearHistory(): Promise<void> {
  const current = await loadSettings();
  await saveSettings({ ...current, history: [] });
}

export async function resetSettings(): Promise<void> {
  await saveSettings(DEFAULT_SETTINGS);
}

/**
 * One-shot sweep at app launch:
 *   1. Delete recordings older than `settings.recordings.retentionDays`
 *      (skipped when retentionDays = 0).
 *   2. Delete orphaned files — those whose entry id no longer matches
 *      any HistoryEntry. Happens naturally as the 50-entry cap evicts
 *      the oldest entries; without this, the recordings dir grows
 *      unboundedly even with retention enabled.
 *
 * Skipped entirely when settings.recordings.saveLocal is false — we
 * don't touch existing files in case the user toggles back on later.
 *
 * Best-effort: errors are logged and swallowed so a bad sweep never
 * blocks app startup. Returns the number of files deleted (for tests +
 * future telemetry).
 */
export async function purgeStaleRecordings(): Promise<number> {
  try {
    const settings = await loadSettings();
    if (!settings.recordings?.saveLocal) return 0;
    const folder = settings.recordings.folder;
    const { listRecordingFiles, deleteRecordingAudio } = await import("./tauri-bridge");
    const files = await listRecordingFiles(folder);
    if (files.length === 0) return 0;
    const liveIds = new Set(settings.history.map((e) => e.id));
    const retentionDays = settings.recordings.retentionDays;
    const cutoffMs = retentionDays > 0 ? Date.now() - retentionDays * 86_400_000 : 0;
    let deleted = 0;
    for (const f of files) {
      const isOrphan = !liveIds.has(f.id);
      const isStale = retentionDays > 0 && f.mtimeMs > 0 && f.mtimeMs < cutoffMs;
      if (isOrphan || isStale) {
        await deleteRecordingAudio(f.id, folder).catch(() => {});
        deleted += 1;
      }
    }
    return deleted;
  } catch (e) {
    console.warn("[recordings] purgeStaleRecordings failed:", e);
    return 0;
  }
}
