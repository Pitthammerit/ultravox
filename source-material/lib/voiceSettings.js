/**
 * UI-side voice-settings client — talks to /api/voice/settings.
 *
 * Mirrors the pattern of lib/settings.js (single in-memory cache + listener
 * registry + `useVoiceSettings()` hook) but for the separate
 * voice-settings.json document.
 */
import { useEffect, useState } from 'react'

const DEFAULTS = {
  schemaVersion: 1,
  enabled: true,
  modes: [],
  defaultModes: { inbox: null, rawEditor: null, ingest: null },
  lastUsedModes: { inbox: null, rawEditor: null, ingest: null },
  vocabulary: [],
  globalHotkeys: { toggleRecording: null, cancelRecording: 'Escape' },
  indicator: { position: 'bottom-right' },
  sound: {
    deviceId: null,
    autoGain: true,
    silenceRemoval: false,
    soundEffects: true,
    soundEffectVolume: 0.5,
  },
  recording: {
    keepRecordings: false,
    retention: '30d',
    storage: 'auto',
    localPath: '~/Documents/bka2brain-voice/',
    restoreClipboard: true,
  },
}

let _cache = DEFAULTS
let _loaded = false
const _listeners = new Set()

function emit() {
  for (const fn of _listeners) {
    try { fn(_cache) } catch { /* ignore */ }
  }
}

function mergeDefaults(server) {
  // Defensive — server is authoritative but we patch in DEFAULTS for any
  // newly-added keys in this client that the server hasn't seen yet.
  return {
    ...DEFAULTS,
    ...(server || {}),
    defaultModes: { ...DEFAULTS.defaultModes, ...(server?.defaultModes || {}) },
    lastUsedModes: { ...DEFAULTS.lastUsedModes, ...(server?.lastUsedModes || {}) },
    globalHotkeys: { ...DEFAULTS.globalHotkeys, ...(server?.globalHotkeys || {}) },
    indicator: { ...DEFAULTS.indicator, ...(server?.indicator || {}) },
    sound: { ...DEFAULTS.sound, ...(server?.sound || {}) },
    recording: { ...DEFAULTS.recording, ...(server?.recording || {}) },
    modes: Array.isArray(server?.modes) ? server.modes : [],
    vocabulary: Array.isArray(server?.vocabulary) ? server.vocabulary : [],
  }
}

export async function loadVoiceSettings() {
  try {
    const res = await fetch('/api/voice/settings')
    if (res.ok) {
      const data = await res.json()
      if (data?.ok && data.settings) {
        _cache = mergeDefaults(data.settings)
        _loaded = true
        emit()
        return _cache
      }
    }
  } catch (err) {
    console.warn('[voice-settings] load failed:', err.message)
  }
  _loaded = true
  return _cache
}

export function getVoiceSettings() { return _cache }
export function isLoaded() { return _loaded }

/** PUT a partial patch (deep-merged on the server). */
export async function setVoiceSettings(patch) {
  const res = await fetch('/api/voice/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data?.ok && data.settings) {
    _cache = mergeDefaults(data.settings)
    emit()
    return _cache
  }
  throw new Error(data?.error || 'unknown error')
}

/** Replace the modes array entirely. */
export async function replaceModes(modes) {
  const res = await fetch('/api/voice/settings/modes', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modes }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data?.ok && data.settings) {
    _cache = mergeDefaults(data.settings)
    emit()
    return _cache
  }
  throw new Error(data?.error || 'unknown error')
}

/** Replace the vocabulary array entirely. */
export async function replaceVocabulary(vocabulary) {
  const res = await fetch('/api/voice/settings/vocabulary', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vocabulary }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data?.ok && data.settings) {
    _cache = mergeDefaults(data.settings)
    emit()
    return _cache
  }
  throw new Error(data?.error || 'unknown error')
}

/** Update the last-used mode for a given panel (called when user picks one). */
export async function setLastUsedMode(panel, modeId) {
  // Optimistic local update — the panel switcher should feel instant.
  _cache = {
    ..._cache,
    lastUsedModes: { ..._cache.lastUsedModes, [panel]: modeId },
  }
  emit()

  try {
    const res = await fetch('/api/voice/settings/last-used', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ panel, modeId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.ok && data.settings) {
        _cache = mergeDefaults(data.settings)
        emit()
      }
    }
  } catch (err) {
    console.warn('[voice-settings] lastUsed PUT failed:', err.message)
  }
}

/** React hook — returns [settings, setVoiceSettings]. Auto-subscribes to cache updates. */
export function useVoiceSettings() {
  const [snap, setSnap] = useState(_cache)
  useEffect(() => {
    const fn = (next) => setSnap(next)
    _listeners.add(fn)
    if (_cache !== snap) setSnap(_cache)
    if (!_loaded) loadVoiceSettings()
    return () => { _listeners.delete(fn) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return [snap, setVoiceSettings]
}
