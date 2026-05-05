import { useEffect, useRef, useState } from 'react'
import { normalizeKey, formatHotkey } from '../lib/voiceHotkeys.js'

/**
 * HotkeyRecorder — capture a keyboard chord (e.g. "Cmd+Shift+M") and emit it.
 *
 * Click the field to enter "listening" mode; the next keypress is recorded
 * and stored as a normalized string. Clear with the × button.
 *
 * Format conventions:
 *   - Modifiers: Cmd, Ctrl, Alt, Shift (in that order)
 *   - Key: KeyboardEvent.key with first letter capitalized for letters,
 *     literal for symbols, special names ("Space", "Escape", "Enter", "Tab",
 *     "ArrowUp" etc).
 *
 * Empty string and `null` both render as "Record shortcut" placeholder.
 */
export default function HotkeyRecorder({ value, onChange, placeholder = 'Record shortcut' }) {
  const [recording, setRecording] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!recording) return
    function onKey(e) {
      // Modifier-only keys are intermediate — wait for a non-modifier.
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
      // Use e.code (physical key) as the source of truth — survives Mac
      // Option+key transforms that turn e.key into a unicode glyph
      // (Option+Space → U+00A0, Option+P → π, etc.) which would otherwise
      // produce unmatchable hotkeys.
      const key = normalizeKey(e)
      if (!key) return
      e.preventDefault()
      e.stopPropagation()
      const parts = []
      if (e.metaKey) parts.push('Cmd')
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      parts.push(key)
      onChange?.(parts.join('+'))
      setRecording(false)
      ref.current?.blur()
    }
    function onBlur() { setRecording(false) }
    window.addEventListener('keydown', onKey, true)
    ref.current?.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      ref.current?.removeEventListener('blur', onBlur)
    }
  }, [recording, onChange])

  const display = recording ? 'Press a key combination…' : (formatHotkey(value) || placeholder)
  const empty = !value

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        ref={ref}
        type="button"
        onClick={() => setRecording((r) => !r)}
        className="px-2.5 py-1 rounded-md transition-colors font-mono"
        style={{
          backgroundColor: recording ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: empty && !recording ? 'var(--color-secondary-on-dark)' : 'var(--color-primary-on-dark)',
          minWidth: '8rem',
          textAlign: 'center',
          // Bigger than the surrounding rows so Apple's modifier glyphs
          // (⌘ ⌥ ⇧ ⌃) read at a comfortable size — they're naturally narrower
          // than letter-keys at typical UI text sizes.
          fontSize: '14px',
          lineHeight: 1.2,
        }}
      >
        {display}
      </button>
      {value && !recording && (
        <button
          type="button"
          onClick={() => onChange?.(null)}
          className="text-xs px-1.5 py-1 rounded-md hover:bg-white/10 transition-colors"
          style={{ color: 'var(--color-secondary-on-dark)' }}
          aria-label="Clear shortcut"
          title="Clear"
        >
          ×
        </button>
      )}
    </span>
  )
}
