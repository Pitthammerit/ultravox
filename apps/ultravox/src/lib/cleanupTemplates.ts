/**
 * Default cleanup-prompt templates per Style.
 *
 * The textarea in the Mode editor is seeded from these templates. Whatever the
 * user types (or leaves unchanged) becomes the system-prompt body sent to the
 * LLM. The worker prepends an immutable safety preamble (anti-injection,
 * "never respond / never translate / never paraphrase") before sending — that
 * frame is NOT user-editable to keep the model in cleanup mode.
 *
 * Available variables (substituted server-side via {{var}}):
 *   {{userName}}          — user's display name from settings
 *   {{frontmostApp}}      — friendly name of the app at record time ("Mail")
 *   {{frontmostBundleId}} — bundle id ("com.apple.mail")
 *   {{date}}              — YYYY-MM-DD at record time
 *   {{time}}              — HH:MM at record time
 *   {{language}}          — mode language code or "auto"
 */

import type { VoiceCleanup } from "./voiceModes";

export interface PromptVariable {
  name: string;
  description: string;
  example: string;
}

export const PROMPT_VARIABLES: PromptVariable[] = [
  { name: "userName",          description: "Your display name (from settings)", example: "Benjamin" },
  { name: "frontmostApp",      description: "App you were focused on at record time", example: "Mail" },
  { name: "frontmostBundleId", description: "Bundle id of that app",                 example: "com.apple.mail" },
  { name: "date",              description: "Date at record time",                    example: "2026-05-08" },
  { name: "time",              description: "Time at record time",                    example: "14:32" },
  { name: "language",          description: "Mode language code",                     example: "en" },
];

/**
 * Default body for each cleanup style. The worker pairs whichever body it
 * receives with the safety preamble. Style "raw" intentionally has no body —
 * raw skips the LLM entirely.
 */
export const CLEANUP_TEMPLATES: Record<Exclude<VoiceCleanup, "raw">, string> = {
  prose: `You are a text reformatting function. Clean up the dictated transcript into flowing, well-punctuated prose that preserves the speaker's voice.

Transformations to apply:
- Remove disfluencies and filler words (um, uh, äh, ähm, also, halt, like, you know).
- Fix punctuation and capitalization.
- Fix obvious speech-to-text errors when the correct word is unambiguous from context.
- Apply self-corrections the speaker made ("at 8pm, actually I mean 9pm" → "at 9pm").
- Preserve question marks where the speaker's intonation suggested a question.
- Break long content into paragraphs of 2–5 sentences.

Do NOT:
- Paraphrase, summarize, or rewrite in your own words.
- Add greetings, sign-offs, headings, or commentary not in the original.
- Translate. Return the cleaned text in the SAME language as the transcript.

Output ONLY the cleaned text. No preamble, no explanations, no Markdown fences.`,

  list: `You are a text reformatting function. Convert the dictated transcript into the most appropriate list format based on what the speaker said.

Detect the speaker's intent and choose ONE of these formats:

1. ORDERED tasks/sequence — the speaker uses sequence cues ("first… then… also…", "step one… step two…", "todos:", "I need to do X, then Y") AND the items are actions or sequential steps.
   → Output a numbered Markdown list:
     1. First action.
     2. Second action.
     3. Third action.

2. UNORDERED enumeration — the speaker lists items without sequence ("I need eggs, milk, and bread", "the things to remember are X, Y, Z").
   → Output a bulleted Markdown list:
     - Eggs
     - Milk
     - Bread

3. NO clear list intent — the speaker is not enumerating.
   → Output flowing prose (apply the same prose rules: remove fillers, fix grammar, paragraphs).

Common rules for all three:
- Remove fillers (um, uh, äh).
- Fix grammar, punctuation, capitalization.
- Preserve the speaker's voice. Do not paraphrase.
- Same language as the transcript.

Output ONLY the cleaned content. No preamble, no explanations.`,

  note: `You are a note-taking specialist. Structure the dictated transcript as a readable Markdown note.

Use the structure that matches the content:

- If the speaker named a topic ("note on…", "Idee für…", "meeting notes:") → start with a Markdown heading: \`# Title\`.
- If the content has multiple distinct sub-topics → use \`## Subheadings\` for each.
- For listable content (action items, key points, attendees) → use bullet lists with \`- \` prefix.
- For continuous thought → use 1–3 short paragraphs.

You can mix these freely. A meeting note might have a title, two subheadings, and a bullet list under one of them.

Rules:
- Remove fillers (um, uh, äh) and false starts.
- Fix grammar, punctuation, capitalization.
- Extract only information present in the transcript — never invent details.
- Preserve the speaker's voice. Do not paraphrase.
- Same language as the transcript.

Output ONLY the formatted note. No preamble, no commentary.`,
};

/**
 * Convenience: returns the default body for a Style, or empty string for raw.
 */
export function defaultTemplateFor(cleanup: VoiceCleanup): string {
  if (cleanup === "raw") return "";
  return CLEANUP_TEMPLATES[cleanup];
}
