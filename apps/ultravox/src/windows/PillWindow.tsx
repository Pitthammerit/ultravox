import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import RollingWaveform from "../components/RollingWaveform";
import { ModeGlyph } from "../components/ModeIcons";
import { useRecorder } from "../hooks/useRecorder";
import { useHotkeyEvent } from "../hooks/useHotkeyEvents";
import { transcribe } from "../lib/transcribe";
import { TOKEN_ENDPOINT, pasteToFrontmost, getFrontmostApp, setPillHeight } from "../lib/tauri-bridge";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { appendHistory, loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { pickAutoMode } from "../lib/autoMode";
import { invoke } from "@tauri-apps/api/core";
import { captureError, track } from "../lib/telemetry";
import { logDebug } from "../lib/debugLog";
import { playStartChime, playStopChime } from "../lib/chime";

type PillState = "idle" | "recording" | "transcribing" | "error" | "confirming-discard";
type PillView = "pill" | "modes";

// Base pill window height (must match tauri.conf.json).
const PILL_H = 120;

// Pill inner content height = PILL_H - p-1.5 top - p-1.5 bottom (6px each).
const PILL_INNER_H = PILL_H - 12;

// Footer height shared by pill chrome and modes submenu.
const FOOTER_H = 44;

// Waveform area (above footer) in the pill chrome.
const WAVE_H = PILL_INNER_H - FOOTER_H;

// Each mode row height in the macOS-Focus-style list.
const MODE_ROW_H = 44;

// Gap between the pill chrome and the modes panel (px).
const SUBMENU_GAP = 6;

// Top + bottom padding inside the modes list (p-1 = 4px each side).
const LIST_PAD = 8;

// Height of the hint footer inside the modes panel.
const MODES_FOOTER_H = 36;

/** Compute the expanded window height needed to show N modes in the list. */
function expandedHeight(modeCount: number): number {
  const modesPanelH = modeCount * MODE_ROW_H + LIST_PAD + MODES_FOOTER_H;
  return PILL_H + SUBMENU_GAP + modesPanelH;
}

export default function PillWindow() {
  const recorder = useRecorder();
  const [state, setState] = useState<PillState>("idle");
  const [view, setView] = useState<PillView>("pill");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mode, setMode] = useState<VoiceMode>(DEFAULT_MODES[0]!);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [highlightIdx, setHighlightIdx] = useState(0);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      const found = (s.modes ?? DEFAULT_MODES).find((m) => m.id === s.activeModeId);
      if (found) setMode(found);
      // Apply the user's theme — the pill is a separate WebView, so it must
      // call applyTheme itself; main.tsx only theme-applies the Settings App.
      applyTheme(s.theme);
    }).catch(() => setSettings(null));

    // Repaint when Settings broadcasts a theme change.
    let unsub: (() => void) | undefined;
    listen<ThemeChoice>("theme:changed", (e) => applyTheme(e.payload)).then((u) => { unsub = u; });
    return () => { unsub?.(); };
  }, []);

  const currentModes = settings?.modes ?? DEFAULT_MODES;

  /* ── Resize pill window when view changes ───────────────────── */
  useEffect(() => {
    const h = view === "modes" ? expandedHeight(currentModes.length) : PILL_H;
    setPillHeight(h).catch(() => {});
  }, [view, currentModes.length]);

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

  /* ── Error display — sticky until user dismisses with Esc ───── */
  const showError = useCallback((msg: string) => {
    console.error("[pill] showError:", msg);
    setErrorMsg(msg);
    setState("error");
    invoke("show_pill").catch(() => {});
    // No auto-hide. User dismisses by pressing Esc (handled below)
    // or by triggering a new recording.
  }, []);

  /* Esc dismisses the error pill */
  useEffect(() => {
    if (state !== "error") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setState("idle"); invoke("hide_pill").catch(() => {}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  /* ── Recording ──────────────────────────────────────────────── */
  const startRecord = useCallback(async () => {
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
      const echoCancellation = cur?.sound.echoCancellation ?? false;
      const noiseSuppression = cur?.sound.noiseSuppression ?? true;
      await recorder.start({ autoGainControl: autoGain, noiseSuppression, echoCancellation });
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
  }, [recorder, settings, showError]);

  const cancel = useCallback(() => {
    recorder.cancel();
    setState("idle");
    invoke("hide_pill").catch(() => {});
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    console.log("[pill] stopAndTranscribe begin");
    setState("transcribing");
    if (settings?.sound.chime) playStopChime(settings.sound.chimeVolume);
    try {
      const blob = await recorder.stop();
      console.log("[pill] recorder.stop returned blob:", blob ? `${blob.size} bytes, ${blob.type}` : "null");
      if (!blob || blob.size === 0) {
        showError(blob ? "Recording produced 0 bytes — mimeType not supported by WebKit?" : "No audio captured.");
        return;
      }
      const frontmost = await getFrontmostApp();
      console.log("[pill] frontmost app:", frontmost);
      const result = await transcribe(blob, { mode, vocabulary: settings?.vocabulary ?? [], tokenEndpoint: TOKEN_ENDPOINT });
      console.log("[pill] transcribe result.text length:", result.text.length);
      track("transcription.completed", { modeId: mode.id, length: result.text.length });
      if (result.text) {
        setState("idle");
        await invoke("hide_pill").catch(() => {});
        // Brief delay so the pill window fully hides and macOS restores focus to the target app.
        await new Promise<void>((r) => setTimeout(r, 120));
        try {
          const pasteTarget = await getFrontmostApp();
          const pasteStart = performance.now();
          await pasteToFrontmost(result.text);
          logDebug("paste", {
            textLength: result.text.length,
            durationMs: Math.round(performance.now() - pasteStart),
            message: `→ ${pasteTarget?.localized_name ?? "?"} (${pasteTarget?.bundle_id ?? "?"})`,
          });
        } catch (pasteErr) {
          const pasteTarget = await getFrontmostApp();
          captureError(pasteErr, { stage: "paste" });
          logDebug("paste", { error: String((pasteErr as Error).message ?? pasteErr), textLength: result.text.length, message: `→ ${pasteTarget?.localized_name ?? "?"} (${pasteTarget?.bundle_id ?? "?"})` });
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
  }, [recorder, mode, settings, showError]);

  /* ── Hotkey: toggle record ──────────────────────────────────── */
  useHotkeyEvent(
    "hotkey:toggle-record",
    useCallback(() => {
      if (state === "idle") startRecord();
      else if (state === "recording") stopAndTranscribe();
      else if (state === "confirming-discard") { recorder.resume(); stopAndTranscribe(); }
    }, [state, startRecord, stopAndTranscribe, recorder]),
  );

  /* ── Esc during recording → confirming-discard ─────────────── */
  useEffect(() => {
    if (state !== "recording") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); recorder.pause(); setState("confirming-discard"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, recorder]);

  /* ── confirming-discard key handlers ───────────────────────── */
  useEffect(() => {
    if (state !== "confirming-discard") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); cancel(); }
      else if (e.code === "Space") { e.preventDefault(); recorder.resume(); setState("recording"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, cancel, recorder]);

  /* ── Hide when idle in pill view ────────────────────────────── */
  useEffect(() => {
    if (state === "idle" && view === "pill") invoke("hide_pill").catch(() => {});
  }, [state, view]);

  const statusLabel =
    state === "transcribing" ? "Transcribing…"
    : state === "error" ? "Error"
    : mode.name;

  const pillStyle: React.CSSProperties = {
    background: "var(--pill-bg)",
    backdropFilter: "blur(28px) saturate(1.4)",
    WebkitBackdropFilter: "blur(28px) saturate(1.4)",
    border: "1px solid var(--pill-border)",
    boxShadow: "var(--pill-shadow)",
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-transparent p-1.5" style={{ gap: view === "modes" ? SUBMENU_GAP : 0 }}>

      {/* ── Pill chrome — always visible ───────────────────────── */}
      <div
        className="flex flex-col rounded-[14px] overflow-hidden select-none shrink-0"
        style={{ ...pillStyle, height: PILL_INNER_H }}
      >
        {/* Waveform / drag region — replaced by error text or discard prompt */}
        {state === "error" ? (
          <div
            data-tauri-drag-region
            className="w-full flex items-center px-4"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <span
              className="text-[12px] leading-snug"
              style={{ color: "rgb(248,113,113)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}
            >
              {errorMsg}
            </span>
          </div>
        ) : state === "confirming-discard" ? (
          <div
            data-tauri-drag-region
            className="w-full flex items-center justify-center px-4"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <span className="text-[13px]" style={{ color: "var(--pill-fg)" }}>
              Discard recording?
            </span>
          </div>
        ) : (
          <div
            data-tauri-drag-region
            className="w-full"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <RollingWaveform
              stream={recorder.stream}
              active={state === "recording"}
              color="var(--pill-fg)"
              barWidth={2}
              gap={1.5}
            />
          </div>
        )}

        {/* Footer bar */}
        <div
          className="flex items-center justify-between gap-3 px-4 shrink-0"
          style={{ height: FOOTER_H, background: "var(--pill-footer)", borderTop: "1px solid var(--pill-border)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ModeGlyph
              name={mode.icon}
              size={13}
              strokeWidth={2}
              color={state === "recording" ? "var(--color-accent)" : "var(--pill-fg-muted)"}
            />
            <span
              className="text-[13px] font-medium truncate"
              style={{ color: state === "error" ? "rgb(248,113,113)" : "var(--pill-fg)" }}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {state === "recording" && <HintRow label="Stop" keys={["⌘", "⇧", ";"]} />}
            {state === "recording" && <HintRow label="Cancel" keys={["⎋"]} />}
            {state === "confirming-discard" && <HintRow label="Discard" keys={["⏎"]} />}
            {state === "confirming-discard" && <HintRow label="Continue" keys={["Space"]} />}
            {state === "transcribing" && (
              <span className="text-[11px]" style={{ color: "var(--pill-fg-subtle)" }}>Processing…</span>
            )}
            {state === "error" && (
              <HintRow label="Dismiss" keys={["⎋"]} />
            )}
            {state === "idle" && view === "pill" && (
              <HintRow label="Modes" keys={["⌥", "⇧", "K"]} />
            )}
          </div>
        </div>
      </div>

      {/* ── Modes submenu — macOS Focus-style single-column list ─ */}
      {view === "modes" && (
        <div
          className="flex flex-col rounded-[14px] overflow-hidden select-none flex-1"
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
                      color={active ? "#fff" : "var(--pill-fg)"}
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

function HintRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[11px]" style={{ color: "var(--pill-fg-muted)" }}>{label}</span>}
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

