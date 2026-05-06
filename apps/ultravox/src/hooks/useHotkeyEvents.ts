import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export type HotkeyEvent =
  | "hotkey:toggle-record"
  | "hotkey:toggle-mode-overlay"
  | "hotkey:ptt-pressed"
  | "hotkey:ptt-released";

export function useHotkeyEvent(event: HotkeyEvent, handler: () => void): void {
  useEffect(() => {
    const unlisten = listen(event, () => handler());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [event, handler]);
}
