import { buildHintString, getReplacePairs } from "./voiceVocabulary";
import type { VocabularyEntry } from "./voiceVocabulary";
import type { VoiceMode } from "./voiceModes";
import { logDebug } from "./debugLog";

export type { VocabularyEntry };

export interface TranscribeOptions {
  mode: VoiceMode;
  vocabulary: VocabularyEntry[];
  tokenEndpoint: string;
  /** Fired when execution moves from the Whisper phase to the LLM cleanup phase. */
  onProgress?: (phase: "transcribing" | "cleaning") => void;
}

export interface TranscribeResult {
  text: string;
}

interface TokenResponse {
  ok: boolean;
  token: string;
  expiresIn?: number;
  error?: string;
}

function deriveApiBase(tokenEndpoint: string): string {
  const url = new URL(tokenEndpoint, "http://localhost");
  return `${url.protocol}//${url.host}`;
}

async function fetchToken(endpoint: string): Promise<{ token: string; apiUrl: string }> {
  const t0 = performance.now();
  const res = await fetch(endpoint);
  const data = (await res.json()) as TokenResponse;
  const durationMs = Math.round(performance.now() - t0);
  if (!res.ok || !data.ok) {
    logDebug("transcribe-token", { status: res.status, durationMs, error: data.error ?? `HTTP ${res.status}` });
    throw new Error(data.error ?? `token endpoint ${res.status}`);
  }
  logDebug("transcribe-token", { status: res.status, durationMs });
  return { token: data.token, apiUrl: deriveApiBase(endpoint) };
}

/** Phase 1: raw Whisper transcription. Returns the raw transcript string. */
async function whisperTranscribe(
  blob: Blob,
  opts: TranscribeOptions,
  token: string,
  apiUrl: string,
): Promise<string> {
  const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a"
            : /ogg/.test(blob.type) ? "ogg"
            : /wav/.test(blob.type) ? "wav"
            : "webm";

  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  if (opts.mode.language && opts.mode.language !== "auto") {
    fd.append("language", opts.mode.language);
  }

  const hints = buildHintString(opts.vocabulary);
  if (hints) fd.append("vocabularyHints", hints);

  const t0 = performance.now();
  logDebug("transcribe-post", {
    mime: blob.type,
    bytes: blob.size,
    modeId: opts.mode.id,
    message: "/v1/audio/transcriptions (whisper)",
  });

  const res = await fetch(`${apiUrl}/v1/audio/transcriptions`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });
  const durationMs = Math.round(performance.now() - t0);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logDebug("transcribe-result", { status: res.status, durationMs, error: errText.slice(0, 240) });
    throw new Error(`voice worker ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text ?? "";
  logDebug("transcribe-result", { status: res.status, durationMs, textLength: text.length, message: "whisper done" });
  return text;
}

/**
 * Phase 2: LLM cleanup. Accepts the raw transcript as text (not audio) so
 * the worker can skip the Whisper step and run only the LLM pass.
 *
 * The worker must accept `text` in place of `file` — when `text` is present
 * the audio-transcription step is bypassed and the provided text is sent
 * directly to the LLM with the same cleanup parameters.
 */
async function cleanupTranscript(
  rawText: string,
  opts: TranscribeOptions,
  token: string,
  apiUrl: string,
): Promise<string> {
  const fd = new FormData();
  fd.append("text", rawText);
  fd.append("cleanup", opts.mode.cleanup ?? "prose");
  if (opts.mode.languageModelProvider) fd.append("provider", opts.mode.languageModelProvider);
  if (opts.mode.languageModel) fd.append("model", opts.mode.languageModel);
  if (opts.mode.promptSuffix) fd.append("promptSuffix", opts.mode.promptSuffix);
  if (opts.mode.autocapitalize) fd.append("autocapitalize", "true");
  // Pass language so the LLM responds in the correct language, not just English.
  if (opts.mode.language && opts.mode.language !== "auto") {
    fd.append("language", opts.mode.language);
  }

  const replacements = getReplacePairs(opts.vocabulary);
  if (replacements.length) fd.append("vocabularyReplacements", JSON.stringify(replacements));

  const t0 = performance.now();
  logDebug("transcribe-post", {
    modeId: opts.mode.id,
    message: `/v1/audio/clean (text, ${opts.mode.cleanup})`,
  });

  const res = await fetch(`${apiUrl}/v1/audio/clean`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });
  const durationMs = Math.round(performance.now() - t0);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logDebug("transcribe-result", { status: res.status, durationMs, error: errText.slice(0, 240) });
    throw new Error(`voice worker ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text ?? "";
  logDebug("transcribe-result", { status: res.status, durationMs, textLength: text.length, message: "cleanup done" });
  return text;
}

export async function transcribe(
  blob: Blob,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const { token, apiUrl } = await fetchToken(opts.tokenEndpoint);

  const cleanup = opts.mode.cleanup ?? "prose";

  // Phase 1: Whisper
  opts.onProgress?.("transcribing");
  const rawText = await whisperTranscribe(blob, opts, token, apiUrl);

  if (cleanup === "raw") {
    return { text: rawText };
  }

  // Phase 2: LLM cleanup — worker must accept `text` field (no audio).
  opts.onProgress?.("cleaning");
  const cleanedText = await cleanupTranscript(rawText, opts, token, apiUrl);
  return { text: cleanedText };
}
