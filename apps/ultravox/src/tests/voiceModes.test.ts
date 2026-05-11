import { describe, it, expect } from "vitest";
import { DEFAULT_MODES } from "../lib/voiceModes";

describe("DEFAULT_MODES — first-launch usability contract", () => {
  // v0.18.4 ripped out the managed OpenRouter API key (BYO key model).
  // Fresh installs therefore cannot use `openrouter` as a cleanup
  // provider without the user actively adding a Keychain key — but
  // DEFAULT_MODES previously pre-set "openrouter" on the email/message/
  // note starter modes, which silently bricks the cleanup branch on
  // first launch.
  //
  // Contract: ALL shipped default modes must use a provider that works
  // without external setup, OR fall through to a no-cleanup mode.
  // Allowed: claude-code (CLI auto-detect, clear error if missing) /
  // local (local LLM, will fall back gracefully) / none (raw transcript).
  // Forbidden: openrouter (requires user-supplied key).
  it("no default mode uses openrouter (requires BYO key)", () => {
    for (const mode of DEFAULT_MODES) {
      expect(
        mode.languageModelProvider,
        `Mode "${mode.id}" defaults to openrouter — fresh installs without a Keychain key will fail. Use claude-code, local, or none.`,
      ).not.toBe("openrouter");
    }
  });

  it("every default mode uses an allowed first-launch provider", () => {
    const ALLOWED = new Set(["claude-code", "local", "none"]);
    for (const mode of DEFAULT_MODES) {
      expect(
        ALLOWED.has(mode.languageModelProvider),
        `Mode "${mode.id}" uses provider "${mode.languageModelProvider}", not in ALLOWED ${[...ALLOWED].join("/")}`,
      ).toBe(true);
    }
  });
});
