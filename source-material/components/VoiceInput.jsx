import { useCallback, useEffect, useRef } from 'react'
import { useWhisper } from '@cloudraker/use-whisper'
import { Mic, Square, Loader2 } from 'lucide-react'
import { useVoiceSettings } from '../lib/voiceSettings.js'
import { useVoiceHotkeyTarget } from '../lib/voiceHotkeys.js'
import { buildHintString, getReplacePairs } from '../lib/voiceVocabulary.js'
import { playStartChime, playStopChime, playErrorChime } from '../lib/voiceSounds.js'
import VoiceRecordingIndicator from './VoiceRecordingIndicator.jsx'

// useWhisper calls navigator.mediaDevices.getUserMedia({audio:true}) with no
// way to pass constraints. We patch getUserMedia once on module load to merge
// in deviceId / autoGainControl from the latest voice settings whenever audio
// is requested with the bare `audio: true` shape.
const _audioConstraintsRef = { current: {} }
// Tap into every audio MediaStream that gets created so the recording
// indicator can drive its waveform from real data without prompting twice
// for mic permission.
const _activeStreamRef = { current: null }
const _streamListeners = new Set()
function _publishStream(stream) {
  _activeStreamRef.current = stream
  for (const fn of _streamListeners) {
    try { fn(stream) } catch { /* ignore */ }
  }
}
export function getActiveAudioStream() { return _activeStreamRef.current }
export function subscribeAudioStream(fn) {
  _streamListeners.add(fn)
  fn(_activeStreamRef.current)
  return () => _streamListeners.delete(fn)
}
if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
  const md = navigator.mediaDevices
  if (!md.__bka2brainPatched) {
    const orig = md.getUserMedia.bind(md)
    md.getUserMedia = async (constraints) => {
      let req = constraints
      try {
        const extra = _audioConstraintsRef.current || {}
        const hasExtra = extra.deviceId || typeof extra.autoGainControl === 'boolean'
        if (hasExtra && constraints && constraints.audio) {
          const baseAudio = constraints.audio === true ? {} : { ...constraints.audio }
          if (extra.deviceId) baseAudio.deviceId = { exact: extra.deviceId }
          if (typeof extra.autoGainControl === 'boolean') baseAudio.autoGainControl = extra.autoGainControl
          req = { ...constraints, audio: baseAudio }
        }
      } catch { /* fall through */ }
      const stream = await orig(req)
      // Only publish audio streams (we don't want to pick up display-capture etc.)
      if (stream && stream.getAudioTracks().length > 0) {
        _publishStream(stream)
        // Clear the ref when the user stops the tracks (recording ended).
        for (const track of stream.getAudioTracks()) {
          const onEnded = () => {
            if (_activeStreamRef.current === stream) _publishStream(null)
            track.removeEventListener('ended', onEnded)
          }
          track.addEventListener('ended', onEnded)
        }
      }
      return stream
    }
    md.__bka2brainPatched = true
  }
}

/**
 * VoiceInput — mic-button that records, transcribes, and cleans up speech.
 *
 * Wraps @cloudraker/use-whisper with a custom onTranscribe that hits our
 * CF Voice Worker via a short-lived HMAC token from /api/voice/token.
 *
 * Props:
 *   onTranscribed(text)  → fires once cleanup returns; consumer decides
 *                          where the text lands (textarea, etc.)
 *   mode                 → resolved VoiceMode object (from VoiceModeSwitcher)
 *                          if absent, falls back to legacy free params below
 *   language, cleanup, provider, model, promptSuffix, autocapitalize
 *                        → legacy fall-throughs when no `mode` is supplied
 *   disabled             → suppress interaction
 */
export default function VoiceInput({
  onTranscribed,
  mode,
  language,
  cleanup,
  provider,
  model,
  promptSuffix,
  autocapitalize,
  disabled = false,
}) {
  const [voiceSettings] = useVoiceSettings()

  // Resolve effective config. Mode object wins; otherwise fall back to props
  // and finally to safe defaults.
  const cfg = {
    language: mode?.language ?? language ?? 'auto',
    cleanup: mode?.cleanup ?? cleanup ?? 'prose',
    provider: mode?.languageModelProvider ?? provider ?? 'openrouter',
    model: mode?.languageModel ?? model ?? '',
    promptSuffix: mode?.promptSuffix ?? promptSuffix ?? '',
    autocapitalize: mode?.autocapitalize ?? autocapitalize ?? false,
  }

  const recordingArchive = voiceSettings?.recording || {}

  // Stable ref so useWhisper's onTranscribe never sees stale closures.
  const cfgRef = useRef({
    ...cfg,
    onTranscribed,
    vocabulary: voiceSettings.vocabulary || [],
    keepRecordings: recordingArchive.keepRecordings === true,
    modeId: mode?.id || null,
  })
  cfgRef.current = {
    ...cfg,
    onTranscribed,
    vocabulary: voiceSettings.vocabulary || [],
    keepRecordings: recordingArchive.keepRecordings === true,
    modeId: mode?.id || null,
  }

  const sound = voiceSettings?.sound || {}
  useEffect(() => {
    _audioConstraintsRef.current = {
      deviceId: sound.deviceId || null,
      autoGainControl: typeof sound.autoGain === 'boolean' ? sound.autoGain : true,
    }
  }, [sound.deviceId, sound.autoGain])

  const soundRef = useRef(sound)
  soundRef.current = sound

  const rootRef = useRef(null)
  const cancelRequestedRef = useRef(false)

  const fetchToken = useCallback(async () => {
    const res = await fetch('/api/voice/token')
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `token endpoint ${res.status}`)
    }
    return { token: data.token, apiUrl: data.apiUrl }
  }, [])

  const onTranscribe = useCallback(async (blob) => {
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false
      return { blob, text: '' }
    }
    try {
      const { token, apiUrl } = await fetchToken()
      const { language, cleanup, provider, model, promptSuffix, autocapitalize, onTranscribed, vocabulary } = cfgRef.current

      const endpoint = cleanup === 'raw' ? '/v1/audio/transcriptions' : '/v1/audio/clean'
      const fd = new FormData()
      fd.append('file', blob, 'audio.webm')
      if (language && language !== 'auto') fd.append('language', language)

      if (cleanup !== 'raw') {
        fd.append('cleanup', cleanup)
        fd.append('provider', provider)
        if (model) fd.append('model', model)
        if (promptSuffix) fd.append('promptSuffix', promptSuffix)
        if (autocapitalize) fd.append('autocapitalize', 'true')

        const hints = buildHintString(vocabulary)
        const replacements = getReplacePairs(vocabulary)
        if (hints) fd.append('vocabularyHints', hints)
        if (replacements.length) fd.append('vocabularyReplacements', JSON.stringify(replacements))
      } else {
        // Raw transcribe — still send hints so Whisper biases toward known terms.
        const hints = buildHintString(vocabulary)
        if (hints) fd.append('vocabularyHints', hints)
      }

      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`voice worker ${res.status}: ${errText}`)
      }
      const data = await res.json()
      const text = data.text || ''
      if (text && typeof onTranscribed === 'function') onTranscribed(text)

      if (cfgRef.current.keepRecordings) {
        const archiveFd = new FormData()
        archiveFd.append('file', blob, 'audio.webm')
        archiveFd.append('metadata', JSON.stringify({
          modeId: cfgRef.current.modeId,
          text,
        }))
        fetch('/api/voice/recordings', { method: 'POST', body: archiveFd })
          .catch((err) => console.warn('[voice-archive] save failed:', err?.message))
      }

      return { blob, text }
    } catch (err) {
      const s = soundRef.current
      if (s?.soundEffects) playErrorChime(s.soundEffectVolume ?? 0.5)
      throw err
    }
  }, [fetchToken])

  const { recording, transcribing, speaking, startRecording, stopRecording } = useWhisper({
    apiKey: 'unused',
    onTranscribe,
    // Disabled: ffmpeg-wasm requires SharedArrayBuffer + COEP/COOP headers
    // which Vite dev doesn't ship by default. Whisper handles silence on
    // the server side anyway.
    removeSilence: false,
  })

  useVoiceHotkeyTarget(
    { recording, startRecording, stopRecording },
    { rootRef, cancelRequestedRef },
  )

  const prevRecordingRef = useRef(false)
  useEffect(() => {
    const prev = prevRecordingRef.current
    const s = soundRef.current
    if (s?.soundEffects) {
      const vol = s.soundEffectVolume ?? 0.5
      if (!prev && recording) playStartChime(vol)
      else if (prev && !recording) playStopChime(vol)
    }
    prevRecordingRef.current = recording
  }, [recording])

  const state = recording ? 'recording' : transcribing ? 'busy' : 'idle'
  const label = recording
    ? 'Stop recording'
    : transcribing ? 'Transcribing…'
    : (mode?.name ? `Start dictation — ${mode.name}` : 'Start dictation')

  const handleClick = (e) => {
    e.preventDefault()
    if (disabled || transcribing) return
    if (recording) stopRecording()
    else startRecording()
  }

  return (
    <>
      <button
        ref={rootRef}
        type="button"
        onClick={handleClick}
        disabled={disabled || transcribing}
        title={label}
        aria-label={label}
        data-state={state}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 disabled:opacity-40 text-color-primary hover:bg-color-ink-08 hover:scale-110 active:scale-90 active:bg-color-primary/20 mr-1"
      >
        {recording
          ? <Square size={14} fill="currentColor" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
          : transcribing
          ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          : <Mic size={16} aria-hidden="true" />}
      </button>
      {/* If two VoiceInputs are mounted and somehow both recording, both would
          render an indicator. In practice useWhisper.recording is per-instance
          and only the active mic-button toggles it, so collisions are rare. */}
      <VoiceRecordingIndicator
        recording={recording}
        speaking={speaking}
        modeName={mode?.name || 'Recording…'}
        position={voiceSettings.indicator?.position || 'bottom-right'}
        onStop={stopRecording}
      />
    </>
  )
}
