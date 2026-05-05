---
name: design-system
description: Regression brand design tokens and source location
type: reference
originSessionId: 605a1133-95a0-49c2-9632-5fdb5b53a66c
---
# Design System — Regression Brand

## Source Location

**Primary source:** `~/Documents/websites/regression-landing/regression/frontend/tailwind.config.css`

**Local copy:** `app/ui/tokens.css`

## Sync Protocol

- Manual sync only — copy tokens from source to `app/ui/tokens.css`
- File header records last-sync date (currently: 2026-04-25)
- When adding new tokens: check source first, then sync to local copy

## Key Tokens (frequently used)

```
--color-primary:      #224160   dark navy — headings, buttons, dark bg
--color-secondary:    #7696AD   muted steel blue — labels, metadata
--color-accent:       #2DAD71   green — success, CTAs
--color-warning:      #DC2626   red — errors, destructive
--color-star:         #f5d10a   yellow — highlights
--color-bg-light:     #EDE7DC   warm cream — main bg
--color-dialog-backdrop: rgba(34,65,96,0.40)
--color-text:         #5A5550   warm taupe gray — body text
```

## Typography

```
--font-primary:      "DM Sans", system-ui, sans-serif
--font-secondary:    "Cormorant Garamond", Georgia, serif
--font-handwriting:  "Kalam", cursive
```

Headlines use `font-secondary` (serif), body uses `font-primary` (sans).

## Pattern: Opacity on Tokens

**Mandatory:** Use Tailwind token classes for all color styling. Inline styles only when value is JS-computed — use `color-mix(in srgb, var(--token) 20%, transparent)`, never hardcoded RGBA.

## Known rgba ↔ token mapping (anti-pattern gotcha)
- `rgba(34, 65, 96, ...)` → `var(--color-primary)` with color-mix or Tailwind
- `rgba(45, 173, 113, ...)` → `var(--color-accent)` with color-mix or Tailwind

## Brand Context

This is the Regression brand (past-life regression therapy website). The same tokens will be shared across:
- Regression landing site (source)
- BKA-2nd-Brain (local copy, this repo)
- Future: Reiki, EMDR sites (same brand family)

When brand tokens change in source, sync to `app/ui/tokens.css` and verify nothing breaks.
