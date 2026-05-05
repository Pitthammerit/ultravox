// app/ui/components/ConfirmHost.jsx
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog.jsx'

const ConfirmCtx = createContext(null)

/**
 * useConfirm() — imperative API for blocking dialogs.
 *
 *   const confirm = useConfirm()
 *   const result = await confirm({
 *     title: 'Unsaved changes',
 *     description: 'Save before continuing?',
 *     tone: 'warning',
 *     buttons: [
 *       { id: 'save',    label: 'Save & continue', variant: 'primary' },
 *       { id: 'discard', label: 'Discard',         variant: 'destructive' },
 *       { id: 'cancel',  label: 'Cancel',          variant: 'cancel' },
 *     ],
 *     // Optional: makes a text input visible inside the dialog.
 *     textInput: { defaultValue: '', placeholder: '', readOnly: false, selectAll: false },
 *   })
 *   // result === { button: 'save', value: '<text-input value or undefined>' }
 *
 * `cancel` is the implicit result on Esc / overlay click.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmHost>')
  return ctx
}

export default function ConfirmHost({ children }) {
  const [config, setConfig] = useState(null) // current open dialog config or null
  const resolverRef = useRef(null)
  const [textValue, setTextValue] = useState('')

  const confirm = useCallback((cfg) => {
    setConfig(cfg)
    setTextValue(cfg?.textInput?.defaultValue || '')
    return new Promise((resolve) => { resolverRef.current = resolve })
  }, [])

  const close = (buttonId) => {
    const value = config?.textInput ? textValue : undefined
    const r = resolverRef.current
    resolverRef.current = null
    setConfig(null)
    setTextValue('')
    r?.({ button: buttonId, value })
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!config}
        title={config?.title}
        description={config?.description}
        tone={config?.tone}
        buttons={config?.buttons || []}
        onButton={close}
        onClose={() => close('cancel')}
      >
        {config?.textInput && (
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={config.textInput.placeholder || ''}
            readOnly={!!config.textInput.readOnly}
            autoFocus
            onFocus={(e) => { if (config.textInput.selectAll) e.target.select() }}
            className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{
              backgroundColor: 'var(--color-ink-08)',
              border: '1px solid var(--color-ink-20)',
              color: 'var(--color-primary)',
            }}
          />
        )}
      </ConfirmDialog>
    </ConfirmCtx.Provider>
  )
}
