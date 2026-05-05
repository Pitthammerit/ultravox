export type VoiceCleanup = "prose" | "list" | "note" | "raw";
export type VoiceModelId =
  | "whisper-large-v3-turbo"
  | "whisper-small"
  | "whisper-tiny";
export type LanguageModelProvider = "openrouter" | "gemini" | "claude" | "none";

export const LANGUAGE_MODEL_PROVIDERS: Array<{ id: LanguageModelProvider; label: string }> = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "none",       label: "No cleanup" },
];

export const LANGUAGE_MODELS: Record<string, Array<{ id: string; label: string; speed: string; accuracy: string }>> = {
  openrouter: [
    { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5",  speed: "fast",    accuracy: "high" },
    { id: "anthropic/claude-sonnet-4-5",         label: "Claude Sonnet 4.5", speed: "medium",  accuracy: "highest" },
    { id: "openai/gpt-4o-mini",                  label: "GPT-4o mini",       speed: "fast",    accuracy: "high" },
    { id: "google/gemini-2.5-flash",             label: "Gemini 2.5 Flash",  speed: "fastest", accuracy: "medium" },
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

export interface VoiceMode {
  id: string;
  name: string;
  icon?: string;
  voiceModel: VoiceModelId;
  language: string;
  cleanup: VoiceCleanup;
  languageModelProvider: LanguageModelProvider;
  languageModel?: string | null;
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
    languageModel: "anthropic/claude-haiku-4-5-20251001",
    autocapitalize: true,
    insertion: "paste",
  },
  {
    id: "message",
    name: "Message",
    icon: "MessageCircle",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "prose",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4-5-20251001",
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
    languageModel: "anthropic/claude-haiku-4-5-20251001",
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
