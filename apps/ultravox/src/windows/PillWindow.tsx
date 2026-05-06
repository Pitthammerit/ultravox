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

type PillState = "idle" | "recording" | "discardConfirm" | "transcribing" | "error";
type PillView = "pill" | "modes";

// Visible pill chrome height (original Superwhisper proportions).
const PILL_CONTENT_H = 108;

// Transparent margin around the pill — small now that macOS draws the
// rounded shadow natively (Tauri `shadow: true`).
const SHADOW_PAD = 6;

// Total window height (must match tauri.conf.json).
const PILL_H = PILL_CONTENT_H + SHADOW_PAD * 2;

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

/** Compute the expanded window height needed to show N modes in the list. */
function expandedHeight(modeCount: number): number {
  const modesPanelH = modeCount * MODE_ROW_H + LIST_PAD + MODES_FOOTER_H;
  return PILL_H + SUBMENU_GAP + modesPanelH;
}

// Compact pill window height (footer only, no waveform area).
const COMPACT_H = FOOTER_H + SHADOW_PAD * 2;

export default function PillWindow() {
  const recorder = useRecorder();
  const [state, setState] = useState<PillState>("idle");
  const [view, setView] = useState<PillView>("pill");
  const [compact, setCompact] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mode, setMode] = useState<VoiceMode>(DEFAULT_MODES[0]!);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [transcribeLabel, setTranscribeLabel] = useState("TRANSCRIBING");

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

  /* ── Resize pill window when view/compact changes ───────────── */
  useEffect(() => {
    let h: number;
    if (view === "modes") h = expandedHeight(currentModes.length);
    else if (compact) h = COMPACT_H;
    else h = PILL_H;
    setPillHeight(h).catch(() => {});
  }, [view, compact, currentModes.length]);

  /* ── Auto-expand when recording starts ──────────────────────── */
  useEffect(() => {
    if (state === "recording" && compact) setCompact(false);
  }, [state, compact]);

  /* ── Transcribe label phases ────────────────────────────────────
     The voice worker exposes one combined endpoint, so we fake the
     phases with elapsed time:
       0–1.5 s    TRANSCRIBING
       1.5–3.5 s  CLEANING UP   (only when mode.cleanup !== "raw")
       3.5+ s     rotating: I'M ON IT. / ALMOST THERE. / GIVE ME A MOMENT.
     ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (state !== "transcribing") {
      setTranscribeLabel("TRANSCRIBING");
      return;
    }
    const isCleanup = mode.cleanup !== "raw";
    const longs = ["I'M ON IT.", "ALMOST THERE.", "GIVE ME A MOMENT."];
    const cleanupEnd = isCleanup ? 3500 : 1500;
    const start = Date.now();
    setTranscribeLabel("TRANSCRIBING");

    const tick = setInterval(() => {
      const e = Date.now() - start;
      if (e < 1500) {
        setTranscribeLabel("TRANSCRIBING");
      } else if (e < cleanupEnd) {
        setTranscribeLabel("CLEANING UP");
      } else {
        const idx = Math.floor((e - cleanupEnd) / 2500) % longs.length;
        setTranscribeLabel(longs[idx]!);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [state, mode.cleanup]);

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
      await recorder.start({ autoGainControl: autoGain, noiseSuppression: true, echoCancellation: true });
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
  }, [recorder, mode, settings, showError]);

  /* ── Hotkey: toggle record ──────────────────────────────────── */
  useHotkeyEvent(
    "hotkey:toggle-record",
    useCallback(() => {
      if (state === "idle") startRecord();
      else if (state === "recording") stopAndTranscribe();
      // discardConfirm and transcribing: ignore hotkey
    }, [state, startRecord, stopAndTranscribe]),
  );

  /* ── Esc / Space / Enter during recording and discard-confirm ── */
  useEffect(() => {
    if (state !== "recording" && state !== "discardConfirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (state === "recording" && e.key === "Escape") {
        e.preventDefault();
        setState("discardConfirm");
      } else if (state === "discardConfirm" && (e.key === " " || e.key === "Escape")) {
        e.preventDefault();
        setState("recording");
      } else if (state === "discardConfirm" && e.key === "Enter") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, cancel]);

  /* ── Hide when idle in pill view ────────────────────────────── */
  useEffect(() => {
    if (state === "idle" && view === "pill") invoke("hide_pill").catch(() => {});
  }, [state, view]);

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

  return (
    <div className="fixed inset-0 flex flex-col bg-transparent" style={{ padding: SHADOW_PAD, gap: view === "modes" ? SUBMENU_GAP : 0 }}>

      {/* ── Pill chrome — always visible ───────────────────────── */}
      <div
        className="flex flex-col rounded-[20px] overflow-hidden select-none shrink-0"
        style={{ ...pillStyle, height: compact ? FOOTER_H : PILL_CONTENT_H }}
      >
        {/* Top area: waveform / ticker / discard-confirm / error — hidden when compact */}
        {!compact && (state === "error" ? (
          <div
            data-tauri-drag-region
            className="w-full flex items-center px-4"
            style={{ height: WAVE_H, cursor: "grab" }}
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
        ) : state === "transcribing" ? (
          <div
            data-tauri-drag-region
            className="w-full flex items-center justify-center"
            style={{ height: WAVE_H, cursor: "grab" }}
          >
            <span
              style={{
                color: "var(--pill-fg)",
                fontFamily: "ui-monospace, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {transcribeLabel}
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
              color="var(--pill-waveform)"
              barWidth={2}
              gap={1.5}
            />
          </div>
        ))}

        {/* Footer bar */}
        <div
          className="flex items-center justify-between gap-3 px-4 shrink-0"
          style={{
            height: FOOTER_H,
            background: "var(--pill-footer)",
            borderTop: compact ? "none" : "1px solid var(--pill-border)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
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
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {state === "recording" && <HintRow label="Stop" keys={["⌘", "⇧", ";"]} />}
            {state === "recording" && <HintRow label="Discard" keys={["⎋"]} />}
            {state === "discardConfirm" && <HintRow label="Keep recording" keys={["Space"]} />}
            {state === "discardConfirm" && <HintRow label="Discard" keys={["↵"]} />}
            {state === "error" && (
              <HintRow label="Dismiss" keys={["⎋"]} />
            )}
            {state === "idle" && view === "pill" && !compact && (
              <HintRow label="Modes" keys={["⌥", "⇧", "K"]} />
            )}
            {/* Compact toggle — only shown when idle */}
            {state === "idle" && view === "pill" && (
              <button
                onClick={() => setCompact((c) => !c)}
                title={compact ? "Expand pill" : "Minimize pill"}
                style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: "var(--pill-icon-bg)",
                  border: "1px solid var(--pill-border)",
                  color: "var(--pill-fg-muted)",
                  fontSize: 10, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {compact ? "▲" : "▼"}
              </button>
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

