import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";

/**
 * Mode-switcher overlay (⌥⇧K). Numeric quick-select [1–9].
 * Picking a mode persists it as the active mode and closes the overlay.
 */
export default function ModeOverlay() {
  const [activeId, setActiveId] = useState<string>(DEFAULT_MODES[0]?.id ?? "");
  const [modes] = useState<VoiceMode[]>(DEFAULT_MODES);

  const close = useCallback(() => {
    invoke("hide_mode_overlay").catch(() => {});
  }, []);

  const pick = useCallback(
    (mode: VoiceMode) => {
      setActiveId(mode.id);
      close();
    },
    [close],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= modes.length) {
        e.preventDefault();
        pick(modes[n - 1]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modes, pick, close]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-color-dialog-backdrop"
      onClick={close}
    >
      <div
        className="rounded-2xl bg-color-bg-light border border-color-ink-15 p-4 min-w-[280px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="typography-label mb-3">Voice mode</div>
        <ul className="flex flex-col gap-1">
          {modes.map((m, i) => (
            <li key={m.id}>
              <button
                onClick={() => pick(m)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg typography-menu-text transition-colors ${
                  m.id === activeId
                    ? "bg-color-primary text-primary-on-dark"
                    : "hover:bg-color-surface-hover text-color-text"
                }`}
              >
                <span>{m.name}</span>
                <span className="typography-meta text-color-secondary">
                  {i + 1}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="typography-meta text-color-secondary mt-3">
          Press a number to switch · Esc to close
        </div>
      </div>
    </div>
  );
}
