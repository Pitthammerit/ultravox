import { describe, it, expect } from "vitest";
import { __test__buildClaudePrompt as buildClaudePrompt } from "../lib/transcribe";
import type { VoiceMode } from "../lib/voiceModes";

const NOTE_MODE: VoiceMode = {
  id: "note",
  name: "Note",
  voiceModel: "whisper-large-v3-turbo",
  cleanup: "note",
  language: "auto",
  systemPrompt: null,
  promptSuffix: null,
  languageModelProvider: "claude-code",
  languageModel: "sonnet",
  transcriptionModel: "auto",
  autocapitalize: false,
};

describe("buildClaudePrompt — preamble does not forbid structural markdown", () => {
  it("explicitly forbids code fences only, not all markdown", () => {
    const prompt = buildClaudePrompt("Buy milk. Buy eggs. Buy bread.", {
      mode: NOTE_MODE,
      vocabulary: [],
      tokenEndpoint: "https://example",
    });
    expect(prompt).not.toMatch(/no Markdown fences/i);
    expect(prompt).toMatch(/code fences/i);
  });

  it("permits markdown structure when the template asks for it", () => {
    const prompt = buildClaudePrompt("Things to do: milk, eggs, bread.", {
      mode: NOTE_MODE,
      vocabulary: [],
      tokenEndpoint: "https://example",
    });
    expect(prompt).toMatch(/Markdown headings, bullet lists.*are permitted/i);
  });
});
