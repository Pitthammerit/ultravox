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
  apiUrl: string;
  error?: string;
}

async function fetchToken(
  endpoint: string,
): Promise<{ token: string; apiUrl: string }> {
  const res = await fetch(endpoint);
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.ok) throw new Error(data.error ?? `token endpoint ${res.status}`);
  return { token: data.token, apiUrl: data.apiUrl };
}

export async function transcribe(
  blob: Blob,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const { token, apiUrl } = await fetchToken(opts.tokenEndpoint);

  const cleanup = opts.mode.cleanup ?? "prose";
  const endpoint = cleanup === "raw" ? "/v1/audio/transcriptions" : "/v1/audio/clean";

  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
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

  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`voice worker ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { text?: string };
  return { text: data.text ?? "" };
}
