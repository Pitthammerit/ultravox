// app/ui/components/Toast.jsx
import { useEffect, useRef, useState } from 'react'
import { TONE_TOKENS } from '../lib/notifications.js'

/**
 * Single toast. Auto-dismisses after `duration` ms. Hovering pauses the
 * timer — the user gets a chance to read longer messages without the
 * thing yanking out from under them.
 *
 * The progress bar at the bottom drains visually so the user knows when
 * it'll dismiss.
 */
const LEAVE_MS = 150

export default function Toast({ id, kind = 'info', message, detail, action, duration, onDismiss }) {
  const tone = TONE_TOKENS[kind] || TONE_TOKENS.info
  const [leaving, setLeaving] = useState(false)
  const [paused, setPaused] = useState(false)
  const startRef = useRef(Date.now())
  const remainingRef = useRef(duration)
  const timerRef = useRef(null)

  function startLeave() {
    if (leaving) return
    setLeaving(true)
    setTimeout(() => onDismiss(id), LEAVE_MS)
  }

  useEffect(() => {
    if (paused) {
      remainingRef.current = remainingRef.current - (Date.now() - startRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
      return undefined
    }
    startRef.current = Date.now()
    timerRef.current = setTimeout(startLeave, remainingRef.current)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, id])

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={startLeave}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-sm cursor-pointer ${leaving ? 'toast-leave' : 'toast-enter'}`}
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(34,65,96,0.12)',
        color: 'var(--color-primary)',
      }}
    >
      <span aria-hidden="true" className="text-xs" style={{ color: 'var(--color-primary)' }}>
        {tone.glyph}
      </span>
      <span className="text-sm font-medium leading-none">{message}</span>
      {detail && (
        <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>{detail}</span>
      )}
      {action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); action.onClick(); onDismiss(id) }}
          className="text-xs underline focus:outline-none focus-visible:ring-1"
          style={{ color: 'var(--color-secondary)' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
