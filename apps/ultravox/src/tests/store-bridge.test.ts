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
});
