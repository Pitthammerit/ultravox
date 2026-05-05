/**
 * Curated lists of providers + models for the voice mode editor.
 *
 * Kept here (not in voice-settings.json) because these are vendor catalogs,
 * not user data. Update when new models are released or current ones retire.
 */

export const LANGUAGE_MODEL_PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'gemini',     label: 'Gemini (not yet implemented)' },
  { id: 'claude',     label: 'Claude CLI (desktop only, not yet implemented)' },
  { id: 'none',       label: 'No cleanup' },
]

export const LANGUAGE_MODELS = {
  openrouter: [
    { id: 'anthropic/claude-haiku-4.5',  label: 'Claude Haiku 4.5',  speed: 'fast',    accuracy: 'high' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', speed: 'medium',  accuracy: 'highest' },
    { id: 'openai/gpt-5-mini',           label: 'GPT-5 mini',        speed: 'fast',    accuracy: 'high' },
    { id: 'google/gemini-2.5-flash',     label: 'Gemini 2.5 Flash',  speed: 'fastest', accuracy: 'medium' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', speed: 'fastest', accuracy: 'medium' },
    { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   speed: 'medium',  accuracy: 'highest' },
  ],
  claude: [
    { id: 'claude-cli', label: 'Claude CLI (Max plan)', speed: 'medium', accuracy: 'highest' },
  ],
  none: [],
}

export const VOICE_MODELS = [
  { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 (Turbo)', speed: 'fast', accuracy: 'highest' },
  // Future: whisper-small, whisper-tiny once we expose them on the worker.
]

export const LANGUAGES = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'en',   label: 'English' },
  { id: 'de',   label: 'German' },
  { id: 'fr',   label: 'French' },
  { id: 'es',   label: 'Spanish' },
  { id: 'it',   label: 'Italian' },
  { id: 'nl',   label: 'Dutch' },
  { id: 'pt',   label: 'Portuguese' },
]

export const CLEANUP_VARIANTS = [
  { id: 'prose', label: 'Prose',    description: 'Cleanup as flowing text' },
  { id: 'list',  label: 'List',     description: 'Format enumerations as bullet list' },
  { id: 'note',  label: 'Note',     description: 'Light structure (heading + 1-3 paragraphs)' },
  { id: 'raw',   label: 'Raw',      description: 'No cleanup — pure Whisper output' },
]
