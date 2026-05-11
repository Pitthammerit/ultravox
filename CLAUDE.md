# Ultravox — Claude context

## What this is

Standalone macOS Tauri 2 voice-dictation companion app. Inspired by Superwhisper / Wispr Flow but built on React components extracted from bka2brain (sibling project at `/Users/benjaminkurtz/Documents/localcoding/bka2brain`). Global hotkey → record → transcribe via existing CF Voice Worker → paste into the focused app's text field.

**Working name:** `ultravox`. Real name will be one of: **Banter / Ozma / Speakboard** (decided pre-launch via trademark check). All branding strings live in `src/branding.ts` so renaming is one-file-edit + 3 config tweaks.

**Status (2026-05-08, v0.9.8):** Tauri app shipped through 18 phases of the implementation plan. Active iteration: pill polish (compact mode, abort UX, NSPanel keyboard input). Notarized DMG pipeline working.

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
pnpm install               # install deps
pnpm tauri dev             # run Tauri dev (opens settings window + pill window)
pnpm --filter @ultravox/app dmg   # signed (and optionally notarized) DMG via scripts/build-dmg.sh
pnpm test                  # vitest for React + ts logic
cd src-tauri && cargo test # Rust unit tests
```

### Shipping a DMG or `.app`

Full instructions: **`docs/shipping.md`**. Read that file before
attempting a release — it covers credentials, FDA setup, layout assets,
and the reasoning behind the post-process steps.

Quick reference:

- **`pnpm --filter @ultravox/app app`** → unsigned-feel testing `.app`
  (signed with Developer ID, no DMG, no notarization). Output at
  `apps/ultravox/src-tauri/target/release/bundle/macos/Ultravox.app`.
- **`pnpm --filter @ultravox/app dmg`** → release DMG: signed,
  notarized (if `.env.build` populated), with the legacy beige TIFF
  background and the `Uninstall Ultravox.app` injected. Original output
  at `apps/ultravox/src-tauri/target/release/bundle/dmg/Ultravox_<ver>_aarch64.dmg`,
  **also auto-copied to `releases/Ultravox_<ver>_aarch64.dmg`** at the
  repo root for a worktree-stable shipping path. `releases/` is the
  canonical local home for the latest signed DMG; the build folder is
  ephemeral (target-dir specific). See `releases/README.md`.
- **`pnpm --filter @ultravox/app reposition`** → modify icons / window
  inside an existing DMG only (~10 s, no Cargo + Tauri rebuild). Use
  for layout-tuning iteration; strips notarization so re-run `pnpm notarize`
  when done.
- **`pnpm --filter @ultravox/app notarize`** → re-notarize + staple the
  most recently built DMG. Skips Cargo + Tauri.

Both wrap fragile fixes (PATH=/usr/bin first for system xattr,
auto-loading `apps/ultravox/.env.build` for notarization secrets,
post-mount AppleScript icon positioning, re-sign + staple after
modifying the DMG). **Never use `pnpm tauri build` directly** — it
will skip the uninstaller injection and re-sign step.

**Editing a resource inside a signed `.app` invalidates its signature.**
The Uninstall Ultravox.app is signed in-source under `dmg-assets/`. If
anything mutates `Contents/Resources/Scripts/main.scpt` (e.g. recompiling
the AppleScript), the bundle's sealed-resource hash goes stale and
notarytool rejects the DMG with `"The signature of the binary is
invalid."` on `Uninstall Ultravox.app/Contents/MacOS/applet`. The fix —
already encoded in `scripts/build-dmg.sh` — is to re-sign the bundle in
place on the mounted volume with the Developer ID identity + hardened
runtime + timestamp BEFORE `.DS_Store` rewrites and DMG re-compression.
General rule: any resource edit inside a signed bundle must be followed
by a re-sign of the bundle. Skip the re-sign and notarization fails 5
minutes later with a generic error that doesn't name the resource.

**Apple ID for notarization is `kurtzfilm@me.com`** (in `apps/ultravox/.env.build`).
The session prompt's `# userEmail` (`hallo@benjaminkurtz.de`) is Benjamin's
Claude account email, *not* the Apple ID — don't substitute. Apple's
notary service rejects the wrong combo with a generic 401.

**DMG icon coords live in 3 files**: `tauri.conf.json`,
`scripts/build-dmg.sh`, `scripts/reposition-dmg.sh`. All three must
stay in sync. The canonical values + the full bwsp.WindowBounds /
hidden-dotfile parking spec live in `docs/shipping.md`.

**`.DS_Store` editing in the DMG scripts** uses `/opt/homebrew/bin/python3`
+ the `ds_store` lib. Correct API: `d[filename][code] = value` (via
the `Partial` proxy). Shorthand `d[fn, code] = v` silently corrupts
the BTree because `DSStore` has no top-level `__setitem__`. System
`/usr/bin/python3` (CommandLineTools) lacks the package.

Apple credentials live in `apps/ultravox/.env.build` (gitignored; see
`.env.build.example` for the template). Reference legacy DMG that the
layout mirrors is at `~/Desktop/Ultravox-0.9.4.dmg`.

### Mode selection — auto-mode is intentionally disabled

`pickAutoMode` (apps.json bundle-id → preferred mode mapping) was
removed from `PillWindow.startRecord` in v0.11.7. The user's
`activeModeId` is now the sole source of truth for every recording.
Auto-mode silently overrode manual selection (every browser-focused
recording reverted to "note"; custom List modes produced prose), so
re-introduction must be an explicit opt-in toggle, not the default.

## Dev iteration

- **Hot-reload dev shell:** `nohup pnpm tauri dev > /tmp/ultravox-dev.log 2>&1 & disown` — plain `pnpm tauri dev` dies when its parent shell exits. With `nohup` + `disown` it survives and you can tail `/tmp/ultravox-dev.log`.
- **Diagnostics log path:** `~/Library/Application Support/com.ultravox.dev/debug-log.json` — readable from terminal: `cat .../debug-log.json | python3 -c "import json,sys;[print(e['stage'],e.get('message','')) for e in json.load(sys.stdin)['entries'][:20]]"`. The Configuration → Diagnostics panel renders the same entries.
- **Settings store path:** `~/Library/Application Support/com.ultravox.dev/settings.json` (dev) / `com.ultravox.app` (release).

### "Mic doesn't work" — first-aid sequence

The debug log records every recording's audio peak. A normal voice should
peak around **0.1–0.3**. Anything below ~0.02 means the mic stream is
delivering near-silence even though `getUserMedia` succeeded.

**1. Check the most recent recording's peak level:**

```bash
tail -1 ~/Library/Application\ Support/com.ultravox.dev/debug-log.json | python3 -m json.tool | grep peak
```

Or all recent peaks:
```bash
cat ~/Library/Application\ Support/com.ultravox.dev/debug-log.json | python3 -c "import json,sys;[print(e.get('message','')) for e in json.load(sys.stdin)['entries'][:30] if 'peak' in (e.get('message') or '')]"
```

**2. If peak is low (< 0.05), confirm the OS sees signal:** open System
Settings → Sound → Input and watch the level meter while talking. If that
meter is also flat, the failure is at the macOS audio layer, not Ultravox.

**3. If macOS itself is silent, restart `coreaudiod`** — the standard
recovery for a wedged audio daemon. It respawns instantly via launchd, no
logout/reboot needed:

```bash
osascript -e 'do shell script "/usr/bin/killall coreaudiod" with administrator privileges'
```

After restart, fully relaunch Ultravox so it gets a fresh `getUserMedia`
against the new daemon. Verified in 2026-05-11 session: 35 h `coreaudiod`
uptime + active `Serato Virtual Audio` HAL plugin had wedged the daemon
into a "all consumers see silence" state. Daemon restart fixed both
System Settings input meter and Ultravox waveform.

**4. If `coreaudiod` restart didn't help, suspect a HAL plugin:**

```bash
ls /Library/Audio/Plug-Ins/HAL/
```

`Serato Virtual Audio.driver`, `BlackHole`, `Loopback` etc. on macOS 26
sometimes fight `coreaudiod`. Temporarily move the suspect plugin out and
restart `coreaudiod` again to test.

**5. Echo-cancellation note (CLAUDE.md "Audio constraints"):** we set
`echoCancellation: false` to prevent music ducking. macOS 26 may have
coupled AGC to the same Voice-Processing IO Audio Unit, so disabling EC
also loses the gain boost. If the user reports very quiet input, this is
the next place to look — the right fix is exposing EC as a per-mode or
global setting, not flipping the global default.

## Pill window — load-bearing constraints

The pill is an NSPanel (ISA-swapped from NSWindow at runtime in `src-tauri/src/pill_window.rs`) so it can float above other apps' fullscreen Spaces while the app's activation policy stays `Regular` (Dock + Cmd-Tab visible).

- **`canBecomeKeyWindow` override required.** With `NSWindowStyleMaskNonactivatingPanel` set, the framework default for `canBecomeKeyWindow` is NO → panel can never be key → JS `keydown` listeners never fire. We `class_replaceMethod` it on the `NSPanel` class to return YES. Without this, Esc and every keyboard interaction silently dies in both compact and full pill. Caveat: `class_replaceMethod` mutates the entire `NSPanel` class, not just our pill — every NSPanel in the process now returns YES from `canBecomeKeyWindow`. Acceptable in practice (we don't host other NSPanels) but keep in mind when reading AppKit-side bug reports.
- **App-level activation ≠ NSWindow key status.** A window becoming "key" only means it receives keystrokes; the *app* becoming frontmost is a separate state owned by `[NSApplication activate/deactivate]` / `[NSRunningApplication activateWithOptions:]`. The pill's `canBecomeKeyWindow=YES` lets the panel receive Esc *without* activating Ultravox — that's the entire point of `NSWindowStyleMaskNonactivatingPanel`. When debugging "wrong app stole focus" reports, separate the two concepts before forming hypotheses.
- **Compact-pill window size = visible pill + 2×SHADOW_PAD.** CSS `box-shadow` clips at the window edge, so the inner rounded element needs a transparent margin around it — same pattern as the full pill (`padding: SHADOW_PAD` on outer container). Forgetting this gives a square shadow halo around rounded corners.
- **Top-center Y offset ≥40pt on macOS.** Tauri's `monitor.position()` returns NSScreen `frame.origin` which **includes** the menu bar and notch. On notched MacBooks the notch reaches ~37pt; the previous 12pt offset placed the compact pill behind it. Use 44pt.
- **Saved expanded position must be in *logical* points.** `webviewWindow.outerPosition()` returns `PhysicalPosition` (raw pixels); the Rust command `set_pill_size_at_position` interprets x/y as `LogicalPosition`. On retina (scale 2), saving raw physical position warps the window 2× off-screen on next expand. Divide by `webviewWindow.scaleFactor()` before persisting to `settings.pillExpandedPosition`.

## Paste pipeline — focus-stealing defense (v0.18.3+)

The flow: transcription completes → JS hides the pill → JS invokes
`paste_to_frontmost(text, target_pid)` → Rust writes the clipboard →
activates the target app → 90 ms settle → dispatches a synthetic Cmd+V →
500 ms later restores the previous clipboard.

Two failure modes converge to "paste lands in our own Settings window":

1. **Captured target IS ourselves.** If the user fires the hotkey while
   Settings was frontmost, `getFrontmostApp()` returns Ultravox's own
   PID. Re-activating that PID brings Settings forward instead of any
   user app.
2. **Activation race after pill hide.** Hiding the pill (NSPanel with
   `canBecomeKeyWindow=YES`) lets AppKit promote the next-ordered
   window of the same app — typically Settings — to key. Ultravox is
   then briefly the OS-frontmost app, and the subsequent
   `activate_app_by_pid(notes)` can lose the race against the in-flight
   key-window swap.

**Rule:** `paste_to_frontmost` MUST `[NSApp deactivate]` BEFORE calling
`activate_app_by_pid`, and MUST skip self-activation when
`target_pid == std::process::id()`. The deactivate gives macOS room to
promote the previously-frontmost non-self app; the skip prevents
re-activating ourselves on the "captured target is Ultravox" path. Both
together cover every scenario seen so far. Don't remove either without
adding a replacement defense.

**Diagnostic contract.** `paste_to_frontmost` returns
`PasteDiagnostics { target_was_self, frontmost_at_paste }`. The frontend
writes both into `debug-log.json` alongside the captured target bundle
id. Result: any future "paste went to the wrong place" report is
triageable from logs alone — you can tell apart wrong-PID-captured (look
at the `record-start` `WARNING=self` tag) from activation-race (look at
`frontmost_at_paste` in the `paste` entry — if it's `com.ultravox.*`
when it shouldn't be, the deactivate-before-activate sequence needs
another defense layer). Preserve this return shape on every future edit
to the paste path; downgrading it back to `Result<(), String>` blinds us.

Code path: `apps/ultravox/src-tauri/src/paste.rs` +
`apps/ultravox/src-tauri/src/frontmost.rs` (helpers `deactivate_self` +
`current_frontmost_bundle_id`).

## Local Whisper — CoreML acceleration (v0.15.0+)

We compile `whisper-rs` with the `coreml` feature alongside `metal`. At
runtime, whisper.cpp's CoreML backend is auto-engaged when it finds a
`ggml-<variant>-encoder.mlmodelc/` directory next to the `.bin`. With
that bundle present, the encoder runs on Apple's Neural Engine (ANE) —
2–3× faster than Metal-only on Apple Silicon. Without the bundle, we
silently fall back to Metal, which is what previous versions did.

`download_coreml_for` in `local_whisper.rs` fetches and unzips the
`.mlmodelc.zip` companion from HuggingFace alongside every `.bin`
download. Re-clicking download on an already-installed model retrofits
CoreML without re-fetching the multi-GB weights — useful for upgrading
existing v0.11.x users. `local_whisper_list_models` returns
`coreml_installed: bool` per model so the Configuration panel can
render an `ANE` badge.

We do NOT use the WhisperKit Swift framework directly — going through
whisper-rs/whisper.cpp keeps the Rust-only binding surface and re-uses
all our existing model management, audio routing, and language
detection. Performance is competitive with WhisperKit for transcription
workloads (per the whisper.cpp + CoreML benchmarks).

## Audio constraints — no echo cancellation

We do **not** enable `echoCancellation` in any `getUserMedia` call. We are
a dictation app, not a videoconference — there is no remote playback being
returned to the mic that would need cancelling. Setting it `true` (the
WebKit default) routes the mic through macOS' Voice-Processing IO Audio
Unit, which raises the audio session priority and **ducks all other audio**
(Spotify, Apple Music, browser videos) while recording. Always pass
`echoCancellation: false` explicitly. If you find a `getUserMedia` call
in a recording path without it, that's the bug.

## React hook patterns

- **`useHotkeyEvent` (Tauri listen) MUST hold the handler in a ref.** `listen()` and the matching `unlisten()` are async. If the effect's deps include the handler — and the handler captures any state — every render re-registers, multiple in-flight registrations complete out of order, and several listeners end up attached. A single hotkey press fires the handler N times. Symptom: duplicate `recorder.stop()` calls, one of which sees an empty buffer and surfaces "No audio captured" while another transcribes successfully. See `src/hooks/useHotkeyEvents.ts` — handler-in-ref pattern with deps `[event]` only.
- **`useRecorder` returns a fresh object every render** (its internal `state` updates trigger re-renders). Anything that depends on `recorder` in its `useCallback` deps recreates on every render too. Don't pass that callback through `useEffect` deps without ref-wrapping or you'll get the multi-listener bug above.
- **`stateRef.current` for cross-listener state reads.** Putting `state` directly in a Tauri-listened callback closure produces stale captures because the listener may be the OLD one (still mid-unlisten) when the event arrives. Maintain a `useRef(state)` updated in a `useEffect` and read `stateRef.current` inside the listener.

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

## Unified accordion chevron — chevron sits LEFT of the title

**Every collapsible Section in the Settings UI uses the same chevron
pattern, anchored on the LEFT of the label.** The canonical implementation
is `<Section collapsible label="...">` in `src/components/ui.tsx`, which
prepends a 10×10 SVG caret that rotates 0° (expanded) / -90° (collapsed).

Locked 2026-05-11 in v0.18.3. Before then, `InstalledTranscriptionSection`
and `InstalledLlmModelsSection` shipped their own custom accordions with
the chevron on the RIGHT — visually inconsistent next to the standard
left-chevron Sections. Refactor any new accordion that creeps in with
a right-side caret back into `<Section collapsible>`.

Inline count badges (e.g. "INSTALLIERTE TRANSKRIPTION 8") go inside the
`label` ReactNode, immediately after the title text, **between the
chevron and the help icon**. Use the `CountBadge` helper in
`ConfigurationPanel.tsx` so the chip styling stays consistent across
every section.

## Key conventions (carried over from bka2brain)

**Commits:** Never add `Co-Authored-By` trailers. Commits attributed to Benjamin only.

**Verification:** Smoke-test on localhost first. The Tauri dev window is the equivalent of bka2brain's `:5173` — verify there before building a signed DMG.

**Questions:** When asking a bounded-choice question, use the `AskUserQuestion` tool — not prose A/B/C options.

**Comments:** Default to no comments. Only when the WHY is non-obvious.

**Colors:** Use Tailwind token classes (`text-color-primary`, `bg-color-primary/20`, `border-color-secondary/30`). When a value must be inline, use `color-mix(in srgb, var(--token) 20%, transparent)`. Hardcoded RGB never acceptable.

**Iteration workflow:** After completing each shipped change — bump version (see Versioning below), `git add -A && git commit && git push origin <current-branch>`. Don't ask before pushing ordinary feature/fix iterations; the user expects every increment to land on GitHub immediately. Use `git rev-parse --abbrev-ref HEAD` if unsure of the branch (currently `v1-open-tasks` — when this changes, update this line). Update the corresponding checkbox in `docs/implementation-plan.md` if relevant.

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

## Versioning

Current version: **0.9.9** (last bumped 2026-05-08).

**Bump the patch on every shipped change** — automatically, without asking. So the next feature lands as 0.9.1, then 0.9.2, etc. Update all three files in lockstep:

```
apps/ultravox/package.json              "version": "0.x.y"
apps/ultravox/src-tauri/Cargo.toml      version = "0.x.y"
apps/ultravox/src-tauri/tauri.conf.json "version": "0.x.y"
```

Why patch on every release: macOS' icon + bundle caches are keyed on `(CFBundleIdentifier, CFBundleVersion)`. Rebuilding without bumping serves the cached icon forever. Always bumping side-steps it.

Minor (0.9 → 0.10) and major (0.x → 1.0) bumps are deliberate decisions — ask first.

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
