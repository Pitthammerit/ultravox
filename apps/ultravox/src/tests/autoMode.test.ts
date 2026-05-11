import { describe, it, expect } from "vitest";
import { pickAutoMode, getRegistryEntry, selectModeForRecording } from "../lib/autoMode";
import { DEFAULT_MODES } from "../lib/voiceModes";

describe("pickAutoMode", () => {
  it("returns email mode for Mail bundle", () => {
    const m = pickAutoMode("com.apple.mail", DEFAULT_MODES, "note");
    expect(m.id).toBe("email");
  });

  it("returns message mode for Slack", () => {
    const m = pickAutoMode("com.tinyspeck.slackmacgap", DEFAULT_MODES, "note");
    expect(m.id).toBe("message");
  });

  it("returns code mode for VS Code", () => {
    const m = pickAutoMode("com.microsoft.VSCode", DEFAULT_MODES, "note");
    expect(m.id).toBe("code");
  });

  it("falls back to fallbackId for unknown bundle", () => {
    const m = pickAutoMode("com.unknown.app", DEFAULT_MODES, "note");
    expect(m.id).toBe("note");
  });

  it("falls back to first mode if fallbackId not found", () => {
    const m = pickAutoMode(null, DEFAULT_MODES, "nope");
    expect(m.id).toBe(DEFAULT_MODES[0]!.id);
  });

  it("matches case-insensitively on bundle id", () => {
    const m = pickAutoMode("COM.APPLE.MAIL", DEFAULT_MODES, "note");
    expect(m.id).toBe("email");
  });

  it("returns null entry for null bundle in getRegistryEntry", () => {
    expect(getRegistryEntry(null)).toBeNull();
    expect(getRegistryEntry(undefined)).toBeNull();
  });

  it("returns registry entry for known bundle", () => {
    const entry = getRegistryEntry("com.apple.mail");
    expect(entry?.preferredMode).toBe("email");
    expect(entry?.displayName).toBe("Mail");
  });
});

// v0.18.8: gating helper extracted from PillWindow.startRecord so the
// opt-in vs default-off behavior is testable without mounting React.
describe("selectModeForRecording", () => {
  it("autoModeEnabled=false → honors activeModeId regardless of frontmost app", () => {
    // User is in Mail (Mail's preferred mode is "email") but they picked "code"
    // explicitly. With auto-mode off, their choice wins.
    const m = selectModeForRecording(DEFAULT_MODES, "code", "com.apple.mail", false);
    expect(m.id).toBe("code");
  });

  it("autoModeEnabled=true → frontmost-app lookup overrides activeModeId", () => {
    // User has "note" active, but Mail is frontmost — auto-mode promotes to email.
    const m = selectModeForRecording(DEFAULT_MODES, "note", "com.apple.mail", true);
    expect(m.id).toBe("email");
  });

  it("autoModeEnabled=true with unknown bundle → falls back to activeModeId", () => {
    const m = selectModeForRecording(DEFAULT_MODES, "code", "com.unknown.app", true);
    expect(m.id).toBe("code");
  });

  it("autoModeEnabled=true with null bundle → falls back to activeModeId", () => {
    const m = selectModeForRecording(DEFAULT_MODES, "note", null, true);
    expect(m.id).toBe("note");
  });

  it("autoModeEnabled=false with unknown activeModeId → first mode", () => {
    const m = selectModeForRecording(DEFAULT_MODES, "nonexistent", "com.apple.mail", false);
    expect(m.id).toBe(DEFAULT_MODES[0]!.id);
  });
});
