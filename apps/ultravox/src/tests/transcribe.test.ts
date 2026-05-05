import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribe } from "../lib/transcribe";
import type { VoiceMode } from "../lib/voiceModes";

const fetchMock = vi.fn();
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
});

const tokenResponse = { ok: true, token: "tok", apiUrl: "https://worker.example" };
const blob = new Blob(["x"], { type: "audio/webm" });

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
  it("fetches token then POSTs to /v1/audio/clean for prose cleanup", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "hello world" }) });

    const result = await transcribe(blob, {
      mode: baseMode,
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
    });

    expect(result.text).toBe("hello world");
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/clean"),
      expect.any(Object),
    );
  });

  it("POSTs to /v1/audio/transcriptions for raw cleanup", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw text" }) });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
    });

    expect(result.text).toBe("raw text");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/transcriptions"),
      expect.any(Object),
    );
  });

  it("throws when token endpoint returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: "service unavailable", token: "", apiUrl: "" }),
    });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toThrow("service unavailable");
  });

  it("throws on non-ok worker response", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "oops" });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toThrow("voice worker 500");
  });
});
