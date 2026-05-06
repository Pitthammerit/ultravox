import { buildHintString, getReplacePairs } from "./voiceVocabulary";
import type { VocabularyEntry } from "./voiceVocabulary";
import type { VoiceMode } from "./voiceModes";

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
  console.log("[transcribe] fetching token from", endpoint);
  const res = await fetch(endpoint);
  console.log("[transcribe] token response status:", res.status);
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.ok) throw new Error(data.error ?? `token endpoint ${res.status}`);
  console.log("[transcribe] token ok, expiresIn:", data.expiresIn);
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

  console.log("[transcribe] POST", `${apiUrl}${endpoint}`, "blob:", blob.size, blob.type, "cleanup:", cleanup);
  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("[transcribe] response status:", res.status);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[transcribe] error body:", errText);
    throw new Error(`voice worker ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string };
  console.log("[transcribe] returned text length:", (data.text ?? "").length);
  return { text: data.text ?? "" };
}
