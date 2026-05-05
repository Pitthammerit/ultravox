export type VoiceCleanup = "prose" | "list" | "note" | "raw";
export type VoiceModelId =
  | "whisper-large-v3-turbo"
  | "whisper-small"
  | "whisper-tiny";
export type LanguageModelProvider = "openrouter" | "gemini" | "claude" | "none";

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
