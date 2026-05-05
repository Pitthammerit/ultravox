import { useEffect, useRef, useState } from 'react'
import { Settings2, Check, Mic } from 'lucide-react'
import * as Lucide from 'lucide-react'
import { useVoiceSettings, setLastUsedMode } from '../lib/voiceSettings.js'
import { pickModeForPanel } from '../lib/voiceModes.js'

/**
 * VoiceModeSwitcher — dropdown that selects the active voice mode for a panel.
 *
 * Reads modes + lastUsedModes from voice-settings.json. On select, persists
 * to lastUsedModes[panel] so reopening the panel restores the choice.
 *
 * Props:
 *   panel        — string id of the panel ('inbox', 'rawEditor', 'ingest')
 *   value        — controlled mode id (optional; otherwise picked from settings)
 *   onChange     — called with (mode object) whenever selection changes
 *   disabled     — suppress interaction
 */
export default function VoiceModeSwitcher({ panel, value, onChange, disabled = false }) {
  const [settings] = useVoiceSettings()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const selectedMode = value
    ? settings.modes.find((m) => m.id === value) || pickModeForPanel(settings, panel)
    : pickModeForPanel(settings, panel)

  // Notify parent on first resolution + whenever the selected id changes underneath us.
  useEffect(() => {
    if (selectedMode && typeof onChange === 'function') {
      onChange(selectedMode)
    }
  }, [selectedMode?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside-click.
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function pick(mode) {
    setOpen(false)
    setLastUsedMode(panel, mode.id)
    if (typeof onChange === 'function') onChange(mode)
  }

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={selectedMode?.name || 'Voice mode'}
        aria-label={selectedMode?.name ? `Voice mode: ${selectedMode.name}` : 'Voice mode'}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 disabled:opacity-40 text-color-primary hover:bg-color-ink-08 hover:scale-110 active:scale-90 active:bg-color-primary/20"
      >
        <Settings2 size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-lg shadow-lg border bg-white py-1"
          style={{ borderColor: 'var(--color-ink-15)' }}
        >
          {settings.modes.map((mode) => {
            const isActive = selectedMode?.id === mode.id
            const Icon = (mode.icon && Lucide[mode.icon]) || Mic
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => pick(mode)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-color-ink-faint text-color-primary"
              >
                <Icon size={14} aria-hidden="true" />
                <span className="flex-1 truncate">{mode.name}</span>
                {isActive && <Check size={14} aria-hidden="true" className="text-color-accent" />}
              </button>
            )
          })}
          {settings.modes.length === 0 && (
            <div className="px-3 py-2 text-xs text-color-secondary italic">
              No modes configured.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
