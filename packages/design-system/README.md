# @ultravox/design-system

Shared design system for Ultravox. Consumed by the Tauri app (`apps/ultravox`) today and by the future Ultravox marketing website.

## What's in here

- `src/tokens.css` — verbatim copy of the bka2brain design tokens. Three themes (`:root` light, `[data-theme="dark-ocean"]`, `[data-theme="dark-night"]`), 18 typography tokens, ink/surface scales, motion utilities, and dark-mode utility overrides. Authored against Tailwind v4 (`@import "tailwindcss"` + `@theme {}` + `@utility`).
- `src/fonts.css` — `@font-face` declarations for the bundled fonts.
- `src/theme.ts` — runtime-agnostic theme APIs: `applyTheme`, `subscribeSystemAppearance`, `createThemeController(storage)`. No Tauri or browser-extension imports.
- `assets/fonts/*.woff2` — bundled fonts (Latin + Latin-extended subsets).

## Consuming

```ts
// apps/ultravox/src/main.tsx
import "@ultravox/design-system/fonts.css";
import "@ultravox/design-system/tokens.css";
import { applyTheme, createThemeController } from "@ultravox/design-system";
```

The package does **not** import Tauri. Each app provides its own storage adapter conforming to the `ThemeStorage` interface (Tauri app: `tauri-plugin-store`; website: `localStorage`).

## Bundled fonts

| Family | Weights / styles | File |
|---|---|---|
| DM Sans | 400, 500, 600 | `dm-sans-{400,500,600}.woff2` |
| Cormorant Garamond | 400 regular, 400 italic | `cormorant-garamond-400.woff2`, `cormorant-garamond-400-italic.woff2` |

Kalam (the `--font-handwriting` token) is intentionally not bundled in v1.

### Re-downloading the fonts

Sourced from Google Fonts via [google-webfonts-helper](https://gwfh.mranftl.com/) with Latin + Latin-extended subsets, woff2-only. Reproducible URLs:

- `https://gwfh.mranftl.com/api/fonts/dm-sans?subsets=latin,latin-ext&variants=regular,500,600&formats=woff2&download=zip`
- `https://gwfh.mranftl.com/api/fonts/cormorant-garamond?subsets=latin,latin-ext&variants=regular,italic&formats=woff2&download=zip`

After unzipping, rename to the conventions in the table above and place under `assets/fonts/`.

## Token sync

`src/tokens.css` is a copy of `source-material/styles/tokens.css` (which itself is a copy of bka2brain's `app/ui/tokens.css`, ultimately sourced from `~/Documents/websites/regression-landing/regression/frontend/tailwind.config.css`).

Sync direction: regression-landing → bka2brain → `source-material/` → here. When tokens change upstream, copy the file verbatim and bump the date in this README.

| Last synced | From |
|---|---|
| 2026-05-05 | `source-material/styles/tokens.css` (matches bka2brain 2026-04-25) |

## What this package will not do

- It will not import Tauri APIs. The Tauri app provides adapters for storage and event broadcasting.
- It will not version or theme components. Components live in apps (or the future `@ultravox/voice-core` package); this package only ships tokens, fonts, and theme runtime.
- It will not be published to npm in v1. Workspace-only.
