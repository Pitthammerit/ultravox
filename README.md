# Ultravox

Standalone macOS voice-dictation companion app. Hotkey → speak → text appears in whatever app you're in.

**Status:** Pre-Tauri-scaffold. The workspace, the shared design-system package, and the v1 design + 18-phase implementation plan are in place. The Tauri app shell is created in Phase 2 of the implementation plan.

**Working name:** ultravox (placeholder until trademark check). Real name will be one of: Banter / Ozma / Speakboard.

**Git remote:** `https://github.com/Pitthammerit/ultravox.git`.

## Repo layout

This is a small `pnpm` monorepo so the bka2brain design system can be shared between the Tauri app and the future Ultravox marketing website without copy-paste drift. bka2brain itself stays untouched.

```
ultravox/
├── pnpm-workspace.yaml             apps/* and packages/*
├── package.json                    workspace root, devDeps only
├── tsconfig.base.json              shared compiler options
├── CLAUDE.md                       project context for Claude Code sessions
├── README.md                       (this file)
├── docs/
│   ├── research.md                 feature inventory, Superwhisper analysis, locked decisions
│   ├── design.md                   Tauri 2 architecture, Rust modules, UI states, build pipeline
│   ├── implementation-plan.md      18-phase bite-sized task list
│   ├── screenshots/
│   │   └── README.md               placeholder for 12 reference PNGs
│   └── inherited-memory/           memory entries carried over from bka2brain (reference docs)
├── packages/
│   └── design-system/              tokens.css + bundled fonts + theme runtime
│       ├── src/{tokens.css,fonts.css,theme.ts,index.ts}
│       └── assets/fonts/*.woff2
├── apps/
│   └── ultravox/                   the Tauri app — created in Phase 2
└── source-material/                reference code copied from bka2brain — port from these
    ├── components/                 11 React voice components (.jsx)
    ├── lib/                        9 voice/notification lib files
    ├── shared/                     9 cross-runtime utility files
    └── styles/
        └── tokens.css              Tailwind v4 design tokens (canonical)
```

After Phase 2 of the implementation plan, `apps/ultravox/` is populated:

```
apps/ultravox/
├── package.json                    depends on @ultravox/design-system: workspace:*
├── tsconfig.json                   extends ../../tsconfig.base.json
├── vite.config.ts                  with @tailwindcss/vite
├── settings.html, pill.html
├── src/
│   ├── settings-main.tsx, pill-main.tsx
│   ├── windows/, panels/, lib/, hooks/, components/, shared/
│   └── (no tokens.css here — imported from @ultravox/design-system)
└── src-tauri/
    ├── Cargo.toml, tauri.conf.json, capabilities/
    └── src/{main.rs, lib.rs, hotkey.rs, paste.rs, frontmost.rs, window.rs, tray.rs, ...}
```

## How to start a fresh Claude Code session here

1. `cd /Users/benjaminkurtz/Documents/localcoding/ultravox && claude`
2. Claude will auto-load `CLAUDE.md`.
3. Tell Claude: "Read the implementation plan and execute the next unchecked task."

## Reference: sibling project

bka2brain at `/Users/benjaminkurtz/Documents/localcoding/bka2brain` is the source of the voice components and the CF Voice Worker that this project will reuse via HTTP. Ultravox does **not** import from bka2brain — components are duplicated into `source-material/` here for porting, and the design tokens are duplicated into `packages/design-system/`.

## Pre-flight before continuing Phase 1 / starting Phase 2

- [ ] `rustc --version` ≥ 1.75
- [ ] `pnpm --version` ≥ 9
- [ ] `security find-identity -p codesigning -v` shows your Apple Developer ID Application cert
- [ ] `cargo install create-tauri-app` (one-time)

## What's intentionally not here yet

- No `Cargo.toml`, no scaffolded Tauri source — that's Phase 2's job.
- No real screenshots — drop them into `docs/screenshots/` by name when ready.
- No domain registered, no trademark filed.
- No Sentry DSN — sign up free tier when the telemetry phase arrives.
- No GitHub Releases artifact for the auto-updater appcast — set up when the distribution phase arrives.
