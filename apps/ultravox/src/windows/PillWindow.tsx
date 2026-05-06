import { useCallback, useEffect, useState } from "react";
import RollingWaveform from "../components/RollingWaveform";
import { useRecorder } from "../hooks/useRecorder";
import { useHotkeyEvent } from "../hooks/useHotkeyEvents";
import { transcribe } from "../lib/transcribe";
import { TOKEN_ENDPOINT, pasteToFrontmost, getFrontmostApp } from "../lib/tauri-bridge";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { appendHistory, loadSettings, type AppSettings } from "../lib/store-bridge";
import { pickAutoMode } from "../lib/autoMode";
import { invoke } from "@tauri-apps/api/core";
import { captureError, track } from "../lib/telemetry";
import { playStartChime, playStopChime } from "../lib/chime";

type PillState = "idle" | "recording" | "transcribing" | "error";

/**
 * Floating recording widget — Superwhisper-style.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │   [rolling waveform fills upper area]      ⤡  │  ← top section, drag region
 *   │                                                 │
 *   ├────────────────────────────────────────────────┤
 *   │  🎙  Mode name        Stop ⌘ Space  Cancel ⎋  │  ← footer hints
 *   └────────────────────────────────────────────────┘
 */
export default function PillWindow() {
  const recorder = useRecorder();
  const [state, setState] = useState<PillState>("idle");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mode, setMode] = useState<VoiceMode>(DEFAULT_MODES[0]!);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const showError = useCallback((msg: string, ms = 4500) => {
    setErrorMsg(msg);
    setState("error");
    setTimeout(() => {
      setState("idle");
      invoke("hide_pill").catch(() => {});
    }, ms);
  }, []);

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
      await recorder.start({
        autoGainControl: autoGain,
        noiseSuppression: true,
        echoCancellation: true,
      });
      setState("recording");
    } catch (e) {
      console.error("[ultravox] start failed:", e);
      captureError(e, { stage: "start" });
      const err = e as DOMException;
      const friendly =
        err?.name === "NotAllowedError"
          ? "Microphone access denied. Open System Settings → Privacy → Microphone and enable Ultravox."
          : err?.name === "NotFoundError"
          ? "No microphone found."
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
      if (!blob) {
        setState("idle");
        await invoke("hide_pill").catch(() => {});
        return;
      }
      const frontmost = await getFrontmostApp();
      const result = await transcribe(blob, {
        mode,
        vocabulary: settings?.vocabulary ?? [],
        tokenEndpoint: TOKEN_ENDPOINT,
      });
      track("transcription.completed", { modeId: mode.id, length: result.text.length });
      if (result.text) {
        try {
          await pasteToFrontmost(result.text);
        } catch (pasteErr) {
          captureError(pasteErr, { stage: "paste" });
        }
        try {
          await appendHistory({
            id: crypto.randomUUID(),
            ts: Date.now(),
            modeId: mode.id,
            bundleId: frontmost?.bundle_id ?? null,
            text: result.text,
          });
        } catch (histErr) {
          captureError(histErr, { stage: "history-append" });
        }
      }
      setState("idle");
      await invoke("hide_pill").catch(() => {});
    } catch (e) {
      console.error("[ultravox] transcribe failed:", e);
      captureError(e, { stage: "transcribe" });
      showError((e as Error).message || "Transcription failed.");
    }
  }, [recorder, mode, settings, showError]);

  // Toggle record on global hotkey.
  // NOTE: Rust shows + focuses the pill window before emitting this event,
  // so getUserMedia runs in a visible, focused WebView (macOS TCC requirement).
  useHotkeyEvent(
    "hotkey:toggle-record",
    useCallback(() => {
      if (state === "idle") {
        startRecord();
      } else if (state === "recording") {
        stopAndTranscribe();
      }
    }, [state, startRecord, stopAndTranscribe]),
  );

  // Esc cancels while recording.
  useEffect(() => {
    if (state !== "recording") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, cancel]);

  // Keep pill hidden while idle.
  useEffect(() => {
    if (state === "idle") {
      invoke("hide_pill").catch(() => {});
    }
  }, [state]);

  const statusLabel =
    state === "transcribing" ? "Transcribing…"
    : state === "error" ? errorMsg
    : `${mode.name} · Voice to text`;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-2 bg-transparent">
      <div
        className="w-full h-full flex flex-col rounded-[18px] overflow-hidden select-none"
        style={{
          background: "rgba(13, 14, 18, 0.86)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)",
        }}
      >
        {/* Top: waveform + drag region */}
        <div
          data-tauri-drag-region
          className="relative flex-1 flex items-center justify-center px-6"
        >
          <div className="w-full h-full pointer-events-none">
            <RollingWaveform
              stream={recorder.stream}
              active={state === "recording"}
              color="rgba(230, 232, 238, 0.92)"
              barWidth={3}
              gap={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-4 px-4 py-2.5"
          style={{
            background: "rgba(0,0,0,0.30)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MicIcon />
            <span
              className="text-[13px] font-medium truncate"
              style={{
                color:
                  state === "error"
                    ? "rgb(248, 113, 113)"
                    : "rgba(230,232,238,0.95)",
              }}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <HintRow
              label={state === "recording" ? "Stop" : "Done"}
              keys={["⌘", "⇧", ";"]}
            />
            {state === "recording" && (
              <HintRow label="Cancel" keys={["⎋"]} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HintRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px]" style={{ color: "rgba(230,232,238,0.55)" }}>
        {label}
      </span>
      <div className="flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd
            key={k}
            className="inline-flex items-center justify-center font-mono"
            style={{
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              fontSize: 11,
              borderRadius: 4,
              background: "rgba(255,255,255,0.10)",
              color: "rgba(230,232,238,0.95)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(230,232,238,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
