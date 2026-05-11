import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/plugin-store with an in-memory implementation so the
// store-bridge can be exercised without a real Tauri runtime.
const memory = new Map<string, unknown>();

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    constructor(_path: string) {}
    async get<T>(key: string): Promise<T | undefined> {
      return memory.get(key) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
      memory.set(key, value);
    }
    async save(): Promise<void> {}
  },
}));

// Import AFTER the mock so the singleton picks it up.
const importBridge = async () => await import("../lib/store-bridge");

describe("store-bridge", () => {
  beforeEach(() => {
    memory.clear();
    vi.resetModules();
  });

  it("loadSettings returns defaults when store is empty", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await importBridge();
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("saveSettings + loadSettings round-trips", async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await importBridge();
    await saveSettings({
      ...DEFAULT_SETTINGS,
      theme: "dark-night",
      activeModeId: "code",
    });
    const s = await loadSettings();
    expect(s.theme).toBe("dark-night");
    expect(s.activeModeId).toBe("code");
  });

  it("merges nested sound defaults with stored partial", async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await importBridge();
    await saveSettings({
      ...DEFAULT_SETTINGS,
      // Simulate an old save missing chimeVolume
      sound: { autoGain: false, silenceRemoval: false, chime: true } as never,
    });
    const s = await loadSettings();
    expect(s.sound.autoGain).toBe(false);
    expect(s.sound.chime).toBe(true);
    expect(s.sound.chimeVolume).toBe(50); // from defaults
  });

  it("appendHistory caps at HISTORY_MAX (newest first)", async () => {
    const { appendHistory, loadSettings, HISTORY_MAX } = await importBridge();
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      await appendHistory({
        id: `id-${i}`,
        ts: i,
        modeId: "note",
        bundleId: null,
        text: `entry ${i}`,
      });
    }
    const s = await loadSettings();
    expect(s.history).toHaveLength(HISTORY_MAX);
    expect(s.history[0]!.id).toBe(`id-${HISTORY_MAX + 4}`); // newest first
  });

  it("clearHistory empties history but keeps other settings", async () => {
    const { appendHistory, clearHistory, loadSettings } = await importBridge();
    await appendHistory({
      id: "x", ts: 1, modeId: "note", bundleId: null, text: "hi",
    });
    let s = await loadSettings();
    expect(s.history).toHaveLength(1);
    await clearHistory();
    s = await loadSettings();
    expect(s.history).toHaveLength(0);
  });

  it("resetSettings restores all defaults", async () => {
    const { saveSettings, resetSettings, loadSettings, DEFAULT_SETTINGS } =
      await importBridge();
    await saveSettings({ ...DEFAULT_SETTINGS, theme: "dark-night" });
    await resetSettings();
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("patchSettings updates a single field without nuking others", async () => {
    const { patchSettings, loadSettings, DEFAULT_SETTINGS } = await importBridge();
    await patchSettings({ activeModeId: "code" });
    const s = await loadSettings();
    expect(s.activeModeId).toBe("code");
    expect(s.modes).toEqual(DEFAULT_SETTINGS.modes);
  });

  it("v0.10.8 migration: modes without transcriptionModel receive 'auto'", async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await importBridge();
    // Simulate a v0.10.7 settings object: modes have no transcriptionModel field.
    const legacyModes = DEFAULT_SETTINGS.modes.map(({ transcriptionModel: _drop, ...rest }) => {
      void _drop;
      return rest;
    });
    await saveSettings({ ...DEFAULT_SETTINGS, modes: legacyModes as never });
    const s = await loadSettings();
    for (const m of s.modes) {
      expect(m.transcriptionModel).toBe("auto");
    }
  });

  it("v0.10.8 migration: localWhisperActiveVariant orphan key is harmless", async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await importBridge();
    // Simulate a v0.10.7 save that had localWhisperActiveVariant.
    await saveSettings({ ...DEFAULT_SETTINGS, localWhisperActiveVariant: "base.en" } as never);
    const s = await loadSettings();
    // The field should not crash anything; localWhisperEnabled still works.
    expect(s.localWhisperEnabled).toBe(true);
    // transcriptionModel on default modes should match the per-mode defaults.
    const expected: Record<string, string> = { email: "base", message: "tiny", note: "base", code: "base.en" };
    for (const m of s.modes) {
      if (expected[m.id]) expect(m.transcriptionModel).toBe(expected[m.id]);
    }
  });

  // v0.18.7 SHADOW_PAD migration. Saved positions from v0.18.5 (SHADOW_PAD=14)
  // need to be shifted -18 per axis after the bump to SHADOW_PAD=32 in v0.18.6
  // so the visible pill stays in the same screen location. Decision is keyed
  // on the stored marker absence — DEFAULT_SETTINGS now seeds it true so a
  // fresh install wouldn't otherwise be detectable as "needs migration".
  it("migratePillPositions shifts a v0.18.5 settings file by -18 on first load", async () => {
    // Seed the in-memory store with a v0.18.5-shaped record (no marker).
    memory.set("settings", {
      hotkeyRecord: "Cmd+Shift+;",
      pillExpandedPosition: { x: 200, y: 300 },
      pillCompactPosition: { x: 100, y: 50 },
    });
    const { loadSettings } = await importBridge();
    const s = await loadSettings();
    expect(s.pillExpandedPosition).toEqual({ x: 182, y: 282 });
    expect(s.pillCompactPosition).toEqual({ x: 82, y: 32 });
    expect(s._pillPositionsMigratedShadowPad32).toBe(true);
  });

  it("migratePillPositions is idempotent — no double-shift on repeat loads", async () => {
    memory.set("settings", {
      hotkeyRecord: "Cmd+Shift+;",
      pillExpandedPosition: { x: 200, y: 300 },
    });
    const { loadSettings } = await importBridge();
    const first = await loadSettings();
    expect(first.pillExpandedPosition).toEqual({ x: 182, y: 282 });
    // Second load reads the now-marker-stamped persisted record and skips.
    const second = await loadSettings();
    expect(second.pillExpandedPosition).toEqual({ x: 182, y: 282 });
  });

  it("migratePillPositions skips for a fresh install (DEFAULT_SETTINGS already marked)", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await importBridge();
    const s = await loadSettings();
    expect(s._pillPositionsMigratedShadowPad32).toBe(true);
    expect(s.pillExpandedPosition).toBeUndefined();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  // v0.19.0 seed migration. The curated apps.json registry was the
  // runtime source-of-truth before v0.19.0. v0.19.0 makes it seed-only:
  // on first launch, walk apps.json, look up each preferredMode in the
  // user's saved modes, and append { bundleId, displayName } to that
  // mode's autoModeApps (de-duped by bundle ID). Set autoModeSeeded=true
  // after so we don't re-add user-deleted entries on every launch.
  it("migrateSeedAutoModeApps seeds curated apps.json into matching modes on first load", async () => {
    memory.set("settings", {
      hotkeyRecord: "Cmd+Shift+;",
      modes: [
        // v0.18.x save shape: existing modes, NO autoModeApps, NO autoModeSeeded.
        { id: "email", name: "Email", languageModelProvider: "claude-code", languageModel: "anthropic/claude-haiku-4.5", voiceModel: "whisper-large-v3-turbo", language: "auto", cleanup: "prose", transcriptionModel: "base", autocapitalize: true, insertion: "paste" },
        { id: "note", name: "Note", languageModelProvider: "claude-code", languageModel: "anthropic/claude-haiku-4.5", voiceModel: "whisper-large-v3-turbo", language: "auto", cleanup: "note", transcriptionModel: "base", autocapitalize: true, insertion: "paste" },
      ],
    });
    const { loadSettings } = await importBridge();
    const s = await loadSettings();
    const email = s.modes.find((m) => m.id === "email");
    expect(email?.autoModeApps?.length, "email mode should have curated apps seeded").toBeGreaterThan(0);
    expect(email?.autoModeApps?.some((a) => a.bundleId === "com.apple.mail")).toBe(true);
    expect(s.autoModeSeeded).toBe(true);
  });

  it("migrateSeedAutoModeApps is idempotent — does NOT re-seed on second load (user-deletes persist)", async () => {
    memory.set("settings", {
      modes: [
        { id: "email", name: "Email", languageModelProvider: "claude-code", languageModel: "anthropic/claude-haiku-4.5", voiceModel: "whisper-large-v3-turbo", language: "auto", cleanup: "prose", transcriptionModel: "base", autocapitalize: true, insertion: "paste" },
      ],
    });
    const { loadSettings, saveSettings } = await importBridge();
    // First load: seed runs, autoModeSeeded becomes true.
    const first = await loadSettings();
    // Simulate the user deleting one of the seeded entries.
    const emailMode = first.modes.find((m) => m.id === "email")!;
    emailMode.autoModeApps = (emailMode.autoModeApps ?? []).filter((a) => a.bundleId !== "com.apple.mail");
    await saveSettings(first);
    // Second load: seeded marker is now true, deleted entry stays deleted.
    const second = await loadSettings();
    const emailAfter = second.modes.find((m) => m.id === "email");
    expect(emailAfter?.autoModeApps?.some((a) => a.bundleId === "com.apple.mail"), "user-deleted bundle must NOT be re-added").toBe(false);
  });

  it("migrateSeedAutoModeApps skips when autoModeSeeded is already true (no re-seeding empty lists)", async () => {
    memory.set("settings", {
      modes: [
        { id: "email", name: "Email", languageModelProvider: "claude-code", languageModel: "anthropic/claude-haiku-4.5", voiceModel: "whisper-large-v3-turbo", language: "auto", cleanup: "prose", transcriptionModel: "base", autocapitalize: true, insertion: "paste", autoModeApps: [] },
      ],
      autoModeSeeded: true,
    });
    const { loadSettings } = await importBridge();
    const s = await loadSettings();
    const email = s.modes.find((m) => m.id === "email");
    expect(email?.autoModeApps?.length, "marker true → no seeding").toBe(0);
  });
});
