import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

export type HotkeyEvent =
  | "hotkey:toggle-record"
  | "hotkey:toggle-mode-overlay"
  | "hotkey:ptt-pressed"
  | "hotkey:ptt-released";

/**
 * Subscribe to a Tauri-emitted hotkey event. The handler is held in a ref
 * so `listen()` registers EXACTLY ONCE per event name even when the caller
 * passes a fresh function every render.
 *
 * Why: Tauri's `listen()` is async (returns Promise<UnlistenFn>) and the
 * matching unlisten() is also async. The previous implementation depended
 * on `[event, handler]`, which re-ran on every render when the consumer's
 * handler closure changed (e.g. because it captured `state` / `recorder`
 * objects React recreates per-render). Multiple in-flight registrations
 * completed out of order, leaving several JS listeners attached at once —
 * so a single hotkey press fired the handler multiple times, producing
 * duplicate `recorder.stop()` calls. One stop observed an empty buffer
 * and surfaced "No audio captured" while another transcribed correctly.
 */
export function useHotkeyEvent(event: HotkeyEvent, handler: () => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    const unlisten = listen(event, () => handlerRef.current());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [event]);
}
