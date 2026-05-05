import { useCallback, useEffect, useState } from "react";
import VoiceWaveform from "../components/VoiceWaveform";
import { useRecorder } from "../hooks/useRecorder";
import { useHotkeyEvent } from "../hooks/useHotkeyEvents";
import { transcribe } from "../lib/transcribe";
import { TOKEN_ENDPOINT, pasteToFrontmost } from "../lib/tauri-bridge";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { invoke } from "@tauri-apps/api/core";

type PillState = "idle" | "recording" | "transcribing" | "error";

const DEFAULT_MODE: VoiceMode = DEFAULT_MODES[0]!;

/**
 * Floating pill window — visible while recording / transcribing.
 *
 * State machine:
 *   idle        — hidden by Rust (window.show is called on hotkey press)
 *   recording   — wave bars react to mic, click anywhere stops + transcribes
 *   transcribing— spinner; pasted to frontmost when done
 *   error       — brief flash, auto-returns to idle
 */
export default function PillWindow() {
  const recorder = useRecorder();
  const [state, setState] = useState<PillState>("idle");
  const [mode] = useState<VoiceMode>(DEFAULT_MODE);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const startRecord = useCallback(async () => {
    try {
      await recorder.start();
      setState("recording");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setState("error");
      setTimeout(() => {
        setState("idle");
        invoke("hide_pill").catch(() => {});
      }, 1500);
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    setState("transcribing");
    try {
      const blob = await recorder.stop();
      if (!blob) {
        setState("idle");
        await invoke("hide_pill").catch(() => {});
        return;
      }
      const result = await transcribe(blob, {
        mode,
        vocabulary: [],
        tokenEndpoint: TOKEN_ENDPOINT,
      });
      if (result.text) {
        try {
          await pasteToFrontmost(result.text);
        } catch (pasteErr) {
          console.warn("paste failed:", pasteErr);
        }
      }
      setState("idle");
      await invoke("hide_pill").catch(() => {});
    } catch (e) {
      setErrorMsg((e as Error).message);
      setState("error");
      setTimeout(() => {
        setState("idle");
        invoke("hide_pill").catch(() => {});
      }, 2000);
    }
  }, [recorder, mode]);

  // Toggle record on global hotkey
  useHotkeyEvent(
    "hotkey:toggle-record",
    useCallback(() => {
      if (state === "idle") {
        invoke("show_pill").catch(() => {});
        startRecord();
      } else if (state === "recording") {
        stopAndTranscribe();
      }
    }, [state, startRecord, stopAndTranscribe]),
  );

  // Click pill to stop while recording
  const onClick = useCallback(() => {
    if (state === "recording") stopAndTranscribe();
  }, [state, stopAndTranscribe]);

  // Auto-show on initial mount if user already triggered (failsafe)
  useEffect(() => {
    if (state === "idle") {
      invoke("hide_pill").catch(() => {});
    }
  }, [state]);

  const label =
    state === "transcribing" ? "Transcribing…"
    : state === "error" ? errorMsg.slice(0, 28)
    : mode.name;

  return (
    <div
      onClick={onClick}
      className="fixed inset-0 flex items-center justify-center bg-transparent"
      data-tauri-drag-region
    >
      <div
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-color-primary text-primary-on-dark shadow-lg cursor-pointer select-none"
        style={{ minWidth: 180 }}
      >
        <VoiceWaveform stream={recorder.stream} active={state === "recording"} />
        <span className="typography-menu-text-on-dark whitespace-nowrap text-sm">
          {label}
        </span>
      </div>
    </div>
  );
}
