export type VoiceCleanup = "prose" | "list" | "note" | "raw";
export type VoiceModelId =
  | "whisper-large-v3-turbo"
  | "whisper-small"
  | "whisper-tiny";
export type LanguageModelProvider = "openrouter" | "claude-code" | "local" | "none";

export const LANGUAGE_MODEL_PROVIDERS: Array<{ id: LanguageModelProvider; label: string }> = [
  { id: "openrouter",  label: "OpenRouter (managed)" },
  { id: "claude-code", label: "Claude Code (local CLI)" },
  { id: "local",       label: "Local (on-device LLM)" },
  { id: "none",        label: "No cleanup" },
];

export const LANGUAGE_MODELS: Record<string, Array<{ id: string; label: string; speed: string; accuracy: string }>> = {
  openrouter: [
    { id: "anthropic/claude-haiku-4.5",                   label: "Claude Haiku 4.5",        speed: "fast",    accuracy: "high" },
    { id: "anthropic/claude-sonnet-4.5",                  label: "Claude Sonnet 4.5",       speed: "medium",  accuracy: "highest" },
    { id: "anthropic/claude-sonnet-4.6",                  label: "Claude Sonnet 4.6",       speed: "medium",  accuracy: "highest" },
    { id: "anthropic/claude-opus-4.7",                    label: "Claude Opus 4.7",         speed: "slow",    accuracy: "highest" },
    { id: "openai/gpt-4o",                                label: "GPT-4o",                  speed: "medium",  accuracy: "highest" },
    { id: "openai/gpt-4o-mini",                           label: "GPT-4o mini",             speed: "fast",    accuracy: "high" },
    { id: "amazon/nova-pro-v1",                           label: "Amazon Nova Pro",         speed: "medium",  accuracy: "high" },
    { id: "amazon/nova-lite-v1",                          label: "Amazon Nova Lite",        speed: "fast",    accuracy: "medium" },
    { id: "nvidia/llama-3.1-nemotron-70b-instruct",       label: "NVIDIA Nemotron 70B",     speed: "medium",  accuracy: "high" },
    { id: "google/gemini-2.5-flash",                      label: "Gemini 2.5 Flash",        speed: "fastest", accuracy: "medium" },
  ],
  // The Claude Code "model id" is just the alias the local `claude` CLI accepts (`--model`).
  "claude-code": [
    { id: "haiku",  label: "Haiku — fastest",       speed: "fastest", accuracy: "high" },
    { id: "sonnet", label: "Sonnet — balanced",     speed: "medium",  accuracy: "highest" },
    { id: "opus",   label: "Opus — most capable",   speed: "slow",    accuracy: "highest" },
  ],
  local: [
    { id: "_placeholder", label: "Coming in v0.11 (Llama, Mistral, Phi)", speed: "—", accuracy: "—" },
  ],
  none: [],
};

export const VOICE_MODELS: Array<{ id: VoiceModelId; label: string }> = [
  { id: "whisper-large-v3-turbo", label: "Whisper Large v3 (Turbo)" },
];

export const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "auto", label: "Auto-detect" },
  { id: "en",   label: "English" },
  { id: "de",   label: "German" },
  { id: "fr",   label: "French" },
  { id: "es",   label: "Spanish" },
  { id: "it",   label: "Italian" },
  { id: "nl",   label: "Dutch" },
  { id: "pt",   label: "Portuguese" },
];

export const CLEANUP_VARIANTS: Array<{ id: VoiceCleanup; label: string; description: string }> = [
  { id: "prose", label: "Prose", description: "Cleanup as flowing text" },
  { id: "list",  label: "List",  description: "Format enumerations as bullet list" },
  { id: "note",  label: "Note",  description: "Light structure (heading + 1–3 paragraphs)" },
  { id: "raw",   label: "Raw",   description: "No cleanup — pure Whisper output" },
];

export type TranscriptionModelValue = "cloud" | "tiny" | "base.en" | "base" | "small" | "medium" | "medium.en" | "large-v3-turbo" | "auto";

export interface VoiceMode {
  id: string;
  name: string;
  icon?: string;
  voiceModel: VoiceModelId;
  language: string;
  cleanup: VoiceCleanup;
  languageModelProvider: LanguageModelProvider;
  languageModel?: string | null;
  /**
   * Which Whisper variant (or cloud) to use for transcription in this mode.
   * "auto" = smart-route based on mode language. "cloud" = always use the
   * managed worker. Otherwise routes to the named on-device variant, falling
   * back to cloud if it isn't installed.
   */
  transcriptionModel?: TranscriptionModelValue;
  /**
   * User-edited cleanup body. When null/empty, the per-style default template
   * (apps/ultravox/src/lib/cleanupTemplates.ts) is used. When non-empty, it
   * REPLACES the default body. The worker's ANTI_CHAT_PREAMBLE safety frame
   * is always prepended server-side regardless.
   */
  systemPrompt?: string | null;
  /** Legacy "additional cleanup context" appended after systemPrompt. Kept for
   *  back-compat with modes saved before v0.9.15. New modes should use systemPrompt. */
  promptSuffix?: string | null;
  hotkey?: string | null;
  activateWhen?: { panels?: string[]; urls?: string[] };
  autocapitalize?: boolean;
  insertion?: "cursor" | "paste" | "append";
}

export interface VoiceSettings {
  modes: VoiceMode[];
  defaultModes?: Record<string, string>;
  lastUsedModes?: Record<string, string>;
}

/**
 * Starter modes shipped on first run. Users can edit these (v1.1+) or add
 * their own in the Modes panel.
 */
export const DEFAULT_MODES: VoiceMode[] = [
  {
    id: "email",
    name: "Email",
    icon: "Mail",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "prose",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4.5",
    transcriptionModel: "auto",
    autocapitalize: true,
    insertion: "paste",
    systemPrompt: `You are an email-formatting specialist. Transform the dictated transcript into a clean, ready-to-send email body.

EMAIL STRUCTURE:
1. Greeting:
   - If the speaker already started with a greeting ("Hi Sarah", "Hello team"), keep it exactly as spoken.
   - If no greeting was given, add one matching the tone:
     - Casual / direct messaging → "Hey there,"
     - Neutral / unknown recipient → "Hi,"
2. Body: clear paragraphs (2–5 sentences each), corrected grammar, fillers removed. Do not repeat words used in the greeting line.
3. Sign-off:
   - If the speaker already said one ("Thanks", "Best", "Cheers"), keep it.
   - If not, add one matching the tone:
     - Casual → \`Cheers,\\n{{firstName}}\`
     - Neutral / professional → \`Best regards,\\n{{firstName}} {{lastName}}\`
     - Warm / personal → \`Take care,\\n{{firstName}}\`
   Pick ONE — never combine multiple sign-offs.
4. NO subject line. NO additional commentary outside the email body.

Rules:
- Use the speaker's content only — never invent facts, recipients, or details.
- Fix grammar, punctuation, capitalization. Apply self-corrections ("…at 8pm, actually 9pm" → "9pm").
- Same language as the dictated transcript.
- If {{firstName}} is empty, omit the first-name line in the sign-off (the comma stays).

Output ONLY the email body. No preamble, no explanations, no Markdown fences.`,
  },
  {
    id: "message",
    name: "Message",
    icon: "MessageCircle",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "prose",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4.5",
    transcriptionModel: "auto",
    autocapitalize: true,
    insertion: "paste",
  },
  {
    id: "note",
    name: "Note",
    icon: "FileText",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "note",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4.5",
    transcriptionModel: "auto",
    autocapitalize: true,
    insertion: "paste",
  },
  {
    id: "code",
    name: "Code",
    icon: "Code",
    voiceModel: "whisper-large-v3-turbo",
    language: "en",
    cleanup: "raw",
    languageModelProvider: "none",
    transcriptionModel: "auto",
    autocapitalize: false,
    insertion: "paste",
  },
];

export const FALLBACK_MODE: VoiceMode = {
  id: "raw",
  name: "Raw (no cleanup)",
  icon: "Disc",
  voiceModel: "whisper-large-v3-turbo",
  language: "auto",
  cleanup: "raw",
  languageModelProvider: "none",
  transcriptionModel: "auto",
  autocapitalize: false,
  insertion: "cursor",
};

export function resolveMode(
  settings: VoiceSettings | null | undefined,
  modeId: string,
  panel?: string,
): VoiceMode {
  const modes = settings?.modes ?? [];
  const byId = modes.find((m) => m.id === modeId);
  if (byId) return byId;

  if (panel && settings?.defaultModes?.[panel]) {
    const def = modes.find((m) => m.id === settings.defaultModes![panel]);
    if (def) return def;
  }

  if (modes.length > 0) return modes[0]!;
  return FALLBACK_MODE;
}

export function pickModeForPanel(
  settings: VoiceSettings | null | undefined,
  panel: string,
): VoiceMode {
  const lastId = settings?.lastUsedModes?.[panel];
  if (lastId) {
    const m = resolveMode(settings, lastId, panel);
    if (m) return m;
  }
  const defaultId = settings?.defaultModes?.[panel] ?? "";
  return resolveMode(settings, defaultId, panel);
}
