import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import RollingWaveform from "../components/RollingWaveform";
import { ModeGlyph } from "../components/ModeIcons";
import { useRecorder } from "../hooks/useRecorder";
import { useHotkeyEvent } from "../hooks/useHotkeyEvents";
import { transcribe } from "../lib/transcribe";
import {
  TOKEN_ENDPOINT,
  pasteToFrontmost,
  getFrontmostApp,
  setPillHeight,
  setPillPositionTopCenter,
  setPillSizeAtPosition,
  updateMicSubmenu,
  mediaPause,
  mediaResume,
} from "../lib/tauri-bridge";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { appendHistory, loadSettings, patchSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { pickAutoMode } from "../lib/autoMode";
import { invoke } from "@tauri-apps/api/core";
import { captureError, track } from "../lib/telemetry";
import { logDebug } from "../lib/debugLog";
import { playStartChime, playStopChime } from "../lib/chime";
import { prettifyShortcut } from "../components/HotkeyRecorder";

type PillState = "idle" | "recording" | "discardConfirm" | "transcribing" | "error" | "silenceClosing";
type PillView = "pill" | "modes";

// Visible pill chrome height (original Superwhisper proportions).
const PILL_CONTENT_H = 108;

// Transparent margin around the pill so the CSS box-shadow has room to
// render around the rounded corners. macOS native shadow is disabled
// (`shadow: false`) because it draws around the rectangular WINDOW bounds,
// not the alpha mask — that produced a visible square frame.
const SHADOW_PAD = 14;

// Total window height (must match tauri.conf.json).
const PILL_H = PILL_CONTENT_H + SHADOW_PAD * 2;

// Default pill window WIDTH (must match tauri.conf.json default).
const PILL_W = 360;

// Footer height shared by pill chrome and modes submenu.
const FOOTER_H = 44;

// Waveform / ticker area above footer.
const WAVE_H = PILL_CONTENT_H - FOOTER_H;

// Each mode row height in the macOS-Focus-style list.
const MODE_ROW_H = 44;

// Gap between the pill chrome and the modes panel (px).
const SUBMENU_GAP = 6;

// Top + bottom padding inside the modes list (p-1 = 4px each side).
const LIST_PAD = 8;

// Height of the hint footer inside the modes panel.
const MODES_FOOTER_H = 36;

// Compact mini-pill — visible oval size.
const COMPACT_PILL_W = 150;
const COMPACT_PILL_H = 30;
// Window size for compact mode = visible pill + SHADOW_PAD on all sides so
// the CSS box-shadow has room to render around the rounded corners (same
// pattern as the full pill). Without this, shadow gets clipped at the
// window edge.
const COMPACT_W = COMPACT_PILL_W + SHADOW_PAD * 2;
const COMPACT_H = COMPACT_PILL_H + SHADOW_PAD * 2;

// Below this peak RMS amplitude (0..1), treat the recording as silent and
// skip the upload — Whisper otherwise hallucinates random words on near-silent audio.
const SILENCE_PEAK_THRESHOLD = 0.02;

/** Compute the expanded window height needed to show N modes in the list. */
function expandedHeight(modeCount: number): number {
  const modesPanelH = modeCount * MODE_ROW_H + LIST_PAD + MODES_FOOTER_H;
  return PILL_H + SUBMENU_GAP + modesPanelH;
}

// Keyframes for the "Transcribing…" pulse + compact-pill dot animation.
// Embedded inline because settings.css is route-scoped to the Settings window only.
const PILL_KEYFRAMES = `
@keyframes ultravox-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes ultravox-dot-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;

export default function PillWindow() {
  const recorder = useRecorder();
  const [state, setState] = useState<PillState>("idle");
  const [view, setView] = useState<PillView>("pill");
  const [compact, setCompact] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mode, setMode] = useState<VoiceMode>(DEFAULT_MODES[0]!);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const transcribeLabel = "Transcribing…";

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      const found = (s.modes ?? DEFAULT_MODES).find((m) => m.id === s.activeModeId);
      if (found) setMode(found);
      // Resolve pill style: prefer the new top-level field, fall back to the
      // legacy boolean for stores written before v0.9.17.
      const style = s.pillStyle ?? (s.sound.compactPill ? "mini" : "classic");
      const isCompact = style === "mini";
      setCompact(isCompact);
      // If we're booting in compact mode, restore the last dragged position
      // (pillCompactPosition) so the pill reopens where the user left it.
      // Fall back to top-center when there is no saved compact position yet.
      if (isCompact) {
        const cp = s.pillCompactPosition;
        if (cp) {
          setPillSizeAtPosition(COMPACT_W, COMPACT_H, cp.x, cp.y).catch(() => {
            setPillPositionTopCenter(COMPACT_W, COMPACT_H).catch(() => {});
          });
        } else {
          setPillPositionTopCenter(COMPACT_W, COMPACT_H).catch(() => {});
        }
      } else {
        setPillHeight(PILL_H).catch(() => {});
      }
      setSettingsLoaded(true);
      // Apply the user's theme — the pill is a separate WebView, so it must
      // call applyTheme itself; main.tsx only theme-applies the Settings App.
      applyTheme(s.theme);
    }).catch(() => setSettings(null));

    // Repaint when Settings broadcasts a theme change.
    let unsubTheme: (() => void) | undefined;
    let unsubMic: (() => void) | undefined;
    let unsubPillStyle: (() => void) | undefined;
    listen<ThemeChoice>("theme:changed", (e) => applyTheme(e.payload)).then((u) => { unsubTheme = u; });

    // Apply pill-style changes from the Settings window IMMEDIATELY — without
    // waiting for the next recording's loadSettings() to refresh local state.
    // This is a SILENT config update: we update internal state + window size
    // so the next recording uses the new style, but we do NOT show the pill.
    // The earlier live-preview behavior popped the window on every click in
    // Settings, which the user read as a half-applied state and re-clicked,
    // requiring two clicks to make the change "stick".
    listen<NonNullable<AppSettings["pillStyle"]>>("pillStyle:changed", async (e) => {
      const style = e.payload;
      const fresh = await loadSettings().catch(() => null);
      if (fresh) setSettings(fresh);
      const desiredCompact = style === "mini";
      if (desiredCompact) {
        const cp = fresh?.pillCompactPosition;
        if (cp) {
          await setPillSizeAtPosition(COMPACT_W, COMPACT_H, cp.x, cp.y).catch(() => {});
        } else {
          await setPillPositionTopCenter(COMPACT_W, COMPACT_H).catch(() => {});
        }
      } else {
        const ep = fresh?.pillExpandedPosition;
        if (ep) {
          await setPillSizeAtPosition(PILL_W, PILL_H, ep.x, ep.y).catch(() => {});
        } else {
          await setPillPositionTopCenter(PILL_W, PILL_H).catch(() => {});
        }
      }
      setCompact(desiredCompact);
    }).then((u) => { unsubPillStyle = u; });

    // Tray "Microphone Settings" submenu population + selection.
    const pushDevices = async (selectedId: string | null) => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({
            id: d.deviceId,
            label: d.label && d.label.trim().length > 0 ? d.label : `Microphone ${i + 1}`,
          }));
        await updateMicSubmenu(inputs, selectedId);
      } catch (e) {
        logDebug("error", { message: `enumerateDevices: ${(e as Error).message?.slice(0, 200)}` });
      }
    };

    loadSettings()
      .then((s) => pushDevices(s.selectedMicDeviceId ?? null))
      .catch(() => pushDevices(null));

    const onDeviceChange = () => {
      loadSettings()
        .then((s) => pushDevices(s.selectedMicDeviceId ?? null))
        .catch(() => pushDevices(null));
    };
    navigator.mediaDevices.addEventListener?.("devicechange", onDeviceChange);

    listen<string>("tray:set-mic-device", async (e) => {
      const id = e.payload && e.payload.length > 0 ? e.payload : null;
      logDebug("record-start", { message: `tray:set-mic-device → ${id ?? "default"}` });
      try {
        const fresh = await loadSettings();
        const next = { ...fresh, selectedMicDeviceId: id };
        await saveSettings(next);
        setSettings(next);
        await pushDevices(id);
      } catch (err) {
        logDebug("error", { message: `set-mic-device persist: ${(err as Error).message?.slice(0, 200)}` });
      }
    }).then((u) => { unsubMic = u; });

    return () => {
      unsubTheme?.();
      unsubMic?.();
      unsubPillStyle?.();
      navigator.mediaDevices.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, []);

  const currentModes = settings?.modes ?? DEFAULT_MODES;

  /* ── Reactive sync: settings.pillStyle → local `compact` ───────
   * When the user edits the pill style in the Settings window (a
   * different WebView), the next recording's `loadSettings()` call
   * will refresh `settings`. This effect notices the resulting
   * pillStyle change and brings the local `compact` boolean +
   * window geometry in sync, mirroring what expand()/collapse()
   * do — but WITHOUT writing settings (that path is owned by the
   * user actions; writing here would re-trigger this effect).
   */
  useEffect(() => {
    if (!settingsLoaded || !settings) return;
    const desired =
      settings.pillStyle ?? (settings.sound.compactPill ? "mini" : "classic");
    const desiredCompact = desired === "mini";
    if (desiredCompact === compact) return;
    if (desiredCompact) {
      const cp = settings.pillCompactPosition;
      if (cp) {
        setPillSizeAtPosition(COMPACT_W, COMPACT_H, cp.x, cp.y).catch(() => {});
      } else {
        setPillPositionTopCenter(COMPACT_W, COMPACT_H).catch(() => {});
      }
    } else {
      const ep = settings.pillExpandedPosition;
      if (ep) {
        setPillSizeAtPosition(PILL_W, PILL_H, ep.x, ep.y).catch(() => {});
      } else {
        setPillHeight(PILL_H).catch(() => {});
      }
    }
    setCompact(desiredCompact);
  }, [settings?.pillStyle, settings?.sound.compactPill, settingsLoaded, compact, settings?.pillCompactPosition, settings?.pillExpandedPosition]);

  /* ── Resize pill window when view/compact/state change ─────────
   * Compact-mode positioning is handled by the dedicated compact branch
   * (collapse/expand call setPillPositionTopCenter / setPillSizeAtPosition
   * directly), so this effect only manages NON-compact resize.
   */
  useEffect(() => {
    if (!settingsLoaded) return;
    if (compact) return;
    if (view === "modes") {
      setPillHeight(expandedHeight(currentModes.length)).catch(() => {});
    } else {
      setPillHeight(PILL_H).catch(() => {});
    }
  }, [view, compact, currentModes.length, settingsLoaded]);

  /* ── Auto-expand if a recording starts in compact mode ─────── */
  const expand = useCallback(async (trigger: "manual" | "auto-recording" = "manual") => {
    const t0 = performance.now();
    const fresh = await loadSettings().catch(() => settings);
    const saved = fresh?.pillExpandedPosition;
    const x = saved?.x ?? 0;
    const y = saved?.y ?? 0;
    logDebug("pill-expand", {
      message: `trigger=${trigger} target=(${x},${y}) size=${PILL_W}x${PILL_H} hasSaved=${!!saved}`,
    });
    try {
      await setPillSizeAtPosition(PILL_W, PILL_H, x, y);
    } catch (e) {
      logDebug("pill-expand", { error: `setPillSizeAtPosition failed: ${(e as Error).message?.slice(0, 200)}` });
    }
    setCompact(false);
    if (fresh) {
      // Sync BOTH the new pillStyle field AND the legacy compactPill so the
      // user's manual expand sticks across recording sessions and a downgrade
      // to a pre-0.9.17 build still reads the right state.
      const next = { ...fresh, pillStyle: "classic" as const, sound: { ...fresh.sound, compactPill: false } };
      setSettings(next);
      await saveSettings(next).catch((e) =>
        logDebug("pill-expand", { error: `saveSettings: ${(e as Error).message?.slice(0, 120)}` }),
      );
    } else {
      patchSettings({
        pillStyle: "classic",
        sound: { ...(settings?.sound ?? {} as AppSettings["sound"]), compactPill: false },
      }).catch(() => {});
    }
    logDebug("pill-expand", { durationMs: Math.round(performance.now() - t0), message: "done" });
  }, [settings]);

  const collapse = useCallback(async () => {
    const t0 = performance.now();
    try {
      const win = getCurrentWebviewWindow();
      // outerPosition() returns PhysicalPosition (device pixels). Our Rust
      // command set_pill_size_at_position interprets x/y as LogicalPosition,
      // so divide by scale factor BEFORE saving — otherwise on a retina
      // display (scale 2) the saved value is 2× too far right/down and the
      // expand path warps the window off-screen.
      const physical = await win.outerPosition();
      const scale = await win.scaleFactor();
      const expanded = {
        x: Math.round(physical.x / scale),
        y: Math.round(physical.y / scale),
      };
      logDebug("pill-collapse", {
        message: `state=${state} view=${view} scale=${scale} physical=(${physical.x},${physical.y}) saving=(${expanded.x},${expanded.y})`,
      });

      const fresh = await loadSettings().catch(() => settings);
      if (fresh) {
        const next: AppSettings = {
          ...fresh,
          pillExpandedPosition: expanded,
          pillStyle: "mini",
          sound: { ...fresh.sound, compactPill: true },
        };
        setSettings(next);
        await saveSettings(next).catch((e) =>
          logDebug("pill-collapse", { error: `saveSettings: ${(e as Error).message?.slice(0, 120)}` }),
        );
      } else {
        await patchSettings({ pillExpandedPosition: expanded, pillStyle: "mini" }).catch(() => {});
      }
      try {
        await setPillPositionTopCenter(COMPACT_W, COMPACT_H);
      } catch (e) {
        logDebug("pill-collapse", { error: `setPillPositionTopCenter: ${(e as Error).message?.slice(0, 200)}` });
      }
      setCompact(true);
      logDebug("pill-collapse", { durationMs: Math.round(performance.now() - t0), message: "done" });
    } catch (e) {
      logDebug("pill-collapse", { error: `unhandled: ${(e as Error).message?.slice(0, 200)}` });
      captureError(e, { stage: "collapse" });
    }
  }, [settings, state, view]);

  // Save compact pill position after every drag so the next launch restores
  // where the user left it. data-tauri-drag-region doesn't fire a "drag ended"
  // event, so we listen to mouseup on the window and snapshot outerPosition.
  useEffect(() => {
    if (!compact) return;
    const onMouseUp = async () => {
      try {
        const win = getCurrentWebviewWindow();
        const physical = await win.outerPosition();
        const scale = await win.scaleFactor();
        const pos = {
          x: Math.round(physical.x / scale),
          y: Math.round(physical.y / scale),
        };
        await patchSettings({ pillCompactPosition: pos });
      } catch {}
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [compact]);

  // Explicit startDragging on compact pill mousedown — more reliable than
  // data-tauri-drag-region alone with the non-activating NSPanel setup.
  const handleCompactDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    getCurrentWebviewWindow().startDragging().catch(() => {});
  }, []);

  // (Auto-expand-on-recording removed: compact mode is now a deliberate
  // mode the user enters/exits manually. It persists through idle →
  // recording → transcribing → idle, and across app restarts via the
  // sound.compactPill flag.)

  /* ── Mode list toggle ───────────────────────────────────────── */
  useHotkeyEvent(
    "hotkey:toggle-mode-overlay",
    useCallback(() => {
      setView((v) => {
        if (v === "pill") {
          const idx = currentModes.findIndex((m) => m.id === mode.id);
          setHighlightIdx(idx === -1 ? 0 : idx);
          return "modes";
        }
        return "pill";
      });
    }, [currentModes, mode.id]),
  );

  /* ── Mode list keyboard nav ─────────────────────────────────── */
  useEffect(() => {
    if (view !== "modes") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === "Space") {
        e.preventDefault();
        setView("pill");
        if (state === "idle") invoke("hide_pill").catch(() => {});
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => (i + 1) % currentModes.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => (i - 1 + currentModes.length) % currentModes.length); return; }
      if (e.key === "Enter") { e.preventDefault(); const m = currentModes[highlightIdx]; if (m) pickMode(m); return; }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= currentModes.length) { e.preventDefault(); pickMode(currentModes[n - 1]!); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentModes, highlightIdx, state]);

  const pickMode = useCallback(async (m: VoiceMode) => {
    setMode(m);
    setView("pill");
    if (settings) {
      const next = { ...settings, activeModeId: m.id };
      setSettings(next);
      await saveSettings(next);
    }
    if (state === "idle") invoke("hide_pill").catch(() => {});
  }, [settings, state]);

  /* ── Error display — sticky until user dismisses with Esc / click ──
   *
   * In compact mode the window is COMPACT_W × COMPACT_H, but the error
   * branch falls through to the full-pill JSX (see render guard). Without
   * resizing, the full pill renders into the tiny compact window and the
   * user sees a clipped fragment ("error") with no way to interact —
   * effectively stuck. Resize back to PILL_W × PILL_H so the full message
   * + Dismiss hint are visible and the window can become key for Esc.
   */
  // Tracks the currently scheduled silence-flow timeouts so a new recording
  // (or any explicit dismiss) can cancel them cleanly. Without this, an
  // auto-flow scheduled in turn N could fire mid-turn N+1 and hide the pill
  // while the user is recording again.
  const silenceTimersRef = useRef<number[]>([]);
  const cancelSilenceTimers = useCallback(() => {
    silenceTimersRef.current.forEach((id) => window.clearTimeout(id));
    silenceTimersRef.current = [];
  }, []);

  const showError = useCallback((msg: string) => {
    console.error("[pill] showError:", msg);
    cancelSilenceTimers();
    setErrorMsg(msg);
    setState("error");
    if (compact) {
      setPillPositionTopCenter(PILL_W, PILL_H).catch(() => {});
    }
    invoke("show_pill").catch(() => {});
  }, [compact, cancelSilenceTimers]);

  /**
   * Two-phase auto-dismiss flow for the silence-detected case.
   *  1) Show the red "No speech detected…" error for 2 s.
   *  2) Transition to a neutral "Nothing to transcribe. Closing…" message
   *     rendered with the same large/centered styling as the Transcribing
   *     status (NOT the error styling) for 800 ms.
   *  3) Auto-hide the pill and reset to idle. No user dismiss required.
   */
  const showSilenceFlow = useCallback((msg: string) => {
    console.warn("[pill] silence flow:", msg);
    cancelSilenceTimers();
    setErrorMsg(msg);
    setState("error");
    if (compact) {
      setPillPositionTopCenter(PILL_W, PILL_H).catch(() => {});
    }
    invoke("show_pill").catch(() => {});

    const t1 = window.setTimeout(() => {
      setState("silenceClosing");
      const t2 = window.setTimeout(() => {
        setState("idle");
        invoke("hide_pill").catch(() => {});
      }, 800);
      silenceTimersRef.current.push(t2);
    }, 2000);
    silenceTimersRef.current.push(t1);
  }, [compact, cancelSilenceTimers]);

  const dismissError = useCallback(() => {
    setView("pill");
    setState("idle");
    if (compact) {
      const cp = settings?.pillCompactPosition;
      if (cp) {
        setPillSizeAtPosition(COMPACT_W, COMPACT_H, cp.x, cp.y).catch(() => {});
      } else {
        setPillPositionTopCenter(COMPACT_W, COMPACT_H).catch(() => {});
      }
    }
    invoke("hide_pill").catch(() => {});
  }, [compact, settings]);

  /* Single Esc / discard handler — was previously TWO competing
     listeners (one universal "abort and hide", one recording-specific
     "discard-confirm prompt"); both fired on the same key event and the
     state ping-ponged depending on registration order. Now one listener,
     one decision tree, one preventDefault.
       transcribing     → ignored (non-cancellable)
       recording        → first Esc opens the discard-confirm prompt
       discardConfirm   → Esc / Space returns to recording; Enter discards
       error / idle / modes → hide the pill cleanly
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state === "transcribing") return;
      const k = e.key;
      if (state === "discardConfirm") {
        // Space → back to recording; Esc / Enter → confirm discard.
        if (k === " ") {
          e.preventDefault();
          setState("recording");
          return;
        }
        if (k === "Escape" || k === "Enter") {
          e.preventDefault();
          recorder.cancel();
          if (settings?.sound.pauseMediaWhileRecording) {
            mediaResume().catch(() => {});
          }
          setState("idle");
          invoke("hide_pill").catch(() => {});
          return;
        }
        return;
      }
      if (k !== "Escape") return;
      e.preventDefault();
      if (state === "recording") {
        setState("discardConfirm");
        return;
      }
      if (state === "error") {
        dismissError();
        return;
      }
      // idle / modes-view → just hide.
      setView("pill");
      setState("idle");
      invoke("hide_pill").catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, recorder, settings, dismissError]);

  /* ── Recording ──────────────────────────────────────────────── */
  const startRecord = useCallback(async () => {
    cancelSilenceTimers();
    try {
      // Re-load settings every recording so edits made in the Settings window
      // (different WebView, separate React state) take effect on the next press
      // — without needing to restart the pill.
      const fresh = await loadSettings().catch(() => settings);
      if (fresh) setSettings(fresh);
      const cur = fresh ?? settings ?? null;
      const frontmost = await getFrontmostApp();
      const modes = cur?.modes ?? DEFAULT_MODES;
      const fallbackId = cur?.activeModeId ?? modes[0]!.id;
      const picked = pickAutoMode(frontmost?.bundle_id ?? null, modes, fallbackId);
      setMode(picked);
      track("recording.started", { modeId: picked.id, bundleId: frontmost?.bundle_id ?? null });
      if (cur?.sound.chime) playStartChime(cur.sound.chimeVolume);
      const autoGain = cur?.sound.autoGain ?? true;
      const micId = cur?.selectedMicDeviceId ?? null;
      const constraints: MediaTrackConstraints = {
        autoGainControl: autoGain,
        noiseSuppression: true,
      };
      if (micId) constraints.deviceId = { exact: micId };
      await recorder.start(constraints);
      // Pause music AFTER mic stream is live, so the AVAudioSession the
      // browser opened is fully active before any AppleScript pause runs.
      // This avoids macOS reordering events such that the pause invalidates
      // the just-opened input stream.
      if (cur?.sound.pauseMediaWhileRecording) {
        mediaPause().catch((err) =>
          logDebug("error", { message: `mediaPause: ${(err as Error).message?.slice(0, 200)}` }),
        );
      }
      setState("recording");
    } catch (e) {
      captureError(e, { stage: "start" });
      const err = e as DOMException;
      const friendly = err?.name === "NotAllowedError"
        ? "Microphone access denied — enable in System Settings → Privacy → Microphone."
        : err?.name === "NotFoundError" ? "No microphone found."
        : (e as Error).message || "Couldn't start recording.";
      showError(friendly);
    }
  }, [recorder, settings, showError, cancelSilenceTimers]);

  const stopAndTranscribe = useCallback(async () => {
    console.log("[pill] stopAndTranscribe begin");
    setState("transcribing");
    if (settings?.sound.pauseMediaWhileRecording) {
      mediaResume().catch((err) =>
        logDebug("error", { message: `mediaResume: ${(err as Error).message?.slice(0, 200)}` }),
      );
    }
    // Hold the Transcribing label visible for at least 600ms so it's
    // perceptible even when the worker / claude-code returns instantly.
    // Otherwise the user just sees a flash, then the idle dots, and
    // assumes nothing happened.
    const transcribingMinVisible = new Promise<void>((r) => setTimeout(r, 600));
    if (settings?.sound.chime) playStopChime(settings.sound.chimeVolume);
    try {
      const blob = await recorder.stop();
      console.log("[pill] recorder.stop returned blob:", blob ? `${blob.size} bytes, ${blob.type}` : "null");
      if (!blob || blob.size === 0) {
        showError(blob ? "Recording produced 0 bytes — mimeType not supported by WebKit?" : "No audio captured.");
        return;
      }
      // Short-circuit silent recordings BEFORE uploading. Whisper otherwise
      // hallucinates random words (often non-English) on near-silent audio.
      const peakLevel = recorder.getPeakLevel();
      console.log("[pill] peak level:", peakLevel.toFixed(4), "threshold:", SILENCE_PEAK_THRESHOLD);
      if (peakLevel < SILENCE_PEAK_THRESHOLD) {
        track("transcription.silenced", { peakLevel: Number(peakLevel.toFixed(4)) });
        showSilenceFlow("No speech detected. Move closer to the mic or check your input device.");
        return;
      }
      const frontmost = await getFrontmostApp();
      console.log("[pill] frontmost app:", frontmost);
      const result = await transcribe(blob, {
        mode,
        vocabulary: settings?.vocabulary ?? [],
        tokenEndpoint: TOKEN_ENDPOINT,
        ...(settings?.firstName ? { firstName: settings.firstName } : {}),
        ...(settings?.lastName ? { lastName: settings.lastName } : {}),
        ...(frontmost ? { frontmostApp: frontmost } : {}),
        localWhisperEnabled: settings?.localWhisperEnabled ?? false,
      });
      console.log("[pill] transcribe result.text length:", result.text.length);
      track("transcription.completed", { modeId: mode.id, length: result.text.length });
      await transcribingMinVisible;
      if (result.text) {
        setState("idle");
        await invoke("hide_pill").catch(() => {});
        // Brief delay so the pill window fully hides and macOS restores focus to the target app.
        await new Promise<void>((r) => setTimeout(r, 120));
        try {
          const pasteStart = performance.now();
          await pasteToFrontmost(result.text);
          logDebug("paste", {
            textLength: result.text.length,
            durationMs: Math.round(performance.now() - pasteStart),
          });
        } catch (pasteErr) {
          captureError(pasteErr, { stage: "paste" });
          logDebug("paste", { error: String((pasteErr as Error).message ?? pasteErr), textLength: result.text.length });
          showError(`Paste failed: ${(pasteErr as Error).message ?? pasteErr} — Accessibility access likely denied.`);
          return;
        }
        appendHistory({ id: crypto.randomUUID(), ts: Date.now(), modeId: mode.id, bundleId: frontmost?.bundle_id ?? null, text: result.text })
          .catch((e) => captureError(e, { stage: "history-append" }));
      } else {
        showError("Transcription returned empty text — silence detected, or the worker didn't decode the audio.");
      }
    } catch (e) {
      captureError(e, { stage: "transcribe" });
      showError(`Transcribe error: ${(e as Error).message || e}`);
    }
  }, [recorder, mode, settings, showError, showSilenceFlow]);

  // Track state in a ref so the hotkey handler always reads the latest
  // value. Using state directly in the useCallback closure caused stale
  // captures because useHotkeyEvent's listen()/unlisten() is async — there
  // was a window where Tauri routed the event to the OLD handler closure
  // (with stale state="idle") even though state had already become
  // "recording", so the second hotkey press ran startRecord again instead
  // of stopAndTranscribe.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  /* ── Footer-button handlers (shared with keyboard shortcuts) ──
     Each handler mirrors exactly one branch of the keydown listener
     above, so clicking a button is indistinguishable from pressing
     the corresponding key. */
  const requestDiscardConfirm = useCallback(() => {
    if (stateRef.current === "recording") setState("discardConfirm");
  }, []);
  const confirmDiscard = useCallback(() => {
    recorder.cancel();
    if (settings?.sound.pauseMediaWhileRecording) {
      mediaResume().catch(() => {});
    }
    setState("idle");
    invoke("hide_pill").catch(() => {});
  }, [recorder, settings]);
  const resumeRecording = useCallback(() => {
    setState("recording");
  }, []);

  /* ── Hotkey: toggle record ──────────────────────────────────── */
  useHotkeyEvent(
    "hotkey:toggle-record",
    useCallback(() => {
      const s = stateRef.current;
      logDebug("record-start", { message: `hotkey:toggle-record fired, stateRef=${s}` });
      if (s === "idle") startRecord();
      else if (s === "recording") stopAndTranscribe();
      // discardConfirm and transcribing: ignore hotkey
    }, [startRecord, stopAndTranscribe]),
  );

  /* (Esc / Space / Enter handling moved into the single keydown
     listener above. Two competing listeners both responding to Esc
     was the cause of the "sometimes Esc works, sometimes not" race.) */

  const statusLabel =
    state === "error" ? "Error"
    : mode.name;

  const pillStyle: React.CSSProperties = {
    background: "var(--pill-bg)",
    backdropFilter: "blur(28px) saturate(1.4)",
    WebkitBackdropFilter: "blur(28px) saturate(1.4)",
    border: "1px solid var(--pill-border)",
    boxShadow: "var(--pill-shadow)",
  };

  /* ── Compact mini-pill ────────────────────────────────────────
   * Renders for idle / recording / transcribing / discardConfirm.
   * Modes-view and error force the full pill so the user can read
   * the message / pick a mode.
   */
  if (compact && view === "pill" && state !== "error" && state !== "silenceClosing") {
    const isDiscardConfirm = state === "discardConfirm";
    console.log("[pill] compact render, state=", state);
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-transparent"
        style={{ padding: SHADOW_PAD }}
      >
        <style>{PILL_KEYFRAMES}</style>
        <div
          className="relative flex items-center justify-center rounded-full overflow-hidden select-none"
          style={{
            ...pillStyle,
            cursor: "grab",
            width: COMPACT_PILL_W,
            height: COMPACT_PILL_H,
          }}
          onMouseDown={handleCompactDrag}
          onDoubleClick={() => { expand("manual"); }}
          title={
            state === "transcribing" ? "Transcribing…"
            : isDiscardConfirm ? "Click ✓ to keep, ✕ to discard"
            : "Double-click to expand"
          }
        >
          {state === "recording" ? (
            <>
              <div className="absolute inset-0 pl-3 pr-7 flex items-center">
                <RollingWaveform
                  stream={recorder.stream}
                  active={true}
                  color="var(--pill-waveform)"
                  barWidth={2}
                  gap={1.5}
                />
              </div>
              {/* Abort button — single click → discardConfirm prompt.
                  Necessary because the compact pill is a non-activating
                  NSPanel and can't receive keyboard input, so Esc never
                  reaches the WebView. */}
              <button
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--pill-fg-muted)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-warning)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--pill-fg-muted)"; }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); setState("discardConfirm"); }}
                title="Discard recording"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2 L10 10 M10 2 L2 10" />
                </svg>
              </button>
            </>
          ) : isDiscardConfirm ? (
            <div className="absolute inset-0 flex items-center justify-between px-2.5">
              <span style={{ color: "var(--color-warning)", fontSize: 11, fontWeight: 600 }}>
                Discard?
              </span>
              <div className="flex items-center gap-1">
                <button
                  style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: "color-mix(in srgb, var(--color-warning) 18%, transparent)",
                    border: "none", color: "var(--color-warning)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); recorder.cancel(); setState("idle"); invoke("hide_pill").catch(() => {}); }}
                  title="Discard"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M2 2 L10 10 M10 2 L2 10" />
                  </svg>
                </button>
                <button
                  style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
                    border: "none", color: "var(--color-accent)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); setState("recording"); }}
                  title="Keep recording"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5 L5 9 L10 3" />
                  </svg>
                </button>
              </div>
            </div>
          ) : state === "transcribing" ? (
            <span
              style={{
                color: "var(--pill-fg)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.02em",
                animation: "ultravox-pulse 1.4s ease-in-out infinite",
              }}
            >
              Transcribing…
            </span>
          ) : (
            <div className="flex items-center" style={{ gap: 6 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--pill-fg)",
                    opacity: 0.3,
                    animation: "ultravox-dot-pulse 1.4s ease-in-out infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-transparent" style={{ padding: SHADOW_PAD, gap: view === "modes" ? SUBMENU_GAP : 0 }}>
      <style>{PILL_KEYFRAMES}</style>

      {/* ── Pill chrome — always visible ───────────────────────── */}
      <div
        className="flex flex-col rounded-[20px] overflow-hidden select-none shrink-0"
        style={{ ...pillStyle, height: PILL_CONTENT_H }}
      >
        {/* Top area: waveform / ticker / discard-confirm / error */}
        {state === "error" ? (
          <div
            className="w-full flex items-center px-4"
            style={{ height: WAVE_H, cursor: "pointer" }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={dismissError}
            title="Click to dismiss"
          >
            <span
              className="text-[11px] leading-snug"
              style={{ color: "var(--color-warning)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
            >
              {errorMsg}
            </span>
          </div>
        ) : state === "discardConfirm" ? (
          <div
            data-tauri-drag-region
            className="w-full flex items-center justify-center px-4"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <span className="text-[12px] font-medium" style={{ color: "var(--pill-fg)" }}>
              Discard recording?
            </span>
          </div>
        ) : state === "transcribing" || state === "silenceClosing" ? (
          <div
            data-tauri-drag-region
            className="w-full flex items-center justify-center"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <span
              style={{
                color: "var(--pill-fg)",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                animation: "ultravox-pulse 1.4s ease-in-out infinite",
              }}
            >
              {state === "silenceClosing" ? "Nothing to transcribe. Closing…" : transcribeLabel}
            </span>
          </div>
        ) : (
          <div
            data-tauri-drag-region
            className="w-full relative"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <RollingWaveform
              stream={recorder.stream}
              active={state === "recording"}
              color="var(--pill-waveform)"
              barWidth={2}
              gap={1.5}
            />
            {/* Minimize button — visible during idle AND recording. The
                pill is normally hidden in pure idle state, so what the
                user actually sees is the recording-state minimize, which
                is exactly what was missing before. */}
            {view === "pill" && (
              <button
                className="absolute flex items-center justify-center transition-opacity"
                style={{
                  top: 6,
                  right: 10,
                  width: 24,
                  height: 24,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--pill-fg-muted)",
                  opacity: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--pill-fg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--pill-fg-muted)"; }}
                onClick={async (e) => { e.stopPropagation(); await collapse(); }}
                title="Minimize pill"
              >
                {/* Two diagonal arrows pointing toward each other (collapse). */}
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {/* Top-right → inward */}
                  <path d="M14 2 L9 7" />
                  <path d="M9 4 L9 7 L12 7" />
                  {/* Bottom-left → inward */}
                  <path d="M2 14 L7 9" />
                  <path d="M7 12 L7 9 L4 9" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Footer bar — divider + slight tint distinguish status from waveform. */}
        <div
          className="flex items-center justify-between gap-3 px-4 shrink-0"
          style={{
            height: FOOTER_H,
            background: "var(--pill-footer)",
            borderTop: "1px solid var(--pill-border)",
          }}
        >
          {/* Mode label + glyph — click to open the modes submenu (same
              effect as the ⌥⇧K hotkey). Disabled during recording /
              transcribing so the user doesn't accidentally lose context. */}
          <button
            onClick={() => {
              if (state === "transcribing") return;
              const idx = currentModes.findIndex((m) => m.id === mode.id);
              setHighlightIdx(idx === -1 ? 0 : idx);
              setView((v) => (v === "pill" ? "modes" : "pill"));
            }}
            className="flex items-center gap-2 min-w-0 transition-opacity hover:opacity-80"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: state === "transcribing" ? "default" : "pointer",
            }}
          >
            <ModeGlyph
              name={mode.icon}
              size={13}
              strokeWidth={2}
              color="var(--pill-fg)"
            />
            <span
              className="text-[13px] font-medium truncate"
              style={{ color: state === "error" ? "var(--color-warning)" : "var(--pill-fg)" }}
            >
              {statusLabel}
            </span>
          </button>
          <div className="flex items-center gap-3 shrink-0">
            {state === "recording" && (
              <HintRow
                label="Stop"
                keys={prettifyShortcut(settings?.hotkeyRecord ?? "Cmd+Shift+Semicolon").split(" ").filter(Boolean)}
                onClick={stopAndTranscribe}
                ariaLabel="Stop and transcribe"
              />
            )}
            {state === "recording" && (
              <HintRow
                label="Discard"
                keys={["ESC"]}
                onClick={requestDiscardConfirm}
                ariaLabel="Discard recording"
              />
            )}
            {state === "discardConfirm" && (
              <HintRow
                label="Continue"
                keys={["Space"]}
                onClick={resumeRecording}
                ariaLabel="Continue recording"
              />
            )}
            {state === "discardConfirm" && (
              <HintRow
                label="Discard"
                keys={["↵"]}
                onClick={confirmDiscard}
                ariaLabel="Confirm discard"
              />
            )}
            {state === "error" && (
              <HintRow label="Dismiss" keys={["ESC"]} onClick={dismissError} ariaLabel="Dismiss error" />
            )}
            {state === "idle" && view === "pill" && (
              <HintRow
                label="Modes"
                keys={prettifyShortcut(settings?.hotkeyModeOverlay ?? "Alt+Shift+K").split(" ").filter(Boolean)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Modes submenu — macOS Focus-style single-column list ─ */}
      {view === "modes" && (
        <div
          className="flex flex-col rounded-[20px] overflow-hidden select-none flex-1"
          style={pillStyle}
        >
          {/* Mode list — NOT a drag region so buttons receive clicks reliably. */}
          <div className="flex-1 flex flex-col p-1">
            {currentModes.map((m, i) => {
              const active = m.id === mode.id;
              const hi = i === highlightIdx;
              const showHighlight = hi || active;
              return (
                <button
                  key={m.id}
                  onClick={() => pickMode(m)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className="flex items-center gap-3 px-2.5 rounded-lg transition-colors text-left w-full"
                  style={{
                    height: MODE_ROW_H,
                    background: showHighlight ? "var(--pill-row-hover)" : "transparent",
                  }}
                >
                  {/* Circular icon background — accent when active */}
                  <span
                    className="shrink-0 inline-flex items-center justify-center rounded-full"
                    style={{
                      width: 30,
                      height: 30,
                      background: active ? "var(--color-accent)" : "var(--pill-icon-bg)",
                    }}
                  >
                    <ModeGlyph
                      name={m.icon}
                      size={15}
                      strokeWidth={2}
                      color={active ? "var(--color-primary-on-dark)" : "var(--pill-fg)"}
                    />
                  </span>

                  <span
                    className="flex-1 text-[14px] font-medium truncate"
                    style={{ color: "var(--pill-fg)" }}
                  >
                    {m.name}
                  </span>

                  {/* Numeric quick-key — always shown so users learn 1-N */}
                  <span style={{ fontSize: 10, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "var(--pill-icon-bg)", color: "var(--pill-fg-muted)", fontFamily: "monospace" }}>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Submenu footer */}
          <div
            className="flex items-center justify-between px-3 shrink-0"
            style={{ height: MODES_FOOTER_H, background: "var(--pill-footer)", borderTop: "1px solid var(--pill-border)" }}
          >
            <span className="text-[11px]" style={{ color: "var(--pill-fg-subtle)" }}>Switch mode</span>
            <div className="flex items-center gap-3">
              <HintRow label="" keys={["↑", "↓"]} />
              <HintRow label="Select" keys={["↵"]} />
              <HintRow label="Close" keys={["Space"]} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ──────────────────────────────────── */

function HintRow({
  label,
  keys,
  onClick,
  ariaLabel,
}: {
  label: string;
  keys: string[];
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && (onClick ? (
        <button
          type="button"
          aria-label={ariaLabel ?? label}
          // Prevent the NSPanel click from stealing focus from the user's
          // target app — otherwise the subsequent paste lands in the wrong
          // place. The pill is a non-activating panel; canBecomeKeyWindow
          // is YES (so JS keydown still works) but mousedown can still
          // momentarily redirect focus. Cancelling the default mousedown
          // keeps the focused app in front.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className="text-[11px]"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
            color: "var(--pill-fg-muted)",
            font: "inherit",
            fontSize: 11,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--pill-fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--pill-fg-muted)"; }}
        >
          {label}
        </button>
      ) : (
        <span className="text-[11px]" style={{ color: "var(--pill-fg-muted)" }}>{label}</span>
      ))}
      <div className="flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd key={k} style={{ minWidth: 18, height: 18, padding: "0 4px", fontSize: 10, borderRadius: 3, background: "var(--pill-icon-bg)", color: "var(--pill-fg)", border: "1px solid var(--pill-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
