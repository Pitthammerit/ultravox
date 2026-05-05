// app/ui/lib/notifications.js
// Shared kind-to-token mapping so Toast and (future) banners agree on
// the brand palette. Keeps RGB out of components.
export const TONE_TOKENS = {
  success: { color: 'var(--color-accent)',  glyph: '✓' },
  error:   { color: 'var(--color-warning)', glyph: '✗' },
  info:    { color: 'var(--color-secondary)', glyph: 'ⓘ' },
  warning: { color: 'var(--color-star)',    glyph: '⚠' },
}

export const DEFAULT_TOAST_DURATION_MS = {
  success: 2500,
  info:    3500,
  warning: 5000,
  error:   6000,
}
