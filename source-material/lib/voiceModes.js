/**
 * Voice mode helpers — type definitions (JSDoc) and resolver helpers used by
 * VoiceInput / VoiceModeSwitcher.
 *
 * The actual mode list lives in voice-settings.json (server-side) and is
 * fetched via useVoiceSettings(). These helpers operate on already-loaded data.
 */

/**
 * @typedef {Object} VoiceMode
 * @property {string} id
 * @property {string} name
 * @property {string} [icon]
 * @property {'whisper-large-v3-turbo'|'whisper-small'|'whisper-tiny'} voiceModel
 * @property {'auto'|'en'|'de'|string} language
 * @property {'prose'|'list'|'note'|'raw'} cleanup
 * @property {'openrouter'|'gemini'|'claude'|'none'} languageModelProvider
 * @property {string|null} [languageModel]
 * @property {string|null} [promptSuffix]
 * @property {string|null} [hotkey]
 * @property {{panels?: string[], urls?: string[]}} [activateWhen]
 * @property {boolean} [autocapitalize]
 * @property {'cursor'|'paste'|'append'} [insertion]
 */

/**
 * @typedef {Object} VocabularyEntry
 * @property {string} input
 * @property {string|null} replace
 */

/**
 * Find a mode by id within a settings object. Falls back to the panel's
 * default mode, then the first mode in the list, then a synthesized "raw"
 * fallback so callers never get null.
 *
 * @param {Object} settings  voice settings doc
 * @param {string} modeId
 * @param {string} [panel]   panel name to use for fallback default lookup
 * @returns {VoiceMode}
 */
export function resolveMode(settings, modeId, panel) {
  const modes = (settings && settings.modes) || []
  const byId = modes.find((m) => m.id === modeId)
  if (byId) return byId

  if (panel && settings?.defaultModes?.[panel]) {
    const def = modes.find((m) => m.id === settings.defaultModes[panel])
    if (def) return def
  }

  if (modes.length > 0) return modes[0]

  // Last-resort fallback. Keeps the UI from crashing on empty settings.
  return {
    id: 'raw',
    name: 'Raw (no cleanup)',
    icon: 'Disc',
    voiceModel: 'whisper-large-v3-turbo',
    language: 'auto',
    cleanup: 'raw',
    languageModelProvider: 'none',
    autocapitalize: false,
    insertion: 'cursor',
  }
}

/**
 * Pick the right mode for a given panel: lastUsedModes wins, then defaultModes.
 *
 * @param {Object} settings
 * @param {string} panel
 * @returns {VoiceMode}
 */
export function pickModeForPanel(settings, panel) {
  const lastId = settings?.lastUsedModes?.[panel]
  if (lastId) {
    const m = resolveMode(settings, lastId, panel)
    if (m) return m
  }
  const defaultId = settings?.defaultModes?.[panel]
  return resolveMode(settings, defaultId, panel)
}

/**
 * Build the comma-joined `prompt` string for Whisper from the hint-only
 * vocabulary entries (entries where `replace === null`).
 *
 * @param {VocabularyEntry[]} vocabulary
 * @returns {string}
 */
export function buildVocabularyHints(vocabulary) {
  if (!Array.isArray(vocabulary)) return ''
  return vocabulary
    .filter((e) => e && typeof e.input === 'string' && (e.replace == null))
    .map((e) => e.input.trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * Filter vocabulary entries to just the find-replace pairs (replace !== null).
 *
 * @param {VocabularyEntry[]} vocabulary
 * @returns {Array<{input: string, replace: string}>}
 */
export function buildVocabularyReplacements(vocabulary) {
  if (!Array.isArray(vocabulary)) return []
  return vocabulary
    .filter((e) => e && typeof e.input === 'string' && typeof e.replace === 'string' && e.input.trim())
    .map((e) => ({ input: e.input, replace: e.replace }))
}
