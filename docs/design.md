# Ultravox — Design Spec

**Status:** Draft v1, ready for implementation planning
**Date:** 2026-05-05
**Companion:** [research.md](./research.md) — feature inventory, screenshot index, technology decisions
**Target ship:** ~4–5 weeks

---

## Context

Extract the proven voice subsystem from bka2brain into a standalone Tauri 2 desktop app for macOS that lets users dictate into any focused text field via a global hotkey. Inspired by Superwhisper / Wispr Flow but built on our own React components and CF Voice Worker. v1 is anonymous (no auth, no payment, BYO OpenRouter key); v1.5 layers magic-link auth + Pro tier on top without rearchitecting.

---

## High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│  User taps global hotkey from any focused app                │
│         │                                                    │
│         ▼                                                    │
│  Tauri Rust main process                                     │
│    • global_shortcut plugin → emits "toggle-record" event    │
│    • spawns/shows floating WebView window                    │
│    • tracks frontmost app via NSWorkspace                    │
│         │                                                    │
│         ▼                                                    │
│  WebView (React, voice-core components)                      │
│    • MediaRecorder captures audio                            │
│    • waveform renders live                                   │
│    • on stop → POST blob to CF Voice Worker                  │
│         │                                                    │
│         ▼                                                    │
│  CF Voice Worker (existing, unchanged for v1)                │
│    • /v1/audio/transcriptions  (Whisper raw)                 │
│    • /v1/audio/clean           (Whisper + LLM cleanup)       │
│         │                                                    │
│         ▼                                                    │
│  React receives cleaned text → invoke('paste', text)         │
│         │                                                    │
│         ▼                                                    │
│  Tauri Rust paste command                                    │
│    • clipboard.write(text)                                   │
│    • enigo: simulate Cmd+V to frontmost app                  │
│    • restore previous clipboard contents after 500ms         │
└──────────────────────────────────────────────────────────────┘
```

---

## Repo layout — pnpm monorepo

```
bka2brain/                          (existing repo, becomes monorepo root)
├── pnpm-workspace.yaml             NEW
├── package.json                    UPDATE → workspaces config
├── apps/
│   ├── bka2brain/                  MOVE existing app/ here
│   │   ├── ui/                     (was app/ui/)
│   │   ├── server/                 (was app/server/)
│   │   ├── shared/                 (was app/shared/)
│   │   └── package.json
│   └── ultravox/                NEW
│       ├── src/                    React UI (renderer)
│       │   ├── App.tsx
│       │   ├── windows/
│       │   │   ├── PillWindow.tsx       (floating recording pill)
│       │   │   ├── ModeOverlay.tsx      (⌥⇧K mode picker)
│       │   │   └── SettingsWindow.tsx   (preferences shell)
│       │   ├── panels/
│       │   │   ├── HomePanel.tsx
│       │   │   ├── ModesPanel.tsx
│       │   │   ├── VocabularyPanel.tsx
│       │   │   ├── ConfigurationPanel.tsx
│       │   │   ├── SoundPanel.tsx
│       │   │   └── HistoryPanel.tsx     (deferred to v1.1, stub for v1)
│       │   ├── lib/
│       │   │   ├── tauri-bridge.ts      (invoke wrappers)
│       │   │   └── store-bridge.ts      (tauri-plugin-store wrappers)
│       │   ├── tokens.css               (copy from bka2brain)
│       │   └── main.tsx
│       ├── src-tauri/              Rust main process
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json
│       │   ├── src/
│       │   │   ├── main.rs              (entry, plugin registration)
│       │   │   ├── hotkey.rs            (global hotkey wiring)
│       │   │   ├── paste.rs             (paste-to-frontmost command)
│       │   │   ├── frontmost.rs         (NSWorkspace bundle id polling)
│       │   │   ├── window.rs            (pill/settings window mgmt)
│       │   │   └── tray.rs              (status icon + menu)
│       │   ├── icons/
│       │   └── build.rs
│       ├── package.json
│       └── tsconfig.json
└── packages/
    └── voice-core/                 NEW — shared library
        ├── src/
        │   ├── components/
        │   │   ├── VoiceWaveform.tsx       (from bka2brain)
        │   │   ├── VoiceRecordingIndicator.tsx
        │   │   ├── VoiceModeSwitcher.tsx
        │   │   ├── HotkeyRecorder.tsx
        │   │   ├── EditableField.tsx
        │   │   ├── Toast.tsx + ToastHost.tsx
        │   │   ├── ConfirmDialog.tsx + ConfirmHost.tsx
        │   │   └── Tooltip.tsx
        │   ├── hooks/
        │   │   ├── useRecorder.ts          (extracted from VoiceInput.jsx,
        │   │   │                            de-coupled from useWhisper —
        │   │   │                            uses MediaRecorder directly)
        │   │   ├── useMicStream.ts
        │   │   ├── useVoiceSettings.ts     (from bka2brain)
        │   │   └── useVoiceHotkeys.ts
        │   ├── lib/
        │   │   ├── voiceModels.ts          (from bka2brain)
        │   │   ├── voiceModes.ts
        │   │   ├── voiceVocabulary.ts
        │   │   ├── voiceSounds.ts
        │   │   ├── voiceIcons.ts
        │   │   ├── transcribe.ts           (POST to CF Worker, mode-aware)
        │   │   └── notifications.ts
        │   ├── shared/                     (clone of app/shared/)
        │   │   ├── slugify.ts
        │   │   ├── parseFrontmatter.ts
        │   │   ├── hmac.ts
        │   │   ├── sha256.ts
        │   │   ├── pathSafety.ts
        │   │   ├── responses.ts
        │   │   ├── detectLanguage.ts
        │   │   └── wikilink.ts
        │   ├── tokens.css                  (canonical copy)
        │   └── index.ts                    (barrel export)
        ├── package.json
        └── tsconfig.json
```

**Reuse map — what moves where:**

| File in bka2brain | Destination |
|---|---|
| `app/ui/components/VoiceWaveform.jsx` | `packages/voice-core/src/components/VoiceWaveform.tsx` (port to TS) |
| `app/ui/components/VoiceRecordingIndicator.jsx` | `packages/voice-core/src/components/VoiceRecordingIndicator.tsx` |
| `app/ui/components/VoiceModeSwitcher.jsx` | `packages/voice-core/src/components/VoiceModeSwitcher.tsx` |
| `app/ui/components/HotkeyRecorder.jsx` | `packages/voice-core/src/components/HotkeyRecorder.tsx` |
| `app/ui/components/Toast*.jsx`, `ConfirmDialog.jsx`, `Tooltip.jsx`, `EditableField.jsx` | `packages/voice-core/src/components/` |
| `app/ui/lib/voice*.js` (all of them) | `packages/voice-core/src/lib/` and `hooks/` |
| `app/ui/lib/notifications.js` | `packages/voice-core/src/lib/notifications.ts` |
| `app/shared/*` | `packages/voice-core/src/shared/` |
| `app/ui/tokens.css` | `packages/voice-core/src/tokens.css` (canonical) |
| `app/ui/components/VoiceInput.jsx` | **NOT moved** — split into `useRecorder` hook (voice-core) + Tauri-specific paste glue (apps/ultravox). Becomes a bka2brain-only thin wrapper. |

**Important: Ultravox does NOT depend on `apps/bka2brain`.** Both apps depend on `packages/voice-core`. bka2brain gets refactored to consume voice-core for its existing voice features — minimal change since the components are unchanged, just moved.

---

## Tauri main process (Rust)

### Plugins to use (all official Tauri 2 plugins)
- `tauri-plugin-global-shortcut` — hotkeys
- `tauri-plugin-clipboard-manager` — read/write clipboard
- `tauri-plugin-store` — settings persistence (JSON)
- `tauri-plugin-autostart` — launch at login
- `tauri-plugin-notification` — system notifications (errors)
- `tauri-plugin-fs` — audio archive read/write
- `tauri-plugin-os` — frontmost app detection helpers
- `tauri-plugin-deep-link` — `ultravox://` URL scheme (for v1.5 magic link)
- `tauri-plugin-updater` — auto-update via GitHub Releases appcast

### Custom Rust modules

**`hotkey.rs`** — Registers user-configured hotkey on app start. Default: `Cmd+Shift+;`. On trigger:
1. Read frontmost app via `frontmost::get_bundle_id()`
2. Look up recommended mode in `apps.json`
3. Emit `toggle-record { bundleId, recommendedMode }` event to webview
4. Show pill window if hidden

**`frontmost.rs`** — Calls macOS `NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier` via `objc2` crate. Polled every 500ms while pill is visible (cheap call). On Windows: `GetForegroundWindow` + `GetWindowThreadProcessId` + `QueryFullProcessImageName`.

**`paste.rs`** — Tauri command callable from React:
```rust
#[tauri::command]
async fn paste_to_frontmost(text: String) -> Result<(), String>
```
v1 implementation:
1. Save current clipboard contents
2. Write `text` to clipboard
3. Use `enigo` crate to send Cmd+V
4. After 500 ms, restore original clipboard

v1.1 will add `accessibility-sys` AX-API path on macOS that bypasses the clipboard entirely; same command signature.

**`window.rs`** — Two windows total:
- **Pill** — frameless, transparent, always-on-top, skip-taskbar, ~600×100 px, positioned bottom-center of focused screen. Hidden by default; shown on hotkey.
- **Settings** — standard window, ~960×640 px, opened from tray menu or first-run.

**`tray.rs`** — Status icon (Ready/Recording/Processing/Complete states). Click → settings; right-click menu → Settings, Sound on/off, Quit.

---

## Floating window UI states

All states render inside the same pill window — only content changes. Modeled after screenshots 10–12 in [screenshots/](./screenshots/) but using bka2brain tokens (cream `--color-bg-light`, navy `--color-primary`, green `--color-accent`).

### State machine

```
       ┌─────────────────┐
       │     hidden      │ ◄───────────────────────┐
       └────────┬────────┘                          │
                │ hotkey                            │
                ▼                                   │
       ┌─────────────────┐    push-to-talk         │
       │  arming (50ms)  │  ───────────────────►   │
       └────────┬────────┘  (skip if hold-style)   │
                │                                   │
                ▼                                   │
       ┌─────────────────┐                          │
       │   recording     │ ◄──── ⌥⇧K ──┐           │
       │  (waveform +    │              │           │
       │   mode label)   │              │           │
       └────┬──────┬─────┘    ┌─────────┴────┐      │
            │      │          │ mode-overlay │      │
       hotkey      │          │  (numeric    │      │
       (stop)      │ Esc      │   shortcuts) │      │
            │      │          └──────────────┘      │
            ▼      ▼                                │
       ┌────────┐  ┌──────────────────┐             │
       │ trans- │  │ discard-confirm  │             │
       │cribing │  └────────┬─────────┘             │
       └───┬────┘           │                       │
           │                ▼ confirm               │
           ▼                ┌──────┐                │
       ┌────────────┐       │ done │ ──────────────┘
       │   pasted   │       └──────┘
       │ (200ms ✓)  │
       └─────┬──────┘
             ▼
        (auto-hide)
```

### Per-state visual

| State | Pill content |
|---|---|
| arming | Mic icon (pulse), mode label, "Listening…" |
| recording | Live waveform (`VoiceWaveform`), mode label left, hotkey hints right ("Stop ⌘⇧;" / "Cancel Esc") |
| transcribing | Spinner, "Transcribing…" |
| pasted | Green ✓, "Pasted" — auto-hides after 200 ms |
| error | Red ⚠, error message, retry button (3 sec timeout) |
| mode-overlay | Vertical list of modes with numeric shortcuts (1–9), checkmark on active. Footer: ↑↓ Select ↵, Back Esc |
| discard-confirm | "Discard recording? [Continue ⌘⇧;] [Discard ↵]" — Esc also discards |

---

## Settings shell — sidebar IA

Modeled after screenshots 1–6 but using bka2brain's own visual language.

| Section | Purpose | v1 status |
|---|---|---|
| **Home** | Welcome, get-started cards (Start recording / Customize hotkey / Add vocabulary), changelog | Ship |
| **Modes** | List of 4 starter modes, click row to view (read-only in v1), edit button disabled with "v1.1" badge | Ship (read-only) |
| **Vocabulary** | Source → replacement table, search, add/edit/delete | Ship |
| **Configuration** | Recording window style (Classic / None — Mini deferred), keyboard shortcuts (Toggle, Cancel, Mode switcher, Push-to-talk), launch at login, BYO API key field | Ship |
| **Sound** | Mic device picker, auto-gain, silence removal, sound effects toggle + volume | Ship |
| **History** | Past dictations with copy-again — local only | Stub for v1, real in v1.1 |
| **Account** | Email, license, billing | Hidden in v1, appears in v1.5 |

---

## 4 starter modes (ship in v1)

Each mode is a JSON entry under `voice-core/lib/voiceModes.ts`. Already shaped this way in bka2brain.

| Mode | Cleanup | Default LLM | Prompt suffix |
|---|---|---|---|
| **Email** | prose | OpenRouter `anthropic/claude-haiku-4.5` | "Format as a clear, professional email. Add greeting/sign-off only if dictated." |
| **Message** | prose | OpenRouter `anthropic/claude-haiku-4.5` | "Format as a casual chat message. Keep it short and conversational." |
| **Note** | prose | OpenRouter `anthropic/claude-haiku-4.5` | "Format as personal notes. Preserve bullet points if dictated. No greeting." |
| **Code** | raw | none (skip cleanup) | n/a — pure transcription with vocabulary hints biased toward code terms |

The bka2brain `voiceModes.js` schema already accommodates all of this. We adapt, not invent.

---

## App-context file (`apps.json`)

`packages/voice-core/data/apps.json` — hand-curated v1 starter set. Each entry maps a frontmost-app bundle id to a recommended mode.

```json
[
  { "bundleId": "com.apple.Mail", "name": "Apple Mail", "recommendedMode": "email" },
  { "bundleId": "com.google.Chrome", "name": "Chrome", "recommendedMode": "note" },
  { "bundleId": "com.tinyspeck.slackmacgap", "name": "Slack", "recommendedMode": "message" },
  { "bundleId": "com.hnc.Discord", "name": "Discord", "recommendedMode": "message" },
  { "bundleId": "com.apple.MobileSMS", "name": "Messages", "recommendedMode": "message" },
  { "bundleId": "WhatsApp", "name": "WhatsApp", "recommendedMode": "message" },
  { "bundleId": "com.todesktop.230313mzl4w4u92", "name": "Cursor", "recommendedMode": "code" },
  { "bundleId": "com.microsoft.VSCode", "name": "VS Code", "recommendedMode": "code" },
  { "bundleId": "com.apple.Terminal", "name": "Terminal", "recommendedMode": "code" },
  { "bundleId": "com.googlecode.iterm2", "name": "iTerm2", "recommendedMode": "code" },
  { "bundleId": "notion.id", "name": "Notion", "recommendedMode": "note" },
  { "bundleId": "md.obsidian", "name": "Obsidian", "recommendedMode": "note" },
  { "bundleId": "com.linear", "name": "Linear", "recommendedMode": "note" },
  { "bundleId": "com.tinder", "name": "Tinder", "recommendedMode": "message" },
  { "bundleId": "*", "name": "default", "recommendedMode": "note" }
]
```

User can override the recommendation per app in v1.1's mode editor. v1: hard-coded.

---

## CF Voice Worker — changes required for v1

**None.** The existing `/v1/audio/transcriptions` and `/v1/audio/clean` endpoints work as-is. Ultravox reuses the HMAC token issuance flow.

For **v1.5** (when auth lands), add:
- `keySource: 'byo' | 'managed'` field on token payload
- Per-user metering hook (counter, not yet enforced)
- Device fingerprint check at token issue

---

## Local data layout (macOS)

```
~/Library/Application Support/com.ultravox.app/
├── settings.json              tauri-plugin-store, plain JSON, settings + hotkey + mic device
├── modes.json                 4 starter modes; user can override in v1.1
├── vocabulary.json            source → replacement entries
├── recordings/                only if user opts in
│   ├── 2026-05-05T14-22-31-email.webm
│   └── 2026-05-05T14-22-31-email.json   (metadata: mode, transcript)
└── stronghold.bin             encrypted store for BYO API key (master password set on first run)
```

**API key handling specifically:** v1 uses `tauri-plugin-stronghold` with a fixed master password derived from machine UUID + a salt baked into the binary. Not maximally secure, but better than plain JSON, and avoids prompting the user for a password every launch. v1.5 swaps in OS-keychain via `keyring` crate.

---

## v1 user flow walkthrough

### First run
1. App launches, shows onboarding window:
   - Step 1: Permissions — request Microphone (auto-prompt) and Accessibility (deep-link to System Settings, user enables manually, app polls until granted).
   - Step 2: Paste OpenRouter API key. Validation: ping `/v1/audio/clean` with a 1-byte audio file to confirm key works.
   - Step 3: Pick hotkey (default `⌘⇧;`). HotkeyRecorder component captures.
   - Step 4: "Try it now" — small textarea, dictate into it.
2. Onboarding completes → tray icon appears, app minimizes to background, settings window closes.

### Steady state
1. User in any app focuses a text field.
2. Taps `⌘⇧;`. Pill appears bottom-center, recording starts within 100 ms.
3. Pill shows live waveform + active mode label (auto-selected from frontmost app via `apps.json`).
4. User speaks. Optional: `⌥⇧K` opens mode overlay, user picks a different mode with a number key, returns to recording.
5. User taps hotkey again to stop. Pill switches to "Transcribing…" state.
6. CF Worker returns cleaned text (~600–1500 ms typical).
7. Pill flashes ✓ "Pasted" for 200 ms while Rust paste command runs.
8. Pill hides. Cursor in target app now contains the dictated text.

### Edge cases handled
- User taps Esc during recording → discard-confirm overlay → confirm/cancel.
- User has no internet → error toast, don't paste, audio kept locally if archive enabled.
- API key invalid → settings panel auto-opens with red border on key field.
- User has no Accessibility permission → on-pill error "Grant Accessibility access to enable paste" with deep-link button.
- User holds hotkey instead of tapping (push-to-talk) → record while held, release to stop.

---

## Build, sign, ship

| Step | Tool | Notes |
|---|---|---|
| Build Rust + bundle WebView | `tauri build` | Universal binary x86_64 + arm64 |
| Code sign | `electron-builder` afterSign equivalent → Tauri's built-in signing config in `tauri.conf.json` | Uses your existing Apple Developer ID |
| Notarize | `xcrun notarytool submit ...` invoked by Tauri's bundler | Requires App-Specific Password set as env var |
| Package | `.dmg` via Tauri's bundler | Includes a styled background, `/Applications` shortcut |
| Distribute | Direct download from `ultravox.app` (or wherever you host) | No App Store, no IAP |
| Auto-update | `tauri-plugin-updater` | Reads appcast from a private GitHub Release. Signed with Tauri's update-signing key. |

---

## Verification plan

### Smoke test (manual, ~10 min)
1. Build dev app: `pnpm --filter ultravox tauri dev`.
2. Grant Microphone + Accessibility permissions.
3. Set OpenRouter API key in settings.
4. Open TextEdit. Tap hotkey. Dictate "this is a test". Verify text appears in TextEdit.
5. Repeat in Slack, Cursor, Mail. Verify mode auto-switches based on frontmost app.
6. Push-to-talk: hold hotkey while dictating, release. Verify same paste.
7. Mode switch: tap hotkey, press `⌥⇧K`, press `2` to pick mode 2, finish dictation. Verify mode 2's prompt was applied.
8. Discard: tap hotkey, dictate, press Esc, confirm discard. Verify nothing pastes.
9. No internet: turn off wifi, dictate. Verify error toast, no clobbered clipboard.
10. Quit + relaunch: verify settings persist, hotkey re-registers, tray icon present.

### Build verification
1. `pnpm --filter ultravox tauri build`
2. Open the produced `.dmg`, drag to Applications.
3. Right-click → Open (Gatekeeper test).
4. Verify the bundle is correctly signed: `codesign -dv /Applications/Ultravox.app`.
5. Verify notarization stapled: `spctl -a -vvv /Applications/Ultravox.app`.

### Automated test (limited surface)
- `voice-core` package: unit tests for `voiceVocabulary` matching, `voiceModes` resolution, `slugify`, `parseFrontmatter`, `hmac`.
- Apps: smoke test that the React UI renders without errors via Vitest + Testing Library.
- Tauri commands: `cargo test` for `paste`, `frontmost`, `hotkey` happy-paths.

### Manual cross-app test matrix (ship-blocker)

| App | Paste works | Mode auto-switches | Notes |
|---|---|---|---|
| TextEdit | ✓ required | n/a | sanity |
| Apple Mail | ✓ required | → email | |
| Slack | ✓ required | → message | |
| Discord | ✓ required | → message | |
| Messages | ✓ required | → message | |
| Cursor / VS Code | ✓ required | → code | |
| Terminal / iTerm | ✓ required | → code | |
| Chrome (Gmail) | ✓ required | → note | |
| Notion | ✓ required | → note | |
| Obsidian | ✓ required | → note | |

If any blocks paste, document the failure and ship with that app on a "known issues" list.

---

## What's explicitly out of scope for v1

- Magic-link auth, Stripe, billing portal — v1.5
- Mode editor (custom prompts, app auto-switch overrides) — v1.1
- File transcription drop-zone — v1.1
- Stats panel (WPM, words/week) — v2
- Mini window style — v1.1
- Local Whisper / on-device inference — v2
- Translation modes — v2
- Meeting recording — v2
- Shared team dictionary — never (consumer product)
- Windows build — v1.5+ (only if v1 gets traction)
- Linux build — never planned

---

## Open items before implementation

1. **Domain + branding.** Ultravox is the working name. Pick the final name + domain before code-signing certs commit to a bundle id (`com.ultravox.app`?). Bundle id is hard to change later.
2. **Update-signing keypair.** Tauri's updater requires generating a signing key via `tauri signer generate`. Public key embeds in the binary, private key signs releases. One-time setup.
3. **GitHub Release strategy for updater.** Private repo with personal access token? Public repo with binaries? Custom CDN? Decide before first release.
4. **Crash telemetry.** Sentry confirmed in research, but no DSN yet. Free-tier signup needed.
5. **Onboarding copy + visuals.** Strings TBD during build phase, not architecturally blocking.
