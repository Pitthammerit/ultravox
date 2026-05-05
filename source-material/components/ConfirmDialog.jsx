// app/ui/components/ConfirmDialog.jsx
import { useEffect, useRef } from 'react'

/**
 * ConfirmDialog — base modal primitive used by every blocking dialog.
 *
 * Props:
 *   open                  — controls render
 *   title                 — heading string
 *   description           — string | ReactNode (paragraph under heading)
 *   tone                  — 'info' (default) | 'warning' | 'destructive'
 *   buttons               — Array<{ id, label, variant }>
 *                           variant: 'primary' | 'destructive' | 'cancel'
 *   onButton              — (id) => void, called when any button clicks
 *   onClose               — () => void, called on Esc + overlay click
 *   children              — optional slot rendered between description + buttons
 *                           (used for the text-input variant by useConfirm)
 *
 * Color logic uses tokens from tokens.css. No hardcoded RGB.
 */
export default function ConfirmDialog({
  open,
  title,
  description = null,
  tone = 'info',
  buttons = [],
  onButton = () => {},
  onClose = () => {},
  children = null,
}) {
  const cardRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    // Auto-focus the first non-cancel button when the dialog opens.
    const focusTarget = cardRef.current?.querySelector('button[data-variant="primary"]')
      || cardRef.current?.querySelector('button')
    focusTarget?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const accent = tone === 'destructive'
    ? 'var(--color-warning)'
    : tone === 'warning'
      ? 'var(--color-star)'
      : 'var(--color-accent)'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-dialog-backdrop)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-md rounded-2xl px-6 py-5 shadow-xl"
        style={{
          backgroundColor: 'var(--color-bg-light)',
          border: `1px solid color-mix(in srgb, ${accent} 20%, transparent)`,
          color: 'var(--color-primary)',
        }}
      >
        <h2
          id="confirm-dialog-title"
          className="font-secondary text-2xl leading-tight mb-2 text-color-primary"
        >
          {title}
        </h2>
        {description && (
          <div className="text-sm leading-relaxed mb-4" style={{ color: 'var(--color-text)' }}>
            {description}
          </div>
        )}
        {children && <div className="mb-4">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2 mt-2">
          {buttons.map((b) => (
            <button
              key={b.id}
              type="button"
              data-variant={b.variant}
              onClick={() => onButton(b.id)}
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={buttonStyle(b.variant)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function buttonStyle(variant) {
  if (variant === 'primary') {
    return {
      backgroundColor: 'var(--color-button-primary-bg)',
      color: 'var(--color-button-primary-fg)',
    }
  }
  if (variant === 'destructive') {
    return {
      backgroundColor: 'var(--color-warning)',
      color: 'var(--color-primary-on-dark)',
    }
  }
  // cancel
  return {
    backgroundColor: 'transparent',
    color: 'var(--color-secondary)',
    border: '1px solid var(--color-secondary)',
  }
}
