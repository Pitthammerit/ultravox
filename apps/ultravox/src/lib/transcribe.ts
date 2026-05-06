import { buildHintString, getReplacePairs } from "./voiceVocabulary";
import type { VocabularyEntry } from "./voiceVocabulary";
import type { VoiceMode } from "./voiceModes";
import { logDebug } from "./debugLog";

export type { VocabularyEntry };

export interface TranscribeOptions {
  mode: VoiceMode;
  vocabulary: VocabularyEntry[];
  tokenEndpoint: string;
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

/**
 * Strips `/api/voice/token` (or any final path) off the token endpoint to get
 * the worker's base URL — the client knows where it asked for the token, so
 * the audio endpoints live on the same origin.
 */
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

export async function transcribe(
  blob: Blob,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const { token, apiUrl } = await fetchToken(opts.tokenEndpoint);

  const cleanup = opts.mode.cleanup ?? "prose";
  const endpoint = cleanup === "raw" ? "/v1/audio/transcriptions" : "/v1/audio/clean";

  const fd = new FormData();
  // Filename extension matters for some backends — derive it from the blob type
  // produced by MediaRecorder (mp4 on WebKit, webm on Chromium).
  const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a"
            : /ogg/.test(blob.type) ? "ogg"
            : /wav/.test(blob.type) ? "wav"
            : "webm";
  fd.append("file", blob, `audio.${ext}`);
  if (opts.mode.language && opts.mode.language !== "auto") {
    fd.append("language", opts.mode.language);
  }

  if (cleanup !== "raw") {
    fd.append("cleanup", cleanup);
    if (opts.mode.languageModelProvider) fd.append("provider", opts.mode.languageModelProvider);
    if (opts.mode.languageModel) fd.append("model", opts.mode.languageModel);
    if (opts.mode.promptSuffix) fd.append("promptSuffix", opts.mode.promptSuffix);
    if (opts.mode.autocapitalize) fd.append("autocapitalize", "true");
  }

  const hints = buildHintString(opts.vocabulary);
  if (hints) fd.append("vocabularyHints", hints);
  const replacements = getReplacePairs(opts.vocabulary);
  if (replacements.length && cleanup !== "raw") {
    fd.append("vocabularyReplacements", JSON.stringify(replacements));
  }

  const postStart = performance.now();
  logDebug("transcribe-post", {
    mime: blob.type,
    bytes: blob.size,
    modeId: opts.mode.id,
    message: `${endpoint} (${cleanup})`,
  });
  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });
  const durationMs = Math.round(performance.now() - postStart);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logDebug("transcribe-result", {
      status: res.status,
      durationMs,
      error: errText.slice(0, 240),
    });
    throw new Error(`voice worker ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text ?? "";
  logDebug("transcribe-result", { status: res.status, durationMs, textLength: text.length });
  return { text };
}
