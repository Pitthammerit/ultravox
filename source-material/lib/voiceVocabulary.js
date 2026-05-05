/**
 * Voice-vocabulary helpers — used by VoiceInput on submit and by the
 * SettingsVoiceVocabularyPanel for live preview / persistence.
 *
 * Vocabulary entries have shape `{ input, replace }`:
 *   - replace === null (or '')  → hint-only: passed to Whisper as `prompt` bias
 *   - replace !== null && != '' → find/replace pair: applied server-side
 *                                 after Whisper, before LLM cleanup
 */

const HINT_MAX_CHARS = 200

/**
 * Build the joined hint string for Whisper's `prompt` field.
 * Hint-only entries are concatenated `, `-separated. Truncated to
 * ~200 chars (Whisper's prompt is bounded around 244 tokens).
 *
 * @param {Array<{input: string, replace: string|null}>} vocabulary
 * @returns {string}
 */
export function buildHintString(vocabulary) {
  if (!Array.isArray(vocabulary)) return ''
  const hints = vocabulary
    .filter((e) => e && typeof e.input === 'string' && (e.replace == null || e.replace === ''))
    .map((e) => e.input.trim())
    .filter(Boolean)

  if (hints.length === 0) return ''
  const joined = hints.join(', ')
  if (joined.length <= HINT_MAX_CHARS) return joined
  return joined.slice(0, HINT_MAX_CHARS - 3).replace(/[,\s]+$/, '') + '...'
}

/**
 * Filter vocabulary entries to just the find/replace pairs.
 *
 * @param {Array<{input: string, replace: string|null}>} vocabulary
 * @returns {Array<{input: string, replace: string}>}
 */
export function getReplacePairs(vocabulary) {
  if (!Array.isArray(vocabulary)) return []
  return vocabulary
    .filter((e) =>
      e &&
      typeof e.input === 'string' &&
      e.input.trim() !== '' &&
      typeof e.replace === 'string' &&
      e.replace !== '',
    )
    .map((e) => ({ input: e.input, replace: e.replace }))
}
