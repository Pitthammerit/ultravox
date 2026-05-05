# Voice Companion App — Research Notes

**Date:** 2026-05-05
**Purpose:** Reference notes for extracting bka2brain's voice subsystem into a standalone, multi-user dictation companion app inspired by Superwhisper / Wispr Flow.
**Status:** Research only. Spec lives in a sibling `*-design.md` once the brainstorm is approved.

---

## TL;DR

bka2brain already contains every primitive needed for the voice path: mic capture, waveform UI, recording indicator, mode switcher, vocabulary, hotkey recorder, HMAC-tokened CF Voice Worker, and Whisper + LLM cleanup. What is **missing** for a Superwhisper-class companion is:

1. A system-wide global hotkey + paste-to-frontmost-app shell (Electron — already in deps, or Tauri).
2. A small floating recording window (Classic / Mini / None style picker like Superwhisper).
3. File-transcription drop zone.
4. Multi-user license/auth + managed API key plumbing (or BYO key).

Everything else is reuse.

---

## Wispr Flow — feature inventory

*Source: `https://wisprflow.ai/features`, fetched 2026-05-05*

### Core dictation
- System-wide voice-to-text in any app or website with a text field.
- "Whisper mode" for quiet environments.
- Real-time recognition.

### Platforms
- Mac, Windows, iOS, Android.
- Confirmed integrations: Notion, Gmail, Google Docs, WhatsApp, Cursor, Windsurf.

### Languages
- 100+ languages (ES, HI, ZH, KO, AR, etc.). Multilingual within a single dictation.

### Formatting / editing
- Auto-punctuation from pauses + tone.
- Filler removal ("um", "uh").
- Numbered list formatting from spoken numbers.
- In-stream self-correction ("…actually 3").
- Manual punctuation dictation ("comma", "question mark").

### Personalization
- **Dictionary** — industry vocabulary; learned + manual.
- **Snippets** — voice → text shortcuts.
- **Styles** — formal / casual / enthusiastic. English + desktop only.

### Developer features
- Code-aware formatting: camelCase, snake_case, acronyms.
- File tagging in supported editors.
- Developer terminology recognition.

### Team / business
- Shared dictionary.
- Shared snippets.
- Usage dashboards / adoption metrics.
- Enterprise tier.

### Pricing
- Free tier.
- 14-day Flow Pro trial (no card).
- Enterprise pricing.

### Privacy
- Trust Center + data-controls page referenced.

---

## Superwhisper — feature inventory

*Source: `https://superwhisper.com`, fetched 2026-05-05*

### Core
- Hold-speak-release push-to-talk.
- Real-time transcription in any app.
- File transcription (audio/video upload).

### AI models
- LLM choices: GPT-5, Claude Haiku 4.5, Llama 4, Grok 4.1, Gemini 3.0 Flash, Ministral.
- Whisper Large for ASR.
- Local + cloud processing.
- Bring-your-own API key.
- "Super Mode" — screen-context aware.

### Modes / customization
- Predefined: Message, Email, Voice.
- Tone: Formal, Casual, Legal, Chat.
- Custom mode creation with prompt + formatting rules.

### Languages / vocab
- 100+ languages.
- Translate to English.
- Custom vocabulary (one-time entry, permanent retention).

### Integrations
- Slack, Gmail, Cursor, Notion, Telegram, WhatsApp.
- Cursor / Claude Code / Open Code.
- Auto-paste via clipboard.
- Custom keyboard shortcuts.
- 30+ app integrations.

### Advanced
- Meeting recording → auto notes.
- Offline transcription.
- Multilingual document processing.
- Screen-aware context.

### Pricing
- Free: basic + 15-min Pro trial.
- Pro: $8.49/mo (40% student discount). Cloud + local models, file transcription, translation.
- Enterprise: SOC 2 Type II, central billing, volume discounts.

---

## Mapping: what bka2brain already has

### Reusable as-is or near-as-is
- `app/ui/components/VoiceInput.jsx` — mic button, use-whisper integration, HMAC token fetch, vocabulary hints, optional recording archive.
- `app/ui/components/VoiceWaveform.jsx`
- `app/ui/components/VoiceRecordingIndicator.jsx` — floating recording pill (the conceptual ancestor of Superwhisper's Classic window).
- `app/ui/components/VoiceModeSwitcher.jsx`
- `app/ui/components/HotkeyRecorder.jsx`
- `app/ui/lib/voice.js`, `voiceModels.js`, `voiceModes.js`, `voiceSettings.js`, `voiceVocabulary.js`, `voiceHotkeys.js`, `voiceSounds.js`, `voiceIcons.js`
- `app/server/routes/voice.js` — HMAC token issuer (TTL 600s).
- `app/server/routes/voice-recordings.js`, `voice-settings.js`
- CF Voice Worker — `/v1/audio/transcriptions`, `/v1/audio/clean`
- `app/shared/*` — slugify, parseFrontmatter, hmac, sha256, responses, pathSafety, detectLanguage
- Notification primitives — `Toast`, `ToastHost`, `ConfirmDialog`, `ConfirmHost`
- Settings infra — `SettingsButton`, `useSettings`, `getSettings`/`setSettings`
- Tokens — `app/ui/tokens.css`

### Net-new for the standalone app
- Electron tray + global hotkey registration (system-wide, not just web `keydown`).
- Active-app focus capture + paste-to-front-app via accessibility / clipboard simulation.
- Compact floating window chrome (modeled after Superwhisper Mini, our tokens).
- File-transcription drop zone.
- Multi-user license/auth shell (magic-link or license key).
- Stats panel (WPM, words/week, etc.) — optional / cuttable for v1.

---

## Screenshot inventory

Stored as PNGs in [`screenshots/`](./screenshots/) when the user drops them in.

### Settings window (sidebar IA)
1. `01-home.png` — Home tab. Sidebar (Home / Modes / Vocabulary / Configuration / Sound / Models library / History), top bar with mic device picker. Hero stats: WPM, words this week, apps used, minutes saved. "Get started" cards: Start recording (⌘Space), Customize shortcuts, Create a mode, Add vocabulary.
2. `02-modes.png` — Modes list: "DE Stimme zu Text", "Engl Voice to text", "Voice to text", "Note". Each row: mic icon, name, model badge (Mistral / OpenAI / Anthropic). Active mode marked with green dot. "+ Create mode". Tip: "Auto-switch with activation".
3. `03-vocabulary.png` — Search + "Add a word or create a snippet" input. Two-column rows: source phrase → replacement (e.g. Cloud → claude, Cloud Md → claude.md, super whisper → Superwhisper).
4. `04-configuration.png` — Recording window style picker: Classic / Mini / None. Keyboard shortcuts: Toggle Recording (⌘Space), Cancel (Space), Change mode (⌥⇧K), Push to Talk (⌘Space), Mouse shortcut.
5. `05-sound.png` — Microphone: auto-increase volume + silence removal. Playback: Pause. Sound effects toggle + volume.
6. `06-account.png` — Email, license key (last 4 = C25F), Manage billing / Unlink device. Footer: Roadmap, Email, Website, Discord, X.

### Auth + billing flow (Stripe-powered)
7. `07-magic-link-email.png` — Stripe customer portal magic-link email screen.
8. `08-magic-link-login.png` — "Check your email for your login link". Split-pane, branding left, form right. Powered by Stripe.
9. `09-billing-detail-de.png` — Stripe billing portal in German: monthly $10.10/mo, Visa ending 1380, billing history (Apr/Mar/Feb 2026 all "Bezahlt"), update/cancel buttons.

### Floating recording window in use (key visual reference)
10. `10-recording-classic.png` — Classic window: dark rounded pill, white waveform across the top, mic icon + active mode label "DE Stimme zu Text" bottom-left, hints "Stop ⌘Space" + "Cancel Space" bottom-right, minimize chevron top-right.
11. `11-mode-switcher-overlay.png` — Mode picker (⌥⇧K): list of all modes with numeric quick-select shortcuts (1–4), checkmark on active mode, mic/note icon per row. Footer: ↑↓ Select ↵, Back Space.
12. `12-discard-confirm.png` — Discard confirmation: "Discard recording? ↵" centered, with Stop/Continue Space hints below. Stays inside the floating pill chrome.

---

## Proposed feature scope (to be refined in brainstorm)

### Must-have (v1)
- Global hotkey from any app → start/stop dictation.
- Floating Classic window (waveform + mode label + hint hotkeys).
- Mode switcher overlay (⌥⇧K) with quick-numbers.
- Auto-paste to frontmost app's focused field.
- Vocabulary (ported as-is from bka2brain).
- 2–4 starter modes (Email / Message / Note / Code) — mode editor can come later.
- Settings shell (sidebar IA: Home / Modes / Vocabulary / Configuration / Sound / History).
- Multi-user identity (TBD: magic link vs. license key).

### Should-have (v1.1)
- Mini window style.
- Push-to-talk.
- File transcription drop-zone.
- History tab with copy-again.
- Mode editor (custom prompts, app auto-switch).

### Nice-to-have (v2)
- Stats panel (WPM, words/week).
- Local Whisper model option.
- Translate-to-English mode.
- Meeting recording.
- Shared team dictionary.

---

## Decisions locked in (2026-05-05)

1. **v1 scope:** hotkey + 4 modes (Email/Message/Note/Code) + mode switcher overlay (⌥⇧K) + vocabulary + push-to-talk. No mode editor, no file transcription, no stats, **no auth, no payment**.
2. **Repo layout:** pnpm monorepo. New top-level `packages/voice-core/` is the shared library. `apps/ultravox/` and `apps/bka2brain/` both consume it. Ultravox has **zero** import dependency on bka2brain.
3. **Shell:** Tauri 2. Frameless transparent window for the floating pill (uses WKWebView on macOS, WebView2 on Windows — both native rendering). Reuses all existing React voice components. ~40 MB idle memory vs Electron's ~200 MB. Validated by Superwhisper themselves choosing Tauri for their Windows build.
4. **Paste mechanism:** v1 uses `enigo` Rust crate (Cmd+V simulation on Mac, equivalent on Windows). v1.1+ swaps in a native AX-API path on Mac via the `accessibility-sys` crate and UI Automation on Windows via `uiautomation` crate. The same `paste()` Tauri command lives in `apps/ultravox/src-tauri/src/paste.rs` with platform-specific implementations behind `#[cfg(target_os = "...")]`.
5. **Local state:** `tauri-plugin-store` for settings/modes/vocabulary (JSON file under app data dir). `tauri-plugin-stronghold` (encrypted at rest with a master password) **or** OS keychain via `keyring` crate for the BYO OpenRouter key. Audio files archived locally under app data dir `recordings/` if user opts in. **No cloud sync of any user data.** CF Worker transcribes and discards.
6. **Auth + payment:** **None in v1.** Fully anonymous app, BYO OpenRouter key, no online identity. Supabase magic-link auth + Stripe Pro tier arrive in v1.5.
7. **Platform:** **macOS-only for v1**. Code-signed + notarized DMG (Apple Developer ID — you already have one, $99/yr). Direct download from a landing page. **Not** Mac App Store (no 30% cut, no IAP requirement). Windows in v1.5 or v2.
8. **Modes:** Ship 4 starter modes; build the mode editor in v1.1.
9. **App-context awareness:** Hand-curated `apps.json` of ~15 frontmost-app → recommended-mode mappings. Not a 119KB scraped database.
10. **Auto-update:** `electron-updater` + GitHub Releases (private repo) appcast. Standard Electron path, wraps Sparkle/Squirrel under the hood.
11. **Telemetry:** Sentry (matches Superwhisper). Free tier covers launch.

## Architectural reference: Superwhisper internals (factual summary, no code copied)

Inspected from the user's bundle copy at `~/Documents/localcoding/SUPERWISPER/Contents` for shell-decision purposes only.

| Layer | Their choice | Our choice for Ultravox |
|---|---|---|
| Shell | Native macOS Swift (SwiftUI + AppKit) | Electron (frameless transparent window) |
| Min OS | macOS 13.3 | macOS 12+ / Win 10+ |
| Global hotkey | `CGEventTap` + `addGlobalMonitorForEventsMatchingMask:` | Electron `globalShortcut` (CGEventTap under the hood) |
| Paste to focused field | macOS Accessibility API (`AXUIElement`, `AXFocusedApplication`) — direct injection, no clipboard clobber | Phase 1: clipboard + `osascript` keystroke. Phase 2: native AX module via `node-mac-permissions`. |
| Audio capture | AVAudioEngine | Web `MediaRecorder` (already used in bka2brain `VoiceInput.jsx`) |
| Local ASR | whisper.cpp (`libllama` + `libggml-metal`) + Argmax SDK + ONNX runtime | None for v1. CF Voice Worker handles ASR. Optional on-device in v2. |
| Cloud ASR/LLM | OpenAI, Anthropic, Groq, Gemini, Deepgram, ElevenLabs + own proxy `ai.superwhisper.com/v1/c/` | OpenRouter (BYO key) via existing CF Voice Worker `/v1/audio/transcriptions` and `/v1/audio/clean` |
| Auth | Deeplink (`superwhisper://activateLicense`) + Stripe customer portal | Magic-link via `api.ultravox.app` (TBD domain) + Stripe |
| Auto-updates | Sparkle, appcast XML | `electron-updater` (already standard) |
| App-context DB | 119KB bundled JSON of ~hundreds of apps with `text_input_format` per entry | Hand-curated `apps.json` with ~15 starter entries; user-extensible |
| Telemetry | Sentry | Sentry (matches bka2brain's potential setup) |

### Two ideas we should adopt (concept-only)
- **Accessibility-API paste** instead of clipboard simulation — no clipboard clobber. Phase 2 enhancement; v1 ships with the clipboard fallback.
- **App-context awareness** — frontmost-app bundle-id lookup picks an appropriate mode automatically. We curate ~15 apps for v1 instead of scraping the App Store.

### Superwhisper Windows is Tauri (separate codebase)

Inspected `superwhisper_1.3.12_x64-setup.exe` (NSIS installer, 36MB compressed → 137MB single EXE). Confirmed Tauri:
- `$PLUGINSDIR/nsis_tauri_utils.dll` — Tauri's signature NSIS plugin
- `nlprule/en_tokenizer.bin` — Rust NLP tokenizer crate dependency
- No `app.asar` / `icudtl.dat` / `.pak` files (rules out Electron)

Real-world implication for our shell decision:
- Their Mac (v2.13.2 native Swift) and Windows (v1.3.12 Tauri) are **two separate codebases** on independent release cadences. Windows lags Mac significantly.
- Validates Tauri as a serious cross-platform shell: even a native-first competitor reached for Tauri rather than Win32/WinUI when they wanted Windows.
- Reinforces the earlier claim: native Swift cannot be ported to Windows — Superwhisper themselves wrote a parallel Tauri product instead.
