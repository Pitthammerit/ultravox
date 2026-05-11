import { describe, it, expect } from "vitest";
import { routeModesToLocal } from "../lib/autoLocalRoute";
import type { VoiceMode } from "../lib/voiceModes";

function makeMode(overrides: Partial<VoiceMode> = {}): VoiceMode {
  return {
    id: "test",
    name: "Test",
    voiceModel: "whisper-large-v3-turbo",
    cleanup: "prose",
    language: "auto",
    systemPrompt: null,
    promptSuffix: null,
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-sonnet-4.5",
    transcriptionModel: "cloud",
    autocapitalize: false,
    ...overrides,
  };
}

describe("routeModesToLocal", () => {
  it("returns null when nothing would change", () => {
    const m = makeMode({ transcriptionModel: "auto", languageModelProvider: "local" });
    expect(routeModesToLocal([m], { transcription: true, cleanup: true })).toBeNull();
  });

  it("flips cloud transcriptionModel to auto when transcription:true", () => {
    const m = makeMode({ transcriptionModel: "cloud" });
    const out = routeModesToLocal([m], { transcription: true, cleanup: false });
    expect(out).not.toBeNull();
    expect(out![0]!.transcriptionModel).toBe("auto");
    // cleanup-side unchanged
    expect(out![0]!.languageModelProvider).toBe("openrouter");
  });

  it("flips openrouter provider to local when cleanup:true", () => {
    const m = makeMode({ languageModelProvider: "openrouter" });
    const out = routeModesToLocal([m], { transcription: false, cleanup: true });
    expect(out).not.toBeNull();
    expect(out![0]!.languageModelProvider).toBe("local");
    expect(out![0]!.languageModel).toBe("phi-3.5");
  });

  it("flips claude-code provider to local when cleanup:true", () => {
    const m = makeMode({ languageModelProvider: "claude-code", languageModel: "sonnet" });
    const out = routeModesToLocal([m], { transcription: false, cleanup: true });
    expect(out![0]!.languageModelProvider).toBe("local");
  });

  it("preserves 'none' provider — user explicitly wants no cleanup", () => {
    const m = makeMode({ languageModelProvider: "none", cleanup: "raw" });
    const out = routeModesToLocal([m], { transcription: false, cleanup: true });
    expect(out).toBeNull();
  });

  it("preserves 'raw' cleanup modes — they don't run any LLM regardless", () => {
    const m = makeMode({ cleanup: "raw", languageModelProvider: "openrouter" });
    const out = routeModesToLocal([m], { transcription: false, cleanup: true });
    expect(out).toBeNull();
  });

  it("preserves existing local transcription variants — auto-route doesn't reset to 'auto'", () => {
    const m = makeMode({ transcriptionModel: "large-v3-turbo-q8_0" });
    const out = routeModesToLocal([m], { transcription: true, cleanup: false });
    expect(out).toBeNull();
  });

  it("preserves existing local LLM provider — cleanup-on doesn't reset languageModel", () => {
    const m = makeMode({ languageModelProvider: "local", languageModel: "qwen2.5-3b" });
    const out = routeModesToLocal([m], { transcription: false, cleanup: true });
    expect(out).toBeNull();
  });

  it("handles many modes at once and only rewrites the ones that need it", () => {
    const m1 = makeMode({ id: "a", transcriptionModel: "cloud" });
    const m2 = makeMode({ id: "b", transcriptionModel: "auto", languageModelProvider: "local" });
    const m3 = makeMode({ id: "c", transcriptionModel: "cloud", languageModelProvider: "openrouter" });
    const out = routeModesToLocal([m1, m2, m3], { transcription: true, cleanup: true });
    expect(out).not.toBeNull();
    expect(out![0]!.transcriptionModel).toBe("auto");
    expect(out![1]!).toBe(m2); // unchanged reference — same object
    expect(out![2]!.transcriptionModel).toBe("auto");
    expect(out![2]!.languageModelProvider).toBe("local");
  });
});
