# Superwhisper architecture — notes from binary inspection

**Source:** `/Users/benjaminkurtz/Desktop/Contents/` — Superwhisper 2.13.2 universal Mach-O. No source available; the notes below are extracted from `strings`, the symbol table, mangled Swift class names, and asset directories. They are pattern-level observations, not a transcription.

**Why we care:** Superwhisper is the closest-in-spirit reference for the v1 Ultravox UX (global hotkey → floating pill → mode switcher → paste). The patterns below should inform our overlay window strategy, recording state machine, and discard-confirm flow.

## Tech stack

- Native macOS Swift + SwiftUI + AppKit (NSPanel, NSWorkspace, CoreAudio, CGEvent).
- Universal binary (x86_64 + arm64).
- GRDB for storage (sqlite layer).
- Starscream for WebSockets.
- SwiftyJSON for cleanup pipeline.
- llama.cpp + Metal compute (`default.metallib`) — local LLM cleanup is on-device.
- jinja templates for several local models: `llama-3.2.jinja`, `llama3.jinja`, `mistral.jinja`, `ministral.jinja`, `gpt-oss.jinja`, `deepseek-r1.jinja`.

## Top-level views (from class symbols)

Confirmed source path leaked in debug info:
```
/Users/ultra/Development/superwhisper/superwhisper/superwhisper/Views/Recording/ModeSwitchView.swift
```

| View / class | Likely role |
|---|---|
| `RecordingState` | Top-level UI state machine for the pill |
| `AudioRecordingState` | Low-level audio engine state, separate from UI |
| `ControlsOverlayView` | The recording pill with key hints (Stop / Continue / Cancel) |
| `CursorOverlayView` | Pill rendered next to the cursor (the floating one) |
| `ModeSwitchView` | Mode list panel that drops out of the pill |
| `DisplayModePicker` | Mode picker logic (which mode to show / activate) |
| `SuperModelPicker` | Mode picker root |
| `SuperModelPickerPanel` | The dropdown panel for the picker |
| `SuperModelPickerPanelRow` | Individual mode row |
| `SuperModelPickerPanelHoverPanel` | Hover-detail popover (extra info on hover) |
| `SuperModelPickerPanelDeletePanel` | Delete-confirm popover |
| `OnboardingToastOverlay` | Onboarding toast |
| `PaywallModalOverlay` | Pro upgrade modal |
| `DebugAgentOverlayState` | Internal debug overlay |

**Key takeaway:** each visible overlay is its own `NSPanel`, not a subview. Cascading menus (mode picker → hover detail → delete confirm) are achieved by anchoring sibling panels to the parent's frame.

## State machine (inferred from selectors and strings)

Internal Objective-C selectors retained for KVO/KVC:

```
_continueRecording:        ← resume after a discard prompt
_recordingState
_overlayState
_overlayOpacity
_pushToTalkEnabled
_pushToTalkMigrated        ← schema migration for an old PTT setting
```

Inferred UI state transitions:

```
idle → recording → confirmingDiscard → discarded (back to idle)
                                    └→ recording (resumed via _continueRecording:)
recording → transcribing → idle
recording → cancelled (Esc twice or explicit cancel)
```

UI state and audio engine state are decoupled. `AudioRecordingState` keeps the audio session running while `RecordingState == confirmingDiscard`, so resume is cheap (no re-arming the mic).

## Discard-confirm UX

UI strings present in the binary, matching observed behavior:

- `"Discard recording?"` — the prompt header
- `"Cancel Recording"` — menu/tooltip text
- `"Discards the active recording"` — tooltip describing the cancel hotkey

Behavior (from screenshot of running app):
1. While `recording`, pressing the cancel hotkey pauses audio and transitions to `confirmingDiscard`.
2. A small dark prompt panel appears anchored above the pill, with the literal text **"Discard recording? ↵"**.
3. The pill itself stays visible but its key hints rebind: now **"Stop ⌘ Space"** and **"Continue Space"** instead of the recording hints.
4. ⏎ confirms discard. Space (or the regular stop key) resumes recording.

## Push-to-talk timing guards

Strings reveal explicit anti-accidental-tap heuristics:

```
[PTT Keyup] Push to talk keyup handler
[PTT Keyup] Shortcut is different, require 500ms hold at least to use push to talk release
[PTT Keyup] Shortcut is same as push to talk, require 1s hold at least to use push to talk release
```

If the user's PTT key matches another shortcut they're holding (e.g., ⌘ used in many app shortcuts), require a 1s hold before treating release as "stop transcription". Otherwise 500ms. This is domain knowledge baked in.

## Sound assets

Multiple variants for every state — the app rotates through them or chooses by mode:

```
Start1.m4a, Start2.m4a, Start3.m4a, Start4.m4a
Stop1.m4a,  Stop2.m4a,  Stop3.m4a,  Stop4.m4a
PreStop.m4a, PreStop_fast.m4a   — played in the moment between stop hotkey and final stop
Loop.m4a                        — quiet loop while transcribing?
Notification1.wav, 2.wav, 3.wav — tray/system notifications
noResult1.m4a, noResult2.m4a, noResult3.m4a — when nothing was transcribed
Intro.m4a                       — onboarding music
```

## Apps catalog

`Resources/bundled_app_info.json` ships a curated catalog of ~hundreds of macOS apps with `category`, `short_description`, and `text_input_format` (e.g. `password`, `audio_metadata`, `design_parameters`, `configuration_settings`, `file_path`). This drives mode auto-selection by the frontmost app, similar to our `apps.json` plan but much wider coverage.

`text_input_format` is interesting — it tags what kind of text the app expects, so the cleanup model can be primed differently for "password input" vs "design parameters" vs "audio metadata". Worth considering for v1.1 mode customization.

## Adaptation notes for Ultravox

These map cleanly onto our Tauri stack with modest adjustments:

1. **Discard-confirm state in our existing pill** instead of a second window. Add `confirming-discard` to `PillState`; when ⎋ is pressed during `recording`, transition to that state, call `MediaRecorder.pause()`, replace the waveform area with a "Discard recording?" body, rebind footer hints to ⏎ Discard / Space Continue. ⏎ → cancel + clear chunks. Space → `MediaRecorder.resume()`. ~30 lines.

2. **Decoupled UI/audio state.** Even with a single state enum on the React side, treat `MediaRecorder` operations (pause/resume/stop) as orthogonal to the React state — call them from state-transition handlers, never block React rendering on them.

3. **Multiple panels via Tauri windows is heavier than NSPanel.** Defer the "second window for discard confirm" pattern; it's a v1.5 polish at most. The in-pill state-swap is enough.

4. **Apps catalog scope.** Our `apps.json` (v1) is ~15 entries by design. Superwhisper has hundreds with rich metadata. Worth revisiting as a community-contributed list later.

5. **PTT timing guards** — adopt the 500ms / 1s hold heuristics directly when we implement push-to-talk for real. The numbers are bake-in domain knowledge.

6. **Sound variant rotation.** Single chime per state is fine for v1. Consider rotating through 4 start/stop variants in a future pass to reduce repetition fatigue.

## Out of scope of this note

- We did not disassemble the binary or extract logic — only the symbol table and string constants.
- No claims about *how* `_continueRecording:` is implemented — only that it exists and is used.
- This is not a reference for copying code; it's a reference for copying patterns the way a designer copies a tasteful arrangement, not the words.
