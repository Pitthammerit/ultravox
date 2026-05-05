import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";

/**
 * Mode-switcher overlay (⌥⇧K). Numeric quick-select [1–9].
 * Picking a mode persists `activeModeId` and closes the overlay.
 */
export default function ModeOverlay() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [highlightId, setHighlightId] = useState<string>("");

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setHighlightId(s.activeModeId);
    });
  }, []);

  const close = useCallback(() => {
    invoke("hide_mode_overlay").catch(() => {});
  }, []);

  const pick = useCallback(
    async (mode: VoiceMode) => {
      if (settings) {
        const next = { ...settings, activeModeId: mode.id };
        await saveSettings(next);
        setSettings(next);
      }
      setHighlightId(mode.id);
      close();
    },
    [close, settings],
  );

  const modes = settings?.modes ?? DEFAULT_MODES;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
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

  if (!settings) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "var(--color-dialog-backdrop)" }}
      onClick={close}
    >
      <div
        className="rounded-2xl bg-color-bg-light border border-color-ink-15 p-4 min-w-[300px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="typography-label mb-3">Voice mode</div>
        <ul className="flex flex-col gap-1">
          {modes.map((m, i) => {
            const isHighlight = m.id === highlightId;
            return (
              <li key={m.id}>
                <button
                  onClick={() => pick(m)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg typography-menu-text transition-colors ${
                    isHighlight
                      ? "bg-color-primary text-primary-on-dark"
                      : "text-color-text hover:bg-color-surface-hover"
                  }`}
                >
                  <span>{m.name}</span>
                  <span
                    className={`typography-meta px-1.5 py-0.5 rounded ${
                      isHighlight
                        ? "bg-white/20 text-primary-on-dark"
                        : "bg-color-bg-light text-color-secondary"
                    }`}
                  >
                    {i + 1}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="typography-meta text-color-secondary mt-3 text-center">
          Number to switch · Esc to close
        </div>
      </div>
    </div>
  );
}
