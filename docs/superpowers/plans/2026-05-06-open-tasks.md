# Ultravox v1 — open tasks (2026-05-06)

This list captures everything still incomplete after the recent session that fixed the model ID, paste crash, settings reload, theme propagation, and worker prompt-injection. Each task is sized for a single subagent dispatch: focused files, clear acceptance criteria, no design decisions left to the agent.

Priority bands:
- **P0** = ship-blocker for v1 or known UX/correctness gap exposed during recent testing
- **P1** = strong v1 quality/distribution work; ship-blocker for public release
- **P2** = needs a human decision or external setup before dispatch
- **P3** = v1.1 deferred — listed for completeness, do not dispatch now

Suggested execution order: linear within priority. Each task is independent unless `depends on` is noted.

---

## P0 — UX & correctness gaps from this session

### T1. Fix stale "Coming in v1.1" subtitles

**Why:** `HistoryPanel.tsx` is fully implemented (129 lines, real list + clear button) but `HomePanel.tsx` still shows "Coming in v1.1" under the History nav card. The label lies to the user.

**Files:** `apps/ultravox/src/panels/HomePanel.tsx`

**Spec:** Change the History NavCard subtitle from `"Coming in v1.1"` to something accurate, e.g. `"{n} entries · clear at end of session"` where `{n}` reads from `settings.history.length`. Match the format of the existing Modes/Vocabulary subtitles.

**Acceptance:**
- Subtitle reflects current entry count
- No occurrences of "Coming in v1.1" remain in the React tree (grep proves it)

**Complexity:** XS · ~5 lines

---

### T2. Discard-confirm state in the pill

**Why:** Esc during recording currently throws away the recording with no second chance — easy to lose work to a hand-twitch. Superwhisper's pattern (documented in `docs/research/superwhisper-architecture.md`) is to enter a `confirmingDiscard` state instead, pause the audio engine, swap the pill body for a prompt, and rebind the footer hints.

**Files:**
- `apps/ultravox/src/windows/PillWindow.tsx` (add state, swap render)
- `apps/ultravox/src/hooks/useRecorder.ts` (expose `pause` + `resume` wrapping `MediaRecorder.pause/resume`)

**Spec:**
1. Extend `PillState` union to add `"confirming-discard"`.
2. While `state === "recording"`, ⎋ no longer cancels — it transitions to `"confirming-discard"` and calls `recorder.pause()`.
3. In `"confirming-discard"`:
   - Waveform area is replaced with body text **"Discard recording?"** (centered, 13px, `var(--pill-fg)`)
   - Footer mode-name area unchanged; right-side hints become `⏎ Discard` and `Space Continue`
   - ⏎ → cancel (clear chunks via the existing `recorder.cancel()`), state → `"idle"`, hide pill
   - Space → `recorder.resume()`, state → `"recording"`
   - The record-toggle hotkey (⌘⇧;) while in `confirming-discard` should resume + immediately stop+transcribe (treat as "continue and stop normally")
4. Add `pause()` and `resume()` methods to the `useRecorder` hook that wrap `MediaRecorder.pause()` / `resume()`. They should be no-ops when state isn't `"recording"`.

**Acceptance:**
- Pressing Esc once during recording shows the discard prompt; pressing Esc again does nothing (it's not bound in this state).
- Pressing Space resumes recording; the waveform shows live audio again.
- Pressing Enter discards and hides the pill.
- The recorded blob after a pause→resume→stop sequence still transcribes correctly through the existing pipeline.
- `logDebug("record-stop", ...)` still fires once per session, with the correct chunk count after pause/resume.

**Complexity:** M · ~50–80 lines · single feature, two files

---

### T3. Capture frontmost-app at paste time in the diagnostic log

**Why:** When paste went to the wrong window earlier today, we had no record of which app actually received Cmd+V. Capturing it gives one-glance diagnosis on the next paste-misroute incident.

**Files:**
- `apps/ultravox/src/windows/PillWindow.tsx` (call `getFrontmostApp` again right before paste; pass to logDebug)
- `apps/ultravox/src/lib/debugLog.ts` (add optional `bundleId` and `appName` fields to `DebugEntry`)
- `apps/ultravox/src/panels/ConfigurationPanel.tsx` (render `bundleId` in the diagnostics row detail line if present)

**Spec:**
1. In `stopAndTranscribe`, immediately before `await pasteToFrontmost(result.text)`, call `await getFrontmostApp()` again (separate from the earlier capture used for auto-mode).
2. Pass the bundleId + name into the existing `logDebug("paste", { ... })` call, e.g.:
   ```ts
   logDebug("paste", {
     textLength: result.text.length,
     durationMs: ...,
     message: `→ ${frontmost?.name ?? "?"} (${frontmost?.bundle_id ?? "?"})`,
   });
   ```
3. Same on the error branch: include the frontmost in the error log entry too.

**Acceptance:**
- Diagnostics panel `paste` rows show `→ TextEdit (com.apple.TextEdit)` (or whatever app was focused).
- No new fields required in `DebugEntry` if just reusing `message`.

**Complexity:** XS · ~10 lines · most surgical possible

---

## P1 — v1 distribution & feature completeness

### T4. Push-to-talk: make the toggle do something

**Why:** The Home panel exposes a "Push-to-talk" toggle (`settings.recordingStyle === "push-to-talk"`) but the global-shortcut handler only fires on `ShortcutState::Pressed`. Toggle does nothing today — false signal to the user.

**Files:**
- `apps/ultravox/src-tauri/src/hotkey.rs` (handle Pressed/Released states differently when PTT is enabled)
- `apps/ultravox/src/windows/PillWindow.tsx` (separate handlers for press vs release events)
- `apps/ultravox/src/lib/store-bridge.ts` (make `recordingStyle` value flow through to the Tauri side; today it's only stored client-side)
- New: emit `hotkey:ptt-pressed` and `hotkey:ptt-released` events from Rust when PTT mode is active

**Spec:**
1. Settings stores `recordingStyle: "toggle" | "push-to-talk"` (already exists).
2. When `recordingStyle === "push-to-talk"`:
   - Rust emits `hotkey:ptt-pressed` on `ShortcutState::Pressed` and `hotkey:ptt-released` on `ShortcutState::Released`.
   - PillWindow listens to those: pressed → `startRecord`, released → `stopAndTranscribe`. The existing `hotkey:toggle-record` listener stays for toggle mode.
3. The Rust side needs to know the current style. Two options, pick the simpler one:
   - **A)** A Tauri command `set_recording_style(style: String)` that the React side calls when settings load and when the toggle changes; Rust holds the style in state.
   - **B)** Rust always emits both events; React decides per-window which to honor.
   - Prefer **B** (no Rust state), unless it adds latency.
4. Settings panel toggle calls the new wiring path.

**Acceptance:**
- With PTT off (default toggle mode): unchanged behavior.
- With PTT on: holding ⌘⇧; records audio; releasing the key transcribes and pastes.
- Tapping ⌘⇧; very briefly under PTT does NOT start a recording (debounce — see T5).
- Switching the toggle in Settings takes effect on the next press without restart.

**Depends on:** none

**Complexity:** L · ~100–150 lines · two-language, two-window touch

---

### T5. Push-to-talk timing guards

**Why:** Per Superwhisper's PTT debug strings (documented in `docs/research/superwhisper-architecture.md`), accidental tap-and-release of modifier-heavy shortcuts is common. Without a hold-time minimum, PTT records 50ms blips of nothing.

**Files:** `apps/ultravox/src/windows/PillWindow.tsx`

**Spec:**
1. Add a hold-time threshold in the PTT pressed/released handler:
   - 500ms minimum hold if the user has DIFFERENT keys for record vs mode-switcher
   - 1000ms minimum hold if they're the SAME key (rare)
2. On release, if `Date.now() - pressedAt < threshold`, ignore the release: continue recording until the user explicitly toggles.
3. Visual feedback: while under threshold, don't show the pill at all; only show after threshold passes.

**Depends on:** T4 must be done first.

**Acceptance:**
- Tap PTT key for <500ms → no recording happens, no pill shown.
- Hold ≥500ms → pill appears, recording starts.
- Release after recording started → transcribes normally.

**Complexity:** S · ~30 lines · all in one React file

---

### T6. Auto-updater (`tauri-plugin-updater` + GitHub Releases appcast)

**Why:** v1 needs in-app update notifications. Without this, every fix requires telling users to manually re-download. Implementation plan calls for it (Phase 15) but Cargo.toml doesn't include the plugin yet.

**Files:**
- `apps/ultravox/src-tauri/Cargo.toml` (add `tauri-plugin-updater`)
- `apps/ultravox/src-tauri/src/lib.rs` (register plugin)
- `apps/ultravox/src-tauri/tauri.conf.json` (`plugins.updater.endpoints`, `pubkey`)
- `apps/ultravox/package.json` (add `@tauri-apps/plugin-updater` if needed for UI prompts)
- `apps/ultravox/src/lib/updater.ts` NEW (small wrapper that polls + prompts)
- `apps/ultravox/src/App.tsx` (call updater check on mount)

**Spec:**
1. Generate update signing keypair: `pnpm tauri signer generate -w ~/.tauri/ultravox.key` (output instructions, don't actually generate — keys belong to the human).
2. Public key goes in `tauri.conf.json`.
3. Endpoint: `https://github.com/Pitthammerit/ultravox/releases/latest/download/latest.json`. Releases will include a `latest.json` per Tauri's appcast format.
4. App calls `check()` on launch (after a 30s delay so first-launch isn't blocked); if an update exists, show a non-modal toast with "Update available — install now / later".
5. Document the release flow: `pnpm tauri build` produces signed assets + a `latest.json`; user uploads both to the GitHub release.

**Acceptance:**
- App reports "you're on latest" when stub appcast says current version is current.
- App prompts when stub appcast says newer version available.
- A real release-and-update round trip works end-to-end (this part is testable only after T7 because builds need to be signed first).

**Depends on:** T7 for full validation, but the wiring is independent.

**Complexity:** M · ~80 lines + config

---

## P2 — needs human input before dispatch

### T7. Code-signing + notarization for DMG distribution

**Why:** Tauri config `bundle.targets: ["dmg"]` is set but signing is not configured. An unsigned DMG won't pass macOS Gatekeeper without users right-clicking and overriding.

**Blockers (must be human-supplied before dispatch):**
- `APPLE_ID` — Apple ID email
- `APPLE_PASSWORD` — App-specific password (from appleid.apple.com)
- `APPLE_TEAM_ID` — From Apple Developer dashboard
- `APPLE_SIGNING_IDENTITY` — `Developer ID Application: Name (TEAMID)` from `security find-identity -p codesigning -v`
- Decision: GitHub Actions workflow vs local-only build?

**Files (after blockers resolved):**
- `apps/ultravox/src-tauri/tauri.conf.json`
- `.github/workflows/release.yml` NEW (if CI route)
- `docs/release.md` NEW (release runbook)

**Status:** Do not dispatch yet — needs the user to set Apple Developer secrets first and choose CI vs local.

---

### T8. Telemetry: real Sentry wiring or remove placeholders

**Why:** `apps/ultravox/src/lib/telemetry.ts` has `track()` and `captureError()` with `// TODO: Sentry` comments and a `VITE_SENTRY_DSN` env check. Real wiring is gated on the user creating a Sentry project + DSN.

**Blockers:** `VITE_SENTRY_DSN` from a Sentry project the user creates.

**Status:** Do not dispatch — alternative is to remove the placeholder and treat all `track`/`captureError` calls as console-only until Sentry is actually wanted.

---

## P3 — v1.1 deferred (do NOT dispatch this round)

For reference only; tracked in `docs/implementation-plan.md` "Reference notes / future work TODOs":

- Per-device microphone selection (Sound panel)
- Silence removal (currently a no-op toggle)
- `text_input_format` per app in `apps.json` (broader catalog enrichment)
- Sound variant rotation (Start1-4.m4a, Stop1-4.m4a)
- Cross-app paste smoke-test matrix (`docs/known-issues.md` table)
- Cascading panels for mode picker (in-pill submenu is fine for v1)
- Native AX-API paste (replaces enigo) — current enigo works after main-thread fix
- Mode editor v1.5 enhancements (per-app override mappings)
- File-transcription drop-zone

---

## Dispatch sequence (recommended)

```
T1 (XS, inline) — fix label
   ↓
T3 (XS) — paste-time frontmost diagnostic
   ↓
T2 (M) — discard-confirm state
   ↓
T4 (L) — push-to-talk for real
   ↓
T5 (S) — PTT timing guards
   ↓
T6 (M) — auto-updater wiring
   ↓
[gate: T7 needs Apple Dev secrets from user]
   ↓
T7 (signing + notarization)
   ↓
[gate: T8 needs Sentry DSN from user, or strip placeholders]
```

T1 is small enough to do inline before the first subagent dispatch. T2-T6 each become their own subagent dispatch following the standard implementer → spec-reviewer → code-quality-reviewer loop.

After T6 lands, the v1 codebase is functionally complete and the only remaining gates are external (Apple Dev account secrets + Sentry signup). At that point we can also re-evaluate whether to defer T8 entirely and ship without telemetry.
