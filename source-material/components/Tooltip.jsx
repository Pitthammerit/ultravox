import { useState, useId, useRef, useLayoutEffect } from 'react'

/**
 * Brand-styled tooltip with a (?) trigger glyph.
 *
 * Positioning: the bubble is rendered as a sibling of the trigger but uses
 * `position: fixed` with viewport coordinates derived from the trigger's
 * `getBoundingClientRect()`. This deliberately escapes ANY ancestor's
 * `overflow: hidden|auto|scroll` clipping — needed because Tooltip lives
 * inside narrow scroll containers (e.g. the 18rem sidebar) where an
 * `absolute`-positioned bubble would get cut off at the right edge.
 *
 * Edge handling: if the trigger sits within the top 80px of the viewport,
 * the bubble flips to render below the trigger so it doesn't overflow the
 * top of the viewport.
 *
 * Animation slot: outer bubble keeps class .tooltip-bubble — future
 * paint-on animation hooks here without restructuring markup.
 */
export default function Tooltip({ content, position = 'top' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null) // { left, top, place }
  const triggerRef = useRef(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Flip to 'bottom' if the trigger is in the top 80px so the bubble
    // doesn't overflow the top of the viewport.
    const place = position === 'top' && rect.top < 80 ? 'bottom' : position
    // Horizontal viewport clamp — center the bubble on the trigger when
    // possible, but slide it inward whenever centering would push it past
    // either edge. BUBBLE_W matches the `w-64` class (256px); PAD is the
    // breathing room we keep between bubble and viewport edge.
    const BUBBLE_W = 256
    const PAD = 8
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024
    const idealLeft = rect.left + rect.width / 2 - BUBBLE_W / 2
    const minLeft = PAD
    const maxLeft = viewportW - BUBBLE_W - PAD
    const left = Math.max(minLeft, Math.min(maxLeft, idealLeft))
    setCoords({
      left,
      top: place === 'top' ? rect.top : rect.bottom,
      place,
    })
  }, [open, position])

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full text-[10px] cursor-help align-middle"
        style={{
          color: 'var(--color-secondary)',
          border: '1px solid var(--color-secondary)',
          lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && coords && (
        <span
          id={id}
          role="tooltip"
          className="tooltip-bubble w-64 px-3 py-2 rounded-xl text-xs leading-relaxed shadow-md"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            // `left` is already viewport-clamped; only translate vertically
            // so we don't push the bubble back off-screen on the X axis.
            transform:
              coords.place === 'top'
                ? 'translateY(calc(-100% - 8px))'
                : 'translateY(8px)',
            zIndex: 50,
            backgroundColor: 'var(--color-card-overlay)',
            color: 'var(--color-text-on-dark)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--color-ink-15)',
            pointerEvents: 'none',
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
