import { buildHintString, getReplacePairs } from "./voiceVocabulary";
import { getCleanupSystemPrompt } from "./cleanupPrompts";
import type { VocabularyEntry } from "./voiceVocabulary";
import type { VoiceMode, VoiceCleanup } from "./voiceModes";

export type { VocabularyEntry };

export interface ApiKeys {
  openAiKey: string;
  openRouterKey: string;
}

export interface TranscribeOptions {
  mode: VoiceMode;
  vocabulary: VocabularyEntry[];
  keys: ApiKeys;
}

export interface TranscribeResult {
  text: string;
}

async function whisper(
  blob: Blob,
  opts: { mode: VoiceMode; vocabulary: VocabularyEntry[]; openAiKey: string },
): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
  fd.append("model", "whisper-1");
  if (opts.mode.language && opts.mode.language !== "auto") {
    fd.append("language", opts.mode.language);
  }
  const hints = buildHintString(opts.vocabulary);
  if (hints) fd.append("prompt", hints);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.openAiKey}` },
    body: fd,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Whisper ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

function applyVocabularyReplacements(
  text: string,
  vocabulary: VocabularyEntry[],
): string {
  const pairs = getReplacePairs(vocabulary);
  if (pairs.length === 0) return text;
  let result = text;
  for (const { input, replace } of pairs) {
    result = result.replaceAll(input, replace);
  }
  return result;
}

async function llmCleanup(
  rawText: string,
  opts: {
    mode: VoiceMode;
    cleanup: Exclude<VoiceCleanup, "raw">;
    openRouterKey: string;
  },
): Promise<string> {
  const systemPrompt = getCleanupSystemPrompt(
    opts.cleanup,
    opts.mode.promptSuffix,
  );
  const model =
    opts.mode.languageModel ?? "anthropic/claude-haiku-4-5-20251001";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ultravox.app",
      "X-Title": "Ultravox",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? rawText;
}

export async function transcribe(
  blob: Blob,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const rawText = await whisper(blob, {
    mode: opts.mode,
    vocabulary: opts.vocabulary,
    openAiKey: opts.keys.openAiKey,
  });

  const withReplacements = applyVocabularyReplacements(rawText, opts.vocabulary);

  const cleanup = opts.mode.cleanup ?? "prose";
  if (cleanup === "raw") {
    return { text: withReplacements };
  }

  const cleanedText = await llmCleanup(withReplacements, {
    mode: opts.mode,
    cleanup,
    openRouterKey: opts.keys.openRouterKey,
  });

  return { text: cleanedText };
}
