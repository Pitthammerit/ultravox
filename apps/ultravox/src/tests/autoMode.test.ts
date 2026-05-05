import { describe, it, expect } from "vitest";
import { pickAutoMode, getRegistryEntry } from "../lib/autoMode";
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
