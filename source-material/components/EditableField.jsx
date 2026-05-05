import { useEffect, useRef, useState } from 'react'

/**
 * EditableField — generic click-to-edit wrapper.
 *
 * Three modes:
 *   - text:   single-line input. Enter or blur → save. Escape → cancel.
 *   - select: <select> with `options` (array of {value,label} or strings).
 *             onChange → save. Escape → cancel.
 *   - tags:   array of strings. Each tag has ✕ to remove. A trailing `+`
 *             button spawns an inline input; Enter → push tag.
 *
 * Calls `onSave(newValue)` synchronously. Consumers debounce via
 * `useAutosave` higher up.
 *
 * Default static rendering is a button-styled "pill" that the caller can
 * theme via `className` / `staticClassName`. Provide `renderStatic` for
 * full control.
 */
export default function EditableField({
  value,
  onSave,
  type = 'text',
  options = [],
  placeholder = '',
  className = '',
  staticClassName = '',
  inputClassName = '',
  renderStatic,
  ariaLabel,
}) {
  if (type === 'tags') {
    return (
      <TagsEditor
        value={Array.isArray(value) ? value : []}
        onSave={onSave}
        className={className}
        placeholder={placeholder}
      />
    )
  }
  return (
    <ScalarEditor
      type={type}
      value={value}
      options={options}
      onSave={onSave}
      placeholder={placeholder}
      className={className}
      staticClassName={staticClassName}
      inputClassName={inputClassName}
      renderStatic={renderStatic}
      ariaLabel={ariaLabel}
    />
  )
}

function ScalarEditor({
  type,
  value,
  options,
  onSave,
  placeholder,
  className,
  staticClassName,
  inputClassName,
  renderStatic,
  ariaLabel,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (type === 'text' && typeof inputRef.current.select === 'function') {
        inputRef.current.select()
      }
    }
  }, [editing, type])

  const commit = (next) => {
    setEditing(false)
    if (Object.is(next, value)) return
    onSave(next)
  }
  const cancel = () => {
    setEditing(false)
    setDraft(value ?? '')
  }

  if (!editing) {
    if (renderStatic) {
      return renderStatic({ onActivate: () => setEditing(true) })
    }
    const display = value === '' || value == null
      ? <span style={{ opacity: 0.6 }}>{placeholder || '—'}</span>
      : String(value)
    return (
      <button
        type="button"
        onDoubleClick={() => setEditing(true)}
        onClick={(e) => { if (e.detail >= 2) setEditing(true) }}
        className={[className, staticClassName, 'cursor-text'].filter(Boolean).join(' ')}
        title={ariaLabel || 'Double-click to edit'}
        aria-label={ariaLabel || `Edit ${type}`}
      >
        {display}
      </button>
    )
  }

  if (type === 'select') {
    const opts = normalizeOptions(options, value)
    return (
      <select
        ref={inputRef}
        value={draft ?? ''}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancel() } }}
        className={[className, inputClassName].filter(Boolean).join(' ')}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  // text
  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(draft.trim()) }
        else if (e.key === 'Escape') { e.preventDefault(); cancel() }
      }}
      onBlur={() => commit(draft.trim())}
      className={[className, inputClassName].filter(Boolean).join(' ')}
    />
  )
}

function normalizeOptions(options, current) {
  const out = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value }
  )
  if (current != null && current !== '' && !out.some((o) => o.value === current)) {
    out.unshift({ value: current, label: current })
  }
  return out
}

function TagsEditor({ value, onSave, className, placeholder }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus()
  }, [adding])

  const removeTag = (tag) => onSave(value.filter((t) => t !== tag))
  const addTag = () => {
    const t = draft.trim()
    setAdding(false)
    setDraft('')
    if (!t) return
    if (value.includes(t)) return
    onSave([...value, t])
  }
  const cancel = () => { setAdding(false); setDraft('') }

  return (
    <span className={['inline-flex flex-wrap items-center gap-1.5', className].filter(Boolean).join(' ')}>
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(118, 150, 173, 0.15)',
            color: 'var(--color-secondary)',
          }}
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="opacity-60 hover:opacity-100 leading-none"
            title={`Remove #${tag}`}
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          placeholder={placeholder || 'tag…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag() }
            else if (e.key === 'Escape') { e.preventDefault(); cancel() }
          }}
          onBlur={addTag}
          className="text-[11px] px-1.5 py-0.5 rounded-full outline-none"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            border: '1px solid var(--color-ink-20)',
            color: 'var(--color-text)',
            minWidth: 60,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] px-1.5 py-0.5 rounded-full opacity-70 hover:opacity-100 transition-opacity"
          style={{
            backgroundColor: 'var(--color-ink-faint)',
            color: 'var(--color-secondary)',
            border: '1px dashed var(--color-ink-30)',
          }}
          title="Add tag"
          aria-label="Add tag"
        >
          + tag
        </button>
      )}
    </span>
  )
}
