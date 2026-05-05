import type { VoiceCleanup } from "./voiceModes";

const BASE: Record<Exclude<VoiceCleanup, "raw">, string> = {
  prose:
    "You are a transcript editor. Clean up the following voice transcript into clear, readable prose. Fix grammar, punctuation, and sentence flow. Remove filler words (um, uh, like, you know). Do not add information that wasn't spoken. Return only the cleaned text, nothing else.",

  note:
    "You are a transcript editor. Clean up the following voice transcript into a structured note: a brief heading followed by 1–3 concise paragraphs. Fix grammar and remove filler words. Return only the note text, nothing else.",

  list:
    "You are a transcript editor. Clean up the following voice transcript into a bullet list. Each distinct point or item becomes its own bullet. Fix grammar and remove filler words. Return only the bulleted list, nothing else.",
};

export function getCleanupSystemPrompt(
  cleanup: Exclude<VoiceCleanup, "raw">,
  promptSuffix?: string | null,
): string {
  const base = BASE[cleanup];
  return promptSuffix ? `${base}\n\n${promptSuffix}` : base;
}
