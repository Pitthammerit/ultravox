import { useCallback, useEffect, useState } from "react";
import RollingWaveform from "../components/RollingWaveform";
import { useRecorder } from "../hooks/useRecorder";
import { useHotkeyEvent } from "../hooks/useHotkeyEvents";
import { transcribe } from "../lib/transcribe";
import { TOKEN_ENDPOINT, pasteToFrontmost, getFrontmostApp, setPillHeight } from "../lib/tauri-bridge";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { appendHistory, loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { pickAutoMode } from "../lib/autoMode";
import { invoke } from "@tauri-apps/api/core";
import { captureError, track } from "../lib/telemetry";
import { playStartChime, playStopChime } from "../lib/chime";

type PillState = "idle" | "recording" | "transcribing" | "error";
type PillView = "pill" | "modes";

const PILL_H = 96;
const MODE_ROW_H = 50;
const MODE_FOOTER_H = 50;

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
    }).catch(() => setSettings(null));
  }, []);

  const currentModes = settings?.modes ?? DEFAULT_MODES;

  /* ── Window resize when view changes ───────────────────────── */
  useEffect(() => {
    const h = view === "modes"
      ? Math.min(currentModes.length, 8) * MODE_ROW_H + MODE_FOOTER_H
      : PILL_H;
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

  /* ── Error display ──────────────────────────────────────────── */
  const showError = useCallback((msg: string, ms = 4500) => {
    setErrorMsg(msg);
    setState("error");
    invoke("show_pill").catch(() => {});
    setTimeout(() => { setState("idle"); invoke("hide_pill").catch(() => {}); }, ms);
  }, []);

  /* ── Recording ──────────────────────────────────────────────── */
  const startRecord = useCallback(async () => {
    try {
      const cur = settings ?? null;
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
    setState("transcribing");
    if (settings?.sound.chime) playStopChime(settings.sound.chimeVolume);
    try {
      const blob = await recorder.stop();
      if (!blob) { setState("idle"); await invoke("hide_pill").catch(() => {}); return; }
      const frontmost = await getFrontmostApp();
      const result = await transcribe(blob, { mode, vocabulary: settings?.vocabulary ?? [], tokenEndpoint: TOKEN_ENDPOINT });
      track("transcription.completed", { modeId: mode.id, length: result.text.length });
      if (result.text) {
        setState("idle");
        await invoke("hide_pill").catch(() => {});
        await new Promise<void>((r) => setTimeout(r, 80));
        try {
          await pasteToFrontmost(result.text);
        } catch (pasteErr) {
          captureError(pasteErr, { stage: "paste" });
          showError("Paste failed — grant Accessibility access in System Settings → Privacy & Security → Accessibility.");
          return;
        }
        appendHistory({ id: crypto.randomUUID(), ts: Date.now(), modeId: mode.id, bundleId: frontmost?.bundle_id ?? null, text: result.text })
          .catch((e) => captureError(e, { stage: "history-append" }));
      } else {
        setState("idle");
        await invoke("hide_pill").catch(() => {});
      }
    } catch (e) {
      captureError(e, { stage: "transcribe" });
      showError((e as Error).message || "Transcription failed.");
    }
  }, [recorder, mode, settings, showError]);

  /* ── Hotkey: toggle record ──────────────────────────────────── */
  useHotkeyEvent(
    "hotkey:toggle-record",
    useCallback(() => {
      if (state === "idle") startRecord();
      else if (state === "recording") stopAndTranscribe();
    }, [state, startRecord, stopAndTranscribe]),
  );

  /* ── Esc cancels recording ──────────────────────────────────── */
  useEffect(() => {
    if (state !== "recording") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, cancel]);

  /* ── Hide when idle in pill view ────────────────────────────── */
  useEffect(() => {
    if (state === "idle" && view === "pill") invoke("hide_pill").catch(() => {});
  }, [state, view]);

  /* ── Render: Mode list view ─────────────────────────────────── */
  if (view === "modes") {
    return (
      <div className="fixed inset-0 flex flex-col bg-transparent">
        <div
          className="flex-1 flex flex-col rounded-[16px] overflow-hidden select-none"
          style={{ background: "rgba(13,14,18,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
        >
          {/* Drag region at top */}
          <div data-tauri-drag-region className="h-3 w-full shrink-0" />

          {/* Mode rows */}
          <div className="flex-1 flex flex-col px-2 pb-1 gap-0.5 overflow-hidden">
            {currentModes.map((m, i) => {
              const active = m.id === mode.id;
              const hi = i === highlightIdx;
              return (
                <button
                  key={m.id}
                  onClick={() => pickMode(m)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className="flex items-center gap-3 px-3 rounded-xl transition-colors text-left"
                  style={{ height: MODE_ROW_H - 6, background: hi ? "rgba(255,255,255,0.07)" : "transparent", border: `1px solid ${hi ? "rgba(255,255,255,0.10)" : "transparent"}` }}
                >
                  <ModeIcon cleanup={m.cleanup} />
                  <span className="flex-1 text-[13px] font-medium" style={{ color: "rgba(230,232,238,0.95)" }}>{m.name}</span>
                  {active ? <CheckIcon /> : <span style={{ minWidth: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, borderRadius: 5, background: "rgba(255,255,255,0.08)", color: "rgba(230,232,238,0.7)", fontFamily: "monospace" }}>{i + 1}</span>}
                </button>
              );
            })}
          </div>

          {/* Footer hints */}
          <div className="flex items-center justify-end gap-3 px-4" style={{ height: MODE_FOOTER_H, background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <HintRow label="" keys={["↑", "↓"]} />
            <HintRow label="Select" keys={["↵"]} />
            <HintRow label="Back" keys={["Space"]} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: Pill view ──────────────────────────────────────── */
  const statusLabel =
    state === "transcribing" ? "Transcribing…"
    : state === "error" ? errorMsg
    : `${mode.name}`;

  return (
    <div className="fixed inset-0 flex flex-col bg-transparent">
      <div
        className="flex-1 flex flex-col rounded-[16px] overflow-hidden select-none"
        style={{ background: "rgba(13,14,18,0.88)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}
      >
        {/* Drag handle - top strip */}
        <div data-tauri-drag-region className="h-2.5 w-full shrink-0" />

        {/* Waveform - full width, no padding */}
        <div className="flex-1 w-full relative">
          <RollingWaveform
            stream={recorder.stream}
            active={state === "recording"}
            color="rgba(230, 232, 238, 0.88)"
            barWidth={2}
            gap={1.5}
          />
        </div>

        {/* Footer bar */}
        <div
          className="flex items-center justify-between gap-3 px-3"
          style={{ height: 38, background: "rgba(0,0,0,0.28)", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MicIcon state={state} />
            <span
              className="text-[12px] font-medium truncate"
              style={{ color: state === "error" ? "rgb(248,113,113)" : "rgba(230,232,238,0.90)" }}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {(state === "recording" || state === "idle") && (
              <HintRow label={state === "recording" ? "Stop" : "Record"} keys={["⌘", "⇧", ";"]} />
            )}
            {state === "transcribing" && (
              <span className="text-[11px]" style={{ color: "rgba(230,232,238,0.45)" }}>Processing…</span>
            )}
            {state === "recording" && <HintRow label="Cancel" keys={["⎋"]} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Shared sub-components ──────────────────────────────────── */

function HintRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[11px]" style={{ color: "rgba(230,232,238,0.50)" }}>{label}</span>}
      <div className="flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd key={k} style={{ minWidth: 18, height: 18, padding: "0 4px", fontSize: 10, borderRadius: 3, background: "rgba(255,255,255,0.10)", color: "rgba(230,232,238,0.90)", border: "1px solid rgba(255,255,255,0.07)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function MicIcon({ state }: { state: PillState }) {
  const isActive = state === "recording";
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke={isActive ? "rgba(45,173,113,0.95)" : "rgba(230,232,238,0.70)"}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(45,173,113,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ModeIcon({ cleanup }: { cleanup: string }) {
  const isVoice = cleanup === "raw" || cleanup === "prose" || cleanup === "list";
  if (isVoice) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(230,232,238,0.70)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(230,232,238,0.70)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}
