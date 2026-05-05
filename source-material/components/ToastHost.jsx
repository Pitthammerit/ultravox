// app/ui/components/ToastHost.jsx
import { createContext, useCallback, useContext, useState } from 'react'
import Toast from './Toast.jsx'
import { DEFAULT_TOAST_DURATION_MS } from '../lib/notifications.js'

const ToastCtx = createContext(null)

/**
 * useToast() — fire-and-forget notification API.
 *
 *   const toast = useToast()
 *   toast({ kind: 'success', message: '✓ Saved' })
 *   toast({ kind: 'error', message: 'Download failed', detail: 'HTTP 500' })
 *   toast({ kind: 'info', message: 'Reload required', action: { label: 'Reload', onClick: () => location.reload() } })
 *
 * Returns a dismiss function so callers can manually cancel a toast.
 */
export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastHost>')
  return ctx
}

let _seq = 0

export default function ToastHost({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((cfg) => {
    const id = ++_seq
    const duration = cfg.duration ?? DEFAULT_TOAST_DURATION_MS[cfg.kind || 'info']
    setToasts((prev) => [...prev, { id, ...cfg, duration }])
    return () => dismiss(id)
  }, [dismiss])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast {...t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
