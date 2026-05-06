import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribe } from "../lib/transcribe";
import type { VoiceMode } from "../lib/voiceModes";

const fetchMock = vi.fn();
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
});

const tokenResponse = { ok: true, token: "tok", expiresIn: 300 };
const blob = new Blob(["x"], { type: "audio/webm" });

const baseMode: VoiceMode = {
  id: "email",
  name: "Email",
  voiceModel: "whisper-large-v3-turbo",
  language: "auto",
  cleanup: "prose",
  languageModelProvider: "openrouter",
  languageModel: "anthropic/claude-haiku-4.5",
};

describe("transcribe", () => {
  it("fetches token, POSTs to /v1/audio/transcriptions then /v1/audio/clean for prose cleanup", async () => {
    const phases: string[] = [];
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      // Phase 1: Whisper
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw hello" }) })
      // Phase 2: LLM cleanup
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "hello world" }) });

    const result = await transcribe(blob, {
      mode: baseMode,
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      onProgress: (p) => phases.push(p),
    });

    expect(result.text).toBe("hello world");
    expect(phases).toEqual(["transcribing", "cleaning"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/transcriptions"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/clean"),
      expect.any(Object),
    );
  });

  it("POSTs to /v1/audio/transcriptions only for raw cleanup", async () => {
    const phases: string[] = [];
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw text" }) });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      onProgress: (p) => phases.push(p),
    });

    expect(result.text).toBe("raw text");
    expect(phases).toEqual(["transcribing"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // token + whisper only
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/transcriptions"),
      expect.any(Object),
    );
  });

  it("throws when token endpoint returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: "service unavailable", token: "", expiresIn: 0 }),
    });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toThrow("service unavailable");
  });

  it("throws on non-ok whisper response", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "oops" });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toThrow("voice worker 500");
  });

  it("throws on non-ok cleanup response", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "cleanup error" });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toThrow("voice worker 500");
  });
});
