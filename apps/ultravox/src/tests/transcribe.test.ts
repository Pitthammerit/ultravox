import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribe } from "../lib/transcribe";
import type { VoiceMode } from "../lib/voiceModes";

const fetchMock = vi.fn();
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
});

const blob = new Blob(["x"], { type: "audio/webm" });
const keys = { openAiKey: "sk-test", openRouterKey: "or-test" };

const baseMode: VoiceMode = {
  id: "email",
  name: "Email",
  voiceModel: "whisper-large-v3-turbo",
  language: "auto",
  cleanup: "prose",
  languageModelProvider: "openrouter",
  languageModel: "anthropic/claude-haiku-4-5-20251001",
};

describe("transcribe", () => {
  it("calls Whisper then OpenRouter for prose cleanup", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw transcript" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "cleaned text" } }] }),
      });

    const result = await transcribe(blob, { mode: baseMode, vocabulary: [], keys });

    expect(result.text).toBe("cleaned text");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("openai.com/v1/audio/transcriptions"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("openrouter.ai"),
      expect.any(Object),
    );
  });

  it("skips OpenRouter for raw cleanup and returns Whisper text directly", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "raw text" }),
    });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw" },
      vocabulary: [],
      keys,
    });

    expect(result.text).toBe("raw text");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies vocabulary replacements before LLM cleanup", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "ultravox is great" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Ultravox is great" } }] }),
      });

    await transcribe(blob, {
      mode: baseMode,
      vocabulary: [{ input: "ultravox", replace: "Ultravox" }],
      keys,
    });

    const llmCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(llmCall[1].body as string) as { messages: Array<{ content: string }> };
    expect(body.messages[1]?.content).toBe("Ultravox is great");
  });

  it("throws on Whisper error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], keys }),
    ).rejects.toThrow("Whisper 401");
  });
});
