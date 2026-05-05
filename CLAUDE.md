# Ultravox — Claude context

## What this is

Standalone macOS Tauri 2 voice-dictation companion app. Inspired by Superwhisper / Wispr Flow but built on React components extracted from bka2brain (sibling project at `/Users/benjaminkurtz/Documents/localcoding/bka2brain`). Global hotkey → record → transcribe via existing CF Voice Worker → paste into the focused app's text field.

**Working name:** `ultravox`. Real name will be one of: **Banter / Ozma / Speakboard** (decided pre-launch via trademark check). All branding strings live in `src/branding.ts` so renaming is one-file-edit + 3 config tweaks.

**Status (2026-05-05):** Brainstorm + design + implementation plan complete. Reference code copied from bka2brain into `source-material/`. Project not yet scaffolded — Phase 2 of the implementation plan creates the Tauri app via `pnpm create tauri-app`.

**Sibling project:** `/Users/benjaminkurtz/Documents/localcoding/bka2brain` — do **not** import from it. Components are duplicated into `source-material/` to be ported, not symlinked.

**Git remote:** `https://github.com/Pitthammerit/ultravox.git` (SSH form: `git@github.com:Pitthammerit/ultravox.git`). Push to `main`.

## How to start work in this project

1. Read `docs/research.md` — feature inventory, Superwhisper architecture comparison, locked decisions.
2. Read `docs/design.md` — Tauri 2 architecture, Rust modules, UI states, build pipeline.
3. Read `docs/implementation-plan.md` — 18-phase bite-sized task list.
4. Pick the next unchecked task from the implementation plan and execute it via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

## Tech stack

- **Shell:** Tauri 2 (Rust main process, system WebView for renderer — WKWebView on macOS)
- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind v4 (`@tailwindcss/vite`) + CSS custom properties from `source-material/styles/tokens.css`
- **State:** `tauri-plugin-store` for settings, `tauri-plugin-stronghold` for the BYO API key
- **Audio:** Web `MediaRecorder` API (no native audio library)
- **Transcription:** Existing CF Voice Worker at `https://<worker>.<account>.workers.dev` (reused from bka2brain — `/v1/audio/transcriptions` and `/v1/audio/clean`)
- **Global hotkey:** `tauri-plugin-global-shortcut`
- **Paste:** `enigo` Rust crate (Cmd+V simulation, brief clipboard clobber). v1.1+ swaps in native macOS Accessibility API.
- **Frontmost-app detection:** `objc2-app-kit` → `NSWorkspace.frontmostApplication`
- **Auto-update:** `tauri-plugin-updater` + GitHub Releases appcast
- **Telemetry:** Sentry (Rust + React sides)

## v1 scope (locked)

- Global hotkey (default `⌘⇧;`) records into focused app
- 4 starter modes: Email / Message / Note / Code (read-only — editor in v1.1)
- Mode switcher overlay (`⌥⇧K`) with numeric quick-select
- Auto-mode based on frontmost app's bundle id (curated `apps.json`, ~15 entries)
- Vocabulary editor (source → replacement)
- Push-to-talk
- Settings shell with sidebar IA: Home / Modes / Vocabulary / Configuration / Sound / History
- First-run onboarding wizard
- Tray icon
- macOS-only, code-signed + notarized DMG, direct download
- **No auth, no payment in v1** — anonymous, BYO OpenRouter key

**Out of scope for v1:** Magic-link auth, Stripe, mode editor, file transcription, History panel real impl, native AX-API paste, Mini window style, Windows port. All deferred to v1.1+.

## Commands (after scaffolding in Phase 2)

```bash
pnpm install          # install deps
pnpm tauri dev        # run Tauri dev (opens settings window + pill window)
pnpm tauri build      # produce signed + notarized DMG (requires APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID env vars)
pnpm test             # vitest for React + ts logic
cd src-tauri && cargo test   # Rust unit tests
```

## Design tokens (canonical)

Source of truth: `source-material/styles/tokens.css` (copied verbatim from bka2brain `app/ui/tokens.css`). Sync from the Regression brand project when tokens change there: `~/Documents/websites/regression-landing/regression/frontend/tailwind.config.css`.

Key tokens used in the floating pill, settings, and onboarding:

```
--color-primary:      #224160   dark navy — headings, buttons, dark bg
--color-secondary:    #7696AD   muted steel blue — labels, metadata
--color-accent:       #2DAD71   green — success, recording active
--color-warning:      #DC2626   red — errors, destructive
--color-star:         #f5d10a   yellow — highlights
--color-bg-light:     #EDE7DC   warm cream — main bg
--color-text:         #5A5550   warm taupe gray — body text
--color-dialog-backdrop: rgba(34,65,96,0.40)
--color-primary-on-dark: #FFFFFF
--color-secondary-on-dark: #ffffff9c
```

## Tailwind v4 setup pattern

bka2brain uses Tailwind v4 with the new `@theme` syntax inside `tokens.css`. Pattern to replicate:

1. Install: `pnpm add -D tailwindcss @tailwindcss/vite`
2. Vite config: `import tailwindcss from '@tailwindcss/vite'; plugins: [react(), tailwindcss()]`
3. Single CSS entry imports `@import "tailwindcss"` then the tokens via `@theme {}` blocks (or just `:root { --color-primary: ... }` for non-utility-bound vars)
4. Use Tailwind utility classes referencing tokens: `bg-color-primary`, `text-color-secondary`, `border-color-accent/30`

The same approach carries over here: copy `source-material/styles/tokens.css` into `src/styles/tokens.css`, import it from `src/main.tsx`, and you have the entire bka2brain visual language available.

## Key conventions (carried over from bka2brain)

**Commits:** Never add `Co-Authored-By` trailers. Commits attributed to Benjamin only.

**Verification:** Smoke-test on localhost first. The Tauri dev window is the equivalent of bka2brain's `:5173` — verify there before building a signed DMG.

**Questions:** When asking a bounded-choice question, use the `AskUserQuestion` tool — not prose A/B/C options.

**Comments:** Default to no comments. Only when the WHY is non-obvious.

**Colors:** Use Tailwind token classes (`text-color-primary`, `bg-color-primary/20`, `border-color-secondary/30`). When a value must be inline, use `color-mix(in srgb, var(--token) 20%, transparent)`. Hardcoded RGB never acceptable.

**Iteration workflow:** After completing a task: `git commit && git push origin main`. Update the corresponding checkbox in `docs/implementation-plan.md`.

**Cross-runtime helpers:** When a function is needed in both React and Rust, prefer two parallel implementations (TS + Rust) over an FFI bridge unless performance demands otherwise. The bka2brain `app/shared/` pattern (one canonical implementation re-exported to both ends) only works in pure-JS contexts.

## Inherited memory

Reference docs at `docs/inherited-memory/` are copies of memory entries from the bka2brain project. They document conventions, learnings, and decisions worth carrying over:

- `feedback_ask_user_question_tool.md` — use `AskUserQuestion` for bounded-choice questions
- `feedback_no_claude_coauthor.md` — no `Co-Authored-By` trailers
- `feedback_localhost_first.md` — verify on dev before deploy
- `feedback_shared_layer.md` — cross-runtime helper convention
- `reference_design_system.md` — Regression brand tokens source path
- `project_openrouter_key_strategy.md` — admin (own key) vs published-user (managed key) — relevant for v1.5

These are reference, not auto-loaded. The new Claude session will build its own project memory at `~/.claude/projects/-Users-benjaminkurtz-Documents-localcoding-ultravox/memory/` from scratch.

## Pending work

See `docs/implementation-plan.md` for the full 18-phase task breakdown. Phases 1–2 are scaffolding; the real Tauri app shell starts at Phase 2's `pnpm create tauri-app` invocation.

**Important plan adjustment from original spec (refined 2026-05-05):** The original implementation plan assumed a bka2brain-root monorepo with `apps/ultravox` + `packages/voice-core`. The current layout is a **small `pnpm` monorepo inside this repo**, with the bka2brain design system extracted into a shared package so the future Ultravox marketing website can reuse it. bka2brain stays untouched.

Layout:

```
ultravox/
├── pnpm-workspace.yaml        ← apps/* and packages/*
├── package.json               ← workspace root, devDeps only
├── tsconfig.base.json         ← shared compiler options
├── apps/ultravox/             ← Tauri app (created in Phase 2)
├── packages/design-system/    ← shared tokens.css + fonts + theme runtime
└── source-material/           ← copied from bka2brain (unchanged)
```

Phase 1 specifics:

1. The workspace + `packages/design-system` were initialized as part of the refinement landing — verify before redoing. `tokens.css` is a verbatim copy of `source-material/styles/tokens.css`. Bundled fonts: DM Sans (400/500/600) + Cormorant Garamond (400 + italic). Theme runtime in `packages/design-system/src/theme.ts` is runtime-agnostic.
2. Skip the bka2brain monorepo conversion entirely — bka2brain stays untouched.
3. Skip a `packages/voice-core` extraction in v1. Port voice components directly from `source-material/` into `apps/ultravox/src/components/`, `src/lib/`, `src/shared/` as you go.
4. Tailwind v4 setup happens in `apps/ultravox`: `pnpm add -D tailwindcss @tailwindcss/vite`, register the plugin in `vite.config.ts`, and have `apps/ultravox/src/main.tsx` import in this order:
   ```ts
   import "@ultravox/design-system/fonts.css";
   import "@ultravox/design-system/tokens.css";
   ```
5. Theming (Auto / Light / Dark Ocean / Dark Night) is a v1 feature. Default `'auto'`; default dark resolution is `dark-ocean`. Picker lives **inside the Configuration panel** of Settings. The Tauri app provides `theme-storage.ts` (tauri-plugin-store adapter) and `theme-bridge.ts` (Tauri event broadcaster) so all three Tauri windows repaint together. See `~/.claude/plans/read-claude-md-and-generic-muffin.md` and the `Plan adjustment notice` block at the top of `docs/implementation-plan.md` for the full per-phase carryover.

Phases 2–18 from the implementation plan apply with the per-phase adjustments listed in the in-document notice.
