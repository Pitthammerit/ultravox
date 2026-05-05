import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import VoiceWaveform from './VoiceWaveform.jsx'

const POSITION_STYLES = {
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
}

function truncate(str, max = 24) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

/**
 * VoiceRecordingIndicator — Mini-style floating overlay shown while recording.
 *
 * Renders a small pill (3 dots + mode name + stop X) into document.body via
 * portal. Middle dot pulses faster while the user is speaking (hark VAD).
 *
 * Props:
 *   recording: boolean   — when false, renders null
 *   speaking:  boolean   — drives middle-dot pulse speed
 *   modeName:  string    — label, truncated to 24 chars
 *   position:  string    — 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
 *   onStop:    function  — called when widget body or X is clicked
 */
export default function VoiceRecordingIndicator({
  recording,
  speaking = false,
  modeName = 'Recording…',
  position = 'bottom-right',
  onStop,
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (recording) {
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
  }, [recording])

  if (!recording) return null
  if (typeof document === 'undefined') return null

  const posStyle = POSITION_STYLES[position] || POSITION_STYLES['bottom-right']

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof onStop === 'function') onStop()
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label={`Recording — ${modeName}`}
      onClick={handleClick}
      style={{
        position: 'fixed',
        ...posStyle,
        zIndex: 9999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px 6px 8px',
        borderRadius: 9999,
        background: 'var(--color-primary)',
        color: 'var(--color-primary-on-dark)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transition: 'opacity 120ms ease-out',
        fontSize: 12,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      <VoiceWaveform active={recording} width={44} height={18} />
      <span style={{ whiteSpace: 'nowrap' }}>{truncate(modeName)}</span>
      <button
        type="button"
        aria-label="Stop recording"
        onClick={handleClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 9999,
          background: 'transparent',
          color: 'var(--color-primary-on-dark)',
          border: 0,
          padding: 0,
          marginLeft: 2,
          cursor: 'pointer',
        }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  )
}
