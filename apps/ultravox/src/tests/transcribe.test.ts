import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribe, _resetTokenCacheForTests, MissingOpenRouterKeyError } from "../lib/transcribe";
import type { VoiceMode } from "../lib/voiceModes";

vi.mock("../lib/tauri-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tauri-bridge")>();
  return {
    ...actual,
    localWhisperStatus: vi.fn(),
    localWhisperTranscribe: vi.fn(),
    claudeCodeCheck: vi.fn().mockResolvedValue({ available: false }),
  };
});

// secure-store is invoked from transcribe.ts on the OpenRouter path. Default to
// "no key set" so tests that don't override see the explicit failure mode.
vi.mock("../lib/secure-store", () => ({
  secureStoreGet: vi.fn().mockResolvedValue(null),
  KEY_OPENROUTER_API: "openrouter_api_key",
}));

const fetchMock = vi.fn();
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  _resetTokenCacheForTests();
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

describe("transcribe routing", () => {
  it("skips local whisper when transcriptionModel is 'cloud'", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "cloud result" }) });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw", transcriptionModel: "cloud" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: true,
    });

    expect(result.text).toBe("cloud result");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips local whisper when localWhisperEnabled is false", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "cloud fallback" }) });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw", transcriptionModel: "auto" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: false,
    });

    expect(result.text).toBe("cloud fallback");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("transcribe", () => {
  it("OpenRouter cleanup path: Whisper raw + client-side OpenRouter call with user key", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    vi.mocked(secureStoreGet).mockResolvedValueOnce("sk-or-test-123");

    const phases: string[] = [];
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "hello world raw" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Hello world." } }] }),
      });

    const result = await transcribe(blob, {
      mode: baseMode,
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      onProgress: (p) => phases.push(p),
    });

    expect(result.text).toBe("Hello world.");
    expect(phases).toEqual(["transcribing"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/token", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/transcriptions"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws MissingOpenRouterKeyError when no key is in Keychain", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    vi.mocked(secureStoreGet).mockResolvedValueOnce(null);

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw whisper text" }) });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toBeInstanceOf(MissingOpenRouterKeyError);
  });

  it("POSTs to /v1/audio/transcriptions for raw cleanup", async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/audio/transcriptions"),
      expect.any(Object),
    );
  });

  it("provider:none short-circuits cleanup", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw passthrough" }) });

    const result = await transcribe(blob, {
      mode: { ...baseMode, languageModelProvider: "none" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
    });

    expect(result.text).toBe("raw passthrough");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("throws on non-ok worker response in raw mode", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "oops" });

    await expect(
      transcribe(blob, {
        mode: { ...baseMode, cleanup: "raw" },
        vocabulary: [],
        tokenEndpoint: "/api/voice/token",
      }),
    ).rejects.toThrow("whisper 500");
  });
});

describe("transcribe audio-quality routing", () => {
  it("passes audioQuality=low to localWhisperStatus when signal is low", async () => {
    const { localWhisperStatus, localWhisperTranscribe } = await import("../lib/tauri-bridge");
    const statusMock = vi.mocked(localWhisperStatus);
    const transcribeMock = vi.mocked(localWhisperTranscribe);
    statusMock.mockResolvedValue({ available: true, modelPath: "/x/ggml-large-v3-turbo.bin", modelVariant: "large-v3-turbo" });
    transcribeMock.mockResolvedValue("low quality result");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => tokenResponse });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw", transcriptionModel: "auto", language: "en" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: true,
      audioQuality: "low",
    });

    expect(result.text).toBe("low quality result");
    expect(statusMock).toHaveBeenCalledWith(undefined, "en", "low");
    expect(transcribeMock).toHaveBeenCalledWith(expect.any(Uint8Array), "en", undefined, "en", "low");
  });

  it("passes audioQuality=normal when signal is normal", async () => {
    const { localWhisperStatus, localWhisperTranscribe } = await import("../lib/tauri-bridge");
    const statusMock = vi.mocked(localWhisperStatus);
    const transcribeMock = vi.mocked(localWhisperTranscribe);
    statusMock.mockResolvedValue({ available: true, modelPath: "/x/ggml-base.en.bin", modelVariant: "base.en" });
    transcribeMock.mockResolvedValue("normal result");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => tokenResponse });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw", transcriptionModel: "auto", language: "en" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: true,
      audioQuality: "normal",
    });

    expect(result.text).toBe("normal result");
    expect(statusMock).toHaveBeenCalledWith(undefined, "en", "normal");
  });

  it("does NOT pass audioQuality for explicit variant (non-auto mode)", async () => {
    const { localWhisperStatus, localWhisperTranscribe } = await import("../lib/tauri-bridge");
    const statusMock = vi.mocked(localWhisperStatus);
    const transcribeMock = vi.mocked(localWhisperTranscribe);
    statusMock.mockResolvedValue({ available: true, modelPath: "/x/ggml-medium.en.bin", modelVariant: "medium.en" });
    transcribeMock.mockResolvedValue("explicit result");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => tokenResponse });

    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw", transcriptionModel: "medium.en" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: true,
      audioQuality: "low",
    });

    expect(result.text).toBe("explicit result");
    // audioQuality should be undefined for explicit variants (not auto)
    expect(statusMock).toHaveBeenCalledWith("medium.en", undefined, undefined);
  });
});
