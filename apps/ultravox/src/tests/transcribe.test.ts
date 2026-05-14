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
    claudeCodeCleanup: vi.fn(),
    localLlmStatus: vi.fn().mockResolvedValue({ available: false }),
    localLlmCleanup: vi.fn(),
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
  // Clear call history on the module-level vi.fn() mocks so per-test
  // call-count assertions (e.g. toHaveBeenCalledOnce) don't accumulate
  // across tests. Implementations set via .mockResolvedValue() at module
  // init or .mockResolvedValueOnce() in the test body are preserved.
  vi.clearAllMocks();
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
    // Two reads: (1) the soft-fallback check that decides openrouter vs fallback,
    // and (2) inside openRouterCleanup() proper. Both must return the key.
    vi.mocked(secureStoreGet)
      .mockResolvedValueOnce("sk-or-test-123")
      .mockResolvedValueOnce("sk-or-test-123");

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

  it("throws MissingOpenRouterKeyError when no key AND no fallback provider is available", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    vi.mocked(secureStoreGet).mockResolvedValueOnce(null);

    // claudeCodeCheck + localLlmStatus default to { available: false }
    // in the module-level mock — neither soft-fallback path is reachable,
    // so the openrouter branch must throw.
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw whisper text" }) });

    await expect(
      transcribe(blob, { mode: baseMode, vocabulary: [], tokenEndpoint: "/api/voice/token" }),
    ).rejects.toBeInstanceOf(MissingOpenRouterKeyError);
  });

  // v0.18.12 soft-fallback chain. The user reported recording in default
  // Note mode (which ships with provider="openrouter") with local Whisper
  // enabled and got MissingOpenRouterKeyError. Root cause: DEFAULT_MODES
  // pre-set openrouter but v0.18.4 ripped out the managed key. Fix: in
  // the openrouter branch, when no key is found, try local LLM (if
  // enabled + model available), then claude-code CLI, before throwing.
  it("soft-falls back to Claude Code CLI when openrouter has no key but CC is available", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    const { claudeCodeCheck, claudeCodeCleanup } = await import("../lib/tauri-bridge");
    vi.mocked(secureStoreGet).mockResolvedValueOnce(null);
    vi.mocked(claudeCodeCheck).mockResolvedValueOnce({ available: true, version: "1.0", path: "/usr/local/bin/claude" });
    vi.mocked(claudeCodeCleanup).mockResolvedValueOnce("Hello world.");

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "hello world raw" }) });

    const result = await transcribe(blob, {
      mode: baseMode,
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
    });

    expect(result.text).toBe("Hello world.");
    expect(claudeCodeCleanup).toHaveBeenCalledOnce();
    // No third fetch — we never reached openrouter.ai because we fell back.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("soft-falls back to local LLM when openrouter has no key but local cleanup is enabled and available", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    const { localLlmStatus, localLlmCleanup } = await import("../lib/tauri-bridge");
    vi.mocked(secureStoreGet).mockResolvedValueOnce(null);
    vi.mocked(localLlmStatus).mockResolvedValueOnce({ available: true, modelVariant: "haiku-3", modelPath: "/tmp/m.gguf" } as never);
    vi.mocked(localLlmCleanup).mockResolvedValueOnce("Locally cleaned.");

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw text" }) });

    const result = await transcribe(blob, {
      mode: baseMode,
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localCleanupEnabled: true,
    });

    expect(result.text).toBe("Locally cleaned.");
    expect(localLlmCleanup).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("soft-fallback honors localCleanupEnabled=false (skips local LLM even if available)", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    const { localLlmStatus, claudeCodeCheck, claudeCodeCleanup } = await import("../lib/tauri-bridge");
    vi.mocked(secureStoreGet).mockResolvedValueOnce(null);
    vi.mocked(localLlmStatus).mockResolvedValueOnce({ available: true, modelVariant: "haiku-3", modelPath: "/tmp/m.gguf" } as never);
    vi.mocked(claudeCodeCheck).mockResolvedValueOnce({ available: true, version: "1.0", path: "/usr/local/bin/claude" });
    vi.mocked(claudeCodeCleanup).mockResolvedValueOnce("CC cleaned.");

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw text" }) });

    const result = await transcribe(blob, {
      mode: baseMode,
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localCleanupEnabled: false,
    });

    // Local LLM available but disabled by master toggle → falls through to CC.
    expect(result.text).toBe("CC cleaned.");
    expect(claudeCodeCleanup).toHaveBeenCalledOnce();
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

// v0.19.6 — three bug fixes informed by user's debug-log.json:
//   Bug 1: provider=local that fails must surface a local-LLM error,
//          NOT silently fall through to claude-code
//   Bug 1b: openrouter soft-fallback chain that successfully reached the
//          local-LLM step (status=available) but then localLlmCleanup
//          throws must surface the local error, NOT silently continue to CC
//   Bug 3: fetchToken MUST NOT be called when both transcription and
//          cleanup are local — it's a network round-trip that blocks
//          offline use of fully-local workflows
describe("transcribe v0.19.6 routing fixes", () => {
  it("Bug 1: provider=local + localLlmStatus unavailable → throws clear local-LLM error (no CC fall-through)", async () => {
    const { localLlmStatus, claudeCodeCheck, claudeCodeCleanup } = await import("../lib/tauri-bridge");
    vi.mocked(localLlmStatus).mockResolvedValueOnce({ available: false, modelPath: null, modelVariant: null } as never);
    // CC IS available — proving the bug would silently route here.
    vi.mocked(claudeCodeCheck).mockResolvedValueOnce({ available: true, version: "2.1.110 (Claude Code)", path: "/usr/local/bin/claude" });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw" }) });

    await expect(
      transcribe(blob, {
        mode: { ...baseMode, languageModelProvider: "local", languageModel: null },
        vocabulary: [],
        tokenEndpoint: "/api/voice/token",
        localCleanupEnabled: true,
      }),
    ).rejects.toThrow(/local LLM/i);
    expect(claudeCodeCleanup).not.toHaveBeenCalled();
  });

  it("Bug 1b: openrouter soft-fallback that reaches local-LLM with status=available but localLlmCleanup throws → surfaces local error (no CC fall-through)", async () => {
    const { secureStoreGet } = await import("../lib/secure-store");
    const { localLlmStatus, localLlmCleanup, claudeCodeCheck, claudeCodeCleanup } = await import("../lib/tauri-bridge");
    vi.mocked(secureStoreGet).mockResolvedValueOnce(null);
    vi.mocked(localLlmStatus).mockResolvedValueOnce({ available: true, modelPath: "/x.gguf", modelVariant: "qwen2.5-3b" } as never);
    vi.mocked(localLlmCleanup).mockRejectedValueOnce(new Error("llama.cpp: out of memory"));
    // CC available — used to silently rescue. Now should NOT be called.
    vi.mocked(claudeCodeCheck).mockResolvedValueOnce({ available: true, version: "2.1.110 (Claude Code)", path: "/usr/local/bin/claude" });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => tokenResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: "raw" }) });

    await expect(
      transcribe(blob, {
        mode: baseMode,
        vocabulary: [],
        tokenEndpoint: "/api/voice/token",
        localCleanupEnabled: true,
      }),
    ).rejects.toThrow(/out of memory/);
    expect(claudeCodeCleanup).not.toHaveBeenCalled();
  });

  it("Bug 3: local Whisper + raw cleanup → does NOT call fetchToken (no network)", async () => {
    const { localWhisperStatus, localWhisperTranscribe } = await import("../lib/tauri-bridge");
    vi.mocked(localWhisperStatus).mockResolvedValueOnce({ available: true, modelPath: "/x.bin", modelVariant: "base" });
    vi.mocked(localWhisperTranscribe).mockResolvedValueOnce("local raw text");

    // Critical: no fetchMock responses queued — if fetchToken is called,
    // the await on fetchMock() rejects/returns undefined and the test
    // fails. This is the failing-test guarantee that fetchToken is
    // skipped on fully-local paths.
    const result = await transcribe(blob, {
      mode: { ...baseMode, cleanup: "raw", transcriptionModel: "base" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: true,
    });

    expect(result.text).toBe("local raw text");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Bug 3: local Whisper + provider=local + local LLM available → does NOT call fetchToken", async () => {
    const { localWhisperStatus, localWhisperTranscribe, localLlmStatus, localLlmCleanup } = await import("../lib/tauri-bridge");
    vi.mocked(localWhisperStatus).mockResolvedValueOnce({ available: true, modelPath: "/x.bin", modelVariant: "base" });
    vi.mocked(localWhisperTranscribe).mockResolvedValueOnce("local raw");
    vi.mocked(localLlmStatus).mockResolvedValueOnce({ available: true, modelPath: "/m.gguf", modelVariant: "qwen2.5-3b" } as never);
    vi.mocked(localLlmCleanup).mockResolvedValueOnce("local cleaned");

    const result = await transcribe(blob, {
      mode: { ...baseMode, languageModelProvider: "local", languageModel: null, transcriptionModel: "base" },
      vocabulary: [],
      tokenEndpoint: "/api/voice/token",
      localWhisperEnabled: true,
      localCleanupEnabled: true,
    });

    expect(result.text).toBe("local cleaned");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
