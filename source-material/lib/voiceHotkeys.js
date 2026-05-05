/**
 * Global voice hotkeys — toggle recording + cancel recording.
 *
 * Hotkey strings use the same format produced by HotkeyRecorder.jsx:
 *   "Cmd+Shift+M" / "Escape" / "Cmd+1"
 * Modifier order is Cmd, Ctrl, Alt, Shift; non-modifier key is upper-cased
 * for letters and uses KeyboardEvent.key for everything else (Space, Escape,
 * Enter, Tab, ArrowUp, …).
 *
 * Architecture:
 *   - Each mounted VoiceInput registers itself via useVoiceHotkeyTarget(),
 *     pushing a record into the module-level _targets registry. Most-recently
 *     mounted wins as the active target (typical case: user just switched
 *     panels, that VoiceInput is now what they expect to drive).
 *   - useGlobalVoiceHotkeys() (mounted once, in App.jsx) listens for keydown,
 *     parses the configured shortcuts from voice-settings, and dispatches
 *     start/stop/cancel on the active target.
 *
 * Limitations:
 *   - useWhisper has no native "cancel" — we set a flag on the target so its
 *     onTranscribe early-returns, then call stopRecording.
 *   - Per-mode hotkeys (mode.hotkey field) are NOT yet dispatched; wiring
 *     would require panels to expose a setMode callback. Schema + recorder
 *     are in place for a follow-up phase.
 */
import { useEffect, useRef } from 'react'
import { useVoiceSettings } from './voiceSettings.js'

const _targets = []

function activeTarget() {
  if (_targets.length === 0) return null
  // Prefer a target whose textarea (sibling form context) currently owns
  // focus; otherwise fall back to the most recently mounted one.
  const focused = document.activeElement
  if (focused && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT' || focused.isContentEditable)) {
    for (let i = _targets.length - 1; i >= 0; i--) {
      const t = _targets[i]
      const root = t.rootRef?.current
      if (root && root.parentElement && root.parentElement.contains(focused)) return t
    }
  }
  return _targets[_targets.length - 1]
}

function recordingTarget() {
  for (let i = _targets.length - 1; i >= 0; i--) {
    if (_targets[i].api.recording) return _targets[i]
  }
  return null
}

/**
 * Normalize a KeyboardEvent's physical key into a hotkey label that survives
 * modifier transforms (e.g. Mac Option+Space → U+00A0, Option+letter → unicode
 * dead-key glyph). Uses event.code (physical position) as the source of
 * truth, falling back to event.key for layouts where code is empty.
 *
 * Examples:
 *   { code: 'Space' }      → 'Space'
 *   { code: 'KeyA' }       → 'A'
 *   { code: 'Digit1' }     → '1'
 *   { code: 'Escape' }     → 'Escape'
 *   { code: 'ArrowUp' }    → 'ArrowUp'
 *   { code: 'F12' }        → 'F12'
 */
export function normalizeKey(event) {
  const code = event.code
  if (code) {
    if (code.startsWith('Key')) return code.slice(3)        // KeyA → A
    if (code.startsWith('Digit')) return code.slice(5)      // Digit1 → 1
    if (code.startsWith('Numpad')) return code.slice(6)     // Numpad1 → 1
    // Space, Escape, Enter, Tab, Backspace, Delete, ArrowUp/Down/Left/Right,
    // Home, End, PageUp, PageDown, F1-F12, Minus, Equal, Comma, Period,
    // Slash, Backslash, Quote, Semicolon, BracketLeft, BracketRight,
    // Backquote — all pass through as-is.
    return code
  }
  // Fallback for environments without e.code (older mobile browsers, IME).
  let k = event.key
  if (!k) return ''
  if (k === ' ' || k === ' ') return 'Space'
  if (k.length === 1) return k.toUpperCase()
  return k
}

/** True on macOS (incl. iPadOS that reports as 'MacIntel'). */
export function isMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPad|iPhone|iPod/.test(navigator.platform || navigator.userAgent || '')
}

/**
 * Render a stored canonical hotkey ("Cmd+Shift+M") in platform-native form.
 * On Mac: ⌘⇧M (no plus signs, modifiers as glyphs). On other OSes: Ctrl+Shift+M.
 * Stored value never changes — this is purely display.
 */
export function formatHotkey(value, { mac = isMac() } = {}) {
  if (!value || typeof value !== 'string') return ''
  const parts = value.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  if (mac) {
    const map = { Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
    return parts.map((p) => map[p] ?? p).join('+')
  }
  return parts.join('+')
}

/** Parse + match. `event` is a KeyboardEvent. */
export function matchesHotkey(event, hotkeyString) {
  if (!event || !hotkeyString || typeof hotkeyString !== 'string') return false
  const parts = hotkeyString.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return false
  const wantCmd = parts.includes('Cmd')
  const wantCtrl = parts.includes('Ctrl')
  const wantAlt = parts.includes('Alt')
  const wantShift = parts.includes('Shift')
  const key = parts[parts.length - 1]
  if (['Cmd', 'Ctrl', 'Alt', 'Shift'].includes(key)) return false

  if (Boolean(event.metaKey) !== wantCmd) return false
  if (Boolean(event.ctrlKey) !== wantCtrl) return false
  if (Boolean(event.altKey) !== wantAlt) return false
  if (Boolean(event.shiftKey) !== wantShift) return false

  return normalizeKey(event) === key
}

function isTypingTarget(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'
}

/**
 * Register a VoiceInput as a hotkey target. Caller supplies its own rootRef
 * + cancelRequestedRef so they can be created at the top of the component
 * (before useWhisper) and referenced inside the consumer's onTranscribe.
 */
export function useVoiceHotkeyTarget(api, { rootRef, cancelRequestedRef }) {
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    const entry = {
      get api() { return apiRef.current },
      rootRef,
      cancelRequestedRef,
    }
    _targets.push(entry)
    return () => {
      const idx = _targets.indexOf(entry)
      if (idx >= 0) _targets.splice(idx, 1)
    }
  }, [rootRef, cancelRequestedRef])
}

/**
 * Mount once at the App root. Listens for the configured global hotkeys and
 * drives whichever VoiceInput target is currently active.
 */
export function useGlobalVoiceHotkeys() {
  const [voiceSettings] = useVoiceSettings()
  const settingsRef = useRef(voiceSettings)
  settingsRef.current = voiceSettings

  useEffect(() => {
    function onKey(e) {
      const s = settingsRef.current
      const hk = s?.globalHotkeys || {}
      const toggle = hk.toggleRecording
      const cancel = hk.cancelRecording

      const typing = isTypingTarget(e.target)

      if (cancel && matchesHotkey(e, cancel)) {
        const tgt = recordingTarget()
        if (tgt) {
          e.preventDefault()
          e.stopPropagation()
          tgt.cancelRequestedRef.current = true
          try { tgt.api.stopRecording?.() } catch { /* ignore */ }
          return
        }
        // No recording in flight → don't swallow Escape; let inputs use it.
      }

      if (toggle && matchesHotkey(e, toggle)) {
        // Toggle is global; allowed even from typing context because the
        // user explicitly bound a chord (e.g. Cmd+Shift+M).
        const rec = recordingTarget()
        if (rec) {
          e.preventDefault()
          try { rec.api.stopRecording?.() } catch { /* ignore */ }
          return
        }
        const tgt = activeTarget()
        if (tgt) {
          e.preventDefault()
          try { tgt.api.startRecording?.() } catch { /* ignore */ }
          return
        }
      }

      // TODO: per-mode hotkeys — when InboxCaptureForm/RawEditor expose a
      // setMode callback through the target registry, dispatch here by
      // iterating s.modes and matching mode.hotkey.
      void typing
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
